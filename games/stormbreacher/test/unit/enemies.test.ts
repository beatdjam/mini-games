import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { ENEMIES } from '../../src/data/enemies.ts';
import { rectBox, rectDistance, type GroundRect } from '../../src/logic/collide.ts';
import { newEnemy, stepEnemy, type EnemyShot, type EnemyState, type EnemyWorld } from '../../src/logic/enemies.ts';
import type { Aabb } from '../../src/logic/fire.ts';
import { buildNavField, buildNavGrid } from '../../src/logic/nav.ts';

const DT = 1 / 60;
const GRUNT = ENEMIES.grunt;
const OPEN: EnemyWorld = {
  rects: [],
  propBoxes: [],
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  nav: null,
  others: [],
};

// The mech's feet at (x, z) on the ground.
const mechAt = (x: number, z: number): { x: number; y: number; z: number } => ({ x, y: 0, z });

const distTo = (e: { x: number; z: number }, m: { x: number; z: number }): number => Math.hypot(e.x - m.x, e.z - m.z);

test('an enemy beyond the notice distance sleeps: it does not move or shoot', () => {
  const enemy = newEnemy('w-1', 'w', 'grunt', 0, -(GRUNT.notice + 10));
  const mech = mechAt(0, 0);
  for (let i = 0; i < 600; i++) expect(stepEnemy(enemy, mech, OPEN, DT, createRng(1))).toBeNull();
  expect(enemy.awake).toBe(false);
  expect(enemy.x).toBe(0);
  expect(enemy.z).toBe(-(GRUNT.notice + 10));
});

test('the mech coming within the notice distance wakes the enemy, and it stays awake', () => {
  const enemy = newEnemy('w-1', 'w', 'grunt', 0, -(GRUNT.notice - 10));
  const mech = mechAt(0, 0);
  stepEnemy(enemy, mech, OPEN, DT, createRng(1));
  expect(enemy.awake).toBe(true);
  expect(enemy.z).toBeGreaterThan(-(GRUNT.notice - 10));
  // the mech runs far off; the enemy does not go back to sleep and keeps walking toward it
  const far = mechAt(0, 400);
  const before = enemy.z;
  stepEnemy(enemy, far, OPEN, DT, createRng(1));
  expect(enemy.awake).toBe(true);
  expect(enemy.z).toBeGreaterThan(before);
});

test('an awake enemy faces the mech', () => {
  const enemy = newEnemy('w-1', 'w', 'grunt', 30, -60);
  enemy.awake = true;
  const mech = mechAt(0, 0);
  stepEnemy(enemy, mech, OPEN, DT, createRng(1));
  // the mech's front is (-sin yaw, -cos yaw), and the enemy's front points at the mech
  const front = { x: -Math.sin(enemy.yaw), z: -Math.cos(enemy.yaw) };
  const to = { x: mech.x - enemy.x, z: mech.z - enemy.z };
  const length = Math.hypot(to.x, to.z);
  expect(front.x).toBeCloseTo(to.x / length, 6);
  expect(front.z).toBeCloseTo(to.z / length, 6);
});

test('it walks at its speed and stops at the stopping distance', () => {
  const enemy = newEnemy('w-1', 'w', 'grunt', 0, -100);
  const mech = mechAt(0, 0);
  stepEnemy(enemy, mech, OPEN, DT, createRng(1));
  expect(100 - distTo(enemy, mech)).toBeCloseTo(GRUNT.speed * DT, 6);
  for (let i = 0; i < 1800; i++) {
    stepEnemy(enemy, mech, OPEN, DT, createRng(1));
    expect(distTo(enemy, mech)).toBeGreaterThanOrEqual(GRUNT.stopDist - 1e-9);
  }
  expect(distTo(enemy, mech)).toBeCloseTo(GRUNT.stopDist, 6);
});

test('a wall turns the walk into a slide along it, and the enemy never stands inside the wall', () => {
  // a long wall across the way to the mech, which is a little to the left of straight ahead
  const wall: GroundRect = { x: 0, z: -20, halfW: 15, halfD: 1, yaw: 0, top: 6 };
  const world: EnemyWorld = { ...OPEN, rects: [wall] };
  const enemy = newEnemy('w-1', 'w', 'grunt', 10, -10);
  const mech = mechAt(0, -100);
  for (let i = 0; i < 300; i++) {
    stepEnemy(enemy, mech, world, DT, createRng(1));
    expect(rectDistance(wall, enemy.x, enemy.z)).toBeGreaterThanOrEqual(GRUNT.radius - 1e-9);
  }
  // it stands on this side of the wall (z -19 is the wall's face), slid toward the mech's side along it
  expect(enemy.z).toBeGreaterThan(-19);
  expect(enemy.x).toBeLessThan(9);
});

