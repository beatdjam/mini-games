// The aim assist (FCS) of the three kinds (SB-060): the aim line of the camera, the mech's chest and the targets go
// in; the direction a shot flies, the lock and the targets in the aim circle come out. No three and no DOM, so a node
// test can run it. Angles in the tables are degrees; everything here turns them into radians as it needs.
// A candidate to move into the engine (D-23): it reads no game table, so every value comes in as an argument.
import type { Rng } from '@engine/core/index.ts';
import type { FcsKind, FcsTune } from '../data/tuneTypes.ts';
import { fireRay, type Aabb } from './fire.ts';

export interface Ray3 {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
}

export interface Dir3 {
  dx: number;
  dy: number;
  dz: number;
}

export interface FcsTarget {
  id: number;
  box: Aabb;
  cx: number; // the box's centre (m)
  cy: number;
  cz: number;
  alive: boolean;
}

export interface FcsState {
  lockId: number | null; // the target hard has caught, or null
  lockProgress: number; // the seconds the current candidate has stayed in the circle (s)
  lockCandidate: number | null; // the target the lock is counting on, or null
  muzzle: { dx: number; dy: number; dz: number }; // the muzzle's current direction (hard follows it, soft pulls it)
}

export interface FcsStep {
  shotDir: Dir3; // the direction a shot from the chest flies
  lockId: number | null;
  candidateId: number | null;
  inCone: number[]; // the indices of the targets in the aim circle
  lockProgress: number; // the seconds toward lockTime (for the reticle's arc)
}

const DEG = Math.PI / 180;
const EPS = 1e-9;

export function newFcs(): FcsState {
  return {
    lockId: null,
    lockProgress: 0,
    lockCandidate: null,
    muzzle: { dx: 0, dy: 0, dz: -1 },
  };
}

function normalize(dx: number, dy: number, dz: number): Dir3 {
  const length = Math.hypot(dx, dy, dz);
  if (length < EPS) return { dx: 0, dy: 0, dz: -1 };
  return { dx: dx / length, dy: dy / length, dz: dz / length };
}

function angleDeg(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const la = Math.hypot(ax, ay, az);
  const lb = Math.hypot(bx, by, bz);
  if (la < EPS || lb < EPS) return 0;
  const c = Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (la * lb)));
  return Math.acos(c) / DEG;
}

const distance = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): number =>
  Math.hypot(ax - bx, ay - by, az - bz);

// Turns `from` toward `to` by at most `maxDeg` degrees. A proper rotation about the axis both directions share, so
// the angle actually turned is the limit itself, not more.
function turnToward(from: Dir3, to: Dir3, maxDeg: number): Dir3 {
  const a = normalize(from.dx, from.dy, from.dz);
  const b = normalize(to.dx, to.dy, to.dz);
  const angle = angleDeg(a.dx, a.dy, a.dz, b.dx, b.dy, b.dz);
  if (angle <= maxDeg || angle < 1e-6) return b;
  const kx = a.dy * b.dz - a.dz * b.dy;
  const ky = a.dz * b.dx - a.dx * b.dz;
  const kz = a.dx * b.dy - a.dy * b.dx;
  const k = normalize(kx, ky, kz);
  const phi = maxDeg * DEG;
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  // Rodrigues about k, with k perpendicular to a: a' = a cos + (k x a) sin
  return normalize(
    a.dx * c + (k.dy * a.dz - k.dz * a.dy) * s,
    a.dy * c + (k.dz * a.dx - k.dx * a.dz) * s,
    a.dz * c + (k.dx * a.dy - k.dy * a.dx) * s,
  );
}

// The distance along the ray at which it enters the box, or null (m). The ray's direction is normalized here.
function entryDistance(ray: Ray3, range: number, box: Aabb): number | null {
  const dir = normalize(ray.dx, ray.dy, ray.dz);
  let near = 0;
  let far = range;
  const axis = (origin: number, d: number, min: number, max: number): boolean => {
    if (Math.abs(d) < 1e-12) return origin >= min && origin <= max;
    let t0 = (min - origin) / d;
    let t1 = (max - origin) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    return near <= far;
  };
  if (!axis(ray.ox, dir.dx, box.minX, box.maxX)) return null;
  if (!axis(ray.oy, dir.dy, box.minY, box.maxY)) return null;
  if (!axis(ray.oz, dir.dz, box.minZ, box.maxZ)) return null;
  return near <= far ? near : null;
}

// The shot direction manual aiming gives: from the chest toward the point where the aim line passes `range` m out,
// or where it first meets a target on the way.
function manualDir(
  aim: Ray3,
  chest: { x: number; y: number; z: number },
  range: number,
  targets: readonly FcsTarget[],
): Dir3 {
  const alive = targets.filter(t => t.alive);
  const boxes = alive.map(t => t.box);
  const index = fireRay(aim.ox, aim.oy, aim.oz, aim.dx, aim.dy, aim.dz, range, boxes);
  const dir = normalize(aim.dx, aim.dy, aim.dz);
  let reach = range;
  if (index >= 0) {
    const distanceToHit = entryDistance(aim, range, boxes[index]);
    if (distanceToHit !== null) reach = distanceToHit;
  }
  return normalize(
    aim.ox + dir.dx * reach - chest.x,
    aim.oy + dir.dy * reach - chest.y,
    aim.oz + dir.dz * reach - chest.z,
  );
}

