// Campaign content: enemy archetypes, the three worlds, and their ten levels each.
// Engine behaviour is keyed off EnemyKind; worlds only re-skin and re-name them.

import type { SceneId } from './scenes';

export type EnemyKind =
  | 'walker' | 'runner' | 'twitcher' | 'dog' | 'bird' | 'gator' | 'horse'
  | 'robot' | 'sprayer' | 'brute' | 'guard' | 'karen' | 'cart' | 'car';

export type Attack = 'grab' | 'ram' | 'ranged';
export type WordSize = 'short' | 'normal' | 'long';

export interface EnemyDef {
  attack: Attack;
  speed: number;      // multiplier on the base chase speed
  words: number;      // 2 = armoured: break the first word, then kill with the second
  size: WordSize;
  value: number;      // score multiplier for killing it
  damage: number;     // lives lost if it lands its attack
  flying?: boolean;
  scale?: number;     // sprite scale vs. a normal zombie (atlas uses integer pixel scales)
  blurb: string;      // FAQ / level intro text
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  walker:  { attack: 'grab',   speed: 1,    words: 1, size: 'normal', value: 1,   damage: 1, blurb: 'Slow and steady. Grabs and bites if it reaches you.' },
  runner:  { attack: 'grab',   speed: 1.15, words: 1, size: 'normal', value: 1.1, damage: 1, blurb: 'Bursts of speed. Watch the sprint.' },
  twitcher:{ attack: 'grab',   speed: 1.05, words: 1, size: 'normal', value: 1.2, damage: 1, blurb: 'Zig-zags so it is hard to read where it will land.' },
  dog:     { attack: 'grab',   speed: 2.1,  words: 1, size: 'short',  value: 1.3, damage: 1, blurb: 'Fast, low and hungry. Short words, but they close the gap quickly.' },
  bird:    { attack: 'grab',   speed: 1.6,  words: 1, size: 'short',  value: 1.3, damage: 1, flying: true, blurb: 'Flies straight over everything and dives at your head.' },
  gator:   { attack: 'grab',   speed: 0.6,  words: 1, size: 'normal', value: 1.5, damage: 1, blurb: 'Crawls slowly, then lunges the last few metres. Do not let it get close.' },
  horse:   { attack: 'ram',    speed: 0.7,  words: 1, size: 'normal', value: 1.6, damage: 1, blurb: 'Rears up, then charges in a straight line. Kill it during the wind-up.' },
  robot:   { attack: 'ranged', speed: 0.85, words: 1, size: 'normal', value: 2,   damage: 1, blurb: 'Stops at range and shoots. Kill these first.' },
  sprayer: { attack: 'ranged', speed: 0.8,  words: 1, size: 'normal', value: 1.8, damage: 1, blurb: 'Lobs slow toxic clouds from a distance.' },
  brute:   { attack: 'grab',   speed: 0.55, words: 2, size: 'long',   value: 2.5, damage: 2, scale: 1.6, blurb: 'A mini-boss. Two words to kill, and its grab costs two hearts.' },
  guard:   { attack: 'grab',   speed: 0.9,  words: 2, size: 'normal', value: 2,   damage: 1, blurb: 'Armoured. The first word breaks the armour, the second kills.' },
  karen:   { attack: 'grab',   speed: 0.9,  words: 1, size: 'normal', value: 1.5, damage: 1, blurb: 'Walks a zombie dog on a leash. Kill her and the dog runs loose.' },
  cart:    { attack: 'ram',    speed: 2.2,  words: 1, size: 'short',  value: 1.2, damage: 1, blurb: 'Rolls straight at you and crashes. No grab, just damage.' },
  car:     { attack: 'ram',    speed: 3.4,  words: 1, size: 'normal', value: 2,   damage: 1, blurb: 'Revs its engine, then floors it. Kill it before it launches.' },
};

