import { db } from '@db/index.js';
import { games, players } from '@db/schema.js';
import { eq } from 'drizzle-orm';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const MAX_PLAYERS = 8;
const BASE_WAIT_TIME = 15; // base wait time in seconds

export async function findOrCreateGame() {
  // Look for an available game
  const waitingGame = await db.query.games.findFirst({
    where: eq(games.status, 'waiting'),
  });

  if (waitingGame) {
    const playerRows = await db.select()
      .from(players)
      .where(eq(players.gameId, waitingGame.id));

    const playerCount = playerRows.length;

    if (playerCount < MAX_PLAYERS) {
      // Assign random unused letter
      const usedLetters = playerRows.map(p => p.letter);
      const availableLetters = LETTERS.filter(l => !usedLetters.includes(l));
      const letter = availableLetters[Math.floor(Math.random() * availableLetters.length)];

      const [player] = await db.insert(players)
        .values({
          gameId: waitingGame.id,
          letter,
          isBot: false
        })
        .returning();

      // If we're not at max players yet, return queue state
      if (playerCount < MAX_PLAYERS - 1) {
        const estimatedWaitTime = BASE_WAIT_TIME * (MAX_PLAYERS - playerCount - 1);
        return {
          queueState: {
            playersInQueue: playerCount + 1,
            estimatedWaitTime
          }
        };
      }

      // If this was the last player needed, start the game
      await db.update(games)
        .set({ status: 'active' })
        .where(eq(games.id, waitingGame.id));

      return {
        gameId: waitingGame.id,
        playerId: player.id,
        letter: player.letter
      };
    }
  }

  // Create new game
  const botLetter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
  const [game] = await db.insert(games)
    .values({ 
      status: 'waiting',
      botLetter 
    })
    .returning();

  // Add bot player
  await db.insert(players)
    .values({
      gameId: game.id,
      letter: botLetter,
      isBot: true
    });

  // Add human player
  const playerLetter = LETTERS.find(l => l !== botLetter)!;
  const [player] = await db.insert(players)
    .values({
      gameId: game.id,
      letter: playerLetter,
      isBot: false
    })
    .returning();

  // Return queue state since we need more players
  return {
    queueState: {
      playersInQueue: 2,
      estimatedWaitTime: BASE_WAIT_TIME * (MAX_PLAYERS - 2)
    }
  };
}