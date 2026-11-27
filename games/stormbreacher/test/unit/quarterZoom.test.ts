import { expect, test } from 'vitest';
import type { EnemyKind } from '../../src/data/enemies.ts';
import { QUARTER_TUNE } from '../../src/data/tune.ts';
import type { TargetKind } from '../../src/data/types.ts';
import { newEnemy, type EnemyState } from '../../src/logic/enemies.ts';
import type { GameModel, TargetState } from '../../src/logic/game.ts';
import { stepZoom, wantsWide, zoomedTune } from '../../src/logic/quarterZoom.ts';
import { quarterPose } from '../../src/view/quarterCamera.ts';

const MECH = { x: 0, y: 0, z: 0 };

// The game as `wantsWide` reads it: the mech at the origin and the enemies and targets given.
function gameAt(enemies: EnemyState[], targets: TargetState[] = []): Pick<GameModel, 'mech' | 'enemies' | 'targets'> {
  return { mech: MECH, enemies, targets } as unknown as Pick<GameModel, 'mech' | 'enemies' | 'targets'>;
}

// A target whose box is `w` by `d` on the ground, centred at (x, z).
function targetAt(kind: TargetKind, x: number, z: number, w: number, d: number, hp = 100): TargetState {
  return {
    id: kind,
    kind,
    hp,
    box: { minX: x - w / 2, maxX: x + w / 2, minY: 0, maxY: 8, minZ: z - d / 2, maxZ: z + d / 2 },
    yaw: 0,
  };
}

test('a living large enemy inside the range pulls the camera back', () => {
  expect(wantsWide(gameAt([newEnemy('e-1', 'w', 'emplacement', 0, -QUARTER_TUNE.zoomRange)]), QUARTER_TUNE)).toBe(true);
  expect(wantsWide(gameAt([newEnemy('w-1', 'w', 'warden', QUARTER_TUNE.zoomRange, 0)]), QUARTER_TUNE)).toBe(true);
  // the edge counts
  expect(wantsWide(gameAt([newEnemy('e-1', 'w', 'emplacement', 0, QUARTER_TUNE.zoomRange)]), QUARTER_TUNE)).toBe(true);
});

test('a large enemy outside the range or fallen does not pull the camera back', () => {
  const far = newEnemy('e-1', 'w', 'emplacement', 0, -(QUARTER_TUNE.zoomRange + 1));
  expect(wantsWide(gameAt([far]), QUARTER_TUNE)).toBe(false);
  const fallen = newEnemy('e-1', 'w', 'emplacement', 0, -1);
  fallen.hp = 0;
  expect(wantsWide(gameAt([fallen]), QUARTER_TUNE)).toBe(false);
});

test('the small soldiers leave the camera as it is, however near they are', () => {
  const kinds: EnemyKind[] = ['grunt', 'assault', 'heavy'];
  const soldiers = kinds.map((kind, index) => newEnemy(`${kind}-1`, 'w', kind, index, 0));
  expect(wantsWide(gameAt(soldiers), QUARTER_TUNE)).toBe(false);
});

test('a large target inside the range pulls the camera back, measured to the box', () => {
  // the gun is 14 m deep: its centre is 95 m away but its near face is 88 m away, inside the 90 m range
  expect(wantsWide(gameAt([], [targetAt('gun', 0, -(QUARTER_TUNE.zoomRange + 5), 14, 14)]), QUARTER_TUNE)).toBe(true);
  // the fortress gun is 6 m deep: its centre is 92 m away and its near face 89 m away
  expect(wantsWide(gameAt([], [targetAt('fortressGun', 0, -(QUARTER_TUNE.zoomRange + 2), 16, 6)]), QUARTER_TUNE)).toBe(
    true,
  );
  // a target whose whole box is past the range does not count
  expect(wantsWide(gameAt([], [targetAt('gun', 0, -(QUARTER_TUNE.zoomRange + 8), 14, 14)]), QUARTER_TUNE)).toBe(false);
});

test('a broken large target or a pillbox, depot or magazine leaves the camera as it is', () => {
  const broken = targetAt('gun', 0, -10, 14, 14, 0);
  expect(wantsWide(gameAt([], [broken]), QUARTER_TUNE)).toBe(false);
  for (const kind of ['pillbox', 'depot', 'magazine'] as const) {
    expect(wantsWide(gameAt([], [targetAt(kind, 0, -10, 14, 14)]), QUARTER_TUNE)).toBe(false);
  }
});

