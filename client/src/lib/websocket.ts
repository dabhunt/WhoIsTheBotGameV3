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
        currentWs.close();
      }

      // Construct WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws?gameId=${gameId}&letter=${letter}`;
      console.log('Connecting to WebSocket:', wsUrl);

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        set({ connected: true });
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        set({ connected: false });
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        set({ connected: false });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received WebSocket message:', data);

          switch (data.type) {
            case 'history':
              set({ messages: data.messages });
              break;

            case 'message':
              set((state) => ({
                messages: [...state.messages, data.message],
              }));
              break;

            case 'gameState':
              set((state) => {
                const playerStates = new Map(state.playerStates);
                playerStates.set(data.letter, {
                  eliminated: !data.isCorrect,
                  hasGuessed: true,
                  timeRemaining: 30,
                });

                return {
                  playerStates,
                  gameOver: data.gameOver,
                  winner: data.gameOver ? data.letter : null,
                };
              });
              break;

            case 'timer':
              set((state) => {
                const playerStates = new Map(state.playerStates);
                const playerState = playerStates.get(data.letter) || {
                  eliminated: false,
                  hasGuessed: false,
                  timeRemaining: data.timeRemaining,
                };

                playerStates.set(data.letter, {
                  ...playerState,
                  timeRemaining: data.timeRemaining,
                  eliminated: data.timeRemaining <= 0 ? true : playerState.eliminated,
                });

                return { playerStates };
              });
              break;

            default:
              console.warn('Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
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
      ws.send(JSON.stringify({
        type: 'chat',
        content,
      }));
    }
  },

  makeGuess: (guessedLetter: string, playerId: number) => {
    const ws = get().ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'guess',
        guessedLetter,
        playerId,
      }));
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