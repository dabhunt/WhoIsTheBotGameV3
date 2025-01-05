import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQueueStore } from '@/lib/queue';
import { Bot, Users, Target, Loader2 } from 'lucide-react';

export function Home() {
  const [, setLocation] = useLocation();
  const { inQueue, playersInQueue, estimatedWaitTime, joinQueue, leaveQueue } = useQueueStore();

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl bg-slate-800 shadow-xl">
        <CardContent className="p-8 space-y-8">
          <div className="text-center space-y-4">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              Who Is The Bot?
            </h1>
            <p className="text-xl text-slate-300">
              A unique multiplayer twist on the Turing test where deception and detection collide
            </p>
          </div>

          <div className="flex justify-center space-x-8 py-6">
            <div className="flex items-center space-x-2">
              <Users className="w-6 h-6 text-blue-400" />
              <span className="text-lg">2-7 Players</span>
            </div>
            <div className="flex items-center space-x-2">
              <Bot className="w-6 h-6 text-purple-400" />
              <span className="text-lg">1 Bot</span>
            </div>
            <div className="flex items-center space-x-2">
              <Target className="w-6 h-6 text-green-400" />
              <span className="text-lg">1 Winner</span>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Game Rules</h2>
            <ul className="space-y-3 text-slate-300">
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-400 rounded-full mr-3"></span>
                Join an anonymous chat room with up to 7 other players
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-400 rounded-full mr-3"></span>
                One player is secretly an AI bot
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-400 rounded-full mr-3"></span>
                Blend in without revealing yourself as a human
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-400 rounded-full mr-3"></span>
                Use /guess [LETTER] to make your guess
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-400 rounded-full mr-3"></span>
                Guess wrong and you're eliminated!
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-400 rounded-full mr-3"></span>
                First to correctly identify the bot wins
              </li>
            </ul>
          </div>

          {inQueue ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Finding a game...</span>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm text-slate-400">
                  Players in queue: {playersInQueue}
                </p>
                <p className="text-sm text-slate-400">
                  Estimated wait time: {estimatedWaitTime}s
                </p>
              </div>
              <Button
                onClick={leaveQueue}
                variant="outline"
                className="w-full bg-slate-700 hover:bg-slate-600 text-white border-slate-600"
              >
                Leave Queue
              </Button>
            </div>
          ) : (
            <Button
              onClick={joinQueue}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold py-4 px-8 rounded-lg text-xl hover:opacity-90 transition-opacity"
            >
              Play Now
            </Button>
          )}

          <p className="text-center text-slate-400 text-sm">
            Can you outsmart the AI and spot the digital impostor? Test your human intuition now!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}