/** Sprite keys the atlas knows how to draw. */
export type SpriteKey =
  | 'walker' | 'runner' | 'twitcher' | 'carrier' | 'rusher' | 'mallrat' | 'guard' | 'karen' | 'sprayer' | 'tsa' | 'clown' | 'pilot' | 'shopper' | 'guest'
  | 'dog' | 'poodle' | 'k9' | 'bird' | 'pigeon' | 'seagull' | 'gator' | 'horse' | 'carousel'
  | 'robot' | 'drone' | 'animatronic' | 'brute' | 'mascot' | 'handler' | 'santa'
  | 'cart' | 'luggage' | 'bumper' | 'car' | 'tug';

export type WorldId = 'mall' | 'airport' | 'park';
export type Ground = 'atrium' | 'foodcourt' | 'parking' | 'store' | 'carpet' | 'terminal' | 'tarmac' | 'boardwalk' | 'plaza' | 'river' | 'concrete';

export interface Skin { name: string; sprite: SpriteKey }

export interface LevelDef {
  name: string;
  scene: SceneId;
  ground: Ground;
  story: string;
  roster: Partial<Record<EnemyKind, number>>;
  boss: string;
}

export interface WorldDef {
  id: WorldId;
  name: string;
  tagline: string;
  color: string;
  skins: Record<EnemyKind, Skin>;
  levels: LevelDef[];
}

const base = (o: Partial<Record<EnemyKind, Skin>>): Record<EnemyKind, Skin> => ({
  walker: { name: 'Zombie', sprite: 'walker' },
  runner: { name: 'Runner', sprite: 'runner' },
  twitcher: { name: 'Twitcher', sprite: 'twitcher' },
  dog: { name: 'Zombie Dog', sprite: 'dog' },
  bird: { name: 'Zombie Crow', sprite: 'bird' },
  gator: { name: 'Zombie Gator', sprite: 'gator' },
  horse: { name: 'Zombie Horse', sprite: 'horse' },
  robot: { name: 'Robot', sprite: 'robot' },
  sprayer: { name: 'Sprayer', sprite: 'sprayer' },
  brute: { name: 'Brute', sprite: 'brute' },
  guard: { name: 'Guard', sprite: 'guard' },
  karen: { name: 'Karen', sprite: 'karen' },
  cart: { name: 'Cart', sprite: 'cart' },
  car: { name: 'Zombie Car', sprite: 'car' },
  ...o,
});

