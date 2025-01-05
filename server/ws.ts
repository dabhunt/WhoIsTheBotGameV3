import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import type { Server } from 'http';
import { db } from '@db';
import { games, players, messages } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import { handleBotMessage } from './bot';

interface GameState {
  gameId: number;
  clients: Map<string, WebSocket>;
}

const gameStates = new Map<number, GameState>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    verifyClient: ({ req }: { req: IncomingMessage }) => {
      // Ignore Vite HMR connections
      const protocol = req.headers['sec-websocket-protocol'];
      return protocol !== 'vite-hmr';
    }
  });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const gameId = parseInt(url.searchParams.get('gameId') || '');
    const letter = url.searchParams.get('letter') || '';

    if (!gameId || !letter) {
      ws.close();
      return;
    }

    let gameState = gameStates.get(gameId);
    if (!gameState) {
      gameState = { gameId, clients: new Map() };
      gameStates.set(gameId, gameState);
    }

    gameState.clients.set(letter, ws);

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
      gameState?.clients.delete(letter);
      if (gameState?.clients.size === 0) {
        gameStates.delete(gameId);
      }
    });
  });
}