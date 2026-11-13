// Set pieces for every level: storefronts, escalators, baggage carousels, gates, rides.
// layoutScene() is pure geometry (the engine uses it for spawn points and entry paths),
// paintScene() draws the static parts once into the ground canvas, and drawSceneLive()
// animates the moving parts (escalator steps, belts, suitcases, boards) every frame.
// Player sits bottom-centre, so every scene builds its "far wall" across the top.

export type SceneId =
  | 'atrium' | 'foodcourt' | 'parkinglot' | 'deptstore' | 'electronics' | 'toys' | 'dock' | 'cinema' | 'garage' | 'office'
  | 'curbside' | 'checkin' | 'security' | 'dutyfree' | 'gate' | 'claim' | 'walkway' | 'apron' | 'hangar' | 'tower'
  | 'parkgate' | 'midway' | 'river' | 'carousel' | 'bumper' | 'theater' | 'zoo' | 'mansion' | 'coaster' | 'castle';

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** Where enemies can enter from. 'path' walks/rides a route first, 'emerge' pops up in place. */
export interface SpawnPoint {
  type: 'path' | 'emerge';
  tag: 'escalator' | 'walkway' | 'door' | 'counter' | 'suitcase' | 'water' | 'ride';
  x: number; y: number;
  path?: Pt[];
  speed?: number;      // fixed ride speed in px/s (escalator, walkway); otherwise the enemy walks
  carousel?: number;   // index into scene.carousels for suitcase spawns
  weight: number;
}

export interface Escalator { x: number; y0: number; y1: number; w: number; walkway?: boolean }
export interface Carousel { cx: number; cy: number; rx: number; ry: number; band: number; slots: number; speed: number }
export interface Board { x: number; y: number; w: number; h: number; rows: number; seed: number }
export interface Spinner { cx: number; cy: number; r: number }

export interface Scene {
  id: SceneId;
  w: number; h: number; s: number; compact: boolean;
  band: number;               // height of the far wall across the top
  player: Pt;
  escalators: Escalator[];
  carousels: Carousel[];
  boards: Board[];
  screens: Rect[];            // TV walls / monitors that flicker
  belts: Rect[];              // short conveyor belts with moving rollers (vertical)
  lights: Pt[];               // twinkling bulbs
  radars: Spinner[];
  spinners: Spinner[];        // merry-go-round canopy
  spawns: SpawnPoint[];
}

// ---------------------------------------------------------------- layout
export function layoutScene(id: SceneId, w: number, h: number, compact: boolean, player: Pt, topPad: number): Scene {
  const s = compact ? 0.72 : Math.max(0.85, Math.min(1.15, h / 850));
  const band = Math.round(topPad + (compact ? 50 : 104) * s);
  const S: Scene = { id, w, h, s, compact, band, player, escalators: [], carousels: [], boards: [], screens: [], belts: [], lights: [], radars: [], spinners: [], spawns: [] };
  const mid = (player.y - band) * 0.5 + band;
  const esc = (x: number, len: number, walkway = false) => {
    const e: Escalator = { x, y0: -10, y1: band + len, w: (walkway ? 48 : 56) * s, walkway };
    S.escalators.push(e);
    S.spawns.push({ type: 'path', tag: walkway ? 'walkway' : 'escalator', x, y: -18, path: [{ x, y: -18 }, { x, y: e.y1 + 6 * s }], speed: (walkway ? 78 : 46) * s, weight: 3 });
  };
  const door = (x: number, y = band, weight = 2) => S.spawns.push({ type: 'path', tag: 'door', x, y: y - 20 * s, path: [{ x, y: y - 20 * s }, { x, y: y + 26 * s }], weight });
  const counter = (x: number, y: number, weight = 1) => S.spawns.push({ type: 'emerge', tag: 'counter', x, y, weight });
  const span = (n: number, pad = 0.08) => Array.from({ length: n }, (_, i) => w * (pad + (1 - pad * 2) * (n === 1 ? 0.5 : i / (n - 1))));
  const escLen = (player.y - band) * (compact ? 0.32 : 0.36);

  switch (id) {
    case 'atrium':
    case 'electronics':
      esc(w * (compact ? 0.16 : 0.2), escLen);
      esc(w * (compact ? 0.84 : 0.8), escLen);
      span(compact ? 2 : 3, 0.38).forEach(x => door(x));
      if (id === 'electronics') {
        const n = compact ? 4 : 7;
        for (let i = 0; i < n; i++) S.screens.push({ x: w * 0.3 + (w * 0.4) * (i / n) + 2, y: 6 * s, w: (w * 0.4) / n - 4, h: band - topPad * 0.2 - 18 * s });
      }
      break;
    case 'deptstore':
      esc(w * 0.5, escLen * 0.8);
      span(compact ? 2 : 4, 0.12).forEach(x => door(x, band, 1));
      break;
    case 'foodcourt':
      span(compact ? 3 : 5, 0.12).forEach(x => counter(x, band + 6 * s, 2));
      esc(w * 0.5, escLen * 0.7);
      break;
    case 'toys':
      span(compact ? 2 : 4, 0.15).forEach(x => door(x));
      break;
    case 'dock':
      span(compact ? 2 : 3, 0.22).forEach(x => door(x, band, 3));
      break;
    case 'cinema':
      span(compact ? 2 : 3, 0.3).forEach(x => door(x, band, 3));
      break;
    case 'parkinglot':
      span(compact ? 1 : 2, 0.4).forEach(x => door(x, band, 3));
      break;
    case 'garage':
      door(w * 0.5, band, 2);
      break;
    case 'office':
      span(compact ? 2 : 3, 0.25).forEach(x => door(x, band, 2));
      break;
    case 'curbside':
      span(compact ? 2 : 4, 0.15).forEach(x => door(x, band, 1));
      break;
    case 'checkin': {
      const n = compact ? 3 : 6;
      span(n, 0.1).forEach(x => counter(x, band + 10 * s, 2));
      for (let i = 0; i < n; i++) S.screens.push({ x: span(n, 0.1)[i] - 16 * s, y: band - 28 * s, w: 32 * s, h: 12 * s });
      S.boards.push({ x: w * 0.5 - 70 * s, y: 8 * s + topPad * 0.3, w: 140 * s, h: band - topPad * 0.3 - 46 * s, rows: compact ? 3 : 4, seed: 3 });
      break;
    }
    case 'security': {
      const lanes = compact ? 2 : 4;
      span(lanes, 0.2).forEach((x, i) => {
        S.belts.push({ x: x - 34 * s, y: band - 10 * s, w: 22 * s, h: (mid - band) * 0.8 });
        door(x + 18 * s, band + 30 * s, 3);
        if (i === 0) S.boards.push({ x: 10 * s, y: band + 8 * s, w: 0, h: 0, rows: 0, seed: 0 });
      });
      S.boards.length = 0;
      break;
    }
    case 'dutyfree':
      span(compact ? 2 : 4, 0.18).forEach(x => door(x, band, 1));
      break;
    case 'gate':
      door(w * (compact ? 0.72 : 0.68), band, 4);
      S.boards.push({ x: w * (compact ? 0.04 : 0.08), y: band + 10 * s, w: (compact ? 130 : 180) * s, h: 58 * s, rows: 3, seed: 7 });
      break;
    case 'claim': {
      const rx = Math.min(w * (compact ? 0.38 : 0.3), 330 * s), ry = Math.min((mid - band) * 0.42, 110 * s);
      const c: Carousel = { cx: w * 0.5, cy: band + ry + 26 * s, rx, ry, band: 30 * s, slots: compact ? 9 : 14, speed: 0.022 };
      S.carousels.push(c);
      for (let i = 0; i < c.slots; i++) S.spawns.push({ type: 'emerge', tag: 'suitcase', x: c.cx, y: c.cy, carousel: 0, weight: 0.7 });
      if (!compact) esc(w * 0.09, escLen * 0.8);
      S.boards.push({ x: w * 0.5 - 60 * s, y: 6 * s + topPad * 0.3, w: 120 * s, h: band - topPad * 0.3 - 18 * s, rows: 2, seed: 11 });
      break;
    }
    case 'walkway':
      esc(w * (compact ? 0.28 : 0.3), (player.y - band) * 0.55, true);
      esc(w * (compact ? 0.72 : 0.7), (player.y - band) * 0.55, true);
      break;
    case 'apron':
      counter(w * 0.3, band + 4 * s, 2); counter(w * 0.7, band + 4 * s, 2);
      break;
    case 'hangar':
      span(compact ? 2 : 3, 0.2).forEach(x => door(x, band, 2));
      break;
    case 'tower':
      S.radars.push({ cx: w * 0.5, cy: mid * 0.92, r: (compact ? 46 : 70) * s });
      if (!compact) { S.radars.push({ cx: w * 0.2, cy: band + 50 * s, r: 34 * s }); S.radars.push({ cx: w * 0.8, cy: band + 50 * s, r: 34 * s }); }
      span(compact ? 2 : 3, 0.2).forEach(x => door(x, band, 1));
      break;
    case 'parkgate':
      span(compact ? 3 : 5, 0.18).forEach(x => door(x, band, 2));
      for (let i = 0; i < (compact ? 10 : 18); i++) S.lights.push({ x: w * (i + 0.5) / (compact ? 10 : 18), y: band - 6 * s });
      break;
    case 'midway':
      span(compact ? 2 : 4, 0.2).forEach(x => door(x, band, 1));
      for (let i = 0; i < (compact ? 14 : 26); i++) { const t = (i + 0.5) / (compact ? 14 : 26); S.lights.push({ x: w * t, y: band + 14 * s + Math.sin(t * Math.PI * 4) * 8 * s }); }
      break;
    case 'river': {
      const ww = compact ? 40 : 76;
      for (let i = 0; i < 4; i++) {
        const left = i % 2 === 0, y = band + (mid - band) * (0.3 + i * 0.35);
        S.spawns.push({ type: 'emerge', tag: 'water', x: left ? ww * 0.55 : w - ww * 0.55, y, weight: 1.4 });
      }
      break;
    }
    case 'carousel': {
      const r = Math.min(w * 0.3, (mid - band) * 0.62, 190 * s);
      S.spinners.push({ cx: w * 0.5, cy: band + r * 0.55, r });
      for (let i = 0; i < 6; i++) { const a = Math.PI * (0.15 + i * 0.14); S.spawns.push({ type: 'emerge', tag: 'ride', x: w * 0.5 + Math.cos(a) * r * 0.85, y: band + r * 0.55 + Math.sin(a) * r * 0.85, weight: 1.2 }); }
      break;
    }
    case 'bumper':
      for (let i = 0; i < 8; i++) S.lights.push({ x: w * (0.1 + i * 0.114), y: band + 4 * s });
      break;
    case 'theater':
      door(w * 0.5, band, 3);
      span(compact ? 2 : 4, 0.2).forEach(x => S.spawns.push({ type: 'emerge', tag: 'ride', x, y: band - 4 * s, weight: 1 }));
      break;
    case 'zoo':
      span(compact ? 2 : 3, 0.25).forEach(x => door(x, band, 2));
      break;
    case 'mansion':
      span(compact ? 2 : 3, 0.25).forEach(x => door(x, band, 2));
      break;
    case 'coaster':
      span(compact ? 2 : 3, 0.3).forEach(x => door(x, band, 1));
      for (let i = 0; i < (compact ? 12 : 22); i++) S.lights.push({ x: w * (i + 0.5) / (compact ? 12 : 22), y: band * 0.55 });
      break;
    case 'castle':
      door(w * 0.5, band, 4);
      break;
  }
  return S;
}

// ---------------------------------------------------------------- shared painting helpers
type G = CanvasRenderingContext2D;
interface PCtx { g: G; S: Scene; rnd: () => number }

const FONT = (px: number, weight = 700) => `${weight} ${Math.round(px)}px "Chakra Petch", "Arial Narrow", system-ui, sans-serif`;

