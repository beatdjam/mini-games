import { expect, test } from 'vitest';
import { BASE_LIGHTS, LOOKS, lookOf, type LookTune } from '../../src/data/looks.ts';
import { FX_TUNE } from '../../src/data/tune.ts';

const LOOK_KEYS: readonly (keyof LookTune)[] = [
  'pixel',
  'saturate',
  'contrast',
  'sepia',
  'haze',
  'fogColor',
  'skyColor',
  'light',
  'sun',
  'groundColor',
];

test('every look keeps its values in range', () => {
  for (const id of Object.keys(LOOKS)) {
    const look = lookOf(id);
    expect(look.pixel).toBeGreaterThan(0);
    expect(look.pixel).toBeLessThanOrEqual(1);
    expect(look.saturate).toBeGreaterThan(0);
    expect(look.contrast).toBeGreaterThan(0);
    expect(look.light).toBeGreaterThan(0);
    expect(look.sepia).toBeGreaterThanOrEqual(0);
    expect(look.sepia).toBeLessThanOrEqual(1);
    expect(look.haze).toBeGreaterThanOrEqual(0);
    expect(look.haze).toBeLessThanOrEqual(0.9);
    expect(look.sun).toBeGreaterThanOrEqual(0);
  }
});

test('the M1 look is the middle strength of the effects', () => {
  const look = lookOf('m1');
  for (const key of LOOK_KEYS) expect(look[key]).toBe(FX_TUNE[key]);
});

test('a row changes only what it names', () => {
  const changed = lookOf('x', { x: { light: 0.3 } });
  expect(changed.light).toBe(0.3);
  for (const key of LOOK_KEYS) if (key !== 'light') expect(changed[key]).toBe(FX_TUNE[key]);

  const missing = lookOf('none');
  for (const key of LOOK_KEYS) expect(missing[key]).toBe(FX_TUNE[key]);
});

test('the base lights add up to the old two pairs', () => {
  // engine: hemisphere 1.0 and sun 0.45; field.ts: hemisphere 0.9 and sun 0.8
  expect(BASE_LIGHTS.hemi).toBe(1.9);
  expect(BASE_LIGHTS.sun).toBe(1.25);
});
