import { db } from '@db';
import { games, players } from '@db/schema';
import { eq } from 'drizzle-orm';
import { logMatchmaking, logError, logGameState, MatchmakingError, ErrorCodes } from './utils/logger';
import { sendToSession } from './ws';

const LETTERS = ['A', 'B', 'C'];  // Three letters for three players (2 humans + 1 bot)
const MAX_PLAYERS = 3; // Total players (2 humans + 1 bot)
const REQUIRED_HUMAN_PLAYERS = 2; // We need exactly 2 human players
const BASE_WAIT_TIME = 30; // Fixed 30 second wait time
const MIN_GAME_CREATION_INTERVAL = 5000; // Minimum 5 seconds between game creations
const STALE_GAME_THRESHOLD = 5 * 60 * 1000; // 5 minutes

interface WaitingPlayer {
  timestamp: number;
  sessionId: string;
}

interface GameState {
  status: 'waiting' | 'active' | 'finished';
  playerCount: number;
  lastUpdated: number;
  locked: boolean;
}

// Using a Map to track waiting players and game states
const waitingPlayers = new Map<string, WaitingPlayer>();
const activeGames = new Map<number, GameState>();

let lastGameCreationTime = 0;

async function cleanupStaleGames() {
  const staleTime = Date.now() - STALE_GAME_THRESHOLD;

  try {
    const staleGames = await db
      .select()
      .from(games)
      .where(eq(games.status, 'waiting'))
      .execute();

    for (const game of staleGames) {
      const gameState = activeGames.get(game.id);
      if (gameState && gameState.lastUpdated < staleTime) {
        activeGames.delete(game.id);
        await db
          .update(games)
          .set({ status: 'finished' })
          .where(eq(games.id, game.id))
          .execute();
      }
    }

    // Cleanup stale waiting players
    const staleWaitingPlayers = Array.from(waitingPlayers.entries())
      .filter(([_, player]) => player.timestamp < staleTime)
      .map(([id]) => id);

    staleWaitingPlayers.forEach(id => waitingPlayers.delete(id));
  } catch (error) {
    logError('Failed to cleanup stale games', { error: error as Error });
  }
}

function getWaitingPlayersCount(): number {
  return waitingPlayers.size;
}

async function createGameWithBot(): Promise<{ id: number; botLetter: string }> {
  const result = await db.transaction(async (tx) => {
    // Randomly assign bot letter
    const botLetter = LETTERS[Math.floor(Math.random() * LETTERS.length)];

    // Create game
    const [game] = await tx
      .insert(games)
      .values({
        status: 'waiting',
        botLetter
      })
      .returning();

    if (!game) {
      throw new MatchmakingError(
        'Failed to create game',
        ErrorCodes.DATABASE_ERROR,
        500
      );
    }

    // Add bot player
    await tx
      .insert(players)
      .values({
        gameId: game.id,
        letter: botLetter,
        isBot: true,
        hasGuessed: false,
        eliminated: false
      });

    return { id: game.id, botLetter };
  });

  // Initialize game state
  activeGames.set(result.id, {
    status: 'waiting',
    playerCount: 1, // Bot counts as first player
    lastUpdated: Date.now(),
    locked: false,
  });

  return result;
}

interface QueueState {
  playersInQueue: number;
  estimatedWaitTime: number;
}

// No longer need GameCreated, the result is always a queue state.
type MatchmakingResult = { queueState: QueueState };

export async function findOrCreateGame(sessionId: string): Promise<MatchmakingResult> {
  const requestId = Math.random().toString(36).substring(7);

  try {
    logMatchmaking('Starting matchmaking process', { requestId, sessionId });

    await cleanupStaleGames();

    // Add or update the player in the waiting list
    waitingPlayers.set(sessionId, {
      timestamp: Date.now(),
      sessionId
    });

    let currentWaitingCount = getWaitingPlayersCount();
    logMatchmaking('Current waiting players', { requestId, count: currentWaitingCount });

    if (currentWaitingCount < REQUIRED_HUMAN_PLAYERS) {
      return {
        queueState: {
          playersInQueue: currentWaitingCount,
          estimatedWaitTime: BASE_WAIT_TIME
        }
      };
    }

    const now = Date.now();
    if (now - lastGameCreationTime < MIN_GAME_CREATION_INTERVAL) {
      return {
        queueState: {
          playersInQueue: currentWaitingCount,
          estimatedWaitTime: Math.ceil((MIN_GAME_CREATION_INTERVAL - (now - lastGameCreationTime)) / 1000)
        }
      };
    }

    const waitingPlayersList = Array.from(waitingPlayers.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, REQUIRED_HUMAN_PLAYERS);

    // --- Important: Remove players from queue immediately ---
    waitingPlayersList.forEach(p => waitingPlayers.delete(p.sessionId));
    // Update waiting count for the response
    currentWaitingCount = getWaitingPlayersCount();

    const { id: gameId, botLetter } = await createGameWithBot();
    lastGameCreationTime = now;

    try {
      const availableLetters = LETTERS.filter(l => l !== botLetter);

      await db.transaction(async (tx) => {
        for (let i = 0; i < waitingPlayersList.length; i++) {
          await tx.insert(players).values({
            gameId: gameId,
            letter: availableLetters[i],
            isBot: false,
            hasGuessed: false,
            eliminated: false
          });
        }
        await tx.update(games).set({ status: 'active' }).where(eq(games.id, gameId));
      });

      const gameState = activeGames.get(gameId);
      if (gameState) {
        gameState.status = 'active';
        gameState.playerCount = MAX_PLAYERS;
        gameState.lastUpdated = Date.now();
      }

      // --- NEW: Notify both players via WebSocket ---
      for (let i = 0; i < waitingPlayersList.length; i++) {
        const player = waitingPlayersList[i];
        const letter = availableLetters[i];
        sendToSession(player.sessionId, {
          type: 'game-ready',
          gameId: gameId,
          letter: letter
        });
      }

      logMatchmaking('Game created and players notified', {
        requestId,
        gameId: gameId,
        playerCount: MAX_PLAYERS
      });

    } catch (error) {
      logError('Failed to add players to game', { error: error as Error });
      // NOTE: If this fails, players are removed from queue but not in a game.
      // They will have to rejoin the queue.
      throw error;
    }

    // Always return the current queue state
    return {
      queueState: {
        playersInQueue: currentWaitingCount,
        estimatedWaitTime: BASE_WAIT_TIME
      }
    };

  } catch (error) {
    waitingPlayers.delete(sessionId);
    if (error instanceof MatchmakingError) throw error;
    logError('Unexpected error in matchmaking', { error: error as Error });
    throw new MatchmakingError('Unexpected error in matchmaking', ErrorCodes.DATABASE_ERROR, 500);
  }
}