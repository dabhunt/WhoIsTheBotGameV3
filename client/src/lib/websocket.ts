import { create } from 'zustand';
import { type Navigate } from 'wouter';

// Interfaces remain the same
interface Message {
  id: number;
  playerLetter: string;
  content: string;
  createdAt: string;
}
interface PlayerState {
  eliminated: boolean;
  hasGuessed: boolean;
  isBot: boolean;
  timeRemaining: number;
}
interface ServerGameState {
  players: Record<string, PlayerState>;
  gameOver: boolean;
  winner: string | null;
}

// Updated GameState to accept navigate in initSession
interface GameState {
  sessionId: string | null;
  connected: boolean;
  inGame: boolean;
  messages: Message[];
  playerStates: Map<string, PlayerState>;
  gameOver: boolean;
  winner: string | null;
  ws: WebSocket | null;
  initSession: (navigate: Navigate) => Promise<void>;
  joinGame: (gameId: number, letter: string) => void;
  disconnect: () => void;
  sendMessage: (gameId: number, letter: string, content: string) => void;
}

interface ServerMessage {
  type: 'gameState' | 'message' | 'history' | 'game-ready';
  state?: ServerGameState;
  message?: Message;
  messages?: Message[];
  gameId?: number;
  letter?: string;
}

export const useGameState = create<GameState>((set, get) => ({
  sessionId: null,
  connected: false,
  inGame: false,
  messages: [],
  playerStates: new Map(),
  gameOver: false,
  winner: null,
  ws: null,

  initSession: async (navigate: Navigate) => {
    if (get().sessionId) return;

    try {
      const response = await fetch('/api/session');
      const { sessionId } = await response.json();
      set({ sessionId });

      const ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws?sessionId=${sessionId}`);

      ws.onopen = () => set({ connected: true });
      ws.onclose = () => set({ connected: false, inGame: false });
      ws.onerror = (err) => console.error('WebSocket error:', err);

      ws.onmessage = (event) => {
        const data: ServerMessage = JSON.parse(event.data);
        console.log('Received WebSocket message:', data);

        switch (data.type) {
          case 'game-ready':
            if (data.gameId && data.letter) {
              // --- CORRECTED LOGIC ---
              // Navigate to the game page and then send the join-game message.
              navigate(`/game/${data.gameId}?letter=${data.letter}`);
              get().joinGame(data.gameId, data.letter);
            }
            break;
          // Other cases remain the same
          case 'history':
            if (data.messages) set({ messages: data.messages });
            break;
          case 'message':
            if (data.message) set((state) => ({ messages: [...state.messages, data.message] }));
            break;
          case 'gameState':
            if (data.state) {
              const playerStates = new Map(Object.entries(data.state.players).map(([k, v]) => [k, v as PlayerState]));
              set({ playerStates, gameOver: data.state.gameOver, winner: data.state.winner });
            }
            break;
        }
      };

      set({ ws });
    } catch (error) {
      console.error('Failed to initialize session:', error);
    }
  },

  joinGame: (gameId: number, letter: string) => {
    const ws = get().ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join-game', gameId, letter }));
      set({ inGame: true });
    }
  },

  disconnect: () => {
    get().ws?.close();
    set({
      connected: false,
      inGame: false,
      messages: [],
      playerStates: new Map(),
      gameOver: false,
      winner: null,
    });
  },

  sendMessage: (gameId: number, letter: string, content: string) => {
    const ws = get().ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'chat', gameId, letter, content }));
    }
  },
}));