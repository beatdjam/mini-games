import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { FCS_TUNE } from '../../src/data/tune.ts';
import { fireRay, type Aabb } from '../../src/logic/fire.ts';
import { newFcs, spreadDir, stepFcs, type FcsTarget, type Ray3 } from '../../src/logic/fcs.ts';

const DEG = Math.PI / 180;
const CHEST = { x: 0, y: 5, z: 0 };

function boxAt(cx: number, cy: number, cz: number): Aabb {
  return { minX: cx - 2, maxX: cx + 2, minY: cy - 4, maxY: cy + 4, minZ: cz - 2, maxZ: cz + 2 };
}

function target(id: number, cx: number, cy: number, cz: number): FcsTarget {
  return { id, box: boxAt(cx, cy, cz), cx, cy, cz, alive: true };
}

function aimStraight(): Ray3 {
  return { ox: CHEST.x, oy: CHEST.y, oz: CHEST.z, dx: 0, dy: 0, dz: -1 };
}

// The aim turned `deg` around y from straight ahead (-z).
function aimTurned(deg: number): Ray3 {
  const a = deg * DEG;
  return { ox: CHEST.x, oy: CHEST.y, oz: CHEST.z, dx: Math.sin(a), dy: 0, dz: -Math.cos(a) };
}

function atAngle(deg: number, distance: number): { x: number; y: number; z: number } {
  const a = deg * DEG;
  return { x: Math.sin(a) * distance, y: CHEST.y, z: -Math.cos(a) * distance };
}

function angleDeg(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const la = Math.hypot(a.x, a.y, a.z);
  const lb = Math.hypot(b.x, b.y, b.z);
  const c = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb)));
  return Math.acos(c) / DEG;
}

const asVec = (d: { dx: number; dy: number; dz: number }): { x: number; y: number; z: number } => ({
  x: d.dx,
  y: d.dy,
  z: d.dz,
});

test('manual shoots where the aim line meets a target', () => {
  const t = target(0, 0, 4, -50);
  const result = stepFcs(newFcs(), 'manual', FCS_TUNE.manual, aimStraight(), CHEST, [t], 1 / 60);
  const hit = fireRay(
    CHEST.x,
    CHEST.y,
    CHEST.z,
    result.shotDir.dx,
    result.shotDir.dy,
    result.shotDir.dz,
    FCS_TUNE.manual.range,
    [t.box],
  );
  expect(hit).toBe(0);
});

test('manual misses when the target is off the aim line', () => {
  const t = target(0, 6, 4, -50);
  const result = stepFcs(newFcs(), 'manual', FCS_TUNE.manual, aimStraight(), CHEST, [t], 1 / 60);
  const hit = fireRay(
    CHEST.x,
    CHEST.y,
    CHEST.z,
    result.shotDir.dx,
    result.shotDir.dy,
    result.shotDir.dz,
    FCS_TUNE.manual.range,
    [t.box],
  );
  expect(hit).toBe(-1);
});

test('soft turns a shot to a target 5 degrees off within a second', () => {
  const centre = atAngle(5, 50);
  const t = target(0, centre.x, centre.y, centre.z);
  const state = newFcs();
  let result = stepFcs(state, 'soft', FCS_TUNE.soft, aimStraight(), CHEST, [t], 1 / 60);
  for (let i = 0; i < 60; i++) {
    result = stepFcs(state, 'soft', FCS_TUNE.soft, aimStraight(), CHEST, [t], 1 / 60);
  }
  const toTarget = { x: t.cx - CHEST.x, y: t.cy - CHEST.y, z: t.cz - CHEST.z };
  expect(angleDeg(asVec(result.shotDir), toTarget)).toBeLessThanOrEqual(1);
});

test('soft leaves a target outside the circle alone', () => {
  const centre = atAngle(10, 50);
  const t = target(0, centre.x, centre.y, centre.z);
  const state = newFcs();
  let result = stepFcs(state, 'soft', FCS_TUNE.soft, aimStraight(), CHEST, [t], 1 / 60);
  for (let i = 0; i < 60; i++) {
    result = stepFcs(state, 'soft', FCS_TUNE.soft, aimStraight(), CHEST, [t], 1 / 60);
  }
  const toTarget = { x: t.cx - CHEST.x, y: t.cy - CHEST.y, z: t.cz - CHEST.z };
  expect(angleDeg(asVec(result.shotDir), toTarget)).toBeGreaterThan(5);
});

function lockHard(t: FcsTarget, aim: Ray3, frames: number): ReturnType<typeof newFcs> {
  const state = newFcs();
  for (let i = 0; i < frames; i++) {
    stepFcs(state, 'hard', FCS_TUNE.hard, aim, CHEST, [t], 1 / 60);
  }
  return state;
}

