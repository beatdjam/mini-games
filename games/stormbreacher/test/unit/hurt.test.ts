import { expect, test } from 'vitest';
import { HURT_TUNE } from '../../src/data/tune.ts';
import { armorLoss, hurtAngle, hurtEdge } from '../../src/view/hurt.ts';

// (fromX, fromZ) is the way from the mech toward the shot's source, as the `damaged` event carries it. The mech starts
// facing -z and its right is +x, so front is (0, -1), right (1, 0), back (0, 1) and left (-1, 0).
test('the edge direction is the way a shot came from, from the mech’s front and to the right', () => {
  expect(hurtAngle(0, -1, 0)).toBeCloseTo(0);
  expect(hurtAngle(1, 0, 0)).toBeCloseTo(90);
  expect(hurtAngle(0, 1, 0)).toBeCloseTo(180);
  expect(hurtAngle(-1, 0, 0)).toBeCloseTo(270);
});

test('the edge direction turns with the mech’s yaw', () => {
  const yaw = Math.PI / 2; // facing -x, so the right is -z and the left is +z
  expect(hurtAngle(-1, 0, yaw)).toBeCloseTo(0);
  expect(hurtAngle(0, -1, yaw)).toBeCloseTo(90);
  expect(hurtAngle(1, 0, yaw)).toBeCloseTo(180);
  expect(hurtAngle(0, 1, yaw)).toBeCloseTo(270);
});

test('the eight edges are centred on the front, the right, the back and the left', () => {
  expect(hurtEdge(0)).toBe(0);
  expect(hurtEdge(45)).toBe(1);
  expect(hurtEdge(90)).toBe(2);
  expect(hurtEdge(180)).toBe(4);
  expect(hurtEdge(270)).toBe(6);
  expect(hurtEdge(315)).toBe(7);
  expect(hurtEdge(350)).toBe(0);
  expect(hurtEdge(-90)).toBe(6);
});

test('the edge darkens only below the armour the table names, and most at no armour', () => {
  expect(armorLoss(HURT_TUNE.armorDarkFrom, HURT_TUNE)).toBe(0);
  expect(armorLoss(1, HURT_TUNE)).toBe(0);
  expect(armorLoss(HURT_TUNE.armorDarkFrom / 2, HURT_TUNE)).toBeCloseTo(0.5);
  expect(armorLoss(0, HURT_TUNE)).toBe(1);
  expect(armorLoss(-1, HURT_TUNE)).toBe(1);
});
