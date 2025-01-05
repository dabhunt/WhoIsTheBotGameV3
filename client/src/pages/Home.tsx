import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQueueStore } from '@/lib/queue';
import { Loader2 } from 'lucide-react';

export function Home() {
  const [, setLocation] = useLocation();
  const { inQueue, playersInQueue, estimatedWaitTime, joinQueue, leaveQueue } = useQueueStore();

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

          {inQueue ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Finding a game...</span>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm text-muted-foreground">
                  Players in queue: {playersInQueue}
                </p>
                <p className="text-sm text-muted-foreground">
                  Estimated wait time: {estimatedWaitTime}s
                </p>
              </div>
              <Button
                onClick={leaveQueue}
                variant="outline"
                className="w-full"
              >
                Leave Queue
              </Button>
            </div>
          ) : (
            <Button
              onClick={joinQueue}
              size="lg"
              className="w-full"
            >
              Play Now
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}