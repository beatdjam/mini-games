// The enemies' own state and the one-frame step of a single enemy: it sleeps until the mech comes near, then turns to
// the mech, walks up to its stopping distance and shoots at its interval while it has a clear line. Nothing here reads
// three or the DOM, and the random draws come in as an argument, so a node test can run it. game.ts keeps the list.
import type { Rng } from '@engine/core/index.ts';
import { ENEMIES, ENEMY_CHEST, type EnemyKind } from '../data/enemies.ts';
import { MECH_TUNE } from '../data/tune.ts';
import type { MapBounds } from '../data/types.ts';
import { pushOutCircle, type GroundRect } from './collide.ts';
import { spreadDir } from './fcs.ts';
import { fireRayHit, type Aabb } from './fire.ts';

export interface EnemyState {
  id: string; // `<wave>-<number>`, the number counted from 1 along the wave's spawn points
  wave: string; // the wave it came with
  kind: EnemyKind;
  x: number; // on the ground (m)
  z: number;
  yaw: number; // the way it faces, in the mech's sense (the front is (-sin yaw, -cos yaw))
  hp: number; // the health left; 0 stays after it falls
  awake: boolean; // set once the mech comes within the kind's `notice`; it never sleeps again
  wait: number; // the seconds before it may shoot again
}

// What an enemy sees of the world: the walls it is pushed out of, the boxes that stop a shot and the map's edge.
export interface EnemyWorld {
  rects: readonly GroundRect[];
  propBoxes: readonly Aabb[];
  bounds: MapBounds;
}

// A shot an enemy fired: where it leaves and the direction (length 1).
export interface EnemyShot {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

export function newEnemy(id: string, wave: string, kind: EnemyKind, x: number, z: number): EnemyState {
  const def = ENEMIES[kind];
  return { id, wave, kind, x, z, yaw: 0, hp: def.hp, awake: false, wait: def.fireInterval };
}

// Moves the enemy by `step` toward (tx, tz), pushes it out of the walls (so a wall it meets turns the walk into a slide
// along it) and keeps it inside the map.
function walk(enemy: EnemyState, tx: number, tz: number, step: number, world: EnemyWorld): void {
  const radius = ENEMIES[enemy.kind].radius;
  const len = Math.hypot(tx - enemy.x, tz - enemy.z);
  if (len < 1e-9) return;
  const moved = pushOutCircle(
    enemy.x + ((tx - enemy.x) / len) * step,
    enemy.z + ((tz - enemy.z) / len) * step,
    radius,
    world.rects,
  );
  const { minX, maxX, minZ, maxZ } = world.bounds;
  enemy.x = Math.min(Math.max(moved.x, minX + radius), maxX - radius);
  enemy.z = Math.min(Math.max(moved.z, minZ + radius), maxZ - radius);
}

// One frame of one enemy. `mech` is the mech's feet. Returns the shot it fired this frame, or null. An enemy with no
// health left does nothing.
export function stepEnemy(
  enemy: EnemyState,
  mech: { x: number; y: number; z: number },
  world: EnemyWorld,
  dt: number,
  rng: Rng,
): EnemyShot | null {
  if (enemy.hp <= 0) return null;
  const def = ENEMIES[enemy.kind];
  let dist = Math.hypot(mech.x - enemy.x, mech.z - enemy.z);
  if (!enemy.awake) {
    if (dist > def.notice) return null;
    enemy.awake = true;
  }
  enemy.yaw = Math.atan2(enemy.x - mech.x, enemy.z - mech.z);
  if (dist > def.stopDist) {
    walk(enemy, mech.x, mech.z, Math.min(def.speed * dt, dist - def.stopDist), world);
    dist = Math.hypot(mech.x - enemy.x, mech.z - enemy.z);
  }
  enemy.wait = Math.max(0, enemy.wait - dt);
  if (enemy.wait > 0 || dist > def.fireRange) return null;
  // from its chest to the mech's chest; a prop between them stops the shot, so it holds fire
  const y = def.height * ENEMY_CHEST;
  const dx = mech.x - enemy.x;
  const dy = mech.y + MECH_TUNE.chestHeight - y;
  const dz = mech.z - enemy.z;
  if (fireRayHit(enemy.x, y, enemy.z, dx, dy, dz, Math.hypot(dx, dy, dz), world.propBoxes)) return null;
  enemy.wait = def.fireInterval;
  const aimed = spreadDir({ dx, dy, dz }, def.spread, rng);
  return { x: enemy.x, y, z: enemy.z, dx: aimed.dx, dy: aimed.dy, dz: aimed.dz };
}
