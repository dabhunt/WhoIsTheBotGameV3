import { db } from '@db/index.js';
import { games, players } from '@db/schema.js';
import { eq } from 'drizzle-orm';
import { logMatchmaking, logError, logGameState, MatchmakingError, ErrorCodes } from './utils/logger.js';

const LETTERS = ['A', 'B', 'C'];  // Three letters for three players (2 humans + 1 bot)
const MAX_PLAYERS = 3; // Total players (2 humans + 1 bot)
const REQUIRED_HUMAN_PLAYERS = 2; // We need exactly 2 human players
const BASE_WAIT_TIME = 30; // Fixed 30 second wait time
const MIN_GAME_CREATION_INTERVAL = 5000; // Minimum 5 seconds between game creations
const STALE_GAME_THRESHOLD = 5 * 60 * 1000; // 5 minutes

interface WaitingPlayer {
  timestamp: number;
  matchmakingId: string;
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

    // Also cleanup stale waiting players using Array.from() to avoid TypeScript iteration error
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

  // Initialize active game state with bot counted as first player
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
  playersInGame: number;
}

type MatchmakingResult = { queueState: QueueState } | GameCreated;

export async function findOrCreateGame(): Promise<MatchmakingResult> {
  const requestId = Math.random().toString(36).substring(7);
  const matchmakingId = Math.random().toString(36).substring(7);

  try {
    logMatchmaking('Starting matchmaking process', { requestId });

    await cleanupStaleGames();

    // Add current player to waiting list
    waitingPlayers.set(matchmakingId, {
      timestamp: Date.now(),
      matchmakingId
    });

    const currentWaitingCount = getWaitingPlayersCount();
    logMatchmaking('Current waiting players', { requestId, count: currentWaitingCount });

    // If we have exactly REQUIRED_HUMAN_PLAYERS waiting
    if (currentWaitingCount >= REQUIRED_HUMAN_PLAYERS) {
      const now = Date.now();
      if (now - lastGameCreationTime < MIN_GAME_CREATION_INTERVAL) {
        // Too soon to create a new game, return queue state
        return {
          queueState: {
            playersInQueue: currentWaitingCount,
            estimatedWaitTime: BASE_WAIT_TIME
          }
        };
      }

      // Get the first two waiting players (FIFO)
      const waitingPlayersList = Array.from(waitingPlayers.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, REQUIRED_HUMAN_PLAYERS)
        .map(([id]) => id);

      // Create a new game with bot
      const { id: gameId, botLetter } = await createGameWithBot();
      lastGameCreationTime = now;

      // Remove these players from waiting list
      waitingPlayersList.forEach(id => waitingPlayers.delete(id));

      try {
        const result = await db.transaction(async (tx) => {
          // Get current game state
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
          const usedLetters = game.players.map(p => p.letter);
          const availableLetters = LETTERS.filter(l => 
            !usedLetters.includes(l) && 
            l !== botLetter
          );

          if (availableLetters.length === 0) {
            throw new MatchmakingError('No available letters', ErrorCodes.INVALID_STATE, 500);
          }

          // Add human player
          const letter = availableLetters[0];
          await tx
            .insert(players)
            .values({
              gameId: game.id,
              letter,
              isBot: false,
              hasGuessed: false,
              eliminated: false
            });

          return {
            gameId: game.id,
            letter,
            playersInGame: REQUIRED_HUMAN_PLAYERS + 1 // Including bot
          };
        });

        // Update game state
        const gameState = activeGames.get(gameId);
        if (gameState) {
          gameState.playerCount = REQUIRED_HUMAN_PLAYERS + 1; // Including bot
          gameState.status = 'active';
          gameState.lastUpdated = Date.now();
        }

        return result;

      } catch (error) {
        logError('Failed to add players to game', { error: error as Error });
        throw error;
      }
    }

    // Not enough players yet, return queue state
    return {
      queueState: {
        playersInQueue: currentWaitingCount,
        estimatedWaitTime: BASE_WAIT_TIME
      }
    };

  } catch (error) {
    // Clean up this player from waiting list if there was an error
    waitingPlayers.delete(matchmakingId);

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