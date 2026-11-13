// Finishing lines typed to put each boss down. Every boss has its own lines, so the closer
// fits the fight: short ones on Easy and Normal, long ones on Hard and Extreme.
// Lowercase letters and spaces only, because these are typed character by character.
import type { Difficulty } from './config';

type Lines = { short: string[]; long: string[] };

const FINISHERS: Record<string, Lines> = {
  // ---- Mall
  'THE GREETER': {
    short: ['welcome to nowhere', 'have a dead day', 'thanks for not shopping'],
    long: ['the doors are open but nobody is coming home', 'smile and wave while the whole mall burns', 'no more greetings for the walking dead'],
  },
  'THE FRYCOOK': {
    short: ['order up and out', 'your shift is over', 'no more extra grease'],
    long: ['the fryer goes cold and the kitchen is closed', 'tell the lunch rush the special is sold out', 'hold the pickles and hold your last breath'],
  },
  'THE VALET': {
    short: ['keep the change', 'your ride is gone', 'no tip for you'],
    long: ['the keys are mine and the lot is finally empty', 'park this one in the deepest level of hell', 'i will drive myself out of this nightmare'],
  },
  'THE FLOOR MANAGER': {
    short: ['you are fired', 'clock out forever', 'no more floor meetings'],
    long: ['the performance review is in and you failed', 'this is your final warning and your final day', 'the floor is closed and so is your career'],
  },
  'THE DEMO UNIT': {
    short: ['power down now', 'demo mode over', 'unplug and stay down'],
    long: ['the warranty is void and so is your circuitry', 'factory reset to nothing but scrap and sparks', 'not for sale and never booting up again'],
  },
  'THE BIG BEAR': {
    short: ['no more hugs', 'stuffing everywhere', 'back on the shelf'],
    long: ['the build a bear workshop is officially closed', 'all the stuffing in the world cannot save you', 'bedtime for the biggest bear in the building'],
  },
  'THE FORKLIFT': {
    short: ['lift this', 'out of gas', 'pallets down hard'],
    long: ['safety violation number one is still being alive', 'the stockroom is clear and the engine is dead', 'no more heavy lifting for this machine'],
  },
  'THE USHER': {
    short: ['show is over', 'lights up now', 'exit stage left'],
    long: ['the credits roll and nobody stays for them', 'please silence your phones and your screaming', 'the midnight premiere ends with your final scene'],
  },
  'THE TOW TRUCK': {
    short: ['towed away', 'end of the line', 'hooked and gone'],
    long: ['parking enforcement is cancelled for good tonight', 'tow this wreck straight to the scrapyard', 'the chain snaps and the engine finally dies'],
  },
  'THE REGIONAL MANAGER': {
    short: ['meeting adjourned', 'you are the problem', 'manager is not available'],
    long: ['you can speak to the manager in the afterlife', 'every complaint is closed and every store is mine', 'this mall is under new management starting now'],
  },
  // ---- Airport
  'THE SHUTTLE': {
    short: ['last stop', 'doors closing', 'no more pickups'],
    long: ['this shuttle is out of service permanently', 'mind the gap between you and the living', 'the curbside is clear and the ride is over'],
  },
  'THE GATE AGENT': {
    short: ['boarding denied', 'flight cancelled', 'no upgrade today'],
    long: ['your seat has been given to someone still alive', 'final boarding call for the end of the line', 'the gate is closed and so is your account'],
  },
  'THE SCANNER': {
    short: ['you are flagged', 'random search', 'nothing to declare'],
    long: ['remove your shoes and your will to live', 'the belt stops here and so does your patrol', 'additional screening is required for your remains'],
  },
  'THE PERFUME COUNTER': {
    short: ['no free samples', 'smell you later', 'tax free beatdown'],
    long: ['one last spritz and the whole counter shatters', 'eau de grave is not for sale tonight', 'the fragrance aisle is finally safe to breathe'],
  },
  'THE PILOT': {
    short: ['autopilot off', 'mayday mayday', 'wheels down hard'],
    long: ['this is your captain speaking for the last time', 'the cockpit is clear and the engines are cold', 'please remain seated while the pilot goes down'],
  },
  'THE CAROUSEL': {
    short: ['stop spinning', 'claim your bags', 'belt is jammed'],
    long: ['carousel four has finally stopped spinning', 'unclaimed baggage will be destroyed on sight', 'every bag is checked and every zombie is down'],
  },
  'THE CONCOURSE': {
    short: ['walkway ends', 'mind your step', 'end of concourse'],
    long: ['the moving walkway ends and so do you', 'please stand to the right of the nearest exit', 'all gates are clear from here to the tarmac'],
  },
  'THE TUG': {
    short: ['tugged off', 'cart is down', 'no more laps'],
    long: ['the apron is clear and the tug is scrap metal', 'one last lap around the runway and out', 'the baggage train has reached its final stop'],
  },
  'THE MECHANIC': {
    short: ['out of order', 'grounded for good', 'bolts loose'],
    long: ['this aircraft has been grounded for repairs forever', 'the hangar is quiet and the wrench is mine', 'maintenance complete and your warranty expired'],
  },
  'AIR TRAFFIC CONTROL': {
    short: ['tower is down', 'cleared to die', 'radio silence'],
    long: ['the tower is dark and every runway is closed', 'you are cleared for a permanent landing', 'all flights cancelled and the sky is finally quiet'],
  },
  // ---- Theme Park
  'THE TICKET TAKER': {
    short: ['ticket punched', 'admission denied', 'no refunds'],
    long: ['your ticket is punched and your ride is over', 'the gates are open and the line is finally gone', 'season pass revoked for the rest of eternity'],
  },
  'THE RINGMASTER': {
    short: ['the show is over', 'tent comes down', 'no encore'],
    long: ['ladies and gentlemen the circus has left town', 'the big top falls and the crowd goes silent', 'the greatest show on earth is buried tonight'],
  },
  'THE LIFEGUARD': {
    short: ['pool is closed', 'whistle blown', 'everyone out'],
    long: ['no running no diving and no more walking dead', 'the wave pool drains and takes you with it', 'the lifeguard is off duty for good'],
  },
  'THE BRASS RING': {
    short: ['ride is over', 'grab the ring', 'off the horse'],
    long: ['the music box stops and the horses fall still', 'i caught the brass ring and you lost the ride', 'one more spin and the carousel goes dark'],
  },
  'THE OPERATOR': {
    short: ['bumper to bumper', 'power cut', 'no more crashes'],
    long: ['the arena goes dark and every car is dead', 'keep your hands inside the ride and stay down', 'this ride is closed for maintenance forever'],
  },
  'THE SHOWRUNNER': {
    short: ['curtain call', 'cut to black', 'that is a wrap'],
    long: ['the final act is over and the curtain falls', 'no sequel and no encore for this nightmare', 'thank you for attending the end of the show'],
  },
  'THE ZOOKEEPER': {
    short: ['cages locked', 'feeding time over', 'back in the pen'],
    long: ['please do not feed the animals or the dead', 'every cage is locked and the keeper is down', 'the safari is over and the jungle is quiet'],
  },
  'THE BUTLER': {
    short: ['you rang', 'dinner is served', 'house is empty'],
    long: ['the mansion is clear and every door is locked', 'the butler did it and now the butler is done', 'nine hundred ghosts and not one left standing'],
  },
  'THE CONDUCTOR': {
    short: ['off the rails', 'all aboard none', 'end of the line'],
    long: ['the coaster derails at the top of the drop', 'please keep your arms inside and your head down', 'the last train leaves the station without you'],
  },
  'THE MASCOT KING': {
    short: ['long live nobody', 'the king is dead', 'crown is mine'],
    long: ['the castle falls and the kingdom is finally free', 'no more parades for the king of the dead', 'happily ever after starts the moment you fall'],
  },
};

