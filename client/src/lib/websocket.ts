import { create } from 'zustand';

interface Message {
  id: number;
  playerLetter: string;
  content: string;
  createdAt: string;
}

interface GameState {
  connected: boolean;
  messages: Message[];
  playerStates: Map<string, { eliminated: boolean; hasGuessed: boolean }>;
  gameOver: boolean;
  winner: string | null;
  connect: (gameId: number, letter: string) => void;
  disconnect: () => void;
  sendMessage: (content: string) => void;
  makeGuess: (guessedLetter: string, playerId: number) => void;
}

export const useGameState = create<GameState>((set, get) => ({
  connected: false,
  messages: [],
  playerStates: new Map(),
  gameOver: false,
  winner: null,
  ws: null as WebSocket | null,

  connect: (gameId: number, letter: string) => {
    const ws = new WebSocket(
      `ws://${window.location.host}?gameId=${gameId}&letter=${letter}`
    );

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'history') {
        set({ messages: data.messages });
      }
      else if (data.type === 'message') {
        set(state => ({
          messages: [...state.messages, data.message]
        }));
      }
      else if (data.type === 'gameState') {
        set(state => {
          const playerStates = new Map(state.playerStates);
          playerStates.set(data.letter, {
            eliminated: !data.isCorrect,
            hasGuessed: true
          });

          return {
            playerStates,
            gameOver: data.gameOver,
            winner: data.gameOver ? data.letter : null
          };
        });
      }
    };

    ws.onopen = () => set({ connected: true });
    ws.onclose = () => set({ connected: false });
    
    set({ ws });
  },

  disconnect: () => {
    get().ws?.close();
    set({ 
      connected: false,
      messages: [],
      playerStates: new Map(),
      gameOver: false,
      winner: null,
      ws: null
    });
  },

  sendMessage: (content: string) => {
    if (get().ws?.readyState === WebSocket.OPEN) {
      get().ws?.send(JSON.stringify({
        type: 'chat',
        content
      }));
    }
  },

  makeGuess: (guessedLetter: string, playerId: number) => {
    if (get().ws?.readyState === WebSocket.OPEN) {
      get().ws?.send(JSON.stringify({
        type: 'guess',
        guessedLetter,
        playerId
      }));
    }
  }
}));
