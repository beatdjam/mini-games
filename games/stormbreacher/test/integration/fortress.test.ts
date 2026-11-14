// The fortress (SB-1800): its walls stand where FORTRESS_TUNE says and leave the sea and land gates open, the mech walks
// through both of them, and the walking check finds the way through the gates (and not once a gate is shut).
import { expect, test } from 'vitest';
import { FORTRESS_TUNE } from '../../src/data/fortress.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { PROP_SIZE } from '../../src/data/props.ts';
import type { MapDef, MissionDef, Prop } from '../../src/data/types.ts';
import { fortressBlast, sendToScript, step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { checkMapPath } from '../../src/logic/mapCheck.ts';
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
// way through is the two gates.
function fortressOnly(extra: readonly Prop[] = []): MapDef {
  const fortWalls = M1B_HAND.props.filter(prop => prop.kind === 'fortWall');
  return {
    ...M1B_HAND,
    bounds: { ...M1B_HAND.bounds, minX: -34, maxX: 34 },
    props: [...fortWalls, ...extra],
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