export const WORLDS: Record<WorldId, WorldDef> = {
  mall: {
    id: 'mall',
    name: 'THE MALL',
    tagline: 'Black Friday never ended.',
    color: '#ff4dd2',
    skins: base({
      walker: { name: 'Shopper', sprite: 'shopper' },
      runner: { name: 'Sale Rusher', sprite: 'rusher' },
      twitcher: { name: 'Mall Rat', sprite: 'mallrat' },
      dog: { name: 'Zombie Poodle', sprite: 'poodle' },
      sprayer: { name: 'Fragrance Sprayer', sprite: 'sprayer' },
      guard: { name: 'Security Guard', sprite: 'guard' },
      cart: { name: 'Shopping Cart', sprite: 'cart' },
      robot: { name: 'Demo Bot', sprite: 'robot' },
      brute: { name: 'Mall Santa', sprite: 'santa' },
      bird: { name: 'Food Court Pigeon', sprite: 'pigeon' },
    }),
    levels: [
      { name: 'Grand Atrium', scene: 'atrium', ground: 'atrium', boss: 'THE GREETER', roster: { walker: 6, runner: 2 },
        story: 'The doors opened at 6 AM and the shoppers never left. The only way out is through the atrium.' },
      { name: 'Food Court', scene: 'foodcourt', ground: 'foodcourt', boss: 'THE FRYCOOK', roster: { walker: 5, runner: 3, twitcher: 2, bird: 2 },
        story: 'Something was in the pretzel batter. The lunch rush is hungry, and you are the special of the day.' },
      { name: 'Parking Lot', scene: 'parkinglot', ground: 'parking', boss: 'THE VALET', roster: { walker: 3, karen: 3, dog: 2, cart: 3, car: 1 },
        story: 'Across the lot to the exit ramp. Every Karen who ever asked for a manager is out here, and she brought her poodle.' },
      { name: 'Department Store', scene: 'deptstore', ground: 'store', boss: 'THE FLOOR MANAGER', roster: { walker: 4, runner: 2, sprayer: 3, guard: 2 },
        story: 'The ramp was blocked, so back inside. Perfume counters ahead. Do not breathe the free samples.' },
      { name: 'Electronics', scene: 'electronics', ground: 'atrium', boss: 'THE DEMO UNIT', roster: { walker: 3, twitcher: 3, robot: 3, guard: 1 },
        story: 'The display robots woke up with the lights. They do not need to get close to hurt you.' },
      { name: 'Toy Kingdom', scene: 'toys', ground: 'foodcourt', boss: 'THE BIG BEAR', roster: { runner: 4, twitcher: 3, dog: 2, robot: 2, cart: 2 },
        story: 'Wind-up toys, battery dogs and a lot of very small zombies with very loud lungs.' },
      { name: 'Loading Dock', scene: 'dock', ground: 'concrete', boss: 'THE FORKLIFT', roster: { walker: 3, runner: 3, brute: 1, cart: 3, guard: 2 },
        story: 'The staff exit. The stock team was big before they turned. They are bigger now.' },
      { name: 'Cinema', scene: 'cinema', ground: 'carpet', boss: 'THE USHER', roster: { walker: 3, twitcher: 4, sprayer: 2, robot: 2, karen: 2, dog: 1 },
        story: 'The midnight premiere sold out. Nobody came out of screen 6.' },
      { name: 'Rooftop Garage', scene: 'garage', ground: 'parking', boss: 'THE TOW TRUCK', roster: { runner: 3, car: 3, cart: 3, karen: 2, dog: 2, brute: 1 },
        story: 'Level P4. Engines are running and nobody is behind the wheel.' },
      { name: 'Management Office', scene: 'office', ground: 'store', boss: 'THE REGIONAL MANAGER', roster: { runner: 3, twitcher: 3, guard: 3, robot: 2, sprayer: 2, brute: 1, karen: 2, dog: 2 },
        story: 'She asked to speak to the manager. This is the manager. Finish it and the mall is clear.' },
    ],
  },
  airport: {
    id: 'airport',
    name: 'THE AIRPORT',
    tagline: 'All flights cancelled. Forever.',
    color: '#3df6ff',
    skins: base({
      walker: { name: 'Traveler', sprite: 'walker' },
      runner: { name: 'Late Passenger', sprite: 'runner' },
      twitcher: { name: 'Jet-Lagger', sprite: 'twitcher' },
      dog: { name: 'K-9 Sniffer', sprite: 'k9' },
      bird: { name: 'Terminal Pigeon', sprite: 'pigeon' },
      robot: { name: 'Security Drone', sprite: 'drone' },
      sprayer: { name: 'Duty-Free Sprayer', sprite: 'sprayer' },
      guard: { name: 'TSA Agent', sprite: 'tsa' },
      karen: { name: 'Gate Karen', sprite: 'karen' },
      brute: { name: 'Baggage Handler', sprite: 'handler' },
      cart: { name: 'Runaway Luggage', sprite: 'luggage' },
      car: { name: 'Baggage Tug', sprite: 'tug' },
    }),
    levels: [
      { name: 'Curbside Drop-off', scene: 'curbside', ground: 'concrete', boss: 'THE SHUTTLE', roster: { walker: 6, runner: 2, cart: 1 },
        story: 'Departures level. The taxis stopped coming an hour ago. Get inside.' },
      { name: 'Check-in Hall', scene: 'checkin', ground: 'terminal', boss: 'THE GATE AGENT', roster: { walker: 5, runner: 3, cart: 3 },
        story: 'Every bag is overweight and every passenger is dead. The luggage is somehow still moving.' },
      { name: 'Security Line', scene: 'security', ground: 'terminal', boss: 'THE SCANNER', roster: { walker: 3, guard: 3, dog: 3, robot: 1 },
        story: 'Shoes off, laptops out, brains on the belt. The K-9 unit has picked up your scent.' },
      { name: 'Duty Free', scene: 'dutyfree', ground: 'store', boss: 'THE PERFUME COUNTER', roster: { walker: 3, twitcher: 3, sprayer: 3, karen: 2, dog: 1 },
        story: 'Tax free, mercy free. Keep moving through the fragrance aisle.' },
      { name: 'Gate B12', scene: 'gate', ground: 'carpet', boss: 'THE PILOT', roster: { walker: 3, runner: 3, bird: 3, karen: 2, dog: 2 },
        story: 'Final boarding call. Pigeons have nested in the ceiling and they are very, very hungry.' },
      { name: 'Baggage Claim', scene: 'claim', ground: 'terminal', boss: 'THE CAROUSEL', roster: { walker: 2, runner: 3, cart: 4, brute: 1, guard: 2 },
        story: 'Carousel 4 has been spinning for days. Something big is riding it.' },
      { name: 'Moving Walkway', scene: 'walkway', ground: 'carpet', boss: 'THE CONCOURSE', roster: { runner: 4, twitcher: 3, robot: 3, bird: 2 },
        story: 'The walkway is still on. So are the drones that patrol it.' },
      { name: 'The Tarmac', scene: 'apron', ground: 'tarmac', boss: 'THE TUG', roster: { runner: 3, car: 3, cart: 2, bird: 3, dog: 2 },
        story: 'Outside on the apron. Baggage tugs are doing laps with no drivers.' },
      { name: 'Hangar 9', scene: 'hangar', ground: 'concrete', boss: 'THE MECHANIC', roster: { twitcher: 3, robot: 3, brute: 1, car: 2, guard: 2, sprayer: 2 },
        story: 'The maintenance hangar. Heavy machines, heavy zombies, and nowhere to hide.' },
      { name: 'Control Tower', scene: 'tower', ground: 'terminal', boss: 'AIR TRAFFIC CONTROL', roster: { runner: 3, twitcher: 3, guard: 3, robot: 3, bird: 2, brute: 1, dog: 2 },
        story: 'The tower is the last place with power. Take it back and the radio might reach someone.' },
    ],
  },
  park: {
    id: 'park',
    name: 'THE THEME PARK',
    tagline: 'The happiest place to get eaten.',
    color: '#ffd54a',
    skins: base({
      walker: { name: 'Park Guest', sprite: 'guest' },
      runner: { name: 'Fast-Passer', sprite: 'runner' },
      twitcher: { name: 'Clown', sprite: 'clown' },
      bird: { name: 'Seagull', sprite: 'seagull' },
      gator: { name: 'Lazy River Gator', sprite: 'gator' },
      horse: { name: 'Carousel Horse', sprite: 'carousel' },
      robot: { name: 'Animatronic', sprite: 'animatronic' },
      brute: { name: 'Mascot', sprite: 'mascot' },
      cart: { name: 'Bumper Car', sprite: 'bumper' },
      dog: { name: 'Petting Zoo Goat-Dog', sprite: 'dog' },
      karen: { name: 'Stroller Karen', sprite: 'karen' },
      guard: { name: 'Park Security', sprite: 'guard' },
      sprayer: { name: 'Bubble Vendor', sprite: 'sprayer' },
      car: { name: 'Parade Float', sprite: 'car' },
    }),
    levels: [
      { name: 'Main Gate', scene: 'parkgate', ground: 'plaza', boss: 'THE TICKET TAKER', roster: { walker: 6, runner: 2, twitcher: 1 },
        story: 'Opening day. The turnstiles only turn one way now. In.' },
      { name: 'The Midway', scene: 'midway', ground: 'boardwalk', boss: 'THE RINGMASTER', roster: { walker: 4, twitcher: 4, bird: 2 },
        story: 'Step right up. The clowns were always a bit much. Now they bite.' },
      { name: 'Lazy River', scene: 'river', ground: 'river', boss: 'THE LIFEGUARD', roster: { walker: 3, gator: 4, bird: 2 },
        story: 'The river is not lazy any more. Keep away from the water line.' },
      { name: 'The Carousel', scene: 'carousel', ground: 'plaza', boss: 'THE BRASS RING', roster: { walker: 3, runner: 2, horse: 4, twitcher: 2 },
        story: 'The music box is still playing and the horses have come off their poles.' },
      { name: 'Bumper Cars', scene: 'bumper', ground: 'concrete', boss: 'THE OPERATOR', roster: { runner: 3, cart: 5, twitcher: 2, karen: 2, dog: 1 },
        story: 'No bumping, says the sign. The cars did not read it.' },
      { name: 'Animatronic Theater', scene: 'theater', ground: 'carpet', boss: 'THE SHOWRUNNER', roster: { walker: 3, robot: 4, twitcher: 3 },
        story: 'The show must go on. The singing robots have been rewired for something else.' },
      { name: 'Petting Zoo', scene: 'zoo', ground: 'boardwalk', boss: 'THE ZOOKEEPER', roster: { dog: 4, horse: 3, bird: 3, gator: 1, walker: 2 },
        story: 'Feed the animals, says the sign. They are taking it literally.' },
      { name: 'Haunted Mansion', scene: 'mansion', ground: 'store', boss: 'THE BUTLER', roster: { twitcher: 4, runner: 3, sprayer: 3, brute: 1, guard: 2 },
        story: 'It was always meant to be scary. It used to be pretend.' },
      { name: 'Roller Coaster', scene: 'coaster', ground: 'boardwalk', boss: 'THE CONDUCTOR', roster: { runner: 4, cart: 3, car: 2, robot: 2, bird: 2, gator: 2 },
        story: 'Keep your hands inside the ride at all times. Everything else wants them.' },
      { name: 'The Castle', scene: 'castle', ground: 'plaza', boss: 'THE MASCOT KING', roster: { runner: 3, twitcher: 3, horse: 2, robot: 3, gator: 2, brute: 1, karen: 2, dog: 2 },
        story: 'Fireworks at nine. Clear the castle and the park finally closes.' },
    ],
  },
};

