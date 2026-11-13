// The allied mech of the mission script (SB-170): it runs along a way the mission names, with no hit box (the mech and the
// shots pass through it), and falls where its fate says. Pure functions over one ally's state, so a node test can run
// them and a checkpoint can copy them; no three and no DOM. +z is the sea.
import { distXZ } from '@engine/core/index.ts';
import { ALLY_TUNE } from '../data/allies.ts';
import type { AllyFateBy, GroundSpot } from '../data/types.ts';

// The ally's fate once it reaches the place: it falls by `by` there, after a radio call if the mission writes one.
export interface AllyFate {
  place: GroundSpot;
  by: AllyFateBy;
  call: string | null; // the language key of the line it calls before it falls
}

export interface AllyState {
  id: string;
  x: number; // the feet (m)
  z: number;
  y: number; // the height of the feet (m); the game reads the ground under it
  yaw: number; // the way it faces (rad); 0 faces -z, as the mech does
  way: GroundSpot[]; // the points it passes in order, copied from the mission so the state stands alone
  next: number; // the place in `way` of the point it runs to now; at way.length it has reached the end
  fate: AllyFate | null; // null for an ally that lives on
  called: boolean; // true once it has called on the radio before its fate
  down: boolean; // true once it has fallen; it does not move again
}

// An ally standing at the first point of its way, facing the second.
export function newAlly(id: string, way: readonly GroundSpot[], fate: AllyFate | null): AllyState {
  if (way.length === 0) throw new Error(`the way of ally "${id}" has no point`);
  const ally: AllyState = {
    id,
    x: way[0].x,
    z: way[0].z,
    y: 0,
    yaw: 0,
    way: way.map(p => ({ ...p })),
    next: 1,
    fate,
    called: false,
    down: false,
  };
  if (way.length > 1) ally.yaw = faceTo(way[0], way[1]);
  return ally;
}

// Sends an ally already out along the next way: the first point is where it stands, so it runs on from there. A fallen
// ally keeps its last way and place.
export function moveAlly(ally: AllyState, way: readonly GroundSpot[]): void {
  if (ally.down) return;
  if (way.length === 0) throw new Error(`the way of ally "${ally.id}" has no point`);
  ally.way = way.map(p => ({ ...p }));
  ally.next = 1;
  if (way.length > 1) ally.yaw = faceTo(ally, way[1]);
}

// The index of the point nearest `from` within `range` (m), the first of equal distances, or null when none is that
// near. Used for an ally's pick of an enemy and an enemy's pick of an ally.
export function nearestIndex(from: GroundSpot, points: readonly GroundSpot[], range: number): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const dist = distXZ(from, points[i]);
    if (dist > range || dist >= bestDist) continue;
    best = i;
    bestDist = dist;
  }
  return best;
}

// The enemy the view draws a tracer from to which ally: every living, awake enemy within `range` of an ally gets that
// ally (the nearest), and an enemy with none in range gets null. A cutscene stops them all, as it stops the allies: the
// picture must not show a fight the logic is holding. Pure, so a node test can check the awake and health branches.
export interface EnemyTracerState {
  id: string;
  x: number;
  z: number;
  hp: number;
  awake: boolean;
}

export function enemyTracerTargets<T extends EnemyTracerState, A extends GroundSpot>(
  enemies: readonly T[],
  allies: readonly A[],
  range: number,
  cutscene: boolean,
): Map<string, A | null> {
  const targets = new Map<string, A | null>();
  if (cutscene) return targets;
  for (const enemy of enemies) {
    if (enemy.hp <= 0 || !enemy.awake) continue;
    const pick = nearestIndex(enemy, allies, range);
    targets.set(enemy.id, pick === null ? null : allies[pick]);
  }
  return targets;
}

function faceTo(from: GroundSpot, to: GroundSpot): number {
  // `|| 0` turns the -0 a straight -z step gives into 0, so a checkpoint and a suspend keep the same number
  return Math.atan2(-(to.x - from.x), -(to.z - from.z)) || 0;
}

// Runs the ally on by `dt` along its way at ALLY_TUNE.speed. Gives back true on the frame it comes within
// ALLY_TUNE.arrive of its fate's place, and it is down from then on; a fallen ally, or one at the end of its way, stays.
export function stepAlly(ally: AllyState, dt: number): boolean {
  if (ally.down) return false;
  let left = ALLY_TUNE.speed * Math.max(0, dt);
  while (left > 0 && ally.next < ally.way.length) {
    const to = ally.way[ally.next];
    const dist = distXZ(ally, to);
    ally.yaw = faceTo(ally, to);
    if (dist <= left) {
      ally.x = to.x;
      ally.z = to.z;
      left -= dist;
      ally.next++;
    } else {
      ally.x += ((to.x - ally.x) / dist) * left;
      ally.z += ((to.z - ally.z) / dist) * left;
      left = 0;
    }
  }
  if (ally.fate !== null && distXZ(ally, ally.fate.place) <= ALLY_TUNE.arrive) {
    ally.down = true;
    return true;
  }
  return false;
}