test('stepZoom rises to zoomScale and settles there without passing it', () => {
  let zoom = 1;
  let previous = zoom;
  for (let i = 0; i < 300; i++) {
    zoom = stepZoom(zoom, true, 1 / 60, QUARTER_TUNE);
    expect(zoom).toBeGreaterThanOrEqual(previous);
    expect(zoom).toBeLessThanOrEqual(QUARTER_TUNE.zoomScale);
    previous = zoom;
  }
  expect(zoom).toBeCloseTo(QUARTER_TUNE.zoomScale, 3);
});

test('stepZoom comes back to 1 without going below it', () => {
  let zoom = QUARTER_TUNE.zoomScale;
  let previous = zoom;
  for (let i = 0; i < 300; i++) {
    zoom = stepZoom(zoom, false, 1 / 60, QUARTER_TUNE);
    expect(zoom).toBeLessThanOrEqual(previous);
    expect(zoom).toBeGreaterThanOrEqual(1);
    previous = zoom;
  }
  expect(zoom).toBeCloseTo(1, 3);
});

test('stepZoom moves the same amount at 30 and 60 frames a second', () => {
  let at60 = 1;
  for (let i = 0; i < 4; i++) at60 = stepZoom(at60, true, 1 / 60, QUARTER_TUNE);
  const at30 = stepZoom(stepZoom(1, true, 1 / 30, QUARTER_TUNE), true, 1 / 30, QUARTER_TUNE);
  expect(at30).toBeCloseTo(at60, 9);
});

test('stepZoom jumps with no lag and holds with no time', () => {
  expect(stepZoom(1, true, 1 / 60, { ...QUARTER_TUNE, zoomLag: 0 })).toBe(QUARTER_TUNE.zoomScale);
  expect(stepZoom(1, false, 1 / 60, { ...QUARTER_TUNE, zoomLag: 0 })).toBe(1);
  const still = 1.2;
  expect(stepZoom(still, true, 0, QUARTER_TUNE)).toBe(still);
});

test('zoomedTune grows height and back by the scale and leaves the rest', () => {
  const scale = QUARTER_TUNE.zoomScale;
  const zoomed = zoomedTune(QUARTER_TUNE, scale);
  expect(zoomed.height).toBeCloseTo(QUARTER_TUNE.height * scale, 9);
  expect(zoomed.back).toBeCloseTo(QUARTER_TUNE.back * scale, 9);
  expect(zoomed.azimuth).toBe(QUARTER_TUNE.azimuth);
  expect(zoomed.lead).toBe(QUARTER_TUNE.lead);
  expect(zoomed.lookHeight).toBe(QUARTER_TUNE.lookHeight);
  expect(zoomed.fov).toBe(QUARTER_TUNE.fov);
  expect(zoomed.lag).toBe(QUARTER_TUNE.lag);
  expect(zoomed.zoomScale).toBe(QUARTER_TUNE.zoomScale);
  expect(zoomed.zoomRange).toBe(QUARTER_TUNE.zoomRange);
  expect(zoomed.zoomLag).toBe(QUARTER_TUNE.zoomLag);
  // the tune passed in is not changed
  expect(QUARTER_TUNE.height).toBe(25);
  expect(QUARTER_TUNE.back).toBe(20);
});

test('the zoomed pose keeps the look point and moves the camera out by the scale', () => {
  const base = quarterPose(MECH, QUARTER_TUNE);
  const zoomed = quarterPose(MECH, zoomedTune(QUARTER_TUNE, 1.2));
  expect(zoomed.look.distanceTo(base.look)).toBeLessThan(1e-9);
  expect(zoomed.pos.y - zoomed.look.y).toBeCloseTo((base.pos.y - base.look.y) * 1.2, 9);
  const horizontal = (pose: { pos: { x: number; z: number }; look: { x: number; z: number } }): number =>
    Math.hypot(pose.pos.x - pose.look.x, pose.pos.z - pose.look.z);
  expect(horizontal(zoomed)).toBeCloseTo(horizontal(base) * 1.2, 9);
  // the look keeps its lead from the mech
  expect(zoomed.look.x).toBeCloseTo(base.look.x, 9);
  expect(zoomed.look.z).toBeCloseTo(base.look.z, 9);
});
