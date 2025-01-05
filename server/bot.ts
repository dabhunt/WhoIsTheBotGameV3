import Anthropic from '@anthropic-ai/sdk';
import { db } from '@db/index.js';
import { messages } from '@db/schema.js';
import { eq } from 'drizzle-orm';

// the newest Anthropic model is "claude-3-5-sonnet-20241022" which was released October 22, 2024
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function handleBotMessage(userMessage: string, gameId: number): Promise<string | null> {
  try {
    // Get context from previous messages
    const recentMessages = await db.select()
      .from(messages)
      .where(eq(messages.gameId, gameId))
      .orderBy(messages.createdAt)
      .limit(5);

    const messageHistory = recentMessages.map(msg => ({
      role: msg.playerLetter === 'Bot' ? 'assistant' as const : 'user' as const,
      content: msg.content
    }));

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 100,
      temperature: 0.7,
      system: "You are participating in a game where players try to identify if you are a bot. Try to be casual and natural in your responses, but don't explicitly deny being a bot if asked. Keep responses short and conversational.",
      messages: [
        ...messageHistory,
        {
          role: 'user' as const,
          content: userMessage
        }
      ]
    });

    if (!response.content[0] || response.content[0].type !== 'text') {
      return null;
    }

    return response.content[0].text;
  } catch (error) {
    console.error('Bot response error:', error);
    return null;
  }
}