test('hard catches a target that stays in the circle for lockTime', () => {
  const t = target(0, 0, 5, -50);
  const state = lockHard(t, aimStraight(), Math.ceil(FCS_TUNE.hard.lockTime * 60) + 1);
  expect(state.lockId).toBe(0);
});

test('hard with lockTime 0 catches on the first frame in the circle', () => {
  const t = target(0, 0, 5, -50);
  const state = newFcs();
  stepFcs(state, 'hard', { ...FCS_TUNE.hard, lockTime: 0 }, aimStraight(), CHEST, [t], 1 / 60);
  expect(state.lockId).toBe(0);
});

test('hard starts the lock over when the candidate changes', () => {
  const a = target(0, 0, 5, -50);
  const bCentre = atAngle(6, 50);
  const b = target(1, bCentre.x, bCentre.y, bCentre.z);
  const targets = [a, b];
  const state = newFcs();

  for (let i = 0; i < 15; i++) stepFcs(state, 'hard', FCS_TUNE.hard, aimStraight(), CHEST, targets, 1 / 60);
  expect(state.lockId).toBe(null);
  expect(state.lockCandidate).toBe(0);

  for (let i = 0; i < 16; i++) stepFcs(state, 'hard', FCS_TUNE.hard, aimTurned(6), CHEST, targets, 1 / 60);
  expect(state.lockCandidate).toBe(1);
  expect(state.lockId).toBe(null);

  for (let i = 0; i < 5; i++) stepFcs(state, 'hard', FCS_TUNE.hard, aimTurned(6), CHEST, targets, 1 / 60);
  expect(state.lockId).toBe(1);
});

test('hard keeps a caught target within breakCone and follows it', () => {
  const t = target(0, 0, 5, -50);
  const state = lockHard(t, aimStraight(), Math.ceil(FCS_TUNE.hard.lockTime * 60) + 1);
  expect(state.lockId).toBe(0);

  let result = stepFcs(state, 'hard', FCS_TUNE.hard, aimTurned(15), CHEST, [t], 1 / 60);
  for (let i = 0; i < 30; i++) result = stepFcs(state, 'hard', FCS_TUNE.hard, aimTurned(15), CHEST, [t], 1 / 60);

  expect(result.lockId).toBe(0);
  const toTarget = { x: t.cx - CHEST.x, y: t.cy - CHEST.y, z: t.cz - CHEST.z };
  expect(angleDeg(asVec(result.shotDir), toTarget)).toBeLessThanOrEqual(1);
});

test('hard drops a caught target past breakCone or when it goes down', () => {
  const t = target(0, 0, 5, -50);
  const state = lockHard(t, aimStraight(), Math.ceil(FCS_TUNE.hard.lockTime * 60) + 1);
  expect(state.lockId).toBe(0);

  const far = stepFcs(state, 'hard', FCS_TUNE.hard, aimTurned(25), CHEST, [t], 1 / 60);
  expect(far.lockId).toBe(null);

  const again = lockHard(t, aimStraight(), Math.ceil(FCS_TUNE.hard.lockTime * 60) + 1);
  expect(again.lockId).toBe(0);
  t.alive = false;
  const dead = stepFcs(again, 'hard', FCS_TUNE.hard, aimStraight(), CHEST, [t], 1 / 60);
  expect(dead.lockId).toBe(null);
});

test('hard turns the muzzle by at most trackRate in one frame', () => {
  const t = target(0, 0, 5, -50);
  const state = lockHard(t, aimStraight(), Math.ceil(FCS_TUNE.hard.lockTime * 60) + 1);
  expect(state.lockId).toBe(0);

  // Move the target 10 degrees to the side, still inside breakCone.
  const moved = atAngle(10, 50);
  t.cx = moved.x;
  t.cz = moved.z;
  t.box = boxAt(t.cx, t.cy, t.cz);
  const before = { x: state.muzzle.dx, y: state.muzzle.dy, z: state.muzzle.dz };

  stepFcs(state, 'hard', FCS_TUNE.hard, aimStraight(), CHEST, [t], 1 / 60);
  const after = { x: state.muzzle.dx, y: state.muzzle.dy, z: state.muzzle.dz };
  expect(angleDeg(before, after)).toBeLessThanOrEqual(FCS_TUNE.hard.trackRate / 60 + 1e-6);
});

test('spreadDir keeps every shot inside its cone', () => {
  const rng = createRng(1234);
  const dir = { dx: 0, dy: 0, dz: -1 };
  let moved = 0;
  for (let i = 0; i < 1000; i++) {
    const spread = spreadDir(dir, 3, rng);
    const angle = angleDeg(asVec(dir), asVec(spread));
    expect(angle).toBeLessThanOrEqual(3 + 1e-6);
    if (angle > 0.5) moved++;
  }
  expect(moved).toBeGreaterThan(900);
});
