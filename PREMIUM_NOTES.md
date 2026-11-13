# KillType premium rebuild

This folder is the GitHub code (`burnpiles/bp-games-killtype`, commit 0ba8a0e) plus the
premium rebuild on the local branch `claude/project-thread-boibq6`. Nothing has been pushed.

## Run it

```bash
npm install
PORT=5055 npm run dev        # macOS uses port 5000 for AirPlay, so pick another
```

Open http://localhost:5055. To test on your phone, keep the server running and open
`http://<your-mac-name>.local:5055` on the same Wi-Fi. That is the real mobile test:
the claude.ai preview runs inside a frame, which changes how the keyboard behaves.

Type check the new code: `npm run check:game`.

## What changed

The live game was one 3,600-line React component that re-rendered React state on every
frame. It is now a small engine in `client/src/game/`:

| File | Job |
| --- | --- |
| `engine.ts` | Simulation. Fixed 120 Hz step driven by real frame time, hitstop, slow-mo, boss logic |
| `render.ts` | Canvas renderer. Retina-sharp, cached glow textures, persistent blood/scorch decals, fog, HUD |
| `sprites.ts` | Pixel-art zombies (4 types) and player built at load time, auto outlines |
| `audio.ts` | Synthesized SFX and an adaptive soundtrack that intensifies with combo and boss fights |
| `KillType.tsx` | Menus, pause, game over, leaderboard, keyboard and mobile input |
| `config.ts` | Words, difficulty tuning, weapons (numbers ported from the original) |

Gameplay rules, difficulty tuning, weapons, bosses, chapters and the scoring formula are the
same as the original, so old and new scores are comparable.

### Mobile
- No visible text box. A hidden input receives the phone keyboard.
- The game sizes itself to the *visible* area above the keyboard (visualViewport), so the
  keyboard can no longer cover the playfield. On phones the player stands at the bottom and
  zombies come from the top.
- Closing the keyboard pauses the game and shows "Tap to keep typing".
- Focus happens inside the tap itself, which iOS requires to open the keyboard.

### Game feel
Tracer shot on every letter, freeze-frame on kills, screen kick and shake, shockwaves,
explosions with smoke and embers, score pop-ups, combo tiers (HOT / LETHAL / BRUTAL /
UNSTOPPABLE), boss limbs that explode and stagger the boss, telegraphed boss lasers, a slow-mo
boss death, corpses that decay to bones, and blood that stays on the ground.

### Bugs from the review
- **Pause** now stops the simulation and the WPM clock (WPM only counts unpaused time).
  The game also pauses when the tab is hidden or the window loses focus.
- **Frame-rate independence**: real frame delta with a fixed-step accumulator. Same speed on 60/120/144 Hz.
- **AudioContext** is created and resumed inside the first tap/click, and resumed after tab switches.
- **created_at / score**: now `bigint` in `shared/schema.ts`. See migration below.
- **Leaderboard routes**: every async route is wrapped so errors reach the JSON error handler.
- **Score validation**: the server signs a run token at game start (`POST /api/run`). On
  submit it checks the signature, the difficulty, that the token is unused, and that the score,
  WPM and kills are possible for the elapsed time. Names are limited to letters, numbers, spaces and `. _ -`.
- **Rate limits**: per-IP limits on run start, qualify and submit (in-memory, so per
  serverless instance; good against casual spam, not a determined attacker).

## Before replacing the live site
1. Run `migrations/0001_leaderboard_bigint.sql` against the Neon database (widens two
   columns, keeps all data). Without it, new score inserts can fail.
2. Optional: set `LEADERBOARD_SECRET` in Vercel. If unset, a key derived from `DATABASE_URL` is used.
3. The old 3D/Replit leftovers (`Game.tsx`, `Zombie.tsx`, `WeaponSystem.tsx`, models,
   textures, the old `ZombieTypingGame.tsx` …) are still in the repo, unused. Say the word and
   they can be deleted.
