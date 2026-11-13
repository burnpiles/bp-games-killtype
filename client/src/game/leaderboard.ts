import type { Difficulty } from './config';

export interface LeaderboardEntry {
  id: number;
  username: string;
  score: number;
  difficulty: Difficulty;
  wpm: number;
  accuracyPct: number;
  createdAt: number;
}
export type Boards = Record<Difficulty, LeaderboardEntry[]>;
export interface Qualification { qualifies: boolean; rank: number | null; limit: number; totalEntries: number; lowestScore: number | null }

export const emptyBoards = (): Boards => ({ easy: [], normal: [], hard: [], extreme: [] });

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const b = await res.json(); if (b?.message) msg = b.message; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function fetchBoards(): Promise<Boards> {
  const data = await json<{ boards: Boards }>(await fetch('/api/leaderboard'));
  return { ...emptyBoards(), ...data.boards };
}

/** Asks the server for a signed run token so scores can be sanity-checked on submit. */
export async function startRun(difficulty: Difficulty): Promise<string | null> {
  try {
    const data = await json<{ token: string }>(await fetch('/api/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ difficulty }),
    }));
    return data.token;
  } catch {
    return null;
  }
}

export async function qualify(body: { score: number; difficulty: Difficulty; wpm: number; accuracyPct: number }): Promise<Qualification> {
  return json<Qualification>(await fetch('/api/qualify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}

export async function submit(body: {
  username: string; score: number; difficulty: Difficulty; wpm: number; accuracyPct: number;
  runToken: string | null; kills: number; level: number;
}): Promise<{ entry: LeaderboardEntry & { rank: number }; boards: Boards; qualification: Qualification }> {
  return json(await fetch('/api/leaderboard', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}
