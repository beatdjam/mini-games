// The feel of moving and firing: the field of view, the camera's shake, the hit stop and the dust. The movement's
// events go in; camera offsets and the field of view come out. Nothing here reads the camera or the scene.
import * as THREE from 'three';
import { burst } from '@engine/render/index.ts';
import type { FeelTune } from '../data/tune.ts';
import type { MechEvent } from '../logic/mech.ts';

export interface FeelState {
  fov: number; // the field of view to draw with (deg)
  shake: number; // the shake left to draw (m)
  stopT: number; // the hit stop left (s); the mech's movement is frozen while it is above 0
  seed: number; // the next number of the fixed sequence that picks the shake's direction
}

// The starting number of the shake's direction sequence (any 32-bit constant does; the sequence must not use Math.random).
const SHAKE_SEED = 0x9e3779b9;
const DUST_COLOR = 0xa89878; // the sand the dust is made of
const DUST_SIZE = 0.6; // how high above the feet the dust starts (m)
const DUST_SPEED = 2.4; // how fast a dust particle flies out (m/s)
const DUST_LIFE = 0.45; // how long a dust particle lives (s)
const DUST_GRAVITY = -1.5; // a slight upward pull, so the dust rises like smoke (m/s^2)

export function newFeel(baseFov: number): FeelState {
  return { fov: baseFov, shake: 0, stopT: 0, seed: SHAKE_SEED };
}

// What a shot did: missed, hit, or brought its target down.
export type ShotResult = 'miss' | 'hit' | 'kill';

// Adds the shake and the hit stop the frame's events ask for (a landing's shake grows with its falling speed). The hit
// stop comes only with a kill: a gun firing 8 shots a second that stopped the mech on every hit made it stutter, and
// the strafing camera shook with it (2026-11-09)
export function feelEvents(f: FeelState, events: readonly MechEvent[], kill: boolean, tune: FeelTune) {
  for (const event of events) {
    if (event.kind === 'land') f.shake += (tune.landShake * event.speed) / 10;
    else if (event.kind === 'fire') f.shake += tune.fireShake;
  }
  if (kill) f.stopT = tune.hitStop;
}

// The next number of the shake's fixed sequence (a linear congruential generator: the same seed gives the same run).
function nextSeed(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

// Advances the field of view, the shake and the hit stop by one frame. `offset` is how far the camera moves this frame;
// `stopped` says whether the mech's movement should be frozen.
export function feelStep(
  f: FeelState,
  dt: number,
  boosting: boolean,
  baseFov: number,
  tune: FeelTune,
): { fov: number; offset: THREE.Vector3; stopped: boolean } {
  const span = Math.max(0, dt);
  const target = boosting ? baseFov + tune.boostFov : baseFov;
  f.fov += (target - f.fov) * (1 - Math.exp(-tune.fovRate * span));

  f.shake *= Math.exp(-tune.shakeDecay * span);
  if (f.shake < 1e-4) f.shake = 0;

  f.seed = nextSeed(f.seed);
  const angle = (f.seed / 0x100000000) * Math.PI * 2;
  f.seed = nextSeed(f.seed);
  const lift = (f.seed / 0x100000000) * 2 - 1;
  const offset = new THREE.Vector3(Math.cos(angle) * f.shake, lift * f.shake * 0.5, Math.sin(angle) * f.shake);

  const stopped = f.stopT > 0;
  if (stopped) f.stopT = Math.max(0, f.stopT - span);
  return { fov: f.fov, offset, stopped };
}

// A puff of sand dust at the feet. `amount` is the number of particles before tune.dust multiplies it; a dust of 0
// (or an amount that rounds to 0) makes none.
export function spawnDust(x: number, z: number, amount: number, tune: FeelTune) {
  const count = Math.round(amount * tune.dust);
  if (count <= 0) return;
  burst(x, DUST_SIZE, z, DUST_COLOR, count, DUST_SPEED, DUST_LIFE, DUST_GRAVITY);
}