function rrect(g: G, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function blob(g: G, x: number, y: number, rx: number, ry: number, color: string) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
}
function shadow(g: G, x: number, y: number, rx: number, ry: number, a = 0.5) { blob(g, x, y, rx, ry, `rgba(0,0,0,${a})`); }
function neon(g: G, text: string, x: number, y: number, px: number, color: string, align: CanvasTextAlign = 'center') {
  g.save();
  g.font = FONT(px); g.textAlign = align; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = px * 1.2;
  g.fillStyle = color; g.fillText(text, x, y); g.fillText(text, x, y);
  g.shadowBlur = 0; g.lineWidth = Math.max(1, px * 0.08); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.strokeText(text, x, y);
  g.fillStyle = color; g.fillText(text, x, y);
  g.restore();
}
function label(g: G, text: string, x: number, y: number, px: number, color: string, align: CanvasTextAlign = 'center') {
  g.save(); g.font = FONT(px, 600); g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, x, y); g.restore();
}
/** Light that a sign or doorway throws onto the floor below it. */
function floorSpill(g: G, x: number, y: number, w: number, len: number, color: string) {
  const gr = g.createLinearGradient(0, y, 0, y + len);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x + w / 2, y); g.lineTo(x + w * 0.9, y + len); g.lineTo(x - w * 0.9, y + len); g.closePath(); g.fill();
}
function hazard(g: G, x: number, y: number, w: number, h: number, step = 10) {
  g.save(); rrect(g, x, y, w, h, 0); g.clip();
  g.fillStyle = '#2a2208'; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,200,40,0.55)';
  for (let i = -h; i < w + h; i += step * 2) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + h, y); g.lineTo(x + i + h + step, y); g.lineTo(x + i + step, y + h); g.closePath(); g.fill(); }
  g.restore();
}

/** Far wall across the top with a lit trim and a soft shadow line on the floor. */
function wall(c: PCtx, top: string, bottom: string, trim: string) {
  const { g, S } = c;
  const gr = g.createLinearGradient(0, 0, 0, S.band);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(0, 0, S.w, S.band);
  g.fillStyle = trim; g.fillRect(0, S.band - 3 * S.s, S.w, 3 * S.s);
  const sh = g.createLinearGradient(0, S.band, 0, S.band + 30 * S.s);
  sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh; g.fillRect(0, S.band, S.w, 30 * S.s);
}

const SHOPS = [
  { n: 'LUXE', c: '#ff4dd2' }, { n: 'NOVA', c: '#3df6ff' }, { n: 'SOLE CITY', c: '#ffd54a' }, { n: 'BLOOM', c: '#7dff9a' },
  { n: 'PIXEL', c: '#7aa8ff' }, { n: 'VELVET', c: '#ff6a8a' }, { n: 'THREADS', c: '#ffb04a' }, { n: 'GLOW', c: '#c47dff' },
  { n: 'URBAN', c: '#3df6ff' }, { n: 'KANDY', c: '#ff4dd2' },
];

/** A row of shopfronts across the far wall: glass, displays, neon names, doorway light. */
function shopfronts(c: PCtx, names = SHOPS, doors: number[] = []) {
  const { g, S, rnd } = c;
  const s = S.s;
  const unit = (S.compact ? 130 : 210) * s;
  const n = Math.max(2, Math.round(S.w / unit));
  const sw = S.w / n;
  const glassY = S.band - 30 * s;
  for (let i = 0; i < n; i++) {
    const x = i * sw, shop = names[(i + Math.floor(rnd() * 3)) % names.length];
    // interior
    g.fillStyle = '#0a0b12'; g.fillRect(x + 4 * s, 0, sw - 8 * s, S.band - 3 * s);
    const tint = g.createLinearGradient(0, 0, 0, S.band);
    tint.addColorStop(0, 'rgba(0,0,0,0)'); tint.addColorStop(1, shop.c + '33');
    g.fillStyle = tint; g.fillRect(x + 4 * s, 0, sw - 8 * s, S.band - 3 * s);
    // displays: mannequins and shelving silhouettes
    for (let k = 0; k < 3; k++) {
      const mx = x + sw * (0.22 + k * 0.28), my = glassY - 8 * s;
      if ((i + k) % 2) { g.fillStyle = 'rgba(200,210,230,0.18)'; g.beginPath(); g.arc(mx, my - 9 * s, 4 * s, 0, Math.PI * 2); g.fill(); g.fillRect(mx - 6 * s, my - 4 * s, 12 * s, 4 * s); }
      else { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(mx - 12 * s, my - 6 * s, 24 * s, 3 * s); for (let d = 0; d < 4; d++) { g.fillStyle = shop.c + '55'; g.fillRect(mx - 11 * s + d * 6 * s, my - 10 * s, 4 * s, 4 * s); } }
    }
    // glass storefront line
    g.fillStyle = shop.c + '22'; g.fillRect(x + 6 * s, glassY, sw - 12 * s, 26 * s);
    g.fillStyle = shop.c + 'aa'; g.fillRect(x + 6 * s, S.band - 5 * s, sw - 12 * s, 2 * s);
    // doorway gap
    const dx = x + sw / 2;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(dx - 18 * s, glassY, 36 * s, 27 * s);
    floorSpill(g, dx, S.band, 46 * s, 70 * s, shop.c + '26');
    // sign above
    const signY = S.compact ? Math.max(glassY - 22 * s, 30 * s) : glassY - 26 * s;
    neon(g, shop.n, dx, signY, (S.compact ? 13 : 16) * s, shop.c);
    // dividing pilaster
    g.fillStyle = '#16131c'; g.fillRect(x - 4 * s, 0, 8 * s, S.band);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x - 4 * s, 0, 2 * s, S.band);
  }
  doors.forEach(() => undefined);
}

function escalatorStatic(c: PCtx, e: { x: number; y0: number; y1: number; w: number; walkway?: boolean }) {
  const { g, S } = c;
  const s = S.s, x = e.x - e.w / 2, len = e.y1 - e.y0;
  shadow(g, e.x + 8 * s, e.y0 + len / 2, e.w * 0.9, len * 0.55, 0.45);
  // housing / balustrade
  g.fillStyle = '#3a4252'; rrect(g, x - 8 * s, e.y0, e.w + 16 * s, len + 10 * s, 6 * s); g.fill();
  g.fillStyle = 'rgba(160,190,230,0.10)'; g.fillRect(x - 8 * s, e.y0, 2 * s, len); g.fillRect(x + e.w + 6 * s, e.y0, 2 * s, len);
  // glass side panels
  g.fillStyle = 'rgba(120,200,255,0.06)'; g.fillRect(x - 6 * s, e.y0, 5 * s, len); g.fillRect(x + e.w + 1 * s, e.y0, 5 * s, len);
  // tread bed
  g.fillStyle = e.walkway ? '#1e2430' : '#232833'; g.fillRect(x, e.y0, e.w, len);
  // rubber handrails
  g.fillStyle = '#07080b'; g.fillRect(x - 3 * s, e.y0, 4 * s, len + 4 * s); g.fillRect(x + e.w - 1 * s, e.y0, 4 * s, len + 4 * s);
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x - 2 * s, e.y0, 1, len); g.fillRect(x + e.w, e.y0, 1, len);
  // comb plate + landing
  g.fillStyle = '#3a404c'; g.fillRect(x - 2 * s, e.y1 - 2 * s, e.w + 4 * s, 10 * s);
  g.fillStyle = 'rgba(255,210,60,0.7)'; g.fillRect(x, e.y1 - 2 * s, e.w, 2 * s);
  g.fillStyle = 'rgba(0,0,0,0.5)'; for (let i = 0; i < e.w; i += 3 * s) g.fillRect(x + i, e.y1 + 1 * s, 1.5 * s, 5 * s);
  // underside light strip
  g.fillStyle = 'rgba(61,246,255,0.18)'; g.fillRect(x - 8 * s, e.y1 + 9 * s, e.w + 16 * s, 1.5 * s);
  floorSpill(g, e.x, e.y1 + 10 * s, e.w + 10 * s, 40 * s, 'rgba(61,246,255,0.07)');
}

