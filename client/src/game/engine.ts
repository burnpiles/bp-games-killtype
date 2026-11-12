// Game simulation. Pure TypeScript, no React: the loop runs on real frame delta
// with a fixed-step accumulator, so speed is identical at 60/120/144 Hz.

import {
  BOSS_THRESHOLD, DIFFICULTY_CONFIG, DIFFICULTY_PERSONALITY, MAX_LIVES, WEAPONS, WORDS,
  BOSS_SENTENCES, comboTier, COMBO_TIERS, pick,
  type Behavior, type Difficulty, type SpecialWeaponId, type WeaponId,
} from './config';
import { audio } from './audio';
import type { ZombieVariant } from './sprites';

const STEP = 1 / 120;
let uid = 1;
const nid = () => uid++;

export interface Zombie {
  id: number;
  x: number; y: number;
  word: string;
  progress: number;
  speed: number;
  behavior: Behavior;
  variant: ZombieVariant;
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
export interface Corpse { x: number; y: number; rot: number; age: number; max: number; variant: ZombieVariant; flip: boolean }
export interface Laser { x: number; y: number; vx: number; vy: number; age: number }
export interface DecalReq { kind: 'blood' | 'scorch' | 'bones' | 'crater'; x: number; y: number; size: number; rot: number }

export type BossPartName = 'head' | 'leftHand' | 'rightHand' | 'leftFoot' | 'rightFoot';
export interface BossPart { part: BossPartName; word: string; progress: number; destroyed: boolean; flash: number; pop: number; tagX: number; tagY: number; tagInit: boolean }
export interface Boss {
  active: boolean;
  stage: 'entering' | 'fight' | 'sentence' | 'dying';
  x: number; y: number; baseY: number;
  scale: number;
  parts: BossPart[];
  sentence: string;
  sentenceIndex: number;
  t: number;
  stompT: number;
  laserT: number;
  charging: number; // >0 while charging eyes
  stun: number;
  flash: number;
  dyingT: number;
}

export interface Layout { w: number; h: number; mode: 'arena' | 'lane'; compact: boolean; topPad: number; bottomPad: number }

export interface RunStats {
  score: number; kills: number; level: number; maxCombo: number; wpm: number; accuracyPct: number;
  difficulty: Difficulty; durationMs: number; correct: number; mistakes: number;
}

export type GameEvent =
  | { type: 'gameover'; stats: RunStats }
  | { type: 'pause'; paused: boolean };

export class Game {
  layout: Layout = { w: 800, h: 600, mode: 'arena', compact: false, topPad: 70, bottomPad: 60 };
  difficulty: Difficulty = 'hard';
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

  player = { x: 400, y: 300, aim: -Math.PI / 2, recoil: 0, muzzle: 0, hurt: 0, bob: 0 };
  lockId: number | null = null;
  typed = '';
  typedFlash = 0;
  missFlash = 0;

  score = 0;
  displayScore = 0;
  kills = 0;
  killsTowardsBoss = 0;
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
  weapon: WeaponId = 'pistol';
  ammo = 0;
  weaponTime = 0;
  weaponPulse = 0;
  lastSpawn = 0;
  chapterUntil = 0;
  bossPendingAt = -1;

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
    return { active: false, stage: 'entering', x: 0, y: 0, baseY: 0, scale: 1, parts: [], sentence: '', sentenceIndex: 0, t: 0, stompT: 0, laserT: 0, charging: 0, stun: 0, flash: 0, dyingT: 0 };
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

