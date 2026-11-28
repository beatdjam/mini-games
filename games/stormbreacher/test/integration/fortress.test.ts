// The fortress (SB-1800): its walls stand where FORTRESS_TUNE says and leave the sea and land gates open, the mech walks
// through both of them, and the walking check finds the way through the gates (and not once a gate is shut).
import { expect, test } from 'vitest';
import { FORTRESS_TUNE, GATE_SHUTTER } from '../../src/data/fortress.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { PROP_SIZE } from '../../src/data/props.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import type { MapDef, MissionDef, Prop } from '../../src/data/types.ts';
import {
  fortressBlast,
  NAV_RADIUS,
  sendToScript,
  step,
  type GameEvent,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { checkMapPath } from '../../src/logic/mapCheck.ts';
import { navTarget, stepNav } from '../../src/logic/nav.ts';
import { restoreSuspend, suspendOf } from '../../src/logic/suspend.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;
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

// The walk asks nothing of the script: this test is about the walls alone.
const MISSION: MissionDef = {
  id: 'fortress-test',
  cues: [],
  areas: {},
  targets: [],
  waves: [],
  objectives: [],
  marks: [],
  allies: [],
  paths: {},
  places: {},
};

test('the map’s walking check is empty (it stops at the seawall’s foot, so it says nothing of the gates)', () => {
  expect(checkMapPath(M1B_HAND)).toEqual([]);
});

// The fortress alone, in a box as wide as its outer wall: with no seawall the check walks the whole depth, so the only
// way through is the two gates. `real` keeps the map's own pieces (the `collapse` walls and the land door as they are);
// otherwise the pieces are plain walls without the door, so a gate shut by an extra piece is told.
function fortressOnly(extra: readonly Prop[] = [], real = false): MapDef {
  const fortWalls = M1B_HAND.props.filter(prop => prop.kind === 'fortWall');
  const pieces = real
    ? fortWalls
    : fortWalls.filter(wall => wall.collapse !== true || wall.x !== 0).map(wall => ({ ...wall, collapse: undefined }));
  return {
    ...M1B_HAND,
    bounds: { ...M1B_HAND.bounds, minX: -34, maxX: 34 },
    props: [...pieces, ...extra],
    mines: [],
    blasts: [],
    targets: [],
  };
}

test('the check finds a way through both gates of the fortress alone, and not when a gate is shut', () => {
  expect(checkMapPath(fortressOnly())).toEqual([]);
  const seaDoor: Prop = { kind: 'fortWall', x: 0, z: FORTRESS_TUNE.seaWallZ, yaw: 0, scale: 1 };
  const landDoor: Prop = { kind: 'fortWall', x: 0, z: FORTRESS_TUNE.landWallZ, yaw: 0, scale: 1 };
  expect(checkMapPath(fortressOnly([seaDoor])).length).toBeGreaterThan(0);
  expect(checkMapPath(fortressOnly([landDoor])).length).toBeGreaterThan(0);
});

test('the map’s own land door counts as already down, but the sea wall still counts as a wall (SB-1860)', () => {
  // the real pieces: the land wall and its door are `collapse`, the sea wall is not
  expect(checkMapPath(fortressOnly([], true))).toEqual([]);
  // a plain door in the sea gate shuts it even with the land side open to the blast
  const seaDoor: Prop = { kind: 'fortWall', x: 0, z: FORTRESS_TUNE.seaWallZ, yaw: 0, scale: 1 };
  expect(checkMapPath(fortressOnly([seaDoor], true)).length).toBeGreaterThan(0);
});

// True when the intervals [c - half, c + half] of the centres together cover [lo, hi] without a gap.
function covers(centres: readonly number[], half: number, lo: number, hi: number): boolean {
  let reach = lo;
  for (const centre of [...centres].sort((a, b) => a - b)) {
    if (centre - half > reach + 1e-9) return false;
    reach = Math.max(reach, centre + half);
  }
  return reach >= hi - 1e-9;
}

test('the four walls close the yard: nothing is missing from an end wall’s halves or from a side wall', () => {
  const walls = M1B_HAND.props.filter(prop => prop.kind === 'fortWall');
  const { w, d } = PROP_SIZE.fortWall;
  const yardNear = FORTRESS_TUNE.yardZ + FORTRESS_TUNE.yardD / 2; // -74
  const yardFar = FORTRESS_TUNE.yardZ - FORTRESS_TUNE.yardD / 2; // -122
  const gate = (kind: 'sea' | 'land') => (kind === 'sea' ? FORTRESS_TUNE.seaGate : FORTRESS_TUNE.landGate) / 2;
  for (const [kind, z] of [
    ['sea', FORTRESS_TUNE.seaWallZ],
    ['land', FORTRESS_TUNE.landWallZ],
  ] as const) {
    const row = walls.filter(wall => wall.yaw === 0 && wall.z === z);
    // each half runs from the gate's edge to the outer edge
    for (const sign of [-1, 1]) {
      const half = row.filter(wall => Math.sign(wall.x) === sign).map(wall => Math.abs(wall.x));
      expect(covers(half, w / 2, gate(kind), FORTRESS_TUNE.outerW / 2), `${kind} wall, x ${sign}`).toBe(true);
    }
    // the gate stays open, and no piece sticks out of the outer wall
    for (const wall of row) {
      if (wall.x === 0) continue; // the land gate's door fills the gate (SB-1860)
      expect(Math.abs(wall.x) - w / 2).toBeGreaterThanOrEqual(gate(kind) - 1e-9);
      expect(Math.abs(wall.x) + w / 2).toBeLessThanOrEqual(FORTRESS_TUNE.outerW / 2);
    }
  }
  // each side wall runs the yard's whole depth, with its inner face at the yard's edge
  for (const sign of [-1, 1]) {
    const side = walls.filter(wall => wall.yaw !== 0 && Math.sign(wall.x) === sign);
    expect(side).toHaveLength(4);
    for (const wall of side) {
      expect(Math.abs(wall.x) - d / 2).toBeCloseTo(FORTRESS_TUNE.yardW / 2, 6);
      expect(Math.abs(wall.x) + d / 2).toBeLessThanOrEqual(FORTRESS_TUNE.outerW / 2);
    }
    // a quarter turn swaps the piece's width and depth: it spans w along z
    expect(
      covers(
        side.map(wall => -wall.z),
        w / 2,
        -yardNear,
        -yardFar,
      ),
      `side wall, x ${sign}`,
    ).toBe(true);
  }
  // the land gate's door (SB-1860) is the one piece at x 0: it fills its opening and comes down with the blast
  expect(walls).toHaveLength(21);
  const door = walls.filter(wall => wall.x === 0);
  expect(door).toHaveLength(1);
  expect(door[0]).toMatchObject({ z: FORTRESS_TUNE.landWallZ, yaw: 0, collapse: true });
  expect(door[0].breakable).toBeUndefined();
});

test('the mech at x 0 walks through the sea gate, and the blast opens the land gate', () => {
  const game: GameModel = newPlayGame({ ...M1B_HAND, mines: [] }, MISSION);
  game.mech.x = 0;
  game.mech.y = 0;
  game.mech.z = -55;
  game.mech.yaw = 0;
  game.armor = 10000;
  // the sea gate's shutter waits for the wall's nest (SB-2300): down it, and one frame rolls the plate away
  const gun = game.targets.find(target => target.id === 'fortress-gun');
  if (!gun) throw new Error('the hand map has no fortress-gun');
  gun.hp = 0;
  step(game, idle, DT);
  // the sea gate spans z -74..-68 and the land gate z -128..-122; the land door is shut until the charge blows (SB-1860)
  let seaGate = false;
  let landGate = false;
  let highest = 0;
  for (let i = 0; i < 1200 && game.mech.z > -95; i++) {
    step(game, { ...idle, moveZ: 1 }, DT);
    if (game.mech.z < -74) seaGate = true;
    highest = Math.max(highest, game.mech.y);
    expect(Math.abs(game.mech.x)).toBeLessThan(1);
  }
  expect(game.mech.z).toBeLessThanOrEqual(-95);
  expect(seaGate).toBe(true);

  // the charge in the land wall blows: the walls and the door come down
  const bomb = game.blasts.find(blast => blast.id === 'fort-bomb');
  if (!bomb) throw new Error('the map has no fort-bomb');
  fortressBlast(game, bomb);
  sendToScript(game, { kind: 'skip' });
  for (let i = 0; i < 1200 && game.mech.z > -135; i++) {
    step(game, { ...idle, moveZ: 1 }, DT);
    if (game.mech.z < -128) landGate = true;
    highest = Math.max(highest, game.mech.y);
    expect(Math.abs(game.mech.x)).toBeLessThan(1);
  }
  expect(game.mech.z).toBeLessThanOrEqual(-135);
  expect(landGate).toBe(true);
  // it walked on the ground, not up a wall
  expect(highest).toBe(0);
});

// The sea gate's shutter's rect in game.rects, or undefined once it has rolled away (SB-2300).
function gateIn(game: GameModel) {
  const halfW = GATE_SHUTTER.w / 2;
  const halfD = GATE_SHUTTER.d / 2;
  return game.rects.find(
    rect => rect.x === GATE_SHUTTER.x && rect.z === GATE_SHUTTER.z && rect.halfW === halfW && rect.halfD === halfD,
  );
}

test('the sea gate is shut until the wall’s nest falls, and then the mech walks in (SB-2300)', () => {
  const game = newPlayGame({ ...M1B_HAND, mines: [] }, MISSION);
  expect(gateIn(game)).toBeDefined();
  game.mech.x = 0;
  game.mech.y = 0;
  game.mech.z = -60;
  game.mech.yaw = 0;
  game.armor = 10000;
  // pushing landward against the shut gate stops at the plate's seaward face (the wall's opening, not through)
  for (let i = 0; i < 600; i++) step(game, { ...idle, moveZ: 1 }, DT);
  const stop = GATE_SHUTTER.z + GATE_SHUTTER.d / 2 + MECH_TUNE.radius;
  expect(game.mech.z).toBeGreaterThanOrEqual(stop - 1e-6);

  const gun = game.targets.find(target => target.id === 'fortress-gun');
  if (!gun) throw new Error('the hand map has no fortress-gun');
  gun.hp = 0;
  step(game, idle, DT);
  expect(game.events.some(event => event.kind === 'gateOpen')).toBe(true);
  expect(gateIn(game)).toBeUndefined();
  // and the way to the yard is open
  let through = false;
  for (let i = 0; i < 1200 && game.mech.z > -80; i++) {
    step(game, { ...idle, moveZ: 1 }, DT);
    if (game.mech.z < -74) through = true;
  }
  expect(game.mech.z).toBeLessThanOrEqual(-80);
  expect(through).toBe(true);
});

test('the shut sea gate stops the mech’s shots too (SB-2300)', () => {
  const game = newPlayGame({ ...M1B_HAND, mines: [] }, MISSION);
  game.mech.x = 0;
  game.mech.y = 0;
  game.mech.z = -60;
  game.mech.yaw = 0;
  const hits: GameEvent[] = [];
  for (let i = 0; i < 12; i++) {
    step(game, { ...idle, fire: true }, DT);
    hits.push(...game.events.filter(event => event.kind === 'hit'));
  }
  const face = GATE_SHUTTER.z + GATE_SHUTTER.d / 2;
  expect(
    hits.some(
      event => event.kind === 'hit' && event.prop === null && event.target === null && Math.abs(event.z - face) < 0.5,
    ),
  ).toBe(true);
});

test('the enemies’ grid crosses the sea gate only once the wall’s nest falls (SB-2300)', () => {
  const game = newPlayGame({ ...M1B_HAND, mines: [] }, MISSION);
  const mech = { x: 0, z: -95 };
  const closed = stepNav(game.nav, game.rects, game.map.bounds, NAV_RADIUS, mech, DT);
  expect(navTarget(closed, 0, -60, mech.x, mech.z)).toBeNull();
  const count = game.nav.grid?.rectCount ?? -1;

  const gun = game.targets.find(target => target.id === 'fortress-gun');
  if (!gun) throw new Error('the hand map has no fortress-gun');
  gun.hp = 0;
  step(game, idle, DT);
  const open = stepNav(game.nav, game.rects, game.map.bounds, NAV_RADIUS, mech, DT);
  // the cells are made again when the gate's rect leaves
  expect(game.nav.grid?.rectCount).not.toBe(count);
  expect(navTarget(open, 0, -60, mech.x, mech.z)).toEqual(mech);
});

test('the fortress blast opens the sea gate with the wall’s nest (SB-2300)', () => {
  const game = newPlayGame({ ...M1B_HAND, mines: [] }, MISSION);
  expect(gateIn(game)).toBeDefined();
  // by the blast the approach has woken the nest and rolled its own plate up, so the shot may reach it
  const nest = game.shutters.find(shutter => shutter.target === 'fortress-gun');
  if (nest) nest.open = true;
  const bomb = game.blasts.find(blast => blast.id === 'fort-bomb');
  if (!bomb) throw new Error('the map has no fort-bomb');
  fortressBlast(game, bomb);
  expect(gateIn(game)).toBeUndefined();
  expect(game.events.some(event => event.kind === 'gateOpen')).toBe(true);
});

test('a suspend keeps the sea gate shut or open as it was (SB-2300)', () => {
  const shut = newPlayGame(M1B_HAND);
  expect(gateIn(shut)).toBeDefined();
  const backShut = restoreSuspend(structuredClone(suspendOf(shut)));
  if (!backShut) throw new Error('the shut suspend did not read back');
  expect(gateIn(backShut)).toBeDefined();

  // an old save from before the gate has no rect: the standing nest puts it back (the version need not change)
  const old = structuredClone(suspendOf(shut));
  old.game.rects = old.game.rects.filter(rect => rect.x !== GATE_SHUTTER.x || rect.z !== GATE_SHUTTER.z);
  const backOld = restoreSuspend(old);
  if (!backOld) throw new Error('the old suspend did not read back');
  expect(gateIn(backOld)).toBeDefined();

  const open = newPlayGame(M1B_HAND);
  const gun = open.targets.find(target => target.id === 'fortress-gun');
  if (!gun) throw new Error('the hand map has no fortress-gun');
  gun.hp = 0;
  step(open, idle, DT);
  expect(gateIn(open)).toBeUndefined();
  const backOpen = restoreSuspend(structuredClone(suspendOf(open)));
  if (!backOpen) throw new Error('the open suspend did not read back');
  expect(gateIn(backOpen)).toBeUndefined();
});
