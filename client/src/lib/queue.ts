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
  retryCount: number;
  isTransitioning: boolean;
}

const MAX_RETRY_COUNT = 3;
const POLL_INTERVAL = 3000;

export const useQueueStore = create<QueueState>((set, get) => {
  let pollIntervalId: ReturnType<typeof setInterval> | null = null;

  const clearPollInterval = () => {
    if (pollIntervalId) {
      console.log('Clearing poll interval');
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  };

  return {
    inQueue: false,
    playersInQueue: 0,
    estimatedWaitTime: 30,
    gameData: null,
    retryCount: 0,
    isTransitioning: false,

    joinQueue: async () => {
      try {
        console.log('Attempting to join queue...');
        const response = await fetch('/api/games/join', {
          method: 'POST',
          credentials: 'include'
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to join queue');
        }

        const data = await response.json();
        console.log('Join queue response:', data);

        if (data.gameId && data.letter) {
          // Game is ready immediately
          console.log('Game is ready immediately:', data);
          clearPollInterval();
          set({ 
            inQueue: false,
            retryCount: 0,
            isTransitioning: true,
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
            retryCount: 0,
            isTransitioning: false,
            playersInQueue: data.queueState.playersInQueue,
            estimatedWaitTime: data.queueState.estimatedWaitTime
          });

          // Start polling for game status
          pollIntervalId = setInterval(async () => {
            if (!get().inQueue || get().isTransitioning) {
              clearPollInterval();
              return;
            }

            try {
              console.log('Polling for game status...');
              const pollResponse = await fetch('/api/games/join', {
                method: 'POST',
                credentials: 'include'
              });

              if (!pollResponse.ok) {
                throw new Error(`Failed to poll queue status: ${pollResponse.status}`);
              }

              const pollData = await pollResponse.json();
              console.log('Poll response:', pollData);

              if (pollData.gameId && pollData.letter) {
                // Game is ready
                console.log('Game found from poll:', pollData);
                clearPollInterval();
                set({ 
                  inQueue: false,
                  retryCount: 0,
                  isTransitioning: true,
                  gameData: {
                    gameId: pollData.gameId,
                    letter: pollData.letter
                  }
                });
              } else if (pollData.queueState) {
                // Update queue state
                console.log('Updated queue state:', pollData.queueState);
                set({
                  retryCount: 0,
                  playersInQueue: pollData.queueState.playersInQueue,
                  estimatedWaitTime: pollData.queueState.estimatedWaitTime
                });
              }
            } catch (error) {
              console.error('Queue polling error:', error);
              const retryCount = get().retryCount + 1;
              if (retryCount >= MAX_RETRY_COUNT) {
                clearPollInterval();
                set({ 
                  inQueue: false, 
                  retryCount: 0,
                  isTransitioning: false 
                });
                useToast().toast({
                  title: "Error",
                  description: "Lost connection to queue. Please try again.",
                  variant: "destructive"
                });
              } else {
                set({ retryCount });
              }
            }
          }, POLL_INTERVAL);
        }
      } catch (error) {
        console.error('Failed to join queue:', error);
        clearPollInterval();
        set({ 
          inQueue: false, 
          retryCount: 0,
          isTransitioning: false 
        });
        useToast().toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to join queue",
          variant: "destructive"
        });
      }
    },

    leaveQueue: () => {
      console.log('Leaving queue');
      clearPollInterval();
      set({ 
        inQueue: false, 
        playersInQueue: 0, 
        estimatedWaitTime: 30,
        gameData: null,
        retryCount: 0,
        isTransitioning: false
      });
    },

    setGameData: (data) => {
      console.log('Setting game data:', data);
      set({ 
        gameData: data,
        isTransitioning: false
      });
    }
  };
});