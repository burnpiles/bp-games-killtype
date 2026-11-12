// Game simulation. Pure TypeScript, no React: the loop runs on real frame delta
// with a fixed-step accumulator, so speed is identical at 60/120/144 Hz.

import {
  BOSS_THRESHOLD, DIFFICULTY_CONFIG, DIFFICULTY_PERSONALITY, MAX_LIVES, WEAPONS, WORDS,
  BOSS_SENTENCES, comboTier, COMBO_TIERS, pick,
  type Behavior, type Difficulty, type SpecialWeaponId, type WeaponId,
} from './config';
import { audio } from './audio';
import {
  ARMOR_WORDS, BREAK_WORDS, ENEMIES, SHORT_WORDS, levelInfo,
  type Attack, type EnemyKind, type LevelInfo, type SpriteKey, type WorldId,
} from './worlds';

const STEP = 1 / 120;
let uid = 1;
const nid = () => uid++;
const buzz = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };

export interface Zombie {
  id: number;
  kind: EnemyKind;
  sprite: SpriteKey;
  name: string;
  attack: Attack;
  value: number;
  damage: number;
  flying: boolean;
  x: number; y: number;
  word: string;
  words: string[]; // words still to come after this one (armour)
  progress: number;
  speed: number;
  behavior: Behavior;
  carrier: SpecialWeaponId | null;
  phase: number;
  age: number;
  flash: number;
  pop: number;
  kx: number; ky: number; // knockback velocity
  doomed: boolean;
  deathAt: number;
  deathWeapon: WeaponId;
  tagX: number; tagY: number; tagInit: boolean;
  facing: number;
  stun: number;
  state: 'move' | 'tell' | 'charge' | 'hold';
  stateT: number;
  dirX: number; dirY: number;
  startD: number;
  fireT: number;
  charging: number;
  leash: number | null;
  latched: boolean;
}

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number;
  color: string; kind: 'blood' | 'spark' | 'ember' | 'smoke' | 'gib' | 'shell' | 'glow' | 'debris';
  drag: number; grav: number; rot: number; vr: number;
}

export interface Tracer { x: number; y: number; px: number; py: number; tx: number; ty: number; speed: number; color: string; width: number; hitZid: number; final: boolean; done: boolean; age: number }
export interface Ring { x: number; y: number; r: number; maxR: number; life: number; max: number; color: string; width: number }
export interface Popup { x: number; y: number; text: string; color: string; life: number; max: number; size: number; vy: number }
export interface Corpse { x: number; y: number; rot: number; age: number; max: number; sprite: SpriteKey; flip: boolean; flat: boolean }
export interface Laser { x: number; y: number; vx: number; vy: number; age: number; kind: 'laser' | 'bolt' | 'gas' | 'missile'; owner: number; r: number }
export interface DecalReq { kind: 'blood' | 'scorch' | 'bones' | 'crater'; x: number; y: number; size: number; rot: number }

export type BossPartName = 'head' | 'leftHand' | 'rightHand' | 'leftFoot' | 'rightFoot';
export interface BossPart { part: BossPartName; word: string; progress: number; destroyed: boolean; flash: number; pop: number; tagX: number; tagY: number; tagInit: boolean }
export type BossAttackKind = 'laser' | 'missile' | 'swipe' | 'grab';
export interface BossAttack { kind: BossAttackKind; t: number; tell: number; hand: BossPartName | null; acted: boolean }
export interface Boss {
  active: boolean;
  stage: 'entering' | 'fight' | 'sentence' | 'dying';
  name: string;
  x: number; y: number; baseY: number;
  scale: number;
  parts: BossPart[];
  sentence: string;
  sentenceIndex: number;
  t: number;
  walk: number;
  laserT: number;
  charging: number; // >0 while charging eyes
  attack: BossAttack | null;
  lastAttack: BossAttackKind | null;
  grabCd: number;
  stun: number;
  flash: number;
  dyingT: number;
}
export interface Wreck { x: number; y: number; scale: number; t: number }

export interface Grab {
  zid: number;          // -1 for the boss
  hand: BossPartName | null;
  words: string[];
  index: number;
  progress: number;
  t: number;
  max: number;
  biteT: number;
  dmg: number;
  hadLock: boolean;
}

export interface Layout { w: number; h: number; mode: 'arena' | 'lane'; compact: boolean; topPad: number; bottomPad: number }

export interface RunStats {
  score: number; kills: number; level: number; maxCombo: number; wpm: number; accuracyPct: number;
  difficulty: Difficulty; durationMs: number; correct: number; mistakes: number;
  world: WorldId; levelName: string; worldName: string; escapes: number;
}

export interface LevelSummary {
  level: number; name: string; worldName: string; kills: number; score: number; bonus: number; accuracyPct: number; escapes: number;
}

export type GameEvent =
  | { type: 'gameover'; stats: RunStats }
  | { type: 'pause'; paused: boolean }
  | { type: 'intro'; info: LevelInfo; summary: LevelSummary | null };

export class Game {
  layout: Layout = { w: 800, h: 600, mode: 'arena', compact: false, topPad: 70, bottomPad: 60 };
  difficulty: Difficulty = 'hard';
  world: WorldId = 'mall';
  info: LevelInfo = levelInfo('mall', 1);
  phase: 'intro' | 'play' | 'exit' = 'intro';
  exitT = 0;
  fade = 0;
  groundKey = '';
  running = false;
  paused = false;
  over = false;
  overT = 0;

  time = 0; // sim seconds
  activeTime = 0; // real seconds of unpaused play (for WPM)
  private acc = 0;
  hitstop = 0;
  slowmo = 0;
  timeScale = 1;

  zombies: Zombie[] = [];
  particles: Particle[] = [];
  tracers: Tracer[] = [];
  rings: Ring[] = [];
  popups: Popup[] = [];
  corpses: Corpse[] = [];
  lasers: Laser[] = [];
  decals: DecalReq[] = [];
  decalEpoch = 0;
  wreck: Wreck | null = null;
  grab: Grab | null = null;
  cine = 0;
  biteFlash = 0;

  player = { x: 400, y: 300, aim: -Math.PI / 2, recoil: 0, muzzle: 0, hurt: 0, bob: 0, walk: 0 };
  lockId: number | null = null;
  typed = '';
  typedFlash = 0;
  missFlash = 0;

  score = 0;
  displayScore = 0;
  kills = 0;
  killsTowardsBoss = 0;
  levelTarget = 10;
  correct = 0;
  mistakes = 0;
  totalTyped = 0;
  combo = 0;
  maxCombo = 0;
  comboPulse = 0;
  lastTier = 0;
  lives = MAX_LIVES;
  lifeLostAt = -10;
  level = 1;
  escapes = 0;
  weapon: WeaponId = 'pistol';
  ammo = 0;
  weaponTime = 0;
  weaponPulse = 0;
  lastSpawn = 0;
  chapterUntil = 0;
  bossPendingAt = -1;
  private levelStart = { score: 0, kills: 0, correct: 0, mistakes: 0, escapes: 0 };

  banner: { title: string; sub: string; kicker: string; t: number; dur: number; color: string } | null = null;
  shake = 0; // trauma 0..1
  kick = { x: 0, y: 0 };
  zoom = 0;
  flash = { a: 0, color: '#ffffff' };
  chroma = 0;
  fxScale = 1;

  boss: Boss = this.emptyBoss();

  onEvent: (e: GameEvent) => void = () => {};

  private emptyBoss(): Boss {
    return {
      active: false, stage: 'entering', name: '', x: 0, y: 0, baseY: 0, scale: 1, parts: [], sentence: '', sentenceIndex: 0,
      t: 0, walk: 0, laserT: 0, charging: 0, attack: null, lastAttack: null, grabCd: 0, stun: 0, flash: 0, dyingT: 0,
    };
  }

  get accuracyPct() {
    const t = this.correct + this.mistakes;
    return t > 0 ? Math.round((this.correct / t) * 100) : 100;
  }
  get wpm() {
    const m = this.activeTime / 60;
    return m > 0.05 ? Math.round(this.totalTyped / 5 / m) : 0;
  }
  get tier() { return comboTier(this.combo); }
  get diffMult() { return DIFFICULTY_CONFIG[this.difficulty].scoreMultiplier; }
  get threat() { return DIFFICULTY_CONFIG[this.difficulty].threat; }
  /** World time scale while someone is chewing on you: everything else nearly freezes. */
  get worldSlow() { return this.grab ? 0.12 : 1; }

  // ---------------- layout ----------------
  setLayout(w: number, h: number, compact: boolean) {
    const prev = this.layout;
    const mode: Layout['mode'] = compact || w / h < 1.05 || h < 520 ? 'lane' : 'arena';
    const topPad = compact ? 54 : 80;
    const bottomPad = mode === 'lane' ? (compact ? 64 : 90) : 70;
    this.layout = { w, h, mode, compact, topPad, bottomPad };
    this.fxScale = compact ? 0.6 : 1;
    const walking = this.phase === 'exit';
    const oldY = this.player.y;
    this.placePlayer();
    if (walking) this.player.y = Math.min(this.player.y, oldY);
    if (prev.w > 0 && prev.h > 0 && (prev.w !== w || prev.h !== h)) {
      const sx = w / prev.w, sy = h / prev.h;
      const remap = (o: { x: number; y: number }) => { o.x *= sx; o.y *= sy; };
      this.zombies.forEach(z => { remap(z); z.tagInit = false; });
      this.corpses.forEach(remap);
      this.particles.forEach(remap);
      this.lasers.forEach(remap);
      if (this.wreck) remap(this.wreck);
      if (this.boss.active) {
        this.boss.scale = this.bossScale();
        this.boss.baseY = this.bossTargetY();
        this.boss.y = this.boss.stage === 'entering' ? Math.min(this.boss.y, this.boss.baseY) : this.boss.baseY;
        this.boss.parts.forEach(p => { p.tagInit = false; });
      }
    }
  }

  private placePlayer() {
    const L = this.layout;
    if (L.mode === 'lane') {
      this.player.x = L.w / 2;
      this.player.y = L.h - L.bottomPad - (L.compact ? 6 : 20);
    } else {
      this.player.x = L.w / 2;
      this.player.y = L.h / 2 + 30;
    }
  }

  get speedScale() {
    const L = this.layout;
    const dist = L.mode === 'lane' ? (this.player.y - L.topPad) : (Math.min(L.w, L.h) / 2 + Math.max(L.w, L.h) / 2) / 2;
    return Math.max(0.72, Math.min(2.2, dist / 340));
  }

