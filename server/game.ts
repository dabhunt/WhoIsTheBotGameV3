import { db } from '@db/index.js';
import { games, players } from '@db/schema.js';
import { eq } from 'drizzle-orm';
import { logMatchmaking, logError, logGameState, MatchmakingError, ErrorCodes } from './utils/logger.js';

const LETTERS = ['A', 'B', 'C'];  // Only need 3 letters now: 2 players + 1 bot
const MAX_PLAYERS = 2; // Changed to 2 for testing (1 human + 1 bot)
const BASE_WAIT_TIME = 30; // Fixed 30 second wait time
const MIN_GAME_CREATION_INTERVAL = 5000; // Minimum 5 seconds between game creations
const STALE_GAME_THRESHOLD = 5 * 60 * 1000; // 5 minutes

// Using a Map to ensure atomic updates to game state
const activeGames = new Map<number, {
  status: string;
  playerCount: number;
  lastUpdated: number;
  locked: boolean; // Add lock to prevent race conditions
}>();

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
  } catch (error) {
    logError('Failed to cleanup stale games', { error: error as Error });
  }
}

async function findAvailableGame(): Promise<number | null> {
  const entries = Array.from(activeGames.entries());
  for (const [gameId, state] of entries) {
    if (state.status === 'waiting' && state.playerCount < MAX_PLAYERS && !state.locked) {
      state.locked = true; // Lock the game while we try to join
      return gameId;
    }
  }
  return null;
}

export async function findOrCreateGame() {
  const requestId = Math.random().toString(36).substring(7);

  try {
    logMatchmaking('Starting matchmaking process', { requestId });

    await cleanupStaleGames();

    // First try to find an available game
    let gameId = await findAvailableGame();

    // If no game available, check if we can create one
    if (!gameId) {
      const now = Date.now();
      if (now - lastGameCreationTime < MIN_GAME_CREATION_INTERVAL) {
        logMatchmaking('Too soon to create new game', {
          requestId,
          waitTime: MIN_GAME_CREATION_INTERVAL - (now - lastGameCreationTime)
        });
        return {
          queueState: {
            playersInQueue: activeGames.size,
            estimatedWaitTime: BASE_WAIT_TIME
          }
        };
      }

      // Create new game
      try {
        const result = await db.transaction(async (tx) => {
          const botLetter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
          const [game] = await tx
            .insert(games)
            .values({
              status: 'waiting',
              botLetter
            })
            .returning();

          // Add bot player
          await tx
            .insert(players)
            .values({
              gameId: game.id,
              letter: botLetter,
              isBot: true
            });

          return game;
        });

        lastGameCreationTime = now;
        gameId = result.id;

        // Update active games map with initial lock
        activeGames.set(gameId, {
          status: 'waiting',
          playerCount: 1, // Bot counts as a player
          lastUpdated: now,
          locked: true // Lock the new game immediately
        });

        logGameState('Created new game', {
          requestId,
          gameId,
          botLetter: result.botLetter
        });
      } catch (error) {
        logError('Failed to create new game', { error: error as Error });
        throw new MatchmakingError(
          'Failed to create new game',
          ErrorCodes.DATABASE_ERROR,
          500
        );
      }
    }

    // Try to join the game
    try {
      const result = await db.transaction(async (tx) => {
        const game = await tx.query.games.findFirst({
          where: eq(games.id, gameId!),
        });

        if (!game || game.status !== 'waiting') {
          activeGames.delete(gameId!);
          throw new MatchmakingError(
            'Game not available',
            ErrorCodes.GAME_NOT_FOUND,
            404
          );
        }

        const existingPlayers = await tx
          .select()
          .from(players)
          .where(eq(players.gameId, game.id))
          .execute();

        if (existingPlayers.length >= MAX_PLAYERS) {
          activeGames.delete(game.id);
          throw new MatchmakingError(
            'Game is full',
            ErrorCodes.GAME_FULL,
            400
          );
        }

        // Get available letter
        const usedLetters = existingPlayers.map(p => p.letter);
        const availableLetters = LETTERS.filter(l => 
          !usedLetters.includes(l) && 
          l !== game.botLetter
        );

        if (availableLetters.length === 0) {
          throw new MatchmakingError(
            'No available letters',
            ErrorCodes.INVALID_STATE,
            500
          );
        }

        const letter = availableLetters[0];
        const [player] = await tx
          .insert(players)
          .values({
            gameId: game.id,
            letter,
            isBot: false
          })
          .returning();

        let gameState = activeGames.get(game.id);
        if (gameState) {
          // Update player count and timestamp
          gameState.playerCount = existingPlayers.length + 1;
          gameState.lastUpdated = Date.now();

          // If this fills the game, mark it as active
          if (gameState.playerCount >= MAX_PLAYERS) {
            gameState.status = 'active';
            await tx
              .update(games)
              .set({ status: 'active' })
              .where(eq(games.id, game.id))
              .execute();

            logGameState('Game is full, activating', {
              requestId,
              gameId: game.id
            });

            // Unlock the game and return game data
            gameState.locked = false;
            return {
              gameId: game.id,
              letter
            };
          }

          // If not full, unlock and return queue state
          gameState.locked = false;
        }

        return {
          queueState: {
            playersInQueue: activeGames.size,
            estimatedWaitTime: BASE_WAIT_TIME
          }
        };
      });

      return result;

    } catch (error) {
      // Always unlock the game if there was an error
      const gameState = activeGames.get(gameId!);
      if (gameState) {
        gameState.locked = false;
      }

      if (error instanceof MatchmakingError) {
        throw error;
      }
      logError('Failed to join game', { error: error as Error });
      throw new MatchmakingError(
        'Failed to join game',
        ErrorCodes.DATABASE_ERROR,
        500
      );
    }

  } catch (error) {
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