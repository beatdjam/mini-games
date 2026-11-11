import { expect, test } from 'vitest';
import { FEEL_TUNE, MOVE_TUNE } from '../../src/data/tune.ts';
import { newMech, stepMech, type MechEvent, type MechInput } from '../../src/logic/mech.ts';

const FRAMES = 400;

// 2 s walking, a jump, 1 s of boosting in the air and on the ground, then stopping; every step is a 60th of a second.
function inputAt(frame: number): MechInput {
  const jumping = frame === 120;
  const boosting = frame >= 130 && frame < 190;
  const moving = frame < 190;
  return {
    moveX: 0,
    moveZ: moving ? 1 : 0,
    turn: 0,
    jump: jumping,
    jumpHeld: false,
    boost: boosting,
    fire: false,
  };
}

// Jump on the first frame, hold the jump key for half a second, then let it go and land.
function hoverInputAt(frame: number): MechInput {
  return {
    moveX: 0,
    moveZ: 0,
    turn: 0,
    jump: frame === 0,
    jumpHeld: frame < 30,
    boost: false,
    fire: false,
  };
}

function hoverRun(): { mech: ReturnType<typeof newMech>; events: MechEvent[]; landFrame: number } {
  const mech = newMech();
  const events: MechEvent[] = [];
  let landFrame = -1;
  for (let frame = 0; frame < 240; frame++) {
    const frameEvents = stepMech(mech, hoverInputAt(frame), 1 / 60, MOVE_TUNE, FEEL_TUNE.fireRate);
    if (landFrame < 0 && frameEvents.some(event => event.kind === 'land')) landFrame = frame;
    events.push(...frameEvents);
  }
  return { mech, events, landFrame };
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

test('a jump held for half a second hovers, then lets go and lands once, the same twice', () => {
  const a = hoverRun();
  const b = hoverRun();
  expect(a.mech.x).toBeCloseTo(b.mech.x, 10);
  expect(a.mech.y).toBeCloseTo(b.mech.y, 10);
  expect(a.mech.z).toBeCloseTo(b.mech.z, 10);
  expect(a.mech.gauge).toBeCloseTo(b.mech.gauge, 10);

  const kinds = a.events.map(event => event.kind);
  expect(kinds.filter(kind => kind === 'jump')).toHaveLength(1);
  expect(kinds.filter(kind => kind === 'hoverStart')).toHaveLength(1);
  expect(kinds.filter(kind => kind === 'hoverEnd')).toHaveLength(1);
  expect(kinds.filter(kind => kind === 'land')).toHaveLength(1);
  expect(a.landFrame).toBeGreaterThan(30); // still in the air when the key is let go
  expect(b.landFrame).toBe(a.landFrame);
});
