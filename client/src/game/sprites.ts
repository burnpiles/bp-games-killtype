// Procedurally rendered sprite atlas: pixel-art characters with auto outlines,
// plus soft glow textures used for cheap additive lighting (no shadowBlur).

import type { SpriteKey } from './worlds';

type Palette = Record<string, string>;
type Grid = string[];

const norm = (g: Grid): Grid => { const w = Math.max(...g.map(r => r.length)); return g.map(r => r.padEnd(w, '.')); };

// ---------------- humans ----------------
const WALK_A: Grid = [
  '....hhhh....',
  '...hhsshh...',
  '...ssssss...',
  '...seSSes...',
  '...ssssss...',
  '....sbbs....',
  '..cccccccc..',
  '.scccCcbccs.',
  '.s.cccbcc.s.',
  '.S.ccCccc.S.',
  '...cccccc...',
  '...pppppp...',
  '...pp..pp...',
  '...pp..pp...',
  '...PP..pp...',
  '..PPP..PPP..',
];
const WALK_B: Grid = [
  '....hhhh....',
  '...hhsshh...',
  '...ssssss...',
  '...seSSes...',
  '...ssssss...',
  '.s..sbbs..s.',
  '.scccccccs..',
  '..ccCccbcc..',
  '...cccbcc...',
  '...ccCccc...',
  '...cccccc...',
  '...pppppp...',
  '...pp..pp...',
  '...pp..pp...',
  '...pp..PP...',
  '..PPP..PPP..',
];

const PLAYER: Grid = [
  '....hhhh....',
  '...hhhhhh...',
  '...hvvvvh...',
  '...ffffff...',
  '...ffFFff...',
  '..aaaaaaaa..',
  '.aaAaaaaAaa.',
  '.fa.aaaa.af.',
  '.f..aAAa..f.',
  '....aaaa....',
  '...gggggg...',
  '...gg..gg...',
  '...gg..gg...',
  '..ggg..ggg..',
];

// ---------------- animals ----------------
const DOG_TOP = [
  '..........oo..',
  '.........oOOo.',
  '.........OeOOt',
  'o.......oOOOtt',
  '.ooooooooOOo..',
  '.oOOOOOOOOo...',
  '.oOOOOOOOOo...',
];
const DOG_A = [...DOG_TOP, '.l.l....l.l...', 'l..l...l..l...'];
const DOG_B = [...DOG_TOP, '..l.l..l.l....', '..l..l.l..l...'];

const BIRD_A = [
  'ww.........ww',
  '.www.....www.',
  '..wwwbbbwww..',
  '....bbbebk...',
  '.....bbbb....',
  '......t.t....',
];
const BIRD_B = [
  '.............',
  '.....bbb.....',
  '..wwbbbebk...',
  '.wwwwbbbwwww.',
  'ww...bbbb..ww',
  '......t.t....',
];

const GATOR_A = [
  '..............gge.....',
  '........ggggggGGGgggg.',
  'ggg..ggGGGGGGGGGGtttgg',
  '.gggggGGGGGGGGGGGggggg',
  '....ggGGGGGGGGGgg.....',
  '....l.l.....l.l.......',
];
const GATOR_B = [
  '..............gge.ggg.',
  '........ggggggGGGg.tt.',
  'ggg..ggGGGGGGGGGG.....',
  '.gggggGGGGGGGGGGGtttgg',
  '....ggGGGGGGGGGggggg..',
  '.....l.l.....l.l......',
];

const HORSE_TOP = [
  '.............mm...',
  '............mHHH..',
  '...........mHHeHH.',
  '..........mHHHHHHn',
  '.........mHHH..nn.',
  '..m.....HHHH......',
  '.mHHHHHHHHHH......',
  'mHHHHHHHHHHH......',
  '..HHHHHHHHHH......',
];
const HORSE_A = [...HORSE_TOP, '..HH.HH...HH.HH...', '..H...H...H...H...', '..h...h...h...h...'];
const HORSE_B = [...HORSE_TOP, '..HH..HH.HH..HH...', '...H..H...H..H....', '...h..h...h..h....'];

