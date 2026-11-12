// Static game data: words, difficulty tuning, weapons.
// Gameplay numbers are ported from the original ZombieTypingGame so runs stay comparable.

export type Difficulty = 'easy' | 'normal' | 'hard' | 'extreme';
export type WeaponId = 'pistol' | 'grenade' | 'rocket' | 'machinegun' | 'bazooka' | 'nuke';
export type SpecialWeaponId = Exclude<WeaponId, 'pistol'>;
export type Behavior = 'normal' | 'zigzag' | 'sprinter';

export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard', 'extreme'];

export const MAX_LIVES = 5;

export const BOSS_THRESHOLD: Record<Difficulty, number> = {
  easy: 10,
  normal: 15,
  hard: 20,
  extreme: 30,
};

export const WORDS: Record<Difficulty, string[]> = {
  easy: [
    'zombie', 'brain', 'death', 'blood', 'skull', 'grave', 'fear', 'dark',
    'shadow', 'monster', 'undead', 'weapon', 'bullet', 'reload', 'ammo',
    'night', 'howl', 'bite', 'claw', 'rot', 'crypt', 'ghoul', 'vault', 'knife',
    'torch', 'pulse', 'yell', 'quiet', 'lure', 'east', 'into', 'just', 'over',
  ],
  normal: [
    'zombie', 'brain', 'death', 'blood', 'skull', 'grave', 'horror', 'terror',
    'nightmare', 'fear', 'darkness', 'shadow', 'monster', 'creature', 'undead',
    'survival', 'weapon', 'bullet', 'gunshot', 'reload', 'ammo', 'headshot',
    'outbreak', 'quarantine', 'vaccine', 'infected', 'lockdown', 'jagged',
    'kinetic', 'voltage', 'yellow', 'ignite', 'perimeter', 'evacuate',
  ],
  hard: [
    'zombie', 'brain', 'death', 'blood', 'skull', 'grave', 'horror', 'terror',
    'nightmare', 'fear', 'darkness', 'shadow', 'monster', 'creature', 'undead',
    'apocalypse', 'survival', 'weapon', 'bullet', 'gunshot', 'reload', 'ammo',
    'headshot', 'critical', 'damage', 'destroy', 'eliminate', 'annihilate',
    'massacre', 'carnage', 'slaughter', 'rampage', 'butcher', 'mutilate',
    'quarantine', 'virulent', 'juggernaut', 'kerosene', 'overrun', 'incinerate',
    'yellowjacket', 'wasteland', 'contagion', 'ultraviolet',
  ],
  extreme: [
    'abomination', 'apocalyptic', 'annihilation', 'bloodthirsty', 'carnivorous',
    'decomposition', 'extermination', 'hemorrhaging', 'incineration', 'liquefaction',
    'metamorphosis', 'necromancy', 'obliteration', 'putrefaction', 'resurrection',
    'strangulation', 'transformation', 'undifferentiated', 'vaporization', 'weaponization',
    'xenogenesis', 'zombification', 'catastrophic', 'disintegration', 'experimentation',
    'hallucination', 'intimidation', 'jurisdiction', 'manifestation', 'neutralization',
    'quarantined', 'yellowfever', 'kaleidoscopic', 'goliathan', 'fragmentation',
  ],
};

export const DIFFICULTY_CONFIG: Record<Difficulty, {
  maxZombies: number;
  spawnRate: number; // ms
  description: string;
  scoreMultiplier: number;
  laserInterval: number; // seconds between boss volleys
  color: string;
  threat: number;
}> = {
  easy: { maxZombies: 3, spawnRate: 2500, description: 'Cleaner lanes, softer zombies, more drops', scoreMultiplier: 1, laserInterval: 4.6, color: '#3dffa8', threat: 1 },
  normal: { maxZombies: 4, spawnRate: 2000, description: 'Balanced rush, mixed behaviors, fair drops', scoreMultiplier: 1.2, laserInterval: 3.8, color: '#ffb340', threat: 2 },
  hard: { maxZombies: 6, spawnRate: 1500, description: 'Aggressive packs, more sprinters, hotter drops', scoreMultiplier: 1.5, laserInterval: 3.1, color: '#ff5a6e', threat: 3 },
  extreme: { maxZombies: 6, spawnRate: 1200, description: 'Fast swarms, brutal patterns, volatile drops', scoreMultiplier: 2, laserInterval: 2.5, color: '#ff4dff', threat: 4 },
};

