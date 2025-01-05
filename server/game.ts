import { db } from '@db';
import { games, players } from '@db/schema';
import { eq } from 'drizzle-orm';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const MAX_PLAYERS = 8;

export async function findOrCreateGame() {
  // Look for an available game
  const waitingGame = await db.query.games.findFirst({
    where: eq(games.status, 'waiting')
  });

  if (waitingGame) {
    const playerCount = await db.query.players.count({
      where: eq(players.gameId, waitingGame.id)
    });

    if (playerCount < MAX_PLAYERS) {
      // Assign random unused letter
      const usedLetters = await db.select()
        .from(players)
        .where(eq(players.gameId, waitingGame.id));
      
      const availableLetters = LETTERS.filter(
        l => !usedLetters.find(p => p.letter === l)
      );
      
      const letter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
      
      const [player] = await db.insert(players)
        .values({
          gameId: waitingGame.id,
          letter,
          isBot: false
        })
        .returning();

      if (playerCount === MAX_PLAYERS - 1) {
        await db.update(games)
          .set({ status: 'active' })
          .where(eq(games.id, waitingGame.id));
      }

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
    .values({ botLetter })
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

  return {
    gameId: game.id,
    playerId: player.id,
    letter: playerLetter
  };
}
