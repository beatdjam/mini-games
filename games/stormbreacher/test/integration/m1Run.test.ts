// A bot plays M1 from the landing to the cleared result with inputs alone (no teleport, no health written): it walks a
// list of points, plants a charge at one blast point of each line and goes through the hole it opens, shoots what is in
// its sight, steps out of a shell's circle and steps aside from the aimed mortar. It tells whether the sortie can be done
// and gives a rough measure of the ammo and the armour it costs.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { AIMED_MORTAR } from '../../src/data/hazards.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { armoured } from '../../src/logic/battery.ts';
import { fireRayHit, type Aabb } from '../../src/logic/fire.ts';
import { enemyBox, newGame, sendToScript, step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { seed, stream } from '../../src/logic/rng.ts';
import { frontOf } from '../../src/logic/front.ts';
import { newBattle, stepBattle } from '../../src/logic/battle.ts';
import { spawnWave } from '../../src/logic/crowd.ts';
import { M1_NEST_WAVE } from '../../src/data/enemies.ts';
import { PAYOFF_TUNE } from '../../src/data/payoff.ts';
import { PLAY_BATTLE_TUNE } from '../../src/data/tune.ts';

const DT = 1 / 60;
const SEED = 7;
const LIMIT_SECONDS = 15 * 60; // the bot has this long in the game (s)
const TEST_TIMEOUT = 30000; // a run is about 2.5 s; the default 5 s is short for two runs on a busy CI machine (ms)
const REACH = 1.5; // a point counts as reached this near (m)
const SIGHT = 100; // the bot shoots what is this near and in sight (m); the autocannon reaches 120
const HEAVY_TARGETS = ['pillbox', 'gun', 'magazine', 'fortressGun']; // what the heavy gun is spent on (the kinds of target)
const SHELL_MARGIN = 3; // the bot leaves a shell's circle by this much more than its radius (m)
const TURN_RATE = 6; // how fast the bot turns (rad/s)
const AIMED_LEAD = 1; // the bot steps aside this long before the aimed mortar's stay is full (s)
const AIMED_STEP = 4; // how far it steps aside (m)
const AIMED_STEP_SEC = 1.2; // how long it keeps to the side before coming back (s)

interface Waypoint {
  x: number;
  z: number;
  why: string;
  hold?: readonly string[]; // targets, enemies or waves that stand the bot here, shooting, until they are all down
  plant?: string; // stands here and holds use until this blast point has a charge on it
  wait?: string; // stands here until this blast point has blown
}

// The route. +z is the sea. It plants a charge at one blast point of each line, walks back out of the blast and goes
// through the hole the charge opens: line 1 at x 40, line 2 at its near point x -10 (SB-2020; the ally's support fire
// keeps the nests quiet while it plants). C's rows (z -55..-35) still have their breakthrough at x 35; past them the way
// turns to the fortress's sea gate (x 0, z -68), crosses the yard and the land gate (x 0, z -128) to the battery. The
// guns are held first, then the magazine, so the bot leaves the shut shutter alone until both guns are down.
const TO_PILLBOXES: readonly Waypoint[] = [
  { x: 0, z: 170, why: 'down the ramp, off the craft' },
  { x: 26, z: 166, why: 'along the sea edge, clear of the mines at x 14 and x 34' },
  { x: 42, z: 160, why: 'the gap between the low walls at x 30 and x 54, 10 m from the mine at x 52' },
  { x: 40, z: 150, why: "in front of line 1's blast point l1-b, and stands to plant", plant: 'l1-b' },
  { x: 40, z: 162, why: 'back from line 1 while the fuse burns', wait: 'l1-b' },
  { x: 40, z: 122, why: "through the hole line 1's blast opened" },
  { x: 5, z: 110, why: 'between the covers of the first stretch, towards line 2' },
  { x: -10, z: 100, why: "into line 2's approach; the ally's support fire silences the nests" },
  { x: -10, z: 80, why: "at line 2's near point, in the nests' crossfire, and stands to plant", plant: 'l2-a' },
  { x: -10, z: 96, why: 'back from line 2 while the fuse burns', wait: 'l2-a' },
  { x: -10, z: 58, why: "through the hole line 2's blast opened" },
  { x: 0, z: 50, why: 'through the cover behind line 2, towards the pillboxes' },
  { x: 0, z: 10, why: 'up the second interval, clear of the block at (0, 0)' },
  // SB-2015: shots no longer break a pillbox, so the bot stands at each back point, plants a charge, steps clear of the
  // blast and waits for it to open the line. It goes round the landward side so the pillboxes' own boxes do not block it.
  { x: 40, z: -8, why: 'round the landward side of the line and the wreck at (45, 3)' },
  { x: 30, z: -20, why: 'past pillbox-2 on its land side' },
  {
    x: 21,
    z: -27,
    why: "within reach of pillbox-2's back point, and stands to plant",
    plant: 'blast-pillbox-2-back',
  },
  { x: 21, z: -34, why: 'clear of the blast while the fuse burns', wait: 'blast-pillbox-2-back' },
  { x: 0, z: -30, why: 'behind the pillbox line, towards pillbox-1' },
  { x: -20, z: -27, why: 'past the block at (0, 0) on its land side' },
  {
    x: -33,
    z: -27,
    why: "within reach of pillbox-1's back point, and stands to plant",
    plant: 'blast-pillbox-1-back',
  },
  { x: -33, z: -34, why: 'clear of the blast while the fuse burns', wait: 'blast-pillbox-1-back' },
  { x: 0, z: -30, why: 'back to the middle, behind the broken line' },
];

// The way past the depot: through C's low cover at x 35, then on to the sea gate. The depot is left standing.
const TO_FORTRESS: readonly Waypoint[] = [
  { x: 35, z: -30, why: 'before C at x 35' },
  { x: 35, z: -46, why: 'down through C, before the fortress approach' },
  { x: 35, z: -58, why: 'into the fortress approach, clear of its right edge' },
  {
    x: 20,
    z: -55,
    why: 'in the open before the sea gate, holding the machine-gun nest on the wall',
    hold: ['fortress-gun'],
  },
  { x: 0, z: -58, why: 'before the fortress gate (area fortress-approach)' },
];

// The way through the depot: across to the right cliff, down into the hollow, breaking the depot, and back to the
// approach. The way is long enough that the shelling starts (10 s after cp1) before the depot falls.
const TO_DEPOT: readonly Waypoint[] = [
  { x: 35, z: -30, why: 'before C at x 35' },
  { x: 35, z: -46, why: 'down through C, before the fortress approach' },
  { x: 50, z: -50, why: 'across to the right cliff, outside the hollow' },
  { x: 70, z: -45, why: 'into the depot hollow from the left' },
  { x: 75, z: -34, why: 'in front of the depot, which it holds for', hold: ['depot'] },
  { x: 68, z: -42, why: 'back from the depot, towards the fortress' },
  { x: 50, z: -55, why: 'under the right side of the approach' },
  { x: 30, z: -57, why: 'into the fortress approach from the right' },
  {
    x: 20,
    z: -55,
    why: 'in the open before the sea gate, holding the machine-gun nest on the wall',
    hold: ['fortress-gun'],
  },
  { x: 0, z: -58, why: 'before the fortress gate (area fortress-approach)' },
];

// Past the gate and the yard to the battery; the same ground for both answers.
const TO_BATTERY: readonly Waypoint[] = [
  { x: 0, z: -68, why: 'through the sea gate' },
  { x: 0, z: -95, why: 'in the yard (area fortress-yard), with no prop on the way' },
  // The mid boss comes out of the land gate: go round its left side, then stand by the land wall. It turns too slowly to
  // keep the mech off its flank, and its charge runs into the wall and leaves it exposed for two seconds.
  { x: 0, z: -110, why: 'down the yard and off the gate line' },
  { x: 26, z: -104, why: 'by the yard’s right cover, clear of its corner, while the warden comes out' },
  {
    x: -26,
    z: -121,
    why: 'in the land wall’s corner, holding until it and its two adds fall',
    hold: ['warden', 'warden-adds'],
  },
  // the mid boss is down: plant the charge in the land wall's magazine, then run for the sea gate before its 20 s end
  { x: 0, z: -120.5, why: 'at the magazine, in front of the land gate, and stands to plant', plant: 'fort-bomb' },
  { x: 0, z: -58, why: 'out through the sea gate before the fuse runs out', wait: 'fort-bomb' },
  // the blast has taken the land door with it: back through the sea gate, across the yard and out to the field
  { x: 0, z: -68, why: 'back through the sea gate' },
  { x: 0, z: -98, why: 'across the ruined yard' },
  { x: 0, z: -121, why: 'up to the fallen land gate' },
  { x: 0, z: -128, why: 'through the land gate, now open' },
  // hold the main guns from the field: nearer the magazine the shots at its shuttered face would be wasted
  {
    x: 0,
    z: -205,
    why: 'in front of the main guns, which it holds for',
    hold: ['main-gun-1', 'main-gun-2'],
  },
  { x: 0, z: -230, why: 'in front of the magazine, which it holds for', hold: ['magazine'] },
];

const ROUTE: readonly Waypoint[] = [...TO_PILLBOXES, ...TO_FORTRESS, ...TO_BATTERY];
const ROUTE_DEPOT: readonly Waypoint[] = [...TO_PILLBOXES, ...TO_DEPOT, ...TO_BATTERY];

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

// The living enemies and targets the bot may shoot, nearest first, that it can see from its chest. The depot is only
// shot when a point's hold names it, so walking past the hollow does not break the side goal by chance. The mid boss is
// only shot while it is exposed: its front plate is too thick, and the ammo is needed for the battery after it.
function foesInSight(game: GameModel, only: readonly string[] | null): Foe[] {
  const { mech } = game;
  const chest = { x: mech.x, y: mech.y + MECH_TUNE.chestHeight, z: mech.z };
  // A pillbox takes no damage from shots (SB-2015), so the bot leaves it to the charges and shoots only the enemies
  // and the other targets.
  // The depot is only shot when a point's hold names it, so walking past the hollow does not break the side goal by chance.
  // A nest behind its plate (SB-2051) takes no harm and is out of the aim, so the bot leaves it alone until the plate opens.
  const standing = game.targets.filter(
    target =>
      target.hp > 0 &&
      target.kind !== 'pillbox' &&
      !armoured(game.shutters, target.id) &&
      (only === null ? target.id !== 'depot' : true),
  );
  const foes: Foe[] = [
    ...game.enemies
      .filter(
        enemy =>
          enemy.hp > 0 &&
          (enemy.kind !== 'warden' || (enemy.warden?.exposed ?? 0) > 0) &&
          (only === null || only.includes(enemy.id) || only.includes(enemy.wave)),
      )
      .map(enemy => ({ box: enemyBox(enemy), heavy: false })),
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
  side: { x: number; z: number; left: number } | null; // a place it stepped aside to, and the seconds left there
  steps: number; // how many times it stepped aside from the aimed mortar
}

// Whether a point's hold still waits on `id`: a target's health, an enemy's health, or a wave that has not cleared. A
// wave whose last enemy is smoking still holds the bot until the smoke's three seconds are up.
function waitingOn(game: GameModel, id: string): boolean {
  const target = game.targets.find(entry => entry.id === id);
  if (target !== undefined) return target.hp !== 0;
  const enemy = game.enemies.find(entry => entry.id === id);
  if (enemy !== undefined) return enemy.hp > 0;
  if (M1.waves.includes(id) || game.script.spawned.includes(id)) {
    const wave = game.enemies.filter(entry => entry.wave === id);
    if (wave.some(entry => entry.hp > 0 || (entry.warden?.dying ?? 0) > 0)) return true;
    return !game.script.cleared.includes(id);
  }
  throw new Error(`a hold waits on '${id}', which is no target, enemy or wave`);
}

// Whether a blast point has a charge on it.
const charged = (game: GameModel, id: string): boolean => game.charges.some(charge => charge.blast === id);

// Whether a blast point has blown its line open.
const blasted = (game: GameModel, id: string): boolean => game.blasts.find(blast => blast.id === id)?.blasted === true;

// One frame of the bot's input: the way to the point (or away from a shell, or aside from the aimed mortar), the shots at
// the nearest foe in sight, and the use held while it stands at a blast point. It plants the charge, steps back to the next
// point, waits there until the blast opens the line and then walks through the hole.
function decide(game: GameModel, bot: Bot, route: readonly Waypoint[]): GameInput {
  const { mech } = game;
  const point = route[bot.next];
  const held = point.hold?.filter(id => waitingOn(game, id)) ?? [];
  const arrived = Math.hypot(point.x - mech.x, point.z - mech.z) < REACH;
  if (arrived && held.length === 0 && bot.next < route.length - 1) {
    const plantingLeft = point.plant !== undefined && !charged(game, point.plant);
    const waitingLeft = point.wait !== undefined && !blasted(game, point.wait);
    if (!plantingLeft && !waitingLeft) bot.next += 1;
  }
  const goal = route[bot.next];
  // The aimed mortar comes down on the place the mech has stayed at. Shortly before the stay is full, the bot steps 4 m
  // to one side and comes back after a moment, so the count starts again.
  if (bot.side !== null) {
    bot.side.left -= DT;
    if (bot.side.left <= 0) bot.side = null;
  }
  if (bot.side === null && game.aimed !== null && game.aimed.still >= AIMED_MORTAR.stillSec - AIMED_LEAD) {
    const dir = bot.steps % 2 === 0 ? 1 : -1;
    const sideX = mech.x + Math.cos(mech.yaw) * AIMED_STEP * dir;
    const sideZ = mech.z - Math.sin(mech.yaw) * AIMED_STEP * dir;
    const margin = MECH_TUNE.radius + 0.5;
    bot.side = {
      x: Math.min(game.map.bounds.maxX - margin, Math.max(game.map.bounds.minX + margin, sideX)),
      z: Math.min(game.map.bounds.maxZ - margin, Math.max(game.map.bounds.minZ + margin, sideZ)),
      left: AIMED_STEP_SEC,
    };
    bot.steps += 1;
  }
  const target = bot.side ?? goal;
  let wx = target.x - mech.x;
  let wz = target.z - mech.z;
  const standing = Math.hypot(goal.x - mech.x, goal.z - mech.z) < REACH;
  if (bot.side === null && standing) {
    wx = 0;
    wz = 0;
  }
  // a shell about to land on the mech: straight away from its middle (a step aside is already one)
  for (const shell of bot.side === null ? game.shells : []) {
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
  // While it walks to the main guns' point it keeps its fire: the shots at a gun behind the field's cover are wasted, and
  // the magazine behind it would take the rest through its shut face.
  const gunsHold = held.includes('main-gun-1') || held.includes('main-gun-2');
  const foes = gunsHold && !arrived ? [] : foesInSight(game, held.length > 0 ? held : null);
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
  // at the blast point, holding use: it stands still and shoots nothing until the charge is on
  const planting =
    bot.side === null &&
    standing &&
    goal.plant !== undefined &&
    !charged(game, goal.plant) &&
    !game.shells.some(shell => {
      return Math.hypot(mech.x - shell.x, mech.z - shell.z) < shell.radius + SHELL_MARGIN;
    });
  if (planting) return { ...input, moveX: 0, moveZ: 0, use: true, fire: false, sub: false };
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

function playM1(depot = false, onFrame?: (game: GameModel) => void): Result {
  seed(SEED);
  const route = depot ? ROUTE_DEPOT : ROUTE;
  const game = newGame(M1B_HAND, M1);
  const bot: Bot = { next: 0, side: null, steps: 0 };
  for (let i = 0; i < LIMIT_SECONDS / DT && !game.cleared && !game.downed; i++) {
    // the cutscene is skipped: the landing
    if (game.script.cutscene !== null) sendToScript(game, { kind: 'skip' });
    step(game, decide(game, bot, route), DT);
    onFrame?.(game);
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

// The cues in the order the story runs them; the depot's own cues are left out of the straight-on run's list.
const STORY = [
  'intro',
  'beach',
  'ashore',
  'pillboxes',
  'line2-approach',
  'line2-open',
  'cp1',
  'shelling-start',
  'fortress-gate',
  'fortress-yard',
  // the bot downs yard-1 and then the sea gate's two before yard-2 comes (yard-drop, 6 s after the entry); it then stays
  // in the yard for the mid boss and its two adds, so yard-2 is down before it leaves (SB-1850)
  'yard-gate',
  'yard-3-clear',
  'yard-drop',
  'yard-2-clear',
  'yard-clear',
  'fortress-bomb',
  'fortress-down',
  'fortress-out',
  'gun1',
  'shutter',
  'win',
];

// The depot run's cues: the guard comes out when the mech walks into the hollow.
const STORY_DEPOT = [
  'intro',
  'beach',
  'ashore',
  'pillboxes',
  'line2-approach',
  'line2-open',
  'cp1',
  'shelling-start',
  'depot-guard',
  'depot',
  'fortress-gate',
  'fortress-yard',
  // on this road the yard is cleared (yard-2 included) before the bot leaves it
  'yard-gate',
  'yard-3-clear',
  'yard-drop',
  'yard-2-clear',
  'yard-clear',
  'fortress-bomb',
  'fortress-down',
  'fortress-out',
  'gun1',
  'shutter',
  'win',
];

test(
  'a bot clears M1 from the landing on with its inputs alone',
  () => {
    const result = playM1();
    expect(result.cleared).toBe(true);
    expect(result.downed).toBe(false);
    expect(result.retries).toBe(0);
    // every cue of the straight-on story fired, one after another
    const times = STORY.map(id => result.fired[id]);
    expect(times.every(time => time !== undefined)).toBe(true);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(result.fired['depot-guard']).toBeUndefined();
    expect(result.fired['depot']).toBeUndefined();
    // nothing asks the player to choose, and nothing is lost for leaving the depot standing
    expect(result.fired['depot-ask']).toBeUndefined();
    expect(result.fired['fortress-go']).toBeUndefined();
    // seed 7 took about 131 s of game time and left 174 armour (of 200) and 65 of 400 autocannon shots and 1 of 12 heavy
    // gun shots. The limits below keep room for a retune of the values, and fail if the sortie turns out hardly possible
    expect(result.time).toBeLessThan(LIMIT_SECONDS);
    expect(result.armor).toBeGreaterThan(0);
    expect(result.main).toBeGreaterThan(0);
    expect(result.sub).toBeGreaterThanOrEqual(0);
  },
  TEST_TIMEOUT,
);

test(
  'a bot clears M1 by going for the depot',
  () => {
    const result = playM1(true);
    expect(result.cleared).toBe(true);
    expect(result.downed).toBe(false);
    expect(result.retries).toBe(0);
    const times = STORY_DEPOT.map(id => result.fired[id]);
    expect(times.every(time => time !== undefined)).toBe(true);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // the guard comes out after the shelling has started (seed 7: the shelling at 105.2 s, the hollow at about 109 s)
    expect((result.fired['depot-guard'] ?? 0) - (result.fired['shelling-start'] ?? 0)).toBeGreaterThan(1);
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

// SB-2044: how far the allies keep behind the mech, section by section. A section runs from one cue to the next (the
// first cue that has fired decides it). The three cover mechs are read from the game; the infantry is the view's battle
// layer, which holds no state in the game, so the bot steps its own copy the way view/play.ts does (the same stream, the
// same tune, the same front lines).
const SECTIONS: readonly { name: string; from: string }[] = [
  { name: 'beach', from: 'intro' },
  { name: 'line 1', from: 'line1-open' },
  { name: 'B', from: 'pillboxes' },
  { name: 'pillboxes', from: 'line2-open' },
  { name: 'C', from: 'cp1' },
  { name: 'fortress front', from: 'fortress-gun-wake' },
  { name: 'yard', from: 'fortress-yard' },
  { name: 'battery front', from: 'fortress-out' },
];
const NEAR = 30; // an ally this near the mech, or ahead of it, counts as keeping up (m)
const SAMPLE_EVERY = 6; // frames
const PRINT_TABLE = false; // true prints the section table of both roads to the console

interface Gap {
  dists: number[];
  ahead: number;
  keeping: number;
}

function measureAllies(depot: boolean): Record<string, { mechs: Gap; infantry: Gap; nearest: Gap }> {
  const blank = (): Gap => ({ dists: [], ahead: 0, keeping: 0 });
  const table: Record<string, { mechs: Gap; infantry: Gap; nearest: Gap }> = {};
  for (const section of SECTIONS) table[section.name] = { mechs: blank(), infantry: blank(), nearest: blank() };
  let battle: ReturnType<typeof newBattle> | null = null;
  let frontId = '';
  let frame = 0;
  const add = (gap: Gap, mech: { z: number }, ally: { x: number; z: number }, mx: number) => {
    const dist = Math.hypot(ally.x - mx, ally.z - mech.z);
    gap.dists.push(dist);
    const ahead = ally.z <= mech.z;
    if (ahead) gap.ahead++;
    if (ahead || dist <= NEAR) gap.keeping++;
  };
  playM1(depot, game => {
    if (battle === null) {
      const front = frontOf(game.script.flags);
      battle = newBattle(
        stream('battle'),
        game.map.bounds,
        PLAY_BATTLE_TUNE,
        front.holdZ,
        game.map.spawns[M1_NEST_WAVE] ?? [],
      );
      frontId = front.id;
    }
    if (game.script.cutscene === null) {
      const front = frontOf(game.script.flags);
      if (front.id !== frontId) {
        frontId = front.id;
        battle.crowd.holdZ = front.holdZ;
        battle.crowd.holdT = 0;
        spawnWave(battle.crowd, stream('battle'), game.map.bounds, PAYOFF_TUNE.surgeAllies, PLAY_BATTLE_TUNE);
      }
      stepBattle(battle, stream('battle'), DT, PLAY_BATTLE_TUNE, game.mech, front.id !== 'pillboxes');
    }
    frame++;
    if (frame % SAMPLE_EVERY !== 0) return;
    // the section is the one whose cue fired last (the bot is already inside B when it plants line 1's charge)
    let section: string | null = null;
    let latest = -1;
    for (const entry of SECTIONS) {
      const at = game.script.fired[entry.from];
      if (at !== undefined && at >= latest) {
        section = entry.name;
        latest = at;
      }
    }
    if (section === null) return;
    const row = table[section];
    for (const ally of game.allies) {
      if (ally.down || !ally.id.startsWith('cover-')) continue;
      add(row.mechs, game.mech, ally, game.mech.x);
    }
    const alive = battle.crowd.soldiers.filter(soldier => soldier.alive);
    for (const soldier of alive) add(row.infantry, game.mech, soldier, game.mech.x);
    // the ten nearest the mech: the ones the player sees at his back
    alive
      .map(soldier => ({ soldier, dist: Math.hypot(soldier.x - game.mech.x, soldier.z - game.mech.z) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 10)
      .forEach(item => add(row.nearest, game.mech, item.soldier, game.mech.x));
  });
  return table;
}

function summarize(gap: Gap): string {
  const n = gap.dists.length;
  if (n === 0) return 'no samples';
  const sorted = [...gap.dists].sort((a, b) => a - b);
  const pct = (v: number) => `${Math.round((v / n) * 100)}%`;
  return `median ${sorted[Math.floor(n / 2)].toFixed(0)} m, max ${sorted[n - 1].toFixed(0)} m, ahead ${pct(gap.ahead)}, ahead or within ${NEAR} m ${pct(gap.keeping)}`;
}

function median(gap: Gap): number {
  return [...gap.dists].sort((x, y) => x - y)[Math.floor(gap.dists.length / 2)];
}

test(
  'the cover mechs and the infantry keep up with the mech on both roads',
  () => {
    for (const depot of [false, true]) {
      const table = measureAllies(depot);
      if (PRINT_TABLE) {
        console.log(`--- ${depot ? 'depot' : 'straight'} road`);
        for (const section of SECTIONS) {
          const row = table[section.name];
          console.log(
            `${section.name}\n  mechs: ${summarize(row.mechs)}\n  infantry: ${summarize(row.infantry)}\n  nearest 10 infantry: ${summarize(row.nearest)}`,
          );
        }
      }
      // from the pillbox line on, the three cover mechs are ahead of the mech or within 30 m of it for a good part of each
      // section, and never 40 m behind it for long (before this ticket they idled 90 to 130 m back from line 2 to the yard,
      // and stayed in the yard while the mech went out to the battery)
      for (const section of SECTIONS.slice(3)) {
        const mechs = table[section.name].mechs;
        expect(mechs.dists.length, `${section.name} has mech samples`).toBeGreaterThan(0);
        expect(mechs.keeping / mechs.dists.length, `${section.name} keeping (${depot})`).toBeGreaterThanOrEqual(0.35);
        expect(median(mechs), `${section.name} median distance (${depot})`).toBeLessThanOrEqual(40);
      }
      // the ten infantry nearest the mech come on behind it: within 80 m for half the time from C to the battery
      for (const section of SECTIONS.slice(4)) {
        expect(median(table[section.name].nearest), `${section.name} nearest infantry (${depot})`).toBeLessThanOrEqual(
          80,
        );
      }
    }
  },
  TEST_TIMEOUT * 4,
);