// The indices (and the nearest by angle) of the alive targets inside the aim circle and within range.
function circleTargets(
  aim: Ray3,
  chest: { x: number; y: number; z: number },
  tune: FcsTune,
  targets: readonly FcsTarget[],
): { inCone: number[]; nearest: FcsTarget | null } {
  const inCone: number[] = [];
  let nearest: FcsTarget | null = null;
  let nearestAngle = Infinity;
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (!target.alive) continue;
    if (distance(target.cx, target.cy, target.cz, chest.x, chest.y, chest.z) > tune.range) continue;
    const angle = angleDeg(aim.dx, aim.dy, aim.dz, target.cx - aim.ox, target.cy - aim.oy, target.cz - aim.oz);
    if (angle > tune.cone) continue;
    inCone.push(i);
    if (angle < nearestAngle) {
      nearestAngle = angle;
      nearest = target;
    }
  }
  return { inCone, nearest };
}

// Advances the aim assist by `dt` (s) and gives back the shot's direction, the lock and the circle's targets.
export function stepFcs(
  state: FcsState,
  kind: FcsKind,
  tune: FcsTune,
  aim: Ray3,
  chest: { x: number; y: number; z: number },
  targets: readonly FcsTarget[],
  dt: number,
): FcsStep {
  const { inCone, nearest } = circleTargets(aim, chest, tune, targets);
  const manual = manualDir(aim, chest, tune.range, targets);
  const targetDir = (target: FcsTarget): Dir3 =>
    normalize(target.cx - chest.x, target.cy - chest.y, target.cz - chest.z);

  if (kind === 'manual') {
    state.muzzle = manual;
    return { shotDir: manual, lockId: null, candidateId: null, inCone, lockProgress: 0 };
  }

  if (kind === 'soft') {
    if (nearest === null) {
      state.lockCandidate = null;
      state.muzzle = manual;
      return { shotDir: manual, lockId: null, candidateId: null, inCone, lockProgress: 0 };
    }
    // A new target starts from the manual aim, so the pull always begins at what the player sees.
    if (state.lockCandidate !== nearest.id) {
      state.lockCandidate = nearest.id;
      state.muzzle = manual;
    }
    state.muzzle = turnToward(state.muzzle, targetDir(nearest), tune.pull * dt);
    return {
      shotDir: state.muzzle,
      lockId: null,
      candidateId: nearest.id,
      inCone,
      lockProgress: 0,
    };
  }

  // hard
  if (state.lockId !== null) {
    const locked = targets.find(t => t.id === state.lockId) ?? null;
    const breakAngle = locked
      ? angleDeg(aim.dx, aim.dy, aim.dz, locked.cx - aim.ox, locked.cy - aim.oy, locked.cz - aim.oz)
      : Infinity;
    const inRange = locked ? distance(locked.cx, locked.cy, locked.cz, chest.x, chest.y, chest.z) <= tune.range : false;
    if (locked !== null && locked.alive && inRange && breakAngle <= tune.breakCone) {
      state.muzzle = turnToward(state.muzzle, targetDir(locked), tune.trackRate * dt);
      state.lockProgress = Math.min(tune.lockTime, state.lockProgress + dt);
      return {
        shotDir: state.muzzle,
        lockId: state.lockId,
        candidateId: nearest ? nearest.id : null,
        inCone,
        lockProgress: state.lockProgress,
      };
    }
    // caught, but it got away
    state.lockId = null;
    state.lockProgress = 0;
    state.lockCandidate = null;
  }

  if (nearest === null) {
    state.lockCandidate = null;
    state.lockProgress = 0;
    state.muzzle = manual;
    return { shotDir: manual, lockId: null, candidateId: null, inCone, lockProgress: 0 };
  }

  if (state.lockCandidate !== nearest.id) {
    state.lockCandidate = nearest.id;
    state.lockProgress = 0;
  }
  state.lockProgress += dt;
  state.muzzle = manual;
  // lockTime 0 catches on the first frame in the circle (to compare a hard lock with no wait)
  if (state.lockProgress >= tune.lockTime) {
    state.lockId = nearest.id;
    state.lockProgress = tune.lockTime;
  }
  return {
    shotDir: manual,
    lockId: state.lockId,
    candidateId: nearest.id,
    inCone,
    lockProgress: state.lockProgress,
  };
}

// `dir` moved by a random angle within `spreadDeg` degrees of itself; the same rng gives the same drift.
export function spreadDir(dir: Dir3, spreadDeg: number, rng: Rng): Dir3 {
  const d = normalize(dir.dx, dir.dy, dir.dz);
  if (!(spreadDeg > 0)) return d;
  const up = Math.abs(d.dy) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  // u and v are two perpendicular unit directions around d
  const u = normalize(d.dy * up.z - d.dz * up.y, d.dz * up.x - d.dx * up.z, d.dx * up.y - d.dy * up.x);
  const v = normalize(d.dy * u.dz - d.dz * u.dy, d.dz * u.dx - d.dx * u.dz, d.dx * u.dy - d.dy * u.dx);
  const theta = spreadDeg * DEG * Math.sqrt(rng.next());
  const phi = Math.PI * 2 * rng.next();
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const around = Math.cos(phi);
  const around2 = Math.sin(phi);
  return normalize(
    d.dx * cos + (u.dx * around + v.dx * around2) * sin,
    d.dy * cos + (u.dy * around + v.dy * around2) * sin,
    d.dz * cos + (u.dz * around + v.dz * around2) * sin,
  );
}
