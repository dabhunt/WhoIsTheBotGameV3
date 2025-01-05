import { useMutation, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface JoinGameResponse {
  gameId: number;
  playerId: number;
  letter: string;
}

interface GameError {
  message: string;
}

export function useJoinGame() {
  const { toast } = useToast();

  return useMutation<JoinGameResponse, GameError>({
    mutationFn: async () => {
      const response = await fetch('/api/games/join', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status >= 500) {
          throw new Error(`Server error: ${response.statusText}`);
        }
        const error = await response.text();
        throw new Error(error || 'Failed to join game');
      }

      return response.json();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to join game',
        variant: 'destructive',
      });
    },
  });
}

export function useGame(gameId: number) {
  return useQuery<JoinGameResponse, GameError>({
    queryKey: [`/api/games/${gameId}`],
    enabled: !!gameId,
    retry: false,
    staleTime: Infinity,
  });
}

export function parseGuessCommand(input: string): { command: string; letter: string } | null {
  const match = input.match(/^\/guess\s+([A-Ha-h])$/i);
  if (!match) return null;
  
  return {
    command: 'guess',
    letter: match[1].toUpperCase()
  };
}

export function validateGuessLetter(letter: string): boolean {
  return /^[A-H]$/.test(letter.toUpperCase());
}

export function formatGameTime(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getPlayerStatus(eliminated: boolean, hasGuessed: boolean): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive';
} {
  if (eliminated) {
    return { label: 'Eliminated', variant: 'destructive' };
  }
  if (hasGuessed) {
    return { label: 'Guessed', variant: 'secondary' };
  }
  return { label: 'Active', variant: 'default' };
}

export function generateGameSummary(winner: string | null, playerLetter: string): string {
  if (!winner) {
    return 'Game Over - No Winner';
  }
  if (winner === playerLetter) {
    return 'Congratulations! You won!';
  }
  return `Game Over - Player ${winner} won!`;
}

export const GAME_RULES = [
  'Join a game with up to 7 other players',
  'One player is secretly an AI bot',
  'Chat with others to figure out who\'s the bot',
  'Use /guess [LETTER] to make your guess',
  'Guess wrong and you\'re eliminated!',
  'First to correctly identify the bot wins'
];

export const MAX_PLAYERS = 8;
export const MAX_MESSAGE_LENGTH = 500;
export const VALID_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export function sanitizeMessage(content: string): string {
  return content
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH)
    .replace(/[<>]/g, ''); // Basic XSS prevention
}
