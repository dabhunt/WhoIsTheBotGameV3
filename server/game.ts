import { db } from '@db';
import { games, players } from '@db/schema';
import { eq } from 'drizzle-orm';
import { logMatchmaking, logError, logGameState, MatchmakingError, ErrorCodes } from './utils/logger';

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

interface GameCreated {
  gameId: number;
  letter: string;
}

type MatchmakingResult = { queueState: QueueState } | GameCreated;

export async function findOrCreateGame(sessionId: string): Promise<MatchmakingResult> {
  const requestId = Math.random().toString(36).substring(7);

  try {
    logMatchmaking('Starting matchmaking process', { requestId, sessionId });

    await cleanupStaleGames();

    // Add or update the player in the waiting list, keyed by their unique session ID
    waitingPlayers.set(sessionId, {
      timestamp: Date.now(),
      sessionId
    });

    const currentWaitingCount = getWaitingPlayersCount();
    logMatchmaking('Current waiting players', { requestId, count: currentWaitingCount });

    // Return queue state if we don't have exactly 2 unique players
    if (currentWaitingCount < REQUIRED_HUMAN_PLAYERS) {
      logMatchmaking('Not enough players, returning queue state', {
        requestId,
        currentCount: currentWaitingCount,
        required: REQUIRED_HUMAN_PLAYERS
      });
      return {
        queueState: {
          playersInQueue: currentWaitingCount,
          estimatedWaitTime: BASE_WAIT_TIME
        }
      };
    }

    // Check if we can create a new game
    const now = Date.now();
    if (now - lastGameCreationTime < MIN_GAME_CREATION_INTERVAL) {
      logMatchmaking('Too soon to create game, waiting', {
        requestId,
        timeRemaining: MIN_GAME_CREATION_INTERVAL - (now - lastGameCreationTime)
      });
      return {
        queueState: {
          playersInQueue: currentWaitingCount,
          estimatedWaitTime: Math.ceil((MIN_GAME_CREATION_INTERVAL - (now - lastGameCreationTime)) / 1000)
        }
      };
    }

    // Get exactly 2 waiting players (FIFO)
    const waitingPlayersList = Array.from(waitingPlayers.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, REQUIRED_HUMAN_PLAYERS);

    // Create game with bot
    const { id: gameId, botLetter } = await createGameWithBot();
    lastGameCreationTime = now;

    try {
      const result = await db.transaction(async (tx) => {
        const game = await tx.query.games.findFirst({
          where: eq(games.id, gameId),
          with: {
            players: true
          }
        });

        if (!game) {
          throw new MatchmakingError('Game not found', ErrorCodes.GAME_NOT_FOUND, 404);
        }

        // Get available letters (excluding bot's letter)
        const availableLetters = LETTERS.filter(l => l !== botLetter);

        // Add both human players
        for (let i = 0; i < waitingPlayersList.length; i++) {
          await tx.insert(players).values({
            gameId: game.id,
            letter: availableLetters[i],
            isBot: false,
            hasGuessed: false,
            eliminated: false
          });
        }

        // Set game as active
        await tx.update(games)
          .set({ status: 'active' })
          .where(eq(games.id, gameId));

        // Remove matched players from waiting list
        waitingPlayersList.forEach(p => waitingPlayers.delete(p.sessionId));

        // Find the letter for the current player's session
        const currentPlayer = waitingPlayersList.find(p => p.sessionId === sessionId);
        const playerIndex = waitingPlayersList.indexOf(currentPlayer!);
        const assignedLetter = availableLetters[playerIndex];

        return {
          gameId: game.id,
          letter: assignedLetter,
        };
      });

      // Update game state
      const gameState = activeGames.get(gameId);
      if (gameState) {
        gameState.status = 'active';
        gameState.playerCount = MAX_PLAYERS;
        gameState.lastUpdated = Date.now();
      }

      logMatchmaking('Game created successfully', {
        requestId,
        gameId: result.gameId,
        playerCount: MAX_PLAYERS
      });

      return result;

    } catch (error) {
      logError('Failed to add players to game', { error: error as Error });
      // If game creation fails, we should ideally put players back in the queue.
      // For simplicity, we'll let them get cleaned up or rejoin.
      throw error;
    }

  } catch (error) {
    // Clean up this player from waiting list if there was an error
    waitingPlayers.delete(sessionId);

    if (error instanceof MatchmakingError) {
      throw error;
    }

    logError('Unexpected error in matchmaking', { error: error as Error });
    throw new MatchmakingError(
      'Unexpected error in matchmaking',
      ErrorCodes.DATABASE_ERROR,
      500
    );
  }
}