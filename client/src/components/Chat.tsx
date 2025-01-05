import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useGameState } from '@/lib/websocket';
import { format } from 'date-fns';

export function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useGameState();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      if (input.startsWith('/guess')) {
        const letter = input.split(' ')[1]?.toUpperCase();
        if (letter && /^[A-H]$/.test(letter)) {
          useGameState.getState().makeGuess(letter, 0);
        }
      } else {
        sendMessage(input.trim());
      }
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full border rounded-lg bg-background">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className="flex gap-2">
              <span className="font-semibold text-primary">
                {msg.playerLetter}:
              </span>
              <span>{msg.content}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {format(new Date(msg.createdAt), 'HH:mm')}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
      
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message or /guess [LETTER]..."
            className="flex-1"
          />
          <Button type="submit">Send</Button>
        </div>
      </form>
    </div>
  );
}
