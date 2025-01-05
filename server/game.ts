import { db } from '@db/index.js';
import { games, players } from '@db/schema.js';
import { eq, and, count, lt } from 'drizzle-orm';

const LETTERS = ['A', 'B', 'C'];  // Only need 3 letters now: 2 players + 1 bot
const MAX_PLAYERS = 3; // 2 players + 1 bot
const BASE_WAIT_TIME = 15; // base wait time in seconds

export async function findOrCreateGame() {
  try {
    console.log('Searching for available game...');

    // Get all waiting games and their player counts
    const waitingGamesWithCounts = await db
      .select({
        gameId: games.id,
        botLetter: games.botLetter,
        playerCount: count()
      })
      .from(games)
      .leftJoin(players, eq(games.id, players.gameId))
      .where(eq(games.status, 'waiting'))
      .groupBy(games.id);

    // Filter for games that aren't full
    const availableGame = waitingGamesWithCounts.find(g => g.playerCount < MAX_PLAYERS);

    if (availableGame) {
      console.log('Found waiting game:', availableGame.gameId, 'with', availableGame.playerCount, 'players');

      // Get existing players to find available letters
      const existingPlayers = await db.select()
        .from(players)
        .where(eq(players.gameId, availableGame.gameId));

      const usedLetters = existingPlayers.map(p => p.letter);
      const availableLetters = LETTERS.filter(l => !usedLetters.includes(l));
      const letter = availableLetters[Math.floor(Math.random() * availableLetters.length)];

      console.log('Assigning letter:', letter);

      const [player] = await db.insert(players)
        .values({
          gameId: availableGame.gameId,
          letter,
          isBot: false
        })
        .returning();

      // If this was the last player needed, start the game
      if (availableGame.playerCount === MAX_PLAYERS - 1) {
        console.log('Starting game with ID:', availableGame.gameId);

        await db.update(games)
          .set({ status: 'active' })
          .where(eq(games.id, availableGame.gameId));

        return {
          gameId: availableGame.gameId,
          letter: player.letter
        };
      }

      // Return queue state while waiting for more players
      return {
        queueState: {
          playersInQueue: availableGame.playerCount + 1,
          estimatedWaitTime: BASE_WAIT_TIME
        }
      };
    }

    console.log('Creating new game...');

    // Create new game
    const botLetter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    const [game] = await db.insert(games)
      .values({ 
        status: 'waiting',
        botLetter 
      })
      .returning();

    console.log('Created new game:', game.id, 'with bot letter:', botLetter);

    // Add bot player
    await db.insert(players)
      .values({
        gameId: game.id,
        letter: botLetter,
        isBot: true
      });

    // Add first human player
    const playerLetter = LETTERS.find(l => l !== botLetter)!;
    const [player] = await db.insert(players)
      .values({
        gameId: game.id,
        letter: playerLetter,
        isBot: false
      })
      .returning();

    console.log('Added first player with letter:', playerLetter);

    // Return queue state since we need one more player
    return {
      queueState: {
        playersInQueue: 2, // Bot + 1 player
        estimatedWaitTime: BASE_WAIT_TIME
      }
    };
  } catch (error) {
    console.error('Error in findOrCreateGame:', error);
    throw error;
  }
}