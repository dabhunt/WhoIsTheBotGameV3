import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupWebSocket } from "./ws.js";
import { findOrCreateGame } from "./game.js";

export function registerRoutes(app: Express): Server {
  // Create HTTP server first
  const httpServer = createServer(app);

  // Setup WebSocket with the server
  setupWebSocket(httpServer);

  // Game matchmaking endpoint
  app.post('/api/games/join', async (req, res) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[${requestId}] Received join game request`);

    try {
      // Get or create a game session
      const result = await findOrCreateGame();
      console.log(`[${requestId}] Game match result:`, result);
      res.json(result);
    } catch (error) {
      console.error(`[${requestId}] Join game error:`, error);
      res.status(500).json({ 
        error: 'Failed to join game',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return httpServer;
}