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
  isBot: boolean;
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

interface ServerGameState {
  players: Record<string, PlayerState>;
  gameOver: boolean;
  winner: string | null;
}

interface ServerMessage {
  type: 'gameState' | 'message' | 'history';
  state?: ServerGameState;
  message?: Message;
  messages?: Message[];
}

export const useGameState = create<GameState>((set, get) => {
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  const clearTimer = () => {
    if (timerInterval !== null) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  };

  return {
    connected: false,
    messages: [],
    playerStates: new Map(),
    gameOver: false,
    winner: null,
    ws: null,

    connect: (gameId: number, letter: string) => {
      try {
        clearTimer();

        const currentWs = get().ws;
        if (currentWs) {
          console.log('Closing existing WebSocket connection');
          currentWs.close();
        }

        console.log('Connecting to WebSocket for game:', gameId, 'as player:', letter);

        const sanitizedGameId = encodeURIComponent(gameId);
        const sanitizedLetter = encodeURIComponent(letter);

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws?gameId=${sanitizedGameId}&letter=${sanitizedLetter}`;

        console.log('Attempting WebSocket connection to:', wsUrl);

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('WebSocket connected successfully');
          set({ connected: true });

          // Start timer update interval
          timerInterval = setInterval(() => {
            set((state) => {
              const newPlayerStates = new Map(state.playerStates);
              let updated = false;

              newPlayerStates.forEach((playerState, playerLetter) => {
                if (!playerState.eliminated && playerState.timeRemaining > 0) {
                  updated = true;
                  newPlayerStates.set(playerLetter, {
                    ...playerState,
                    timeRemaining: Math.max(0, playerState.timeRemaining - 1)
                  });
                }
              });

              return updated ? { playerStates: newPlayerStates } : state;
            });
          }, 1000);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as ServerMessage;
            console.log('Received WebSocket message:', data);

            switch (data.type) {
              case 'history':
                if (data.messages) {
                  console.log('Received message history:', data.messages);
                  set({ messages: data.messages });
                }
                break;

              case 'message':
                if (data.message) {
                  console.log('Received new message:', data.message);
                  set((state) => ({
                    messages: [...state.messages, data.message],
                  }));
                }
                break;

              case 'gameState':
                if (data.state) {
                  console.log('Received game state update:', data.state);
                  // Convert the record to a properly typed Map
                  const playerStates = new Map(
                    Object.entries(data.state.players).map(([key, value]) => [
                      key,
                      value as PlayerState
                    ])
                  );
                  console.log('Parsed player states:', playerStates);
                  set({
                    playerStates,
                    gameOver: data.state.gameOver,
                    winner: data.state.winner
                  });
                }
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
          clearTimer();
          set({ connected: false });
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          clearTimer();
          set({ connected: false });
        };

        set({ ws });
      } catch (error) {
        console.error('Error connecting to WebSocket:', error);
        clearTimer();
        set({ connected: false });
      }
    },

    disconnect: () => {
      const ws = get().ws;
      if (ws) {
        console.log('Manually disconnecting WebSocket');
        ws.close();
      }
      clearTimer();
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
  };
});