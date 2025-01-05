import { create } from 'zustand';

interface QueueState {
  inQueue: boolean;
  playersInQueue: number;
  estimatedWaitTime: number;
  joinQueue: () => Promise<void>;
  leaveQueue: () => void;
}

export const useQueueStore = create<QueueState>((set) => ({
  inQueue: false,
  playersInQueue: 0,
  estimatedWaitTime: 0,
  
  joinQueue: async () => {
    try {
      const response = await fetch('/api/games/join', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to join queue');
      }

      const { gameId, letter, queueState } = await response.json();
      
      if (queueState) {
        set({ 
          inQueue: true,
          playersInQueue: queueState.playersInQueue,
          estimatedWaitTime: queueState.estimatedWaitTime 
        });
      } else {
        // If no queue state, means game is ready
        window.location.href = `/game/${gameId}?letter=${letter}`;
      }
    } catch (error) {
      console.error('Failed to join queue:', error);
      set({ inQueue: false });
    }
  },

  leaveQueue: () => {
    set({ inQueue: false, playersInQueue: 0, estimatedWaitTime: 0 });
  }
}));