// ---------------- machines ----------------
const ROBOT_TOP = [
  '....aaaa....',
  '...aAAAAa...',
  '...aReeRa...',
  '...aAAAAa...',
  '....anna....',
  '..kkkkkkkk..',
  '.kKKkkkkKKk.',
  '.k.kKCCKk.k.',
  '.g.kkCCkk.g.',
  '...kkkkkk...',
];
const ROBOT_A = [...ROBOT_TOP, '...kk..kk...', '...kk..kk...', '...KK..kk...', '..KKK..KKK..'];
const ROBOT_B = [...ROBOT_TOP, '...kk..kk...', '...kk..kk...', '...kk..KK...', '..KKK..KKK..'];

const CART_TOP = [
  'h.............',
  '.h............',
  '.kkkkkkkkkkkkk',
  '.kk.k.k.k.k.kk',
  '..kkkkkkkkkkk.',
  '..k.e.k.k.e.k.',
  '..kktttttttkk.',
  '...kkkkkkkkk..',
  '...k.......k..',
  '..kkkkkkkkkkk.',
];
const CART_A = [...CART_TOP, '..o.......o...'];
const CART_B = [...CART_TOP, '...o.......o..'];

const LUGGAGE_A = [
  '....hhhh....',
  '....h..h....',
  '.LLLLLLLLLL.',
  '.LllllllllL.',
  '.Ll.e..e.lL.',
  '.LlttttttlL.',
  '.LllllllllL.',
  '.LLLLLLLLLL.',
  '.LllllllllL.',
  '.LLLLLLLLLL.',
  '..o......o..',
];
const LUGGAGE_B = [...LUGGAGE_A.slice(0, 10), '...o....o...'];

const BUMPER_A = [
  '......kk........',
  '.....kssk.......',
  '.....kesk.......',
  '...rrrrrrrrrr...',
  '..rRRRRRRRRRRr..',
  '.rRRRRRRRRRRRRr.',
  'bbbbbbbbbbbbbbbb',
  '.rrrrrrrrrrrrrr.',
  '..oo........oo..',
];
const BUMPER_B = [...BUMPER_A.slice(0, 8), '...oo......oo...'];

const CAR_TOP = [
  '.......kkkkkkkkk........',
  '......kwwwwkwwwwwk......',
  '.....kwwwwwkwwwwwwk.....',
  'kkkkkkkkkkkkkkkkkkkkkkk.',
  'kbbbbbbbbbbbbbbbbbbbbbek',
  'kbbbbbbbbbbbbbbbbbbbbbbk',
  'kBBBBBBBBBBBBBBBBBttttBk',
  'kkkooookkkkkkkkkkoooookk',
];
const CAR_A = [...CAR_TOP, '...oOOo.........oOOo....', '....oo...........oo.....'];
const CAR_B = [...CAR_TOP, '...ooOo.........ooOo....', '....oo...........oo.....'];

// ---------------- palettes ----------------
const HUMAN_BASE: Palette = { h: '#2a2f22', s: '#7fa36a', S: '#5d7c4d', e: '#ff2a3a', b: '#7a0f14', c: '#3d4a5c', C: '#2c3646', p: '#2a2a33', P: '#18181f', x: '#ff3df0' };
const human = (o: Palette): Palette => ({ ...HUMAN_BASE, ...o });

type Body = 'human' | 'dog' | 'bird' | 'gator' | 'horse' | 'robot' | 'cart' | 'luggage' | 'bumper' | 'car';
interface SpriteSpec { body: Body; pal: Palette; scale?: number; acc?: 'pack' | 'bag' | 'bottle' | 'badge' | 'beard' | 'nose'; eye: string; lean?: boolean }

