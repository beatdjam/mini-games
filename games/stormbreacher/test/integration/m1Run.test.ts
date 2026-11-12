// A bot plays M1 from the landing to the cleared result with inputs alone (no teleport, no health written): it walks a
// list of points through the breakthroughs and up a flight of stairs, shoots what is in its sight and steps out of a
// shell's circle. It tells whether the sortie can be done and gives a rough measure of the ammo and the armour it costs.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { fireRayHit, type Aabb } from '../../src/logic/fire.ts';
import { enemyBox, newGame, sendToScript, step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { seed } from '../../src/logic/rng.ts';

const DT = 1 / 60;
const SEED = 7;
const LIMIT_SECONDS = 15 * 60; // the bot has this long in the game (s)
const TEST_TIMEOUT = 30000; // a run is about 2.5 s; the default 5 s is short for two runs on a busy CI machine (ms)
const REACH = 1.5; // a point counts as reached this near (m)
const SIGHT = 100; // the bot shoots what is this near and in sight (m); the autocannon reaches 120
const HEAVY_TARGETS = ['pillbox', 'gun', 'magazine']; // what the heavy gun is spent on (the kinds of target)
const SHELL_MARGIN = 3; // the bot leaves a shell's circle by this much more than its radius (m)
const TURN_RATE = 6; // how fast the bot turns (rad/s)

interface Waypoint {
  x: number;
  z: number;
  why: string;
  hold?: readonly string[]; // targets that stand the bot here, shooting, until they are all down
}

// The route. +z is the sea. It goes through the gaps the map leaves: the low walls (z 154) have 14 m between them, line 1
// (z 128..146) has its breakthrough at x 40, line 2 (z 80..96) at x -10, line 3 (z 8..26) at x 61 and C's rows
// (z -55..-35) at x 35, right in front of the stairs up the seawall.
const ROUTE: readonly Waypoint[] = [
  { x: 26, z: 166, why: 'along the sea edge, clear of the mines at x 14 and x 34' },
  { x: 42, z: 160, why: 'the gap between the low walls at x 30 and x 54, 10 m from the mine at x 52' },
  { x: 40, z: 148, why: 'into the breakthrough of line 1, 6 m from the mine at x 34' },
  { x: 40, z: 122, why: 'out of line 1' },
  { x: 5, z: 110, why: 'between the covers of the first stretch, towards line 2' },
  { x: -10, z: 100, why: 'in front of the breakthrough of line 2' },
  { x: -10, z: 76, why: 'out of line 2' },
  { x: 20, z: 56, why: 'between the covers of the second stretch, towards line 3' },
  { x: 61, z: 36, why: 'in front of the breakthrough of line 3' },
  { x: 61, z: 4, why: 'out of line 3' },
  {
    x: 45,
    z: -8,
    why: 'in sight of both pillboxes (x -33 and x 22), which it holds for',
    hold: ['pillbox-1', 'pillbox-2'],
  },
  { x: 35, z: -30, why: 'before the breakthrough of C at x 35' },
  { x: 35, z: -62, why: 'up the stairs onto the seawall (area seawall-top)' },
  { x: 35, z: -78, why: 'off the seawall, onto the boss ground' },
  { x: 0, z: -118, why: 'in front of the guns and the magazine', hold: ['main-gun-1', 'main-gun-2', 'magazine'] },
];

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

const centre = (box: Aabb) => ({
  x: (box.minX + box.maxX) / 2,
  y: (box.minY + box.maxY) / 2,
  z: (box.minZ + box.maxZ) / 2,
});

interface Foe {
  box: Aabb;
  heavy: boolean;
}

// The living enemies and targets the bot may shoot, nearest first, that it can see from its chest.
function foesInSight(game: GameModel, only: readonly string[] | null): Foe[] {
  const { mech } = game;
  const chest = { x: mech.x, y: mech.y + MECH_TUNE.chestHeight, z: mech.z };
  const standing = game.targets.filter(target => target.hp > 0);
  const foes: Foe[] = [
    ...game.enemies.filter(enemy => enemy.hp > 0).map(enemy => ({ box: enemyBox(enemy), heavy: false })),
    ...standing
      .filter(target => only === null || only.includes(target.id))
      .map(target => ({ box: target.box, heavy: HEAVY_TARGETS.includes(target.kind) })),
  ];
  return foes
    .map(foe => {
      const c = centre(foe.box);
      const dx = c.x - chest.x;
      const dy = c.y - chest.y;
      const dz = c.z - chest.z;
      const dist = Math.hypot(dx, dy, dz);
      // what hides it: the props and the other standing targets (its own box is not a wall)
      const walls = [...game.propBoxes, ...standing.map(target => target.box).filter(box => box !== foe.box)];
      const own = fireRayHit(chest.x, chest.y, chest.z, dx, dy, dz, dist, [foe.box])?.dist ?? dist;
      const seen = dist <= SIGHT && fireRayHit(chest.x, chest.y, chest.z, dx, dy, dz, own, walls) === null;
      return { foe, dist, seen };
    })
    .filter(item => item.seen)
    .sort((a, b) => a.dist - b.dist)
    .map(item => item.foe);
}

interface Bot {
  next: number; // the place in ROUTE of the point it walks to
}

// One frame of the bot's input: the way to the point (or away from a shell), the shots at the nearest foe in sight.
function decide(game: GameModel, bot: Bot): GameInput {
  const { mech } = game;
  const point = ROUTE[bot.next];
  const held = point.hold?.filter(id => game.targets.find(target => target.id === id)?.hp !== 0) ?? [];
  if (Math.hypot(point.x - mech.x, point.z - mech.z) < REACH && held.length === 0 && bot.next < ROUTE.length - 1) {
    bot.next += 1;
  }
  const goal = ROUTE[bot.next];
  let wx = goal.x - mech.x;
  let wz = goal.z - mech.z;
  const standing = Math.hypot(wx, wz) < REACH;
  if (standing) {
    wx = 0;
    wz = 0;
  }
  // a shell about to land on the mech: straight away from its middle
  for (const shell of game.shells) {
    const dx = mech.x - shell.x;
    const dz = mech.z - shell.z;
    const dist = Math.hypot(dx, dz);
    if (dist < shell.radius + SHELL_MARGIN) {
      wx = dx / Math.max(dist, 1e-6);
      wz = dz / Math.max(dist, 1e-6);
      break;
    }
  }
  const length = Math.hypot(wx, wz);
  if (length > 0) {
    wx /= length;
    wz /= length;
  }
  // the world's direction in the mech's own forward and right
  const fx = -Math.sin(mech.yaw);
  const fz = -Math.cos(mech.yaw);
  const foes = foesInSight(game, held.length > 0 ? held : null);
  const foe = foes[0];
  // it faces what it shoots, or else the way it walks
  const look = foe ? { x: centre(foe.box).x - mech.x, z: centre(foe.box).z - mech.z } : { x: wx, z: wz };
  let turn = 0;
  if (Math.hypot(look.x, look.z) > 1e-6) {
    const want = Math.atan2(-look.x, -look.z);
    const diff = Math.atan2(Math.sin(want - mech.yaw), Math.cos(want - mech.yaw));
    turn = Math.max(-TURN_RATE * DT, Math.min(TURN_RATE * DT, diff));
  }
  const input: GameInput = { ...idle, moveZ: wx * fx + wz * fz, moveX: wx * -fz + wz * fx, turn };
  if (!foe) return input;
  const c = centre(foe.box);
  const chestY = mech.y + MECH_TUNE.chestHeight;
  const dx = c.x - mech.x;
  const dy = c.y - chestY;
  const dz = c.z - mech.z;
  const dist = Math.hypot(dx, dy, dz);
  return {
    ...input,
    fire: true,
    sub: foe.heavy && game.sub.ammo > 0,
    aim: { ox: mech.x, oy: chestY, oz: mech.z, dx: dx / dist, dy: dy / dist, dz: dz / dist },
  };
}

interface Result {
  cleared: boolean;
  downed: boolean;
  time: number;
  armor: number;
  main: number;
  sub: number;
  retries: number;
  fired: Record<string, number>;
  at: { x: number; z: number; next: number };
}

function playM1(): Result {
  seed(SEED);
  const game = newGame(M1B_HAND, M1);
  const bot: Bot = { next: 0 };
  for (let i = 0; i < LIMIT_SECONDS / DT && !game.cleared && !game.downed; i++) {
    // the cutscenes are skipped: the landing, and the wave 2 sinking
    if (game.script.cutscene !== null) sendToScript(game, { kind: 'skip' });
    step(game, decide(game, bot), DT);
  }
  return {
    cleared: game.cleared,
    downed: game.downed,
    time: game.time,
    armor: game.armor,
    main: game.main.ammo,
    sub: game.sub.ammo,
    retries: game.retries,
    fired: game.script.fired,
    at: { x: game.mech.x, z: game.mech.z, next: bot.next },
  };
}

// The cues in the order the story runs them; the depot's cue is left out, for the bot does not go for the depot.
const STORY = ['intro', 'beach', 'pillboxes', 'cp1', 'wave2-lost', 'seawall', 'gun1', 'shutter', 'win'];

test(
  'a bot clears M1 from the landing on with its inputs alone',
  () => {
    const result = playM1();
    expect(result.cleared).toBe(true);
    expect(result.downed).toBe(false);
    expect(result.retries).toBe(0);
    // every cue of the story fired, one after another
    const times = STORY.map(id => result.fired[id]);
    expect(times.every(time => time !== undefined)).toBe(true);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // seed 7 took about 78 s of game time and 27 armour (of 200), and left 303 of 400 autocannon shots and 3 of 12 heavy
    // gun shots; the limits below keep room for a retune of the values, and fail if the sortie turns out hardly possible
    expect(result.time).toBeLessThan(LIMIT_SECONDS);
    expect(result.armor).toBeGreaterThan(0);
    expect(result.main).toBeGreaterThan(0);
    expect(result.sub).toBeGreaterThanOrEqual(0);
  },
  TEST_TIMEOUT,
);

test(
  'the same seed gives the same sortie',
  () => {
    const first = playM1();
    const second = playM1();
    expect(second.time).toBe(first.time);
    expect(second.armor).toBe(first.armor);
    expect(second.main).toBe(first.main);
    expect(second.sub).toBe(first.sub);
  },
  TEST_TIMEOUT,
);
