import { create } from 'zustand';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: number;
  playerLetter: string;
  content: string;
  createdAt: string;
}

interface PlayerState {
  eliminated: boolean;
  hasGuessed: boolean;
  lastMessageTime?: number;
  timeRemaining: number;
}

interface GameState {
  connected: boolean;
  messages: Message[];
  playerStates: Map<string, PlayerState>;
  gameOver: boolean;
  winner: string | null;
  ws: WebSocket | null;
  connect: (gameId: number, letter: string) => void;
  disconnect: () => void;
  sendMessage: (content: string) => void;
  makeGuess: (guessedLetter: string, playerId: number) => void;
  updateTimer: (letter: string, timeRemaining: number) => void;
}

export const useGameState = create<GameState>((set, get) => ({
  connected: false,
  messages: [],
  playerStates: new Map(),
  gameOver: false,
  winner: null,
  ws: null,

  connect: (gameId: number, letter: string) => {
    try {
      // Disconnect existing connection if any
      const currentWs = get().ws;
      if (currentWs) {
        console.log('Closing existing WebSocket connection');
        currentWs.close();
      }

      console.log('Connecting to WebSocket for game:', gameId, 'as player:', letter);

      // Ensure clean values for URL construction
      const sanitizedGameId = encodeURIComponent(gameId);
      const sanitizedLetter = encodeURIComponent(letter);

      // Construct WebSocket URL with explicit path
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws?gameId=${sanitizedGameId}&letter=${sanitizedLetter}`;

      console.log('Attempting WebSocket connection to:', wsUrl);

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected successfully');
        set({ connected: true });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received WebSocket message:', data);

          switch (data.type) {
            case 'history':
              console.log('Received message history:', data.messages);
              set({ messages: data.messages });
              break;

            case 'message':
              console.log('Received new message:', data.message);
              set((state) => ({
                messages: [...state.messages, data.message],
              }));
              break;

            case 'gameState':
              console.log('Received game state update:', data.state);
              set((state) => ({
                playerStates: new Map(Object.entries(data.state.players)),
                gameOver: data.state.gameOver,
                winner: data.state.winner
              }));
              break;

            default:
              console.log('Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        set({ connected: false });
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        set({ connected: false });
      };

      set({ ws });
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      set({ connected: false });
    }
  },

  disconnect: () => {
    const ws = get().ws;
    if (ws) {
      console.log('Manually disconnecting WebSocket');
      ws.close();
    }
    set({
      connected: false,
      messages: [],
      playerStates: new Map(),
      gameOver: false,
      winner: null,
      ws: null,
    });
  },

  sendMessage: (content: string) => {
    const ws = get().ws;
    if (ws?.readyState === WebSocket.OPEN) {
      console.log('Sending message:', content);
      ws.send(JSON.stringify({
        type: 'chat',
        content,
      }));
    } else {
      console.warn('Cannot send message: WebSocket not connected');
    }
  },

  makeGuess: (guessedLetter: string, playerId: number) => {
    const ws = get().ws;
    if (ws?.readyState === WebSocket.OPEN) {
      console.log('Making guess:', guessedLetter, 'for player:', playerId);
      ws.send(JSON.stringify({
        type: 'guess',
        guessedLetter,
        playerId,
      }));
    } else {
      console.warn('Cannot make guess: WebSocket not connected');
    }
  },

  updateTimer: (letter: string, timeRemaining: number) => {
    set((state) => {
      const playerStates = new Map(state.playerStates);
      const playerState = playerStates.get(letter);
      if (playerState) {
        playerStates.set(letter, {
          ...playerState,
          timeRemaining,
        });
      }
      return { playerStates };
    });
  },
}));