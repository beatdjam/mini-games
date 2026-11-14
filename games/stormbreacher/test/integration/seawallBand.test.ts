// The band between C's rear row and the seawall (task 1985): C's four hedgehogs beside the ramps are gone, so the mech
// walks out of every part of the band to C's sea side, the seawall-drop wave lands there and walks out by the nav, the
// map's bounds hold the mech, and every wave spawns outside the props' and targets' shot boxes.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { ENEMIES, ENEMY_KINDS, M1_WAVE_DROP } from '../../src/data/enemies.ts';
import { MECH_TUNE, MOVE_TUNE } from '../../src/data/tune.ts';
import { rectBoxes, type GroundRect } from '../../src/logic/collide.ts';
import { newEnemy, stepEnemy, type EnemyWorld } from '../../src/logic/enemies.ts';
import { mapBlockers } from '../../src/logic/mapShapes.ts';
import { newMech, stepMech, type MechInput, type MechState } from '../../src/logic/mech.ts';
import { buildNavField, buildNavGrid } from '../../src/logic/nav.ts';
import { rng, seed } from '../../src/logic/rng.ts';

const MAP = M1B_HAND;
const DT = 1 / 30;
const TURN_RATE = 6; // how fast the walk turns toward its next point (rad/s)
const NAV_RADIUS = Math.max(...ENEMY_KINDS.filter(kind => ENEMIES[kind].speed > 0).map(kind => ENEMIES[kind].radius));

const idle: MechInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
};

const rects = mapBlockers(MAP);
const world = { rects, radius: MECH_TUNE.radius, bounds: MAP.bounds };

// The four hedgehogs the fix takes out of C's rear row, and the three parts of the band they used to close. Each part is
// walked along the band to the way past a ramp, then between C's two rows to the sea side.
const BANDS = [
  {
    name: 'west',
    start: { x: -75, z: -58 },
    points: [
      { x: -56.4, z: -58 },
      { x: -56.4, z: -45 },
      { x: -48, z: -45 },
      { x: -48, z: -34 },
    ],
  },
  {
    name: 'middle',
    start: { x: -8, z: -58 },
    points: [
      { x: -43.6, z: -58 },
      { x: -43.6, z: -45 },
      { x: -48, z: -45 },
      { x: -48, z: -34 },
    ],
  },
  {
    name: 'east',
    start: { x: 60, z: -58 },
    points: [
      { x: 41.3, z: -58 },
      { x: 41.3, z: -45 },
      { x: 36.6, z: -45 },
      { x: 36.6, z: -34 },
    ],
  },
];

// Walks the mech to (x, z) with stepMech's own inputs, turning at TURN_RATE. True once it is there.
function walkTo(mech: MechState, x: number, z: number, frames: number): boolean {
  for (let i = 0; i < frames; i++) {
    const dx = x - mech.x;
    const dz = z - mech.z;
    if (Math.hypot(dx, dz) < 0.5) return true;
    const want = Math.atan2(-dx, -dz);
    const diff = Math.atan2(Math.sin(want - mech.yaw), Math.cos(want - mech.yaw));
    const turn = Math.max(-TURN_RATE * DT, Math.min(TURN_RATE * DT, diff));
    stepMech(mech, { ...idle, moveZ: 1, turn }, DT, MOVE_TUNE, 0, world);
  }
  return Math.hypot(x - mech.x, z - mech.z) < 0.5;
}

test('the mech walks out of every part of the band to C’s sea side', () => {
  for (const band of BANDS) {
    const mech = newMech();
    mech.x = band.start.x;
    mech.z = band.start.z;
    for (const point of band.points) {
      expect(walkTo(mech, point.x, point.z, 600), `${band.name} band, on the way to (${point.x}, ${point.z})`).toBe(
        true,
      );
    }
    expect(mech.z, `${band.name} band`).toBeGreaterThan(-40);
  }
});

test('the seawall-drop wave lands in the band and walks out by the nav', () => {
  const grid = buildNavGrid(rects, MAP.bounds, NAV_RADIUS);
  const mech = { x: 0, y: 0, z: -30 };
  const field = buildNavField(grid, mech.x, mech.z);
  for (const [index, place] of MAP.spawns['seawall-drop'].entries()) {
    seed(1);
    const enemy = newEnemy(`drop-${index + 1}`, 'seawall-drop', 'grunt', place.x, place.z, 6);
    const falling: EnemyWorld = { rects, propBoxes: [], bounds: MAP.bounds, nav: null, others: [] };
    for (let frame = 0; frame < 240 && enemy.y > 0; frame++) stepEnemy(enemy, mech, falling, DT, rng());
    expect(enemy.y, `landing of (${place.x}, ${place.z})`).toBe(0);
    expect(enemy.z, `landing of (${place.x}, ${place.z})`).toBeLessThan(-52.5);
    const walking: EnemyWorld = { ...falling, nav: field };
    let out = false;
    for (let frame = 0; frame < 1200; frame++) {
      stepEnemy(enemy, mech, walking, DT, rng());
      if (enemy.z > -45) {
        out = true;
        break;
      }
    }
    expect(out, `the enemy from (${place.x}, ${place.z}) left the band`).toBe(true);
  }
});

test('the mech stays inside the map’s bounds when it walks at each edge', () => {
  const { minX, maxX, minZ, maxZ } = MAP.bounds;
  const radius = MECH_TUNE.radius;
  const open = { rects: [] as GroundRect[], radius, bounds: MAP.bounds };
  const edges: { name: string; start: { x: number; z: number }; input: Partial<MechInput> }[] = [
    { name: 'west', start: { x: minX + 5, z: 0 }, input: { moveX: -1 } },
    { name: 'east', start: { x: maxX - 5, z: 0 }, input: { moveX: 1 } },
    { name: 'land', start: { x: 20, z: minZ + 5 }, input: { moveZ: 1 } },
    { name: 'sea', start: { x: 20, z: maxZ - 5 }, input: { moveZ: -1 } },
  ];
  for (const edge of edges) {
    const mech = newMech();
    mech.x = edge.start.x;
    mech.z = edge.start.z;
    for (let frame = 0; frame < 600; frame++) stepMech(mech, { ...idle, ...edge.input }, DT, MOVE_TUNE, 0, open);
    expect(mech.x, `${edge.name} x`).toBeGreaterThanOrEqual(minX + radius - 1e-6);
    expect(mech.x, `${edge.name} x`).toBeLessThanOrEqual(maxX - radius + 1e-6);
    expect(mech.z, `${edge.name} z`).toBeGreaterThanOrEqual(minZ + radius - 1e-6);
    expect(mech.z, `${edge.name} z`).toBeLessThanOrEqual(maxZ - radius + 1e-6);
  }
});

test('every wave spawns outside the props’ and targets’ boxes', () => {
  const boxes = rects.flatMap(rect => rectBoxes(rect));
  for (const wave of Object.keys(MAP.spawns)) {
    const y = M1_WAVE_DROP[wave] ?? 0;
    for (const [index, place] of MAP.spawns[wave].entries()) {
      // a spawn on top of a box (the seawall's 6 m) is not inside it; one at the bottom of a box is
      const inside = boxes.find(
        box =>
          place.x >= box.minX &&
          place.x <= box.maxX &&
          place.z >= box.minZ &&
          place.z <= box.maxZ &&
          y < box.maxY - 1e-9,
      );
      expect(inside, `${wave} ${index + 1} at (${place.x}, ${place.z})`).toBeUndefined();
    }
  }
});
