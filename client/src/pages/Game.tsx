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
    const url = new URL(location, window.location.origin);
    const gameId = parseInt(url.pathname.split('/').pop() || '');
    const letter = url.searchParams.get('letter');

    if (!gameId || !letter) {
      setLocation('/');
      return;
    }

    connect(gameId, letter);
    return () => disconnect();
  }, [location]);

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