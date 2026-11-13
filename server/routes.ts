import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { storage } from "./storage.js";
import {
  leaderboardDifficultySchema,
  leaderboardQualificationSchema,
  leaderboardSubmissionSchema,
  runStartSchema,
} from "../shared/schema.js";
import { consumeNonce, issueRunToken, plausible, rateLimit, verifyRunToken } from "./antiCheat.js";

/** Express 4 does not catch rejected promises; forward them to the error middleware. */
const route = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

const minutes = (n: number) => n * 60 * 1000;

export async function registerRoutes(app: Express): Promise<void> {
  app.get("/api/leaderboard", route(async (_req, res) => {
    const boards = await storage.getAllLeaderboards();
    res.setHeader("Cache-Control", "no-store");
    res.json({ limit: 10, boards });
  }));

  app.get("/api/leaderboard/:difficulty", route(async (req, res) => {
    const parsed = leaderboardDifficultySchema.safeParse(req.params.difficulty);
    if (!parsed.success) return void res.status(400).json({ message: "Invalid difficulty" });
    const scores = await storage.getLeaderboard(parsed.data);
    res.json({ difficulty: parsed.data, limit: 10, scores });
  }));

  app.post("/api/run", rateLimit({ name: "run", windowMs: minutes(10), max: 60 }), route(async (req, res) => {
    const parsed = runStartSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ message: "Invalid difficulty" });
    res.json({ token: issueRunToken(parsed.data.difficulty) });
  }));

  // Single-segment path on purpose: on Vercel, api/[...all].ts only receives one path segment,
  // so /api/leaderboard/qualify 404s before reaching Express. The nested path stays for local dev.
  const qualifyHandler = route(async (req, res) => {
    const parsed = leaderboardQualificationSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ message: "Invalid leaderboard qualification payload" });
    res.json(await storage.qualifiesForLeaderboard(parsed.data));
  });
  const qualifyLimit = rateLimit({ name: "qualify", windowMs: minutes(10), max: 60 });
  app.post("/api/qualify", qualifyLimit, qualifyHandler);
  app.post("/api/leaderboard/qualify", qualifyLimit, qualifyHandler);

  app.post("/api/leaderboard", rateLimit({ name: "submit", windowMs: minutes(10), max: 10 }), route(async (req, res) => {
    const parsed = leaderboardSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid leaderboard submission" });
    }
    const { runToken, kills, level: _level, ...entry } = parsed.data;
    const run = verifyRunToken(runToken, entry.difficulty);
    if (!run.ok) return void res.status(422).json({ message: run.reason });
    const problem = plausible({ score: entry.score, wpm: entry.wpm, kills }, run.elapsedMs);
    if (problem) return void res.status(422).json({ message: `Score rejected: ${problem}` });

    const qualification = await storage.qualifiesForLeaderboard(entry);
    if (!qualification.qualifies) {
      return void res.status(409).json({ message: "Score no longer qualifies for the leaderboard" });
    }
    consumeNonce(run.nonce);
    const created = await storage.createLeaderboardScore(entry);
    const boards = await storage.getAllLeaderboards();
    res.status(201).json({ entry: created, boards, qualification });
  }));
}
