// The enemies' own state and the one-frame step of a single enemy: it sleeps until the mech comes near, then turns to
// the mech and walks to it by the way nav.ts finds round the walls, up to its stopping distance. It stops there only
// while it has a clear line to the mech (a prop between them stops a shot); without one it walks on and round, and it
// shoots at its interval while it has a clear line. One that comes in above the ground first falls to it. Nothing here
// reads three or the DOM, and the random draws come in as an argument, so a node test can run it. game.ts keeps the list.
import type { Rng } from '@engine/core/index.ts';
import { ENEMIES, ENEMY_CHEST, type EnemyKind } from '../data/enemies.ts';
import { MECH_TUNE } from '../data/tune.ts';
import type { MapBounds } from '../data/types.ts';
import { pushOutCircle, type GroundRect } from './collide.ts';
import { spreadDir } from './fcs.ts';
import { fireRayHit, type Aabb } from './fire.ts';
import { navTarget, type NavField } from './nav.ts';

const SEPARATION_DIST = 2.5; // enemies nearer than this push each other apart (m); two grunts touch at 1.5
const SEPARATION_SPEED = 3; // how fast two enemies at the same spot push apart; it falls to 0 at SEPARATION_DIST (m/s)
const DROP_GRAVITY = 20; // how fast an enemy that comes in above the ground falls (m/s^2)
const DROP_PUSH = 10; // how fast it jumps off towards the sea (+z) while it falls, to land clear of the wall (m/s)

export interface EnemyState {
  id: string; // `<wave>-<number>`, the number counted from 1 along the wave's spawn points
  wave: string; // the wave it came with
  kind: EnemyKind;
  x: number; // on the ground (m)
  z: number;
  y: number; // the height of its feet (m); above 0 only while it falls in from a wave that comes in high
  vy: number; // how fast it falls (m/s, up is +)
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
  nav: NavField | null; // the way to the mech round the walls; null walks straight at it (and slides along a wall)
  others: readonly EnemyState[]; // every enemy, itself too: the ones it keeps clear of
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

// `y` is the height it comes in at (m); above the ground it falls first.
export function newEnemy(id: string, wave: string, kind: EnemyKind, x: number, z: number, y = 0): EnemyState {
  const def = ENEMIES[kind];
  return { id, wave, kind, x, z, y, vy: 0, yaw: 0, hp: def.hp, awake: false, wait: def.fireInterval };
}

// Pushes the enemy out of the walls and keeps it inside the map.
function settle(enemy: EnemyState, world: EnemyWorld): void {
  const radius = ENEMIES[enemy.kind].radius;
  const moved = pushOutCircle(enemy.x, enemy.z, radius, world.rects);
  const { minX, maxX, minZ, maxZ } = world.bounds;
  enemy.x = Math.min(Math.max(moved.x, minX + radius), maxX - radius);
  enemy.z = Math.min(Math.max(moved.z, minZ + radius), maxZ - radius);
}

// Moves the enemy by `step` toward (tx, tz), but no farther than it, pushes it out of the walls (so a wall it meets turns
// the walk into a slide along it) and keeps it inside the map.
function walk(enemy: EnemyState, tx: number, tz: number, step: number, world: EnemyWorld): void {
  const len = Math.hypot(tx - enemy.x, tz - enemy.z);
  if (len < 1e-9) return;
  const go = Math.min(step, len);
  enemy.x += ((tx - enemy.x) / len) * go;
  enemy.z += ((tz - enemy.z) / len) * go;
  settle(enemy, world);
}

// Pushes the enemy away from the living enemies near it, harder the nearer they are, so a squad does not pile up.
function keepApart(enemy: EnemyState, world: EnemyWorld, dt: number): void {
  let px = 0;
  let pz = 0;
  for (const other of world.others) {
    if (other === enemy || other.hp <= 0 || other.y > 0) continue;
    const dx = enemy.x - other.x;
    const dz = enemy.z - other.z;
    const dist = Math.hypot(dx, dz);
    if (dist >= SEPARATION_DIST) continue;
    // two at the very same spot part along x, one each way by their order
    const away = dist < 1e-6 ? { x: enemy.id < other.id ? -1 : 1, z: 0 } : { x: dx / dist, z: dz / dist };
    const push = (1 - dist / SEPARATION_DIST) * SEPARATION_SPEED;
    px += away.x * push;
    pz += away.z * push;
  }
  if (px === 0 && pz === 0) return;
  enemy.x += px * dt;
  enemy.z += pz * dt;
  settle(enemy, world);
}

// One frame of the fall: gravity, and a jump off towards the sea. It lands where the walls push it out to.
function fall(enemy: EnemyState, world: EnemyWorld, dt: number): void {
  enemy.vy -= DROP_GRAVITY * dt;
  enemy.y += enemy.vy * dt;
  enemy.z += DROP_PUSH * dt;
  if (enemy.y > 0) return;
  enemy.y = 0;
  enemy.vy = 0;
  settle(enemy, world);
}

// One frame of one enemy. `mech` is the mech's feet. Returns the shot it fired this frame, or null. An enemy with no
// health left does nothing, and one in the air only falls.
export function stepEnemy(
  enemy: EnemyState,
  mech: { x: number; y: number; z: number },
  world: EnemyWorld,
  dt: number,
  rng: Rng,
): EnemyShot | null {
  if (enemy.hp <= 0) return null;
  const def = ENEMIES[enemy.kind];
  enemy.yaw = Math.atan2(enemy.x - mech.x, enemy.z - mech.z);
  if (enemy.y > 0) {
    fall(enemy, world, dt);
    return null;
  }
  const dist = Math.hypot(mech.x - enemy.x, mech.z - enemy.z);
  if (!enemy.awake) {
    if (dist > def.notice) return null;
    enemy.awake = true;
  }
  // from its chest to the mech's chest; a prop between them stops the shot
  const y = def.height * ENEMY_CHEST;
  const dy = mech.y + MECH_TUNE.chestHeight - y;
  const clear =
    dist <= def.fireRange &&
    !fireRayHit(enemy.x, y, enemy.z, mech.x - enemy.x, dy, mech.z - enemy.z, Math.hypot(dist, dy), world.propBoxes);
  // it stops at its distance only with a clear line; without one it goes on, by the nav's way when it has one
  if (!(clear && dist <= def.stopDist)) {
    const via = world.nav ? navTarget(world.nav, enemy.x, enemy.z, mech.x, mech.z) : null;
    const to = via ?? mech;
    walk(
      enemy,
      to.x,
      to.z,
      clear && dist > def.stopDist ? Math.min(def.speed * dt, dist - def.stopDist) : def.speed * dt,
      world,
    );
  }
  keepApart(enemy, world, dt);
  enemy.wait = Math.max(0, enemy.wait - dt);
  if (enemy.wait > 0 || !clear) return null;
  const dx = mech.x - enemy.x;
  const dz = mech.z - enemy.z;
  enemy.wait = def.fireInterval;
  const aimed = spreadDir({ dx, dy, dz }, def.spread, rng);
  return { x: enemy.x, y, z: enemy.z, dx: aimed.dx, dy: aimed.dy, dz: aimed.dz };
}
