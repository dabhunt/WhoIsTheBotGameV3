import { db } from '@db/index.js';
import { games, players } from '@db/schema.js';
import { eq, and, count, lt } from 'drizzle-orm';

const LETTERS = ['A', 'B', 'C'];  // Only need 3 letters now: 2 players + 1 bot
const MAX_PLAYERS = 2; // Changed to 2 for testing (1 human + 1 bot)
const BASE_WAIT_TIME = 30; // Fixed 30 second wait time

export async function findOrCreateGame() {
  try {
    console.log('Searching for available game...');

    // Find waiting games with their current player count
    const waitingGames = await db
      .select({
        id: games.id,
        botLetter: games.botLetter,
        playerCount: count(players.id).mapWith(Number)
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
      // Sort by player count descending to fill up games faster
      const game = waitingGames.sort((a, b) => b.playerCount - a.playerCount)[0];
      console.log('Attempting to join game:', game.id, 'with current player count:', game.playerCount);

      // Get available letters (excluding bot letter and used letters)
      const existingPlayers = await db
        .select()
        .from(players)
        .where(eq(players.gameId, game.id))
        .execute();

      const usedLetters = existingPlayers.map(p => p.letter);
      console.log('Used letters:', usedLetters, 'Bot letter:', game.botLetter);

      const availableLetters = LETTERS.filter(l => 
        !usedLetters.includes(l) && l !== game.botLetter
      );

      console.log('Available letters for new player:', availableLetters);

      if (availableLetters.length === 0) {
        throw new Error('No available letters');
      }

      // Add player to existing game
      const letter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
      const [player] = await db
        .insert(players)
        .values({
          gameId: game.id,
          letter,
          isBot: false
        })
        .returning();

      // Get updated player count
      const [{ count: currentPlayerCount }] = await db
        .select({ count: count().mapWith(Number) })
        .from(players)
        .where(eq(players.gameId, game.id))
        .execute();

      console.log('After adding player - Current player count:', currentPlayerCount, 'MAX_PLAYERS:', MAX_PLAYERS);

      // Check if game can start
      if (currentPlayerCount >= MAX_PLAYERS) {
        console.log('Starting game:', game.id, 'Current players:', currentPlayerCount, 'Status changing to active');
        await db
          .update(games)
          .set({ status: 'active' })
          .where(eq(games.id, game.id));

        return {
          gameId: game.id,
          letter: player.letter
        };
      }

      // Return queue state
      console.log('Game not ready to start - Returning queue state with count:', currentPlayerCount);
      return {
        queueState: {
          playersInQueue: currentPlayerCount,
          estimatedWaitTime: BASE_WAIT_TIME
        }
      };
    }

    // Create new game with bot
    console.log('No waiting games found, creating new game with bot');
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

    console.log('New game created with bot and first player. Bot:', botLetter, 'Player:', playerLetter);

    return {
      queueState: {
        playersInQueue: 2, // Bot + First player
        estimatedWaitTime: BASE_WAIT_TIME
      }
    };
  } catch (error) {
    console.error('Error in findOrCreateGame:', error);
    throw error;
  }
}