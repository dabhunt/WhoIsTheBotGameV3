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
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to join queue');
      }

      const data = await response.json();

      if (data.queueState) {
        set({ 
          inQueue: true,
          playersInQueue: data.queueState.playersInQueue,
          estimatedWaitTime: data.queueState.estimatedWaitTime 
        });

        // Keep polling for game status
        const pollInterval = setInterval(async () => {
          try {
            const pollResponse = await fetch('/api/games/join', {
              method: 'POST',
              credentials: 'include'
            });

            if (!pollResponse.ok) {
              clearInterval(pollInterval);
              set({ inQueue: false });
              return;
            }

            const pollData = await pollResponse.json();

            // If we get a gameId, we've found a match
            if (pollData.gameId) {
              clearInterval(pollInterval);
              set({ inQueue: false });
              window.location.href = `/game/${pollData.gameId}?letter=${pollData.letter}`;
            } else if (pollData.queueState) {
              set({
                playersInQueue: pollData.queueState.playersInQueue,
                estimatedWaitTime: pollData.queueState.estimatedWaitTime
              });
            }
          } catch (error) {
            console.error('Queue polling error:', error);
          }
        }, 2000); // Poll every 2 seconds

        return () => clearInterval(pollInterval);
      } else if (data.gameId) {
        // Game is ready immediately
        set({ inQueue: false });
        window.location.href = `/game/${data.gameId}?letter=${data.letter}`;
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