// Procedurally rendered sprite atlas: pixel-art characters with auto outlines,
// plus soft glow textures used for cheap additive lighting (no shadowBlur).

export type ZombieVariant = 'walker' | 'runner' | 'twitcher' | 'carrier';

type Palette = Record<string, string>;

const WALK_A = [
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
const WALK_B = [
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

const PLAYER = [
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

const PALETTES: Record<ZombieVariant, Palette> = {
  walker: { h: '#2a2f22', s: '#7fa36a', S: '#5d7c4d', e: '#ff2a3a', b: '#7a0f14', c: '#3d4a5c', C: '#2c3646', p: '#2a2a33', P: '#18181f' },
  runner: { h: '#5a1010', s: '#a2876a', S: '#7d644d', e: '#ffd23a', b: '#8a0f14', c: '#7a1d24', C: '#5a1219', p: '#2b2224', P: '#151012' },
  twitcher: { h: '#2e1d3e', s: '#8b8fb0', S: '#676a8a', e: '#5dfff2', b: '#6a0f3a', c: '#3c2a52', C: '#2a1d3a', p: '#26203a', P: '#141020' },
  carrier: { h: '#222a33', s: '#7f9aa3', S: '#5f7880', e: '#ff3df0', b: '#7a0f14', c: '#203545', C: '#15242f', p: '#1f2a33', P: '#10161c' },
};

const PLAYER_PAL: Palette = { h: '#1b2733', v: '#35f2ff', f: '#e8b996', F: '#c8987a', a: '#2b4a63', A: '#1d3446', g: '#1e2a36' };

function renderGrid(grid: string[], pal: Palette, scale: number, outline = '#05070a'): HTMLCanvasElement {
  const w = grid[0].length, h = grid.length;
  const c = document.createElement('canvas');
  c.width = (w + 2) * scale;
  c.height = (h + 2) * scale;
  const g = c.getContext('2d')!;
  const filled = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x < w && grid[y][x] !== '.';
  // outline pass
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

export interface SpriteSet { frames: HTMLCanvasElement[]; flash: HTMLCanvasElement[]; w: number; h: number; eyes: Array<[number, number]> }

export interface Atlas {
  scale: number;
  zombies: Record<ZombieVariant, SpriteSet>;
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
  g.globalAlpha = 1;
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glowCache.set(key, c);
  return c;
}

export function buildAtlas(scale: number): Atlas {
  const zombies = {} as Record<ZombieVariant, SpriteSet>;
  (Object.keys(PALETTES) as ZombieVariant[]).forEach(v => {
    const pal = PALETTES[v];
    let a = WALK_A, b = WALK_B;
    if (v === 'runner') {
      // hood + lean: shift head one px forward on frame B for a lunging gait
      a = WALK_A.map((r, i) => (i < 5 ? r : r));
      b = WALK_B.map((r, i) => (i < 5 ? '.' + r.slice(0, -1) : r));
    }
    if (v === 'carrier') {
      // backpack crate on the shoulders
      const addPack = (rows: string[]) => rows.map((r, i) => (i >= 6 && i <= 9 ? r.slice(0, 10) + 'xx' : r));
      a = addPack(a); b = addPack(b);
    }
    const p2 = { ...pal, x: '#ff3df0' };
    const frames = [renderGrid(a, p2, scale), renderGrid(b, p2, scale)];
    zombies[v] = {
      frames,
      flash: frames.map(whiteOut),
      w: frames[0].width,
      h: frames[0].height,
      eyes: [[4 + 1, 3 + 1], [7 + 1, 3 + 1]],
    };
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
    blood: makeGlow('rgba(120,0,8,0.9)', 64, 0.35),
    shadow: makeGlow('rgba(0,0,0,0.75)', 64, 0.3),
  };
  return { scale, zombies, player, glow, softGlow: (color: string) => makeGlow(color) };
}

/** Converts '#rrggbb' to an rgba() string. */
export function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