  get uiScale() { return this.layout.compact ? 0.82 : 1; }

  // ---------------- lifecycle ----------------
  start(difficulty: Difficulty, world: WorldId) {
    this.difficulty = difficulty;
    this.world = world;
    this.running = true;
    this.paused = false;
    this.over = false;
    this.overT = 0;
    this.time = 0; this.activeTime = 0; this.acc = 0;
    this.hitstop = 0; this.slowmo = 0; this.timeScale = 1;
    this.score = 0; this.displayScore = 0; this.kills = 0;
    this.correct = 0; this.mistakes = 0; this.totalTyped = 0; this.escapes = 0;
    this.combo = 0; this.maxCombo = 0; this.lastTier = 0;
    this.lives = MAX_LIVES; this.level = 1; this.lifeLostAt = -10;
    this.weapon = 'pistol'; this.ammo = 0; this.weaponTime = 0;
    this.shake = 0; this.flash.a = 0; this.chroma = 0;
    this.prepareLevel();
    this.onEvent({ type: 'intro', info: this.info, summary: null });
  }

  /** Sets up the arena for `this.level` and waits on the story card. */
  private prepareLevel() {
    this.info = levelInfo(this.world, this.level);
    this.phase = 'intro';
    this.fade = 1;
    this.zombies = []; this.particles = []; this.tracers = []; this.rings = [];
    this.popups = []; this.corpses = []; this.lasers = []; this.decals = []; this.decalEpoch++;
    this.wreck = null; this.grab = null; this.cine = 0;
    this.lockId = null; this.typed = '';
    this.boss = this.emptyBoss();
    this.bossPendingAt = -1;
    this.banner = null;
    this.killsTowardsBoss = 0;
    const base = BOSS_THRESHOLD[this.difficulty];
    this.levelTarget = Math.round(base * (0.7 + 0.07 * (this.info.levelInWorld - 1)) * (1 + this.info.loop * 0.2));
    this.groundKey = `${this.info.world.id}:${this.info.levelInWorld}:${this.info.def.ground}`;
    this.placePlayer();
    this.player.aim = -Math.PI / 2;
    this.levelStart = { score: this.score, kills: this.kills, correct: this.correct, mistakes: this.mistakes, escapes: this.escapes };
  }

  /** Called when the player dismisses the story card. */
  beginLevel() {
    if (!this.running || this.phase !== 'intro') return;
    this.phase = 'play';
    this.lastSpawn = this.time - 1.2;
    this.chapterUntil = this.time + 1.6;
    const I = this.info;
    this.showBanner(`LEVEL ${I.levelInWorld}`, I.def.name.toUpperCase(), I.world.name + (I.loop ? ` · LOOP ${I.loop + 1}` : ''), 2.4, I.world.color);
    audio.chapter();
    audio.setIntensity(1, false);
  }

  stop() {
    this.running = false;
    this.over = false;
    this.paused = false;
    this.phase = 'intro';
    this.zombies = []; this.particles = []; this.tracers = []; this.rings = [];
    this.popups = []; this.corpses = []; this.lasers = []; this.banner = null;
    this.boss = this.emptyBoss();
    this.wreck = null; this.grab = null; this.cine = 0; this.fade = 0; this.groundKey = '';
    this.shake = 0; this.kick.x = 0; this.kick.y = 0; this.zoom = 0;
    this.flash.a = 0; this.chroma = 0; this.player.hurt = 0; this.biteFlash = 0;
    this.hitstop = 0; this.slowmo = 0; this.timeScale = 1;
  }

  setPaused(p: boolean) {
    if (!this.running || this.over || this.paused === p) return;
    if (p && this.phase === 'intro') return;
    this.paused = p;
    this.onEvent({ type: 'pause', paused: p });
  }

  /** Camera + screen fx decay on real time (so hitstop still "hits"), and keeps decaying after game over so menus never jitter. */
  private decayFx(realDt: number) {
    this.shake = Math.max(0, this.shake - realDt * 1.6);
    this.kick.x *= Math.pow(0.0005, realDt);
    this.kick.y *= Math.pow(0.0005, realDt);
    this.zoom *= Math.pow(0.002, realDt);
    this.flash.a = Math.max(0, this.flash.a - realDt * 3.2);
    this.chroma = Math.max(0, this.chroma - realDt * 2.5);
    this.comboPulse = Math.max(0, this.comboPulse - realDt * 4);
    this.typedFlash = Math.max(0, this.typedFlash - realDt * 5);
    this.missFlash = Math.max(0, this.missFlash - realDt * 4);
    this.weaponPulse = Math.max(0, this.weaponPulse - realDt * 2);
    this.player.recoil = Math.max(0, this.player.recoil - realDt * 9);
    this.player.muzzle = Math.max(0, this.player.muzzle - realDt * 14);
    this.player.hurt = Math.max(0, this.player.hurt - realDt * 1.8);
    this.biteFlash = Math.max(0, this.biteFlash - realDt * 3);
    const ct = this.grab && !this.over ? 1 : 0;
    this.cine += (ct - this.cine) * Math.min(1, realDt * (ct ? 7 : 4));
    if (Math.abs(this.cine - ct) < 0.002) this.cine = ct;
    if (this.phase === 'play' && this.fade > 0) this.fade = Math.max(0, this.fade - realDt * 1.6);
  }

