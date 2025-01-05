import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
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
  gameId: integer("game_id").notNull(),
  letter: text("letter").notNull(),
  isBot: boolean("is_bot").default(false).notNull(),
  hasGuessed: boolean("has_guessed").default(false).notNull(),
  eliminated: boolean("eliminated").default(false).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull(),
  playerLetter: text("player_letter").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Game = typeof games.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Message = typeof messages.$inferSelect;
