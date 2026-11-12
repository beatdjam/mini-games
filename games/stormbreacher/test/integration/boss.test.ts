// The boss of M1, the coastal battery (SB-200), in the game: the magazine takes no harm behind its shutter until both main
// guns are down, the `battery` wave starts the secondary guns' barrage and the main guns' machine guns (and not before),
// the depot's loss slows the barrage, a checkpoint keeps the battery's state, and a bot's inputs clear the sortie.
import { expect, test } from 'vitest';
import { GUN_TUNE } from '../../src/data/battery.ts';
import { BARRAGES } from '../../src/data/hazards.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import {
  isBatteryBullet,
  newGame,
  retryFromCheckpoint,
  sendToScript,
  step,
  type BatteryBullet,
  type GameEvent,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { seed } from '../../src/logic/rng.ts';

const DT = 1 / 60;
const SEAWALL_TOP = { x: 0, y: 6, z: -68 }; // on the seawall, in the area `seawall-top`
const GROUND_FRONT = { x: 0, y: 0, z: -125 }; // on the ground before the guns and the magazine, inside the barrage's reach
const SEED = 42;
const BOT_SECONDS = 30; // the bot has this long (s)
const SAFE_ARMOR = 1e6; // armour no test can spend, for the ones that look at the shots and not at the mech's fall

const idle: GameInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
  sub: false,
};

// The hand map without its mines, with the mech at `at` facing the land.
function newBossGame(at: { x: number; y: number; z: number }): GameModel {
  const game = newGame({ ...M1B_HAND, mines: [] });
  game.mech.x = at.x;
  game.mech.y = at.y;
  game.mech.z = at.z;
  game.mech.yaw = 0;
  return game;
}

function targetOf(game: GameModel, id: string) {
  const target = game.targets.find(item => item.id === id);
  if (!target) throw new Error(`the game has no ${id}`);
  return target;
}

// The camera's line from the mech's chest through the middle of a target's box.
function aimAt(game: GameModel, id: string) {
  const box = targetOf(game, id).box;
  const chest = { x: game.mech.x, y: game.mech.y + MECH_TUNE.chestHeight, z: game.mech.z };
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const length = Math.hypot(cx - chest.x, cy - chest.y, cz - chest.z);
  return {
    ox: chest.x,
    oy: chest.y,
    oz: chest.z,
    dx: (cx - chest.x) / length,
    dy: (cy - chest.y) / length,
    dz: (cz - chest.z) / length,
  };
}

// Breaks a target the way a shot would, for the script.
function breakTarget(game: GameModel, id: string): void {
  targetOf(game, id).hp = 0;
  sendToScript(game, { kind: 'destroyed', target: id });
}

// The events of `frames` frames, in order.
function run(game: GameModel, frames: number, input: GameInput = idle): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < frames; i++) {
    step(game, input, DT);
    events.push(...game.events);
  }
  return events;
}

const framesOf = (seconds: number): number => Math.ceil(seconds / DT);

// Runs `frames` frames and counts the machine-gun shots made (each new battery bullet once).
function gunShots(game: GameModel, frames: number): number {
  const seen = new Set<BatteryBullet>();
  for (let i = 0; i < frames; i++) {
    step(game, idle, DT);
    for (const bullet of game.bullets) if (isBatteryBullet(bullet)) seen.add(bullet);
  }
  return seen.size;
}

// The bot: shoots the main guns, then the magazine, from where it stands, strafing a little. Returns the events.
function playBot(game: GameModel): GameEvent[] {
  const order = ['main-gun-1', 'main-gun-2', 'magazine'];
  const events: GameEvent[] = [];
  for (let i = 0; i < framesOf(BOT_SECONDS) && !game.cleared && !game.downed; i++) {
    const id = order.find(item => targetOf(game, item).hp > 0);
    if (!id) break;
    step(game, { ...idle, fire: true, aim: aimAt(game, id), moveX: Math.sin(i / 20) }, DT);
    events.push(...game.events);
  }
  return events;
}

test('the magazine takes no harm while the main guns stand, but its shutter stops the shots and reports the hits', () => {
  const game = newBossGame(GROUND_FRONT);
  const magazine = targetOf(game, 'magazine');
  const full = magazine.hp;
  expect(game.shutters).toEqual([{ target: 'magazine', open: false }]);
  const events = run(game, framesOf(2), { ...idle, fire: true, aim: aimAt(game, 'magazine') });
  const hits = events.filter(event => event.kind === 'hit' && event.target === 'magazine');
  expect(hits.length).toBeGreaterThan(5);
  expect(magazine.hp).toBe(full);
  expect(events.some(event => event.kind === 'destroyed')).toBe(false);
  expect(game.shutters[0].open).toBe(false);
});

