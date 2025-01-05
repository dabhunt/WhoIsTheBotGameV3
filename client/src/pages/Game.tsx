import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Chat } from '@/components/Chat';
import { PlayerList } from '@/components/PlayerList';
import { useGameState } from '@/lib/websocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function Game() {
  const [location, setLocation] = useLocation();
  const { connect, disconnect, gameOver, winner } = useGameState();

  useEffect(() => {
    try {
      // Parse gameId from URL path and letter from query params
      const [, gameIdStr] = location.match(/\/game\/(\d+)/) || [];
      const gameId = parseInt(gameIdStr);
      const letter = new URLSearchParams(window.location.search).get('letter');

      console.log('Game component initializing with:', { gameId, letter });

      if (!gameId || !letter) {
        console.error('Missing required game parameters:', { gameId, letter });
        setLocation('/');
        return;
      }

      console.log('Connecting to game:', gameId, 'as player:', letter);
      connect(gameId, letter);

      return () => {
        console.log('Game component unmounting, disconnecting WebSocket');
        disconnect();
      };
    } catch (error) {
      console.error('Error initializing game:', error);
      setLocation('/');
    }
  }, [location, setLocation]);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
        <div className="space-y-4">
          <PlayerList />

          {gameOver && (
            <Card>
              <CardHeader>
                <CardTitle>Game Over!</CardTitle>
              </CardHeader>
              <CardContent>
                {winner ? (
                  <p>Player {winner} won!</p>
                ) : (
                  <p>Better luck next time!</p>
                )}
                <Button
                  onClick={() => setLocation('/')}
                  className="w-full mt-4"
                >
                  Play Again
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="h-[calc(100vh-2rem)]">
          <Chat />
        </div>
      </div>
    </div>
  );
}