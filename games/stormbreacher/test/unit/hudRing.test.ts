// Layout D's pure values (SB-2155): the ammo arc, the sub ammo's dots, the number's tier, the lock ring, the armour's
// shades, the boost's opacity, the ground ring's halves and the hit's glow. Every boundary is fixed here.
import { expect, test } from 'vitest';
import { HUD_COLOR } from '../../src/data/colors.ts';
import { QUARTER_TUNE } from '../../src/data/tune.ts';
import {
  ammoTier,
  arcSweep,
  armorStage,
  boostOpacity,
  groundHalves,
  hitGlow,
  reticleRing,
  subDots,
} from '../../src/view/hudRing.ts';

test('arcSweep goes from nothing to a full turn and cuts the ends', () => {
  expect(arcSweep(-1)).toBe(0);
  expect(arcSweep(0)).toBe(0);
  expect(arcSweep(0.25)).toBe(90);
  expect(arcSweep(0.5)).toBe(180);
  expect(arcSweep(1)).toBe(360);
  expect(arcSweep(2)).toBe(360);
});

test('subDots gives a magazine no larger than the room one dot a round', () => {
  expect(subDots(12, 12, 12)).toEqual({ lit: 12, count: 12 });
  expect(subDots(5, 12, 12)).toEqual({ lit: 5, count: 12 });
  expect(subDots(0, 12, 12)).toEqual({ lit: 0, count: 12 });
  expect(subDots(15, 12, 12)).toEqual({ lit: 12, count: 12 });
});

test('subDots thins a larger magazine by share and keeps one dot while a round is left', () => {
  expect(subDots(400, 400, 12)).toEqual({ lit: 12, count: 12 });
  expect(subDots(200, 400, 12)).toEqual({ lit: 6, count: 12 });
  expect(subDots(24, 400, 12)).toEqual({ lit: 1, count: 12 });
  expect(subDots(16, 400, 12)).toEqual({ lit: 1, count: 12 }); // 0.48 rounds to 0, but a round is left
  expect(subDots(1, 400, 12)).toEqual({ lit: 1, count: 12 });
  expect(subDots(0, 400, 12)).toEqual({ lit: 0, count: 12 });
});

test('subDots draws nothing without room or a magazine', () => {
  expect(subDots(5, 12, 0)).toEqual({ lit: 0, count: 0 });
  expect(subDots(5, 0, 12)).toEqual({ lit: 0, count: 0 });
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

test('reticleRing shrinks and takes the lock colour while locked', () => {
  expect(reticleRing(false, 22, 14)).toEqual({ radius: 22, color: HUD_COLOR.ring });
  expect(reticleRing(true, 22, 14)).toEqual({ radius: 14, color: HUD_COLOR.lock });
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
  expect(boostOpacity(1, 0.22, 0.8)).toBe(0.22);
  expect(boostOpacity(1.2, 0.22, 0.8)).toBe(0.22);
  expect(boostOpacity(0.999, 0.22, 0.8)).toBe(0.8); // any spent share is already clear
  expect(boostOpacity(0.5, 0.22, 0.8)).toBe(0.8);
  expect(boostOpacity(0, 0.22, 0.8)).toBe(0.8);
});

// The halves turn only with the screen's azimuth; the ring keeps them because buildMechRing sets them once and
// drawMechRing never turns the ring with the mech.
test('groundHalves puts the left half at azimuth + PI, from the azimuth alone', () => {
  // The screen's left on the ground is (+upZ, -upX) = (-cos az, sin az). A ring vertex at theta lies toward
  // (cos theta, -sin theta), so theta = az + PI is the screen's left.
  const check = (azimuth: number): void => {
    const halves = groundHalves(azimuth);
    expect(halves.left).toBeCloseTo((((azimuth + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), 10);
    expect(halves.right).toBeCloseTo(((azimuth % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), 10);
    expect(Math.cos(halves.left)).toBeCloseTo(-Math.cos(azimuth), 10);
    expect(-Math.sin(halves.left)).toBeCloseTo(Math.sin(azimuth), 10);
    // the two halves look opposite ways, and the function has no mech yaw to turn with
    expect(Math.cos(halves.right - halves.left)).toBeCloseTo(-1, 10);
  };
  check(QUARTER_TUNE.azimuth);
  check(0);
  check(-Math.PI / 2);
});

test('hitGlow is full at the hit, gone at the end, and full for a negative time', () => {
  expect(hitGlow(0, 0.35)).toBe(1);
  expect(hitGlow(-0.1, 0.35)).toBe(1);
  expect(hitGlow(0.175, 0.35)).toBeCloseTo(0.5, 10);
  expect(hitGlow(0.35, 0.35)).toBe(0);
  expect(hitGlow(1, 0.35)).toBe(0);
  expect(hitGlow(0, 0)).toBe(0);
});