test('one main gun down leaves the shutter shut; both open it once, and then the magazine breaks and ends the sortie', () => {
  const game = newBossGame(GROUND_FRONT);
  const aim = aimAt(game, 'magazine');
  breakTarget(game, 'main-gun-1');
  expect(run(game, 2).some(event => event.kind === 'shutterOpen')).toBe(false);
  run(game, framesOf(1), { ...idle, fire: true, aim });
  expect(targetOf(game, 'magazine').hp).toBeGreaterThan(0);
  breakTarget(game, 'main-gun-2');
  const opening = run(game, 2).filter(event => event.kind === 'shutterOpen');
  expect(opening).toEqual([{ kind: 'shutterOpen', target: 'magazine' }]);
  expect(game.shutters[0].open).toBe(true);
  expect(run(game, 10).some(event => event.kind === 'shutterOpen')).toBe(false);
  const events = run(game, framesOf(3), { ...idle, fire: true, aim });
  expect(events.some(event => event.kind === 'destroyed' && event.id === 'magazine')).toBe(true);
  expect(game.cleared).toBe(true);
});

test('a shot that breaks the second main gun opens the shutter in the same frame, after the gun’s destroyed', () => {
  const game = newBossGame(GROUND_FRONT);
  breakTarget(game, 'main-gun-1');
  const gun = targetOf(game, 'main-gun-2');
  gun.hp = 1;
  const events = run(game, framesOf(2), { ...idle, fire: true, aim: aimAt(game, 'main-gun-2') });
  const kinds = events.map(event => event.kind).filter(kind => kind === 'destroyed' || kind === 'shutterOpen');
  expect(kinds).toEqual(['destroyed', 'shutterOpen']);
});

test('before the battery wave the guns do not shoot and the barrage has not started; the wave starts both', () => {
  seed(SEED);
  const game = newBossGame(GROUND_FRONT);
  game.armor = SAFE_ARMOR;
  expect(game.battery.on).toBe(false);
  expect(gunShots(game, framesOf(6))).toBe(0);
  expect(game.barrages.some(barrage => barrage.kind === 'battery')).toBe(false);
  expect(game.shells).toHaveLength(0);
  // the mech goes up on the seawall: the area starts the wave, and the next seconds hold fire and shells
  game.mech.x = SEAWALL_TOP.x;
  game.mech.y = SEAWALL_TOP.y;
  game.mech.z = SEAWALL_TOP.z;
  step(game, idle, DT);
  expect(game.script.entered).toContain('seawall-top');
  expect(game.battery.on).toBe(true);
  expect(game.barrages.map(barrage => barrage.kind)).toContain('battery');
  game.mech.x = GROUND_FRONT.x;
  game.mech.y = GROUND_FRONT.y;
  game.mech.z = GROUND_FRONT.z;
  const events = run(game, framesOf(BARRAGES.battery.interval + BARRAGES.battery.warn + 1));
  expect(events.some(event => event.kind === 'shellWarn')).toBe(true);
  expect(events.some(event => event.kind === 'shellLand')).toBe(true);
});

test('with the battery on, each main gun still standing shoots the mech, and one that fell does not', () => {
  seed(SEED);
  const game = newBossGame(GROUND_FRONT);
  game.armor = SAFE_ARMOR;
  sendToScript(game, { kind: 'enter', area: 'seawall-top' });
  expect(game.battery.on).toBe(true);
  const seconds = 6;
  const both = gunShots(game, framesOf(seconds));
  // two guns, one shot each interval; the first one comes an interval in
  expect(both).toBeGreaterThanOrEqual(2 * (Math.floor(seconds / GUN_TUNE.interval) - 1));
  expect(both).toBeLessThanOrEqual(2 * Math.ceil(seconds / GUN_TUNE.interval));
  breakTarget(game, 'main-gun-1');
  const one = gunShots(game, framesOf(seconds));
  // half as many, give or take the wait each gun carries over
  expect(Math.abs(one - both / 2)).toBeLessThanOrEqual(2);
  // the shots hurt: the armour went down by GUN_TUNE.damage a hit
  expect(game.armor).toBeLessThan(SAFE_ARMOR);
  expect((SAFE_ARMOR - game.armor) % GUN_TUNE.damage).toBe(0);
});

test('a main gun shoots only a mech in reach and in sight: not one far off, nor one on the ground behind the wall', () => {
  seed(SEED);
  const far = newBossGame({ x: 0, y: 0, z: -20 }); // more than GUN_TUNE.range away
  far.armor = SAFE_ARMOR;
  sendToScript(far, { kind: 'enter', area: 'seawall-top' });
  expect(gunShots(far, framesOf(5))).toBe(0);
  const covered = newBossGame({ x: 0, y: 0, z: -58 }); // in range, with the seawall between
  covered.armor = SAFE_ARMOR;
  sendToScript(covered, { kind: 'enter', area: 'seawall-top' });
  expect(gunShots(covered, framesOf(5))).toBe(0);
  // on top of the wall the line clears it
  const top = newBossGame(SEAWALL_TOP);
  top.armor = SAFE_ARMOR;
  expect(gunShots(top, framesOf(5))).toBeGreaterThan(0);
});

