import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import type { Server } from 'http';
import { db } from '@db';
import { games, players, messages } from '@db/schema';
import { eq } from 'drizzle-orm';
import { botChatService } from './services/bot.js';

interface Message {
  id: number;
  playerLetter: string;
  content: string;
  createdAt: string;
}

interface GameState {
  gameId: number;
  clients: Map<string, WebSocket>;
  botInitialized?: boolean;
}

const gameStates = new Map<number, GameState>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws',
    verifyClient: ({ req }: { req: IncomingMessage }) => {
      // Skip verification for Vite HMR
      const protocol = req.headers['sec-websocket-protocol'];
      if (protocol === 'vite-hmr') {
        return false;
      }

      // Validate game ID and letter params
      const [, search] = (req.url || '').split('?');
      const params = new URLSearchParams(search || '');
      const gameId = parseInt(params.get('gameId') || '');
      const letter = params.get('letter');

      if (!gameId || !letter) {
        console.error('Invalid WebSocket connection params:', { gameId, letter });
        return false;
      }

      return true;
    }
  });

  wss.on('connection', async (ws, req) => {
    try {
      // Parse game ID and letter from URL
      const [, search] = (req.url || '').split('?');
      const params = new URLSearchParams(search || '');
      const gameId = parseInt(params.get('gameId') || '');
      const letter = params.get('letter');

      if (!gameId || !letter) {
        console.error('Missing connection params:', { gameId, letter });
        ws.close();
        return;
      }

      console.log('WebSocket connected for game:', gameId, 'player:', letter);

      // Verify game exists and is active
      const game = await db.query.games.findFirst({
        where: eq(games.id, gameId),
        with: {
          players: true
        }
      });

      if (!game) {
        console.error('Game not found:', gameId);
        ws.close();
        return;
      }

      // Initialize or get game state
      let gameState = gameStates.get(gameId);
      if (!gameState) {
        gameState = { 
          gameId, 
          clients: new Map(),
          botInitialized: false
        };
        gameStates.set(gameId, gameState);
      }

      // Add client to game state
      gameState.clients.set(letter, ws);

      // Initialize bot chat if not already done
      if (!gameState.botInitialized && game.status === 'active') {
        gameState.botInitialized = true;
        const botPlayer = game.players.find(p => p.isBot);
        if (botPlayer) {
          botChatService.startBotChat(gameId, game.botLetter, async (content) => {
            // Save bot message to database
            const [newMessage] = await db.insert(messages)
              .values({
                gameId,
                playerLetter: game.botLetter,
                content
              })
              .returning();

            // Broadcast bot message to all clients
            const broadcast = JSON.stringify({
              type: 'message',
              message: newMessage
            });

            gameState?.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(broadcast);
              }
            });
          });
        }
      }

      // Send initial game state
      ws.send(JSON.stringify({
        type: 'gameState',
        state: {
          players: game.players.map(p => ({
            letter: p.letter,
            eliminated: p.eliminated,
            hasGuessed: p.hasGuessed,
            isBot: p.isBot,
            timeRemaining: !p.eliminated ? 30 : 0
          })),
          gameOver: game.status === 'finished',
          winner: game.winnerPlayerId ? 
            (game.players.find(p => p.id === game.winnerPlayerId)?.letter || null) : null
        }
      }));

      // Send existing messages
      const existingMessages = await db.select()
        .from(messages)
        .where(eq(messages.gameId, gameId))
        .orderBy(messages.createdAt);

      ws.send(JSON.stringify({ 
        type: 'history', 
        messages: existingMessages 
      }));

      // Handle incoming messages
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('Received message:', message);

          if (message.type === 'chat') {
            // Save message to database
            const [newMessage] = await db.insert(messages)
              .values({
                gameId,
                playerLetter: letter,
                content: message.content
              })
              .returning();

            // Add message to bot chat history
            botChatService.addMessage(gameId, {
              gameId,
              playerLetter: letter,
              content: message.content,
              timestamp: new Date()
            });

            // Broadcast message to all clients
            const broadcast = JSON.stringify({
              type: 'message',
              message: newMessage
            });

            gameState?.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(broadcast);
              }
            });
          }
        } catch (error) {
          console.error('Message handling error:', error);
        }
      });

      // Handle disconnection
      ws.on('close', () => {
        console.log('WebSocket disconnected for game:', gameId, 'player:', letter);
        gameState?.clients.delete(letter);

        // If all clients disconnected, clean up game state and stop bot
        if (gameState?.clients.size === 0) {
          botChatService.stopBotChat(gameId);
          gameStates.delete(gameId);
        }
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close();
    }
  });
}