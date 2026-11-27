// The overview camera and the cursor's aim, as the dev entries (#view-touch, #view-map, #view-fx) use them. The pure parts are quarterCamera.ts and quarterAim.ts; this file
// writes the engine's camera and reads the touch flag and the window.
import * as THREE from 'three';
import { isTouch } from '@engine/core/index.ts';
import { camera } from '@engine/render/index.ts';
import { FOV_TUNE, QUARTER_TUNE } from '../data/tune.ts';
import type { QuarterTune } from '../data/tuneTypes.ts';
import type { MechInput } from '../logic/mech.ts';
import { followQuarter, quarterPose, type QuarterPose } from '../view/quarterCamera.ts';
import { quarterAimInput } from './quarterAim.ts';

// What a dev entry needs to run the overview camera: follow the mech with the camera, and turn it toward the cursor.
// The pose and the fov are kept between frames (the follow eases from the last one) and can be read for tests.
export interface QuarterRig {
  follow(mech: { x: number; y: number; z: number }, dt: number, feel: { fov: number; offset: THREE.Vector3 }): void;
  aim(
    read: { cursor: { x: number; y: number } | null },
    mech: { x: number; y: number; z: number; yaw: number },
  ): Pick<MechInput, 'frame' | 'face'>;
  pose(): QuarterPose | null;
  fov(): number;
}

// The camera and the aim with the overview camera's tune and the feel's base fov. The camera follows the mech from the
// pose drawn last, and its fov is the tune's plus the feel's change from `baseFov`, as drawPlay writes it.
export function createQuarterRig(tune: QuarterTune = QUARTER_TUNE, baseFov: number = FOV_TUNE.feel): QuarterRig {
  let current: QuarterPose | null = null;
  let currentFov = tune.fov;

  function follow(
    mech: { x: number; y: number; z: number },
    dt: number,
    feel: { fov: number; offset: THREE.Vector3 },
  ): void {
    const target = quarterPose(mech, tune);
    current = followQuarter(current, target, dt, tune);
    const pos = current.pos.clone().add(feel.offset);
    camera.position.copy(pos);
    camera.lookAt(current.look);
    camera.fov = tune.fov + (feel.fov - baseFov);
    currentFov = camera.fov;
    camera.updateProjectionMatrix();
  }

  // A touch screen has no free cursor, so it keeps the yaw (the dev views' own touch input aims).
  function aim(
    read: { cursor: { x: number; y: number } | null },
    mech: { x: number; y: number; z: number; yaw: number },
  ): Pick<MechInput, 'frame' | 'face'> {
    if (isTouch) return {};
    return quarterAimInput(
      current,
      currentFov,
      window.innerWidth / window.innerHeight,
      read.cursor,
      mech,
      tune.azimuth,
    );
  }

  return { follow, aim, pose: () => current, fov: () => currentFov };
}
