import { create } from 'zustand';
import { useToast } from '@/hooks/use-toast';

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
  let pollIntervalId: ReturnType<typeof setInterval> | null = null;

  const clearPollInterval = () => {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  };

  return {
    inQueue: false,
    playersInQueue: 0,
    estimatedWaitTime: 30,
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
        console.log('Join queue response:', data);

        if (data.gameId && data.letter) {
          // Game is ready immediately
          console.log('Game is ready, transitioning to game page with:', data);
          clearPollInterval();
          set({ 
            inQueue: false,
            gameData: {
              gameId: data.gameId,
              letter: data.letter
            }
          });
        } else if (data.queueState) {
          // Enter queue state
          console.log('Entering queue with state:', data.queueState);
          set({ 
            inQueue: true,
            playersInQueue: data.queueState.playersInQueue,
            estimatedWaitTime: data.queueState.estimatedWaitTime
          });

          // Start polling for game status
          pollIntervalId = setInterval(async () => {
            try {
              const pollResponse = await fetch('/api/games/join', {
                method: 'POST',
                credentials: 'include'
              });

              if (!pollResponse.ok) {
                throw new Error('Failed to poll queue status');
              }

              const pollData = await pollResponse.json();
              console.log('Poll response:', pollData);

              if (pollData.gameId && pollData.letter) {
                console.log('Game found from poll, transitioning to game page');
                clearPollInterval();
                set({ 
                  inQueue: false,
                  gameData: {
                    gameId: pollData.gameId,
                    letter: pollData.letter
                  }
                });
              } else if (pollData.queueState) {
                console.log('Updated queue state:', pollData.queueState);
                set({
                  playersInQueue: pollData.queueState.playersInQueue,
                  estimatedWaitTime: pollData.queueState.estimatedWaitTime
                });
              }
            } catch (error) {
              console.error('Queue polling error:', error);
              clearPollInterval();
              set({ inQueue: false });
            }
          }, 2000);
        }
      } catch (error) {
        console.error('Failed to join queue:', error);
        clearPollInterval();
        set({ inQueue: false });
      }
    },

    leaveQueue: () => {
      console.log('Leaving queue');
      clearPollInterval();
      set({ 
        inQueue: false, 
        playersInQueue: 0, 
        estimatedWaitTime: 30,
        gameData: null 
      });
    },

    setGameData: (data) => {
      console.log('Setting game data:', data);
      set({ gameData: data });
    }
  };
});