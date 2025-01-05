import { useGameState } from '@/lib/websocket';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from "@/lib/utils";

export function PlayerList() {
  const { playerStates } = useGameState();

  return (
    <Card className="p-4">
      <h2 className="font-semibold mb-4">Players</h2>
      <div className="space-y-4">
        {Array.from(playerStates.entries()).map(([letter, state]) => (
          <div key={letter} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-primary">
                {letter}
              </span>
              <div className="flex gap-2">
                {state.eliminated && (
                  <Badge variant="destructive">Eliminated</Badge>
                )}
                {state.hasGuessed && !state.eliminated && (
                  <Badge variant="secondary">Guessed</Badge>
                )}
              </div>
            </div>

            {!state.eliminated && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Time to chat</span>
                  <span>{Math.max(0, state.timeRemaining)}s</span>
                </div>
                <Progress 
                  value={Math.max(0, (state.timeRemaining / 30) * 100)} 
                  className={cn(
                    "h-1",
                    state.timeRemaining <= 10 && "bg-destructive"
                  )}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}