const SPECS: Record<SpriteKey, SpriteSpec> = {
  walker: { body: 'human', pal: human({}), eye: '#ff2a3a' },
  runner: { body: 'human', pal: human({ h: '#5a1010', s: '#a2876a', S: '#7d644d', e: '#ffd23a', b: '#8a0f14', c: '#7a1d24', C: '#5a1219', p: '#2b2224', P: '#151012' }), eye: '#ffd23a', lean: true },
  twitcher: { body: 'human', pal: human({ h: '#2e1d3e', s: '#8b8fb0', S: '#676a8a', e: '#5dfff2', b: '#6a0f3a', c: '#3c2a52', C: '#2a1d3a', p: '#26203a', P: '#141020' }), eye: '#5dfff2' },
  carrier: { body: 'human', pal: human({ h: '#222a33', s: '#7f9aa3', S: '#5f7880', e: '#ff3df0', c: '#203545', C: '#15242f', p: '#1f2a33', P: '#10161c' }), acc: 'pack', eye: '#ff3df0' },
  shopper: { body: 'human', pal: human({ h: '#4a2a18', c: '#1f6f78', C: '#17535a', x: '#ffd23a' }), acc: 'bag', eye: '#ff2a3a' },
  guest: { body: 'human', pal: human({ h: '#6a4a20', c: '#d8642a', C: '#a84a1c', p: '#3a5a8a', x: '#ff4dd2' }), acc: 'bag', eye: '#ff2a3a' },
  guard: { body: 'human', pal: human({ h: '#101626', c: '#1c2a52', C: '#121c3a', p: '#121a2e', x: '#ffd54a' }), acc: 'badge', eye: '#ff6a2a' },
  tsa: { body: 'human', pal: human({ h: '#1a1a1a', c: '#5a7aa8', C: '#46628a', p: '#1a2030', x: '#e8e8f0' }), acc: 'badge', eye: '#ff6a2a' },
  karen: { body: 'human', pal: human({ h: '#e6c35c', s: '#9fb08a', c: '#d06a9a', C: '#a8507a', p: '#e8e0d0', P: '#5a3a2a' }), eye: '#ff2a3a' },
  sprayer: { body: 'human', pal: human({ h: '#1a1018', c: '#d8d8e0', C: '#a8a8b8', p: '#2a2a33', x: '#b04dff' }), acc: 'bottle', eye: '#b04dff' },
  clown: { body: 'human', pal: human({ h: '#ff3a3a', s: '#e8e0d8', S: '#c8c0b8', b: '#ff2040', c: '#ffd23a', C: '#3a8aff', p: '#3a8aff', P: '#ff3a3a', x: '#ff2040' }), acc: 'nose', eye: '#5dfff2' },
  pilot: { body: 'human', pal: human({ h: '#e8e8f0', c: '#1a2440', C: '#121a30', x: '#ffd54a' }), acc: 'badge', eye: '#ff2a3a' },
  brute: { body: 'human', pal: human({ h: '#1a1a14', s: '#6f8a5a', S: '#4f6a3e', c: '#4a3a2a', C: '#36281c', p: '#222', x: '#ff2a3a' }), scale: 1.6, eye: '#ff2a3a' },
  santa: { body: 'human', pal: human({ h: '#e8e8e8', s: '#b8c8a8', S: '#e8e8e8', b: '#e8e8e8', c: '#b0141e', C: '#7a0c14', p: '#7a0c14', P: '#111', x: '#e8e8e8' }), scale: 1.6, acc: 'beard', eye: '#ff2a3a' },
  mascot: { body: 'human', pal: human({ h: '#6a3a18', s: '#8a5a2a', S: '#6a4220', b: '#2a0a04', c: '#8a5a2a', C: '#6a4220', p: '#6a4220', P: '#3a2010' }), scale: 1.6, eye: '#ffd23a' },
  handler: { body: 'human', pal: human({ h: '#222', c: '#ff7a1a', C: '#c85a10', p: '#2a3040', x: '#e8f04a' }), scale: 1.6, acc: 'badge', eye: '#ff2a3a' },
  dog: { body: 'dog', pal: { o: '#2a2a26', O: '#6a5a4a', e: '#ff2a3a', t: '#e8e0d0', l: '#1a1a16' }, eye: '#ff2a3a' },
  poodle: { body: 'dog', pal: { o: '#c8a0b0', O: '#f0d8e0', e: '#ff2a3a', t: '#ff4060', l: '#a07888' }, eye: '#ff2a3a' },
  k9: { body: 'dog', pal: { o: '#1a1410', O: '#7a5428', e: '#ffd23a', t: '#e8e0d0', l: '#120e0a' }, eye: '#ffd23a' },
  bird: { body: 'bird', pal: { w: '#141418', b: '#2a2a32', e: '#ff2a3a', k: '#e8b020', t: '#e8b020' }, eye: '#ff2a3a' },
  pigeon: { body: 'bird', pal: { w: '#8a90a8', b: '#a8aec0', e: '#ff6a2a', k: '#3a3a3a', t: '#c87a7a' }, eye: '#ff6a2a' },
  seagull: { body: 'bird', pal: { w: '#c8ccd8', b: '#e8ecf0', e: '#ff2a3a', k: '#ffb020', t: '#ffb020' }, eye: '#ff2a3a' },
  gator: { body: 'gator', pal: { g: '#2a4a2a', G: '#4a7a3a', e: '#ffd23a', t: '#e8e0c0', l: '#1a3a1a' }, eye: '#ffd23a' },
  horse: { body: 'horse', pal: { H: '#5a3a24', m: '#1a1008', e: '#ff2a3a', n: '#1a1008', h: '#0a0a0a' }, eye: '#ff2a3a' },
  carousel: { body: 'horse', pal: { H: '#e8e0d8', m: '#ff4dd2', e: '#ff2a3a', n: '#ffd54a', h: '#ffd54a' }, eye: '#ff2a3a' },
  robot: { body: 'robot', pal: { a: '#2a3040', A: '#5a6478', R: '#ff2a3a', e: '#ff8080', n: '#1a1e28', k: '#3a4458', K: '#6a7890', C: '#ff3a3a', g: '#ffb020' }, eye: '#ff2a3a' },
  drone: { body: 'robot', pal: { a: '#c8d4e6', A: '#e8f0f8', R: '#3df6ff', e: '#c8ffff', n: '#5a6478', k: '#9aa8c0', K: '#d8e0ec', C: '#3df6ff', g: '#3df6ff' }, eye: '#3df6ff' },
  animatronic: { body: 'robot', pal: { a: '#6a4220', A: '#9a6a3a', R: '#ffd23a', e: '#ffffff', n: '#3a2410', k: '#c8a050', K: '#e8c878', C: '#ff4dd2', g: '#ff4dd2' }, eye: '#ffd23a' },
  cart: { body: 'cart', pal: { h: '#8a96a8', k: '#8a96a8', e: '#ff2a3a', t: '#e8e0d0', o: '#141418' }, eye: '#ff2a3a' },
  luggage: { body: 'luggage', pal: { h: '#222', L: '#1a1a22', l: '#7a2a8a', e: '#ffd23a', t: '#e8e0d0', o: '#111' }, eye: '#ffd23a' },
  bumper: { body: 'bumper', pal: { k: '#2a2f22', s: '#7fa36a', e: '#ff2a3a', r: '#b0141e', R: '#ff3a4a', b: '#222', o: '#111' }, eye: '#ff2a3a' },
  car: { body: 'car', pal: { k: '#08090c', w: '#3a5a6a', b: '#5a1a20', B: '#3a1014', e: '#fff2a0', t: '#e8e0d0', o: '#111', O: '#888' }, eye: '#fff2a0' },
  tug: { body: 'car', pal: { k: '#08090c', w: '#3a5a6a', b: '#d8a020', B: '#a87810', e: '#fff2a0', t: '#222', o: '#111', O: '#888' }, eye: '#fff2a0' },
};

