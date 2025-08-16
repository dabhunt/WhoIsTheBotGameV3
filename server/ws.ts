import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import type { Server } from 'http';
import { db } from '@db';
import { games, players, messages } from '@db/schema';
import { eq } from 'drizzle-orm';
import { botChatService } from './services/bot';

// --- NEW: Map to store connections by session ID ---
export const sessionConnections = new Map<string, WebSocket>();

// --- NEW: Exported function to send messages to a session ---
export function sendToSession(sessionId: string, message: object) {
  const ws = sessionConnections.get(sessionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

interface GameState {
  gameId: number;
  clients: Map<string, WebSocket>;
  botInitialized?: boolean;
}

const gameStates = new Map<number, GameState>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    // --- UPDATED: Get session ID from the URL query ---
    const [, search] = (req.url || '').split('?');
    const params = new URLSearchParams(search || '');
    const sessionId = params.get('sessionId');

    if (!sessionId) {
      console.error('WebSocket connection without session ID.');
      ws.close();
      return;
    }

    console.log('WebSocket connected for session:', sessionId);
    sessionConnections.set(sessionId, ws);

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received message:', { sessionId, message });

        if (message.type === 'join-game') {
          const { gameId, letter } = message;

          if (!gameId || !letter) {
            console.error('Missing join-game params:', { gameId, letter });
            return;
          }

          const game = await db.query.games.findFirst({ where: eq(games.id, gameId), with: { players: true } });
          if (!game) {
            console.error('Game not found:', gameId);
            ws.close();
            return;
          }

          let gameState = gameStates.get(gameId);
          if (!gameState) {
            gameState = { gameId, clients: new Map(), botInitialized: false };
            gameStates.set(gameId, gameState);
          }
          gameState.clients.set(letter, ws);

          // Send initial game state and message history
          ws.send(JSON.stringify({
            type: 'gameState',
            state: {
              players: game.players.map(p => ({ letter: p.letter, eliminated: p.eliminated, hasGuessed: p.hasGuessed, isBot: p.isBot, timeRemaining: !p.eliminated ? 30 : 0 })),
              gameOver: game.status === 'finished',
              winner: game.winnerPlayerId ? (game.players.find(p => p.id === game.winnerPlayerId)?.letter || null) : null
            }
          }));
          const existingMessages = await db.select().from(messages).where(eq(messages.gameId, gameId)).orderBy(messages.createdAt);
          ws.send(JSON.stringify({ type: 'history', messages: existingMessages }));

        } else if (message.type === 'chat') {
          const { gameId, letter, content } = message;
          const gameState = gameStates.get(gameId);
          if (!gameState) return;

          const [newMessage] = await db.insert(messages).values({ gameId, playerLetter: letter, content }).returning();
          botChatService.addMessage(gameId, { gameId, playerLetter: letter, content, timestamp: new Date() });

          const broadcast = JSON.stringify({ type: 'message', message: newMessage });
          gameState.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) client.send(broadcast);
          });
        }
      } catch (error) {
        console.error('Message handling error:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket disconnected for session:', sessionId);
      sessionConnections.delete(sessionId);

      gameStates.forEach(gameState => {
        for (const [letter, client] of gameState.clients.entries()) {
          if (client === ws) gameState.clients.delete(letter);
        }
        if (gameState.clients.size === 0) {
          botChatService.stopBotChat(gameState.gameId);
          gameStates.delete(gameState.gameId);
        }
      });
    });
  });
}