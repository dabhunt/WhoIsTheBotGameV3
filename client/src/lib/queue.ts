import { create } from 'zustand';

interface QueueState {
  inQueue: boolean;
  playersInQueue: number;
  estimatedWaitTime: number;
  gameData: { gameId: number; letter: string } | null;
  joinQueue: () => Promise<void>;
  leaveQueue: () => void;
  setGameData: (data: { gameId: number; letter: string } | null) => void;
}

export const useQueueStore = create<QueueState>((set) => {
  let pollIntervalId: NodeJS.Timeout | null = null;

  const clearPollInterval = () => {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  };

  return {
    inQueue: false,
    playersInQueue: 0,
    estimatedWaitTime: 0,
    gameData: null,

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
          pollIntervalId = setInterval(async () => {
            try {
              const pollResponse = await fetch('/api/games/join', {
                method: 'POST',
                credentials: 'include'
              });

              if (!pollResponse.ok) {
                clearPollInterval();
                set({ inQueue: false });
                return;
              }

              const pollData = await pollResponse.json();

              // If we get a gameId, we've found a match
              if (pollData.gameId) {
                clearPollInterval();
                set({ 
                  inQueue: false,
                  gameData: {
                    gameId: pollData.gameId,
                    letter: pollData.letter
                  }
                });
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
        } else if (data.gameId) {
          // Game is ready immediately
          set({ 
            inQueue: false,
            gameData: {
              gameId: data.gameId,
              letter: data.letter
            }
          });
        }
      } catch (error) {
        clearPollInterval();
        console.error('Failed to join queue:', error);
        set({ inQueue: false });
      }
    },

    leaveQueue: () => {
      clearPollInterval();
      set({ inQueue: false, playersInQueue: 0, estimatedWaitTime: 0, gameData: null });
    },

    setGameData: (data) => {
      set({ gameData: data });
    }
  };
});