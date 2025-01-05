import { db } from '@db/index.js';
import { games, players } from '@db/schema.js';
import { eq } from 'drizzle-orm';

const LETTERS = ['A', 'B', 'C'];  // Only need 3 letters now: 2 players + 1 bot
const MAX_PLAYERS = 3; // 2 players + 1 bot
const BASE_WAIT_TIME = 15; // base wait time in seconds

export async function findOrCreateGame() {
  try {
    console.log('Searching for available game...');

    // Look for an available game
    const waitingGame = await db.query.games.findFirst({
      where: eq(games.status, 'waiting'),
    });

    if (waitingGame) {
      console.log('Found waiting game:', waitingGame.id);

      const playerRows = await db.select()
        .from(players)
        .where(eq(players.gameId, waitingGame.id));

      const playerCount = playerRows.length;
      console.log('Current players in game:', playerCount);

      if (playerCount < MAX_PLAYERS) {
        // Assign random unused letter
        const usedLetters = playerRows.map(p => p.letter);
        const availableLetters = LETTERS.filter(l => !usedLetters.includes(l));
        const letter = availableLetters[Math.floor(Math.random() * availableLetters.length)];

        console.log('Assigning letter:', letter);

        const [player] = await db.insert(players)
          .values({
            gameId: waitingGame.id,
            letter,
            isBot: false
          })
          .returning();

        // If this was the last player needed, start the game
        if (playerCount === MAX_PLAYERS - 2) { // Start game when second player joins
          console.log('Starting game with ID:', waitingGame.id);

          await db.update(games)
            .set({ status: 'active' })
            .where(eq(games.id, waitingGame.id));

          return {
            gameId: waitingGame.id,
            letter: player.letter
          };
        }

        // Return queue state while waiting for more players
        return {
          queueState: {
            playersInQueue: playerCount + 1,
            estimatedWaitTime: BASE_WAIT_TIME
          }
        };
      }
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