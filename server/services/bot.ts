import Anthropic from '@anthropic-ai/sdk';
import { logGameState } from '../utils/logger';

// the newest Anthropic model is "claude-3-5-sonnet-20241022" which was released October 22, 2024
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ChatMessage {
  gameId: number;
  playerLetter: string;
  content: string;
  timestamp: Date;
}

class BotChatService {
  private chatHistory: Map<number, ChatMessage[]> = new Map();
  private botIntervals: Map<number, NodeJS.Timeout> = new Map();

  addMessage(gameId: number, message: ChatMessage) {
    if (!this.chatHistory.has(gameId)) {
      this.chatHistory.set(gameId, []);
    }
    this.chatHistory.get(gameId)?.push(message);

    // Trim history to last 10 messages
    const history = this.chatHistory.get(gameId);
    if (history && history.length > 10) {
      this.chatHistory.set(gameId, history.slice(-10));
    }
  }

  async generateBotResponse(gameId: number, botLetter: string): Promise<string> {
    const history = this.chatHistory.get(gameId) || [];

    // Create context from recent messages
    const context = history
      .map(msg => `${msg.playerLetter}: ${msg.content}`)
      .join('\n');

    try {
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 150,
        messages: [{
          role: "user",
          content: `You are player ${botLetter} in a social deduction game. Please respond naturally to this chat, keeping your response brief and casual. Recent chat history:\n${context}`
        }],
      });

      // Extract text content from the response
      const content = response.content.find(c => 'text' in c);
      const message = content && 'text' in content ? content.text : "...";

      logGameState('Bot generated message', { gameId, botLetter, message });
      return message;
    } catch (error) {
      logGameState('Failed to generate bot message', { gameId, botLetter, error: error as Error });
      return "..."; // Fallback response if API fails
    }
  }

  startBotChat(gameId: number, botLetter: string, sendMessage: (content: string) => void) {
    // Clear any existing interval
    this.stopBotChat(gameId);

    // Generate random interval between 20-29 seconds
    const getRandomInterval = () => Math.floor(Math.random() * (29000 - 20000) + 20000);

    const scheduleNext = async () => {
      const message = await this.generateBotResponse(gameId, botLetter);
      sendMessage(message);

      // Schedule next message with new random interval
      const interval = getRandomInterval();
      this.botIntervals.set(gameId, setTimeout(scheduleNext, interval));
    };

    // Start the first interval
    const initialInterval = getRandomInterval();
    this.botIntervals.set(gameId, setTimeout(scheduleNext, initialInterval));
  }

  stopBotChat(gameId: number) {
    const interval = this.botIntervals.get(gameId);
    if (interval) {
      clearTimeout(interval);
      this.botIntervals.delete(gameId);
    }
    this.chatHistory.delete(gameId);
  }
}

export const botChatService = new BotChatService();