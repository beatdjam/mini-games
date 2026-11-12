import { expect, test } from 'vitest';
import { M1_MECH, type MechBuild } from '../../src/data/mech.ts';
import { FEEL_TUNE, MOVE_TUNE } from '../../src/data/tune.ts';
import { moveTuneOf } from '../../src/logic/mechTune.ts';
import { newMech, stepMech, type MechEvent, type MechInput, type MechState } from '../../src/logic/mech.ts';
import type { MoveTune } from '../../src/data/tuneTypes.ts';

// 2 s walking, a jump, 1 s of boosting in the air and on the ground, then stopping (the same run as move.test.ts).
function inputAt(frame: number): MechInput {
  return {
    moveX: 0,
    moveZ: frame < 190 ? 1 : 0,
    turn: 0,
    jump: frame === 120,
    jumpHeld: false,
    boost: frame >= 130 && frame < 190,
    fire: false,
  };
}

function run(tune: MoveTune): { states: MechState[]; events: MechEvent[]; peak: number } {
  const mech = newMech();
  const states: MechState[] = [];
  const events: MechEvent[] = [];
  let peak = 0;
  for (let frame = 0; frame < 400; frame++) {
    events.push(...stepMech(mech, inputAt(frame), 1 / 60, tune, FEEL_TUNE.fireRate));
    states.push({ ...mech });
    peak = Math.max(peak, mech.y);
  }
  return { states, events, peak };
}

test("M1's mech moves frame for frame as MOVE_TUNE does", () => {
  const made = run(moveTuneOf(M1_MECH));
  const plain = run(MOVE_TUNE);
  expect(made.states).toEqual(plain.states);
  expect(made.events).toEqual(plain.events);
});

test('the other legs change the same run the way their gait says', () => {
  const withLegs = (legs: MechBuild['legs']) => run(moveTuneOf({ ...M1_MECH, legs }));
  const biped = run(MOVE_TUNE);
  const reverse = withLegs('reverseLegs');
  const multi = withLegs('quadLegs');
  expect(reverse.peak).toBeGreaterThan(biped.peak);
  expect(multi.peak).toBeLessThan(biped.peak);
  // the walk before the jump: reverse is ahead, multi behind
  expect(reverse.states[100].z).toBeLessThan(biped.states[100].z);
  expect(multi.states[100].z).toBeGreaterThan(biped.states[100].z);
});
