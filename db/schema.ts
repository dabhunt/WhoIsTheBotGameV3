import { pgTable, text, serial, timestamp, integer, boolean, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default('waiting'), // waiting, active, finished
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  botLetter: text("bot_letter").notNull(),
  winnerPlayerId: integer("winner_player_id"),
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => games.id),
  letter: text("letter").notNull(),
  isBot: boolean("is_bot").default(false).notNull(),
  hasGuessed: boolean("has_guessed").default(false).notNull(),
  eliminated: boolean("eliminated").default(false).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => games.id),
  playerLetter: text("player_letter").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const gamesRelations = relations(games, ({ many, one }) => ({
  players: many(players),
  messages: many(messages),
  winner: one(players, {
    fields: [games.winnerPlayerId],
    references: [players.id],
  }),
}));

export const playersRelations = relations(players, ({ one }) => ({
  game: one(games, {
    fields: [players.gameId],
    references: [games.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  game: one(games, {
    fields: [messages.gameId],
    references: [games.id],
  }),
}));

// Schemas for validation
export const insertGameSchema = createInsertSchema(games);
export const selectGameSchema = createSelectSchema(games);

export const insertPlayerSchema = createInsertSchema(players);
export const selectPlayerSchema = createSelectSchema(players);

export const insertMessageSchema = createInsertSchema(messages);
export const selectMessageSchema = createSelectSchema(messages);

export type Game = typeof games.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Message = typeof messages.$inferSelect;