test('an enemy stays inside the map', () => {
  const world: EnemyWorld = { ...OPEN, bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };
  const enemy = newEnemy('w-1', 'w', 'grunt', 40, 0);
  enemy.awake = true;
  const mech = mechAt(200, 0);
  for (let i = 0; i < 600; i++) stepEnemy(enemy, mech, world, DT, createRng(1));
  expect(enemy.x).toBeCloseTo(50 - GRUNT.radius, 6);
});

// Runs `seconds` of frames with the enemy awake at `dist` from a mech at the origin; returns the frame of each shot.
function shotFrames(
  dist: number,
  seconds: number,
  world: EnemyWorld = OPEN,
): { frames: number[]; shots: EnemyShot[]; distances: number[] } {
  const enemy = newEnemy('w-1', 'w', 'grunt', 0, -dist);
  enemy.awake = true;
  const rng = createRng(7);
  const mech = mechAt(0, 0);
  const out: { frames: number[]; shots: EnemyShot[]; distances: number[] } = { frames: [], shots: [], distances: [] };
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const shot = stepEnemy(enemy, mech, world, DT, rng);
    if (!shot) continue;
    out.frames.push(i);
    out.shots.push(shot);
    out.distances.push(distTo(enemy, mech));
  }
  return out;
}

test('it shoots once every interval while the mech is within the firing range', () => {
  const { frames, shots } = shotFrames(GRUNT.stopDist, 4.9);
  expect(frames).toHaveLength(3);
  for (let i = 1; i < frames.length; i++) expect((frames[i] - frames[i - 1]) * DT).toBeCloseTo(GRUNT.fireInterval, 1);
  // each shot leaves the chest (0.7 of the height) toward the mech's chest, within the spread
  for (const shot of shots) {
    expect(shot.y).toBeCloseTo(GRUNT.height * 0.7, 6);
    expect(Math.hypot(shot.dx, shot.dy, shot.dz)).toBeCloseTo(1, 6);
    expect(shot.dz).toBeGreaterThan(0.99);
  }
});

test('it does not shoot from beyond the firing range, and shoots once it has walked within it', () => {
  const { frames, distances } = shotFrames(GRUNT.fireRange + 20, 10);
  expect(frames.length).toBeGreaterThan(0);
  // it needs (fireRange + 20 - fireRange) / speed seconds to come in range, and the first shot waits for that
  expect(frames[0] * DT).toBeGreaterThan(20 / GRUNT.speed - 0.1);
  for (const distance of distances) expect(distance).toBeLessThanOrEqual(GRUNT.fireRange + 1e-9);
});

test('a prop between the enemy and the mech holds its fire, and it shoots again once the prop is gone', () => {
  const wall: Aabb = { minX: -10, maxX: 10, minY: 0, maxY: 10, minZ: -15, maxZ: -12 };
  // a solid wall: the enemy, finding no way round it (no nav), slides at it head-on and never gets a clear line
  const rect: GroundRect = { x: 0, z: -13.5, halfW: 10, halfD: 1.5, yaw: 0, top: 10 };
  expect(shotFrames(GRUNT.stopDist, 6, { ...OPEN, rects: [rect], propBoxes: [wall] }).frames).toHaveLength(0);
  // the same wall too low to reach the line from chest to chest (2.1 m to 2.5 m)
  const low: Aabb = { ...wall, maxY: 1 };
  expect(shotFrames(GRUNT.stopDist, 6, { ...OPEN, rects: [rect], propBoxes: [low] }).frames.length).toBeGreaterThan(0);
  expect(shotFrames(GRUNT.stopDist, 6).frames.length).toBeGreaterThan(0);
});

test('a fallen enemy does nothing', () => {
  const enemy = newEnemy('w-1', 'w', 'grunt', 0, -GRUNT.stopDist);
  enemy.awake = true;
  enemy.hp = 0;
  const before = { ...enemy };
  for (let i = 0; i < 300; i++) expect(stepEnemy(enemy, mechAt(0, 0), OPEN, DT, createRng(1))).toBeNull();
  expect(enemy).toEqual(before);
});

// A wall across the way at z 0 with a gap at x 30..40, seen as walls and as boxes that stop a shot, with the way round it
// to a mech at (mechX, mechZ) and the other enemies it keeps clear of.
function defenceLine(mechX: number, mechZ: number, others: readonly EnemyState[] = []): EnemyWorld {
  const rects: GroundRect[] = [
    { x: -30, z: 0, halfW: 60, halfD: 1, yaw: 0, top: 4 },
    { x: 80, z: 0, halfW: 40, halfD: 1, yaw: 0, top: 4 },
  ];
  const bounds = { minX: -100, maxX: 120, minZ: -100, maxZ: 100 };
  const nav = buildNavField(buildNavGrid(rects, bounds, GRUNT.radius), mechX, mechZ);
  return { rects, propBoxes: rects.map(rectBox), bounds, nav, others };
}

