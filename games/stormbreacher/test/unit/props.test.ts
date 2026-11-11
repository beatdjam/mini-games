// The size table: every prop and target kind has one entry, the hedgehog stands higher than a step, and the cover is
// tall enough to hide the mech.
import { expect, test } from 'vitest';
import { PROP_HP, PROP_SIZE, TARGET_SIZE } from '../../src/data/props.ts';
import { PROP_KINDS, TARGET_KINDS } from '../../src/data/types.ts';

test('the size table has every prop kind', () => {
  expect(Object.keys(PROP_SIZE).sort()).toEqual([...PROP_KINDS].sort());
});

test('the prop health table is positive for every blocking kind', () => {
  for (const kind of PROP_KINDS) {
    if (!PROP_SIZE[kind].blocks) continue;
    expect(PROP_HP[kind], kind).toBeGreaterThan(0);
  }
});

test('the size table has every target kind', () => {
  expect(Object.keys(TARGET_SIZE).sort()).toEqual([...TARGET_KINDS].sort());
});

test('the hedgehog is taller than a step', () => {
  expect(PROP_SIZE.hedgehog.h).toBeGreaterThan(1.5);
});

test('the cover hides the mech', () => {
  for (const kind of ['block', 'wreck', 'bunker'] as const) {
    expect(PROP_SIZE[kind].h, kind).toBeGreaterThanOrEqual(4);
  }
});
