import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import type { Server } from 'http';
import { db } from '@db';
import { games, players, messages } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import { handleBotMessage } from './bot.js';

interface GameState {
  gameId: number;
  clients: Map<string, WebSocket>;
  playerTimers: Map<string, {
    lastMessageTime: number;
    timer: NodeJS.Timeout;
  }>;
}

const gameStates = new Map<number, GameState>();
const CHAT_TIMEOUT = 30000; // 30 seconds in milliseconds

function startPlayerTimer(gameState: GameState, letter: string) {
  // Clear existing timer if any
  const existingTimer = gameState.playerTimers.get(letter);
  if (existingTimer?.timer) {
    clearInterval(existingTimer.timer);
  }

  // Start new timer
  const startTime = Date.now();
  const timer = setInterval(() => {
    const timeElapsed = Date.now() - startTime;
    const timeRemaining = Math.max(0, CHAT_TIMEOUT - timeElapsed);

    // Send timer update to all clients
    const timerUpdate = JSON.stringify({
      type: 'timer',
      letter,
      timeRemaining: Math.ceil(timeRemaining / 1000)
    });

    gameState.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(timerUpdate);
      }
    });

    // If time is up, eliminate the player
    if (timeRemaining <= 0) {
      clearInterval(timer);
      eliminatePlayer(gameState.gameId, letter);
    }
  }, 1000);

  gameState.playerTimers.set(letter, {
    lastMessageTime: Date.now(),
    timer
  });
}

async function eliminatePlayer(gameId: number, letter: string) {
  try {
    // Update player status in database
    await db.update(players)
      .set({ eliminated: true })
      .where(
        and(
          eq(players.gameId, gameId),
          eq(players.letter, letter)
        )
      );

    // Get game state
    const gameState = gameStates.get(gameId);
    if (!gameState) return;

    // Send elimination update to all clients
    const eliminationUpdate = JSON.stringify({
      type: 'gameState',
      letter,
      isCorrect: false,
      gameOver: false
    });

    gameState.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(eliminationUpdate);
      }
    });
  } catch (error) {
    console.error('Error eliminating player:', error);
  }
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    verifyClient: ({ req }: { req: IncomingMessage }) => {
      // Skip verification for Vite HMR
      const protocol = req.headers['sec-websocket-protocol'];
      return protocol !== 'vite-hmr';
    }
  });

  wss.on('connection', async (ws, req) => {
    try {
      // Parse game ID and letter from URL
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const gameId = parseInt(url.searchParams.get('gameId') || '');
      const letter = url.searchParams.get('letter') || '';

      if (!gameId || !letter) {
        ws.close();
        return;
      }

      let gameState = gameStates.get(gameId);
      if (!gameState) {
        gameState = { 
          gameId, 
          clients: new Map(),
          playerTimers: new Map()
        };
        gameStates.set(gameId, gameState);
      }

      gameState.clients.set(letter, ws);
      startPlayerTimer(gameState, letter);

      // Send existing messages
      const existingMessages = await db.select()
        .from(messages)
        .where(eq(messages.gameId, gameId))
        .orderBy(messages.createdAt);

      ws.send(JSON.stringify({ type: 'history', messages: existingMessages }));

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'chat') {
            const [newMessage] = await db.insert(messages)
              .values({
                gameId,
                playerLetter: letter,
                content: message.content
              })
              .returning();

            // Reset timer for the player who sent the message
            startPlayerTimer(gameState!, letter);

            // Broadcast to all clients in game
            const broadcast = JSON.stringify({
              type: 'message',
              message: newMessage
            });

            gameState?.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(broadcast);
              }
            });

            // Handle bot response if needed
            const game = await db.query.games.findFirst({
              where: eq(games.id, gameId)
            });

            if (game && game.status === 'active') {
              const botResponse = await handleBotMessage(message.content, gameId);
              if (botResponse) {
                const [botMessage] = await db.insert(messages)
                  .values({
                    gameId,
                    playerLetter: game.botLetter,
                    content: botResponse
                  })
                  .returning();

                // Reset timer for bot
                startPlayerTimer(gameState!, game.botLetter);

                const botBroadcast = JSON.stringify({
                  type: 'message',
                  message: botMessage
                });

                gameState?.clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(botBroadcast);
                  }
                });
              }
            }
          }
          else if (message.type === 'guess') {
            const game = await db.query.games.findFirst({
              where: eq(games.id, gameId)
            });

            if (!game || game.status !== 'active') return;

            const isCorrect = message.guessedLetter === game.botLetter;

            // Update player status
            await db.update(players)
              .set({ 
                hasGuessed: true, 
                eliminated: !isCorrect 
              })
              .where(
                and(
                  eq(players.gameId, gameId),
                  eq(players.letter, letter)
                )
              );

            if (isCorrect) {
              // Update game status when correct guess is made
              const [player] = await db.select()
                .from(players)
                .where(
                  and(
                    eq(players.gameId, gameId),
                    eq(players.letter, letter)
                  )
                );

              await db.update(games)
                .set({ 
                  status: 'finished',
                  winnerPlayerId: player.id
                })
                .where(eq(games.id, gameId));

              // Clear all timers when game is over
              gameState?.playerTimers.forEach(({ timer }) => clearInterval(timer));
            }

            // Broadcast game state update
            const gameStateUpdate = JSON.stringify({
              type: 'gameState',
              letter,
              isCorrect,
              gameOver: isCorrect
            });

            gameState?.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(gameStateUpdate);
              }
            });
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      });

      ws.on('close', () => {
        // Clear timer for disconnected player
        const playerTimer = gameState?.playerTimers.get(letter);
        if (playerTimer?.timer) {
          clearInterval(playerTimer.timer);
        }
        gameState?.playerTimers.delete(letter);

        gameState?.clients.delete(letter);
        if (gameState?.clients.size === 0) {
          gameStates.delete(gameId);
        }
      });
    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close();
    }
  });
}