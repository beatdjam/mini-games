import { expect, test } from 'vitest';
import { FEEL_TUNE, MOVE_TUNE } from '../../src/data/tune.ts';
import { newMech, stepMech, type MechEvent, type MechInput } from '../../src/logic/mech.ts';

const FRAMES = 400;

// 2 s walking, a jump, 1 s of boosting in the air and on the ground, then stopping; every step is a 60th of a second.
function inputAt(frame: number): MechInput {
  const jumping = frame === 120;
  const boosting = frame >= 130 && frame < 190;
  const moving = frame < 190;
  return { moveX: 0, moveZ: moving ? 1 : 0, turn: 0, jump: jumping, boost: boosting, fire: false };
}

function run(): { mech: ReturnType<typeof newMech>; events: MechEvent[] } {
  const mech = newMech();
  const events: MechEvent[] = [];
  for (let frame = 0; frame < FRAMES; frame++) {
    events.push(...stepMech(mech, inputAt(frame), 1 / 60, MOVE_TUNE, FEEL_TUNE.fireRate));
  }
  return { mech, events };
}

test('the same input run twice ends in the same place with the same gauge', () => {
  const a = run();
  const b = run();
  expect(a.mech.x).toBeCloseTo(b.mech.x, 10);
  expect(a.mech.y).toBeCloseTo(b.mech.y, 10);
  expect(a.mech.z).toBeCloseTo(b.mech.z, 10);
  expect(a.mech.gauge).toBeCloseTo(b.mech.gauge, 10);
});

test('the events run jump, then boostStart, then land before boostEnd', () => {
  const { events } = run();
  expect(events[0].kind).toBe('jump');
  expect(events[1].kind).toBe('boostStart');

  const kinds = events.map(event => event.kind);
  const land = kinds.indexOf('land');
  const boostEnd = kinds.indexOf('boostEnd');
  expect(land).toBeGreaterThan(1); // the landing comes while the boost is still on
  expect(boostEnd).toBeGreaterThan(land);
  expect(kinds.filter(kind => kind === 'jump')).toHaveLength(1);
  expect(kinds.filter(kind => kind === 'boostStart')).toHaveLength(1);
  expect(kinds.filter(kind => kind === 'boostEnd')).toHaveLength(1);
  expect(kinds.filter(kind => kind === 'land')).toHaveLength(1);
});
