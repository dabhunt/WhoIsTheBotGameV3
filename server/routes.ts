import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupWebSocket } from "./ws";
import { findOrCreateGame } from "./game";
import { requestLogger, MatchmakingError, ErrorCodes } from './utils/logger';
import { db } from '@db';
import { games, players } from '@db/schema';
import { eq } from 'drizzle-orm';

export function registerRoutes(app: Express): Server {
  // Create HTTP server first
  const httpServer = createServer(app);

  // Setup WebSocket with the server
  setupWebSocket(httpServer);

  // Add request logging middleware
  app.use(requestLogger);

  // Game matchmaking endpoint
  app.post('/api/games/join', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get or create a game session
      const result = await findOrCreateGame();
      res.json(result);
    } catch (error) {
      if (error instanceof MatchmakingError) {
        res.status(error.statusCode).json({ 
          error: error.code,
          message: error.message,
          context: error.context
        });
      } else {
        next(error);
      }
    }
  });

  // Error handling middleware
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred'
    });
  });

  return httpServer;
}