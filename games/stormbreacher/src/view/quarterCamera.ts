// The overview camera's pose, as pure functions: the mech's feet and the tune go in, a place and a look point come out.
// Nothing here reads the scene or the camera. The view writes the camera itself (drawPlay), so this file can be tried
// without a page.
import * as THREE from 'three';
import type { QuarterTune } from '../data/tuneTypes.ts';

export interface QuarterPose {
  pos: THREE.Vector3; // where the camera goes
  look: THREE.Vector3; // the point it looks at
}

// The pose the tune asks for: the look point leads the mech toward the screen's top, and the camera sits `back` toward
// the screen's bottom and `height` above it. yaw 0 faces -z, and `azimuth` follows the same convention (0 looks -z and
// grows turning left).
export function quarterPose(target: { x: number; y: number; z: number }, tune: QuarterTune): QuarterPose {
  const upX = -Math.sin(tune.azimuth);
  const upZ = -Math.cos(tune.azimuth);
  const look = new THREE.Vector3(target.x + upX * tune.lead, target.y + tune.lookHeight, target.z + upZ * tune.lead);
  const pos = new THREE.Vector3(look.x - upX * tune.back, look.y + tune.height, look.z - upZ * tune.back);
  return { pos, look };
}

// `prev` moved toward `pose` with the time constant `tune.lag` (s), so the speed does not change with the frame rate.
// `prev` null or lag 0 gives a copy of `pose`. The returned vectors are new, so a pose kept between frames is not
// changed by the next one.
export function followQuarter(prev: QuarterPose | null, pose: QuarterPose, dt: number, tune: QuarterTune): QuarterPose {
  if (prev === null || tune.lag <= 0) return { pos: pose.pos.clone(), look: pose.look.clone() };
  const amount = 1 - Math.exp(-dt / tune.lag);
  return {
    pos: prev.pos.clone().lerp(pose.pos, amount),
    look: prev.look.clone().lerp(pose.look, amount),
  };
}

// `base` with the values the URL asks for: `?q.height=30` sets `height`. Numbers that cannot be read and names that are
// not in the tune are ignored, so a plain sortie keeps the table's values and a typo changes nothing.
export function quarterTuneFrom(params: URLSearchParams, base: QuarterTune): QuarterTune {
  const tune: QuarterTune = { ...base };
  for (const key of Object.keys(base) as (keyof QuarterTune)[]) {
    const raw = params.get(`q.${key}`);
    if (raw === null || raw.trim() === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) tune[key] = value;
  }
  return tune;
}
