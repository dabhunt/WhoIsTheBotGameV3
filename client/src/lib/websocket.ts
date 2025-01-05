import { create } from 'zustand';

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
    // Use WebSocket protocol that matches the page protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${window.location.host}?gameId=${gameId}&letter=${letter}`
    );

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'history') {
        set({ messages: data.messages });
      } else if (data.type === 'message') {
        set((state) => ({
          messages: [...state.messages, data.message],
        }));
      } else if (data.type === 'gameState') {
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
      } else if (data.type === 'timer') {
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
      }
    };

    ws.onopen = () => set({ connected: true });
    ws.onclose = () => set({ connected: false });

    set({ ws });
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