test('an enemy beyond a defence line comes through its gap to the mech’s side, and without the nav it stays behind', () => {
  const mech = mechAt(0, 40);
  const through = newEnemy('w-1', 'w', 'grunt', 0, -30);
  through.awake = true;
  const world = defenceLine(mech.x, mech.z);
  let crossedAt: number | null = null;
  for (let i = 0; i < 30 * 60; i++) {
    stepEnemy(through, mech, world, DT, createRng(1));
    if (crossedAt === null && through.z > 0) crossedAt = through.x;
  }
  expect(through.z).toBeGreaterThan(0);
  expect(crossedAt).toBeGreaterThan(30);
  expect(crossedAt).toBeLessThan(40);
  // the control: the same enemy with no way found slides along the wall and does not come through in that time
  const stuck = newEnemy('w-1', 'w', 'grunt', 0, -30);
  stuck.awake = true;
  for (let i = 0; i < 30 * 60; i++) stepEnemy(stuck, mech, { ...world, nav: null }, DT, createRng(1));
  expect(stuck.z).toBeLessThan(0);
});

test('without a clear line it does not stop at the stopping distance, and with one it stands and shoots', () => {
  // 20 m from the mech, inside the stopping distance, with the wall between them
  const mech = mechAt(0, 10);
  const enemy = newEnemy('w-1', 'w', 'grunt', 0, -10);
  enemy.awake = true;
  const world = defenceLine(mech.x, mech.z);
  expect(distTo(enemy, mech)).toBeLessThan(GRUNT.stopDist);
  const start = { x: enemy.x, z: enemy.z };
  for (let i = 0; i < 120; i++) expect(stepEnemy(enemy, mech, world, DT, createRng(1))).toBeNull();
  expect(Math.hypot(enemy.x - start.x, enemy.z - start.z)).toBeGreaterThan(GRUNT.speed * 1.5);
  // it goes on until the wall is no longer between them, then stands still and shoots
  let shots = 0;
  const rng = createRng(3);
  for (let i = 0; i < 30 * 60; i++) if (stepEnemy(enemy, mech, world, DT, rng)) shots++;
  const standing = { x: enemy.x, z: enemy.z };
  for (let i = 0; i < 300; i++) if (stepEnemy(enemy, mech, world, DT, rng)) shots++;
  expect(enemy.x).toBeCloseTo(standing.x, 6);
  expect(enemy.z).toBeCloseTo(standing.z, 6);
  expect(shots).toBeGreaterThan(0);
  expect(distTo(enemy, mech)).toBeLessThanOrEqual(GRUNT.stopDist);
});

test('enemies that start on the same spot walk on without standing inside each other', () => {
  const squad = [0, 1, 2, 3, 4].map(n => newEnemy(`w-${n}`, 'w', 'grunt', n * 0.2, -60));
  for (const enemy of squad) enemy.awake = true;
  const world: EnemyWorld = { ...OPEN, others: squad };
  const mech = mechAt(0, 0);
  for (let i = 0; i < 600; i++) {
    for (const enemy of squad) stepEnemy(enemy, mech, world, DT, createRng(1));
  }
  for (let a = 0; a < squad.length; a++) {
    for (let b = a + 1; b < squad.length; b++) {
      expect(distTo(squad[a], squad[b])).toBeGreaterThanOrEqual(GRUNT.radius * 2);
    }
  }
});

test('an enemy that comes in above the ground falls to it without shooting, and lands clear of the wall it stood on', () => {
  const wall: GroundRect = { x: 0, z: -70, halfW: 20, halfD: 5, yaw: 0, top: 6 };
  const world: EnemyWorld = { ...OPEN, rects: [wall] };
  const enemy = newEnemy('w-1', 'w', 'grunt', 0, -70, 6);
  const mech = mechAt(0, -20);
  let landed = -1;
  for (let i = 0; i < 120 && landed < 0; i++) {
    expect(stepEnemy(enemy, mech, world, DT, createRng(1))).toBeNull();
    if (enemy.y === 0) landed = i;
  }
  // 6 m at 20 m/s^2 takes a little under 0.8 s
  expect(landed * DT).toBeGreaterThan(0.6);
  expect(landed * DT).toBeLessThan(1);
  expect(enemy.y).toBe(0);
  expect(rectDistance(wall, enemy.x, enemy.z)).toBeGreaterThanOrEqual(GRUNT.radius - 1e-9);
  expect(enemy.z).toBeGreaterThan(-65);
});
