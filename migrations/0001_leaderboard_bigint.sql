-- KillType: leaderboard columns that overflow int4.
-- created_at stores Date.now() (epoch ms, ~1.7e12) and score can exceed 2^31 with high combos.
-- Safe to run more than once; widening int4 -> bigint keeps every existing value.
ALTER TABLE leaderboard_scores ALTER COLUMN created_at TYPE bigint;
ALTER TABLE leaderboard_scores ALTER COLUMN score TYPE bigint;
