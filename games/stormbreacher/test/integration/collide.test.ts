import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1B_RULES } from '../../src/data/maps/m1b-rules.ts';
import { PROP_SIZE } from '../../src/data/props.ts';
import { MECH_TUNE, MOVE_TUNE } from '../../src/data/tune.ts';
import { rectDistance } from '../../src/logic/collide.ts';
import { mapBlockers } from '../../src/logic/mapShapes.ts';
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

test('the hand map lets the mech walk straight through lines 1 to 3 at their breakthroughs', () => {
  for (const line of M1B_RULES.lines.slice(0, 3)) {
    const gapX = line.gaps[0].x;
    const m = newMech();
    m.x = gapX;
    m.z = line.z + line.depth / 2 + 4;
    m.yaw = 0;
    let crossed = false;
    for (let i = 0; i < 600; i++) {
      stepMech(m, input({ moveZ: 1 }), 1 / 60, MOVE_TUNE, 0, world);
      for (const rect of world.rects) {
        expect(rectDistance(rect, m.x, m.z), `line at z ${line.z}`).toBeGreaterThanOrEqual(MECH_TUNE.radius - 1e-6);
      }
      if (m.z < line.z - line.depth / 2 - 2) {
        crossed = true;
        break;
      }
    }
    expect(crossed, `line at z ${line.z}`).toBe(true);
  }
});

test('walking head-on into a line hedgehog stops the mech in front of it', () => {
  const m = newMech();
  m.x = -61;
  m.z = 150;
  m.yaw = 0;
  for (let i = 0; i < 240; i++) {
    stepMech(m, input({ moveZ: 1 }), 1 / 60, MOVE_TUNE, 0, world);
    for (const rect of world.rects) {
      expect(rectDistance(rect, m.x, m.z)).toBeGreaterThanOrEqual(MECH_TUNE.radius - 1e-6);
    }
  }
  expect(m.z).toBeCloseTo(145.5, 3);
  expect(m.x).toBeCloseTo(-61, 6);
});

test('the walking check and the mech use the same rects', () => {
  const blocking = M1B_HAND.props.filter(prop => PROP_SIZE[prop.kind].blocks).length;
  expect(mapBlockers(M1B_HAND).length).toBe(blocking + M1B_HAND.targets.length);
});
