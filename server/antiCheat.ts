import crypto from "crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { LeaderboardDifficulty } from "../shared/schema.js";

// ---------- signed run tokens ----------
// The client asks for a token when a run starts. On submit the server checks the
// signature and uses the server-side start time to sanity-check the score.

const secret = (() => {
  const explicit = process.env.LEADERBOARD_SECRET;
  if (explicit) return explicit;
  // Fall back to a key derived from the database URL so no new config is required;
  // it is still server-only. Dev without a DB gets a per-process random key.
  if (process.env.DATABASE_URL) {
    return crypto.createHash("sha256").update("killtype-run:" + process.env.DATABASE_URL).digest("hex");
  }
  return crypto.randomBytes(32).toString("hex");
})();

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => crypto.createHmac("sha256", secret).update(payload).digest("base64url");

export function issueRunToken(difficulty: LeaderboardDifficulty): string {
  const payload = b64(JSON.stringify({ d: difficulty, t: Date.now(), n: crypto.randomBytes(8).toString("hex") }));
  return `${payload}.${sign(payload)}`;
}

const usedNonces = new Map<string, number>();
const MAX_RUN_MS = 6 * 60 * 60 * 1000;

export type RunCheck =
  | { ok: true; elapsedMs: number; nonce: string }
  | { ok: false; reason: string };

export function verifyRunToken(token: string, difficulty: LeaderboardDifficulty): RunCheck {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return { ok: false, reason: "Malformed run token" };
  const expected = sign(payload);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "Invalid run token" };
  let data: { d: string; t: number; n: string };
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return { ok: false, reason: "Malformed run token" }; }
  if (data.d !== difficulty) return { ok: false, reason: "Run token does not match difficulty" };
  const elapsedMs = Date.now() - data.t;
  if (elapsedMs < 0 || elapsedMs > MAX_RUN_MS) return { ok: false, reason: "Run token expired" };
  if (usedNonces.has(data.n)) return { ok: false, reason: "Run already submitted" };
  return { ok: true, elapsedMs, nonce: data.n };
}

export function consumeNonce(nonce: string) {
  const now = Date.now();
  usedNonces.set(nonce, now);
  if (usedNonces.size > 5000) {
    usedNonces.forEach((t, k) => { if (now - t > MAX_RUN_MS) usedNonces.delete(k); });
  }
}

/**
 * Generous upper bounds derived from the scoring formula
 * (100 + 10*len) * victims * combo * difficulty * weapon. Combo grows by one per correct
 * key, so score grows roughly with the square of time. These only reject impossible runs.
 */
export function plausible(entry: { score: number; wpm: number; kills: number }, elapsedMs: number): string | null {
  const s = elapsedMs / 1000;
  if (s < 5 && entry.score > 0) return "Run too short";
  if (entry.wpm > 250) return "WPM out of range";
  const maxChars = s * 22; // ~265 WPM sustained, far above human records
  if (entry.kills > maxChars / 3 * 8 + 10) return "Kill count out of range";
  const maxScore = 200 * 3 * 8 * (maxChars * maxChars) / 2 + 100_000;
  if (entry.score > maxScore) return "Score out of range";
  return null;
}

// ---------- tiny in-memory rate limiter ----------
// Per-instance only (serverless instances don't share memory), but it stops casual spam.
export function rateLimit(opts: { windowMs: number; max: number; name: string }): RequestHandler {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const fwd = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0].trim() || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const list = (hits.get(ip) ?? []).filter(t => now - t < opts.windowMs);
    if (list.length >= opts.max) {
      res.setHeader("Retry-After", Math.ceil(opts.windowMs / 1000));
      res.status(429).json({ message: "Too many requests, slow down" });
      return;
    }
    list.push(now);
    hits.set(ip, list);
    if (hits.size > 10000) hits.clear();
    next();
  };
}
