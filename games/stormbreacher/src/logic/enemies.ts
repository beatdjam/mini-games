// The enemies' own state and the one-frame step of a single enemy: it sleeps until the mech comes near, then turns to
// the mech and walks to it by the way nav.ts finds round the walls, up to its stopping distance. It stops there only
// while it has a clear line to the mech (a prop between them stops a shot); without one it walks on and round, and it
// shoots at its interval while it has a clear line. One that comes in above the ground first falls to it. Nothing here
// reads three or the DOM, and the random draws come in as an argument, so a node test can run it. game.ts keeps the list.
import type { Rng } from '@engine/core/index.ts';
import { DEFENDER_POSTS, DEFENDER_TUNE } from '../data/defenders.ts';
import { ENEMIES, ENEMY_CHEST, type EnemyDef, type EnemyKind } from '../data/enemies.ts';
import { PAYOFF_TUNE } from '../data/payoff.ts';
import { MECH_TUNE } from '../data/tune.ts';
import type { GroundSpot, MapBounds } from '../data/types.ts';
import { pushOutCircle, type GroundRect } from './collide.ts';
import { spreadDir } from './fcs.ts';
import { fireRayHit, type Aabb } from './fire.ts';
import { navTarget, type NavField } from './nav.ts';
import { newWarden, type WardenState } from './warden.ts';

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
  fallenT: number; // the seconds since it fell; 0 while it lives (the trickle's fallen are taken out after a while, SB-2230)
  awake: boolean; // set once the mech comes within the kind's `notice` or a script wakes it; it never sleeps again
  dormant: boolean; // put out asleep and held: `notice` does not wake it, only a script's `wake` does
  wait: number; // the seconds before it may shoot again
  burstLeft: number; // the shots still to fire in this burst; 0 for a kind with no burst
  fallback: GroundSpot | null; // the next line's cover it runs to when a milestone breaks its sector (SB-2010)
  fallbackHold: number; // the seconds it holds that cover once it is there
  post: number | null; // the DEFENDER_POSTS place it holds, or null for a walking enemy (SB-2015)
  fallbackPost: number | null; // the hold post it runs to; on arrival it holds there instead of walking on
  holdOut: boolean; // a posted enemy has stepped out from cover to fire
  holdLeft: number; // the seconds left in its hide or its step out
  warden?: WardenState; // the mid boss's own phases and timers; only a `warden` has one
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

// `y` is the height it comes in at (m); above the ground it falls first. `dormant` puts it out asleep and held until
// a script's `wake`: the mech's distance does not wake it.
export function newEnemy(
  id: string,
  wave: string,
  kind: EnemyKind,
  x: number,
  z: number,
  y = 0,
  dormant = false,
): EnemyState {
  const def = ENEMIES[kind];
  return {
    id,
    wave,
    kind,
    x,
    z,
    y,
    vy: 0,
    yaw: 0,
    hp: def.hp,
    fallenT: 0,
    awake: false,
    dormant,
    wait: def.fireInterval,
    burstLeft: def.burst?.shots ?? 0,
    fallback: null,
    fallbackHold: 0,
    post: null,
    fallbackPost: null,
    holdOut: false,
    holdLeft: 0,
    ...(kind === 'warden' ? { warden: newWarden() } : {}),
  };
}