export const DIFFICULTY_PERSONALITY: Record<Difficulty, {
  speedBonus: number;
  specialDropBase: number;
  behaviorWeights: Record<Behavior, number>;
  weaponPool: SpecialWeaponId[];
}> = {
  easy: {
    speedBonus: -2,
    specialDropBase: 0.2,
    behaviorWeights: { normal: 0.78, zigzag: 0.17, sprinter: 0.05 },
    weaponPool: ['grenade', 'machinegun', 'rocket'],
  },
  normal: {
    speedBonus: 0,
    specialDropBase: 0.16,
    behaviorWeights: { normal: 0.58, zigzag: 0.24, sprinter: 0.18 },
    weaponPool: ['grenade', 'rocket', 'machinegun', 'bazooka'],
  },
  hard: {
    speedBonus: 2,
    specialDropBase: 0.18,
    behaviorWeights: { normal: 0.38, zigzag: 0.32, sprinter: 0.3 },
    weaponPool: ['grenade', 'rocket', 'machinegun', 'bazooka', 'bazooka', 'nuke'],
  },
  extreme: {
    speedBonus: 5,
    specialDropBase: 0.2,
    behaviorWeights: { normal: 0.22, zigzag: 0.33, sprinter: 0.45 },
    weaponPool: ['rocket', 'machinegun', 'bazooka', 'bazooka', 'nuke', 'nuke'],
  },
};

export interface WeaponDef {
  name: string;
  short: string;
  ammo: number;
  duration: number; // ms, for timed weapons
  damage: number;
  color: string;
  label: string;
  splashRadius: number;
  maxCollateral: number;
  clearProjectiles: boolean;
  wipeField: boolean;
  explosive: boolean;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: { name: 'PISTOL', short: 'PISTOL', ammo: 0, duration: 0, damage: 1, color: '#d8f6ff', label: 'SINGLE', splashRadius: 0, maxCollateral: 0, clearProjectiles: false, wipeField: false, explosive: false },
  grenade: { name: 'GRENADE', short: 'GRENADE', ammo: 3, duration: 0, damage: 2, color: '#ffb020', label: 'BLAST', splashRadius: 78, maxCollateral: 2, clearProjectiles: false, wipeField: false, explosive: true },
  rocket: { name: 'ROCKET LAUNCHER', short: 'ROCKET', ammo: 5, duration: 0, damage: 3, color: '#ff4040', label: 'SPRAY', splashRadius: 128, maxCollateral: 4, clearProjectiles: false, wipeField: false, explosive: true },
  machinegun: { name: 'MACHINE GUN', short: 'MG', ammo: 0, duration: 15000, damage: 1, color: '#5dff7a', label: 'CHAIN', splashRadius: 96, maxCollateral: 1, clearProjectiles: false, wipeField: false, explosive: false },
  bazooka: { name: 'BAZOOKA', short: 'BAZOOKA', ammo: 2, duration: 0, damage: 4, color: '#ff4dff', label: 'SIEGE', splashRadius: 190, maxCollateral: 99, clearProjectiles: false, wipeField: false, explosive: true },
  nuke: { name: 'NUCLEAR LAUNCHER', short: 'NUKE', ammo: 1, duration: 0, damage: 999, color: '#3df6ff', label: 'PURGE', splashRadius: 9999, maxCollateral: 999, clearProjectiles: true, wipeField: true, explosive: true },
};

export const COMBO_TIERS = [
  { min: 0, name: '', color: '#7fe9ff' },
  { min: 10, name: 'HOT', color: '#ffe14d' },
  { min: 25, name: 'LETHAL', color: '#ff9a3d' },
  { min: 50, name: 'BRUTAL', color: '#ff4d6d' },
  { min: 100, name: 'UNSTOPPABLE', color: '#ff4dff' },
];

export function comboTier(combo: number): number {
  let tier = 0;
  for (let i = 0; i < COMBO_TIERS.length; i++) if (combo >= COMBO_TIERS[i].min) tier = i;
  return tier;
}

export const BOSS_SENTENCES: Record<Difficulty, string[]> = {
  easy: ['the night is dark', 'aim true and survive', 'reload and carry on'],
  normal: ['fear the rising horde', 'steady hands save lives', 'the bunker will not hold'],
  hard: ['only the fearless endure the storm', 'precision and courage end nightmares', 'steel your nerves and fight on'],
  extreme: [
    'mechanized death marches and we stand defiant',
    'in the abyss of terror we forge our will',
    'no mercy no surrender purge the darkness',
  ],
};

export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