const GENERIC: Lines = {
  short: ['aim true and survive', 'reload and carry on', 'fear the rising horde', 'steady hands save lives', 'the bunker will not hold', 'stay down this time', 'not today', 'type or die'],
  long: [
    'only the fearless endure the storm', 'precision and courage end nightmares', 'steel your nerves and fight on',
    'mechanized death marches and we stand defiant', 'in the abyss of terror we forge our will', 'no mercy no surrender purge the darkness',
  ],
};

// Avoid repeating a line until the pool for that boss runs out.
const used = new Set<string>();

export function finisherFor(boss: string, difficulty: Difficulty): string {
  const lines = FINISHERS[boss] ?? GENERIC;
  const long = difficulty === 'hard' || difficulty === 'extreme';
  let pool = long ? lines.long : lines.short;
  const fresh = pool.filter(l => !used.has(l));
  if (!fresh.length) { pool.forEach(l => used.delete(l)); } else pool = fresh;
  let line = pool[Math.floor(Math.random() * pool.length)];
  used.add(line);
  if (difficulty === 'extreme' && Math.random() < 0.5) {
    const tail = ['and stay dead', 'and never rise again', 'for good this time', 'once and for all'];
    line = `${line} ${tail[Math.floor(Math.random() * tail.length)]}`;
  }
  return line;
}

/** For tests: every finisher line in the table. */
export const ALL_FINISHERS = Object.values(FINISHERS).flatMap(l => [...l.short, ...l.long]);
