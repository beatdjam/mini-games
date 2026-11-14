// The fortress's heavy machine-gun nest (SB-1830): the state and one frame of its sweep over the open ground before the
// sea gate. Pure functions on a small state; the random draw comes in as an argument. logic/game.ts keeps the state,
// flies the bullets and reports the events. It does not import GameModel: the box, the mech and the blockers come in.
import type { Rng } from '@engine/core/index.ts';
import { FORTRESS_GUN_TUNE } from '../data/fortress.ts';
import { MECH_TUNE } from '../data/tune.ts';
import type { EnemyShot } from './enemies.ts';
import { spreadDir } from './fcs.ts';
import { fireRayHit, type Aabb } from './fire.ts';

// The nest's own state: the seconds before it may shoot again, and the shots left in the burst under way (0 between
// bursts, and set to the full burst when a shot is due and the line is clear).
export interface FortressGunState {
  wait: number;
  burstLeft: number;
}

export function newFortressGun(): FortressGunState {
  return { wait: FORTRESS_GUN_TUNE.rest, burstLeft: 0 };
}

// Where a shot leaves: the middle of the box, a little seaward of its seaward face and above the wall's top, so the
// box itself never stops the shot.
function muzzleOf(box: Aabb): { x: number; y: number; z: number } {
  return {
    x: (box.minX + box.maxX) / 2,
    y: box.maxY * FORTRESS_GUN_TUNE.muzzle,
    z: box.maxZ + FORTRESS_GUN_TUNE.muzzleGap,
  };
}

// The quarter turn of a horizontal direction about the y axis (rad).
function turnXZ(dx: number, dz: number, turn: number): { dx: number; dz: number } {
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return { dx: dx * cos + dz * sin, dz: -dx * sin + dz * cos };
}

// One frame of the nest, `box` being the target's box (it sits on the wall's top) and `mech` the mech's feet. While the
// wait runs it does nothing. When the wait ends and the mech is within range on the ground with a clear line to its
// chest, it fires one shot of the burst: the direction to the mech is turned across the arc by this shot's place in the
// burst, and the spread is laid over it. The next shot comes after `interval`, and the burst's last one leaves `rest`
// before the next. A line that is not clear stops the burst and starts the rest again.
export function stepFortressGun(
  state: FortressGunState,
  box: Aabb,
  mech: { x: number; y: number; z: number },
  blockers: readonly Aabb[],
  dt: number,
  rng: Rng,
): EnemyShot | null {
  state.wait = Math.max(0, state.wait - dt);
  if (state.wait > 0) return null;
  const { x, y, z } = muzzleOf(box);
  const reach = Math.hypot(mech.x - x, mech.z - z);
  const dy = mech.y + MECH_TUNE.chestHeight - y;
  const dx = mech.x - x;
  const dz = mech.z - z;
  if (reach > FORTRESS_GUN_TUNE.range || fireRayHit(x, y, z, dx, dy, dz, Math.hypot(dx, dy, dz), blockers)) {
    state.burstLeft = FORTRESS_GUN_TUNE.shots;
    state.wait = FORTRESS_GUN_TUNE.rest;
    return null;
  }
  if (state.burstLeft <= 0) state.burstLeft = FORTRESS_GUN_TUNE.shots;
  // the shot's place in the burst, from the first (the left end of the arc) to the last (the right end)
  const index = FORTRESS_GUN_TUNE.shots - state.burstLeft;
  state.burstLeft -= 1;
  state.wait = state.burstLeft > 0 ? FORTRESS_GUN_TUNE.interval : FORTRESS_GUN_TUNE.rest;
  const arc = (FORTRESS_GUN_TUNE.arcDeg * Math.PI) / 180;
  const turn = FORTRESS_GUN_TUNE.shots > 1 ? -arc / 2 + (arc * index) / (FORTRESS_GUN_TUNE.shots - 1) : 0;
  const swept = turnXZ(dx, dz, turn);
  const aimed = spreadDir({ dx: swept.dx, dy, dz: swept.dz }, FORTRESS_GUN_TUNE.spread, rng);
  return { x, y, z, dx: aimed.dx, dy: aimed.dy, dz: aimed.dz };
}
