// Layout D's pure values (SB-2155, revised SB-2157): the arcs' sweep, the ammo line, the number's tier, the aim mark's
// lock colour, the armour's shades, the boost's opacity and the hit's flash. Every boundary is fixed here.
import { expect, test } from 'vitest';
import { HUD_COLOR } from '../../src/data/colors.ts';
import {
  ammoLine,
  ammoTier,
  armorStage,
  boostOpacity,
  gaugeSweep,
  hitGlow,
  reticleColor,
} from '../../src/view/hudRing.ts';

test('gaugeSweep opens from nothing to the full arc and cuts the ends', () => {
  expect(gaugeSweep(-1, 96)).toBe(0);
  expect(gaugeSweep(0, 96)).toBe(0);
  expect(gaugeSweep(0.25, 96)).toBe(24);
  expect(gaugeSweep(0.5, 96)).toBe(48);
  expect(gaugeSweep(1, 96)).toBe(96);
  expect(gaugeSweep(2, 96)).toBe(96);
  expect(gaugeSweep(0.5, -10)).toBe(0);
});

test('ammoLine writes the main count with M and the sub count with S', () => {
  expect(ammoLine(120, 8)).toEqual({ main: 'M120', sub: 'S8' });
  expect(ammoLine(0, 0)).toEqual({ main: 'M0', sub: 'S0' });
  expect(ammoLine(399.6, 11.4)).toEqual({ main: 'M400', sub: 'S11' });
  expect(ammoLine(-5, -1)).toEqual({ main: 'M0', sub: 'S0' });
});

test('ammoTier is warn at a quarter exactly and empty at no rounds', () => {
  expect(ammoTier(101, 400, 0.25)).toBe('quiet');
  expect(ammoTier(100, 400, 0.25)).toBe('warn'); // the boundary itself
  expect(ammoTier(99, 400, 0.25)).toBe('warn');
  expect(ammoTier(1, 400, 0.25)).toBe('warn');
  expect(ammoTier(0, 400, 0.25)).toBe('empty');
  expect(ammoTier(400, 400, 0.25)).toBe('quiet');
  expect(ammoTier(500, 400, 0.25)).toBe('quiet');
});

test('reticleColor takes the lock colour only while locked', () => {
  expect(reticleColor(false)).toBe(HUD_COLOR.ring);
  expect(reticleColor(true)).toBe(HUD_COLOR.lock);
});

test('armorStage keeps the boundary values in the lower shade', () => {
  expect(armorStage(1, 0.6, 0.28)).toBe('high');
  expect(armorStage(0.61, 0.6, 0.28)).toBe('high');
  expect(armorStage(0.6, 0.6, 0.28)).toBe('mid');
  expect(armorStage(0.59, 0.6, 0.28)).toBe('mid');
  expect(armorStage(0.29, 0.6, 0.28)).toBe('mid');
  expect(armorStage(0.28, 0.6, 0.28)).toBe('low');
  expect(armorStage(0, 0.6, 0.28)).toBe('low');
});

test('boostOpacity is thin only while the gauge is exactly full', () => {
  expect(boostOpacity(1, 0.22, 0.85)).toBe(0.22);
  expect(boostOpacity(1.2, 0.22, 0.85)).toBe(0.22);
  expect(boostOpacity(0.999, 0.22, 0.85)).toBe(0.85); // any spent share is already clear
  expect(boostOpacity(0.5, 0.22, 0.85)).toBe(0.85);
  expect(boostOpacity(0, 0.22, 0.85)).toBe(0.85);
});

test('hitGlow is full at the hit, gone at the end, and full for a negative time', () => {
  expect(hitGlow(0, 0.35)).toBe(1);
  expect(hitGlow(-0.1, 0.35)).toBe(1);
  expect(hitGlow(0.175, 0.35)).toBeCloseTo(0.5, 10);
  expect(hitGlow(0.35, 0.35)).toBe(0);
  expect(hitGlow(1, 0.35)).toBe(0);
  expect(hitGlow(0, 0)).toBe(0);
});
