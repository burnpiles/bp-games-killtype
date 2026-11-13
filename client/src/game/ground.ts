// Level floors. Each environment is painted once into an offscreen canvas:
// a base material, a pattern, a few props pushed to the edges, and coloured light spill.
// Everything stays dark and low-contrast so characters and word tags always read on top.

import type { Ground } from './worlds';
import { paintScene, type Scene } from './scenes';

type G = CanvasRenderingContext2D;

interface Ctx { g: G; w: number; h: number; compact: boolean; px: number; py: number; rnd: () => number }

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function hash(str: string) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function fill(c: Ctx, top: string, bottom: string) {
  const gr = c.g.createLinearGradient(0, 0, 0, c.h);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  c.g.fillStyle = gr; c.g.fillRect(0, 0, c.w, c.h);
}

function blotches(c: Ctx, n: number, light = 'rgba(60,70,90,0.07)', dark = 'rgba(0,0,0,0.25)') {
  const { g, w, h, rnd } = c;
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * 120;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rnd() < 0.5 ? light : dark);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function grit(c: Ctx, density = 60, a = 1) {
  const { g, w, h, rnd } = c;
  for (let i = 0; i < (w * h) / density; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${(0.012 + rnd() * 0.03) * a})` : `rgba(0,0,0,${(0.15 + rnd() * 0.2) * a})`;
    const sz = rnd() < 0.9 ? 1 : 2;
    g.fillRect(rnd() * w, rnd() * h, sz, sz);
  }
}

function grid(c: Ctx, tile: number, color: string, width = 1.5, ox = 0, oy = 0) {
  const { g, w, h } = c;
  g.strokeStyle = color; g.lineWidth = width;
  for (let x = ((w / 2) % tile) + ox; x < w; x += tile) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = ((h / 2) % tile) + oy; y < h; y += tile) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
}

function cracks(c: Ctx, n: number) {
  const { g, w, h, rnd } = c;
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  for (let i = 0; i < n; i++) {
    let x = rnd() * w, y = rnd() * h;
    g.lineWidth = 1 + rnd();
    g.beginPath(); g.moveTo(x, y);
    const a0 = rnd() * Math.PI * 2;
    for (let k = 0; k < 6 + rnd() * 8; k++) {
      const a = a0 + (rnd() - 0.5) * 1.4;
      x += Math.cos(a) * (6 + rnd() * 14); y += Math.sin(a) * (6 + rnd() * 14);
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

function spill(c: Ctx, colors: string[], n = 5) {
  const { g, w, h, rnd } = c;
  for (let i = 0; i < n; i++) {
    const edge = rnd() < 0.6;
    const x = edge ? (rnd() < 0.5 ? 0 : w) : rnd() * w;
    const y = edge ? rnd() * h : (rnd() < 0.5 ? 0 : h);
    const r = Math.max(w, h) * (0.18 + rnd() * 0.22);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, colors[i % colors.length]);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Random points near the edges, away from the player and the centre lane. */
function edgeSpots(c: Ctx, n: number, margin: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const { w, h, rnd, px, py } = c;
  for (let tries = 0; out.length < n && tries < n * 30; tries++) {
    const side = Math.floor(rnd() * 4);
    const t = rnd();
    const m = margin * (0.4 + rnd() * 0.6);
    const p = side === 0 ? { x: t * w, y: m } : side === 1 ? { x: w - m, y: t * h } : side === 2 ? { x: t * w, y: h - m } : { x: m, y: t * h };
    if (Math.hypot(p.x - px, p.y - py) < Math.min(w, h) * 0.32) continue;
    if (out.some(o => Math.hypot(o.x - p.x, o.y - p.y) < margin * 1.3)) continue;
    out.push(p);
  }
  return out;
}

function shadowBlob(c: Ctx, x: number, y: number, rx: number, ry: number, a = 0.5) {
  const g = c.g;
  const gr = g.createRadialGradient(x, y, 0, x, y, rx);
  gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, rx, 0, Math.PI * 2); g.fill(); g.restore();
}

function rrect(g: G, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function glowDot(c: Ctx, x: number, y: number, r: number, color: string) {
  const g = c.g;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}

// ---------------- props ----------------
function planter(c: Ctx, x: number, y: number, s: number) {
  const g = c.g;
  shadowBlob(c, x + 4, y + 6, 26 * s, 14 * s);
  g.fillStyle = '#1a1c22'; g.beginPath(); g.arc(x, y, 18 * s, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(200,180,120,0.18)'; g.lineWidth = 2; g.stroke();
  for (let i = 0; i < 7; i++) {
    const a = c.rnd() * Math.PI * 2, r = c.rnd() * 10 * s;
    g.fillStyle = c.rnd() < 0.5 ? '#14301e' : '#1c3d26';
    g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, (6 + c.rnd() * 6) * s, 0, Math.PI * 2); g.fill();
  }
}
function pillar(c: Ctx, x: number, y: number, s: number, accent: string) {
  const g = c.g;
  shadowBlob(c, x + 10, y + 10, 34 * s, 20 * s, 0.6);
  g.fillStyle = '#15171d'; g.fillRect(x - 16 * s, y - 16 * s, 32 * s, 32 * s);
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x - 16 * s, y - 16 * s, 32 * s, 4 * s);
  g.fillStyle = accent; g.fillRect(x - 16 * s, y + 10 * s, 32 * s, 2);
}
function parkedCar(c: Ctx, x: number, y: number, s: number, vertical: boolean) {
  const g = c.g;
  const w = (vertical ? 34 : 64) * s, h = (vertical ? 64 : 34) * s;
  shadowBlob(c, x + 6, y + 8, Math.max(w, h) * 0.7, Math.min(w, h) * 0.8, 0.55);
  const hues = ['#1c2230', '#2a1a1e', '#1e2a24', '#24242a', '#2a2418'];
  g.fillStyle = hues[Math.floor(c.rnd() * hues.length)];
  rrect(g, x - w / 2, y - h / 2, w, h, 8 * s); g.fill();
  g.fillStyle = 'rgba(120,160,200,0.10)';
  if (vertical) g.fillRect(x - w / 2 + 5 * s, y - h / 2 + 14 * s, w - 10 * s, 12 * s); else g.fillRect(x - w / 2 + 14 * s, y - h / 2 + 5 * s, 12 * s, h - 10 * s);
  g.fillStyle = 'rgba(255,255,255,0.05)'; rrect(g, x - w / 2 + 3, y - h / 2 + 3, w - 6, 3, 2); g.fill();
}
function seatRow(c: Ctx, x: number, y: number, s: number, n: number) {
  const g = c.g;
  for (let i = 0; i < n; i++) {
    const sx = x + (i - n / 2) * 18 * s;
    g.fillStyle = '#16202c'; rrect(g, sx, y - 8 * s, 15 * s, 16 * s, 3); g.fill();
    g.fillStyle = 'rgba(61,246,255,0.06)'; g.fillRect(sx, y - 8 * s, 15 * s, 3);
  }
}
function rack(c: Ctx, x: number, y: number, s: number) {
  const g = c.g;
  shadowBlob(c, x + 4, y + 6, 40 * s, 12 * s);
  g.strokeStyle = 'rgba(200,200,220,0.18)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - 30 * s, y); g.lineTo(x + 30 * s, y); g.stroke();
  const cols = ['#3a1a2a', '#1a2a3a', '#2a2a1a', '#2a1a3a'];
  for (let i = 0; i < 8; i++) { g.fillStyle = cols[i % 4]; g.fillRect(x - 28 * s + i * 7 * s, y - 2, 6 * s, 14 * s); }
}
function table(c: Ctx, x: number, y: number, s: number) {
  const g = c.g;
  shadowBlob(c, x + 3, y + 5, 24 * s, 14 * s);
  g.fillStyle = '#1e1a1c'; g.beginPath(); g.arc(x, y, 14 * s, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1.5; g.stroke();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; g.fillStyle = '#15131a'; g.beginPath(); g.arc(x + Math.cos(a) * 22 * s, y + Math.sin(a) * 22 * s, 6 * s, 0, Math.PI * 2); g.fill(); }
}
function lamp(c: Ctx, x: number, y: number, s: number, color: string) {
  glowDot(c, x, y, 70 * s, color);
  const g = c.g;
  g.fillStyle = '#0c0d12'; g.beginPath(); g.arc(x, y, 5 * s, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,240,200,0.5)'; g.beginPath(); g.arc(x, y, 2 * s, 0, Math.PI * 2); g.fill();
}
function cone(c: Ctx, x: number, y: number, s: number) {
  const g = c.g;
  g.fillStyle = '#5a2a10'; g.beginPath(); g.moveTo(x, y - 9 * s); g.lineTo(x + 6 * s, y + 6 * s); g.lineTo(x - 6 * s, y + 6 * s); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x - 3 * s, y, 6 * s, 2);
}
function rock(c: Ctx, x: number, y: number, s: number) {
  shadowBlob(c, x + 3, y + 4, 20 * s, 10 * s);
  const g = c.g;
  g.fillStyle = '#1c1e22'; g.beginPath(); g.ellipse(x, y, 16 * s, 11 * s, c.rnd(), 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.04)'; g.beginPath(); g.ellipse(x - 3 * s, y - 3 * s, 8 * s, 4 * s, 0, 0, Math.PI * 2); g.fill();
}

// ---------------- materials ----------------
const PAINT: Record<Ground, (c: Ctx) => void> = {
  concrete(c) {
    fill(c, '#0c1018', '#10131c');
    blotches(c, (c.w * c.h) / 9000);
    grit(c);
    const tile = c.compact ? 56 : 72;
    grid(c, tile, 'rgba(0,0,0,0.55)');
    grid(c, tile, 'rgba(90,200,255,0.035)', 1, 1.5, 1.5);
    cracks(c, (c.w * c.h) / 60000 + 4);
    spill(c, ['rgba(255,60,200,0.07)', 'rgba(61,246,255,0.06)', 'rgba(255,150,40,0.06)', 'rgba(120,90,255,0.06)']);
  },
  atrium(c) {
    fill(c, '#14121a', '#0e0d14');
    const tile = c.compact ? 64 : 96;
    const { g, w, h } = c;
    for (let y = (h / 2) % tile - tile; y < h; y += tile) for (let x = (w / 2) % tile - tile; x < w; x += tile) {
      const alt = (Math.round(x / tile) + Math.round(y / tile)) % 2 === 0;
      g.fillStyle = alt ? 'rgba(255,240,230,0.022)' : 'rgba(0,0,0,0.07)';
      g.fillRect(x, y, tile, tile);
    }
    // marble veins
    g.strokeStyle = 'rgba(255,255,255,0.03)'; g.lineWidth = 1;
    for (let i = 0; i < (w * h) / 20000; i++) { let x = c.rnd() * w, y = c.rnd() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (c.rnd() - 0.3) * 40; y += (c.rnd() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
    grid(c, tile, 'rgba(220,180,90,0.06)', 1);
    grit(c, 90, 0.6);
    // ceiling light reflections
    for (let i = 0; i < 4; i++) { const x = c.rnd() * w; const gr = g.createLinearGradient(x - 60, 0, x + 60, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,230,255,0.025)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - 60, 0, 120, h); }
    spill(c, ['rgba(255,77,210,0.09)', 'rgba(61,246,255,0.06)', 'rgba(255,200,80,0.06)']);
  },
  foodcourt(c) {
    fill(c, '#161214', '#110e10');
    const tile = c.compact ? 34 : 46;
    const { g, w, h } = c;
    for (let y = 0; y < h; y += tile) for (let x = 0; x < w; x += tile) {
      g.fillStyle = (Math.floor(x / tile) + Math.floor(y / tile)) % 2 ? 'rgba(160,40,50,0.035)' : 'rgba(255,240,220,0.015)';
      g.fillRect(x, y, tile, tile);
    }
    grid(c, tile, 'rgba(0,0,0,0.35)', 1);
    blotches(c, (w * h) / 16000, 'rgba(255,200,80,0.04)', 'rgba(40,20,0,0.25)');
    grit(c, 80, 0.7);
    spill(c, ['rgba(255,150,40,0.09)', 'rgba(255,60,90,0.07)', 'rgba(255,220,120,0.05)']);
  },
  parking(c) {
    fill(c, '#111216', '#0d0e12');
    blotches(c, (c.w * c.h) / 7000, 'rgba(70,70,80,0.06)', 'rgba(0,0,0,0.3)');
    grit(c, 30, 1.2);
    cracks(c, (c.w * c.h) / 50000 + 3);
    spill(c, ['rgba(255,190,90,0.08)', 'rgba(120,160,255,0.05)'], 4);
  },
  store(c) {
    fill(c, '#15100c', '#100c09');
    const { g, w, h, rnd } = c;
    const plank = c.compact ? 16 : 22;
    for (let y = 0; y < h; y += plank) {
      let x = -rnd() * 120;
      while (x < w) {
        const len = 80 + rnd() * 140;
        g.fillStyle = `rgba(${120 + rnd() * 40},${70 + rnd() * 20},${30 + rnd() * 10},${0.05 + rnd() * 0.05})`;
        g.fillRect(x, y, len, plank - 1);
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + len - 1, y, 1.5, plank);
        x += len;
      }
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, y + plank - 1, w, 1);
    }
    grit(c, 120, 0.5);
    spill(c, ['rgba(255,170,90,0.08)', 'rgba(200,120,255,0.06)', 'rgba(255,220,180,0.05)']);
  },
  carpet(c) {
    fill(c, '#0c1416', '#0a1012');
    const { g, w, h } = c;
    const t = c.compact ? 22 : 30;
    for (let y = 0; y < h; y += t) for (let x = ((y / t) % 2) * t / 2; x < w; x += t) {
      g.fillStyle = 'rgba(61,246,255,0.025)';
      g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,120,60,0.03)'; g.fillRect(x + t / 2 - 1, y + t / 2 - 1, 2, 2);
    }
    grit(c, 40, 0.8);
    blotches(c, (w * h) / 15000);
    spill(c, ['rgba(61,246,255,0.07)', 'rgba(80,120,255,0.06)', 'rgba(255,90,90,0.05)']);
  },
  terminal(c) {
    fill(c, '#12161e', '#0e1118');
    const { g, w, h, rnd } = c;
    for (let i = 0; i < (w * h) / 40; i++) {
      const cols = ['rgba(255,255,255,0.04)', 'rgba(61,246,255,0.04)', 'rgba(255,180,90,0.035)', 'rgba(0,0,0,0.25)'];
      g.fillStyle = cols[Math.floor(rnd() * cols.length)];
      g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
    }
    // walk lanes
    g.fillStyle = 'rgba(255,255,255,0.025)';
    g.fillRect(w / 2 - 70, 0, 140, h);
    g.fillStyle = 'rgba(61,246,255,0.08)';
    g.fillRect(w / 2 - 72, 0, 2, h); g.fillRect(w / 2 + 70, 0, 2, h);
    grid(c, c.compact ? 80 : 120, 'rgba(0,0,0,0.3)', 1);
    spill(c, ['rgba(61,246,255,0.08)', 'rgba(140,200,255,0.06)', 'rgba(255,200,120,0.05)']);
  },
  tarmac(c) {
    fill(c, '#0d0e10', '#0b0c0e');
    blotches(c, (c.w * c.h) / 8000, 'rgba(60,60,70,0.05)', 'rgba(0,0,0,0.3)');
    grit(c, 28, 1.2);
    const { g, w, h, compact } = c;
    g.strokeStyle = 'rgba(255,200,40,0.22)'; g.lineWidth = compact ? 3 : 4;
    g.beginPath(); g.moveTo(-20, h * 0.25); g.bezierCurveTo(w * 0.3, h * 0.2, w * 0.6, h * 0.9, w + 20, h * 0.75); g.stroke();
    g.setLineDash([30, 26]); g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(w * 0.15, 0); g.lineTo(w * 0.15, h); g.stroke(); g.setLineDash([]);
    for (let y = 30; y < h; y += 70) { glowDot(c, 10, y, 24, 'rgba(80,140,255,0.25)'); glowDot(c, w - 10, y, 24, 'rgba(80,140,255,0.25)'); }
    const s = compact ? 0.8 : 1;
    spill(c, ['rgba(255,170,60,0.06)', 'rgba(80,140,255,0.06)'], 4);
  },
  boardwalk(c) {
    fill(c, '#16110c', '#110d09');
    const { g, w, h, rnd } = c;
    const plank = c.compact ? 22 : 30;
    for (let x = 0; x < w; x += plank) {
      g.fillStyle = `rgba(${130 + rnd() * 40},${85 + rnd() * 20},${40 + rnd() * 15},${0.05 + rnd() * 0.05})`;
      g.fillRect(x, 0, plank - 3, h);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + plank - 3, 0, 3, h);
      for (let y = rnd() * 60; y < h; y += 50 + rnd() * 80) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 3, y, 2, 2); g.fillRect(x + plank - 8, y, 2, 2); }
    }
    grit(c, 120, 0.6);
    spill(c, ['rgba(255,213,74,0.08)', 'rgba(255,77,210,0.07)', 'rgba(61,246,255,0.05)']);
  },
  plaza(c) {
    fill(c, '#141012', '#0f0c0e');
    const { g, w, h, rnd } = c;
    const bw = c.compact ? 18 : 24, bh = bw / 2;
    for (let y = 0, row = 0; y < h; y += bh, row++) for (let x = (row % 2) * bw / 2 - bw; x < w; x += bw) {
      g.fillStyle = `rgba(${150 + rnd() * 40},${70 + rnd() * 30},${60 + rnd() * 20},${0.03 + rnd() * 0.05})`;
      g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
    }
    blotches(c, (w * h) / 14000);
    grit(c, 90, 0.6);
    spill(c, ['rgba(255,213,74,0.08)', 'rgba(255,77,210,0.07)', 'rgba(120,90,255,0.06)']);
  },
  river(c) {
    PAINT.concrete(c);
    const { g, w, h, compact } = c;
    const ww = compact ? 34 : 70;
    for (const x0 of [0, w - ww]) {
      const gr = g.createLinearGradient(x0, 0, x0 + ww, 0);
      gr.addColorStop(0, 'rgba(10,40,60,0.85)'); gr.addColorStop(0.5, 'rgba(20,70,90,0.7)'); gr.addColorStop(1, 'rgba(10,40,60,0.85)');
      g.fillStyle = gr; g.fillRect(x0, 0, ww, h);
      g.strokeStyle = 'rgba(120,220,255,0.10)'; g.lineWidth = 1.5;
      for (let y = 10; y < h; y += 26) { g.beginPath(); g.moveTo(x0 + 6, y); g.quadraticCurveTo(x0 + ww / 2, y - 6, x0 + ww - 6, y); g.stroke(); }
      g.fillStyle = 'rgba(200,200,180,0.12)'; g.fillRect(x0 === 0 ? ww : x0 - 3, 0, 3, h);
    }
  },
};

export function paintGround(ground: Ground, w: number, h: number, dpr: number, compact: boolean, player: { x: number; y: number }, key: string, scene: Scene | null): HTMLCanvasElement {
  const cnv = document.createElement('canvas');
  const s = Math.min(dpr, 2);
  cnv.width = Math.max(1, Math.round(w * s)); cnv.height = Math.max(1, Math.round(h * s));
  const g = cnv.getContext('2d')!;
  g.scale(s, s);
  const c: Ctx = { g, w, h, compact, px: player.x, py: player.y, rnd: seeded(hash(key)) };
  PAINT[ground](c);
  // lift the floor a touch so environments read on phones without washing out the characters
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(150,160,190,0.045)';
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  if (scene) {
    paintScene(g, scene, seeded(hash(key + ':scene')));
    // exposure: add a copy of the finished image onto itself, so mid-tones lift and blacks stay black
    const tmp = document.createElement('canvas');
    tmp.width = cnv.width; tmp.height = cnv.height;
    tmp.getContext('2d')!.drawImage(cnv, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.6;
    g.drawImage(tmp, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.setTransform(s, 0, 0, s, 0, 0);
  }
  // painted defence perimeter around the player
  const R = compact ? 64 : 110;
  g.save();
  g.strokeStyle = 'rgba(61,246,255,0.10)';
  g.lineWidth = 2;
  g.setLineDash([10, 8]);
  g.beginPath(); g.arc(player.x, player.y, R, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(255,190,60,0.07)';
  g.lineWidth = 6;
  g.beginPath(); g.arc(player.x, player.y, R + 10, 0, Math.PI * 2); g.stroke();
  g.restore();
  return cnv;
}