  // ---------------- main tick ----------------
  update(realDt: number) {
    realDt = Math.min(realDt, 0.1);
    this.displayScore += (this.score - this.displayScore) * Math.min(1, realDt * 12);
    if (Math.abs(this.score - this.displayScore) < 1) this.displayScore = this.score;
    if (!this.paused) this.decayFx(realDt);
    if (!this.running || this.paused) return;
    if (this.phase === 'intro') return;

    if (this.over) {
      this.overT += realDt;
      this.timeScale = 0.25;
      this.stepVisual(realDt * 0.25);
      if (this.overT > 1.4 && this.running) {
        this.running = false;
        this.onEvent({ type: 'gameover', stats: this.stats() });
      }
      return;
    }

    if (this.phase === 'play') this.activeTime += realDt;
    let scale = 1;
    if (this.hitstop > 0) { this.hitstop -= realDt; scale = 0.06; }
    else if (this.slowmo > 0) { this.slowmo -= realDt; scale = 0.3; }
    this.timeScale += (scale - this.timeScale) * Math.min(1, realDt * 30);
    const simDt = realDt * this.timeScale;

    this.acc += simDt;
    let steps = 0;
    while (this.acc >= STEP && steps < 24) {
      this.fixedStep(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps >= 24) this.acc = 0;
    this.stepVisual(simDt);

    if (this.phase === 'exit') this.updateExit(realDt);

    const intensity = this.boss.active || this.grab ? 3 : this.tier >= 3 ? 3 : this.tier >= 1 ? 2 : 1;
    if (audio.intensity !== intensity || audio.boss !== this.boss.active) audio.setIntensity(intensity, this.boss.active);
  }

  private updateExit(dt: number) {
    this.exitT += dt;
    const P = this.player;
    if (this.exitT > 0.9) {
      P.y -= dt * 150 * this.uiScale;
      P.walk += dt;
      P.aim = -Math.PI / 2;
    }
    this.fade = Math.max(0, Math.min(1, (this.exitT - 1.6) / 0.9));
    if (this.exitT > 2.6) {
      const summary: LevelSummary = {
        level: this.info.levelInWorld, name: this.info.def.name, worldName: this.info.world.name,
        kills: this.kills - this.levelStart.kills, score: this.score - this.levelStart.score,
        bonus: this.lastBonus, escapes: this.escapes - this.levelStart.escapes,
        accuracyPct: (() => { const c = this.correct - this.levelStart.correct, m = this.mistakes - this.levelStart.mistakes; return c + m > 0 ? Math.round(c / (c + m) * 100) : 100; })(),
      };
      this.level++;
      this.prepareLevel();
      this.onEvent({ type: 'intro', info: this.info, summary });
    }
  }
  private lastBonus = 0;

  private fixedStep(dt: number) {
    this.time += dt;
    const L = this.layout;
    const cfg = DIFFICULTY_CONFIG[this.difficulty];
    const wdt = dt * this.worldSlow;

    if (this.banner && this.time > this.banner.t + this.banner.dur) this.banner = null;

    if (this.weaponTime > 0 && !this.grab) {
      this.weaponTime -= dt * 1000;
      if (this.weaponTime <= 0) { this.weapon = 'pistol'; this.ammo = 0; this.weaponTime = 0; }
    }

    // spawning
    const n = this.level;
    const spawnRate = Math.max(cfg.spawnRate - (n - 1) * 90, 650) / 1000;
    const maxZ = cfg.maxZombies + Math.min(6, Math.floor((n - 1) / 2)) - (L.compact ? 1 : 0);
    const alive = this.zombies.filter(z => !z.doomed).length;
    if (this.bossPendingAt >= 0 && this.time >= this.bossPendingAt) { this.bossPendingAt = -1; this.spawnBoss(); }
    if (this.phase === 'play' && !this.grab && !this.boss.active && this.bossPendingAt < 0 && this.time >= this.chapterUntil
      && this.time - this.lastSpawn > spawnRate && alive < maxZ) {
      this.spawnZombie();
      this.lastSpawn = this.time;
    }

    this.updateGrab(dt);
    this.updateZombies(dt, wdt);

    // deaths whose shot has landed
    for (const z of this.zombies) if (z.doomed && this.time >= z.deathAt) this.killFx(z);
    const before = this.zombies.length;
    this.zombies = this.zombies.filter(z => !(z.doomed && this.time >= z.deathAt));
    if (before !== this.zombies.length) {
      // projectiles from dead shooters fizzle
      const ids = new Set(this.zombies.map(z => z.id));
      this.lasers = this.lasers.filter(l => {
        if (l.owner > 0 && !ids.has(l.owner)) { this.burst(l.x, l.y, 'spark', 4, l.kind === 'gas' ? '#b04dff' : '#ff9a3d', 120); return false; }
        return true;
      });
    }

    if (this.lockId !== null && !this.zombies.some(z => z.id === this.lockId && !z.doomed)) {
      if (!this.boss.active) { this.lockId = null; if (!this.grab) this.typed = ''; }
    }

    this.updateBoss(dt, wdt);
    this.updateProjectiles(wdt);

    for (const c of this.corpses) {
      c.age += dt;
      if (c.age >= c.max && !c.flat) this.decals.push({ kind: 'bones', x: c.x, y: c.y, size: 1, rot: c.rot });
    }
    this.corpses = this.corpses.filter(c => c.age < c.max);
    if (this.wreck) this.wreck.t += dt;

    // aim
    const P = this.player;
    const tgt = this.aimTarget();
    if (tgt && this.phase !== 'exit') {
      const want = Math.atan2(tgt.y - P.y, tgt.x - P.x);
      let diff = want - P.aim;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      P.aim += diff * Math.min(1, dt * 18);
    }
    P.bob += dt;
  }

  private contactDist(z: Zombie) {
    const k = z.kind === 'brute' ? 1.45 : z.kind === 'car' ? 1.7 : z.kind === 'horse' ? 1.35 : z.kind === 'gator' ? 1.3 : 1;
    return (38 * this.uiScale + 4) * k;
  }

  private updateZombies(dt: number, wdt: number) {
    const ss = this.speedScale;
    const P = this.player;
    const L = this.layout;
    const T = this.threat;
    for (const z of this.zombies) {
      const zdt = z.latched ? dt : wdt;
      z.age += zdt;
      z.phase += zdt;
      z.flash = Math.max(0, z.flash - dt * 8);
      z.pop = Math.max(0, z.pop - dt * 7);
      z.x += z.kx * zdt; z.y += z.ky * zdt;
      const kd = Math.pow(0.001, zdt);
      z.kx *= kd; z.ky *= kd;
      if (z.doomed) continue;
      if (z.latched) {
        // pinned to the player during a grab, gnawing
        const g = this.grab;
        const a = Math.atan2(z.y - P.y, z.x - P.x);
        const r = this.contactDist(z) * 0.55;
        z.x += (P.x + Math.cos(a) * r - z.x) * Math.min(1, dt * 14);
        z.y += (P.y + Math.sin(a) * r - z.y) * Math.min(1, dt * 14);
        z.facing = P.x > z.x ? 1 : -1;
        if (g) z.phase += dt * 2;
        continue;
      }
      if (z.stun > 0) { z.stun -= zdt; continue; }
      z.stateT += zdt;

      const dx = P.x - z.x, dy = P.y - z.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      let sp = z.speed * ss * Math.min(1, 0.35 + z.age * 0.9);
      let vx = ux * sp, vy = uy * sp;

      switch (z.kind) {
        case 'runner':
          if ((z.phase % 2) < 0.33) { vx *= 1.6; vy *= 1.6; }
          break;
        case 'twitcher': {
          const osc = Math.sin(z.phase * 12) * 36 * ss;
          vx += -uy * osc; vy += ux * osc;
          break;
        }
        case 'dog': {
          const owner = z.leash !== null ? this.zombies.find(o => o.id === z.leash && !o.doomed) : undefined;
          if (owner && Math.hypot(owner.x - P.x, owner.y - P.y) > 170 * this.uiScale) {
            const tx = owner.x - owner.facing * 24 * this.uiScale, ty = owner.y + 10;
            const ox = tx - z.x, oy = ty - z.y, od = Math.hypot(ox, oy) || 1;
            const fsp = Math.min(od * 4, owner.speed * ss * 1.6);
            vx = ox / od * fsp; vy = oy / od * fsp;
          } else {
            if (z.leash !== null) { z.leash = null; audio.bark(); this.popupAt(z.x, z.y - 30, 'OFF THE LEASH', '#ffb340', 13, 0.9); }
            const hop = 1 + Math.pow(Math.sin(z.phase * 9), 2) * 0.6;
            vx *= hop; vy *= hop;
          }
          break;
        }
        case 'bird': {
          const osc = Math.sin(z.phase * 3.2) * 70 * ss;
          vx += -uy * osc; vy += ux * osc;
          break;
        }
        case 'gator':
          if (d < 200 * this.uiScale) { vx *= 3.4; vy *= 3.4; z.state = 'charge'; }
          break;
        case 'horse':
          if (z.state === 'move' && (d < z.startD * 0.62 || z.stateT > 2.4)) {
            z.state = 'tell'; z.stateT = 0; audio.enemyCharge();
          }
          if (z.state === 'tell') {
            vx = vy = 0;
            if (z.stateT > 0.85 - T * 0.05) { z.state = 'charge'; z.stateT = 0; z.dirX = ux; z.dirY = uy; audio.stomp(); }
          } else if (z.state === 'charge') {
            const cs = (150 + T * 18) * ss;
            vx = z.dirX * cs; vy = z.dirY * cs;
          }
          break;
        case 'cart': {
          // rolls on a heading that only slowly bends toward you
          const turn = Math.min(1, zdt * 0.7);
          z.dirX += (ux - z.dirX) * turn; z.dirY += (uy - z.dirY) * turn;
          const m = Math.hypot(z.dirX, z.dirY) || 1;
          vx = z.dirX / m * sp; vy = z.dirY / m * sp;
          break;
        }
        case 'car':
          if (z.state === 'tell') {
            vx = ux * 22 * ss; vy = uy * 22 * ss;
            if (z.stateT > 1.5 - T * 0.12) { z.state = 'charge'; z.stateT = 0; z.dirX = ux; z.dirY = uy; audio.engine(); }
          } else {
            vx = z.dirX * sp; vy = z.dirY * sp;
          }
          break;
        case 'robot':
        case 'sprayer': {
          const stand = L.mode === 'lane' ? (P.y - L.topPad) * 0.55 : Math.min(L.w, L.h) * 0.36;
          if (z.state === 'move' && d < stand) { z.state = 'hold'; z.stateT = 0; z.fireT = 0.4; }
          if (z.state === 'hold') {
            const strafe = Math.sin(z.phase * 0.8) * 26 * ss;
            vx = -uy * strafe + ux * (d > stand * 1.15 ? sp * 0.6 : 0);
            vy = ux * strafe + uy * (d > stand * 1.15 ? sp * 0.6 : 0);
            this.updateShooter(z, zdt, ux, uy);
          }
          break;
        }
        default: break;
      }
      z.x += vx * zdt; z.y += vy * zdt;
      if (Math.abs(vx) > 1) z.facing = vx < 0 ? -1 : 1;
      if (d < this.contactDist(z)) this.contact(z);
    }
    // soft separation to keep sprites readable (fliers pass over)
    for (let i = 0; i < this.zombies.length; i++) {
      const a = this.zombies[i];
      if (a.doomed || a.flying || a.latched) continue;
      for (let j = i + 1; j < this.zombies.length; j++) {
        const b = this.zombies[j];
        if (b.doomed || b.flying || b.latched || b.leash === a.id || a.leash === b.id) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = 34 * this.uiScale;
        if (d2 < min * min && d2 > 0.01) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5 * wdt * 8;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
        }
      }
    }
  }

  private updateShooter(z: Zombie, dt: number, ux: number, uy: number) {
    const robot = z.kind === 'robot';
    const interval = (robot ? 2.9 : 3.8) * (1.18 - this.threat * 0.08);
    if (z.charging > 0) {
      z.charging -= dt;
      if (z.charging <= 0) {
        const sp = (robot ? 300 : 120) * this.speedScale;
        const sx = z.x + ux * 14, sy = z.y - 10;
        this.lasers.push({ x: sx, y: sy, vx: ux * sp, vy: uy * sp, age: 0, kind: robot ? 'bolt' : 'gas', owner: z.id, r: robot ? 10 : 22 });
        audio.enemyShot();
        z.fireT = 0;
      }
      return;
    }
    z.fireT += dt;
    if (z.fireT > interval) { z.charging = robot ? 0.6 : 0.7; audio.enemyCharge(); }
  }

  private updateProjectiles(wdt: number) {
    const P = this.player;
    const L = this.layout;
    for (const l of this.lasers) {
      l.age += wdt;
      if (l.kind === 'missile') {
        // homing with limited turn rate, plus a little wobble
        const dx = P.x - l.x, dy = P.y - l.y, d = Math.hypot(dx, dy) || 1;
        const sp = Math.hypot(l.vx, l.vy) || 1;
        const want = (170 + this.threat * 16) * this.speedScale * Math.min(1, 0.4 + l.age);
        const turn = Math.min(1, wdt * 3);
        l.vx += ((dx / d) * want - l.vx) * turn;
        l.vy += ((dy / d) * want - l.vy) * turn;
        const k = want / (Math.hypot(l.vx, l.vy) || sp);
        l.vx *= k; l.vy *= k;
        if (Math.random() < 0.6) this.particles.push({ x: l.x, y: l.y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0.5, max: 0.5, size: 8 + Math.random() * 6, color: '#222', kind: 'smoke', drag: 0.3, grav: -10, rot: 0, vr: 0 });
      }
      l.x += l.vx * wdt; l.y += l.vy * wdt;
      if (!this.grab && Math.hypot(P.x - l.x, P.y - l.y) < 14 + l.r) {
        l.age = 999;
        if (l.kind === 'missile') this.explode(l.x, l.y, 1, '#ff6a2a');
        if (l.kind === 'gas') this.burst(l.x, l.y, 'glow', 1, '#b04dff', 0, 40);
        this.loseLife(l.x, l.y);
      }
    }
    this.lasers = this.lasers.filter(l => l.age < 8 && l.x > -80 && l.x < L.w + 80 && l.y > -80 && l.y < L.h + 80);
  }

  private stepVisual(dt: number) {
    const drag = (k: number) => Math.pow(k, dt);
    for (const p of this.particles) {
      p.life -= dt;
      const d = drag(p.drag);
      p.vx *= d; p.vy *= d;
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.life <= 0 && (p.kind === 'blood' || p.kind === 'gib') && Math.random() < 0.35) {
        this.decals.push({ kind: 'blood', x: p.x, y: p.y, size: p.size * 0.7, rot: Math.random() * 6 });
      }
    }
    this.particles = this.particles.filter(p => p.life > 0);
    const cap = this.layout.compact ? 420 : 900;
    if (this.particles.length > cap) this.particles.splice(0, this.particles.length - cap);

