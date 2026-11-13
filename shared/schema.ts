import { pgTable, text, serial, integer, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const leaderboardDifficultyValues = ["easy", "normal", "hard", "extreme"] as const;
export const leaderboardDifficultySchema = z.enum(leaderboardDifficultyValues);

export const leaderboardScores = pgTable("leaderboard_scores", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  // bigint: combo multipliers push long runs past the int4 ceiling (2,147,483,647)
  score: bigint("score", { mode: "number" }).notNull(),
  difficulty: text("difficulty").notNull(),
  wpm: integer("wpm").notNull(),
  accuracyPct: integer("accuracy_pct").notNull(),
  // epoch milliseconds (Date.now()) — does not fit in int4
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const insertLeaderboardScoreSchema = createInsertSchema(leaderboardScores)
  .pick({
    username: true,
    score: true,
    difficulty: true,
    wpm: true,
    accuracyPct: true,
  })
  .extend({
    username: z.string().trim().min(1).max(12).regex(/^[\w .\-]+$/, "Letters, numbers, spaces, . _ - only"),
    score: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    difficulty: leaderboardDifficultySchema,
    wpm: z.number().int().nonnegative().max(300),
    accuracyPct: z.number().int().min(0).max(100),
  });

export const leaderboardSubmissionSchema = insertLeaderboardScoreSchema.extend({
  runToken: z.string().min(10).max(500),
  kills: z.number().int().nonnegative().max(100000),
  level: z.number().int().min(1).max(1000),
});

export const runStartSchema = z.object({ difficulty: leaderboardDifficultySchema });

export const leaderboardQualificationSchema = z.object({
  score: z.number().int().nonnegative(),
  difficulty: leaderboardDifficultySchema,
  wpm: z.number().int().nonnegative(),
  accuracyPct: z.number().int().min(0).max(100),
});

export type LeaderboardDifficulty = z.infer<typeof leaderboardDifficultySchema>;
export type LeaderboardScore = typeof leaderboardScores.$inferSelect;
export type InsertLeaderboardScore = z.infer<typeof insertLeaderboardScoreSchema>;
export type LeaderboardQualificationRequest = z.infer<typeof leaderboardQualificationSchema>;
