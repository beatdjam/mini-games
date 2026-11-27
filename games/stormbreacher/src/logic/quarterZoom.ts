// The quarter camera's pull-back while a large enemy is near (SB-2160). These are pure functions: the game's state goes
// in and the ratio, or a tune already scaled by it, comes out. Nothing here reads three or the DOM, so a node test can
// run it. The view keeps the ratio between frames and passes the scaled tune to quarterPose.
import { ZOOM_ENEMY_KINDS, ZOOM_TARGET_KINDS } from '../data/tune.ts';
import type { QuarterTune } from '../data/tuneTypes.ts';
import type { EnemyKind } from '../data/enemies.ts';
import type { TargetKind } from '../data/types.ts';
import type { GameModel, TargetState } from './game.ts';

// How far a target's box comes toward (x, z) on the ground: the nearest point of the box, not its centre, so a large
// target whose centre is out of range but whose face is inside still counts.
function boxDistanceXZ(target: TargetState, x: number, z: number): number {
  const dx = Math.max(target.box.minX - x, 0, x - target.box.maxX);
  const dz = Math.max(target.box.minZ - z, 0, z - target.box.maxZ);
  return Math.hypot(dx, dz);
}

function isZoomEnemy(kind: EnemyKind): boolean {
  return ZOOM_ENEMY_KINDS.some(zoomKind => zoomKind === kind);
}

function isZoomTarget(kind: TargetKind): boolean {
  return ZOOM_TARGET_KINDS.some(zoomKind => zoomKind === kind);
}

// Whether a living large enemy or target is within `zoomRange` of the mech and should pull the camera back. An enemy's
// distance is to its centre on the ground, a target's to the nearest point of its box's footprint. A sleeping enemy
// still counts: the camera should show it before it shoots.
export function wantsWide(game: Pick<GameModel, 'mech' | 'enemies' | 'targets'>, tune: QuarterTune): boolean {
  const { x, z } = game.mech;
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0 || !isZoomEnemy(enemy.kind)) continue;
    if (Math.hypot(enemy.x - x, enemy.z - z) <= tune.zoomRange) return true;
  }
  for (const target of game.targets) {
    if (target.hp <= 0 || !isZoomTarget(target.kind)) continue;
    if (boxDistanceXZ(target, x, z) <= tune.zoomRange) return true;
  }
  return false;
}

// `current` (a ratio from 1 to `zoomScale`) moved toward `zoomScale` while `wide`, or back to 1, with the time constant
// `zoomLag` (s), so the speed does not change with the frame rate. `zoomLag` 0 jumps to the target.
export function stepZoom(current: number, wide: boolean, dt: number, tune: QuarterTune): number {
  const target = wide ? tune.zoomScale : 1;
  if (tune.zoomLag <= 0) return target;
  const amount = 1 - Math.exp(-dt / tune.zoomLag);
  return current + (target - current) * amount;
}

// `tune` with `height` and `back` grown by `scale`, so the camera moves farther from the same look point. The other
// values stay as they are, and the tune passed in is not changed.
export function zoomedTune(tune: QuarterTune, scale: number): QuarterTune {
  return { ...tune, height: tune.height * scale, back: tune.back * scale };
}
