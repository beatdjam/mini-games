// The boss's ground behind the seawall (SB-120): the mech drops off the seawall onto level ground, walks on to the
// battery's three parts, and shooting them down runs M1 to its cleared result. Walked and shot with inputs.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { PROP_SIZE, TARGET_SIZE } from '../../src/data/props.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import type { TargetPlace } from '../../src/data/types.ts';
import { rectDistance } from '../../src/logic/collide.ts';
import { step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { newPlayGame } from './playGame.ts';
import { validateMapForMission } from '../../src/logic/mapCheck.ts';

const DT = 1 / 60;
const PARTS = ['main-gun-1', 'main-gun-2', 'magazine'];
const SEAWALL_BACK = -75; // the seawall's landward face (z)
const ARRIVE = 0.6; // a waypoint counts as reached within this (m)
const REACH = 4; // the mech's middle this near a part's edge is "at" the part (m)

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

// The hand map without its mines, so a walk does not set one off.
function newBatteryGame(): GameModel {
  const game = newPlayGame({ ...M1B_HAND, mines: [] });
  game.mech.yaw = 0;
  return game;
}

function part(id: string): TargetPlace {
  const place = M1B_HAND.targets.find(target => target.id === id);
  if (!place) throw new Error(`the hand map has no ${id}`);
  return place;
}

// Walks forward, facing the waypoint each frame, until the mech's middle is within ARRIVE of it.
function walkTo(game: GameModel, x: number, z: number): void {
  for (let i = 0; i < 1200; i++) {
    const dx = x - game.mech.x;
    const dz = z - game.mech.z;
    if (Math.hypot(dx, dz) < ARRIVE) return;
    game.mech.yaw = Math.atan2(-dx, -dz);
    step(game, { ...idle, moveZ: 1 }, DT);
  }
  throw new Error(`the mech did not reach (${x}, ${z}); it stands at (${game.mech.x}, ${game.mech.z})`);
}

function distanceToPart(game: GameModel, id: string): number {
  const place = part(id);
  const size = TARGET_SIZE[place.kind];
  const rect = { x: place.x, z: place.z, halfW: size.w / 2, halfD: size.d / 2, yaw: place.yaw };
  return rectDistance(rect, game.mech.x, game.mech.z);
}

// Fires with the camera's line through the middle of a target's box, until it is down (the shots take time to fly).
function shootDown(game: GameModel, id: string): void {
  const target = game.targets.find(item => item.id === id);
  if (!target) throw new Error(`the game has no ${id}`);
  const chest = { x: game.mech.x, y: game.mech.y + MECH_TUNE.chestHeight, z: game.mech.z };
  const cx = (target.box.minX + target.box.maxX) / 2;
  const cy = (target.box.minY + target.box.maxY) / 2;
  const cz = (target.box.minZ + target.box.maxZ) / 2;
  const length = Math.hypot(cx - chest.x, cy - chest.y, cz - chest.z);
  const aim = {
    ox: chest.x,
    oy: chest.y,
    oz: chest.z,
    dx: (cx - chest.x) / length,
    dy: (cy - chest.y) / length,
    dz: (cz - chest.z) / length,
  };
  for (let i = 0; i < 1200 && target.hp > 0; i++) step(game, { ...idle, fire: true, aim }, DT);
  expect(target.hp, id).toBe(0);
}

test('the hand map holds M1’s guns and magazine, and the check finds no violation without leaving them out', () => {
  for (const id of PARTS) expect(M1B_HAND.targets.map(target => target.id)).toContain(id);
  expect(M1.targets).toEqual(expect.arrayContaining(PARTS));
  const violations = validateMapForMission(M1B_HAND, M1, { waves: ['beach-mortar', 'battery'] });
  expect(violations).toEqual([]);
});

test('the battery’s parts stand landward of the seawall’s back face, with the bounds reaching past them', () => {
  for (const id of PARTS) {
    const place = part(id);
    const size = TARGET_SIZE[place.kind];
    expect(place.z + size.d / 2, id).toBeLessThan(SEAWALL_BACK);
    expect(place.z - size.d / 2, id).toBeGreaterThan(M1B_HAND.bounds.minZ + MECH_TUNE.radius * 2);
  }
});

test('walking off the back of the seawall drops the mech to the ground', () => {
  for (const x of [-50, 35]) {
    const game = newBatteryGame();
    game.mech.x = x;
    game.mech.z = -45;
    let top = 0;
    for (let i = 0; i < 400 && game.mech.z > SEAWALL_BACK - 3; i++) {
      step(game, { ...idle, moveZ: 1 }, DT);
      top = Math.max(top, game.mech.y);
    }
    expect(top, `flight at x ${x}`).toBeCloseTo(PROP_SIZE.seawall.h, 2);
    expect(game.mech.z, `flight at x ${x}`).toBeLessThanOrEqual(SEAWALL_BACK - 3);
    run(game, 60);
    expect(game.mech.y, `flight at x ${x}`).toBe(0);
  }
});

function run(game: GameModel, frames: number): void {
  for (let i = 0; i < frames; i++) step(game, { ...idle, moveZ: 1 }, DT);
}

test('from the ground below the seawall the mech walks round the cover to every part of the battery', () => {
  const game = newBatteryGame();
  game.mech.x = 10;
  game.mech.z = -78;
  // the legs go between the wrecks at z -100 and z -114, then along the guns’ front to the magazine
  walkTo(game, 10, -95);
  walkTo(game, 0, -125);
  walkTo(game, -20, -135);
  expect(distanceToPart(game, 'main-gun-1')).toBeLessThanOrEqual(REACH);
  walkTo(game, 0, -125);
  walkTo(game, 20, -135);
  expect(distanceToPart(game, 'main-gun-2')).toBeLessThanOrEqual(REACH);
  walkTo(game, 0, -125);
  walkTo(game, 0, -143);
  expect(distanceToPart(game, 'magazine')).toBeLessThanOrEqual(REACH);
  expect(game.mech.y).toBe(0);
});

test('M1 clears: up the ramp into seawall-top, both guns down, then the magazine', () => {
  const game = newBatteryGame();
  game.mech.x = 35;
  game.mech.z = -45;
  for (let i = 0; i < 300 && !game.script.entered.includes('seawall-top'); i++) {
    step(game, { ...idle, moveZ: 1 }, DT);
  }
  expect(game.script.entered).toContain('seawall-top');
  expect(game.script.objective).toBe('silence-battery');
  // the shots are fired from the ground below the seawall (the walk down is tested above)
  game.mech.x = -30;
  game.mech.y = 0;
  game.mech.z = -115;
  shootDown(game, 'main-gun-1');
  expect(game.script.objective).toBe('silence-battery');
  game.mech.x = 30;
  shootDown(game, 'main-gun-2');
  expect(game.script.destroyed).toEqual(expect.arrayContaining(['main-gun-1', 'main-gun-2']));
  expect(game.script.objective).toBe('hit-magazine');
  expect(game.cleared).toBe(false);
  game.mech.x = 0;
  game.mech.z = -125;
  shootDown(game, 'magazine');
  expect(game.script.ended).toBe('cleared');
  expect(game.cleared).toBe(true);
});
