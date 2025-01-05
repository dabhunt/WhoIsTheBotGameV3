import { db } from '@db/index.js';
import { games, players } from '@db/schema.js';
import { eq, and, count, lt } from 'drizzle-orm';

const LETTERS = ['A', 'B', 'C'];  // Only need 3 letters now: 2 players + 1 bot
const MAX_PLAYERS = 2; // Changed to 2 for testing (1 human + 1 bot)
const BASE_WAIT_TIME = 30; // Fixed 30 second wait time

let lastGameCreationTime = 0;
const MIN_GAME_CREATION_INTERVAL = 5000; // Minimum 5 seconds between game creations

export async function findOrCreateGame() {
  try {
    console.log('Searching for available game...');

    // Find waiting games
    const waitingGames = await db
      .select({
        id: games.id,
        playerCount: count(players.id).mapWith(Number),
        botLetter: games.botLetter
      })
      .from(games)
      .leftJoin(players, eq(games.id, players.gameId))
      .where(eq(games.status, 'waiting'))
      .groupBy(games.id, games.botLetter)
      .having(lt(count(players.id), MAX_PLAYERS))
      .execute();

    console.log('Found waiting games:', waitingGames);

    // Try to join an existing game
    if (waitingGames.length > 0) {
      const game = waitingGames[0];
      console.log('Attempting to join game:', game.id);

      // Get used letters in this game
      const usedLetters = await db
        .select({ letter: players.letter })
        .from(players)
        .where(eq(players.gameId, game.id))
        .execute();

      const availableLetters = LETTERS.filter(l => 
        !usedLetters.map(p => p.letter).includes(l) && 
        l !== game.botLetter
      );

      if (availableLetters.length === 0) {
        console.log('No available letters in game:', game.id);
        throw new Error('No available letters in waiting game');
      }

      const letter = availableLetters[0];
      console.log('Joining game:', game.id, 'with letter:', letter);

      const [player] = await db
        .insert(players)
        .values({
          gameId: game.id,
          letter,
          isBot: false
        })
        .returning();

      // Check if game should start
      if (game.playerCount + 1 >= MAX_PLAYERS) {
        console.log('Game is full, activating game:', game.id);
        await db
          .update(games)
          .set({ status: 'active' })
          .where(eq(games.id, game.id));

        return {
          gameId: game.id,
          letter
        };
      }

      return {
        queueState: {
          playersInQueue: game.playerCount + 1,
          estimatedWaitTime: BASE_WAIT_TIME
        }
      };
    }

    // Check if we should create a new game
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