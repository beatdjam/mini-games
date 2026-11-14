import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1B_RULES } from '../../src/data/maps/m1b-rules.ts';
import { PROP_SIZE, STAIRS_TUNE } from '../../src/data/props.ts';
import { MECH_TUNE, MOVE_TUNE } from '../../src/data/tune.ts';
import { openBreach } from '../../src/logic/blasts.ts';
import { rectDistance } from '../../src/logic/collide.ts';
import { blockingPropIndexes, mapBlockers } from '../../src/logic/mapShapes.ts';
import { newMech, stepMech, type MechInput } from '../../src/logic/mech.ts';

const idle: MechInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
};

const input = (over: Partial<MechInput>): MechInput => ({ ...idle, ...over });

const world = { rects: mapBlockers(M1B_HAND), radius: MECH_TUNE.radius };

// The nearest any rect comes to the mech's middle; one expect a frame instead of one a rect keeps the test quick.
const nearest = (x: number, z: number): number => Math.min(...world.rects.map(rect => rectDistance(rect, x, z)));

test('a closed line stops the mech, and one opened blast point lets it through', () => {
  const points = M1B_HAND.blasts ?? [];
  // the mech's day starts at the sea side of the line, facing the land
  const fresh = (x: number, z: number) => {
    const m = newMech();
    m.x = x;
    m.z = z;
    m.yaw = 0;
    return m;
  };
  for (const line of M1B_RULES.lines.slice(0, 3)) {
    const onLine = points.filter(point => point.line === line.z);
    expect(onLine.length, `line at z ${line.z}`).toBe(2);
    for (const point of onLine) {
      const world = { rects: mapBlockers(openBreach(M1B_HAND, [point.id])), radius: MECH_TUNE.radius };
      const m = fresh(point.x, line.z + line.depth / 2 + 4);
      let crossed = false;
      for (let i = 0; i < 600; i++) {
        stepMech(m, input({ moveZ: 1 }), 1 / 60, MOVE_TUNE, 0, world);
        if (m.z < line.z - line.depth / 2 - 2) {
          crossed = true;
          break;
        }
      }
      expect(crossed, `line at z ${line.z} opened by ${point.id}`).toBe(true);
    }
    // the same walk with every hole shut stops at the line
    const world = { rects: mapBlockers(M1B_HAND), radius: MECH_TUNE.radius };
    const m = fresh(onLine[0].x, line.z + line.depth / 2 + 4);
    for (let i = 0; i < 240; i++) stepMech(m, input({ moveZ: 1 }), 1 / 60, MOVE_TUNE, 0, world);
    expect(m.z, `line at z ${line.z} closed`).toBeGreaterThan(line.z);
  }
});

test('walking head-on into a line hedgehog stops the mech in front of it', () => {
  const m = newMech();
  m.x = -61;
  m.z = 150;
  m.yaw = 0;
  for (let i = 0; i < 240; i++) {
    stepMech(m, input({ moveZ: 1 }), 1 / 60, MOVE_TUNE, 0, world);
    expect(nearest(m.x, m.z)).toBeGreaterThanOrEqual(MECH_TUNE.radius - 1e-6);
  }
  expect(m.z).toBeCloseTo(145.5, 3);
  expect(m.x).toBeCloseTo(-61, 6);
});

test('the walking check and the mech use the same rects', () => {
  // a flight of stairs is one rect per step
  const rectsOf = (kind: string): number => (kind === 'stairs' ? STAIRS_TUNE.steps : 1);
  const blocking = M1B_HAND.props
    .filter(prop => PROP_SIZE[prop.kind].blocks)
    .reduce((total, prop) => total + rectsOf(prop.kind), 0);
  expect(mapBlockers(M1B_HAND).length).toBe(blocking + M1B_HAND.targets.length);
});

test('the blocking prop indexes are the props the rects stand on', () => {
  const indexes = blockingPropIndexes(M1B_HAND);
  expect(indexes).toHaveLength(mapBlockers(M1B_HAND).length - M1B_HAND.targets.length);
  for (const index of indexes) expect(PROP_SIZE[M1B_HAND.props[index].kind].blocks).toBe(true);
});
