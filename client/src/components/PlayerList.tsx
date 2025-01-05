import { useGameState } from '@/lib/websocket';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function PlayerList() {
  const { playerStates } = useGameState();

  return (
    <Card className="p-4">
      <h2 className="font-semibold mb-4">Players</h2>
      <div className="space-y-2">
        {Array.from(playerStates.entries()).map(([letter, state]) => (
          <div key={letter} className="flex items-center gap-2">
            <span className="font-medium">Player {letter}</span>
            {state.eliminated && (
              <Badge variant="destructive">Eliminated</Badge>
            )}
            {state.hasGuessed && !state.eliminated && (
              <Badge variant="secondary">Guessed</Badge>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
