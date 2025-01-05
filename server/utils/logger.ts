import { type Request, type Response } from 'express';

interface LogContext {
  requestId?: string;
  gameId?: number;
  playerId?: string | number;
  error?: Error;
  status?: string;
  count?: number;
  duration?: string;
  [key: string]: any; // Allow additional context properties
}

export function formatLogMessage(message: string, context: LogContext = {}): string {
  const timestamp = new Date().toISOString();
  const contextStr = Object.entries(context)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => {
      if (value instanceof Error) {
        return `${key}=${value.message}`;
      }
      return `${key}=${value}`;
    })
    .join(' ');

  return `${timestamp} ${message} ${contextStr}`.trim();
}

export function logMatchmaking(message: string, context: LogContext = {}) {
  console.log(formatLogMessage(`[Matchmaking] ${message}`, context));
}

export function logError(message: string, context: LogContext = {}) {
  console.error(formatLogMessage(`[Error] ${message}`, context));
}

export function logGameState(message: string, context: LogContext = {}) {
  console.log(formatLogMessage(`[GameState] ${message}`, context));
}

export class MatchmakingError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context: Record<string, any> = {}
  ) {
    super(message);
    this.name = 'MatchmakingError';
  }
}

// Error codes for matchmaking
export const ErrorCodes = {
  QUEUE_FULL: 'QUEUE_FULL',
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  GAME_FULL: 'GAME_FULL',
  INVALID_STATE: 'INVALID_STATE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  RATE_LIMIT: 'RATE_LIMIT'
} as const;

// Request tracking middleware
export function requestLogger(req: Request, res: Response, next: Function) {
  const requestId = Math.random().toString(36).substring(7);
  const start = Date.now();

  // Attach request ID to the request object for use in other middleware/routes
  (req as any).requestId = requestId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const message = `${req.method} ${req.path} ${res.statusCode}`;
    console.log(formatLogMessage(message, { 
      requestId,
      duration: `${duration}ms`,
      status: res.statusCode.toString() // Convert status to string
    }));
  });

  next();
}