function addAcc(rows: Grid, acc: SpriteSpec['acc']): Grid {
  switch (acc) {
    case 'pack': return rows.map((r, i) => (i >= 6 && i <= 9 ? r.slice(0, 10) + 'xx' : r));
    case 'bag': return rows.map((r, i) => (i >= 9 && i <= 11 ? r.slice(0, 10) + 'xx' : r));
    case 'bottle': return rows.map((r, i) => (i >= 6 && i <= 8 ? r.slice(0, 11) + 'x' : r));
    case 'badge': return rows.map((r, i) => (i === 7 ? r.slice(0, 4) + 'x' + r.slice(5) : r));
    case 'beard': return rows.map((r, i) => (i === 4 ? '...hhhhhh...' : i === 5 ? '....hhhh....' : r));
    case 'nose': return rows.map((r, i) => (i === 3 ? r.slice(0, 5) + 'xx' + r.slice(7) : r));
    default: return rows;
  }
}

function framesFor(spec: SpriteSpec): [Grid, Grid] {
  switch (spec.body) {
    case 'human': {
      const b = spec.lean ? WALK_B.map((r, i) => (i < 5 ? '.' + r.slice(0, -1) : r)) : WALK_B;
      return [addAcc(WALK_A, spec.acc), addAcc(b, spec.acc)];
    }
    case 'dog': return [DOG_A, DOG_B];
    case 'bird': return [BIRD_A, BIRD_B];
    case 'gator': return [GATOR_A, GATOR_B];
    case 'horse': return [HORSE_A, HORSE_B];
    case 'robot': return [ROBOT_A, ROBOT_B];
    case 'cart': return [CART_A, CART_B];
    case 'luggage': return [LUGGAGE_A, LUGGAGE_B];
    case 'bumper': return [BUMPER_A, BUMPER_B];
    case 'car': return [CAR_A, CAR_B];
  }
}

