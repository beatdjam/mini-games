import { describe, expect, test } from 'vitest';
import { CHARGE_TUNE } from '../../src/data/charge.ts';
import type { BlastPlace } from '../../src/data/types.ts';
import { nearBlast, stepBlasts, stepCharge, type ChargeWorld } from '../../src/logic/blasts.ts';

const A: BlastPlace = { id: 'a', line: 0, x: 0, z: 0 };
const B: BlastPlace = { id: 'b', line: 0, x: 2, z: 0 };

function world(over: Partial<ChargeWorld> = {}): ChargeWorld {
  return {
    blasts: [A, B],
    charges: [],
    plant: null,
    mech: { x: 0, y: 0, z: 1, grounded: true },
    ...over,
  };
}

describe('nearBlast', () => {
  test('picks the nearest point within reach', () => {
    expect(nearBlast([A, B], [], { x: 1.6, z: 0 })?.id).toBe('b');
    expect(nearBlast([A, B], [], { x: 0.2, z: 0 })?.id).toBe('a');
  });

  test('reaches exactly to CHARGE_TUNE.reach and no farther', () => {
    const mech = { x: CHARGE_TUNE.reach, z: 0 };
    expect(nearBlast([A], [], mech)?.id).toBe('a');
    expect(nearBlast([A], [], { x: CHARGE_TUNE.reach + 0.01, z: 0 })).toBeNull();
  });

  test('leaves out a point that already has a charge and returns null when none is left', () => {
    expect(nearBlast([A, B], [{ blast: 'a', left: 1 }], { x: 0, z: 0 })?.id).toBe('b');
    expect(nearBlast([A], [{ blast: 'a', left: 1 }], { x: 0, z: 0 })).toBeNull();
  });
});

describe('stepCharge', () => {
  test('only a use on the ground inside reach counts', () => {
    const off = world();
    expect(stepCharge(off, false, 0.5).plant).toBeNull();
    expect(off.plant).toBeNull();

    const air = world({ mech: { x: 0, y: 0.2, z: 1, grounded: false } });
    expect(stepCharge(air, true, 0.5).plant).toBeNull();

    const above = world({ mech: { x: 0, y: 0.1, z: 1, grounded: true } });
    expect(stepCharge(above, true, 0.5).plant).toBeNull();

    const far = world({ mech: { x: 0, y: 0, z: CHARGE_TUNE.reach + 2, grounded: true } });
    expect(stepCharge(far, true, 0.5).plant).toBeNull();
  });

  test('holdSec plants the charge, takes the hold away and returns the point', () => {
    const left = world();
    const first = stepCharge(left, true, CHARGE_TUNE.holdSec - 0.1);
    expect(first.planted).toBeNull();
    expect(first.plant?.blast).toBe('a');
    expect(left.plant?.hold).toBeCloseTo(CHARGE_TUNE.holdSec - 0.1, 6);

    const done = stepCharge(left, true, 0.1);
    expect(done.plant).toBeNull();
    expect(done.planted?.id).toBe('a');
    expect(left.plant).toBeNull();
    expect(left.charges).toEqual([{ blast: 'a', left: CHARGE_TUNE.fuse }]);
  });

  test('letting use go, going into the air or leaving reach puts the hold back to zero', () => {
    for (const stop of [
      (w: ChargeWorld) => stepCharge(w, false, 0.2),
      (w: ChargeWorld) => {
        w.mech.grounded = false;
        return stepCharge(w, true, 0.2);
      },
      (w: ChargeWorld) => {
        w.mech.z = CHARGE_TUNE.reach + 3;
        return stepCharge(w, true, 0.2);
      },
    ]) {
      const w = world();
      stepCharge(w, true, 0.7);
      expect(w.plant?.hold).toBeCloseTo(0.7, 6);
      const after = stop(w);
      expect(after.plant).toBeNull();
      expect(w.plant).toBeNull();
    }
  });

  test('a hit is not an input, so it cannot put the hold back', () => {
    const w = world();
    stepCharge(w, true, 0.6);
    const held = w.plant?.hold ?? 0;
    // a hit only takes armour in game.ts; stepCharge is given use and dt, so the hold goes on
    const after = stepCharge(w, true, 0.2);
    expect(after.plant?.hold).toBeCloseTo(held + 0.2, 6);
  });

  test('the same world and input give the same result', () => {
    const one = world();
    const two = world();
    for (let i = 0; i < 20; i++) {
      expect(stepCharge(one, true, 0.1)).toEqual(stepCharge(two, true, 0.1));
    }
  });
});

describe('stepBlasts', () => {
  test('counts the fuse down and returns the point as the charge goes', () => {
    const w = { charges: [{ blast: 'a', left: 0.3 }], blasts: [A, B], mech: { x: 0, z: 0 } };
    expect(stepBlasts(w, 0.2)).toEqual([]);
    expect(w.charges[0].left).toBeCloseTo(0.1, 6);
    expect(stepBlasts(w, 0.2)).toEqual([{ blast: A, hit: true }]);
    expect(w.charges).toEqual([]);
  });

  test('hit is whether the mech stands inside blastRadius', () => {
    const near = { charges: [{ blast: 'a', left: 0 }], blasts: [A], mech: { x: CHARGE_TUNE.blastRadius, z: 0 } };
    expect(stepBlasts(near, 0)[0].hit).toBe(true);
    const far = {
      charges: [{ blast: 'a', left: 0 }],
      blasts: [A],
      mech: { x: CHARGE_TUNE.blastRadius + 0.01, z: 0 },
    };
    expect(stepBlasts(far, 0)[0].hit).toBe(false);
  });
});
