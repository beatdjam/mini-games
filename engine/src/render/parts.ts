import * as THREE from 'three';
import { shared } from './render.ts';
// The parts a model is put together from: boxes, cylinders and balls made once per size and kept (shared), and putting
// a mesh at a place.

// geometries are made once per size and kept (shared: disposeTree leaves them)
const geos: Record<string, THREE.BufferGeometry> = {};
export const boxGeo = (w: number, h: number, d: number) =>
  (geos[`b${w},${h},${d}`] ??= shared(new THREE.BoxGeometry(w, h, d)));
export const cylGeo = (rt: number, rb: number, len: number, seg = 14) =>
  (geos[`c${rt},${rb},${len},${seg}`] ??= shared(new THREE.CylinderGeometry(rt, rb, len, seg)));
// a faceted ball (flat faces: armour, not a toy ball)
export const ballGeo = (r: number, detail = 1) =>
  (geos[`s${r},${detail}`] ??= shared(new THREE.IcosahedronGeometry(r, detail)));
export type Axis = 'x' | 'y' | 'z';
// a mesh at (x, y, z); a cylinder's own axis is y: `along` lays it along x or z instead
export function at(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, along: Axis = 'y') {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (along === 'x') m.rotation.z = Math.PI / 2;
  if (along === 'z') m.rotation.x = Math.PI / 2;
  return m;
}
