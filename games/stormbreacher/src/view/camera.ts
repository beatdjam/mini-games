// The screen rectangle a box makes and the wall boxes a ground rect makes, as pure functions: a box and a camera go in,
// a rectangle comes out; a ground rect goes in, the boxes the fade's line-of-sight test uses come out.
import * as THREE from 'three';
import { rectBoxes, type GroundRect } from '../logic/collide.ts';
import type { Aabb } from '../logic/fire.ts';

const WALL_HEIGHT = 100; // m; how high a rect with no top reaches, so the camera never goes over it

// The boxes one rect gives the camera; a ramp is a stack (see collide.ts's rectBoxes).
export function cameraBoxesOfRect(rect: GroundRect): THREE.Box3[] {
  return rectBoxes(rect).map(box => {
    const top = rect.top === undefined ? WALL_HEIGHT : box.maxY;
    return new THREE.Box3(new THREE.Vector3(box.minX, box.minY, box.minZ), new THREE.Vector3(box.maxX, top, box.maxZ));
  });
}

export interface ScreenRect {
  left: number; // px from the screen's left edge
  top: number; // px from the screen's top edge
  width: number; // px
  height: number; // px
}

// The rectangle round a box on a screen of width x height px: the box's eight corners projected by the camera, then
// the smallest rectangle that holds them, cut to the screen. null when a corner is behind the camera (the box is
// beside or round the camera, where a frame would mean nothing) or when the rectangle is wholly off the screen. The
// camera's matrices must be current (updateMatrixWorld, which the renderer does before a frame).
export function screenRect(box: Aabb, cam: THREE.Camera, width: number, height: number): ScreenRect | null {
  cam.updateMatrixWorld();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const corner = new THREE.Vector3();
  for (const x of [box.minX, box.maxX]) {
    for (const y of [box.minY, box.maxY]) {
      for (const z of [box.minZ, box.maxZ]) {
        corner.set(x, y, z);
        // the camera looks down -z in its own space, so a corner at z >= 0 there is behind it
        if (corner.clone().applyMatrix4(cam.matrixWorldInverse).z >= 0) return null;
        corner.project(cam);
        minX = Math.min(minX, corner.x);
        maxX = Math.max(maxX, corner.x);
        minY = Math.min(minY, corner.y);
        maxY = Math.max(maxY, corner.y);
      }
    }
  }
  // NDC runs -1..1 with y up
  if (maxX < -1 || minX > 1 || maxY < -1 || minY > 1) return null;
  const left = ((Math.max(minX, -1) + 1) / 2) * width;
  const right = ((Math.min(maxX, 1) + 1) / 2) * width;
  const top = ((1 - Math.min(maxY, 1)) / 2) * height;
  const bottom = ((1 - Math.max(minY, -1)) / 2) * height;
  return { left, top, width: right - left, height: bottom - top };
}
