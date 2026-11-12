// Canvas renderer. DPR-correct, no per-frame shadowBlur (glow comes from cached
// radial textures drawn additively), persistent decal layer for blood and scorch.

import { BOSS_THRESHOLD, COMBO_TIERS, DIFFICULTY_CONFIG, MAX_LIVES, WEAPONS } from './config';
import type { Boss, BossPart, Game, Zombie } from './engine';
import { buildAtlas, rgba, type Atlas } from './sprites';

const DISPLAY = '"Chakra Petch", "Rajdhani", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];

interface Rect { x: number; y: number; w: number; h: number }

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private atlas!: Atlas;
  private ground!: HTMLCanvasElement;
  private decal!: HTMLCanvasElement;
  private decalCtx!: CanvasRenderingContext2D;
  private decalScale = 1;
  private fog!: HTMLCanvasElement;
  private scan!: CanvasPattern | null;
  private vignette!: HTMLCanvasElement;
  private decalEpoch = -1;
  private charW = new Map<string, number>();
  private t = 0;

  constructor(private canvas: HTMLCanvasElement, private game: Game) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  fontsChanged() { this.charW.clear(); }

  resize(w: number, h: number, dpr: number) {
    const resized = w !== this.w || h !== this.h || dpr !== this.dpr;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const scale = this.game.layout.compact ? 2 : h >= 860 ? 4 : 3;
    if (!this.atlas || this.atlas.scale !== scale) this.atlas = buildAtlas(scale);
    if (resized || !this.ground) {
      this.buildGround();
      this.buildFog();
      this.buildVignette();
      const old = this.decal;
      this.decalScale = Math.min(dpr, 1.5);
      this.decal = document.createElement('canvas');
      this.decal.width = Math.round(w * this.decalScale);
      this.decal.height = Math.round(h * this.decalScale);
      this.decalCtx = this.decal.getContext('2d')!;
      if (old) this.decalCtx.drawImage(old, 0, 0, this.decal.width, this.decal.height);
    }
    const sc = document.createElement('canvas');
    sc.width = 1; sc.height = 3;
    const sg = sc.getContext('2d')!;
    sg.fillStyle = 'rgba(0,0,0,0.22)';
    sg.fillRect(0, 2, 1, 1);
    this.scan = this.ctx.createPattern(sc, 'repeat');
    this.charW.clear();
  }

  // ---------------- static layers ----------------
  private buildGround() {
    const { w, h } = this;
    const c = document.createElement('canvas');
    const s = Math.min(this.dpr, 2);
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    const g = c.getContext('2d')!;
    g.scale(s, s);
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#0c1018');
    base.addColorStop(1, '#10131c');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // concrete blotches
    for (let i = 0; i < (w * h) / 9000; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 30 + Math.random() * 120;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const light = Math.random() < 0.5;
      gr.addColorStop(0, light ? 'rgba(60,70,90,0.07)' : 'rgba(0,0,0,0.25)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // grit
    for (let i = 0; i < (w * h) / 60; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? `rgba(255,255,255,${0.012 + Math.random() * 0.03})` : `rgba(0,0,0,${0.15 + Math.random() * 0.2})`;
      const sz = Math.random() < 0.9 ? 1 : 2;
      g.fillRect(Math.random() * w, Math.random() * h, sz, sz);
    }
    // slab seams
    const tile = this.game.layout.compact ? 56 : 72;
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 1.5;
    for (let x = (w / 2) % tile; x < w; x += tile) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = (h / 2) % tile; y < h; y += tile) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = 'rgba(90,200,255,0.035)';
    g.lineWidth = 1;
    for (let x = (w / 2) % tile + 1.5; x < w; x += tile) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = (h / 2) % tile + 1.5; y < h; y += tile) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    // cracks
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    for (let i = 0; i < (w * h) / 60000 + 4; i++) {
      let x = Math.random() * w, y = Math.random() * h;
      g.lineWidth = 1 + Math.random();
      g.beginPath(); g.moveTo(x, y);
      const a0 = Math.random() * Math.PI * 2;
      for (let k = 0; k < 6 + Math.random() * 8; k++) {
        const a = a0 + (Math.random() - 0.5) * 1.4;
        x += Math.cos(a) * (6 + Math.random() * 14); y += Math.sin(a) * (6 + Math.random() * 14);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // distant neon spill (street signs, burning cars) for colour depth
    const spills = ['rgba(255,60,200,0.07)', 'rgba(61,246,255,0.06)', 'rgba(255,150,40,0.06)', 'rgba(120,90,255,0.06)'];
    for (let i = 0; i < 5; i++) {
      const edge = Math.random() < 0.5;
      const x = edge ? (Math.random() < 0.5 ? 0 : w) : Math.random() * w;
      const y = edge ? Math.random() * h : (Math.random() < 0.5 ? 0 : h);
      const r = Math.max(w, h) * (0.18 + Math.random() * 0.2);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, spills[i % spills.length]);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // painted defense perimeter around the player
    const P = this.game.player;
    const R = this.game.layout.compact ? 64 : 110;
    g.save();
    g.strokeStyle = 'rgba(61,246,255,0.10)';
    g.lineWidth = 2;
    g.setLineDash([10, 8]);
    g.beginPath(); g.arc(P.x, P.y, R, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = 'rgba(255,190,60,0.07)';
    g.lineWidth = 6;
    g.beginPath(); g.arc(P.x, P.y, R + 10, 0, Math.PI * 2); g.stroke();
    g.restore();
    this.ground = c;
  }

  private buildFog() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * size, y = Math.random() * size, r = 40 + Math.random() * 110;
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, 'rgba(120,140,170,0.05)');
        gr.addColorStop(1, 'rgba(120,140,170,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    this.fog = c;
  }

  private buildVignette() {
    const { w, h } = this;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w / 2)); c.height = Math.max(1, Math.round(h / 2));
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(c.width / 2, c.height * 0.55, Math.min(c.width, c.height) * 0.25, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.78)');
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    this.vignette = c;
  }

  // ---------------- decals ----------------
  private flushDecals() {
    const G = this.game;
    if (G.decalEpoch !== this.decalEpoch) {
      this.decalEpoch = G.decalEpoch;
      this.decalCtx.clearRect(0, 0, this.decal.width, this.decal.height);
    }
    if (!G.decals.length) return;
    const g = this.decalCtx;
    g.save();
    g.setTransform(this.decalScale, 0, 0, this.decalScale, 0, 0);
    for (const d of G.decals) {
      if (d.kind === 'blood') {
        const n = 3 + Math.floor(Math.random() * 5);
        for (let i = 0; i < n; i++) {
          const r = d.size * (0.25 + Math.random() * 0.5);
          const ox = (Math.random() - 0.5) * d.size * 1.2, oy = (Math.random() - 0.5) * d.size * 0.8;
          g.fillStyle = Math.random() < 0.3 ? 'rgba(90,0,8,0.55)' : 'rgba(60,0,6,0.5)';
          g.beginPath();
          g.ellipse(d.x + ox, d.y + oy, r, r * (0.6 + Math.random() * 0.4), d.rot, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = 'rgba(140,10,20,0.35)';
        g.beginPath(); g.arc(d.x, d.y, d.size * 0.18, 0, Math.PI * 2); g.fill();
      } else if (d.kind === 'scorch') {
        const gr = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.size);
        gr.addColorStop(0, 'rgba(0,0,0,0.75)');
        gr.addColorStop(0.6, 'rgba(10,6,4,0.45)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(d.x - d.size, d.y - d.size, d.size * 2, d.size * 2);
        g.strokeStyle = 'rgba(255,140,40,0.08)';
        g.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          g.beginPath(); g.moveTo(d.x + Math.cos(a) * d.size * 0.3, d.y + Math.sin(a) * d.size * 0.3);
          g.lineTo(d.x + Math.cos(a) * d.size * 0.9, d.y + Math.sin(a) * d.size * 0.9); g.stroke();
        }
      } else if (d.kind === 'bones') {
        g.save();
        g.translate(d.x, d.y); g.rotate(d.rot);
        g.fillStyle = 'rgba(210,205,190,0.55)';
        const s = this.game.layout.compact ? 0.7 : 1;
        g.fillRect(-12 * s, -1, 24 * s, 2.5);
        g.fillRect(-5 * s, -8 * s, 9 * s, 7 * s);
        g.fillRect(-9 * s, 4 * s, 6 * s, 2);
        g.fillRect(4 * s, 4 * s, 6 * s, 2);
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(-3 * s, -6 * s, 2, 2); g.fillRect(1 * s, -6 * s, 2, 2);
        g.restore();
      } else if (d.kind === 'crater') {
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.lineWidth = 3;
        g.beginPath(); g.ellipse(d.x, d.y, d.size, d.size * 0.4, 0, 0, Math.PI * 2); g.stroke();
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2;
          g.beginPath(); g.moveTo(d.x + Math.cos(a) * d.size, d.y + Math.sin(a) * d.size * 0.4);
          g.lineTo(d.x + Math.cos(a) * d.size * 1.6, d.y + Math.sin(a) * d.size * 0.6); g.stroke();
        }
      }
    }
    g.restore();
    G.decals.length = 0;
  }

  // ---------------- helpers ----------------
  private glow(img: HTMLCanvasElement, x: number, y: number, r: number, a: number) {
    if (a <= 0.01 || r <= 0) return;
    const c = this.ctx;
    c.globalAlpha = Math.min(1, a);
    c.drawImage(img, x - r, y - r, r * 2, r * 2);
  }

  private cw(font: string): number {
    let v = this.charW.get(font);
    if (v === undefined) {
      this.ctx.font = font;
      v = this.ctx.measureText('M').width;
      this.charW.set(font, v);
    }
    return v;
  }

  private rr(x: number, y: number, w: number, h: number, r: number) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  private place(desired: Rect, placed: Rect[]): Rect {
    const L = this.game.layout;
    const minX = 6, maxX = this.w - desired.w - 6;
    const minY = L.topPad + 4, maxY = this.h - L.bottomPad - desired.h - 4;
    const clamp = (r: Rect): Rect => ({ ...r, x: Math.max(minX, Math.min(maxX, r.x)), y: Math.max(minY, Math.min(maxY, r.y)) });
    const hit = (a: Rect, b: Rect) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    const base = clamp(desired);
    if (!placed.some(p => hit(base, p))) { placed.push(base); return base; }
    for (let ring = 1; ring <= 10; ring++) {
      const dy = ring * (desired.h + 2) * 0.6, dx = ring * 18;
      const cands = [
        { ...base, y: base.y - dy }, { ...base, y: base.y + dy },
        { ...base, x: base.x - dx }, { ...base, x: base.x + dx },
        { ...base, x: base.x - dx, y: base.y - dy }, { ...base, x: base.x + dx, y: base.y - dy },
      ].map(clamp);
      const ok = cands.find(c => !placed.some(p => hit(c, p)));
      if (ok) { placed.push(ok); return ok; }
    }
    placed.push(base);
    return base;
  }

  // ---------------- frame ----------------
  draw(dt: number) {
    this.t += dt;
    const G = this.game;
    const c = this.ctx;
    const { w, h } = this;
    const L = G.layout;
    this.flushDecals();

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';

    // camera
    const tr = G.shake * G.shake;
    const maxOff = L.compact ? 10 : 18;
    const sx = (Math.sin(this.t * 61.3) + Math.sin(this.t * 37.1) * 0.6) * maxOff * tr + G.kick.x;
    const sy = (Math.cos(this.t * 53.7) + Math.sin(this.t * 41.9) * 0.6) * maxOff * tr + G.kick.y;
    const zoom = 1 + G.zoom;
    c.save();
    c.translate(G.player.x, G.player.y);
    c.scale(zoom, zoom);
    c.rotate(Math.sin(this.t * 47) * 0.012 * tr);
    c.translate(-G.player.x + sx, -G.player.y + sy);

    // pad bleed so shake never shows an edge
    c.fillStyle = '#05060a';
    c.fillRect(-40, -40, w + 80, h + 80);
    c.drawImage(this.ground, 0, 0, w, h);
    c.drawImage(this.decal, 0, 0, w, h);
    const sat = Math.min(G.kills * 0.003, 0.09);
    if (sat > 0) { c.fillStyle = `rgba(90,0,0,${sat})`; c.fillRect(0, 0, w, h); }

    // light pool
    c.globalCompositeOperation = 'lighter';
    const P = G.player;
    const flick = 0.85 + Math.sin(this.t * 13) * 0.03 + Math.sin(this.t * 31) * 0.02;
    this.glow(this.atlas.glow.cyan, P.x, P.y, (L.compact ? 170 : 320), 0.14 * flick);
    this.glow(this.atlas.glow.white, P.x, P.y, (L.compact ? 110 : 200), 0.05 * flick);
    this.glow(this.atlas.glow.orange, P.x, P.y - 10, (L.compact ? 60 : 90), 0.06 + P.muzzle * 0.25);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;

    this.drawCorpses();
    this.drawParticles(false);

    // characters, sorted by y for depth
    const zs = [...G.zombies].sort((a, b) => a.y - b.y);
    for (const z of zs) this.drawZombie(z);
    if (G.boss.active) this.drawBoss(G.boss);
    this.drawPlayer();

    c.globalCompositeOperation = 'lighter';
    this.drawTracers();
    this.drawLasers();
    this.drawParticles(true);
    this.drawRings();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;

    // drifting fog
    c.globalAlpha = 1;
    const fs = 512, fx = (this.t * 8) % fs, fy = (this.t * 3) % fs;
    for (let x = -fs + fx; x < w; x += fs) for (let y = -fs + fy; y < h; y += fs) c.drawImage(this.fog, x, y);

    const live = G.running || G.over;
    // word tags and markers (inside camera so they track their owners)
    // HUD blocks are pre-reserved so tags never slide underneath them
    const placed: Rect[] = L.compact ? [
      { x: 0, y: 0, w, h: L.topPad + 2 },
      { x: 0, y: h - 48, w: 136, h: 48 },
    ] : [
      { x: 0, y: 0, w: 230, h: 116 },
      { x: w / 2 - 200, y: 0, w: 400, h: 104 },
      { x: w - 330, y: 0, w: 330, h: 70 },
      { x: 0, y: h - 70, w: 240, h: 70 },
    ];
    if (!live) { c.restore(); c.globalAlpha = 1; c.drawImage(this.vignette, 0, 0, w, h); this.drawPost(); return; }
    if (G.boss.active) this.drawBossTags(G.boss, placed);
    const lock = G.zombies.find(z => z.id === G.lockId && !z.doomed);
    const closest = lock ? null : G.closest();
    const ordered = [...G.zombies].sort((a, b) => Number(b.id === G.lockId) - Number(a.id === G.lockId) || Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y));
    for (const z of ordered) this.drawTag(z, z === lock, z === closest, !!lock, placed);
    if (lock) this.drawLockBrackets(lock);
    this.drawPopups();
    c.restore();

    c.globalAlpha = 1;
    c.drawImage(this.vignette, 0, 0, w, h);

    this.drawHud();
    this.drawBanner();
    this.drawPost();
  }

  // ---------------- world objects ----------------
  private drawCorpses() {
    const c = this.ctx;
    for (const k of this.game.corpses) {
      const set = this.atlas.zombies[k.variant];
      const decay = k.age / k.max;
      c.save();
      c.translate(k.x, k.y);
      c.rotate(k.rot);
      if (k.flip) c.scale(-1, 1);
      c.globalAlpha = 0.8 * (1 - decay) * (1 - decay);
      c.drawImage(set.frames[0], -set.w / 2, -set.h / 2);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  private drawZombie(z: Zombie) {
    const c = this.ctx;
    const G = this.game;
    const set = this.atlas.zombies[z.variant];
    const t = z.phase;
    const gait = z.behavior === 'sprinter' ? 9 : z.behavior === 'zigzag' ? 7 : 4.5;
    const frame = Math.floor(t * gait) % 2;
    const bob = Math.abs(Math.sin(t * gait * Math.PI / 2)) * 2;
    const spawnA = Math.min(1, z.age * 3);
    const doomedT = z.doomed ? Math.max(0, z.deathAt - G.time) : 0;
    const sq = 1 + z.pop * 0.06;
    const x = Math.round(z.x), y = Math.round(z.y - bob);

    // shadow
    c.globalAlpha = 0.55 * spawnA;
    c.drawImage(this.atlas.glow.shadow, x - set.w * 0.55, z.y + set.h * 0.32, set.w * 1.1, set.h * 0.32);

    c.save();
    c.translate(x, y);
    if (z.behavior === 'zigzag') c.rotate(Math.sin(t * 12) * 0.08);
    c.scale(z.facing * sq, 1 / sq);
    c.globalAlpha = spawnA;
    c.drawImage(set.frames[frame], -set.w / 2, -set.h / 2);
    const fl = Math.max(z.flash, z.doomed ? 0.6 + Math.sin(doomedT * 80) * 0.4 : 0);
    if (fl > 0.02) {
      c.globalAlpha = fl * spawnA;
      c.drawImage(set.flash[frame], -set.w / 2, -set.h / 2);
    }
    c.restore();

    // eye glow + carrier pack glow
    c.globalCompositeOperation = 'lighter';
    const s = this.atlas.scale;
    const ey = y - set.h / 2 + 4.5 * s;
    const eyeImg = z.variant === 'runner' ? this.atlas.glow.yellow : z.variant === 'twitcher' ? this.atlas.glow.cyan : z.variant === 'carrier' ? this.atlas.glow.magenta : this.atlas.glow.red;
    this.glow(eyeImg, x, ey, 9 * s / 3 * 2.2, 0.55 * spawnA);
    if (z.carrier) {
      const col = WEAPONS[z.carrier].color;
      const pulse = 0.5 + Math.sin(this.t * 6 + z.id) * 0.25;
      this.glow(this.atlas.softGlow(rgba(col, 0.9)), x + 4 * s * z.facing, y, 26 * s / 3, pulse);
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  private drawPlayer() {
    const c = this.ctx;
    const G = this.game;
    const P = G.player;
    const L = G.layout;
    const s = this.atlas.scale;
    const img = this.atlas.player;
    // pad
    const padR = (L.compact ? 22 : 30);
    c.save();
    c.translate(P.x, P.y + img.height * 0.32);
    c.scale(1, 0.42);
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = rgba('#3df6ff', 0.55);
    c.lineWidth = 2.5;
    c.beginPath(); c.arc(0, 0, padR, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = rgba('#3df6ff', 0.25);
    c.setLineDash([6, 8]);
    c.lineDashOffset = -this.t * 30;
    c.beginPath(); c.arc(0, 0, padR + 9, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);
    c.restore();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 0.6;
    c.drawImage(this.atlas.glow.shadow, P.x - img.width * 0.6, P.y + img.height * 0.25, img.width * 1.2, img.height * 0.3);
    c.globalAlpha = 1;

    const facing = Math.cos(P.aim) < 0 ? -1 : 1;
    const breathe = Math.sin(P.bob * 2.2) * 0.8;
    c.save();
    c.translate(Math.round(P.x), Math.round(P.y + breathe * 0.5));
    if (P.hurt > 0) c.translate((Math.random() - 0.5) * 6 * P.hurt, 0);
    c.scale(facing, 1);
    c.drawImage(img, -img.width / 2, -img.height / 2);
    if (P.hurt > 0.4) {
      c.globalCompositeOperation = 'source-atop';
      c.globalAlpha = (P.hurt - 0.4);
      c.fillStyle = '#ff2040';
      c.fillRect(-img.width / 2, -img.height / 2, img.width, img.height);
    }
    c.restore();
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';

    // gun
    const W = WEAPONS[G.weapon];
    const gx = P.x, gy = P.y - 2 * s;
    const len = (G.weapon === 'pistol' ? 9 : G.weapon === 'machinegun' ? 12 : 14) * s - P.recoil * 2.5 * s;
    const thick = (G.weapon === 'pistol' ? 2 : 3) * s;
    c.save();
    c.translate(gx, gy);
    c.rotate(P.aim);
    c.fillStyle = '#0a0d12';
    c.fillRect(-1 * s, -thick / 2 - s * 0.6, len + 2 * s, thick + s * 1.2);
    c.fillStyle = G.weapon === 'pistol' ? '#6f7f90' : W.color;
    c.fillRect(0, -thick / 2, len, thick);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(s, -thick / 2, len - 2 * s, Math.max(1, s * 0.6));
    c.restore();

    c.globalCompositeOperation = 'lighter';
    const mx = gx + Math.cos(P.aim) * (len + 4), my = gy + Math.sin(P.aim) * (len + 4);
    if (P.muzzle > 0) {
      this.glow(this.atlas.softGlow(rgba(W.color === '#d8f6ff' ? '#ffd27a' : W.color, 0.95)), mx, my, 18 + P.muzzle * 22, P.muzzle);
      this.glow(this.atlas.glow.white, mx, my, 6 + P.muzzle * 8, P.muzzle);
    }
    if (G.weapon !== 'pistol') this.glow(this.atlas.softGlow(rgba(W.color, 0.8)), gx, gy, 22, 0.25 + G.weaponPulse * 0.5);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  private drawTracers() {
    const c = this.ctx;
    c.lineCap = 'round';
    for (const t of this.game.tracers) {
      const a = t.done ? Math.max(0, 1 - t.age / 0.05) : 1;
      const dx = t.x - t.px, dy = t.y - t.py;
      const len = Math.hypot(dx, dy);
      const tail = Math.min(len * 2.2 + 30, 140);
      const ux = len > 0 ? dx / len : 0, uy = len > 0 ? dy / len : 0;
      const grad = c.createLinearGradient(t.x - ux * tail, t.y - uy * tail, t.x, t.y);
      grad.addColorStop(0, rgba(t.color, 0));
      grad.addColorStop(1, rgba(t.color, 0.95 * a));
      c.strokeStyle = grad;
      c.lineWidth = t.width + 2;
      c.globalAlpha = 0.45;
      c.beginPath(); c.moveTo(t.x - ux * tail, t.y - uy * tail); c.lineTo(t.x, t.y); c.stroke();
      c.globalAlpha = 1;
      c.lineWidth = Math.max(1, t.width * 0.6);
      c.strokeStyle = rgba('#ffffff', 0.9 * a);
      c.beginPath(); c.moveTo(t.x - ux * tail * 0.4, t.y - uy * tail * 0.4); c.lineTo(t.x, t.y); c.stroke();
      this.glow(this.atlas.softGlow(rgba(t.color, 0.9)), t.x, t.y, t.final ? 16 : 8, 0.8 * a);
    }
    c.globalAlpha = 1;
  }

  private drawLasers() {
    const c = this.ctx;
    const G = this.game;
    const b = G.boss;
    if (b.active && b.charging > 0) {
      const k = 1 - b.charging / 0.85;
      c.setLineDash([8, 10]);
      c.lineDashOffset = -this.t * 80;
      c.strokeStyle = rgba('#ff2a3a', 0.15 + k * 0.45);
      c.lineWidth = 1 + k * 2;
      for (const e of G.eyePositions()) {
        c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(G.player.x, G.player.y); c.stroke();
        this.glow(this.atlas.glow.red, e.x, e.y, 10 + k * 26, 0.5 + k * 0.5);
      }
      c.setLineDash([]);
    }
    for (const l of G.lasers) {
      const sp = Math.hypot(l.vx, l.vy) || 1;
      const ux = l.vx / sp, uy = l.vy / sp;
      c.strokeStyle = rgba('#ff2a3a', 0.9);
      c.lineWidth = 6;
      c.globalAlpha = 0.5;
      c.beginPath(); c.moveTo(l.x - ux * 46, l.y - uy * 46); c.lineTo(l.x, l.y); c.stroke();
      c.globalAlpha = 1;
      c.strokeStyle = '#ffd0d4';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(l.x - ux * 30, l.y - uy * 30); c.lineTo(l.x, l.y); c.stroke();
      this.glow(this.atlas.glow.red, l.x, l.y, 22, 0.9);
    }
  }

  private drawParticles(additive: boolean) {
    const c = this.ctx;
    for (const p of this.game.particles) {
      const isAdd = p.kind === 'spark' || p.kind === 'ember' || p.kind === 'glow';
      if (isAdd !== additive) continue;
      const k = Math.max(0, p.life / p.max);
      if (p.kind === 'glow') {
        this.glow(this.atlas.softGlow(rgba(p.color.startsWith('#') ? p.color : '#ffffff', 0.9)), p.x, p.y, p.size * (1.4 - k * 0.4), k * 0.9);
        continue;
      }
      if (p.kind === 'spark') {
        c.globalAlpha = k;
        c.strokeStyle = p.color;
        c.lineWidth = p.size;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); c.stroke();
        continue;
      }
      if (p.kind === 'ember') {
        c.globalAlpha = k;
        c.fillStyle = p.color;
        const s = p.size * (0.5 + k * 0.5);
        c.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        this.glow(this.atlas.glow.orange, p.x, p.y, s * 3, k * 0.35);
        continue;
      }
      if (p.kind === 'smoke') {
        c.globalAlpha = Math.min(1, k * 1.5) * 0.5;
        c.drawImage(this.atlas.glow.shadow, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
        continue;
      }
      c.globalAlpha = Math.min(1, k * 2);
      c.fillStyle = p.color;
      if (p.kind === 'gib' || p.kind === 'debris' || p.kind === 'shell') {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        if (p.kind === 'gib') { c.fillStyle = '#e8d7c0'; c.fillRect(-1, -1, 2, 2); }
        c.restore();
      } else {
        c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    c.globalAlpha = 1;
  }

  private drawRings() {
    const c = this.ctx;
    for (const r of this.game.rings) {
      const k = r.life / r.max;
      c.globalAlpha = k;
      c.strokeStyle = r.color;
      c.lineWidth = r.width * k + 0.5;
      c.beginPath(); c.arc(r.x, r.y, r.r, 0, Math.PI * 2); c.stroke();
    }
    c.globalAlpha = 1;
  }

  private drawPopups() {
    const c = this.ctx;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const p of this.game.popups) {
      const k = p.life / p.max;
      const inT = Math.min(1, (1 - k) * 8);
      const s = 0.6 + inT * 0.4 + (1 - inT) * 0.4;
      c.globalAlpha = Math.min(1, k * 2.5);
      c.font = `700 ${Math.round(p.size * s)}px ${DISPLAY}`;
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(0,0,0,0.85)';
      c.strokeText(p.text, p.x, p.y);
      c.fillStyle = p.color;
      c.fillText(p.text, p.x, p.y);
    }
    c.globalAlpha = 1;
    c.textBaseline = 'alphabetic';
  }

  // ---------------- tags ----------------
  private tagFont() {
    const fs = this.game.layout.compact ? 14 : 17;
    return { fs, font: `700 ${fs}px ${MONO}` };
  }

  private drawWordPlate(
    word: string, progress: number, rect: Rect, opts: { state: 'lock' | 'next' | 'idle' | 'dim'; carrier?: string | null; pop: number; label?: string; labelColor?: string },
  ) {
    const c = this.ctx;
    const { fs, font } = this.tagFont();
    const cw = this.cw(font);
    const { x, y, w, h } = rect;
    const s = 1 + opts.pop * 0.1;
    c.save();
    c.translate(x + w / 2, y + h / 2);
    c.scale(s, s);
    c.translate(-w / 2, -h / 2);
    const dim = opts.state === 'dim' ? 0.5 : 1;
    c.globalAlpha = dim;
    if (opts.state === 'lock') {
      c.globalCompositeOperation = 'lighter';
      this.glow(this.atlas.glow.cyan, w / 2, h / 2, w * 0.7, 0.18);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = dim;
    }
    this.rr(0, 0, w, h, 5);
    c.fillStyle = opts.state === 'lock' ? 'rgba(4,22,30,0.92)' : opts.carrier ? 'rgba(28,8,34,0.9)' : 'rgba(6,9,15,0.84)';
    c.fill();
    c.lineWidth = opts.state === 'lock' ? 1.8 : 1.2;
    if (opts.carrier) {
      c.strokeStyle = rgba(opts.carrier, opts.state === 'lock' ? 1 : 0.8);
      if (opts.state !== 'lock') { c.setLineDash([4, 3]); c.lineDashOffset = -this.t * 20; }
    } else {
      c.strokeStyle = opts.state === 'lock' ? '#3df6ff' : opts.state === 'next' ? 'rgba(255,255,255,0.55)' : 'rgba(140,170,200,0.22)';
    }
    c.stroke();
    c.setLineDash([]);
    // top sheen
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.fillRect(3, 1.5, w - 6, 1);

    c.font = font;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    const tx = (w - word.length * cw) / 2;
    const ty = h / 2 + 1;
    for (let i = 0; i < word.length; i++) {
      const lx = tx + i * cw;
      if (i < progress) {
        c.fillStyle = '#41ffb4';
        c.globalAlpha = dim * 0.95;
        c.fillText(word[i], lx, ty);
      } else if (i === progress && opts.state === 'lock') {
        c.globalAlpha = dim;
        c.fillStyle = '#ffffff';
        c.fillText(word[i], lx, ty);
        const blink = 0.55 + Math.sin(this.t * 10) * 0.45;
        c.fillStyle = rgba('#3df6ff', blink);
        c.fillRect(lx, h - 5, cw - 1, 2);
      } else {
        c.globalAlpha = dim * (opts.state === 'idle' ? 0.82 : 0.95);
        c.fillStyle = i === 0 && opts.state === 'next' ? '#ffe58a' : '#e6eef8';
        c.fillText(word[i], lx, ty);
      }
    }
    if (opts.label) {
      c.globalAlpha = dim;
      c.font = `700 ${Math.round(fs * 0.62)}px ${DISPLAY}`;
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      c.fillStyle = opts.labelColor ?? '#ffffff';
      c.fillText(opts.label, w / 2, -4);
    }
    c.restore();
    c.globalAlpha = 1;
    c.textBaseline = 'alphabetic';
    void fs;
  }

  private drawTag(z: Zombie, locked: boolean, next: boolean, anyLock: boolean, placed: Rect[]) {
    if (z.doomed) return;
    const c = this.ctx;
    const set = this.atlas.zombies[z.variant];
    const { fs, font } = this.tagFont();
    const cw = this.cw(font);
    const w = Math.ceil(z.word.length * cw + 16);
    const h = fs + 11;
    const extra = z.carrier ? fs * 0.7 : 0;
    const desired = { x: z.x - w / 2, y: z.y - set.h / 2 - h - 8 - extra, w, h: h + extra };
    const r = this.place(desired, placed);
    if (!z.tagInit) { z.tagX = r.x; z.tagY = r.y; z.tagInit = true; }
    z.tagX += (r.x - z.tagX) * 0.35;
    z.tagY += (r.y - z.tagY) * 0.35;
    const spawnA = Math.min(1, z.age * 3);
    // leader line
    c.globalAlpha = 0.25 * spawnA;
    c.strokeStyle = locked ? '#3df6ff' : '#8aa0b8';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(z.tagX + w / 2, z.tagY + extra + h); c.lineTo(z.x, z.y - set.h / 2 + 2); c.stroke();
    c.globalAlpha = 1;
    const state: 'lock' | 'next' | 'idle' | 'dim' = locked ? 'lock' : anyLock ? 'dim' : next ? 'next' : 'idle';
    const carrierCol = z.carrier ? WEAPONS[z.carrier].color : null;
    c.globalAlpha = spawnA;
    this.drawWordPlate(z.word, locked ? z.progress : 0, { x: z.tagX, y: z.tagY + extra, w, h }, {
      state, carrier: carrierCol, pop: locked ? z.pop : 0,
      label: z.carrier ? `◆ ${WEAPONS[z.carrier].short}` : undefined, labelColor: carrierCol ?? undefined,
    });
  }

  private drawLockBrackets(z: Zombie) {
    const c = this.ctx;
    const set = this.atlas.zombies[z.variant];
    const pad = 6 + Math.sin(this.t * 8) * 2;
    const x0 = z.x - set.w / 2 - pad, y0 = z.y - set.h / 2 - pad, x1 = z.x + set.w / 2 + pad, y1 = z.y + set.h / 2 + pad;
    const L = 8;
    c.strokeStyle = '#3df6ff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x0, y0 + L); c.lineTo(x0, y0); c.lineTo(x0 + L, y0);
    c.moveTo(x1 - L, y0); c.lineTo(x1, y0); c.lineTo(x1, y0 + L);
    c.moveTo(x1, y1 - L); c.lineTo(x1, y1); c.lineTo(x1 - L, y1);
    c.moveTo(x0 + L, y1); c.lineTo(x0, y1); c.lineTo(x0, y1 - L);
    c.stroke();
  }

  // ---------------- boss ----------------
  private drawBoss(b: Boss) {
    const c = this.ctx;
    const G = this.game;
    const S = b.scale;
    const x = b.x, y = b.y;
    const part = (n: string) => b.parts.find(p => p.part === n)!;
    const steel = '#1a2030', steel2 = '#2a3448', edge = '#05070b';
    const flash = b.flash + (b.stage === 'dying' ? 0.4 + Math.sin(b.dyingT * 40) * 0.4 : 0);
    const shakeX = b.stage === 'dying' ? (Math.random() - 0.5) * 8 : b.stun > 0 ? Math.sin(b.t * 60) * 3 * b.stun : 0;

    c.globalAlpha = 0.6;
    c.drawImage(this.atlas.glow.shadow, x - 150 * S, y + 100 * S, 300 * S, 70 * S);
    c.globalAlpha = 1;
    c.save();
    c.translate(x + shakeX, y);
    c.scale(S, S);
    c.lineJoin = 'round';

    const limb = (x0: number, y0: number, x1: number, y1: number, wdt: number, destroyed: boolean) => {
      const ex = destroyed ? x0 + (x1 - x0) * 0.45 : x1, ey = destroyed ? y0 + (y1 - y0) * 0.45 : y1;
      c.strokeStyle = edge; c.lineWidth = wdt + 6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(ex, ey); c.stroke();
      c.strokeStyle = steel2; c.lineWidth = wdt;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(ex, ey); c.stroke();
      c.strokeStyle = 'rgba(61,246,255,0.35)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(ex, ey); c.stroke();
      if (destroyed) {
        c.fillStyle = '#ff6a2a';
        c.beginPath(); c.arc(ex, ey, wdt * 0.35, 0, Math.PI * 2); c.fill();
      }
      return { ex, ey };
    };
    const walk = Math.sin(b.t * 3) * 6;
    // legs
    const lf = part('leftFoot'), rf = part('rightFoot');
    const l1 = limb(-36, 70, -58, 112 + walk * 0.3, 30, lf.destroyed);
    const r1 = limb(36, 70, 58, 112 - walk * 0.3, 30, rf.destroyed);
    if (!lf.destroyed) { c.fillStyle = edge; c.fillRect(l1.ex - 26, l1.ey - 4, 44, 18); c.fillStyle = steel; c.fillRect(l1.ex - 23, l1.ey - 1, 38, 12); }
    if (!rf.destroyed) { c.fillStyle = edge; c.fillRect(r1.ex - 18, r1.ey - 4, 44, 18); c.fillStyle = steel; c.fillRect(r1.ex - 15, r1.ey - 1, 38, 12); }
    // arms
    const lh = part('leftHand'), rh = part('rightHand');
    const sway = Math.sin(b.t * 2.4) * 8;
    const la = limb(-62, -30, -122, 4 + sway, 24, lh.destroyed);
    const ra = limb(62, -30, 122, 4 - sway, 24, rh.destroyed);
    const claw = (cx: number, cy: number, dir: number) => {
      c.fillStyle = edge;
      c.beginPath(); c.arc(cx, cy, 20, 0, Math.PI * 2); c.fill();
      c.fillStyle = steel2;
      c.beginPath(); c.arc(cx, cy, 16, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#c8d4e6'; c.lineWidth = 4; c.lineCap = 'round';
      for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(cx + dir * 10, cy + i * 8); c.lineTo(cx + dir * 26, cy + i * 12 + 8); c.stroke(); }
    };
    if (!lh.destroyed) claw(la.ex, la.ey, -1);
    if (!rh.destroyed) claw(ra.ex, ra.ey, 1);
    // torso
    c.fillStyle = edge;
    c.beginPath(); c.moveTo(-74, -54); c.lineTo(74, -54); c.lineTo(52, 84); c.lineTo(-52, 84); c.closePath(); c.fill();
    const tg = c.createLinearGradient(0, -50, 0, 80);
    tg.addColorStop(0, '#2e3a52'); tg.addColorStop(1, '#121722');
    c.fillStyle = tg;
    c.beginPath(); c.moveTo(-68, -49); c.lineTo(68, -49); c.lineTo(47, 79); c.lineTo(-47, 79); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(61,246,255,0.45)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-40, -30); c.lineTo(40, -30); c.moveTo(-30, 40); c.lineTo(30, 40); c.moveTo(0, -30); c.lineTo(0, 0); c.stroke();
    // core
    const corePulse = 0.6 + Math.sin(b.t * 5) * 0.4;
    c.fillStyle = edge; c.beginPath(); c.arc(0, 14, 18, 0, Math.PI * 2); c.fill();
    c.fillStyle = b.stage === 'sentence' ? '#ffd54a' : '#ff2a3a';
    c.beginPath(); c.arc(0, 14, 11 + corePulse * 2, 0, Math.PI * 2); c.fill();
    // head
    const hd = part('head');
    if (!hd.destroyed) {
      c.fillStyle = edge; c.fillRect(-42, -128, 84, 66);
      c.fillStyle = '#222b3d'; c.fillRect(-38, -124, 76, 58);
      c.fillStyle = '#0b0e15'; c.fillRect(-30, -108, 60, 20);
    } else {
      c.fillStyle = edge; c.fillRect(-30, -78, 60, 22);
      c.fillStyle = '#ff6a2a'; c.fillRect(-18, -76, 36, 6);
    }
    if (flash > 0.02) {
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = `rgba(255,255,255,${Math.min(0.8, flash)})`;
      c.fillRect(-160, -160, 320, 320);
      c.globalCompositeOperation = 'source-over';
    }
    c.restore();

    // glows
    c.globalCompositeOperation = 'lighter';
    const charge = b.charging > 0 ? 1 - b.charging / 0.85 : 0;
    if (!hd.destroyed || b.stage !== 'sentence') {
      for (const e of G.eyePositions()) {
        c.fillStyle = '#ff3040';
        c.fillRect(e.x - 6 * S, e.y - 4 * S, 12 * S, 8 * S);
        this.glow(this.atlas.glow.red, e.x, e.y, (16 + charge * 22) * S, 0.7 + charge * 0.3);
      }
    }
    this.glow(b.stage === 'sentence' ? this.atlas.glow.yellow : this.atlas.glow.red, x, y + 14 * S, 50 * S, 0.35 + corePulse * 0.2);
    // smoke from stumps
    for (const p of b.parts) {
      if (!p.destroyed) continue;
      const pos = G.partPos(p);
      this.glow(this.atlas.glow.orange, pos.x, pos.y, 18 * S, 0.3 + Math.random() * 0.2);
    }
    // weak point marker on the next part
    const nextP = b.stage === 'fight' ? G.nextPart() : null;
    if (nextP) {
      const pos = G.partPos(nextP);
      this.glow(this.atlas.glow.yellow, pos.x, pos.y, 26 * S + Math.sin(this.t * 8) * 4, 0.55);
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    if (nextP) {
      const pos = G.partPos(nextP);
      c.strokeStyle = '#ffd54a';
      c.lineWidth = 2;
      c.setLineDash([5, 5]);
      c.lineDashOffset = -this.t * 30;
      c.beginPath(); c.arc(pos.x, pos.y, 24 * S + 6, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
    }
  }

  private drawBossTags(b: Boss, placed: Rect[]) {
    const G = this.game;
    if (b.stage === 'entering' || b.stage === 'dying') return;
    if (b.stage === 'sentence') return; // sentence panel is drawn in the HUD
    const next = G.nextPart();
    const { fs, font } = this.tagFont();
    const cw = this.cw(font);
    for (const p of b.parts as BossPart[]) {
      if (p.destroyed) continue;
      const pos = G.partPos(p);
      const w = Math.ceil(p.word.length * cw + 16), h = fs + 11;
      const isNext = p === next;
      const extra = isNext ? fs * 0.7 : 0;
      const r = this.place({ x: pos.x - w / 2, y: pos.y - h - 26 * b.scale - extra, w, h: h + extra }, placed);
      if (!p.tagInit) { p.tagX = r.x; p.tagY = r.y; p.tagInit = true; }
      p.tagX += (r.x - p.tagX) * 0.3; p.tagY += (r.y - p.tagY) * 0.3;
      this.drawWordPlate(p.word, p.progress, { x: p.tagX, y: p.tagY + extra, w, h }, {
        state: isNext ? 'lock' : 'dim', pop: isNext ? p.pop : 0,
        label: isNext ? 'NEXT' : undefined, labelColor: '#ffd54a',
      });
    }
  }

  // ---------------- HUD ----------------
  private heart(x: number, y: number, px: number, filled: boolean, pulse = 0) {
    const c = this.ctx;
    for (let r = 0; r < HEART.length; r++) for (let k = 0; k < HEART[r].length; k++) {
      if (HEART[r][k] !== '1') continue;
      c.fillStyle = filled ? (r <= 1 && k >= 1 && k <= 2 ? '#ffd0da' : '#ff4d6d') : 'rgba(80,100,130,0.35)';
      c.fillRect(x + k * px, y + r * px, px, px);
    }
    if (filled && pulse > 0) {
      c.globalCompositeOperation = 'lighter';
      this.glow(this.atlas.glow.red, x + 3.5 * px, y + 3 * px, 8 * px, pulse);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }
  }

  private label(text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', spacing = 2): number {
    const c = this.ctx;
    c.font = `600 ${size}px ${DISPLAY}`;
    c.textAlign = align;
    c.fillStyle = color;
    (c as any).letterSpacing = `${spacing}px`;
    c.fillText(text, x, y);
    const wd = c.measureText(text).width;
    (c as any).letterSpacing = '0px';
    return wd;
  }

  private drawHud() {
    const c = this.ctx;
    const G = this.game;
    const L = G.layout;
    const { w, h } = this;
    const compact = L.compact;
    c.textBaseline = 'alphabetic';

    // top scrim
    const scrim = c.createLinearGradient(0, 0, 0, L.topPad + 20);
    scrim.addColorStop(0, 'rgba(3,5,9,0.85)');
    scrim.addColorStop(1, 'rgba(3,5,9,0)');
    c.fillStyle = scrim;
    c.fillRect(0, 0, w, L.topPad + 20);

    const pad = compact ? 12 : 22;
    // score
    const scoreStr = Math.round(G.displayScore).toLocaleString();
    if (compact) {
      this.label('SCORE', pad, 16, 9, 'rgba(140,170,200,0.7)');
      c.font = `700 20px ${MONO}`; c.textAlign = 'left'; c.fillStyle = '#ffffff';
      c.fillText(scoreStr, pad, 38);
    } else {
      this.label('SCORE', pad, 26, 11, 'rgba(140,170,200,0.75)', 'left', 3);
      c.font = `700 30px ${MONO}`; c.textAlign = 'left'; c.fillStyle = '#ffffff';
      c.fillText(scoreStr, pad, 58);
    }
    // lives
    const hp = compact ? 2 : 3;
    const hx = compact ? w / 2 - (MAX_LIVES * 8 * hp + (MAX_LIVES - 1) * 3) / 2 : pad;
    const hy = compact ? 12 : 68;
    const lowPulse = G.lives === 1 ? 0.5 + Math.sin(this.t * 8) * 0.5 : 0;
    for (let i = 0; i < MAX_LIVES; i++) {
      const lost = i === G.lives && G.time - G.lifeLostAt < 0.5;
      const ox = lost ? (Math.random() - 0.5) * 4 : 0;
      this.heart(hx + i * (8 * hp + 3) + ox, hy, hp, i < G.lives, G.lives === 1 ? lowPulse : 0);
    }
    // chapter + mode
    const dcol = DIFFICULTY_CONFIG[G.difficulty].color;
    if (compact) {
      this.label(`CH ${G.level}`, w / 2, 44, 10, 'rgba(255,213,74,0.9)', 'center');
    } else {
      const cw = this.label(`CHAPTER ${G.level}`, pad, 104, 11, 'rgba(255,213,74,0.9)', 'left', 3);
      this.label(G.difficulty.toUpperCase(), pad + cw + 12, 104, 11, dcol, 'left', 3);
    }

    // boss progress bar
    const thr = BOSS_THRESHOLD[G.difficulty];
    const prog = G.boss.active ? 1 : Math.min(1, G.killsTowardsBoss / thr);
    const bw = compact ? w - pad * 2 : Math.min(360, w * 0.3);
    const bx = compact ? pad : w / 2 - bw / 2;
    const by = compact ? L.topPad - 4 : 30;
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(bx, by, bw, compact ? 3 : 4);
    const bossCol = G.boss.active ? '#ff3a4a' : '#3df6ff';
    c.fillStyle = bossCol;
    c.fillRect(bx, by, bw * prog, compact ? 3 : 4);
    c.globalCompositeOperation = 'lighter';
    this.glow(G.boss.active ? this.atlas.glow.red : this.atlas.glow.cyan, bx + bw * prog, by + 2, 14, 0.6);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    if (!compact) {
      const status = G.boss.active ? (G.boss.stage === 'sentence' ? 'EXECUTE' : 'BOSS FIGHT') : G.time < G.chapterUntil && G.level > 1 ? 'CHAPTER BREAK' : `BOSS IN ${Math.max(0, thr - G.killsTowardsBoss)}`;
      this.label(status, w / 2, by - 8, 11, G.boss.active ? '#ff6a78' : 'rgba(140,170,200,0.8)', 'center', 3);
    }

    // combo
    if (G.combo > 1) {
      const tier = COMBO_TIERS[G.tier];
      const pulse = 1 + G.comboPulse * 0.35 + G.typedFlash * 0.05;
      const cx = compact ? w - 56 : w / 2;
      const cy = compact ? 34 : 82;
      c.save();
      c.translate(cx, cy);
      c.scale(pulse, pulse);
      c.font = `700 ${compact ? 20 : 34}px ${DISPLAY}`;
      c.textAlign = compact ? 'right' : 'center';
      c.globalCompositeOperation = 'lighter';
      this.glow(this.atlas.softGlow(rgba(tier.color, 0.6)), compact ? -20 : 0, -8, compact ? 34 : 70, 0.25 + G.comboPulse * 0.5);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      c.fillStyle = tier.color;
      c.fillText(`×${G.combo}`, 0, 0);
      if (tier.name) {
        c.font = `700 ${compact ? 8 : 11}px ${DISPLAY}`;
        (c as any).letterSpacing = compact ? '2px' : '4px';
        c.fillText(tier.name, compact ? 2 : 0, compact ? 12 : 18);
        (c as any).letterSpacing = '0px';
      }
      c.restore();
    }

    // WPM / ACC (desktop)
    if (!compact) {
      const rx = w - 140;
      this.label('WPM', rx, 26, 11, 'rgba(140,170,200,0.75)', 'right', 3);
      c.font = `700 24px ${MONO}`; c.textAlign = 'right'; c.fillStyle = '#3df6ff';
      c.fillText(String(G.wpm), rx, 52);
      this.label('ACC', rx - 80, 26, 11, 'rgba(140,170,200,0.75)', 'right', 3);
      c.font = `700 24px ${MONO}`; c.fillStyle = '#ffffff';
      c.fillText(`${G.accuracyPct}%`, rx - 80, 52);
    }

    // bottom scrim
    const bs = c.createLinearGradient(0, h - L.bottomPad - 20, 0, h);
    bs.addColorStop(0, 'rgba(3,5,9,0)');
    bs.addColorStop(1, 'rgba(3,5,9,0.8)');
    c.fillStyle = bs;
    c.fillRect(0, h - L.bottomPad - 20, w, L.bottomPad + 20);

    // weapon chip
    const W = WEAPONS[G.weapon];
    const chipH = compact ? 34 : 44;
    const chipW = compact ? 118 : 214;
    const cx0 = pad, cy0 = h - chipH - (compact ? 10 : 18);
    c.save();
    this.rr(cx0, cy0, chipW, chipH, 6);
    c.fillStyle = 'rgba(6,10,16,0.85)';
    c.fill();
    c.strokeStyle = G.weapon === 'pistol' ? 'rgba(140,170,200,0.25)' : rgba(W.color, 0.8 + G.weaponPulse * 0.2);
    c.lineWidth = 1.2 + G.weaponPulse * 2;
    c.stroke();
    c.restore();
    this.label('WEAPON', cx0 + 10, cy0 + (compact ? 12 : 15), compact ? 7 : 9, 'rgba(140,170,200,0.7)');
    c.font = `700 ${compact ? 12 : 15}px ${DISPLAY}`;
    c.textAlign = 'left';
    c.fillStyle = G.weapon === 'pistol' ? '#d8e6f2' : W.color;
    c.fillText(compact ? W.short : W.name, cx0 + 10, cy0 + chipH - (compact ? 8 : 10));
    if (G.weapon !== 'pistol') {
      if (W.ammo > 0) {
        const pw = compact ? 4 : 5, gap = compact ? 6 : 8;
        for (let i = 0; i < W.ammo; i++) {
          c.fillStyle = i < G.ammo ? W.color : 'rgba(255,255,255,0.12)';
          c.fillRect(cx0 + chipW - 10 - (W.ammo - i) * gap + (gap - pw), cy0 + (compact ? 6 : 8), pw, compact ? 6 : 8);
        }
      } else if (W.duration > 0) {
        const k = Math.max(0, G.weaponTime / W.duration);
        c.fillStyle = 'rgba(255,255,255,0.12)';
        c.fillRect(cx0 + 8, cy0 + chipH - 3, chipW - 16, 2);
        c.fillStyle = W.color;
        c.fillRect(cx0 + 8, cy0 + chipH - 3, (chipW - 16) * k, 2);
      }
    }

    // typed buffer, anchored under the player so your eyes never leave the action
    const typed = G.typed;
    const P = G.player;
    const bufY = Math.min(h - (compact ? 10 : 16), P.y + this.atlas.player.height / 2 + (compact ? 22 : 34));
    if (typed && !(G.boss.active && G.boss.stage === 'sentence')) {
      const fs = compact ? 17 : 24;
      c.font = `700 ${fs}px ${MONO}`;
      c.textAlign = 'center';
      const tx = P.x + (G.missFlash > 0 ? Math.sin(this.t * 90) * 5 * G.missFlash : 0);
      const text = typed.toUpperCase();
      const tw = c.measureText(text).width;
      this.rr(tx - tw / 2 - 10, bufY - fs * 0.95, tw + 26, fs * 1.35, 6);
      c.fillStyle = 'rgba(3,6,10,0.7)';
      c.fill();
      c.fillStyle = G.missFlash > 0.3 ? '#ff6a78' : '#41ffb4';
      c.fillText(text, tx, bufY);
      if (Math.sin(this.t * 10) > -0.2) { c.fillStyle = '#3df6ff'; c.fillRect(tx + tw / 2 + 3, bufY - fs * 0.75, 3, fs * 0.85); }
    } else if (G.correct === 0 && G.zombies.length > 0 && !G.boss.active) {
      this.label(compact ? 'TYPE A WORD\'S FIRST LETTER' : 'TYPE THE FIRST LETTER OF ANY WORD TO LOCK ON', P.x, bufY, compact ? 10 : 13, `rgba(230,240,255,${0.55 + Math.sin(this.t * 4) * 0.3})`, 'center', 2);
    }

    // boss sentence panel
    if (G.boss.active && G.boss.stage === 'sentence') this.drawSentence(G.boss);
  }

  private drawSentence(b: Boss) {
    const c = this.ctx;
    const G = this.game;
    const L = G.layout;
    const compact = L.compact;
    const fs = compact ? 15 : 20;
    const font = `700 ${fs}px ${MONO}`;
    const cw = this.cw(font);
    const maxW = Math.min(this.w - 24, 760);
    const perLine = Math.max(8, Math.floor((maxW - 32) / cw));
    // wrap by words keeping char indices
    const words = b.sentence.split(' ');
    const lines: Array<{ text: string; start: number }> = [];
    let cur = '', start = 0, idx = 0;
    for (const wd of words) {
      const cand = cur ? cur + ' ' + wd : wd;
      if (cand.length > perLine && cur) { lines.push({ text: cur, start }); start = idx; cur = wd; }
      else cur = cand;
      idx += wd.length + 1;
    }
    if (cur) lines.push({ text: cur, start });
    const lh = fs + 10;
    const pw = Math.min(maxW, Math.max(...lines.map(l => l.text.length)) * cw + 40);
    const ph = lines.length * lh + 36;
    const px = this.w / 2 - pw / 2;
    const py = this.h - L.bottomPad - ph - (compact ? 4 : 10);
    this.rr(px, py, pw, ph, 8);
    c.fillStyle = 'rgba(8,10,18,0.93)';
    c.fill();
    c.strokeStyle = '#ffd54a';
    c.lineWidth = 1.5;
    c.stroke();
    this.label('EXECUTION', this.w / 2, py + 17, compact ? 9 : 10, '#ffd54a', 'center', 4);
    c.font = font;
    c.textAlign = 'left';
    lines.forEach((ln, li) => {
      const lx = this.w / 2 - (ln.text.length * cw) / 2;
      const ly = py + 28 + li * lh + fs * 0.8;
      for (let i = 0; i < ln.text.length; i++) {
        const gi = ln.start + i;
        const ch = ln.text[i];
        if (ch === ' ') continue;
        if (gi < b.sentenceIndex) c.fillStyle = '#41ffb4';
        else if (gi === b.sentenceIndex) {
          c.fillStyle = '#ffffff';
          c.fillRect(lx + i * cw, ly + 4, cw - 1, 2);
        } else c.fillStyle = 'rgba(230,238,248,0.6)';
        c.fillText(ch, lx + i * cw, ly);
      }
    });
  }

  private drawBanner() {
    const G = this.game;
    const B = G.banner;
    if (!B) return;
    const c = this.ctx;
    const k = (G.time - B.t) / B.dur;
    const inT = Math.min(1, k * B.dur / 0.25);
    const outT = Math.min(1, (1 - k) * B.dur / 0.35);
    const a = Math.min(inT, outT);
    const compact = G.layout.compact;
    const cy = compact ? this.h * 0.42 : this.h * 0.4;
    const ease = 1 - Math.pow(1 - inT, 3);
    c.save();
    c.globalAlpha = a;
    // band
    const bandH = compact ? 86 : 120;
    const grad = c.createLinearGradient(0, 0, this.w, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.65)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = grad;
    c.fillRect(0, cy - bandH / 2, this.w, bandH);
    c.fillStyle = rgba(B.color, 0.7);
    const lw = this.w * 0.5 * ease;
    c.fillRect(this.w / 2 - lw / 2, cy - bandH / 2, lw, 1);
    c.fillRect(this.w / 2 - lw / 2, cy + bandH / 2 - 1, lw, 1);
    this.label(B.kicker, this.w / 2, cy - (compact ? 22 : 32), compact ? 10 : 12, B.color, 'center', 6);
    const fs = compact ? 30 : 54;
    c.font = `700 ${fs}px ${DISPLAY}`;
    c.textAlign = 'center';
    (c as any).letterSpacing = `${(compact ? 3 : 6) + (1 - ease) * 20}px`;
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = a * 0.35;
    c.fillStyle = B.color;
    c.fillText(B.title, this.w / 2 + 2, cy + fs * 0.34);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = a;
    c.fillStyle = '#ffffff';
    c.fillText(B.title, this.w / 2, cy + fs * 0.34);
    (c as any).letterSpacing = '0px';
    if (B.sub) this.label(B.sub, this.w / 2, cy + (compact ? 34 : 48), compact ? 10 : 13, 'rgba(220,230,245,0.8)', 'center', 3);
    c.restore();
  }

  private drawPost() {
    const c = this.ctx;
    const G = this.game;
    const { w, h } = this;
    if (G.flash.a > 0.01) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = G.flash.a * 0.6;
      c.fillStyle = G.flash.color;
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }
    // chromatic edge fringe
    if (G.chroma > 0.05) {
      const k = G.chroma;
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.22 * k;
      c.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height, -4 * k, 0, w, h);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    // hurt / low health vignette
    const hurt = Math.max(G.player.hurt, G.lives === 1 && G.running ? 0.35 + Math.sin(this.t * 5) * 0.15 : 0);
    if (hurt > 0.01) {
      const gr = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      gr.addColorStop(0, 'rgba(255,0,30,0)');
      gr.addColorStop(1, `rgba(255,0,30,${0.45 * hurt})`);
      c.fillStyle = gr;
      c.fillRect(0, 0, w, h);
    }
    if (G.over) {
      c.fillStyle = `rgba(20,0,4,${Math.min(0.6, G.overT * 0.5)})`;
      c.fillRect(0, 0, w, h);
    }
    // scanlines
    if (this.scan) {
      c.globalAlpha = 0.5;
      c.fillStyle = this.scan;
      c.fillRect(0, 0, w, h);
      c.globalAlpha = 1;
    }
  }
}
