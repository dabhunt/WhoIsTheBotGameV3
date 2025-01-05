import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function Home() {
  const [, setLocation] = useLocation();

  const handlePlay = async () => {
    try {
      const response = await fetch('/api/games/join', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to join game');
      }

      const { gameId, letter } = await response.json();
      setLocation(`/game/${gameId}?letter=${letter}`);
    } catch (error) {
      console.error('Failed to join game:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-4xl font-bold text-center">
            Who Is The Bot?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="prose dark:prose-invert">
            <h3>Game Rules</h3>
            <ul>
              <li>Join a game with up to 7 other players</li>
              <li>One player is secretly an AI bot</li>
              <li>Chat with others to figure out who's the bot</li>
              <li>Use /guess [LETTER] to make your guess</li>
              <li>Guess wrong and you're eliminated!</li>
              <li>First to correctly identify the bot wins</li>
            </ul>
          </div>

          <Button
            onClick={handlePlay}
            size="lg"
            className="w-full"
          >
            Play Now
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}