    for (const t of this.tracers) {
      t.age += dt;
      t.px = t.x; t.py = t.y;
      const dx = t.tx - t.x, dy = t.ty - t.y;
      const d = Math.hypot(dx, dy);
      const step = t.speed * dt;
      if (d <= step || d < 1) {
        t.x = t.tx; t.y = t.ty; t.done = true;
        const z = this.zombies.find(q => q.id === t.hitZid);
        if (z && !z.latched) { z.flash = 1; z.kx += dx / (d || 1) * (t.final ? 160 : 70); z.ky += dy / (d || 1) * (t.final ? 160 : 70); }
        this.burst(t.tx, t.ty, 'spark', t.final ? 10 : 4, t.color, 260);
      } else {
        t.x += dx / d * step; t.y += dy / d * step;
      }
    }
    this.tracers = this.tracers.filter(t => !t.done || t.age < 0.05);
    for (const t of this.tracers) if (t.done) t.age += dt;

    for (const r of this.rings) { r.life -= dt; r.r += (r.maxR - r.r) * Math.min(1, dt * 9); }
    this.rings = this.rings.filter(r => r.life > 0);
    for (const p of this.popups) { p.life -= dt; p.y += p.vy * dt; p.vy *= Math.pow(0.05, dt); }
    this.popups = this.popups.filter(p => p.life > 0);
  }

  // ---------------- spawning ----------------
  private pickWord(pool: string[]): string {
    const live = this.zombies.filter(z => !z.doomed);
    const used = new Set(live.map(z => z.word[0]));
    if (this.grab) this.grab.words.forEach(w => used.add(w[0]));
    const fresh = pool.filter(w => !used.has(w[0]) && !live.some(z => z.word === w || z.words.includes(w)));
    return pick(fresh.length ? fresh : pool);
  }

  private wordFor(size: 'short' | 'normal' | 'long'): string {
    const pool = WORDS[this.difficulty];
    if (size === 'short') {
      const lim = this.difficulty === 'extreme' ? 7 : this.difficulty === 'hard' ? 6 : 5;
      return this.pickWord(SHORT_WORDS.filter(w => w.length <= lim));
    }
    if (size === 'long') {
      const longs = pool.filter(w => w.length >= 7);
      return this.pickWord(longs.length ? longs : pool);
    }
    return this.pickWord(pool);
  }

  private pickKind(): EnemyKind {
    const roster = this.info.def.roster;
    const entries = Object.entries(roster) as Array<[EnemyKind, number]>;
    // Brutes are mini-bosses: at most one alive at a time.
    const filtered = entries.filter(([k]) => !(k === 'brute' && this.zombies.some(z => z.kind === 'brute' && !z.doomed)));
    const total = filtered.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of filtered) { r -= w; if (r <= 0) return k; }
    return filtered[0]?.[0] ?? 'walker';
  }

  private spawnPos(kind: EnemyKind): { x: number; y: number } {
    const L = this.layout;
    const sideBias = kind === 'car' || kind === 'cart' || kind === 'horse';
    if (L.mode === 'lane') {
      const r = Math.random();
      if (!sideBias && r < 0.7) return { x: 30 + Math.random() * (L.w - 60), y: L.topPad - 12 };
      const left = Math.random() < 0.5;
      return { x: left ? -24 : L.w + 24, y: L.topPad + Math.random() * (this.player.y - L.topPad) * (sideBias ? 0.35 : 0.45) };
    }
    const m = 36;
    const side = sideBias ? (Math.random() < 0.5 ? 1 : 3) : Math.floor(Math.random() * 4);
    if (side === 0) return { x: Math.random() * L.w, y: -m };
    if (side === 1) return { x: L.w + m, y: L.topPad + Math.random() * (L.h - L.topPad - L.bottomPad) };
    if (side === 2) return { x: Math.random() * L.w, y: L.h + m };
    return { x: -m, y: L.topPad + Math.random() * (L.h - L.topPad - L.bottomPad) };
  }

  private spawnZombie(kindArg?: EnemyKind, at?: { x: number; y: number }, leash: number | null = null): Zombie {
    const prof = DIFFICULTY_PERSONALITY[this.difficulty];
    const kind = kindArg ?? this.pickKind();
    const def = ENEMIES[kind];
    const skin = this.info.world.skins[kind];
    const pos = at ?? this.spawnPos(kind);
    const n = Math.min(this.level - 1, 14);
    let speed = (15 + n * 2.6 + prof.speedBonus + (Math.random() * 6 - 3)) * def.speed * (1 + this.info.loop * 0.15);
    const behavior: Behavior = kind === 'runner' ? 'sprinter' : kind === 'twitcher' ? 'zigzag' : 'normal';
    if (behavior === 'sprinter') speed += 4;
    if (behavior === 'zigzag') speed += 2;
    const dropChance = Math.min(prof.specialDropBase + this.level * 0.015, 0.4);
    const canCarry = kind === 'walker' || kind === 'runner' || kind === 'twitcher' || kind === 'karen' || kind === 'guard';
    const carrier = canCarry && Math.random() < dropChance ? pick(prof.weaponPool) : null;
    const words: string[] = [];
    let word: string;
    if (def.words > 1) {
      word = this.pickWord(ARMOR_WORDS);
      words.push(this.wordFor(def.size));
    } else word = this.wordFor(def.size);
    const P = this.player;
    const z: Zombie = {
      id: nid(), kind, sprite: carrier && (kind === 'walker' || kind === 'runner' || kind === 'twitcher') ? 'carrier' : skin.sprite, name: skin.name, attack: def.attack, value: def.value, damage: def.damage,
      flying: !!def.flying, x: pos.x, y: pos.y, word, words, progress: 0, speed, behavior, carrier,
      phase: Math.random() * 10, age: 0, flash: 0, pop: 0, kx: 0, ky: 0,
      doomed: false, deathAt: 0, deathWeapon: 'pistol', tagX: 0, tagY: 0, tagInit: false, facing: P.x > pos.x ? 1 : -1,
      stun: 0, state: kind === 'car' ? 'tell' : 'move', stateT: 0, dirX: 0, dirY: 0,
      startD: Math.hypot(P.x - pos.x, P.y - pos.y), fireT: 0, charging: 0, leash, latched: false,
    };
    const d = z.startD || 1;
    z.dirX = (P.x - pos.x) / d; z.dirY = (P.y - pos.y) / d;
    this.zombies.push(z);
    if (kind === 'karen' && leash === null) {
      this.spawnZombie('dog', { x: pos.x - z.facing * 24, y: pos.y + 10 }, z.id);
    }
    if (kind === 'brute') this.popupAt(this.layout.w / 2, this.layout.topPad + 60, `${skin.name.toUpperCase()} INCOMING`, '#ff9a3d', 16, 1.4);
    if (kind === 'dog' && Math.random() < 0.5) audio.bark();
    return z;
  }

  // ---------------- input ----------------
  type(raw: string) {
    if (!this.running || this.paused || this.over || this.phase !== 'play') return;
    const ch = raw.toLowerCase();
    if (!/^[a-z]$/.test(ch)) return;
    if (this.grab) { this.typeGrab(ch); return; }
    if (this.boss.active && this.boss.stage !== 'dying') { this.typeBoss(ch); return; }
    if (this.boss.active) return;

    const lock = this.lockId !== null ? this.zombies.find(z => z.id === this.lockId && !z.doomed) : undefined;
    if (!lock) {
      this.lockId = null;
      const starters = this.zombies.filter(z => !z.doomed && z.word[0] === ch);
      if (!starters.length) { this.mistake(); return; }
      const special = starters.filter(z => z.carrier);
      const pool = special.length ? special : starters;
      const P = this.player;
      const target = pool.reduce((a, b) => (Math.hypot(a.x - P.x, a.y - P.y) <= Math.hypot(b.x - P.x, b.y - P.y) ? a : b));
      this.lockId = target.id;
      target.progress = 0;
      this.typed = '';
      this.hitLetter(target, ch);
      return;
    }
    if (lock.word[lock.progress] !== ch) { this.mistake(); return; }
    this.hitLetter(lock, ch);
  }

  /** Drop the current lock (Backspace). */
  release() {
    if (!this.running || this.paused || this.boss.active || this.grab) return;
    const lock = this.zombies.find(z => z.id === this.lockId);
    if (lock) lock.progress = 0;
    this.lockId = null;
    this.typed = '';
  }

  private registerCorrect() {
    this.correct++;
    this.totalTyped++;
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.typedFlash = 1;
    const t = this.tier;
    if (t > this.lastTier) {
      this.comboPulse = 1;
      audio.comboTier(t);
    }
    this.lastTier = t;
  }

  private mistake() {
    if (this.combo >= 10) { audio.comboLost(); this.popupAt(this.layout.w / 2, this.layout.topPad + 70, 'COMBO LOST', '#8aa0b8', 16, 0.9); }
    this.combo = 0;
    this.lastTier = 0;
    this.mistakes++;
    this.missFlash = 1;
    this.shake = Math.min(1, this.shake + 0.18);
    audio.miss();
  }

  private hitLetter(z: Zombie, ch: string) {
    z.progress++;
    z.pop = 1;
    this.typed += ch;
    this.registerCorrect();
    audio.key(z.progress);
    const done = z.progress >= z.word.length;
    this.fireTracer(z.x, z.y - (z.flying ? 26 : 10) * this.uiScale, z.id, done);
    if (done) this.completeWord(z);
  }

  private fireTracer(tx: number, ty: number, zid: number, final: boolean) {
    const P = this.player;
    const W = WEAPONS[this.weapon];
    const mx = P.x + Math.cos(P.aim) * 22 * this.uiScale, my = P.y - 8 + Math.sin(P.aim) * 22 * this.uiScale;
    this.tracers.push({
      x: mx, y: my, px: mx, py: my, tx, ty,
      speed: final ? 3200 : 2600, color: final ? W.color : '#bff8ff',
      width: final ? (W.explosive ? 5 : 3) : 1.6, hitZid: zid, final, done: false, age: 0,
    });
    P.recoil = final ? 1 : 0.35;
    P.muzzle = final ? 1 : 0.5;
    if (!final) audio.tracer();
  }

  /** Breaks one layer of armour: the enemy lives on with its next word. */
  private stripArmor(z: Zombie) {
    z.word = z.words.shift()!;
    z.progress = 0;
    z.flash = 1;
    const P = this.player;
    const a = Math.atan2(z.y - P.y, z.x - P.x);
    z.kx += Math.cos(a) * 160; z.ky += Math.sin(a) * 160;
    this.burst(z.x, z.y - 10, 'spark', 16, '#c8d4e6', 320);
    for (let i = 0; i < 8 * this.fxScale; i++) {
      const b = a + (Math.random() - 0.5) * 2;
      const s = 120 + Math.random() * 200;
      this.particles.push({ x: z.x, y: z.y - 10, vx: Math.cos(b) * s, vy: Math.sin(b) * s, life: 0.6, max: 0.6, size: 3 + Math.random() * 3, color: '#5a6478', kind: 'debris', drag: 0.04, grav: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16 });
    }
    audio.armorBreak();
    this.popupAt(z.x, z.y - 48 * this.uiScale, 'ARMOR BROKEN', '#c8d4e6', 14, 0.9);
  }

  private completeWord(z: Zombie) {
    const W = WEAPONS[this.weapon];
    const weaponUsed = this.weapon;
    const P = this.player;

    // Armoured target, normal gun: knock the armour off and stay locked.
    if (z.words.length && !W.explosive && !W.wipeField) {
      this.stripArmor(z);
      audio.shot(weaponUsed);
      this.shake = Math.min(1, this.shake + 0.15);
      const gained = Math.round((50 + z.word.length * 5) * Math.max(1, this.combo) * this.diffMult);
      this.score += gained;
      this.typed = '';
      this.hitstop = 0.05;
      return;
    }

    const travel = Math.hypot(z.x - P.x, z.y - P.y) / 3200;
    let victims: Zombie[] = [z];
    if (W.wipeField) victims.push(...this.zombies.filter(q => q !== z && !q.doomed));
    else if (W.splashRadius > 0) {
      victims.push(...this.zombies
        .filter(q => q !== z && !q.doomed)
        .map(q => ({ q, d: Math.hypot(q.x - z.x, q.y - z.y) }))
        .filter(e => e.d <= W.splashRadius * this.uiScale)
        .sort((a, b) => (Number(!!b.q.carrier) - Number(!!a.q.carrier)) || a.d - b.d)
        .slice(0, W.maxCollateral)
        .map(e => e.q));
    }
    // non-explosive collateral only strips armour
    if (!W.explosive && !W.wipeField) {
      victims = victims.filter(v => {
        if (v !== z && v.words.length) { this.stripArmor(v); return false; }
        return true;
      });
    }
    if (W.clearProjectiles) this.lasers = [];

    victims.forEach((v, i) => {
      v.doomed = true;
      v.deathWeapon = weaponUsed;
      v.deathAt = this.time + travel + (i === 0 ? 0 : 0.04 + i * 0.035);
      if (i > 0) v.flash = 1;
    });

    audio.shot(weaponUsed);
    this.shake = Math.min(1, this.shake + 0.22 + W.damage * 0.06);
    const ang = Math.atan2(z.y - P.y, z.x - P.x);
    this.kick.x -= Math.cos(ang) * (4 + W.damage * 2);
    this.kick.y -= Math.sin(ang) * (4 + W.damage * 2);
    this.shells(2);

    const carrier = victims.find(v => v.carrier)?.carrier ?? null;
    if (this.ammo > 0) {
      this.ammo--;
      if (this.ammo <= 0 && this.weaponTime <= 0) this.weapon = 'pistol';
    }
    if (carrier) {
      const def = WEAPONS[carrier];
      this.weapon = carrier;
      this.ammo = def.ammo;
      this.weaponTime = def.duration;
      this.weaponPulse = 1;
      audio.pickup(carrier);
      this.popupAt(P.x, P.y - 54 * this.uiScale, def.name, def.color, 18, 1.4);
    }

    // scoring: the original formula, with each victim weighted by how dangerous it is
    const value = victims.reduce((s, v) => s + v.value, 0);
    const weaponMult = this.weapon === 'pistol' ? 1 : 1.5;
    const gained = Math.round((100 + z.word.length * 10) * value * this.combo * this.diffMult * weaponMult);
    this.score += gained;
    const n = victims.length;
    this.kills += n;
    this.killsTowardsBoss += n;
    this.popupAt(z.x, z.y - 40 * this.uiScale, `+${gained.toLocaleString()}`, COMBO_TIERS[this.tier].color, n > 1 ? 22 : 17, 1);
    if (n > 2) this.popupAt(z.x, z.y - 64 * this.uiScale, `${n}x MULTI`, '#ffffff', 15, 1.1);

    this.hitstop = Math.min(0.12, 0.045 + (n - 1) * 0.02 + (W.explosive ? 0.03 : 0));
    this.lockId = null;
    this.typed = '';

    if (!this.boss.active && this.bossPendingAt < 0 && this.killsTowardsBoss >= this.levelTarget) {
      this.bossPendingAt = this.time + 0.35;
    }
  }

  private killFx(z: Zombie) {
    const W = WEAPONS[z.deathWeapon];
    const f = this.fxScale;
    audio.kill(1);
    const mech = z.kind === 'robot' || z.kind === 'cart' || z.kind === 'car';
    const cy = z.y - (z.flying ? 26 : 8);
    if (W.explosive || mech) {
      const big = z.deathWeapon === 'nuke' ? 3 : z.deathWeapon === 'bazooka' ? 2 : z.kind === 'car' ? 1.6 : 1;
      this.explode(z.x, cy, big, mech && !W.explosive ? '#ff9a3d' : W.color);
    }
    if (!W.explosive || mech) {
      this.corpses.push({
        x: z.x, y: z.y + 6, rot: mech ? 0 : (Math.random() - 0.5) * 1.2 + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1),
        age: 0, max: mech ? 6 : 9, sprite: z.sprite, flip: Math.random() < 0.5, flat: mech,
      });
    }
    if (mech) {
      for (let i = 0; i < 14 * f; i++) {
        const a = Math.random() * Math.PI * 2, s = 100 + Math.random() * 280;
        this.particles.push({ x: z.x, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7, max: 0.7, size: 3 + Math.random() * 4, color: '#4a5468', kind: 'debris', drag: 0.05, grav: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16 });
      }
      return;
    }
    const P = this.player;
    const ang = Math.atan2(z.y - P.y, z.x - P.x);
    this.bloodSpray(z.x, cy, ang, 1.6, 26 * f * (z.kind === 'brute' ? 2 : 1));
    for (let i = 0; i < 5 * f + 1; i++) {
      const a = ang + (Math.random() - 0.5) * 2.4;
      const s = 120 + Math.random() * 260;
      this.particles.push({ x: z.x, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.5, max: 1, size: 3 + Math.random() * 3, color: '#5e1418', kind: 'gib', drag: 0.03, grav: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20 });
    }
    this.rings.push({ x: z.x, y: cy, r: 6, maxR: 46 * this.uiScale, life: 0.28, max: 0.28, color: '#ff3a4a', width: 3 });
    this.decals.push({ kind: 'blood', x: z.x + Math.cos(ang) * 14, y: z.y + Math.sin(ang) * 10, size: 16 + Math.random() * 10, rot: ang });
    this.burst(z.x, cy, 'glow', 1, '#ff4050', 0);
  }

  private bloodSpray(x: number, y: number, ang: number, spread: number, n: number, speed = 1) {
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * spread;
      const s = (80 + Math.random() * 320) * speed;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.5, max: 0.8, size: 1.5 + Math.random() * 3.5, color: Math.random() < 0.3 ? '#c4101e' : '#7d0710', kind: 'blood', drag: 0.02, grav: 0, rot: 0, vr: 0 });
    }
  }

  private explode(x: number, y: number, size: number, color: string) {
    const f = this.fxScale;
    audio.explosion(size);
    this.shake = Math.min(1, this.shake + 0.35 * size);
    this.flash = { a: Math.min(0.45, 0.12 * size), color };
    this.chroma = Math.min(1, 0.4 * size);
    this.zoom = Math.min(0.06, 0.02 * size);
    const R = (60 + size * 50) * this.uiScale;
    this.rings.push({ x, y, r: 10, maxR: R * 1.6, life: 0.45, max: 0.45, color, width: 6 });
    this.rings.push({ x, y, r: 4, maxR: R, life: 0.3, max: 0.3, color: '#ffffff', width: 3 });
    for (let i = 0; i < 40 * f * size; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 420 * Math.sqrt(size);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.6, max: 0.9, size: 2 + Math.random() * 4, color: Math.random() < 0.5 ? '#ffd27a' : color, kind: 'ember', drag: 0.05, grav: 0, rot: 0, vr: 0 });
    }
    for (let i = 0; i < 12 * f * size; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 90;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.8 + Math.random() * 1.2, max: 2, size: 14 + Math.random() * 22 * size, color: '#1a1416', kind: 'smoke', drag: 0.2, grav: -10, rot: Math.random() * 6, vr: (Math.random() - 0.5) });
    }
    this.burst(x, y, 'glow', 1, color, 0, 60 + size * 40);
    this.decals.push({ kind: 'scorch', x, y, size: (28 + size * 20) * this.uiScale, rot: Math.random() * 6 });
  }

  private burst(x: number, y: number, kind: Particle['kind'], n: number, color: string, speed: number, size = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: kind === 'glow' ? 0.22 : 0.15 + Math.random() * 0.25, max: kind === 'glow' ? 0.22 : 0.4, size: kind === 'glow' ? size * 10 : 1 + Math.random() * 2, color, kind, drag: 0.01, grav: 0, rot: 0, vr: 0 });
    }
  }

  private shells(n: number) {
    const P = this.player;
    for (let i = 0; i < n; i++) {
      const a = P.aim + Math.PI / 2 + (Math.random() - 0.5) * 0.8;
      this.particles.push({ x: P.x, y: P.y - 8, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 60, life: 0.5, max: 0.5, size: 2.5, color: '#e8c060', kind: 'shell', drag: 0.03, grav: 360, rot: Math.random() * 6, vr: 18 });
    }
  }

  private popupAt(x: number, y: number, text: string, color: string, size: number, life: number) {
    this.popups.push({ x, y, text, color, life, max: life, size: size * this.uiScale, vy: -60 });
  }

  showBanner(title: string, sub: string, kicker: string, dur: number, color = '#ffd54a') {
    this.banner = { title, sub, kicker, t: this.time, dur, color };
  }

  // ---------------- contact: rams, grabs and bites ----------------
  private contact(z: Zombie) {
    if (z.attack === 'ram') { this.ram(z); return; }
    if (this.grab || this.boss.active) {
      // someone is already on you: wait your turn at arm's length
      const P = this.player;
      const a = Math.atan2(z.y - P.y, z.x - P.x);
      const r = this.contactDist(z) + 2;
      z.x = P.x + Math.cos(a) * r; z.y = P.y + Math.sin(a) * r;
      return;
    }
    this.startGrab(z);
  }

  private ram(z: Zombie) {
    z.doomed = true;
    z.deathAt = this.time;
    z.deathWeapon = 'pistol';
    if (this.lockId === z.id) { this.lockId = null; this.typed = ''; }
    audio.crash();
    const P = this.player;
    const a = Math.atan2(P.y - z.y, P.x - z.x);
    this.bloodSpray(P.x, P.y - 8, a, 2.2, 22 * this.fxScale, 1.2);
    this.popupAt(P.x, P.y - 60 * this.uiScale, z.kind === 'horse' ? 'TRAMPLED' : 'RUN OVER', '#ff4d6d', 18, 1);
    this.loseLife(z.x, z.y, z.damage);
  }

  /** Reaction time plus a per-letter allowance, so long break-free words stay fair. */
  private grabDuration(words: string[], boss: boolean) {
    const [react, per] = { easy: [1.1, 0.42], normal: [0.95, 0.36], hard: [0.85, 0.3], extreme: [0.75, 0.25] }[this.difficulty];
    const t = words.reduce((s, w) => s + react + w.length * per, 0);
    return boss ? t * 1.1 : t;
  }

  private breakWord(exclude: string[] = []): string {
    const pool = BREAK_WORDS[this.difficulty].filter(w => !exclude.includes(w));
    return pick(pool.length ? pool : BREAK_WORDS[this.difficulty]);
  }

  private startGrab(z: Zombie) {
    const words = [this.breakWord()];
    if (z.kind === 'brute') words.push(this.breakWord(words));
    z.latched = true;
    this.grab = {
      zid: z.id, hand: null, words, index: 0, progress: 0, t: 0, max: this.grabDuration(words, false),
      biteT: 0.15, dmg: z.damage, hadLock: this.lockId === z.id,
    };
    this.onGrabStart(z.x, z.y);
    this.popupAt(this.player.x, this.grabPopupY(), z.kind === 'bird' ? 'PECKED!' : z.kind === 'gator' ? 'CHOMPED!' : 'GRABBED!', '#ff4d6d', 22, 0.9);
  }

  private startBossGrab(hand: BossPartName) {
    const words: string[] = [];
    for (let i = 0; i < 3; i++) words.push(this.breakWord(words));
    this.grab = {
      zid: -1, hand, words, index: 0, progress: 0, t: 0, max: this.grabDuration(words, true),
      biteT: 0.3, dmg: 1, hadLock: false,
    };
    this.onGrabStart(this.player.x, this.player.y);
    this.popupAt(this.player.x, this.grabPopupY(), 'CRUSHED!', '#ff4d6d', 24, 0.9);
  }

  /** On phones the break-free panel sits at the top, so shout below the player instead. */
  private grabPopupY() { return this.layout.compact ? this.player.y + 46 : this.player.y - 70 * this.uiScale; }

  private onGrabStart(x: number, y: number) {
    audio.grabStart();
    buzz(60);
    this.hitstop = 0.08;
    this.shake = Math.min(1, this.shake + 0.5);
    this.flash = { a: 0.3, color: '#ff1030' };
    this.player.hurt = 0.8;
    const P = this.player;
    this.bloodSpray(P.x, P.y - 10, Math.atan2(P.y - y, P.x - x), 2.4, 18 * this.fxScale, 0.8);
    if (this.combo >= 10) audio.comboLost();
    this.combo = 0; this.lastTier = 0;
  }

  /** Where the attacker is during a grab (for the close-up camera). */
  grabFocus(): { x: number; y: number } {
    const P = this.player;
    const g = this.grab;
    if (!g) return P;
    if (g.zid === -1) {
      const part = this.boss.parts.find(p => p.part === g.hand);
      const hp = part ? this.partPos(part) : { x: this.boss.x, y: this.boss.y };
      return { x: (P.x + hp.x) / 2, y: (P.y + hp.y) / 2 - 10 };
    }
    const z = this.zombies.find(q => q.id === g.zid);
    return z ? { x: (P.x + z.x) / 2, y: (P.y + z.y) / 2 - 10 } : P;
  }

  private updateGrab(dt: number) {
    const g = this.grab;
    if (!g) return;
    const z = g.zid > 0 ? this.zombies.find(q => q.id === g.zid && !q.doomed) : undefined;
    if (g.zid > 0 && !z) { this.grab = null; return; }
    if (g.zid === -1 && (!this.boss.active || this.boss.stage === 'dying')) { this.grab = null; return; }
    g.t += dt;
    g.biteT -= dt;
    const P = this.player;
    if (g.biteT <= 0) {
      // each chomp: blood, a jolt, a sting
      g.biteT = g.zid === -1 ? 0.55 : 0.42;
      const src = z ?? this.grabFocus();
      const a = Math.atan2(P.y - src.y, P.x - src.x);
      this.bloodSpray(P.x + (Math.random() - 0.5) * 8, P.y - 12, a + (Math.random() - 0.5), 1.8, 10 * this.fxScale + 2, 0.7);
      this.decals.push({ kind: 'blood', x: P.x + (Math.random() - 0.5) * 30, y: P.y + 8 + Math.random() * 10, size: 8 + Math.random() * 8, rot: Math.random() * 6 });
      this.shake = Math.min(1, this.shake + 0.22);
      this.kick.x += Math.cos(a) * 5; this.kick.y += Math.sin(a) * 5;
      this.player.hurt = Math.max(this.player.hurt, 0.55);
      this.biteFlash = 1;
      this.chroma = Math.min(1, this.chroma + 0.25);
      if (z) { z.pop = 1; z.flash = 0.3; }
      audio.bite();
      buzz(25);
    }
    if (g.t >= g.max) this.failGrab();
  }

  private typeGrab(ch: string) {
    const g = this.grab!;
    const word = g.words[g.index];
    if (word[g.progress] !== ch) { this.mistake(); return; }
    g.progress++;
    this.registerCorrect();
    audio.key(g.progress);
    this.player.recoil = 0.6;
    const z = g.zid > 0 ? this.zombies.find(q => q.id === g.zid) : undefined;
    if (z) { z.pop = 1; z.flash = 0.5; }
    this.shake = Math.min(1, this.shake + 0.06);
    if (g.progress >= word.length) {
      g.index++;
      g.progress = 0;
      this.burst(this.player.x, this.player.y - 10, 'spark', 8, '#ffffff', 240);
      if (g.index >= g.words.length) this.breakFree();
      else audio.armorBreak();
    }
  }

  private breakFree() {
    const g = this.grab!;
    this.grab = null;
    this.escapes++;
    audio.breakFree();
    buzz(40);
    const P = this.player;
    const bonus = Math.round(250 * g.words.length * this.diffMult * Math.max(1, Math.min(4, 1 + this.combo / 20)));
    this.score += bonus;
    this.slowmo = 0.35;
    this.shake = Math.min(1, this.shake + 0.4);
    this.rings.push({ x: P.x, y: P.y, r: 10, maxR: 140 * this.uiScale, life: 0.4, max: 0.4, color: '#41ffb4', width: 5 });
    this.popupAt(P.x, P.y - 76 * this.uiScale, `BROKE FREE +${bonus.toLocaleString()}`, '#41ffb4', 20, 1.3);
    if (g.zid === -1) {
      const b = this.boss;
      b.stun = 2.2; b.attack = null; b.charging = 0; b.laserT = 0; b.flash = 1; b.grabCd = 6;
      this.lasers = [];
      return;
    }
    const z = this.zombies.find(q => q.id === g.zid);
    if (!z) return;
    z.latched = false;
    const a = Math.atan2(z.y - P.y, z.x - P.x);
    z.kx = Math.cos(a) * 900 * this.speedScale; z.ky = Math.sin(a) * 900 * this.speedScale;
    z.stun = 1.3; z.flash = 1;
    if (z.kind === 'horse' || z.kind === 'car') z.state = 'move';
    this.burst(z.x, z.y - 10, 'spark', 14, '#41ffb4', 300);
    // finish what you started: you're now locked on to whoever bit you
    if (!this.lockId || this.lockId === z.id || !this.zombies.some(q => q.id === this.lockId && !q.doomed)) {
      if (this.lockId !== z.id) z.progress = 0;
      this.lockId = z.id;
      this.typed = z.word.slice(0, z.progress);
    } else {
      const lock = this.zombies.find(q => q.id === this.lockId)!;
      this.typed = lock.word.slice(0, lock.progress);
    }
  }

  private failGrab() {
    const g = this.grab!;
    this.grab = null;
    const P = this.player;
    if (g.zid === -1) {
      const b = this.boss;
      b.attack = null; b.grabCd = 7; b.stun = 0.6;
      this.loseLife(b.x, b.y, g.dmg, true);
      return;
    }
    const z = this.zombies.find(q => q.id === g.zid);
    if (z) {
      z.latched = false;
      const a = Math.atan2(z.y - P.y, z.x - P.x);
      z.kx = Math.cos(a) * 700 * this.speedScale; z.ky = Math.sin(a) * 700 * this.speedScale;
      z.stun = 1.6;
      this.loseLife(z.x, z.y, g.dmg, true);
      this.popupAt(P.x, P.y - 70 * this.uiScale, 'BITTEN', '#ff4d6d', 20, 1);
      if (this.lockId === z.id) this.typed = z.word.slice(0, z.progress);
    } else this.loseLife(P.x, P.y - 40, g.dmg, true);
  }

  private loseLife(x: number, y: number, dmg = 1, force = false) {
    if (this.over) return;
    if (!force && this.time - this.lifeLostAt < 0.9) return; // brief invulnerability after a hit
    this.lives = Math.max(0, this.lives - dmg);
    this.lifeLostAt = this.time;
    if (this.combo >= 10) audio.comboLost();
    this.combo = 0; this.lastTier = 0;
    this.player.hurt = 1;
    this.shake = 1;
    this.chroma = 1;
    this.flash = { a: 0.45, color: '#ff1030' };
    const P = this.player;
    const a = Math.atan2(P.y - y, P.x - x);
    this.kick.x += Math.cos(a) * 14; this.kick.y += Math.sin(a) * 14;
    this.hitstop = 0.09;
    this.bloodSpray(P.x, P.y - 10, a, 2.6, 30 * this.fxScale, 1.1);
    this.decals.push({ kind: 'blood', x: P.x + Math.cos(a) * 18, y: P.y + 10, size: 18, rot: a });
    audio.hurt();
    buzz(120);
    this.rings.push({ x: P.x, y: P.y, r: 8, maxR: 120, life: 0.5, max: 0.5, color: '#ff2040', width: 5 });
    if (this.lives <= 0) {
      this.over = true;
      this.overT = 0;
      this.grab = null;
      audio.gameOver();
    }
  }

  // ---------------- boss ----------------
  private bossScale() {
    const L = this.layout;
    if (L.compact) return Math.max(0.5, Math.min(0.7, L.w / 600));
    return L.mode === 'lane' ? 0.8 : Math.max(1, Math.min(1.4, L.h / 680));
  }
  private bossTargetY() {
    const L = this.layout;
    return L.mode === 'lane' ? L.topPad + (this.player.y - L.topPad) * 0.36 + 40 * this.bossScale() : L.topPad + 150 * this.bossScale();
  }

  private baseOffset(part: BossPartName): [number, number] {
    switch (part) {
      case 'head': return [0, -96];
      case 'leftHand': return [-122, 4];
      case 'rightHand': return [122, 4];
      case 'leftFoot': return [-58, 112];
      case 'rightFoot': return [58, 112];
    }
  }

  /** Limb offsets in boss-local units, including walk cycle and attack poses. */
  partOffset(part: BossPartName): [number, number] {
    const b = this.boss;
    const [bx, by] = this.baseOffset(part);
    if (part === 'leftFoot' || part === 'rightFoot') {
      const { lift, fwd } = this.footPose(part);
      return [bx + fwd, by - lift];
    }
    if (part === 'leftHand' || part === 'rightHand') {
      const swing = Math.sin(b.walk * Math.PI) * (part === 'leftHand' ? 1 : -1);
      let x = bx, y = by + swing * 10 + Math.sin(b.t * 2.4) * 6 * (part === 'leftHand' ? 1 : -1);
      const A = b.attack;
      if (A && A.hand === part) {
        const P = this.player;
        const lx = (P.x - b.x) / b.scale, ly = (P.y - b.y) / b.scale;
        const k = Math.min(1, A.t / A.tell);
        const ease = k * k * (3 - 2 * k);
        if (A.kind === 'swipe') {
          if (!A.acted) { x += (bx * 0.3) * ease; y += -80 * ease; } // wind up high
          else { const s = Math.min(1, (A.t - A.tell) / 0.18); x = bx * 1.3 + (lx - bx * 1.3) * s; y = -76 + (ly + 76) * s; }
        } else if (A.kind === 'grab') {
          x = bx + (lx * 0.92 - bx) * ease; y = by + (ly * 0.92 - by) * ease;
        }
      }
      if (this.grab && this.grab.zid === -1 && this.grab.hand === part) {
        const P = this.player;
        x = (P.x - b.x) / b.scale * 0.92; y = (P.y - b.y) / b.scale * 0.92 - 6;
      }
      return [x, y];
    }
    return [bx, by + Math.abs(Math.sin(b.walk * Math.PI)) * -3];
  }

  /** Walk cycle: one foot lifts and swings forward while the other is planted. */
  footPose(part: BossPartName): { lift: number; fwd: number } {
    const b = this.boss;
    const step = Math.floor(b.walk);
    const frac = b.walk - step;
    const moving = (step % 2 === 0) === (part === 'leftFoot');
    if (!moving) return { lift: 0, fwd: 0 };
    return { lift: Math.sin(frac * Math.PI) * 24, fwd: (frac - 0.5) * 18 * (b.stage === 'entering' ? 0 : Math.sign(Math.cos(b.t * 0.9)) || 1) };
  }

  partPos(p: BossPart): { x: number; y: number } {
    const b = this.boss;
    const [ox, oy] = this.partOffset(p.part);
    return { x: b.x + ox * b.scale, y: b.y + oy * b.scale };
  }

  nextPart(): BossPart | null {
    const order: BossPartName[] = ['head', 'leftHand', 'rightHand', 'leftFoot', 'rightFoot'];
    for (const n of order) {
      const p = this.boss.parts.find(q => q.part === n && !q.destroyed);
      if (p) return p;
    }
    return null;
  }

  private spawnBoss() {
    if (this.boss.active || this.over) return;
    for (const z of this.zombies) if (!z.doomed) { z.doomed = true; z.deathAt = this.time + 0.1 + Math.random() * 0.3; z.deathWeapon = 'grenade'; }
    this.grab = null;
    this.lockId = null; this.typed = '';
    const used = new Set<string>();
    const word = () => {
      const pool = WORDS[this.difficulty].filter(w => !used.has(w) && !used.has(w[0]));
      const w = pick(pool.length ? pool : WORDS[this.difficulty]);
      used.add(w);
      return w;
    };
    const parts: BossPart[] = (['head', 'leftHand', 'rightHand', 'leftFoot', 'rightFoot'] as BossPartName[])
      .map(part => ({ part, word: word(), progress: 0, destroyed: false, flash: 0, pop: 0, tagX: 0, tagY: 0, tagInit: false }));
    const scale = this.bossScale();
    this.boss = {
      ...this.emptyBoss(),
      active: true, stage: 'entering', name: this.info.def.boss, x: this.layout.w / 2, y: -170 * scale, baseY: this.bossTargetY(), scale,
      parts, sentence: pick(BOSS_SENTENCES[this.difficulty]), grabCd: 4,
    };
    this.lasers = [];
    audio.bossEnter();
    this.showBanner(this.info.def.boss, 'DESTROY EVERY LIMB', 'BOSS INCOMING', 2.6, '#ff3a4a');
  }

  private updateBoss(dt: number, wdt: number) {
    const b = this.boss;
    if (!b.active) return;
    const bdt = this.grab && this.grab.zid !== -1 ? wdt : dt;
    b.t += bdt;
    b.flash = Math.max(0, b.flash - dt * 6);
    b.stun = Math.max(0, b.stun - bdt);
    b.grabCd = Math.max(0, b.grabCd - bdt);
    b.parts.forEach(p => { p.flash = Math.max(0, p.flash - dt * 6); p.pop = Math.max(0, p.pop - dt * 7); });
    const L = this.layout;
    if (b.stage === 'entering') {
      // stomps in: the body only advances while a foot is in the air, and every plant shakes the ground
      const prevStep = Math.floor(b.walk);
      b.walk += bdt * 1.9;
      const frac = b.walk - Math.floor(b.walk);
      b.y += 120 * bdt * (b.scale + 0.3) * Math.sin(frac * Math.PI) * 1.2;
      if (Math.floor(b.walk) !== prevStep) {
        this.shake = Math.min(1, this.shake + 0.32);
        audio.stomp();
        buzz(30);
        const foot = (Math.floor(b.walk) % 2 === 0) ? 'rightFoot' : 'leftFoot';
        const [fx, fy] = this.baseOffset(foot);
        const px = b.x + fx * b.scale, py = b.y + (fy + 12) * b.scale;
        this.rings.push({ x: px, y: py, r: 8, maxR: 90 * b.scale, life: 0.4, max: 0.4, color: '#ff3a4a', width: 3 });
        for (let i = 0; i < 10 * this.fxScale; i++) {
          const a = Math.PI + Math.random() * Math.PI, s = 60 + Math.random() * 120;
          this.particles.push({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.4, life: 0.8, max: 0.8, size: 10 + Math.random() * 12, color: '#222', kind: 'smoke', drag: 0.2, grav: -6, rot: 0, vr: 0 });
        }
        if (b.y > 0) this.decals.push({ kind: 'crater', x: px, y: py, size: 22 * b.scale, rot: 0 });
      }
      if (b.y >= b.baseY) {
        b.y = b.baseY;
        b.stage = 'fight';
        b.walk = Math.round(b.walk);
        b.laserT = 0;
        this.shake = 0.9;
        audio.stomp();
        this.decals.push({ kind: 'crater', x: b.x, y: b.y + 120 * b.scale, size: 70 * b.scale, rot: 0 });
      }
      return;
    }
    if (b.stage === 'dying') {
      b.dyingT += dt;
      if (Math.random() < dt * 14) {
        const ox = (Math.random() - 0.5) * 220 * b.scale, oy = (Math.random() - 0.5) * 240 * b.scale;
        this.explode(b.x + ox, b.y + oy, 1, Math.random() < 0.5 ? '#ff4040' : '#3df6ff');
      }
      if (b.dyingT > 1.5) this.finishBoss();
      return;
    }
    // shuffle side to side; the legs step in time with the movement
    const sway = b.stage === 'sentence' ? 26 : Math.min(140, (L.w / 2 - 150 * b.scale));
    const holding = !!b.attack || (this.grab?.zid === -1);
    const nx = holding ? b.x : L.w / 2 + Math.sin(b.t * 0.9) * Math.max(0, sway);
    const prevStep = Math.floor(b.walk);
    b.walk += Math.abs(nx - b.x) / (34 * b.scale);
    if (Math.floor(b.walk) !== prevStep && b.stage === 'fight') { this.shake = Math.min(1, this.shake + 0.08); audio.stomp(); }
    b.x = nx;
    b.y = b.baseY + Math.sin(b.t * 1.8) * (b.stage === 'sentence' ? 2 : 4);

    if (b.stage !== 'fight' || this.grab) return;
    if (b.stun > 0) { b.attack = null; b.charging = 0; return; }

    if (b.charging > 0) {
      b.charging -= bdt;
      if (b.charging <= 0) this.fireLasers();
      return;
    }
    const A = b.attack;
    if (A) {
      A.t += bdt;
      if (A.kind === 'missile' && A.t >= A.tell) { this.fireMissiles(); b.attack = null; }
      else if (A.kind === 'swipe') {
        if (!A.acted && A.t >= A.tell) { A.acted = true; audio.swipe(); }
        if (A.acted && A.t >= A.tell + 0.2) {
          const hand = b.parts.find(p => p.part === A.hand);
          if (hand && !hand.destroyed) {
            const P = this.player;
            this.popupAt(P.x, P.y - 60 * this.uiScale, 'SMASHED', '#ff4d6d', 20, 1);
            this.loseLife(b.x, b.y, 1);
          }
          b.attack = null;
        }
      } else if (A.kind === 'grab' && A.t >= A.tell) {
        const hand = b.parts.find(p => p.part === A.hand);
        if (hand && !hand.destroyed) this.startBossGrab(A.hand!);
        b.attack = null;
      }
      return;
    }
    b.laserT += bdt;
    const interval = DIFFICULTY_CONFIG[this.difficulty].laserInterval * Math.max(0.65, 1 - (this.info.levelInWorld - 1) * 0.035);
    if (b.t > 3 && b.laserT > interval) {
      b.laserT = 0;
      this.chooseBossAttack();
    }
  }

  private chooseBossAttack() {
    const b = this.boss;
    const head = b.parts.find(p => p.part === 'head')!;
    const hands = b.parts.filter(p => (p.part === 'leftHand' || p.part === 'rightHand') && !p.destroyed);
    const lw = this.info.levelInWorld + this.info.loop * 10;
    const opts: Array<[BossAttackKind, number]> = [];
    if (!head.destroyed) opts.push(['laser', 3]);
    if (lw >= 2 || this.threat >= 3) opts.push(['missile', 2.5]);
    if (hands.length) opts.push(['swipe', 2.5]);
    if (hands.length && b.grabCd <= 0 && (lw >= 3 || this.threat >= 4)) opts.push(['grab', 2]);
    if (!opts.length) opts.push(['missile', 1]);
    const weighted = opts.map(([k, w]) => [k, k === b.lastAttack ? w * 0.3 : w] as [BossAttackKind, number]);
    const total = weighted.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    let kind: BossAttackKind = weighted[0][0];
    for (const [k, w] of weighted) { r -= w; if (r <= 0) { kind = k; break; } }
    b.lastAttack = kind;
    if (kind === 'laser') { b.charging = 0.85; audio.laserCharge(); return; }
    const P = this.player;
    const hand = hands.length ? (hands.length === 2 ? (P.x < b.x ? hands.find(h => h.part === 'leftHand')! : hands.find(h => h.part === 'rightHand')!) : hands[0]) : null;
    const T = this.threat;
    if (kind === 'missile') { b.attack = { kind, t: 0, tell: 0.7, hand: null, acted: false }; audio.enemyCharge(); }
    if (kind === 'swipe') { b.attack = { kind, t: 0, tell: 1.25 - T * 0.07, hand: hand!.part, acted: false }; audio.swipeTell(); }
    if (kind === 'grab') {
      b.attack = { kind, t: 0, tell: 1.1 - T * 0.06, hand: hand!.part, acted: false };
      b.grabCd = 9;
      audio.swipeTell();
      this.popupAt(P.x, P.y - 80 * this.uiScale, 'INCOMING GRAB', '#ff9a3d', 15, 1);
    }
  }

  eyePositions(): Array<{ x: number; y: number }> {
    const b = this.boss;
    const [, hy] = this.partOffset('head');
    return [
      { x: b.x - 16 * b.scale, y: b.y + (hy - 2) * b.scale },
      { x: b.x + 16 * b.scale, y: b.y + (hy - 2) * b.scale },
    ];
  }

  missilePods(): Array<{ x: number; y: number }> {
    const b = this.boss;
    return [{ x: b.x - 62 * b.scale, y: b.y - 62 * b.scale }, { x: b.x + 62 * b.scale, y: b.y - 62 * b.scale }];
  }

  private fireLasers() {
    const P = this.player;
    audio.laserFire();
    const speed = 340 * this.speedScale;
    this.eyePositions().forEach(e => {
      const d = Math.hypot(P.x - e.x, P.y - e.y) || 1;
      this.lasers.push({ x: e.x, y: e.y, vx: (P.x - e.x) / d * speed, vy: (P.y - e.y) / d * speed, age: 0, kind: 'laser', owner: 0, r: 8 });
    });
  }

  private fireMissiles() {
    audio.missileLaunch();
    const n = this.threat >= 3 ? 3 : 2;
    const pods = this.missilePods();
    for (let i = 0; i < n; i++) {
      const p = pods[i % 2];
      const a = -Math.PI / 2 + (i % 2 ? 1.0 : -1.0) + (Math.random() - 0.5) * 0.3;
      const s = 120 * this.speedScale;
      this.lasers.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: -i * 0.15, kind: 'missile', owner: 0, r: 10 });
      this.burst(p.x, p.y, 'glow', 1, '#ff9a3d', 0, 30);
    }
    this.shake = Math.min(1, this.shake + 0.2);
  }

  private typeBoss(ch: string) {
    const b = this.boss;
    if (b.stage === 'entering') return;
    if (b.stage === 'sentence') {
      while (b.sentence[b.sentenceIndex] === ' ') b.sentenceIndex++;
      const expected = b.sentence[b.sentenceIndex];
      if (ch !== expected) { this.mistake(); return; }
      b.sentenceIndex++;
      this.registerCorrect();
      audio.key(b.sentenceIndex % 12);
      b.flash = 0.6;
      this.fireTracer(b.x + (Math.random() - 0.5) * 80 * b.scale, b.y + (Math.random() - 0.5) * 80 * b.scale, -1, false);
      while (b.sentence[b.sentenceIndex] === ' ') b.sentenceIndex++;
      if (b.sentenceIndex >= b.sentence.length) this.killBoss();
      return;
    }
    const part = this.nextPart();
    if (!part) return;
    if (part.word[part.progress] !== ch) { this.mistake(); return; }
    part.progress++;
    part.pop = 1;
    part.flash = 0.6;
    this.typed = part.word.slice(0, part.progress);
    this.registerCorrect();
    audio.key(part.progress);
    const pos = this.partPos(part);
    const done = part.progress >= part.word.length;
    this.fireTracer(pos.x, pos.y, -1, done);
    if (done) {
      part.destroyed = true;
      this.typed = '';
      this.hitstop = 0.12;
      audio.shot(this.weapon);
      audio.bossPart();
      this.explode(pos.x, pos.y, 1.4, '#ff4040');
      for (let i = 0; i < 14 * this.fxScale; i++) {
        const a = Math.random() * Math.PI * 2, s = 100 + Math.random() * 300;
        this.particles.push({ x: pos.x, y: pos.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8, max: 0.8, size: 3 + Math.random() * 5, color: '#3a3f55', kind: 'debris', drag: 0.05, grav: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16 });
      }
      // destroying a limb staggers the boss and cancels whatever it was doing
      b.stun = 1.4; b.charging = 0; b.laserT = 0; b.attack = null;
      if (this.lasers.length) this.lasers.forEach(l => this.burst(l.x, l.y, 'spark', 6, '#ff9a3d', 160));
      this.lasers = [];
      const gained = Math.round((100 + part.word.length * 10) * Math.max(1, this.combo) * this.diffMult);
      this.score += gained;
      this.popupAt(pos.x, pos.y - 30, `+${gained.toLocaleString()}`, '#ffd54a', 20, 1.1);
      if (b.parts.every(p => p.destroyed)) {
        b.stage = 'sentence';
        b.sentenceIndex = 0;
        this.showBanner('FINISH IT', 'TYPE THE SENTENCE', 'EXECUTION', 1.8, '#ffd54a');
        audio.stomp();
      }
    }
  }

  private killBoss() {
    const b = this.boss;
    b.stage = 'dying';
    b.dyingT = 0;
    this.slowmo = 1.3;
    this.flash = { a: 0.8, color: '#ffffff' };
    this.shake = 1;
    audio.bossDeath();
    const gained = Math.round(1000 * this.level * this.diffMult + b.sentence.length * 20 * Math.max(1, this.combo));
    this.score += gained;
    this.popupAt(b.x, b.y - 140 * b.scale, `+${gained.toLocaleString()}`, '#ffd54a', 30, 1.8);
  }

  private finishBoss() {
    const b = this.boss;
    this.explode(b.x, b.y, 3, '#3df6ff');
    for (let i = 0; i < 60 * this.fxScale; i++) {
      const a = Math.random() * Math.PI * 2, s = 100 + Math.random() * 500;
      this.particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.6, max: 1.2, size: 2 + Math.random() * 5, color: '#7d0710', kind: 'blood', drag: 0.03, grav: 0, rot: 0, vr: 0 });
    }
    this.decals.push({ kind: 'blood', x: b.x, y: b.y + 40, size: 90 * b.scale, rot: 0 });
    this.wreck = { x: b.x, y: b.y + 30 * b.scale, scale: b.scale, t: 0 };
    const healed = this.lives < MAX_LIVES;
    this.lives = MAX_LIVES;
    const lvlAcc = (() => { const c = this.correct - this.levelStart.correct, m = this.mistakes - this.levelStart.mistakes; return c + m > 0 ? c / (c + m) : 1; })();
    const bonus = Math.round(500 * this.info.levelInWorld * this.diffMult * (lvlAcc >= 0.95 ? 1.5 : 1));
    this.score += bonus;
    this.lastBonus = bonus;
    this.lasers = [];
    this.boss = this.emptyBoss();
    this.lockId = null; this.typed = '';
    audio.levelClear();
    const sub = healed ? 'HEALTH RESTORED' : 'FLAWLESS';
    this.showBanner('LEVEL CLEAR', `${sub} · +${bonus.toLocaleString()}${lvlAcc >= 0.95 ? ' PRECISION' : ''}`, this.info.def.name.toUpperCase(), 2.4, '#3df6ff');
    this.phase = 'exit';
    this.exitT = 0;
  }

  // ---------------- queries ----------------
  aimTarget(): { x: number; y: number } | null {
    if (this.grab) return this.grabFocus();
    if (this.boss.active && this.boss.stage !== 'entering') {
      const p = this.nextPart();
      if (p) return this.partPos(p);
      return { x: this.boss.x, y: this.boss.y };
    }
    const lock = this.zombies.find(z => z.id === this.lockId);
    if (lock) return lock;
    return this.closest();
  }

  closest(): Zombie | null {
    let best: Zombie | null = null, bd = Infinity;
    for (const z of this.zombies) {
      if (z.doomed) continue;
      // shooters are the real threat: weight them closer
      const d = Math.hypot(z.x - this.player.x, z.y - this.player.y) * (z.attack === 'ranged' ? 0.6 : 1);
      if (d < bd) { bd = d; best = z; }
    }
    return best;
  }

  stats(): RunStats {
    return {
      score: this.score, kills: this.kills, level: this.level, maxCombo: this.maxCombo,
      wpm: this.wpm, accuracyPct: this.accuracyPct, difficulty: this.difficulty,
      durationMs: Math.round(this.activeTime * 1000), correct: this.correct, mistakes: this.mistakes,
      world: this.world, levelName: this.info.def.name, worldName: this.info.world.name, escapes: this.escapes,
    };
  }
}
