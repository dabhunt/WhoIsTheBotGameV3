import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupWebSocket } from "./ws";
import { findOrCreateGame } from "./game";

export function registerRoutes(app: Express): Server {
  app.post('/api/games/join', async (req, res) => {
    try {
      const result = await findOrCreateGame();
      res.json(result);
    } catch (error) {
      console.error('Join game error:', error);
      res.status(500).send('Failed to join game');
    }
  });

  const httpServer = createServer(app);
  setupWebSocket(httpServer);

  return httpServer;
}
