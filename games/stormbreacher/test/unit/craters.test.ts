import { expect, test } from 'vitest';
import { createRng, distXZ } from '@engine/core/index.ts';
import { PROP_SIZE, TARGET_SIZE } from '../../src/data/props.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { FX_TUNE, type FxTune } from '../../src/data/tune.ts';
import type { PropKind, TargetKind } from '../../src/data/types.ts';
import { MECH_CLEAR, addShellCrater, scatterCraters, type Crater } from '../../src/logic/craters.ts';

const START = { x: 0, z: M1B_HAND.bounds.maxZ - 4 };
const COUNT = 20;

function tuneWith(changes: Partial<FxTune>): FxTune {
  return { ...FX_TUNE, ...changes };
}

function propRadius(kind: PropKind, scale: number): number {
  const size = PROP_SIZE[kind];
  return Math.hypot(size.w * scale, size.d * scale) / 2;
}

function targetRadius(kind: TargetKind): number {
  const size = TARGET_SIZE[kind];
  return Math.hypot(size.w, size.d) / 2;
}

test('the same seed scatters the same holes', () => {
  const tune = tuneWith({ craters: COUNT });
  const first = scatterCraters(createRng(7), M1B_HAND, tune, START);
  const second = scatterCraters(createRng(7), M1B_HAND, tune, START);
  expect(first).toEqual(second);
});

test('the map gets as many holes as the tune asks for', () => {
  const craters = scatterCraters(createRng(1), M1B_HAND, tuneWith({ craters: COUNT }), START);
  expect(craters).toHaveLength(COUNT);
});

test('the holes stay clear of the props, the targets and the mech start', () => {
  const craters = scatterCraters(
    createRng(2),
    M1B_HAND,
    tuneWith({ craters: COUNT, craterMin: 3, craterMax: 8 }),
    START,
  );
  for (const crater of craters) {
    expect(distXZ(crater, START)).toBeGreaterThanOrEqual(MECH_CLEAR + crater.radius);
    for (const prop of M1B_HAND.props) {
      if (prop.kind === 'tile') continue;
      expect(distXZ(crater, prop)).toBeGreaterThanOrEqual(propRadius(prop.kind, prop.scale) + crater.radius);
    }
    for (const target of M1B_HAND.targets) {
      expect(distXZ(crater, target)).toBeGreaterThanOrEqual(targetRadius(target.kind) + crater.radius);
    }
  }
});

test('a water share of 0 leaves every hole dry', () => {
  const craters = scatterCraters(createRng(3), M1B_HAND, tuneWith({ craters: COUNT, craterWater: 0 }), START);
  expect(craters).toHaveLength(COUNT);
  expect(craters.every(crater => !crater.water)).toBe(true);
});

test('a water share of 1 fills every hole', () => {
  const craters = scatterCraters(createRng(4), M1B_HAND, tuneWith({ craters: COUNT, craterWater: 1 }), START);
  expect(craters).toHaveLength(COUNT);
  expect(craters.every(crater => crater.water)).toBe(true);
});

test('a shell hole drops the oldest once the cap is full', () => {
  const list: Crater[] = [];
  const hole = (x: number): Crater => ({ x, z: 0, radius: 3, water: false });
  addShellCrater(list, hole(1), 2);
  addShellCrater(list, hole(2), 2);
  addShellCrater(list, hole(3), 2);
  expect(list.map(crater => crater.x)).toEqual([2, 3]);

  addShellCrater(list, hole(4), 0);
  expect(list).toEqual([]);
});