const PLAYER_PAL: Palette = { h: '#1b2733', v: '#35f2ff', f: '#e8b996', F: '#c8987a', a: '#2b4a63', A: '#1d3446', g: '#1e2a36' };

function renderGrid(grid: Grid, pal: Palette, scale: number, outline = '#05070a'): HTMLCanvasElement {
  grid = norm(grid);
  const w = grid[0].length, h = grid.length;
  const c = document.createElement('canvas');
  c.width = (w + 2) * scale;
  c.height = (h + 2) * scale;
  const g = c.getContext('2d')!;
  const filled = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x < w && grid[y][x] !== '.';
  g.fillStyle = outline;
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    if (filled(x, y)) continue;
    if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
      g.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale);
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = grid[y][x];
    if (ch === '.') continue;
    g.fillStyle = pal[ch] ?? '#ff00ff';
    g.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale);
  }
  return c;
}

function whiteOut(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Eye centre in canvas pixels, found from the 'e' cells of the grid. */
function eyeOf(grid: Grid, scale: number): [number, number] {
  grid = norm(grid);
  let sx = 0, sy = 0, n = 0;
  grid.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === 'e') { sx += x; sy += y; n++; } });
  if (!n) return [grid[0].length / 2 * scale, 4 * scale];
  return [(sx / n + 1.5) * scale, (sy / n + 1.5) * scale];
}

export interface SpriteSet { frames: HTMLCanvasElement[]; flash: HTMLCanvasElement[]; w: number; h: number; eye: [number, number]; eyeColor: string; body: Body; px: number }

export interface Atlas {
  scale: number;
  sprites: Record<SpriteKey, SpriteSet>;
  player: HTMLCanvasElement;
  glow: Record<string, HTMLCanvasElement>;
  softGlow(color: string): HTMLCanvasElement;
}

const glowCache = new Map<string, HTMLCanvasElement>();
function makeGlow(color: string, size = 128, hard = 0.0): HTMLCanvasElement {
  const key = `${color}|${size}|${hard}`;
  const cached = glowCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(Math.max(0.05, hard), color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glowCache.set(key, c);
  return c;
}

export function buildAtlas(scale: number): Atlas {
  const sprites = {} as Record<SpriteKey, SpriteSet>;
  (Object.keys(SPECS) as SpriteKey[]).forEach(k => {
    const spec = SPECS[k];
    const px = Math.max(1, Math.round(scale * (spec.scale ?? 1)));
    const [a, b] = framesFor(spec);
    const frames = [renderGrid(a, spec.pal, px), renderGrid(b, spec.pal, px)];
    sprites[k] = { frames, flash: frames.map(whiteOut), w: frames[0].width, h: frames[0].height, eye: eyeOf(a, px), eyeColor: spec.eye, body: spec.body, px };
  });
  const player = renderGrid(PLAYER, PLAYER_PAL, scale);
  const glow: Record<string, HTMLCanvasElement> = {
    white: makeGlow('rgba(255,255,255,0.9)'),
    cyan: makeGlow('rgba(60,240,255,0.85)'),
    red: makeGlow('rgba(255,40,60,0.85)'),
    orange: makeGlow('rgba(255,150,40,0.9)'),
    magenta: makeGlow('rgba(255,60,240,0.85)'),
    yellow: makeGlow('rgba(255,225,80,0.9)'),
    green: makeGlow('rgba(90,255,130,0.85)'),
    purple: makeGlow('rgba(176,77,255,0.85)'),
    blood: makeGlow('rgba(120,0,8,0.9)', 64, 0.35),
    shadow: makeGlow('rgba(0,0,0,0.75)', 64, 0.3),
  };
  return { scale, sprites, player, glow, softGlow: (color: string) => makeGlow(color) };
}

/** Small standalone PNG of a sprite, for the menus and level cards. */
export function spriteThumb(key: SpriteKey, px = 4): string {
  const spec = SPECS[key];
  const [a] = framesFor(spec);
  return renderGrid(a, spec.pal, px).toDataURL();
}

/** Converts '#rrggbb' to an rgba() string. */
export function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