function planter(c: PCtx, x: number, y: number, r: number) {
  const { g, rnd } = c;
  shadow(g, x + 4, y + 6, r * 1.4, r * 0.8, 0.5);
  g.fillStyle = '#1e1c22'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(220,190,120,0.25)'; g.lineWidth = 2; g.stroke();
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.6;
    g.fillStyle = ['#1a3d24', '#245232', '#2f6a3c'][i % 3];
    g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.3 + rnd() * 0.3), 0, Math.PI * 2); g.fill();
  }
}
function bench(c: PCtx, x: number, y: number, w: number, vertical = false) {
  const { g, S } = c; const s = S.s;
  const bw = vertical ? 14 * s : w, bh = vertical ? w : 14 * s;
  shadow(g, x + 3, y + 5, Math.max(bw, bh) * 0.6, Math.min(bw, bh) * 1.1, 0.45);
  g.fillStyle = '#2a2024'; rrect(g, x - bw / 2, y - bh / 2, bw, bh, 3 * s); g.fill();
  g.fillStyle = 'rgba(255,220,180,0.10)';
  if (vertical) for (let i = 2; i < bh; i += 5 * s) g.fillRect(x - bw / 2 + 2, y - bh / 2 + i, bw - 4, 1.5);
  else for (let i = 2; i < bw; i += 5 * s) g.fillRect(x - bw / 2 + i, y - bh / 2 + 2, 1.5, bh - 4);
}
function kiosk(c: PCtx, x: number, y: number, color: string, text: string) {
  const { g, S } = c; const s = S.s;
  shadow(g, x + 6, y + 8, 40 * s, 22 * s, 0.55);
  g.fillStyle = '#1a1820'; rrect(g, x - 30 * s, y - 16 * s, 60 * s, 32 * s, 8 * s); g.fill();
  g.strokeStyle = color + 'aa'; g.lineWidth = 2 * s; g.stroke();
  g.fillStyle = color + '30'; rrect(g, x - 24 * s, y - 10 * s, 48 * s, 20 * s, 5 * s); g.fill();
  for (let i = 0; i < 5; i++) { g.fillStyle = color + '90'; g.fillRect(x - 20 * s + i * 9 * s, y - 4 * s, 5 * s, 8 * s); }
  label(g, text, x, y - 24 * s, 9 * s, color);
  blob(g, x, y, 60 * s, 40 * s, color + '18');
}
function droppedBag(c: PCtx, x: number, y: number) {
  const { g, S, rnd } = c; const s = S.s;
  const col = ['#c83a6a', '#2a8ac8', '#e8c84a', '#e8e8f0', '#7a3ac8'][Math.floor(rnd() * 5)];
  g.save(); g.translate(x, y); g.rotate(rnd() * 6);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-6 * s + 2, -5 * s + 2, 12 * s, 10 * s);
  g.fillStyle = col; g.fillRect(-6 * s, -5 * s, 12 * s, 10 * s);
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, -5 * s, 3 * s, Math.PI, 0); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-3 * s, -1 * s, 6 * s, 2 * s);
  g.restore();
}
function wetFloor(c: PCtx, x: number, y: number) {
  const { g, S } = c; const s = S.s;
  g.fillStyle = '#d8b020'; g.beginPath(); g.moveTo(x, y - 9 * s); g.lineTo(x + 8 * s, y + 7 * s); g.lineTo(x - 8 * s, y + 7 * s); g.closePath(); g.fill();
  g.fillStyle = '#1a1408'; g.fillRect(x - 1 * s, y - 3 * s, 2 * s, 6 * s);
  blob(g, x + 10 * s, y + 10 * s, 26 * s, 12 * s, 'rgba(120,200,255,0.10)');
}
function trolley(c: PCtx, x: number, y: number) {
  const { g, S, rnd } = c; const s = S.s;
  shadow(g, x + 3, y + 5, 22 * s, 12 * s);
  g.strokeStyle = 'rgba(180,190,210,0.35)'; g.lineWidth = 2 * s; g.strokeRect(x - 12 * s, y - 16 * s, 24 * s, 32 * s);
  const cols = ['#3a2a5a', '#5a1a24', '#1a3a5a', '#2a4a2a', '#4a3a1a'];
  g.fillStyle = cols[Math.floor(rnd() * 5)]; g.fillRect(x - 10 * s, y - 14 * s, 20 * s, 13 * s);
  g.fillStyle = cols[Math.floor(rnd() * 5)]; g.fillRect(x - 9 * s, y + 0 * s, 18 * s, 12 * s);
}
function stanchions(c: PCtx, x: number, y: number, w: number, rows: number, color = 'rgba(80,120,255,0.55)') {
  const { g, S } = c; const s = S.s;
  const gap = 22 * s;
  for (let r = 0; r <= rows; r++) {
    const yy = y + r * gap;
    g.strokeStyle = color; g.lineWidth = 2.5 * s;
    g.beginPath();
    if (r < rows) { g.moveTo(r % 2 ? x : x + 26 * s, yy); g.lineTo(r % 2 ? x + w - 26 * s : x + w, yy); }
    g.stroke();
    for (const px of [x, x + w]) { g.fillStyle = '#9aa4b8'; g.beginPath(); g.arc(px, yy, 2.6 * s, 0, Math.PI * 2); g.fill(); }
  }
}
function rack(c: PCtx, x: number, y: number) {
  const { g, S, rnd } = c; const s = S.s;
  shadow(g, x + 3, y + 5, 26 * s, 20 * s, 0.45);
  g.strokeStyle = 'rgba(200,205,220,0.3)'; g.lineWidth = 2 * s; g.beginPath(); g.arc(x, y, 15 * s, 0, Math.PI * 2); g.stroke();
  const cols = ['#5a1a3a', '#1a3a5a', '#4a4a1a', '#3a1a5a', '#1a4a3a', '#6a3a1a'];
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; g.fillStyle = cols[Math.floor(rnd() * cols.length)]; g.save(); g.translate(x + Math.cos(a) * 15 * s, y + Math.sin(a) * 15 * s); g.rotate(a); g.fillRect(-2 * s, -5 * s, 4 * s, 10 * s); g.restore(); }
}
function mannequin(c: PCtx, x: number, y: number) {
  const { g, S } = c; const s = S.s;
  shadow(g, x + 2, y + 4, 12 * s, 7 * s, 0.45);
  g.fillStyle = '#c8ccd6'; g.beginPath(); g.ellipse(x, y, 9 * s, 5 * s, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e4e6ec'; g.beginPath(); g.arc(x, y - 1 * s, 4 * s, 0, Math.PI * 2); g.fill();
}
function glassCounter(c: PCtx, x: number, y: number, w: number, h: number, glow: string) {
  const { g, S, rnd } = c; const s = S.s;
  shadow(g, x + w / 2 + 5, y + h / 2 + 6, w * 0.6, h * 0.9, 0.5);
  g.fillStyle = '#14161e'; rrect(g, x, y, w, h, 4 * s); g.fill();
  g.fillStyle = glow + '22'; rrect(g, x + 3 * s, y + 3 * s, w - 6 * s, h - 6 * s, 3 * s); g.fill();
  g.strokeStyle = glow + '88'; g.lineWidth = 1.5 * s; rrect(g, x, y, w, h, 4 * s); g.stroke();
  const n = Math.floor(w / (9 * s));
  for (let i = 0; i < n; i++) {
    const bx = x + 6 * s + i * 9 * s, by = y + h / 2 + (rnd() - 0.5) * h * 0.3;
    g.fillStyle = ['#ffd2f0', '#c8f0ff', '#ffe8a0', '#e0c8ff'][i % 4] + 'cc';
    g.fillRect(bx, by - 3 * s, 4 * s, 6 * s);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(bx + 1 * s, by - 5 * s, 2 * s, 2 * s);
  }
  blob(g, x + w / 2, y + h / 2, w * 0.7, h * 1.6, glow + '14');
}
function tvScreen(g: G, r: Rect) {
  g.fillStyle = '#05070c'; g.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
}
function shelf(c: PCtx, x: number, y: number, w: number, vertical = false) {
  const { g, S, rnd } = c; const s = S.s;
  const ww = vertical ? 18 * s : w, hh = vertical ? w : 18 * s;
  shadow(g, x + ww / 2 + 4, y + hh / 2 + 6, ww * 0.6, hh * 0.7, 0.5);
  g.fillStyle = '#1c1a20'; g.fillRect(x, y, ww, hh);
  const cols = ['#e83a5a', '#3a8ae8', '#e8c83a', '#3ae88a', '#c83ae8', '#ff8a2a'];
  const n = Math.floor((vertical ? hh : ww) / (8 * s));
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(rnd() * cols.length)] + 'aa';
    if (vertical) g.fillRect(x + 2 * s, y + 2 * s + i * 8 * s, ww - 4 * s, 6 * s); else g.fillRect(x + 2 * s + i * 8 * s, y + 2 * s, 6 * s, hh - 4 * s);
  }
}
function table(c: PCtx, x: number, y: number, r: number, accent = 'rgba(255,255,255,0.08)') {
  const { g, rnd } = c;
  shadow(g, x + 3, y + 5, r * 1.8, r * 1.1, 0.45);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.3; g.fillStyle = '#3a2e34'; g.beginPath(); g.arc(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6, r * 0.45, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#4a4248'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = accent; g.lineWidth = 1.5; g.stroke();
  if (rnd() < 0.6) { g.fillStyle = ['#a83a2a', '#3a6aa8', '#c8a03a'][Math.floor(rnd() * 3)]; g.fillRect(x - r * 0.5, y - r * 0.35, r, r * 0.7); g.fillStyle = 'rgba(255,240,200,0.5)'; g.beginPath(); g.arc(x - r * 0.15, y, r * 0.18, 0, Math.PI * 2); g.fill(); }
}
function parkedCar(c: PCtx, x: number, y: number, vertical: boolean, colors = ['#2a3448', '#4a1e24', '#24402e', '#3a3a42', '#4a3a1e', '#5a5a64']) {
  const { g, S, rnd } = c; const s = S.s;
  const w = (vertical ? 30 : 58) * s, h = (vertical ? 58 : 30) * s;
  shadow(g, x + 5, y + 7, Math.max(w, h) * 0.7, Math.min(w, h) * 0.85, 0.55);
  g.fillStyle = colors[Math.floor(rnd() * colors.length)];
  rrect(g, x - w / 2, y - h / 2, w, h, 7 * s); g.fill();
  g.fillStyle = 'rgba(140,190,230,0.22)';
  if (vertical) { g.fillRect(x - w / 2 + 4 * s, y - h / 2 + 12 * s, w - 8 * s, 10 * s); g.fillRect(x - w / 2 + 4 * s, y + h / 2 - 16 * s, w - 8 * s, 7 * s); }
  else { g.fillRect(x - w / 2 + 12 * s, y - h / 2 + 4 * s, 10 * s, h - 8 * s); g.fillRect(x + w / 2 - 16 * s, y - h / 2 + 4 * s, 7 * s, h - 8 * s); }
  g.fillStyle = 'rgba(255,255,255,0.10)'; rrect(g, x - w / 2 + 3, y - h / 2 + 3, w - 6, 3, 2); g.fill();
}
function lampPost(c: PCtx, x: number, y: number, color: string, r = 90) {
  const { g, S } = c; const s = S.s;
  blob(g, x, y, r * s, r * 0.75 * s, color);
  g.fillStyle = '#0c0d12'; g.beginPath(); g.arc(x, y, 5 * s, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,240,200,0.7)'; g.beginPath(); g.arc(x, y, 2.2 * s, 0, Math.PI * 2); g.fill();
}
function crate(c: PCtx, x: number, y: number, sz: number) {
  const { g } = c;
  shadow(g, x + 4, y + 6, sz * 0.8, sz * 0.5, 0.5);
  g.fillStyle = '#4a3820'; g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5; g.strokeRect(x - sz / 2, y - sz / 2, sz, sz);
  g.beginPath(); g.moveTo(x - sz / 2, y - sz / 2); g.lineTo(x + sz / 2, y + sz / 2); g.stroke();
  g.fillStyle = 'rgba(255,220,160,0.12)'; g.fillRect(x - sz / 2, y - sz / 2, sz, 2);
}
function pallet(c: PCtx, x: number, y: number) {
  const { g, S } = c; const s = S.s;
  g.fillStyle = '#5a4428'; for (let i = 0; i < 5; i++) g.fillRect(x - 22 * s, y - 16 * s + i * 7 * s, 44 * s, 4 * s);
  crate(c, x - 9 * s, y - 2 * s, 16 * s); crate(c, x + 9 * s, y + 2 * s, 14 * s);
}
function seatRow(c: PCtx, x: number, y: number, n: number, color = '#1d2a3c', vertical = false) {
  const { g, S } = c; const s = S.s;
  const pitch = 17 * s;
  const len = n * pitch;
  shadow(g, x + (vertical ? 0 : len / 2) + 3, y + (vertical ? len / 2 : 0) + 5, (vertical ? 14 : len * 0.55) * s / s, (vertical ? len * 0.55 : 12 * s), 0.45);
  for (let i = 0; i < n; i++) {
    const sx = vertical ? x : x + i * pitch, sy = vertical ? y + i * pitch : y;
    g.fillStyle = color; rrect(g, sx - 7 * s, sy - 7 * s, 14 * s, 14 * s, 3 * s); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.08)';
    if (vertical) g.fillRect(sx - 7 * s, sy - 7 * s, 3 * s, 14 * s); else g.fillRect(sx - 7 * s, sy - 7 * s, 14 * s, 3 * s);
  }
}
function windowWall(c: PCtx, sky = true) {
  const { g, S, rnd } = c; const s = S.s;
  const gr = g.createLinearGradient(0, 0, 0, S.band);
  gr.addColorStop(0, '#05081a'); gr.addColorStop(1, '#101a34');
  g.fillStyle = gr; g.fillRect(0, 0, S.w, S.band);
  if (sky) {
    for (let i = 0; i < S.w / 6; i++) { g.fillStyle = `rgba(255,255,255,${0.1 + rnd() * 0.4})`; g.fillRect(rnd() * S.w, rnd() * S.band * 0.6, 1, 1); }
    // runway edge lights in the distance
    for (let x = 0; x < S.w; x += 14 * s) { g.fillStyle = x % (28 * s) < 14 * s ? 'rgba(80,160,255,0.8)' : 'rgba(255,200,80,0.7)'; g.fillRect(x, S.band * 0.72, 2, 2); }
  }
  // mullions
  const pane = (S.compact ? 60 : 90) * s;
  g.fillStyle = '#1a1e28';
  for (let x = 0; x < S.w; x += pane) g.fillRect(x, 0, 4 * s, S.band);
  g.fillRect(0, S.band - 8 * s, S.w, 8 * s);
  g.fillStyle = 'rgba(160,200,255,0.06)';
  for (let x = 0; x < S.w; x += pane) { g.beginPath(); g.moveTo(x + 10 * s, 0); g.lineTo(x + 30 * s, 0); g.lineTo(x + 8 * s, S.band); g.lineTo(x - 12 * s, S.band); g.fill(); }
  // reflection of the window on the floor
  const rf = g.createLinearGradient(0, S.band, 0, S.band + 90 * s);
  rf.addColorStop(0, 'rgba(90,140,255,0.08)'); rf.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rf; g.fillRect(0, S.band, S.w, 90 * s);
}
function planeTop(c: PCtx, x: number, y: number, k: number, dir: 1 | -1 = 1) {
  // a jet seen from above, nose pointing down toward the player (dir 1) or up
  const { g } = c;
  g.save(); g.translate(x, y); g.scale(k, k * dir);
  shadow(g, 20, 30, 170, 70, 0.4);
  g.fillStyle = '#c8ced8';
  g.beginPath(); g.moveTo(-170, -14); g.lineTo(-30, -10); g.lineTo(-30, 10); g.lineTo(-170, 14); g.closePath(); g.fill(); // left wing
  g.beginPath(); g.moveTo(170, -14); g.lineTo(30, -10); g.lineTo(30, 10); g.lineTo(170, 14); g.closePath(); g.fill();
  g.fillStyle = '#e4e8ee'; rrect(g, -22, -200, 44, 300, 22); g.fill(); // fuselage
  g.beginPath(); g.ellipse(0, 100, 22, 34, 0, 0, Math.PI); g.fill(); // nose
  g.fillStyle = '#1a2840'; g.fillRect(-12, 108, 24, 6); // cockpit
  g.fillStyle = '#8a96a8'; g.beginPath(); g.ellipse(-80, 18, 9, 22, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(80, 18, 9, 22, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d02a4a'; g.fillRect(-4, -200, 8, 60);
  g.fillStyle = 'rgba(255,40,60,0.8)'; g.fillRect(-172, -2, 4, 4); g.fillStyle = 'rgba(40,255,120,0.8)'; g.fillRect(168, -2, 4, 4);
  g.restore();
}

// ---------------------------------------------------------------- static scene painting
export function paintScene(g: G, S: Scene, rnd: () => number) {
  const c: PCtx = { g, S, rnd };
  const s = S.s, w = S.w, h = S.h, P = S.player, B = S.band;
  const midY = (P.y - B) * 0.5 + B;
  const sideX = (k: number) => (k < 0.5 ? w * k : w * k);
  const avoid = (x: number, y: number) => Math.abs(x - P.x) < w * 0.16 && y > midY - 40 * s; // keep the player's lane clear

  switch (S.id) {
    case 'atrium':
    case 'electronics': {
      if (S.id === 'electronics') {
        wall(c, '#07080e', '#0d1018', 'rgba(61,246,255,0.5)');
        S.screens.forEach(r => tvScreen(g, r));
        neon(g, 'TECH ZONE', w * 0.5, B - 12 * s, 14 * s, '#3df6ff');
        const side = SHOPS.slice(4, 9);
        g.save(); g.beginPath(); g.rect(0, 0, w * 0.28, B); g.rect(w * 0.72, 0, w * 0.28, B); g.clip(); shopfronts(c, side); g.restore();
      } else shopfronts(c);
      if (S.id === 'atrium') {
        // inlaid medallion in the floor and light shafts from the skylight
        const mx = w * 0.5, my = midY - 10 * s, mr = Math.min(w * 0.18, 120 * s);
        g.strokeStyle = 'rgba(230,190,110,0.22)'; g.lineWidth = 3 * s; g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.stroke();
        g.lineWidth = 1.5 * s; g.beginPath(); g.arc(mx, my, mr * 0.8, 0, Math.PI * 2); g.stroke();
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(mx + Math.cos(a) * mr * 0.3, my + Math.sin(a) * mr * 0.3); g.lineTo(mx + Math.cos(a) * mr * 0.8, my + Math.sin(a) * mr * 0.8); g.stroke(); }
        g.fillStyle = 'rgba(255,77,210,0.08)'; g.beginPath(); g.arc(mx, my, mr * 0.3, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 3; i++) { const x0 = w * (0.2 + i * 0.3); const gr = g.createLinearGradient(x0, B, x0 + 120 * s, P.y); gr.addColorStop(0, 'rgba(255,240,220,0.05)'); gr.addColorStop(1, 'rgba(255,240,220,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x0, B); g.lineTo(x0 + 60 * s, B); g.lineTo(x0 + 200 * s, P.y); g.lineTo(x0 + 110 * s, P.y); g.closePath(); g.fill(); }
      }
      S.escalators.forEach(e => escalatorStatic(c, e));
      // upper-level balcony railing over the band
      g.fillStyle = 'rgba(200,220,255,0.10)'; g.fillRect(0, B + 2 * s, w, 2 * s);
      const kx = S.compact ? [0.5] : [0.36, 0.64];
      kx.forEach((k, i) => kiosk(c, w * k, midY - 40 * s, i ? '#ffd54a' : '#ff4dd2', i ? 'PHONE CASES' : 'PRETZELS'));
      if (S.id === 'electronics') {
        for (let i = 0; i < (S.compact ? 3 : 6); i++) {
          const x = w * (0.12 + rnd() * 0.76), y = B + 60 * s + rnd() * (midY - B);
          if (avoid(x, y)) continue;
          glassCounter(c, x - 26 * s, y - 12 * s, 52 * s, 24 * s, '#3df6ff');
        }
      } else {
        [[0.07, 0.55], [0.93, 0.55], [0.07, 0.82], [0.93, 0.82]].forEach(([kx2, ky]) => planter(c, w * kx2, B + (P.y - B) * ky, 18 * s));
        bench(c, w * 0.08, B + (P.y - B) * 0.68, 46 * s, true); bench(c, w * 0.92, B + (P.y - B) * 0.68, 46 * s, true);
        for (let i = 0; i < 7; i++) { const x = rnd() * w, y = B + 40 * s + rnd() * (P.y - B - 80 * s); if (!avoid(x, y)) droppedBag(c, x, y); }
        wetFloor(c, w * 0.75, midY + 30 * s);
      }
      break;
    }
    case 'deptstore': {
      wall(c, '#120e10', '#1a1316', 'rgba(255,200,140,0.5)');
      // fitting rooms + sale banners on the far wall
      const n = Math.max(3, Math.round(w / (90 * s)));
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * w / n;
        g.fillStyle = '#2a1420'; g.fillRect(x - 22 * s, B - 40 * s, 44 * s, 37 * s);
        g.fillStyle = '#5a1a34'; for (let k = 0; k < 6; k++) g.fillRect(x - 20 * s + k * 7 * s, B - 38 * s, 4 * s, 33 * s);
        floorSpill(g, x, B, 30 * s, 40 * s, 'rgba(255,180,200,0.06)');
      }
      neon(g, S.compact ? 'SALE' : 'MEGA SALE · 70% OFF', w * 0.5, B - 52 * s > 20 ? B - 52 * s : B * 0.45, 15 * s, '#ff6a8a');
      S.escalators.forEach(e => escalatorStatic(c, e));
      const cols = S.compact ? 2 : 3;
      for (let i = 0; i < cols; i++) {
        const x = (i + 0.5) * w / cols - 40 * s, y = B + 50 * s + (i % 2) * 40 * s;
        if (Math.abs(x + 40 * s - S.escalators[0]?.x) < 60 * s) continue;
        glassCounter(c, x, y, 80 * s, 26 * s, ['#ff4dd2', '#c47dff', '#ffd54a'][i % 3]);
      }
      for (let i = 0; i < (S.compact ? 6 : 12); i++) {
        const x = rnd() < 0.5 ? w * (0.04 + rnd() * 0.2) : w * (0.76 + rnd() * 0.2), y = B + 30 * s + rnd() * (P.y - B - 40 * s);
        if (rnd() < 0.5) rack(c, x, y); else mannequin(c, x, y);
      }
      break;
    }
    case 'foodcourt': {
      wall(c, '#140c08', '#1e140c', 'rgba(255,170,60,0.6)');
      const stalls = [
        { n: 'WOK THIS WAY', c: '#ff4a3a' }, { n: 'PRETZEL PALACE', c: '#ffb04a' }, { n: 'TACO TOWER', c: '#7dff9a' },
        { n: 'BURGER BARN', c: '#ffd54a' }, { n: 'SUSHI GO', c: '#3df6ff' }, { n: 'CINNA-BUN', c: '#ff8ad2' },
      ];
      const n = Math.max(2, Math.round(w / ((S.compact ? 130 : 200) * s)));
      for (let i = 0; i < n; i++) {
        const x0 = i * w / n, sw = w / n, st = stalls[i % stalls.length];
        g.fillStyle = '#0b0807'; g.fillRect(x0 + 4 * s, 0, sw - 8 * s, B - 18 * s);
        // menu board
        const mbY = Math.max(8 * s, B - 70 * s);
        g.fillStyle = '#0a0a10'; g.fillRect(x0 + 14 * s, mbY, sw - 28 * s, 26 * s);
        for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) { g.fillStyle = st.c + (k === 0 ? 'cc' : '55'); g.fillRect(x0 + 20 * s + k * (sw - 40 * s) / 3, mbY + 5 * s + r * 7 * s, (sw - 50 * s) / 3 * (k === 0 ? 0.6 : 0.9), 3 * s); }
        neon(g, st.n, x0 + sw / 2, Math.max(10 * s, mbY - 9 * s), (S.compact ? 11 : 13) * s, st.c);
        // counter top
        g.fillStyle = '#3a2a1e'; g.fillRect(x0 + 6 * s, B - 18 * s, sw - 12 * s, 15 * s);
        g.fillStyle = 'rgba(255,230,200,0.12)'; g.fillRect(x0 + 6 * s, B - 18 * s, sw - 12 * s, 2 * s);
        for (let k = 0; k < 3; k++) { g.fillStyle = st.c + '88'; g.fillRect(x0 + sw * (0.2 + k * 0.25), B - 15 * s, 8 * s, 6 * s); }
        floorSpill(g, x0 + sw / 2, B, sw * 0.6, 60 * s, st.c + '1c');
      }
      S.escalators.forEach(e => escalatorStatic(c, e));
      for (let i = 0; i < (S.compact ? 7 : 16); i++) {
        const x = w * (0.06 + rnd() * 0.88), y = B + 40 * s + rnd() * (P.y - B - 90 * s);
        if (avoid(x, y) || S.escalators.some(e => Math.abs(e.x - x) < 50 * s && y < e.y1 + 30 * s)) continue;
        table(c, x, y, 12 * s);
      }
      for (let i = 0; i < 6; i++) { const x = rnd() * w, y = B + 30 * s + rnd() * (P.y - B); g.fillStyle = 'rgba(255,200,120,0.25)'; g.fillRect(x, y, 8 * s, 5 * s); }
      break;
    }
    case 'toys': {
      wall(c, '#140a1a', '#1c1024', 'rgba(255,213,74,0.6)');
      shopfronts(c, [{ n: 'TOY KINGDOM', c: '#ffd54a' }, { n: 'BLOCKS', c: '#ff4a3a' }, { n: 'GAMES', c: '#3df6ff' }, { n: 'PLUSH', c: '#ff8ad2' }]);
      for (let i = 0; i < (S.compact ? 3 : 5); i++) {
        const x = w * (0.08 + i * (S.compact ? 0.38 : 0.21)), len = (P.y - B) * 0.32;
        if (Math.abs(x - P.x) < w * 0.12) continue;
        shelf(c, x - 9 * s, B + 40 * s, len, true);
      }
      // ball pit
      const bx = w * (S.compact ? 0.8 : 0.82), by = midY + 40 * s;
      g.fillStyle = '#1a2a44'; rrect(g, bx - 40 * s, by - 26 * s, 80 * s, 52 * s, 10 * s); g.fill();
      for (let i = 0; i < 80; i++) { g.fillStyle = ['#ff3a4a', '#3a8aff', '#ffd23a', '#3ae88a'][i % 4] + 'bb'; g.beginPath(); g.arc(bx - 36 * s + rnd() * 72 * s, by - 22 * s + rnd() * 44 * s, 3 * s, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'dock': {
      wall(c, '#0c0c0e', '#141416', 'rgba(255,200,40,0.6)');
      S.spawns.filter(p => p.tag === 'door').forEach(p => {
        g.fillStyle = '#1e2026'; g.fillRect(p.x - 42 * s, 0, 84 * s, B - 6 * s);
        g.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = 4; y < B - 10 * s; y += 6 * s) g.fillRect(p.x - 40 * s, y, 80 * s, 2 * s);
        g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(p.x - 40 * s, B - 26 * s, 80 * s, 20 * s);
        hazard(g, p.x - 48 * s, B - 6 * s, 96 * s, 6 * s, 6 * s);
        floorSpill(g, p.x, B, 80 * s, 70 * s, 'rgba(255,200,120,0.08)');
        label(g, 'BAY ' + (1 + Math.round(p.x / 50) % 9), p.x, 14 * s + 8, 10 * s, 'rgba(255,200,40,0.8)');
      });
      for (let i = 0; i < (S.compact ? 4 : 8); i++) { const x = rnd() < 0.5 ? w * (0.05 + rnd() * 0.2) : w * (0.75 + rnd() * 0.2), y = B + 40 * s + rnd() * (P.y - B - 60 * s); pallet(c, x, y); }
      g.strokeStyle = 'rgba(255,200,40,0.35)'; g.lineWidth = 3 * s; g.setLineDash([16 * s, 10 * s]);
      g.beginPath(); g.moveTo(w * 0.3, B); g.lineTo(w * 0.3, h); g.moveTo(w * 0.7, B); g.lineTo(w * 0.7, h); g.stroke(); g.setLineDash([]);
      break;
    }
    case 'cinema': {
      wall(c, '#12060a', '#1c0a10', 'rgba(255,60,90,0.6)');
      S.spawns.filter(p => p.tag === 'door').forEach((p, i) => {
        g.fillStyle = '#2a0c14'; g.fillRect(p.x - 26 * s, B - 40 * s, 52 * s, 37 * s);
        g.fillStyle = '#4a1420'; g.fillRect(p.x - 24 * s, B - 38 * s, 23 * s, 35 * s); g.fillRect(p.x + 1 * s, B - 38 * s, 23 * s, 35 * s);
        neon(g, String(4 + i), p.x, Math.max(16 * s, B - 52 * s), 16 * s, '#ffd54a');
        floorSpill(g, p.x, B, 50 * s, 60 * s, 'rgba(255,60,90,0.08)');
      });
      // posters
      for (let i = 0; i < (S.compact ? 2 : 4); i++) {
        for (const side of [0, 1]) {
          const x = side ? w - 16 * s : 4 * s, y = B + 40 * s + i * 90 * s;
          if (y > P.y - 30 * s) continue;
          g.fillStyle = '#0a0a10'; g.fillRect(x, y, 12 * s, 60 * s);
          g.fillStyle = ['#ff4a3a', '#3df6ff', '#ffd54a', '#c47dff'][(i + side) % 4] + '55'; g.fillRect(x + 2 * s, y + 2 * s, 8 * s, 56 * s);
          blob(g, x + 6 * s, y + 30 * s, 40 * s, 50 * s, 'rgba(255,220,180,0.06)');
        }
      }
      // red carpet runner and ropes
      g.fillStyle = 'rgba(140,10,30,0.35)'; g.fillRect(w * 0.5 - 50 * s, B, 100 * s, h);
      for (let y = B + 20 * s; y < P.y - 40 * s; y += 40 * s) for (const x of [w * 0.5 - 60 * s, w * 0.5 + 60 * s]) { g.fillStyle = '#d8b040'; g.beginPath(); g.arc(x, y, 3.5 * s, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = 'rgba(180,20,40,0.7)'; g.lineWidth = 2.5 * s;
      for (const x of [w * 0.5 - 60 * s, w * 0.5 + 60 * s]) { g.beginPath(); for (let y = B + 20 * s; y < P.y - 80 * s; y += 40 * s) { g.moveTo(x, y); g.quadraticCurveTo(x + 3 * s, y + 20 * s, x, y + 40 * s); } g.stroke(); }
      // concession stand
      if (!S.compact) { glassCounter(c, w * 0.06, midY, 110 * s, 30 * s, '#ffd54a'); label(g, 'POPCORN · CANDY', w * 0.06 + 55 * s, midY - 10 * s, 10 * s, '#ffd54a'); }
      break;
    }
    case 'parkinglot':
    case 'garage': {
      if (S.id === 'parkinglot') {
        wall(c, '#0e0d14', '#16141e', 'rgba(255,77,210,0.55)');
        // mall entrance: glass doors, canopy and the mall's name
        S.spawns.filter(p => p.tag === 'door').forEach(p => {
          g.fillStyle = 'rgba(120,200,255,0.12)'; g.fillRect(p.x - 40 * s, B - 30 * s, 80 * s, 27 * s);
          g.fillStyle = '#0a0a10'; g.fillRect(p.x - 2 * s, B - 30 * s, 4 * s, 27 * s);
          floorSpill(g, p.x, B, 90 * s, 110 * s, 'rgba(255,220,200,0.08)');
        });
        neon(g, 'GALLERIA', w * 0.5, Math.max(18 * s, B - 46 * s), 20 * s, '#ff4dd2');
        // cart corral
        const cx = w * (S.compact ? 0.84 : 0.86), cy = midY - 20 * s;
        g.strokeStyle = 'rgba(200,210,230,0.35)'; g.lineWidth = 2 * s; g.strokeRect(cx - 14 * s, cy - 40 * s, 28 * s, 80 * s);
        for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(160,170,190,0.45)'; g.strokeRect(cx - 10 * s, cy - 36 * s + i * 12 * s, 20 * s, 10 * s); }
      } else {
        // rooftop: low barrier walls and the city skyline beyond them
        const gr = g.createLinearGradient(0, 0, 0, B); gr.addColorStop(0, '#0a0614'); gr.addColorStop(1, '#1a1030');
        g.fillStyle = gr; g.fillRect(0, 0, w, B);
        for (let x = 0; x < w; x += 18 * s) { const bh = (20 + rnd() * 60) * s; g.fillStyle = '#07060c'; g.fillRect(x, B - 10 * s - bh, 16 * s, bh); for (let k = 0; k < 6; k++) if (rnd() < 0.4) { g.fillStyle = 'rgba(255,220,140,0.6)'; g.fillRect(x + 3 * s + (k % 2) * 6 * s, B - 14 * s - bh + 6 * s + Math.floor(k / 2) * 9 * s, 2 * s, 3 * s); } }
        g.fillStyle = '#2a2a30'; g.fillRect(0, B - 10 * s, w, 10 * s);
        hazard(g, 0, B - 4 * s, w, 4 * s, 8 * s);
        neon(g, 'LEVEL P4', w * 0.5, Math.max(18 * s, B - 30 * s), 14 * s, '#ffd54a');
      }
      // stalls across the top and down both sides
      const stall = 40 * s;
      g.strokeStyle = 'rgba(230,230,210,0.28)'; g.lineWidth = 2 * s;
      const depth = 66 * s;
      for (let x = (w / 2) % stall; x < w; x += stall) { g.beginPath(); g.moveTo(x, B + 4 * s); g.lineTo(x, B + depth); g.stroke(); }
      for (let x = (w / 2) % stall + stall / 2; x < w; x += stall) if (rnd() < 0.6) parkedCar(c, x, B + depth / 2 + 4 * s, true);
      for (let y = B + depth + 50 * s; y < P.y - 20 * s; y += stall) {
        for (const x0 of [0, w - depth]) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + depth, y); g.stroke(); if (rnd() < 0.55) parkedCar(c, x0 + depth / 2, y + stall / 2, false); }
      }
      g.setLineDash([22 * s, 18 * s]); g.strokeStyle = 'rgba(255,210,80,0.25)'; g.lineWidth = 3 * s;
      g.beginPath(); g.moveTo(w / 2, B + depth + 10 * s); g.lineTo(w / 2, h); g.stroke(); g.setLineDash([]);
      // lane arrow
      g.fillStyle = 'rgba(255,255,255,0.14)'; const ax = w * 0.5 + (S.compact ? 30 : 60) * s, ay = midY;
      g.beginPath(); g.moveTo(ax, ay + 18 * s); g.lineTo(ax - 9 * s, ay); g.lineTo(ax - 3 * s, ay); g.lineTo(ax - 3 * s, ay - 18 * s); g.lineTo(ax + 3 * s, ay - 18 * s); g.lineTo(ax + 3 * s, ay); g.lineTo(ax + 9 * s, ay); g.closePath(); g.fill();
      for (let i = 0; i < 3; i++) lampPost(c, w * (0.2 + i * 0.3), B + depth + 20 * s, 'rgba(255,200,120,0.10)', 110);
      for (let i = 0; i < 5; i++) blob(g, rnd() * w, B + rnd() * (P.y - B), 30 * s, 16 * s, 'rgba(0,0,0,0.35)'); // oil stains
      break;
    }
    case 'office': {
      wall(c, '#0a0e14', '#121822', 'rgba(140,200,255,0.4)');
      // glass meeting rooms along the far wall
      const n = S.compact ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * w / n;
        g.fillStyle = 'rgba(140,200,255,0.06)'; g.fillRect(x - 70 * s, 6 * s, 140 * s, B - 12 * s);
        g.strokeStyle = 'rgba(140,200,255,0.3)'; g.lineWidth = 1.5 * s; g.strokeRect(x - 70 * s, 6 * s, 140 * s, B - 12 * s);
        g.fillStyle = '#1a1e26'; rrect(g, x - 40 * s, B * 0.45, 80 * s, 22 * s, 8 * s); g.fill();
      }
      neon(g, 'REGIONAL HQ', w * 0.5, B + 14 * s, 12 * s, '#7aa8ff');
      // cubicle farm on both sides
      const cell = 56 * s;
      for (let y = B + 40 * s; y < P.y - 40 * s; y += cell) for (let x = 10 * s; x < w - cell; x += cell) {
        if (Math.abs(x + cell / 2 - P.x) < w * 0.18) continue;
        g.strokeStyle = 'rgba(160,170,190,0.35)'; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + cell - 6 * s, y); g.moveTo(x, y); g.lineTo(x, y + cell - 6 * s); g.stroke();
        g.fillStyle = '#2a2420'; g.fillRect(x + 6 * s, y + 6 * s, 28 * s, 14 * s);
        g.fillStyle = 'rgba(120,200,255,0.5)'; g.fillRect(x + 12 * s, y + 8 * s, 12 * s, 3 * s);
        blob(g, x + 18 * s, y + 12 * s, 22 * s, 14 * s, 'rgba(120,200,255,0.05)');
        if (rnd() < 0.3) for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(240,240,240,0.35)'; g.fillRect(x + rnd() * cell * 0.7, y + rnd() * cell * 0.7, 6 * s, 8 * s); }
      }
      planter(c, w * 0.5 - 90 * s, B + 30 * s, 12 * s); planter(c, w * 0.5 + 90 * s, B + 30 * s, 12 * s);
      break;
    }
    case 'curbside': {
      // road with lanes along the top, terminal canopy edge, taxis and a shuttle
      g.fillStyle = '#0b0c10'; g.fillRect(0, 0, w, B);
      g.setLineDash([24 * s, 18 * s]); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2 * s;
      for (const y of [B * 0.33, B * 0.66]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.setLineDash([]);
      for (let x = (w * 0.5) % 120 - 20; x < w; x += (S.compact ? 140 : 190) * s) {
        if (rnd() < 0.5) { // taxi
          g.fillStyle = '#d8a818'; rrect(g, x, B * 0.7, 56 * s, 24 * s, 6 * s); g.fill();
          g.fillStyle = 'rgba(30,40,60,0.8)'; g.fillRect(x + 14 * s, B * 0.7 + 4 * s, 22 * s, 16 * s);
          g.fillStyle = '#1a1408'; g.fillRect(x + 22 * s, B * 0.7 + 9 * s, 8 * s, 6 * s);
        } else parkedCar(c, x + 28 * s, B * 0.7 + 12 * s, false);
      }
      if (!S.compact) { g.fillStyle = '#e8eaf0'; rrect(g, w * 0.55, B * 0.38, 150 * s, 30 * s, 8 * s); g.fill(); g.fillStyle = 'rgba(30,60,90,0.8)'; for (let i = 0; i < 8; i++) g.fillRect(w * 0.55 + 8 * s + i * 17 * s, B * 0.38 + 4 * s, 12 * s, 7 * s); label(g, 'TERMINAL SHUTTLE', w * 0.55 + 75 * s, B * 0.38 + 21 * s, 9 * s, '#1a2a44'); }
      g.fillStyle = '#c8b020'; g.fillRect(0, B - 4 * s, w, 4 * s);
      // overhead departures sign + curb bollards
      neon(g, '✈  DEPARTURES', w * 0.5, Math.max(18 * s, B * 0.16), 15 * s, '#3df6ff');
      for (let x = 20 * s; x < w; x += 46 * s) { g.fillStyle = '#3a3e48'; g.beginPath(); g.arc(x, B + 12 * s, 4 * s, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,200,40,0.5)'; g.fillRect(x - 4 * s, B + 10 * s, 8 * s, 2 * s); }
      // sidewalk tiles + luggage dropped in the panic
      g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
      for (let y = B + 26 * s; y < h; y += 30 * s) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (let i = 0; i < 6; i++) { const x = rnd() * w, y = B + 40 * s + rnd() * (P.y - B - 60 * s); if (!avoid(x, y)) trolley(c, x, y); }
      break;
    }
    case 'checkin': {
      wall(c, '#0a1018', '#121c28', 'rgba(61,246,255,0.5)');
      S.spawns.filter(p => p.tag === 'counter').forEach((p, i) => {
        g.fillStyle = '#1e2836'; rrect(g, p.x - 34 * s, B - 22 * s, 68 * s, 20 * s, 4 * s); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(p.x - 34 * s, B - 22 * s, 68 * s, 2 * s);
        // bag belt behind the desk
        g.fillStyle = '#0c0e12'; g.fillRect(p.x + 14 * s, B - 50 * s, 18 * s, 30 * s);
        label(g, String(i + 1), p.x - 22 * s, B - 12 * s, 9 * s, 'rgba(61,246,255,0.8)');
      });
      S.screens.forEach(r => tvScreen(g, r));
      S.boards.forEach(b => { g.fillStyle = '#05060a'; g.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6); });
      // queue mazes either side
      const qw = (S.compact ? 90 : 160) * s;
      stanchions(c, w * 0.05, B + 34 * s, qw, S.compact ? 3 : 4);
      stanchions(c, w * 0.95 - qw, B + 34 * s, qw, S.compact ? 3 : 4);
      for (let i = 0; i < 5; i++) { const x = rnd() * w, y = midY + rnd() * (P.y - midY - 40 * s); if (!avoid(x, y)) trolley(c, x, y); }
      break;
    }
    case 'security': {
      wall(c, '#0c0e14', '#141822', 'rgba(255,255,255,0.35)');
      neon(g, 'SECURITY CHECKPOINT', w * 0.5, Math.max(16 * s, B - 40 * s), (S.compact ? 12 : 15) * s, '#e8f0ff');
      S.belts.forEach(b => {
        // x-ray machine over the belt
        g.fillStyle = '#2a303c'; rrect(g, b.x - 10 * s, b.y + b.h * 0.25, b.w + 20 * s, 54 * s, 6 * s); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(b.x - 2 * s, b.y + b.h * 0.25, b.w + 4 * s, 54 * s);
        g.fillStyle = 'rgba(80,255,160,0.8)'; g.fillRect(b.x + b.w + 6 * s, b.y + b.h * 0.25 + 6 * s, 3 * s, 3 * s);
        g.fillStyle = '#0c0e12'; g.fillRect(b.x, b.y, b.w, b.h);
      });
      // walk-through metal detectors on each lane
      S.spawns.filter(p => p.tag === 'door').forEach(p => {
        const y = p.path![1].y - 6 * s;
        g.fillStyle = '#c8ccd6'; g.fillRect(p.x - 18 * s, y - 4 * s, 5 * s, 22 * s); g.fillRect(p.x + 13 * s, y - 4 * s, 5 * s, 22 * s);
        g.fillStyle = '#9aa0ae'; g.fillRect(p.x - 18 * s, y - 6 * s, 36 * s, 4 * s);
        g.fillStyle = 'rgba(80,255,120,0.9)'; g.fillRect(p.x - 3 * s, y - 6 * s, 6 * s, 2 * s);
      });
      for (let i = 0; i < 10; i++) { const x = rnd() * w, y = midY + rnd() * (P.y - midY - 30 * s); if (avoid(x, y)) continue; g.fillStyle = '#4a505c'; rrect(g, x, y, 22 * s, 14 * s, 3 * s); g.fill(); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 3 * s, y + 3 * s, 16 * s, 8 * s); }
      stanchions(c, w * 0.08, P.y - 120 * s, w * 0.25, 2); stanchions(c, w * 0.67, P.y - 120 * s, w * 0.25, 2);
      break;
    }
    case 'dutyfree': {
      wall(c, '#100c14', '#1a1422', 'rgba(255,213,74,0.5)');
      shopfronts(c, [{ n: 'DUTY FREE', c: '#ffd54a' }, { n: 'PARFUM', c: '#ff8ad2' }, { n: 'SPIRITS', c: '#ffb04a' }, { n: 'CHOCOLAT', c: '#c88a5a' }, { n: 'WATCHES', c: '#3df6ff' }]);
      for (let i = 0; i < (S.compact ? 3 : 6); i++) {
        const x = w * (0.08 + (i % 3) * 0.32) + (i > 2 ? 40 * s : 0), y = B + 50 * s + Math.floor(i / 3) * 110 * s;
        if (y > P.y - 60 * s || avoid(x + 36 * s, y)) continue;
        glassCounter(c, x, y, 72 * s, 26 * s, ['#ff8ad2', '#ffd54a', '#c47dff'][i % 3]);
      }
      for (let i = 0; i < (S.compact ? 2 : 4); i++) shelf(c, i % 2 ? w - 22 * s : 4 * s, B + 40 * s + Math.floor(i / 2) * 140 * s, 110 * s, true);
      break;
    }
    case 'gate': {
      windowWall(c);
      // the aircraft parked at the gate, nose toward the glass
      { const k = (S.compact ? 0.32 : 0.5) * s; planeTop(c, w * (S.compact ? 0.3 : 0.38), B - 12 * s - 134 * k, k, 1); }
      // jet bridge door
      const d = S.spawns.find(p => p.tag === 'door')!;
      g.fillStyle = '#2a2f3a'; g.fillRect(d.x - 26 * s, 0, 52 * s, B - 6 * s);
      g.fillStyle = 'rgba(255,255,255,0.06)'; for (let y = 6 * s; y < B - 10 * s; y += 10 * s) g.fillRect(d.x - 24 * s, y, 48 * s, 2 * s);
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(d.x - 16 * s, B - 24 * s, 32 * s, 18 * s);
      neon(g, 'B12', d.x, B + 14 * s, 13 * s, '#ffd54a');
      floorSpill(g, d.x, B, 40 * s, 80 * s, 'rgba(255,220,160,0.08)');
      // gate podium
      g.fillStyle = '#1a2230'; rrect(g, d.x + 40 * s, B + 20 * s, 60 * s, 22 * s, 5 * s); g.fill();
      g.fillStyle = 'rgba(61,246,255,0.5)'; g.fillRect(d.x + 48 * s, B + 26 * s, 16 * s, 4 * s);
      S.boards.forEach(b => { g.fillStyle = '#05060a'; g.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6); });
      // waiting-area seat rows on both sides, facing the window
      const rows = S.compact ? 3 : 5;
      for (let r = 0; r < rows; r++) {
        const y = B + 110 * s + r * 42 * s; if (y > P.y - 50 * s) break;
        const n = S.compact ? 3 : 6;
        seatRow(c, 14 * s, y, n, '#1c2c44');
        seatRow(c, w - 14 * s - (n - 1) * 17 * s, y, n, '#1c2c44');
      }
      for (let i = 0; i < 6; i++) { const x = rnd() * w, y = B + 90 * s + rnd() * (P.y - B - 120 * s); if (!avoid(x, y)) droppedBag(c, x, y); }
      break;
    }
    case 'claim': {
      wall(c, '#0a1018', '#121a26', 'rgba(255,213,74,0.5)');
      S.boards.forEach(b => { g.fillStyle = '#05060a'; g.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6); });
      neon(g, 'BAGGAGE CLAIM', w * 0.5, Math.max(14 * s, S.boards[0] ? S.boards[0].y - 8 * s : 14 * s), 11 * s, '#ffd54a');
      const k = S.carousels[0];
      // carousel body: outer skirt, belt bed, central island
      shadow(g, k.cx + 10, k.cy + 14, k.rx + 30 * s, k.ry + 30 * s, 0.5);
      g.fillStyle = '#2a303a'; g.beginPath(); g.ellipse(k.cx, k.cy, k.rx + 8 * s, k.ry + 8 * s, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0c0e12'; g.beginPath(); g.ellipse(k.cx, k.cy, k.rx, k.ry, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a404c'; g.beginPath(); g.ellipse(k.cx, k.cy, k.rx - k.band, k.ry - k.band, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1a1e26'; g.beginPath(); g.ellipse(k.cx, k.cy, k.rx - k.band - 6 * s, k.ry - k.band - 6 * s, 0, 0, Math.PI * 2); g.fill();
      // feed chute where bags drop in
      g.fillStyle = '#2a303a'; g.fillRect(k.cx - 26 * s, B - 8 * s, 52 * s, k.cy - k.ry - B + 16 * s);
      g.fillStyle = '#05060a'; g.fillRect(k.cx - 20 * s, B - 6 * s, 40 * s, 14 * s);
      for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(k.cx - 20 * s + i * 9 * s, B - 6 * s, 5 * s, 14 * s); }
      neon(g, '4', k.cx, k.cy, 26 * s, '#ffd54a');
      hazard(g, k.cx - k.rx * 0.4, k.cy + k.ry - k.band - 16 * s, k.rx * 0.8, 5 * s, 6 * s);
      S.escalators.forEach(e => escalatorStatic(c, e));
      for (let i = 0; i < 6; i++) { const x = rnd() < 0.5 ? w * rnd() * 0.18 : w * (0.82 + rnd() * 0.18), y = k.cy + k.ry + 30 * s + rnd() * (P.y - k.cy - k.ry - 60 * s); if (y > 0) trolley(c, x, y); }
      break;
    }
    case 'walkway': {
      windowWall(c);
      planeTop(c, w * 0.15, B * 0.2, 0.28 * s, -1);
      if (!S.compact) planeTop(c, w * 0.85, B * 0.1, 0.24 * s, -1);
      S.escalators.forEach(e => escalatorStatic(c, e));
      neon(g, 'GATES B1–B30  ↓', w * 0.5, B + 16 * s, 12 * s, '#3df6ff');
      for (let y = B + 40 * s; y < P.y - 30 * s; y += 70 * s) {
        for (const x of S.compact ? [w * 0.5] : [w * 0.5, 14 * s, w - 14 * s]) {
          if (x !== w * 0.5) { g.fillStyle = '#1a2230'; g.fillRect(x - 6 * s, y, 12 * s, 40 * s); g.fillStyle = 'rgba(61,246,255,0.4)'; g.fillRect(x - 4 * s, y + 4 * s, 8 * s, 32 * s); }
        }
      }
      break;
    }
    case 'apron': {
      // a plane at the stand with its belt loader, plus taxi lines and ground equipment
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, w, B);
      { const k = (S.compact ? 0.42 : 0.62) * s; planeTop(c, w * 0.5, B + 20 * s - 134 * k, k, 1); }
      S.spawns.filter(p => p.tag === 'counter').forEach(p => { g.fillStyle = '#d8a020'; g.fillRect(p.x - 10 * s, p.y - 34 * s, 20 * s, 40 * s); g.fillStyle = '#1a1408'; for (let i = 0; i < 6; i++) g.fillRect(p.x - 8 * s, p.y - 32 * s + i * 6 * s, 16 * s, 2 * s); });
      g.strokeStyle = 'rgba(255,200,40,0.45)'; g.lineWidth = 3 * s;
      g.beginPath(); g.moveTo(w * 0.5, B); g.lineTo(w * 0.5, h); g.stroke();
      for (let i = 0; i < 6; i++) { const x = rnd() * w, y = B + 40 * s + rnd() * (P.y - B - 80 * s); if (avoid(x, y)) continue; g.fillStyle = '#d06a20'; g.beginPath(); g.moveTo(x, y - 7 * s); g.lineTo(x + 5 * s, y + 5 * s); g.lineTo(x - 5 * s, y + 5 * s); g.closePath(); g.fill(); }
      for (let i = 0; i < 3; i++) { const x = w * (0.12 + i * 0.38), y = midY + 40 * s; if (avoid(x, y)) continue; trolley(c, x, y); trolley(c, x + 30 * s, y); }
      for (let y = 30; y < h; y += 70 * s) { blob(g, 8, y, 20 * s, 20 * s, 'rgba(80,140,255,0.25)'); blob(g, w - 8, y, 20 * s, 20 * s, 'rgba(80,140,255,0.25)'); }
      break;
    }
    case 'hangar': {
      wall(c, '#0c0d10', '#16181c', 'rgba(255,200,40,0.5)');
      S.spawns.filter(p => p.tag === 'door').forEach(p => { g.fillStyle = '#1e2026'; g.fillRect(p.x - 46 * s, 0, 92 * s, B - 6 * s); g.fillStyle = 'rgba(255,255,255,0.04)'; for (let y = 4; y < B; y += 7 * s) g.fillRect(p.x - 44 * s, y, 88 * s, 2 * s); hazard(g, p.x - 50 * s, B - 6 * s, 100 * s, 6 * s, 6 * s); });
      g.save(); g.globalAlpha = 0.85; planeTop(c, w * (S.compact ? 0.15 : 0.12), midY - 60 * s, (S.compact ? 0.4 : 0.55) * s, -1); g.restore();
      for (let i = 0; i < 4; i++) { const x = w * (0.75 + rnd() * 0.2), y = B + 40 * s + rnd() * (P.y - B - 80 * s); g.fillStyle = '#7a1a1a'; g.fillRect(x, y, 30 * s, 18 * s); g.fillStyle = 'rgba(0,0,0,0.5)'; for (let k = 0; k < 3; k++) g.fillRect(x + 2 * s, y + 3 * s + k * 5 * s, 26 * s, 1.5 * s); }
      g.strokeStyle = 'rgba(255,200,40,0.3)'; g.lineWidth = 3 * s; g.strokeRect(w * 0.3, B + 20 * s, w * 0.4, P.y - B - 60 * s);
      break;
    }
    case 'tower': {
      windowWall(c);
      neon(g, 'APPROACH CONTROL', w * 0.5, B + 14 * s, 12 * s, '#7dff9a');
      S.radars.forEach(r => { shadow(g, r.cx + 6, r.cy + 8, r.r * 1.3, r.r * 0.8, 0.5); g.fillStyle = '#141a20'; g.beginPath(); g.arc(r.cx, r.cy, r.r + 10 * s, 0, Math.PI * 2); g.fill(); g.fillStyle = '#04120a'; g.beginPath(); g.arc(r.cx, r.cy, r.r, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(80,255,140,0.25)'; g.lineWidth = 1; for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(r.cx, r.cy, r.r * k / 3, 0, Math.PI * 2); g.stroke(); } g.beginPath(); g.moveTo(r.cx - r.r, r.cy); g.lineTo(r.cx + r.r, r.cy); g.moveTo(r.cx, r.cy - r.r); g.lineTo(r.cx, r.cy + r.r); g.stroke(); });
      // console arc under the windows
      g.fillStyle = '#1a1e26'; g.fillRect(0, B + 2 * s, w, 22 * s);
      for (let x = 10 * s; x < w; x += 26 * s) { g.fillStyle = ['rgba(80,255,140,0.5)', 'rgba(255,200,40,0.5)', 'rgba(61,246,255,0.5)'][Math.floor(rnd() * 3)]; g.fillRect(x, B + 8 * s, 12 * s, 8 * s); }
      break;
    }
    case 'parkgate': {
      // turnstiles, ticket booths, a welcome arch and flower beds
      wall(c, '#140c18', '#1e1424', 'rgba(255,213,74,0.6)');
      S.spawns.filter(p => p.tag === 'door').forEach((p, i) => {
        g.fillStyle = '#c8b060'; g.fillRect(p.x - 3 * s, B - 30 * s, 6 * s, 28 * s);
        g.fillStyle = '#3a3040'; g.fillRect(p.x - 26 * s, B - 18 * s, 14 * s, 14 * s); g.fillRect(p.x + 12 * s, B - 18 * s, 14 * s, 14 * s);
        if (i % 2 === 0) { g.fillStyle = '#5a1a3a'; rrect(g, p.x - 18 * s, 8 * s, 36 * s, Math.max(20 * s, B - 60 * s), 5 * s); g.fill(); label(g, 'TICKETS', p.x, 8 * s + Math.max(20 * s, B - 60 * s) / 2, 8 * s, '#ffd54a'); }
      });
      neon(g, 'WELCOME TO WONDERLAND', w * 0.5, Math.max(18 * s, B * 0.3), (S.compact ? 12 : 16) * s, '#ffd54a');
      for (const x of [w * 0.1, w * 0.9]) { g.fillStyle = '#16301e'; g.beginPath(); g.arc(x, midY, 40 * s, 0, Math.PI * 2); g.fill(); for (let i = 0; i < 30; i++) { const a = rnd() * 6.28, r = rnd() * 36 * s; g.fillStyle = ['#ff4dd2', '#ffd54a', '#ff6a3a', '#c47dff'][i % 4]; g.beginPath(); g.arc(x + Math.cos(a) * r, midY + Math.sin(a) * r, 3 * s, 0, 6.28); g.fill(); } }
      for (let i = 0; i < 4; i++) lampPost(c, w * (0.2 + i * 0.2), P.y - 160 * s, 'rgba(255,213,74,0.08)');
      break;
    }
    case 'midway': {
      // carnival game booths with striped awnings and prizes
      g.fillStyle = '#100a0c'; g.fillRect(0, 0, w, B);
      const n = Math.max(2, Math.round(w / (150 * s)));
      for (let i = 0; i < n; i++) {
        const x0 = i * w / n, bw = w / n;
        g.fillStyle = '#1a0e10'; g.fillRect(x0 + 6 * s, 0, bw - 12 * s, B - 20 * s);
        for (let k = 0; k < 8; k++) { g.fillStyle = ['#ff4dd2', '#3df6ff', '#ffd54a', '#7dff9a'][(k + i) % 4] + '99'; g.beginPath(); g.arc(x0 + 16 * s + k * (bw - 32 * s) / 7, B - 46 * s, 6 * s, 0, 6.28); g.fill(); }
        const sy = B - 24 * s;
        for (let k = 0; k < 10; k++) { g.fillStyle = k % 2 ? '#e8e0d8' : ['#d02a3a', '#2a6ad0', '#d0a02a'][i % 3]; g.fillRect(x0 + 4 * s + k * (bw - 8 * s) / 10, sy, (bw - 8 * s) / 10 + 1, 16 * s); }
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x0 + 4 * s, sy + 16 * s, bw - 8 * s, 4 * s);
        label(g, ['RING TOSS', 'DUCK POND', 'WHACK-A-ZOMBIE', 'HIGH STRIKER'][i % 4], x0 + bw / 2, Math.max(12 * s, B - 70 * s), 10 * s, '#ffd54a');
      }
      // popcorn and cotton candy carts
      kiosk(c, w * 0.12, midY + 20 * s, '#ffd54a', 'POPCORN'); kiosk(c, w * 0.88, midY + 20 * s, '#ff8ad2', 'COTTON CANDY');
      break;
    }
    case 'river': {
      // rock wall and a waterfall at the top feeding the river channels
      g.fillStyle = '#121418'; g.fillRect(0, 0, w, B);
      for (let i = 0; i < w / (16 * s); i++) { g.fillStyle = `rgba(${40 + rnd() * 30},${44 + rnd() * 30},${50 + rnd() * 30},0.8)`; g.beginPath(); g.ellipse(rnd() * w, rnd() * B, (10 + rnd() * 20) * s, (6 + rnd() * 12) * s, rnd(), 0, 6.28); g.fill(); }
      const ww = S.compact ? 40 : 76;
      for (const x0 of [0, w - ww]) { const gr = g.createLinearGradient(0, 0, 0, B); gr.addColorStop(0, 'rgba(120,220,255,0.0)'); gr.addColorStop(1, 'rgba(120,220,255,0.35)'); g.fillStyle = gr; g.fillRect(x0, 0, ww, B); }
      neon(g, 'LAZY RIVER', w * 0.5, Math.max(16 * s, B * 0.5), 14 * s, '#3df6ff');
      break;
    }
    case 'carousel': {
      g.fillStyle = '#120c14'; g.fillRect(0, 0, w, B);
      const k = S.spinners[0];
      shadow(g, k.cx + 10, k.cy + 14, k.r * 1.2, k.r * 0.8, 0.55);
      g.fillStyle = '#2a1e10'; g.beginPath(); g.arc(k.cx, k.cy, k.r + 8 * s, 0, 6.28); g.fill();
      g.fillStyle = '#c8a050'; g.beginPath(); g.arc(k.cx, k.cy, k.r + 8 * s, 0, 6.28); g.lineWidth = 3 * s; g.strokeStyle = '#c8a050'; g.stroke();
      for (let i = 0; i < 4; i++) lampPost(c, w * (0.1 + i * 0.27), P.y - 140 * s, 'rgba(255,213,74,0.08)');
      break;
    }
    case 'bumper': {
      wall(c, '#0c0a14', '#14101e', 'rgba(255,77,210,0.5)');
      neon(g, 'BUMPER CARS', w * 0.5, Math.max(16 * s, B - 36 * s), 15 * s, '#ff4dd2');
      // arena floor plates and a fence
      const ax = w * 0.06, ay = B + 16 * s, aw = w * 0.88, ah = (P.y - B) * 0.62;
      g.fillStyle = 'rgba(80,90,120,0.10)'; g.fillRect(ax, ay, aw, ah);
      g.strokeStyle = 'rgba(200,210,230,0.08)'; g.lineWidth = 1; for (let x = ax; x < ax + aw; x += 26 * s) { g.beginPath(); g.moveTo(x, ay); g.lineTo(x, ay + ah); g.stroke(); } for (let y = ay; y < ay + ah; y += 26 * s) { g.beginPath(); g.moveTo(ax, y); g.lineTo(ax + aw, y); g.stroke(); }
      g.strokeStyle = '#d02a3a'; g.lineWidth = 5 * s; g.strokeRect(ax, ay, aw, ah);
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.setLineDash([8 * s, 8 * s]); g.lineWidth = 5 * s; g.strokeRect(ax, ay, aw, ah); g.setLineDash([]);
      for (let i = 0; i < 5; i++) { const x = ax + 30 * s + rnd() * (aw - 60 * s), y = ay + 30 * s + rnd() * (ah - 60 * s); if (avoid(x, y)) continue; g.fillStyle = ['#d02a3a', '#2a6ad0', '#d0a02a', '#2ad06a'][i % 4]; rrect(g, x - 14 * s, y - 10 * s, 28 * s, 20 * s, 8 * s); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(x, y, 4 * s, 0, 6.28); g.fill(); }
      break;
    }
    case 'theater': {
      // stage with curtains, footlights and audience rows
      g.fillStyle = '#0a0608'; g.fillRect(0, 0, w, B);
      g.fillStyle = '#3a2412'; g.fillRect(w * 0.06, B - 26 * s, w * 0.88, 26 * s);
      for (let x = 0; x < w; x += 10 * s) { g.fillStyle = x % (20 * s) < 10 * s ? '#7a0c18' : '#5a0810'; g.fillRect(x, 0, 10 * s, B - 26 * s); }
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(w * 0.25, 0, w * 0.5, B - 26 * s);
      for (let x = w * 0.08; x < w * 0.92; x += 20 * s) { g.fillStyle = '#ffd54a'; g.fillRect(x, B - 3 * s, 6 * s, 3 * s); blob(g, x + 3 * s, B - 10 * s, 20 * s, 14 * s, 'rgba(255,213,74,0.12)'); }
      neon(g, 'SHOWTIME', w * 0.5, Math.max(16 * s, B * 0.35), 14 * s, '#ffd54a');
      for (let r = 0; r < 6; r++) { const y = B + 70 * s + r * 30 * s; if (y > P.y - 50 * s) break; const n = Math.floor((w * 0.32) / (17 * s)); seatRow(c, 12 * s, y, n, '#4a1018'); seatRow(c, w - 12 * s - (n - 1) * 17 * s, y, n, '#4a1018'); }
      break;
    }
    case 'zoo': {
      g.fillStyle = '#121008'; g.fillRect(0, 0, w, B);
      for (let i = 0; i < w / (40 * s); i++) { g.fillStyle = '#5a4020'; g.fillRect(i * 40 * s, B - 18 * s, 6 * s, 18 * s); }
      g.fillStyle = '#6a4a24'; g.fillRect(0, B - 14 * s, w, 4 * s); g.fillRect(0, B - 6 * s, w, 4 * s);
      for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(200,170,80,0.35)'; g.beginPath(); g.ellipse(rnd() * w, rnd() * (B - 20 * s), 14 * s, 8 * s, rnd(), 0, 6.28); g.fill(); }
      neon(g, 'PETTING ZOO', w * 0.5, Math.max(16 * s, B * 0.35), 14 * s, '#7dff9a');
      for (let i = 0; i < 6; i++) { const x = rnd() < 0.5 ? w * rnd() * 0.22 : w * (0.78 + rnd() * 0.22), y = B + 30 * s + rnd() * (P.y - B - 60 * s); g.fillStyle = '#a88a3a'; g.fillRect(x - 14 * s, y - 9 * s, 28 * s, 18 * s); g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x - 14 * s, y - 9 * s + k * 5 * s); g.lineTo(x + 14 * s, y - 9 * s + k * 5 * s); g.stroke(); } }
      break;
    }
    case 'mansion': {
      wall(c, '#08060a', '#100c14', 'rgba(160,120,255,0.4)');
      for (let i = 0; i < Math.round(w / (90 * s)); i++) { const x = (i + 0.5) * w / Math.round(w / (90 * s)); g.fillStyle = '#3a2a14'; g.fillRect(x - 18 * s, 8 * s, 36 * s, Math.max(24 * s, B - 40 * s)); g.fillStyle = '#16101c'; g.fillRect(x - 14 * s, 12 * s, 28 * s, Math.max(16 * s, B - 48 * s)); g.fillStyle = 'rgba(255,40,60,0.6)'; g.fillRect(x - 5 * s, 12 * s + Math.max(16 * s, B - 48 * s) * 0.3, 3 * s, 2 * s); g.fillRect(x + 2 * s, 12 * s + Math.max(16 * s, B - 48 * s) * 0.3, 3 * s, 2 * s); }
      g.fillStyle = 'rgba(90,10,30,0.3)'; g.fillRect(w * 0.5 - 60 * s, B, 120 * s, h);
      for (let i = 0; i < 6; i++) { const x = i % 2 ? w * 0.92 : w * 0.08, y = B + 50 * s + Math.floor(i / 2) * 120 * s; if (y > P.y - 40 * s) continue; blob(g, x, y, 60 * s, 50 * s, 'rgba(255,170,60,0.10)'); g.fillStyle = '#c8a050'; g.fillRect(x - 1, y - 8 * s, 2, 16 * s); for (const k of [-6, 0, 6]) { g.fillStyle = '#e8e0c8'; g.fillRect(x + k * s - 1.5 * s, y - 12 * s, 3 * s, 6 * s); g.fillStyle = '#ffb04a'; g.beginPath(); g.arc(x + k * s, y - 14 * s, 2 * s, 0, 6.28); g.fill(); } }
      break;
    }
    case 'coaster': {
      g.fillStyle = '#08080c'; g.fillRect(0, 0, w, B);
      // track sweeping across the top on supports
      g.strokeStyle = '#3a3e48'; g.lineWidth = 3 * s;
      for (let x = 0; x < w; x += 30 * s) { g.beginPath(); g.moveTo(x, B * 0.55); g.lineTo(x, B); g.stroke(); }
      for (const off of [-6, 6]) { g.strokeStyle = '#c8ccd6'; g.lineWidth = 2.5 * s; g.beginPath(); for (let x = 0; x <= w; x += 8) { const y = B * 0.5 + Math.sin(x / w * Math.PI * 3) * B * 0.18 + off * s; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
      for (let x = 0; x < w; x += 9 * s) { const y = B * 0.5 + Math.sin(x / w * Math.PI * 3) * B * 0.18; g.fillStyle = '#5a4030'; g.fillRect(x, y - 8 * s, 2 * s, 16 * s); }
      const cx = w * 0.3, cy = B * 0.5 + Math.sin(0.3 * Math.PI * 3) * B * 0.18;
      g.fillStyle = '#d02a3a'; rrect(g, cx - 40 * s, cy - 9 * s, 80 * s, 18 * s, 5 * s); g.fill();
      neon(g, 'THE DROP', w * 0.75, Math.max(16 * s, B * 0.2), 14 * s, '#ff4dd2');
      break;
    }
    case 'castle': {
      // castle wall with towers, gate and banners
      g.fillStyle = '#100c18'; g.fillRect(0, 0, w, B);
      g.fillStyle = '#5a5070'; g.fillRect(0, B - 30 * s, w, 30 * s);
      for (let x = 0; x < w; x += 18 * s) { g.fillStyle = '#6a6080'; g.fillRect(x, B - 38 * s, 10 * s, 8 * s); }
      for (const x of [w * 0.12, w * 0.5 - 70 * s, w * 0.5 + 70 * s, w * 0.88]) { g.fillStyle = '#7a7090'; g.beginPath(); g.arc(x, B - 20 * s, 24 * s, 0, 6.28); g.fill(); g.fillStyle = '#3a2a6a'; g.beginPath(); g.arc(x, B - 20 * s, 16 * s, 0, 6.28); g.fill(); g.fillStyle = '#ffd54a'; g.fillRect(x - 1, B - 52 * s, 2, 20 * s); g.fillStyle = '#ff4dd2'; g.beginPath(); g.moveTo(x + 1, B - 52 * s); g.lineTo(x + 14 * s, B - 47 * s); g.lineTo(x + 1, B - 42 * s); g.fill(); }
      g.fillStyle = '#1a1008'; g.fillRect(w * 0.5 - 30 * s, B - 30 * s, 60 * s, 30 * s);
      for (let k = 0; k < 6; k++) { g.fillStyle = '#3a3a3a'; g.fillRect(w * 0.5 - 28 * s + k * 11 * s, B - 30 * s, 3 * s, 26 * s); }
      neon(g, 'THE CASTLE', w * 0.5, Math.max(16 * s, B - 60 * s), 14 * s, '#ffd54a');
      // moat glints
      g.fillStyle = 'rgba(40,120,180,0.25)'; g.fillRect(0, B, w, 10 * s);
      break;
    }
  }
}

// ---------------------------------------------------------------- live layer
/** Position along a carousel's oval belt for parameter u in [0,1). */
export function carouselPoint(k: Carousel, u: number): Pt {
  const a = u * Math.PI * 2;
  const rx = k.rx - k.band / 2, ry = k.ry - k.band / 2;
  return { x: k.cx + Math.cos(a) * rx, y: k.cy + Math.sin(a) * ry };
}
export function suitcaseU(k: Carousel, slot: number, time: number) { return ((slot / k.slots + time * k.speed) % 1 + 1) % 1; }

const BAG_COLORS = ['#7a2a8a', '#2a5a8a', '#8a2a2a', '#2a6a4a', '#1a1a22', '#8a6a2a', '#c8c8d0', '#d06a2a'];
const FLIGHTS = ['NV 204', 'KT 118', 'ZA 666', 'BP 451', 'RX 902', 'QZ 310', 'LM 77', 'HK 515', 'OD 4', 'UX 812'];
const CITIES = ['LISBON', 'TOKYO', 'DENVER', 'OSLO', 'LIMA', 'CAIRO', 'SEOUL', 'PERTH', 'QUITO', 'RIGA'];

export function drawSceneLive(g: G, S: Scene, t: number, burst: Map<string, number>) {
  const s = S.s;
  // escalator steps and walkway treads crawl toward the player
  for (const e of S.escalators) {
    const x = e.x - e.w / 2, len = e.y1 - e.y0;
    const pitch = (e.walkway ? 14 : 9) * s;
    const off = (t * (e.walkway ? 78 : 46) * s) % pitch;
    g.save(); g.beginPath(); g.rect(x + 1, Math.max(0, e.y0), e.w - 2, len); g.clip();
    if (e.walkway) {
      g.strokeStyle = 'rgba(61,246,255,0.5)'; g.lineWidth = 2.5 * s;
      for (let y = e.y0 - pitch + off; y < e.y1; y += pitch * 2) { g.beginPath(); g.moveTo(e.x - e.w * 0.25, y); g.lineTo(e.x, y + 7 * s); g.lineTo(e.x + e.w * 0.25, y); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,0.03)'; for (let y = e.y0 - pitch + off; y < e.y1; y += pitch / 2) g.fillRect(x + 2, y, e.w - 4, 1);
    } else {
      for (let y = e.y0 - pitch + off; y < e.y1; y += pitch) {
        g.fillStyle = 'rgba(210,220,240,0.32)'; g.fillRect(x + 2, y, e.w - 4, 2 * s);
        g.fillStyle = 'rgba(255,210,60,0.75)'; g.fillRect(x + 2, y, 4 * s, 2 * s); g.fillRect(x + e.w - 6 * s, y, 4 * s, 2 * s);
      }
      g.fillStyle = 'rgba(255,255,255,0.025)'; for (let i = 4 * s; i < e.w - 4 * s; i += 3 * s) g.fillRect(x + i, e.y0, 1, len);
    }
    g.restore();
  }
  // baggage carousel: moving slats and suitcases
  S.carousels.forEach((k, ci) => {
    const n = Math.round((k.rx + k.ry) * 0.2);
    g.strokeStyle = 'rgba(160,170,190,0.18)'; g.lineWidth = 1.5 * s;
    for (let i = 0; i < n; i++) {
      const u = ((i / n + t * k.speed) % 1 + 1) % 1, a = u * Math.PI * 2;
      g.beginPath(); g.moveTo(k.cx + Math.cos(a) * (k.rx - 1), k.cy + Math.sin(a) * (k.ry - 1)); g.lineTo(k.cx + Math.cos(a) * (k.rx - k.band + 1), k.cy + Math.sin(a) * (k.ry - k.band + 1)); g.stroke();
    }
    for (let i = 0; i < k.slots; i++) {
      const b = burst.get(`${ci}:${i}`);
      const sinceBurst = b === undefined ? Infinity : t - b;
      if (sinceBurst < 7) continue;
      const p = carouselPoint(k, suitcaseU(k, i, t));
      const a = suitcaseU(k, i, t) * Math.PI * 2;
      const col = BAG_COLORS[(i * 5) % BAG_COLORS.length];
      g.save(); g.translate(p.x, p.y); g.rotate(a + Math.PI / 2 + ((i % 3) - 1) * 0.3);
      const bw = (i % 3 === 0 ? 28 : 23) * s, bh = (i % 3 === 0 ? 18 : 15) * s;
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(-bw / 2 + 2, -bh / 2 + 3, bw, bh);
      g.fillStyle = col; rrect(g, -bw / 2, -bh / 2, bw, bh, 2.5 * s); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(-bw / 2 + 2, -bh / 2 + 1, bw - 4, 1.5 * s);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(-1.5 * s, -bh / 2, 3 * s, bh);
      // the occasional bag twitches: something is inside
      if ((i + Math.floor(t * 0.7)) % 5 === 0) { g.translate(Math.sin(t * 40 + i) * 0.8, 0); g.fillStyle = 'rgba(255,40,60,0.6)'; g.fillRect(bw / 2 - 4 * s, -1 * s, 2 * s, 2 * s); }
      g.restore();
    }
  });
  // departure boards: amber rows with the odd CANCELLED blinking
  for (const b of S.boards) {
    if (!b.rows) continue;
    g.fillStyle = '#05060a'; g.fillRect(b.x, b.y, b.w, b.h);
    const rh = b.h / b.rows;
    const fs = Math.max(6, Math.min(rh * 0.55, 10 * s));
    g.font = FONT(fs, 600); g.textBaseline = 'middle';
    const shift = Math.floor(t / 3);
    for (let r = 0; r < b.rows; r++) {
      const i = (r + shift + b.seed) % FLIGHTS.length;
      const y = b.y + rh * (r + 0.5);
      g.fillStyle = 'rgba(255,200,80,0.85)'; g.textAlign = 'left'; g.fillText(FLIGHTS[i], b.x + 4 * s, y);
      if (b.w > 150 * s) g.fillText(CITIES[(i + b.seed) % CITIES.length], b.x + b.w * 0.36, y);
      const cancelled = (i + r) % 3 !== 0;
      g.textAlign = 'right';
      g.fillStyle = cancelled ? (Math.sin(t * 4 + r) > -0.3 ? 'rgba(255,60,80,0.95)' : 'rgba(255,60,80,0.25)') : 'rgba(120,255,160,0.85)';
      g.fillText(cancelled ? 'CANCELLED' : 'BOARDING', b.x + b.w - 4 * s, y);
    }
  }
  // TV walls and check-in monitors
  S.screens.forEach((r, i) => {
    const k = Math.sin(t * 3 + i * 1.7) * 0.5 + 0.5;
    const glitch = Math.sin(t * 17 + i * 9) > 0.96;
    g.fillStyle = glitch ? 'rgba(255,255,255,0.5)' : `rgba(${40 + k * 40},${120 + k * 80},${200 + k * 55},0.55)`;
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = r.y; y < r.y + r.h; y += 3) g.fillRect(r.x, y, r.w, 1);
    if (r.h > 20) { g.fillStyle = 'rgba(255,40,60,0.7)'; g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) * 0.18 * (0.8 + k * 0.4), 0, Math.PI * 2); g.fill(); }
  });
  // x-ray belts: rollers and trays sliding toward the player
  S.belts.forEach((b, i) => {
    g.save(); g.beginPath(); g.rect(b.x, b.y, b.w, b.h); g.clip();
    const off = (t * 30 * s) % (6 * s);
    g.fillStyle = 'rgba(160,170,190,0.18)';
    for (let y = b.y - 6 * s + off; y < b.y + b.h; y += 6 * s) g.fillRect(b.x, y, b.w, 1.5 * s);
    const tray = (t * 30 * s + i * 40 * s) % (b.h + 30 * s) - 20 * s;
    g.fillStyle = '#5a606c'; g.fillRect(b.x + 2 * s, b.y + tray, b.w - 4 * s, 16 * s);
    g.restore();
  });
  // radar sweeps
  S.radars.forEach((r, i) => {
    const a = t * 1.6 + i;
    const gr = g.createRadialGradient(r.cx, r.cy, 0, r.cx, r.cy, r.r);
    gr.addColorStop(0, 'rgba(80,255,140,0.35)'); gr.addColorStop(1, 'rgba(80,255,140,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(r.cx, r.cy); g.arc(r.cx, r.cy, r.r, a - 0.6, a); g.closePath(); g.fill();
    for (let k = 0; k < 4; k++) { const ba = k * 1.9 + i, d = r.r * (0.3 + (k % 3) * 0.22); const fade = ((a - ba) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); g.fillStyle = `rgba(255,60,80,${Math.max(0, 1 - fade / 3)})`; g.beginPath(); g.arc(r.cx + Math.cos(ba) * d, r.cy + Math.sin(ba) * d, 2.5 * s, 0, Math.PI * 2); g.fill(); }
  });
  // merry-go-round canopy turning
  S.spinners.forEach(k => {
    const segs = 16, a0 = t * 0.5;
    for (let i = 0; i < segs; i++) {
      g.fillStyle = i % 2 ? '#d02a5a' : '#f0e0c8';
      g.beginPath(); g.moveTo(k.cx, k.cy); g.arc(k.cx, k.cy, k.r, a0 + i / segs * Math.PI * 2, a0 + (i + 1) / segs * Math.PI * 2); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(k.cx, k.cy, k.r, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < segs; i++) { const a = a0 + i / segs * Math.PI * 2; g.fillStyle = (Math.floor(t * 4) + i) % 3 ? 'rgba(255,230,140,0.95)' : 'rgba(255,230,140,0.3)'; g.beginPath(); g.arc(k.cx + Math.cos(a) * k.r, k.cy + Math.sin(a) * k.r, 2.5 * s, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ffd54a'; g.beginPath(); g.arc(k.cx, k.cy, 10 * s, 0, Math.PI * 2); g.fill();
  });
  // twinkling string lights / bulbs
  S.lights.forEach((p, i) => {
    const on = Math.sin(t * 3 + i * 1.3) > -0.4;
    const col = ['255,213,74', '255,77,210', '61,246,255', '125,255,154'][i % 4];
    g.fillStyle = `rgba(${col},${on ? 0.95 : 0.25})`;
    g.beginPath(); g.arc(p.x, p.y, 2.4 * s, 0, Math.PI * 2); g.fill();
    if (on) { g.fillStyle = `rgba(${col},0.10)`; g.beginPath(); g.arc(p.x, p.y, 9 * s, 0, Math.PI * 2); g.fill(); }
  });
}