  // ---------------- layout ----------------
  setLayout(w: number, h: number, compact: boolean) {
    const prev = this.layout;
    const mode: Layout['mode'] = compact || w / h < 1.05 || h < 520 ? 'lane' : 'arena';
    const topPad = compact ? 54 : 80;
    const bottomPad = mode === 'lane' ? (compact ? 64 : 90) : 70;
    this.layout = { w, h, mode, compact, topPad, bottomPad };
    this.fxScale = compact ? 0.6 : 1;
    const oldP = { ...this.player };
    this.placePlayer();
    if (prev.w > 0 && prev.h > 0 && (prev.w !== w || prev.h !== h)) {
      const sx = w / prev.w, sy = h / prev.h;
      const remap = (o: { x: number; y: number }) => { o.x *= sx; o.y *= sy; };
      this.zombies.forEach(z => { remap(z); z.tagInit = false; });
      this.corpses.forEach(remap);
      this.particles.forEach(remap);
      this.lasers.forEach(remap);
      if (this.boss.active) {
        this.boss.scale = this.bossScale();
        this.boss.baseY = this.bossTargetY();
        this.boss.y = this.boss.stage === 'entering' ? Math.min(this.boss.y, this.boss.baseY) : this.boss.baseY;
        this.boss.parts.forEach(p => { p.tagInit = false; });
      }
      void oldP;
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
  start(difficulty: Difficulty) {
    this.difficulty = difficulty;
    this.running = true;
    this.paused = false;
    this.over = false;
    this.overT = 0;
    this.time = 0; this.activeTime = 0; this.acc = 0;
    this.hitstop = 0; this.slowmo = 0; this.timeScale = 1;
    this.zombies = []; this.particles = []; this.tracers = []; this.rings = [];
    this.popups = []; this.corpses = []; this.lasers = []; this.decals = []; this.decalEpoch++;
    this.lockId = null; this.typed = '';
    this.score = 0; this.displayScore = 0; this.kills = 0; this.killsTowardsBoss = 0;
    this.correct = 0; this.mistakes = 0; this.totalTyped = 0;
    this.combo = 0; this.maxCombo = 0; this.lastTier = 0;
    this.lives = MAX_LIVES; this.level = 1; this.lifeLostAt = -10;
    this.weapon = 'pistol'; this.ammo = 0; this.weaponTime = 0;
    this.lastSpawn = -1.2; this.chapterUntil = 1.6;
    this.boss = this.emptyBoss();
    this.bossPendingAt = -1;
    this.shake = 0; this.flash.a = 0; this.chroma = 0;
    this.placePlayer();
    this.showBanner('CHAPTER 1', difficulty.toUpperCase() + ' MODE', 'SURVIVE', 2.2, DIFFICULTY_CONFIG[difficulty].color);
    audio.setIntensity(1, false);
  }

  stop() {
    this.running = false;
    this.over = false;
    this.paused = false;
    this.zombies = []; this.particles = []; this.tracers = []; this.rings = [];
    this.popups = []; this.corpses = []; this.lasers = []; this.banner = null;
    this.boss = this.emptyBoss();
  }

  setPaused(p: boolean) {
    if (!this.running || this.over || this.paused === p) return;
    this.paused = p;
    this.onEvent({ type: 'pause', paused: p });
  }

  // ---------------- main tick ----------------
  update(realDt: number) {
    realDt = Math.min(realDt, 0.1);
    // Always ease visual-only values so paused frames stay smooth.
    this.displayScore += (this.score - this.displayScore) * Math.min(1, realDt * 12);
    if (Math.abs(this.score - this.displayScore) < 1) this.displayScore = this.score;
    if (!this.running || this.paused) return;

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

    this.activeTime += realDt;
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

    // camera + screen fx decay on real time so hitstop still "hits"
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

    const intensity = this.boss.active ? 3 : this.tier >= 3 ? 3 : this.tier >= 1 ? 2 : 1;
    if (audio.intensity !== intensity || audio.boss !== this.boss.active) audio.setIntensity(intensity, this.boss.active);
  }

  private fixedStep(dt: number) {
    this.time += dt;
    const L = this.layout;
    const cfg = DIFFICULTY_CONFIG[this.difficulty];

    if (this.banner && this.time > this.banner.t + this.banner.dur) this.banner = null;

    // timed weapon
    if (this.weaponTime > 0) {
      this.weaponTime -= dt * 1000;
      if (this.weaponTime <= 0) { this.weapon = 'pistol'; this.ammo = 0; this.weaponTime = 0; }
    }

    // spawning
    const spawnRate = Math.max(cfg.spawnRate - this.level * 100, 800) / 1000;
    const maxZ = cfg.maxZombies + Math.floor(this.level / 2) - (L.compact ? 1 : 0);
    const alive = this.zombies.filter(z => !z.doomed).length;
    if (this.bossPendingAt >= 0 && this.time >= this.bossPendingAt) { this.bossPendingAt = -1; this.spawnBoss(); }
    if (!this.boss.active && this.bossPendingAt < 0 && this.time >= this.chapterUntil && this.time - this.lastSpawn > spawnRate && alive < maxZ) {
      this.spawnZombie();
      this.lastSpawn = this.time;
    }

    // zombies
    const ss = this.speedScale;
    const P = this.player;
    for (const z of this.zombies) {
      z.age += dt;
      z.phase += dt;
      z.flash = Math.max(0, z.flash - dt * 8);
      z.pop = Math.max(0, z.pop - dt * 7);
      z.x += z.kx * dt; z.y += z.ky * dt;
      const kd = Math.pow(0.001, dt);
      z.kx *= kd; z.ky *= kd;
      if (z.doomed) continue;
      const dx = P.x - z.x, dy = P.y - z.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      let sp = z.speed * ss;
      if (z.behavior === 'sprinter') sp *= (z.phase % 2) < 0.33 ? 1.6 : 1;
      // ease in from spawn
      sp *= Math.min(1, 0.35 + z.age * 0.9);
      let vx = ux * sp, vy = uy * sp;
      if (z.behavior === 'zigzag') {
        const osc = Math.sin(z.phase * 12) * 36 * ss;
        vx += -uy * osc; vy += ux * osc;
      }
      z.x += vx * dt; z.y += vy * dt;
      z.facing = vx < 0 ? -1 : 1;
      if (d < 38 * this.uiScale + 4) this.zombieHitsPlayer(z);
    }
    // soft separation to keep sprites readable
    for (let i = 0; i < this.zombies.length; i++) {
      const a = this.zombies[i];
      if (a.doomed) continue;
      for (let j = i + 1; j < this.zombies.length; j++) {
        const b = this.zombies[j];
        if (b.doomed) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = 34 * this.uiScale;
        if (d2 < min * min && d2 > 0.01) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5 * dt * 8;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
        }
      }
    }

    // deaths whose shot has landed
    for (const z of this.zombies) if (z.doomed && this.time >= z.deathAt) this.killFx(z);
    this.zombies = this.zombies.filter(z => !(z.doomed && this.time >= z.deathAt));

    if (this.lockId !== null && !this.zombies.some(z => z.id === this.lockId && !z.doomed)) {
      if (!this.boss.active) { this.lockId = null; this.typed = ''; }
    }

    this.updateBoss(dt);

    // lasers
    for (const l of this.lasers) {
      l.age += dt;
      l.x += l.vx * dt; l.y += l.vy * dt;
      if (Math.hypot(P.x - l.x, P.y - l.y) < 22) {
        l.age = 999;
        this.loseLife(l.x, l.y);
      }
    }
    this.lasers = this.lasers.filter(l => l.age < 6 && l.x > -60 && l.x < L.w + 60 && l.y > -60 && l.y < L.h + 60);

    // corpses decay to bones
    for (const c of this.corpses) {
      c.age += dt;
      if (c.age >= c.max) this.decals.push({ kind: 'bones', x: c.x, y: c.y, size: 1, rot: c.rot });
    }
    this.corpses = this.corpses.filter(c => c.age < c.max);

    // aim
    const tgt = this.aimTarget();
    if (tgt) {
      const want = Math.atan2(tgt.y - P.y, tgt.x - P.x);
      let diff = want - P.aim;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      P.aim += diff * Math.min(1, dt * 18);
    }
    P.bob += dt;
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
        if (z) { z.flash = 1; z.kx += dx / (d || 1) * (t.final ? 160 : 70); z.ky += dy / (d || 1) * (t.final ? 160 : 70); }
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
  private pickWord(): string {
    const pool = WORDS[this.difficulty];
    const used = new Set(this.zombies.filter(z => !z.doomed).map(z => z.word[0]));
    const fresh = pool.filter(w => !used.has(w[0]) && !this.zombies.some(z => z.word === w));
    return pick(fresh.length ? fresh : pool);
  }

  private spawnZombie() {
    const L = this.layout;
    const prof = DIFFICULTY_PERSONALITY[this.difficulty];
    let x: number, y: number;
    if (L.mode === 'lane') {
      const r = Math.random();
      if (r < 0.7) { x = 30 + Math.random() * (L.w - 60); y = L.topPad - 12; }
      else { x = r < 0.85 ? -24 : L.w + 24; y = L.topPad + Math.random() * (this.player.y - L.topPad) * 0.45; }
    } else {
      const side = Math.floor(Math.random() * 4);
      const m = 36;
      if (side === 0) { x = Math.random() * L.w; y = -m; }
      else if (side === 1) { x = L.w + m; y = Math.random() * L.h; }
      else if (side === 2) { x = Math.random() * L.w; y = L.h + m; }
      else { x = -m; y = Math.random() * L.h; }
    }
    const roll = Math.random();
    const w = prof.behaviorWeights;
    const behavior: Behavior = roll > w.normal + w.zigzag ? 'sprinter' : roll > w.normal ? 'zigzag' : 'normal';
    let speed = 15 + this.level * 3 + prof.speedBonus + (Math.random() * 6 - 3);
    if (behavior === 'sprinter') speed += 4;
    if (behavior === 'zigzag') speed += 2;
    const dropChance = Math.min(prof.specialDropBase + this.level * 0.02, 0.45);
    const carrier = Math.random() < dropChance ? pick(prof.weaponPool) : null;
    const variant: ZombieVariant = carrier ? 'carrier' : behavior === 'sprinter' ? 'runner' : behavior === 'zigzag' ? 'twitcher' : 'walker';
    this.zombies.push({
      id: nid(), x, y, word: this.pickWord(), progress: 0, speed, behavior, variant, carrier,
      phase: Math.random() * 10, age: 0, flash: 0, pop: 0, kx: 0, ky: 0,
      doomed: false, deathAt: 0, deathWeapon: 'pistol', tagX: 0, tagY: 0, tagInit: false, facing: 1,
    });
  }

  // ---------------- input ----------------
  type(raw: string) {
    if (!this.running || this.paused || this.over) return;
    const ch = raw.toLowerCase();
    if (!/^[a-z]$/.test(ch)) return;
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
    if (!this.running || this.paused || this.boss.active) return;
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
    this.fireTracer(z.x, z.y - 10 * this.uiScale, z.id, done);
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

  private completeWord(z: Zombie) {
    const W = WEAPONS[this.weapon];
    const weaponUsed = this.weapon;
    const P = this.player;
    const travel = Math.hypot(z.x - P.x, z.y - P.y) / 3200;
    const victims: Zombie[] = [z];
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

    // pickup from any carrier in the blast
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

    // scoring (same formula as the original game)
    const n = victims.length;
    const diffMult = DIFFICULTY_CONFIG[this.difficulty].scoreMultiplier;
    const weaponMult = this.weapon === 'pistol' ? 1 : 1.5;
    const gained = Math.round((100 + z.word.length * 10) * n * this.combo * diffMult * weaponMult);
    this.score += gained;
    this.kills += n;
    this.killsTowardsBoss += n;
    this.popupAt(z.x, z.y - 40 * this.uiScale, `+${gained.toLocaleString()}`, COMBO_TIERS[this.tier].color, n > 1 ? 22 : 17, 1);
    if (n > 2) this.popupAt(z.x, z.y - 64 * this.uiScale, `${n}x MULTI`, '#ffffff', 15, 1.1);

    this.hitstop = Math.min(0.12, 0.045 + (n - 1) * 0.02 + (W.explosive ? 0.03 : 0));
    this.lockId = null;
    this.typed = '';

    if (!this.boss.active && this.bossPendingAt < 0 && this.killsTowardsBoss >= BOSS_THRESHOLD[this.difficulty]) {
      // let the kill land, then clear the field for the boss
      this.bossPendingAt = this.time + 0.35;
    }
  }

  private killFx(z: Zombie) {
    const W = WEAPONS[z.deathWeapon];
    const f = this.fxScale;
    audio.kill(1);
    if (W.explosive) {
      const big = z.deathWeapon === 'nuke' ? 3 : z.deathWeapon === 'bazooka' ? 2 : 1;
      this.explode(z.x, z.y, big, W.color);
    } else {
      this.corpses.push({ x: z.x, y: z.y + 6, rot: (Math.random() - 0.5) * 1.2 + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1), age: 0, max: 9, variant: z.variant, flip: Math.random() < 0.5 });
    }
    const P = this.player;
    const ang = Math.atan2(z.y - P.y, z.x - P.x);
    for (let i = 0; i < 26 * f; i++) {
      const a = ang + (Math.random() - 0.5) * 1.6;
      const s = 80 + Math.random() * 320;
      this.particles.push({ x: z.x, y: z.y - 8, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.5, max: 0.8, size: 1.5 + Math.random() * 3.5, color: Math.random() < 0.3 ? '#c4101e' : '#7d0710', kind: 'blood', drag: 0.02, grav: 0, rot: 0, vr: 0 });
    }
    for (let i = 0; i < 5 * f + 1; i++) {
      const a = ang + (Math.random() - 0.5) * 2.4;
      const s = 120 + Math.random() * 260;
      this.particles.push({ x: z.x, y: z.y - 8, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.5, max: 1, size: 3 + Math.random() * 3, color: '#5e1418', kind: 'gib', drag: 0.03, grav: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20 });
    }
    this.rings.push({ x: z.x, y: z.y - 8, r: 6, maxR: 46 * this.uiScale, life: 0.28, max: 0.28, color: '#ff3a4a', width: 3 });
    this.decals.push({ kind: 'blood', x: z.x + Math.cos(ang) * 14, y: z.y + Math.sin(ang) * 10, size: 16 + Math.random() * 10, rot: ang });
    this.burst(z.x, z.y - 8, 'glow', 1, '#ff4050', 0);
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

  private zombieHitsPlayer(z: Zombie) {
    z.doomed = true;
    z.deathAt = this.time;
    z.deathWeapon = 'pistol';
    if (this.lockId === z.id) { this.lockId = null; this.typed = ''; }
    this.loseLife(z.x, z.y);
  }

  private loseLife(x: number, y: number) {
    if (this.over) return;
    this.lives = Math.max(0, this.lives - 1);
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
    audio.hurt();
    this.rings.push({ x: P.x, y: P.y, r: 8, maxR: 120, life: 0.5, max: 0.5, color: '#ff2040', width: 5 });
    if (this.lives <= 0) {
      this.over = true;
      this.overT = 0;
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

  partOffset(part: BossPartName): [number, number] {
    switch (part) {
      case 'head': return [0, -96];
      case 'leftHand': return [-122, 4];
      case 'rightHand': return [122, 4];
      case 'leftFoot': return [-58, 112];
      case 'rightFoot': return [58, 112];
    }
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
    // clear the field dramatically
    for (const z of this.zombies) if (!z.doomed) { z.doomed = true; z.deathAt = this.time + 0.1 + Math.random() * 0.3; z.deathWeapon = 'grenade'; }
    this.lockId = null; this.typed = '';
    const used = new Set<string>();
    const word = () => {
      const pool = WORDS[this.difficulty].filter(w => !used.has(w));
      const w = pick(pool.length ? pool : WORDS[this.difficulty]);
      used.add(w);
      return w;
    };
    const parts: BossPart[] = (['head', 'leftHand', 'rightHand', 'leftFoot', 'rightFoot'] as BossPartName[])
      .map(part => ({ part, word: word(), progress: 0, destroyed: false, flash: 0, pop: 0, tagX: 0, tagY: 0, tagInit: false }));
    const scale = this.bossScale();
    this.boss = {
      active: true, stage: 'entering', x: this.layout.w / 2, y: -160 * scale, baseY: this.bossTargetY(), scale,
      parts, sentence: pick(BOSS_SENTENCES[this.difficulty]), sentenceIndex: 0,
      t: 0, stompT: 0, laserT: 0, charging: 0, stun: 0, flash: 0, dyingT: 0,
    };
    this.lasers = [];
    audio.bossEnter();
    this.showBanner('BOSS INCOMING', 'DESTROY EVERY LIMB', 'WARNING', 2.6, '#ff3a4a');
  }

  private updateBoss(dt: number) {
    const b = this.boss;
    if (!b.active) return;
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt * 6);
    b.stun = Math.max(0, b.stun - dt);
    b.parts.forEach(p => { p.flash = Math.max(0, p.flash - dt * 6); p.pop = Math.max(0, p.pop - dt * 7); });
    const L = this.layout;
    if (b.stage === 'entering') {
      b.stompT += dt;
      b.y += 70 * dt * (b.scale + 0.4);
      if (b.stompT > 0.55) {
        b.stompT = 0;
        this.shake = Math.min(1, this.shake + 0.3);
        audio.stomp();
        this.rings.push({ x: b.x, y: b.y + 120 * b.scale, r: 10, maxR: 160 * b.scale, life: 0.4, max: 0.4, color: '#ff3a4a', width: 3 });
      }
      if (b.y >= b.baseY) {
        b.y = b.baseY;
        b.stage = 'fight';
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
    const sway = b.stage === 'sentence' ? 26 : Math.min(140, (L.w / 2 - 150 * b.scale));
    b.x = L.w / 2 + Math.sin(b.t * 0.9) * Math.max(0, sway);
    b.y = b.baseY + Math.sin(b.t * 1.8) * (b.stage === 'sentence' ? 2 : 6);

    if (b.stage === 'fight' && b.stun <= 0) {
      b.laserT += dt;
      const interval = DIFFICULTY_CONFIG[this.difficulty].laserInterval;
      if (b.charging > 0) {
        b.charging -= dt;
        if (b.charging <= 0) this.fireLasers();
      } else if (b.t > 3.5 && b.laserT > interval) {
        b.charging = 0.85;
        b.laserT = 0;
        audio.laserCharge();
      }
    }
  }

  eyePositions(): Array<{ x: number; y: number }> {
    const b = this.boss;
    return [
      { x: b.x - 16 * b.scale, y: b.y - 98 * b.scale },
      { x: b.x + 16 * b.scale, y: b.y - 98 * b.scale },
    ];
  }

  private fireLasers() {
    const P = this.player;
    audio.laserFire();
    const speed = 340 * this.speedScale;
    this.eyePositions().forEach(e => {
      const d = Math.hypot(P.x - e.x, P.y - e.y) || 1;
      this.lasers.push({ x: e.x, y: e.y, vx: (P.x - e.x) / d * speed, vy: (P.y - e.y) / d * speed, age: 0 });
    });
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
      // destroying a limb staggers the boss and cancels its attack
      b.stun = 1.4; b.charging = 0; b.laserT = 0; this.lasers = [];
      const diffMult = DIFFICULTY_CONFIG[this.difficulty].scoreMultiplier;
      const gained = Math.round((100 + part.word.length * 10) * Math.max(1, this.combo) * diffMult);
      this.score += gained;
      this.popupAt(pos.x, pos.y - 30, `+${gained.toLocaleString()}`, '#ffd54a', 20, 1.1);
      if (b.parts.every(p => p.destroyed)) {
        b.stage = 'sentence';
        b.sentenceIndex = 0;
        this.showBanner('FINISH HIM', 'TYPE THE SENTENCE', 'EXECUTION', 1.8, '#ffd54a');
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
    const diffMult = DIFFICULTY_CONFIG[this.difficulty].scoreMultiplier;
    const gained = Math.round(1000 * this.level * diffMult + b.sentence.length * 20 * Math.max(1, this.combo));
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
    const healed = this.lives < MAX_LIVES;
    this.level++;
    this.killsTowardsBoss = 0;
    this.lives = MAX_LIVES;
    this.lasers = [];
    this.boss = this.emptyBoss();
    this.chapterUntil = this.time + 3;
    this.lastSpawn = this.time;
    audio.chapter();
    const sub = this.accuracyPct > 90 ? (healed ? 'PRECISION BONUS · LIVES RESTORED' : 'PRECISION BONUS · PERFECT CLEAR') : (healed ? 'BOSS DOWN · LIVES RESTORED' : 'BOSS DOWN');
    this.showBanner(`CHAPTER ${this.level}`, sub, 'CLEARED', 2.8, '#3df6ff');
  }

  // ---------------- queries ----------------
  aimTarget(): { x: number; y: number } | null {
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
      const d = Math.hypot(z.x - this.player.x, z.y - this.player.y);
      if (d < bd) { bd = d; best = z; }
    }
    return best;
  }

  stats(): RunStats {
    return {
      score: this.score, kills: this.kills, level: this.level, maxCombo: this.maxCombo,
      wpm: this.wpm, accuracyPct: this.accuracyPct, difficulty: this.difficulty,
      durationMs: Math.round(this.activeTime * 1000), correct: this.correct, mistakes: this.mistakes,
    };
  }
}
