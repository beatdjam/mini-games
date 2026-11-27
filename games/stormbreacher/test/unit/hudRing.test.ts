// The aim marks' pure values (SB-2155, revised SB-2157 and SB-2158, shared by D-F in SB-2159): the arcs' sweep, the ammo
// bars' shares and cells, the bars' tier and colour, the empty blink, the aim mark's lock colour, the armour's shades, the
// boost's opacity, the hit's flash, and the reading each gauge keeps wherever a layout puts it. Every boundary is fixed
// here.
import { expect, test } from 'vitest';
import { HUD_COLOR } from '../../src/data/colors.ts';
import {
  ammoBlink,
  ammoCells,
  ammoColor,
  ammoFilled,
  ammoShare,
  ammoTier,
  arcLowEndIsStart,
  armorStage,
  boostOpacity,
  gaugeReading,
  gaugeSweep,
  hitGlow,
  reticleColor,
  type GaugeStyle,
  type GaugeValues,
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

test('ammoBlink is full at the start, dims to its least half a cycle later and is full again on the next', () => {
  expect(ammoBlink(0, 1, 0.5)).toBe(1);
  expect(ammoBlink(0.5, 1, 0.5)).toBeCloseTo(0.5, 10); // half of a 1s cycle: the least, never out
  expect(ammoBlink(1, 1, 0.5)).toBeCloseTo(1, 10);
  expect(ammoBlink(0.25, 1, 0.5)).toBeCloseTo(0.75, 10);
  expect(ammoBlink(0.5, 1, 0)).toBeCloseTo(0, 10); // a least of 0 goes out, as before
  expect(ammoBlink(1, 0, 0.5)).toBe(1); // no speed, no blink
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

const STYLE: GaugeStyle = {
  armorMid: 0.6,
  armorLow: 0.28,
  armorOpacity: 0.7,
  boostFullOpacity: 0.22,
  boostLowOpacity: 0.85,
  maxSegments: 16,
};
const VALUES: GaugeValues = {
  armor: 0.5,
  boost: 1,
  main: 100,
  mainMax: 400,
  sub: 8,
  subMax: 12,
  mainTier: 'warn',
  subTier: 'quiet',
  glow: 0,
};

test('gaugeReading gives a gauge the same look as an arc, a bar or cells', () => {
  expect(gaugeReading('armor', VALUES, STYLE)).toEqual({
    ratio: 0.5,
    color: HUD_COLOR.armorMid,
    opacity: 0.7,
    cells: 0,
    filled: 0,
    empty: false,
  });
  expect(gaugeReading('armor', { ...VALUES, glow: 0.5 }, STYLE).opacity).toBeCloseTo(0.85, 10);
  expect(gaugeReading('boost', VALUES, STYLE)).toEqual({
    ratio: 1,
    color: HUD_COLOR.bar,
    opacity: 0.22,
    cells: 0,
    filled: 0,
    empty: false,
  });
  expect(gaugeReading('main', VALUES, STYLE)).toEqual({
    ratio: 0.25,
    color: HUD_COLOR.amber,
    opacity: 1,
    cells: 0,
    filled: 0,
    empty: false,
  });
  expect(gaugeReading('sub', VALUES, STYLE)).toEqual({
    ratio: 8 / 12,
    color: HUD_COLOR.bar,
    opacity: 1,
    cells: 12,
    filled: 8,
    empty: false,
  });
});

test('gaugeReading keeps the ammo rules in the E arcs and the F bars', () => {
  // E: the main ammo is the left arc, so its share sets the sweep; red at empty.
  expect(gaugeReading('main', { ...VALUES, main: 0, mainTier: 'empty' }, STYLE)).toMatchObject({
    ratio: 0,
    color: HUD_COLOR.warn,
    empty: true,
    cells: 0,
  });
  // E: the sub ammo is the right arc, one cell a round up to 16 and a share past it.
  expect(gaugeReading('sub', { ...VALUES, sub: 12, subMax: 12 }, STYLE)).toMatchObject({ cells: 12, filled: 12 });
  expect(gaugeReading('sub', { ...VALUES, sub: 0, subMax: 12, subTier: 'empty' }, STYLE)).toMatchObject({
    cells: 12,
    filled: 0,
    color: HUD_COLOR.warn,
    empty: true,
  });
  expect(gaugeReading('sub', { ...VALUES, sub: 8, subMax: 17 }, STYLE)).toMatchObject({
    cells: 0,
    filled: 0,
    ratio: 8 / 17,
  });
  // F: both ammo bars take the same reading they would in D's bar and cells.
  expect(gaugeReading('main', VALUES, STYLE)).toMatchObject({ ratio: 0.25, color: HUD_COLOR.amber });
  expect(gaugeReading('sub', VALUES, STYLE)).toMatchObject({ cells: 12, filled: 8, color: HUD_COLOR.bar });
  // E: the armour bar keeps the shades and glow of D's arc, and the boost bar its thin full gauge.
  expect(gaugeReading('armor', { ...VALUES, armor: 0.28, glow: 0 }, STYLE).color).toBe(HUD_COLOR.armorLow);
  expect(gaugeReading('boost', { ...VALUES, boost: 0.999 }, STYLE).opacity).toBe(0.85);
});

test('both side arcs fill from their lower end on the screen, so they drain from the top alike', () => {
  const open = 96;
  // the right arc (middle 0): it starts above and sweeps down, so its lower end is the far one
  expect(arcLowEndIsStart(0 - open / 2, open)).toBe(false);
  // the left arc (middle 180): it starts below and sweeps up, so its lower end is the start
  expect(arcLowEndIsStart(180 - open / 2, open)).toBe(true);
});
