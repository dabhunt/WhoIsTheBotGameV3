import { db } from '@db/index.js';
import { games, players } from '@db/schema.js';
import { eq, and, count, lt } from 'drizzle-orm';

const LETTERS = ['A', 'B', 'C'];  // Only need 3 letters now: 2 players + 1 bot
const MAX_PLAYERS = 2; // Changed to 2 for testing (1 human + 1 bot)
const BASE_WAIT_TIME = 30; // Fixed 30 second wait time

export async function findOrCreateGame() {
  try {
    console.log('Searching for available game...');

    // Find waiting games that aren't full
    const waitingGames = await db
      .select({
        gameId: games.id,
        botLetter: games.botLetter,
        playerCount: count(players.id).mapWith(Number)
      })
      .from(games)
      .leftJoin(players, eq(games.id, players.gameId))
      .where(eq(games.status, 'waiting'))
      .groupBy(games.id, games.botLetter)
      .having(lt(count(players.id), MAX_PLAYERS));

    console.log('Found waiting games:', waitingGames);

    // Try to join an existing game
    if (waitingGames.length > 0) {
      const game = waitingGames[0];
      console.log('Attempting to join game:', game.gameId);

      // Get existing players to find available letters
      const existingPlayers = await db
        .select()
        .from(players)
        .where(eq(players.gameId, game.gameId));

      console.log('Existing players:', existingPlayers);

      const usedLetters = existingPlayers.map(p => p.letter);
      const availableLetters = LETTERS.filter(l => !usedLetters.includes(l));

      console.log('Available letters:', availableLetters);

      if (availableLetters.length === 0) {
        throw new Error('No available letters');
      }

      const letter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
      console.log('Assigning letter:', letter);

      // Add player to existing game
      const [player] = await db
        .insert(players)
        .values({
          gameId: game.gameId,
          letter,
          isBot: false
        })
        .returning();

      console.log('Added player:', player);

      // If this was the last player needed, start the game
      if (game.playerCount === MAX_PLAYERS - 1) {
        console.log('Starting game:', game.gameId);
        await db
          .update(games)
          .set({ status: 'active' })
          .where(eq(games.id, game.gameId));

        return {
          gameId: game.gameId,
          letter: player.letter
        };
      }

      console.log('Returning queue state for waiting game');
      return {
        queueState: {
          playersInQueue: game.playerCount + 1,
          estimatedWaitTime: BASE_WAIT_TIME
        }
      };
    }

    // Create new game with bot
    console.log('Creating new game...');
    const botLetter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    const [newGame] = await db
      .insert(games)
      .values({
        status: 'waiting',
        botLetter
      })
      .returning();

    console.log('Created game:', newGame.id, 'with bot letter:', botLetter);

    // Add bot player
    await db
      .insert(players)
      .values({
        gameId: newGame.id,
        letter: botLetter,
        isBot: true
      });

    // Add first human player
    const availableLetters = LETTERS.filter(l => l !== botLetter);
    const playerLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];

    const [player] = await db
      .insert(players)
      .values({
        gameId: newGame.id,
        letter: playerLetter,
        isBot: false
      })
      .returning();

    console.log('Added first player with letter:', playerLetter);
    console.log('Returning queue state for new game');

    return {
      queueState: {
        playersInQueue: 1,
        estimatedWaitTime: BASE_WAIT_TIME
      }
    };
  } catch (error) {
    console.error('Error in findOrCreateGame:', error);
    throw error;
  }
}