test('the secondary guns’ barrage reaches the seawall’s top and the ground behind it, and not the land before the wall', () => {
  seed(SEED);
  const before = newBossGame({ x: 0, y: 0, z: -40 });
  before.armor = SAFE_ARMOR;
  sendToScript(before, { kind: 'enter', area: 'seawall-top' });
  expect(run(before, framesOf(BARRAGES.battery.interval * 3)).some(event => event.kind === 'shellWarn')).toBe(false);
  const top = newBossGame(SEAWALL_TOP);
  top.armor = SAFE_ARMOR;
  expect(run(top, framesOf(BARRAGES.battery.interval + 0.5)).some(event => event.kind === 'shellWarn')).toBe(true);
});

test('the barrage goes on after both main guns are down', () => {
  seed(SEED);
  const game = newBossGame(GROUND_FRONT);
  game.armor = SAFE_ARMOR;
  sendToScript(game, { kind: 'enter', area: 'seawall-top' });
  breakTarget(game, 'main-gun-1');
  breakTarget(game, 'main-gun-2');
  const events = run(game, framesOf(BARRAGES.battery.interval * 2 + 0.5));
  expect(events.filter(event => event.kind === 'shellWarn').length).toBeGreaterThanOrEqual(2);
  expect(game.cleared).toBe(false);
});

// The seconds between the warnings of the battery's barrage, counted over `warnings` warnings.
function warnGap(game: GameModel, warnings: number): number {
  const times: number[] = [];
  for (let i = 0; i < framesOf(60) && times.length < warnings; i++) {
    step(game, idle, DT);
    if (game.events.some(event => event.kind === 'shellWarn')) times.push(game.time);
  }
  expect(times).toHaveLength(warnings);
  return (times[warnings - 1] - times[0]) / (warnings - 1);
}

test('the depot’s loss makes the secondary guns’ barrage come 1.5 times as seldom', () => {
  seed(SEED);
  const kept = newBossGame(SEAWALL_TOP);
  kept.armor = SAFE_ARMOR;
  const gap = warnGap(kept, 4);
  expect(gap).toBeCloseTo(BARRAGES.battery.interval, 1);
  seed(SEED);
  const broken = newBossGame(SEAWALL_TOP);
  broken.armor = SAFE_ARMOR;
  breakTarget(broken, 'depot');
  expect(broken.script.flags).toContain('depot-down');
  expect(warnGap(broken, 4)).toBeCloseTo(gap * 1.5, 1);
});

test('a bot on the seawall shoots the guns, then the magazine, and clears with armour to spare', () => {
  seed(SEED);
  const game = newBossGame(SEAWALL_TOP);
  const events = playBot(game);
  const order = events.flatMap(event =>
    event.kind === 'destroyed' || event.kind === 'shutterOpen' ? [`${event.kind}`] : [],
  );
  // both guns, then the shutter opens as the second falls, then the magazine
  expect(order).toEqual(['destroyed', 'destroyed', 'shutterOpen', 'destroyed']);
  expect(events.some(event => event.kind === 'destroyed' && event.id === 'magazine')).toBe(true);
  expect(game.cleared).toBe(true);
  expect(game.downed).toBe(false);
  expect(game.armor).toBeGreaterThan(0);
  // the battery fought back: the bot took some hits
  expect(game.armor).toBeLessThan(MECH_TUNE.armor);
});

test('the same seed and inputs give the same events and the same end', () => {
  const play = (): { events: GameEvent[]; armor: number; time: number } => {
    seed(SEED);
    const game = newBossGame(SEAWALL_TOP);
    const events = playBot(game);
    return { events, armor: game.armor, time: game.time };
  };
  const a = play();
  const b = play();
  expect(a.events.length).toBeGreaterThan(20);
  expect(b).toEqual(a);
});

test('a retry from cp2 puts the battery back: the guns, the shutter and the barrage as the checkpoint kept them', () => {
  seed(SEED);
  const game = newBossGame(SEAWALL_TOP);
  step(game, idle, DT);
  expect(game.checkpoint?.id).toBe('cp2');
  expect(game.checkpoint?.battery.on).toBe(true);
  // the fight goes on: a gun falls, the shutter opens, the guns shoot and the barrage ticks
  run(game, framesOf(4));
  breakTarget(game, 'main-gun-1');
  breakTarget(game, 'main-gun-2');
  run(game, 2);
  expect(game.shutters[0].open).toBe(true);
  const retried = retryFromCheckpoint(game);
  expect(retried.shutters).toEqual([{ target: 'magazine', open: false }]);
  expect(retried.battery).toEqual(game.checkpoint?.battery);
  expect(retried.barrages).toEqual(game.checkpoint?.barrages);
  expect(targetOf(retried, 'main-gun-1').hp).toBeGreaterThan(0);
  expect(targetOf(retried, 'main-gun-2').hp).toBeGreaterThan(0);
  expect(retried.shells).toEqual([]);
  expect(retried.bullets).toEqual([]);
  // the retried game fights as before: the shutter is shut again and the guns shoot
  const full = targetOf(retried, 'magazine').hp;
  run(retried, framesOf(1), { ...idle, fire: true, aim: aimAt(retried, 'magazine') });
  expect(targetOf(retried, 'magazine').hp).toBe(full);
  retried.armor = SAFE_ARMOR;
  expect(gunShots(retried, framesOf(4))).toBeGreaterThan(0);
});
