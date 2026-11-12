// The battery's own state (SB-200): the shutter that guards the magazine and the machine guns of the main guns. Pure
// functions on small states; the random draw comes in as an argument. logic/game.ts keeps the states, flies the bullets
// and reports the events.
import type { Rng } from '@engine/core/index.ts';
import { GUN_TUNE, M1_SHUTTERS } from '../data/battery.ts';
import type { TargetKind } from '../data/types.ts';
import { MECH_TUNE } from '../data/tune.ts';
import { spreadDir } from './fcs.ts';
import { fireRayHit, type Aabb } from './fire.ts';
import type { EnemyShot } from './enemies.ts';

// A shutter: closed (the target takes no harm) until its targets are down.
export interface ShutterState {
  target: string; // the id of the target it guards
  open: boolean;
}

// A main gun's machine gun: the seconds before it may shoot again.
export interface GunState {
  id: string;
  wait: number;
}

// The machine guns: they fire only once `on` is set (the script's battery wave came).
export interface BatteryState {
  on: boolean;
  guns: GunState[];
}

// A shutter for each of M1_SHUTTERS that guards a target the map has, all closed.
export function newShutters(ids: readonly string[]): ShutterState[] {
  return M1_SHUTTERS.filter(def => ids.includes(def.target)).map(def => ({ target: def.target, open: false }));
}

// A gun for each target of kind `gun`, off, to shoot one interval after the battery comes on.
export function newBattery(targets: readonly { id: string; kind: TargetKind }[]): BatteryState {
  return {
    on: false,
    guns: targets.filter(t => t.kind === 'gun').map(t => ({ id: t.id, wait: GUN_TUNE.interval })),
  };
}

// Whether the target is behind a shutter that is still shut.
export function shuttered(shutters: readonly ShutterState[], id: string): boolean {
  return shutters.some(shutter => shutter.target === id && !shutter.open);
}

// Opens every shutter whose targets are all down (`hpOf` is a target's health left) and returns the ids it guards.
export function openShutters(shutters: ShutterState[], hpOf: (id: string) => number): string[] {
  const opened: string[] = [];
  for (const shutter of shutters) {
    if (shutter.open) continue;
    const def = M1_SHUTTERS.find(item => item.target === shutter.target);
    if (!def || !def.opensWhen.every(id => hpOf(id) <= 0)) continue;
    shutter.open = true;
    opened.push(shutter.target);
  }
  return opened;
}

// One frame of one gun, `box` being the main gun's box and `mech` the mech's feet. It counts down, and when it may
// shoot, the mech is within GUN_TUNE.range on the ground and no box in `blockers` is between the muzzle and the mech's
// chest, it returns the shot (two draws from `rng`) and starts the wait again. The shot leaves in front of the box
// (toward +z), so the box does not stop it.
export function stepGun(
  gun: GunState,
  box: Aabb,
  mech: { x: number; y: number; z: number },
  blockers: readonly Aabb[],
  dt: number,
  rng: Rng,
): EnemyShot | null {
  gun.wait = Math.max(0, gun.wait - dt);
  if (gun.wait > 0) return null;
  const x = (box.minX + box.maxX) / 2;
  const y = box.maxY * GUN_TUNE.muzzle;
  const z = box.maxZ + GUN_TUNE.muzzleGap;
  if (Math.hypot(mech.x - x, mech.z - (box.minZ + box.maxZ) / 2) > GUN_TUNE.range) return null;
  const dx = mech.x - x;
  const dy = mech.y + MECH_TUNE.chestHeight - y;
  const dz = mech.z - z;
  if (fireRayHit(x, y, z, dx, dy, dz, Math.hypot(dx, dy, dz), blockers)) return null;
  gun.wait = GUN_TUNE.interval;
  const aimed = spreadDir({ dx, dy, dz }, GUN_TUNE.spread, rng);
  return { x, y, z, dx: aimed.dx, dy: aimed.dy, dz: aimed.dz };
}