export const WORLD_ORDER: WorldId[] = ['mall', 'airport', 'park'];

export const SHORT_WORDS = [
  'bark', 'fang', 'yap', 'gnaw', 'peck', 'wing', 'claw', 'snap', 'bolt', 'dash', 'zip', 'jolt',
  'grit', 'howl', 'lunge', 'quick', 'fury', 'rush', 'vex', 'jinx', 'oxen', 'kilo', 'mojo', 'echo',
  'ugly', 'wolf', 'hawk', 'tusk', 'beak', 'roar',
];

export const ARMOR_WORDS = ['shield', 'helmet', 'armor', 'plate', 'vest', 'badge', 'kevlar', 'visor', 'riot', 'baton'];

export const BREAK_WORDS: Record<'easy' | 'normal' | 'hard' | 'extreme', string[]> = {
  easy: ['kick', 'push', 'shove', 'hit', 'jab', 'duck', 'roll', 'free'],
  normal: ['shove', 'punch', 'elbow', 'smash', 'twist', 'knee', 'break', 'yank'],
  hard: ['headbutt', 'struggle', 'wrench', 'thrash', 'uppercut', 'escape', 'shrug'],
  extreme: ['dislocate', 'counterpunch', 'wrestle', 'resistance', 'liberate', 'overpower'],
};

export interface LevelInfo {
  index: number;          // 1-based global level number
  world: WorldDef;
  levelInWorld: number;   // 1..10
  loop: number;           // 0 on the first pass through all three worlds
  def: LevelDef;
  newKinds: EnemyKind[];
}

export function worldOrderFrom(start: WorldId): WorldId[] {
  const i = WORLD_ORDER.indexOf(start);
  return [...WORLD_ORDER.slice(i), ...WORLD_ORDER.slice(0, i)];
}

export function levelInfo(start: WorldId, index: number): LevelInfo {
  const order = worldOrderFrom(start);
  const n = index - 1;
  const world = WORLDS[order[Math.floor(n / 10) % 3]];
  const levelInWorld = (n % 10) + 1;
  const def = world.levels[levelInWorld - 1];
  const prev = levelInWorld > 1 ? world.levels[levelInWorld - 2] : null;
  const newKinds = (Object.keys(def.roster) as EnemyKind[]).filter(k => !prev || !(k in prev.roster));
  return { index, world, levelInWorld, loop: Math.floor(n / 30), def, newKinds };
}
