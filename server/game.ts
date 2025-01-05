import { db } from '@db/index.js';
import { games, players } from '@db/schema.js';
import { eq } from 'drizzle-orm';

const LETTERS = ['A', 'B', 'C'];  // Only need 3 letters now: 2 players + 1 bot
const MAX_PLAYERS = 2; // Changed to 2 for testing (1 human + 1 bot)
const BASE_WAIT_TIME = 30; // Fixed 30 second wait time
const MIN_GAME_CREATION_INTERVAL = 5000; // Minimum 5 seconds between game creations

let lastGameCreationTime = 0;
let activeQueue: { gameId: number | null } = { gameId: null };

export async function findOrCreateGame() {
  try {
    // If there's an active game in queue, try to join it first
    if (activeQueue.gameId) {
      console.log('Found active queue game:', activeQueue.gameId);
      const game = await db.query.games.findFirst({
        where: eq(games.id, activeQueue.gameId),
      });

      if (game && game.status === 'waiting') {
        const existingPlayers = await db
          .select()
          .from(players)
          .where(eq(players.gameId, game.id))
          .execute();

        if (existingPlayers.length < MAX_PLAYERS) {
          // Get available letter
          const usedLetters = existingPlayers.map(p => p.letter);
          const availableLetters = LETTERS.filter(l => 
            !usedLetters.includes(l) && 
            l !== game.botLetter
          );

          if (availableLetters.length > 0) {
            const letter = availableLetters[0];
            console.log('Joining active queue game:', game.id, 'with letter:', letter);

            const [player] = await db
              .insert(players)
              .values({
                gameId: game.id,
                letter,
                isBot: false
              })
              .returning();

            // If this fills the game, mark it as active
            if (existingPlayers.length + 1 >= MAX_PLAYERS) {
              console.log('Game is full, activating:', game.id);
              await db
                .update(games)
                .set({ status: 'active' })
                .where(eq(games.id, game.id));

              // Clear active queue
              activeQueue.gameId = null;

              return {
                gameId: game.id,
                letter
              };
            }

            return {
              queueState: {
                playersInQueue: existingPlayers.length + 1,
                estimatedWaitTime: BASE_WAIT_TIME
              }
            };
          }
        }
      }
    }

    // Check if we can create a new game
    const now = Date.now();
    if (now - lastGameCreationTime < MIN_GAME_CREATION_INTERVAL) {
      console.log('Too soon to create new game, returning queue state');
      return {
        queueState: {
          playersInQueue: 1,
          estimatedWaitTime: BASE_WAIT_TIME
        }
      };
    }

    console.log('Creating new game with bot');
    lastGameCreationTime = now;

    // Create new game with bot
    const botLetter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    const [newGame] = await db
      .insert(games)
      .values({
        status: 'waiting',
        botLetter
      })
      .returning();

    console.log('Created new game:', newGame.id, 'with bot letter:', botLetter);

    // Add bot player
    await db
      .insert(players)
      .values({
        gameId: newGame.id,
        letter: botLetter,
        isBot: true
      });

    // Add human player
    const playerLetter = LETTERS.find(l => l !== botLetter)!;
    await db
      .insert(players)
      .values({
        gameId: newGame.id,
        letter: playerLetter,
        isBot: false
      });

    // Set as active queue game
    activeQueue.gameId = newGame.id;

    console.log('Added players to game:', newGame.id);

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