// Puts an enemy on a hold post: it starts hidden, and the hide and step-out counts begin. A defender put out by a wave
// or one that has just run to its next line's cover uses this.
export function holdAt(enemy: EnemyState, post: number): void {
  enemy.post = post;
  enemy.fallback = null;
  enemy.fallbackPost = null;
  enemy.holdOut = false;
  enemy.holdLeft = DEFENDER_TUNE.hideSec;
  enemy.wait = DEFENDER_TUNE.firstWait;
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

// Moves a posted defender toward its next cover without pushing it out of the props: the line it runs from is its own,
// and the gaps in it are the enemy's, not the mech's (SB-2015). It still stays inside the map. Other walkers keep the
// walls (`walk`).
function run(enemy: EnemyState, tx: number, tz: number, step: number, world: EnemyWorld): void {
  const len = Math.hypot(tx - enemy.x, tz - enemy.z);
  if (len < 1e-9) return;
  const go = Math.min(step, len);
  enemy.x += ((tx - enemy.x) / len) * go;
  enemy.z += ((tz - enemy.z) / len) * go;
  const radius = ENEMIES[enemy.kind].radius;
  const { minX, maxX, minZ, maxZ } = world.bounds;
  enemy.x = Math.min(Math.max(enemy.x, minX + radius), maxX - radius);
  enemy.z = Math.min(Math.max(enemy.z, minZ + radius), maxZ - radius);
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

// One frame of a posted defender (SB-2015): it never walks toward the mech, only between its hiding place and its step
// out point. It stays hidden for `hideSec`, steps out, fires when its line is clear for `peekSec`, then goes back. It
// does not keep apart from the others while hidden, so a post stays a post. Returns the shot it fired.
function stepHolder(
  enemy: EnemyState,
  mech: { x: number; y: number; z: number },
  world: EnemyWorld,
  dt: number,
  rng: Rng,
  def: EnemyDef,
  dist: number,
): EnemyShot | null {
  const post = DEFENDER_POSTS[enemy.post as number];
  const tx = enemy.holdOut ? post.peekX : post.x;
  const tz = enemy.holdOut ? post.peekZ : post.z;
  if (Math.hypot(tx - enemy.x, tz - enemy.z) > DEFENDER_TUNE.arrive) {
    walk(enemy, tx, tz, DEFENDER_TUNE.stepSpeed * dt, world);
  }
  enemy.holdLeft -= dt;
  if (enemy.holdLeft <= 1e-9) {
    enemy.holdOut = !enemy.holdOut;
    enemy.holdLeft = enemy.holdOut ? DEFENDER_TUNE.peekSec : DEFENDER_TUNE.hideSec;
    if (enemy.holdOut) enemy.wait = Math.min(enemy.wait, DEFENDER_TUNE.firstWait);
  }
  if (!enemy.holdOut) return null;
  // it fires only once it stands at the step out point, so the shot comes from the place the view draws it
  if (Math.hypot(post.peekX - enemy.x, post.peekZ - enemy.z) > DEFENDER_TUNE.arrive) return null;
  enemy.wait = Math.max(0, enemy.wait - dt);
  if (enemy.wait > 0 || dist > def.fireRange) return null;
  const y = def.height * ENEMY_CHEST;
  const dy = mech.y + MECH_TUNE.chestHeight - y;
  const dx = mech.x - enemy.x;
  const dz = mech.z - enemy.z;
  if (fireRayHit(enemy.x, y, enemy.z, dx, dy, dz, Math.hypot(dx, dz, dy), world.propBoxes)) return null;
  enemy.wait = DEFENDER_TUNE.fireInterval;
  const aimed = spreadDir({ dx, dy, dz }, def.spread, rng);
  return { x: enemy.x, y, z: enemy.z, dx: aimed.dx, dy: aimed.dy, dz: aimed.dz };
}

// One frame of one enemy. `mech` is the mech's feet. Returns the shot it fired this frame, or null. An enemy with no
// health left does nothing, and one in the air only falls. A static enemy (a machine-gun nest) turns and shoots but
// never walks, falls or is pushed.
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
    // only a wave that comes in high falls; a nest is put on the ground
    if (def.static === true) return null;
    fall(enemy, world, dt);
    return null;
  }
  // A milestone's fall back (SB-2010): the walking enemies of the sector run to the next line's cover, their backs to
  // the mech, and fire nothing on the way. At the cover they turn, shoot and wait there for the hold's seconds. A nest
  // is fixed and never carries this.
  let holding = false;
  if (enemy.fallback) {
    const to = enemy.fallback;
    const gap = Math.hypot(to.x - enemy.x, to.z - enemy.z);
    if (gap > PAYOFF_TUNE.retreatArrive) {
      enemy.yaw = Math.atan2(-(to.x - enemy.x), -(to.z - enemy.z));
      const step = def.speed * PAYOFF_TUNE.retreatSpeed * dt;
      if (enemy.fallbackPost !== null) run(enemy, to.x, to.z, step, world);
      else walk(enemy, to.x, to.z, step, world);
      keepApart(enemy, world, dt);
      return null;
    }
    if (enemy.fallbackPost !== null) {
      // a defender has run to the next line's cover: it holds that post from now on (SB-2015)
      holdAt(enemy, enemy.fallbackPost);
    } else {
      enemy.fallbackHold -= dt;
      if (enemy.fallbackHold <= 1e-9) enemy.fallback = null;
      else holding = true;
    }
  }
  const dist = Math.hypot(mech.x - enemy.x, mech.z - enemy.z);
  if (!enemy.awake) {
    if (enemy.dormant || dist > def.notice) return null;
    enemy.awake = true;
  }
  if (enemy.post !== null) return stepHolder(enemy, mech, world, dt, rng, def, dist);
  // from its chest to the mech's chest; a prop between them stops the shot
  const y = def.height * ENEMY_CHEST;
  const dy = mech.y + MECH_TUNE.chestHeight - y;
  const clear =
    dist <= def.fireRange &&
    !fireRayHit(enemy.x, y, enemy.z, mech.x - enemy.x, dy, mech.z - enemy.z, Math.hypot(dist, dy), world.propBoxes);
  if (def.static !== true && !holding) {
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
  }
  const burst = def.burst;
  // a machine-gun nest sweeps a burst across its arc; a burst that loses its line stops
  enemy.wait = Math.max(0, enemy.wait - dt);
  if (burst !== undefined && !clear && enemy.burstLeft < burst.shots) {
    enemy.burstLeft = burst.shots;
    enemy.wait = burst.rest;
  }
  if (enemy.wait > 0 || !clear) return null;
  const dx = mech.x - enemy.x;
  const dz = mech.z - enemy.z;
  if (burst === undefined) {
    enemy.wait = def.fireInterval;
    const aimed = spreadDir({ dx, dy, dz }, def.spread, rng);
    return { x: enemy.x, y, z: enemy.z, dx: aimed.dx, dy: aimed.dy, dz: aimed.dz };
  }
  enemy.burstLeft -= 1;
  const index = burst.shots - enemy.burstLeft - 1;
  // the sweep: the first shot of the burst is the left edge of the arc, the last the right edge
  const turn = burst.shots > 1 ? ((-burst.arcDeg / 2 + (burst.arcDeg * index) / (burst.shots - 1)) * Math.PI) / 180 : 0;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const swept = { dx: dx * cos + dz * sin, dy, dz: -dx * sin + dz * cos };
  if (enemy.burstLeft === 0) {
    enemy.burstLeft = burst.shots;
    enemy.wait = burst.rest;
  } else {
    enemy.wait = burst.interval;
  }
  const aimed = spreadDir(swept, def.spread, rng);
  return { x: enemy.x, y, z: enemy.z, dx: aimed.dx, dy: aimed.dy, dz: aimed.dz };
}
