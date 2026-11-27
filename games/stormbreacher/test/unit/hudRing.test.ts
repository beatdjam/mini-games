// Layout D's pure values (SB-2155, revised SB-2157 and SB-2158): the arcs' sweep, the ammo bars' shares and cells, the
// bars' tier and colour, the empty blink, the aim mark's lock colour, the armour's shades, the boost's opacity and the
// hit's flash. Every boundary is fixed here.
import { expect, test } from 'vitest';
import { HUD_COLOR } from '../../src/data/colors.ts';
import {
  ammoBlink,
  ammoCells,
  ammoColor,
  ammoFilled,
  ammoShare,
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

test('ammoShare is the share left, cut to 0-1 and empty without a maximum', () => {
  expect(ammoShare(400, 400)).toBe(1);
  expect(ammoShare(100, 400)).toBe(0.25);
  expect(ammoShare(0, 400)).toBe(0);
  expect(ammoShare(500, 400)).toBe(1);
  expect(ammoShare(-1, 400)).toBe(0);
  expect(ammoShare(5, 0)).toBe(0);
});

test('ammoCells gives one cell a round up to the limit and none past it', () => {
  expect(ammoCells(0, 16)).toBe(0);
  expect(ammoCells(12, 16)).toBe(12);
  expect(ammoCells(16, 16)).toBe(16); // the limit itself still has cells
  expect(ammoCells(17, 16)).toBe(0); // past it the bar shows one length instead
  expect(ammoCells(400, 16)).toBe(0);
  expect(ammoCells(12.4, 16)).toBe(12);
  expect(ammoCells(-2, 16)).toBe(0);
});

test('ammoFilled lights the rounds left, up to the whole magazine', () => {
  expect(ammoFilled(8, 12, 16)).toBe(8);
  expect(ammoFilled(0, 12, 16)).toBe(0);
  expect(ammoFilled(12, 12, 16)).toBe(12);
  expect(ammoFilled(13, 12, 16)).toBe(12);
  expect(ammoFilled(-1, 12, 16)).toBe(0);
  expect(ammoFilled(400, 400, 16)).toBe(0); // no cells, so the caller uses the share
  expect(ammoFilled(5, 0, 16)).toBe(0);
});

test('ammoColor keeps the gauge colour while quiet and warns amber then red', () => {
  expect(ammoColor('quiet')).toBe(HUD_COLOR.bar);
  expect(ammoColor('warn')).toBe(HUD_COLOR.amber);
  expect(ammoColor('empty')).toBe(HUD_COLOR.warn);
});

test('ammoBlink is full at the start, dark half a cycle later and full again on the next', () => {
  expect(ammoBlink(0, 2.5)).toBe(1);
  expect(ammoBlink(0.2, 2.5)).toBeCloseTo(0, 10); // half of a 0.4s cycle
  expect(ammoBlink(0.4, 2.5)).toBeCloseTo(1, 10);
  expect(ammoBlink(0.1, 2.5)).toBeCloseTo(0.5, 10);
  expect(ammoBlink(1, 0)).toBe(1); // no speed, no blink
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
