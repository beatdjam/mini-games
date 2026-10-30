import * as THREE from 'three';
import { shared } from '@engine/render/render.ts';
// The bosses as machines, as the enemies are (world/models/enemyLooks.ts): dark hull plate (world/models/machine.ts), what glows
// kept to slits, bands and lenses in the boss's own colour, a pool of that colour on the ground under it
// (actors/bosses/common.ts createBoss, from each boss's <name>Visual). Each is built of the parts its fight would need (how it stays up, what it
// shoots with, how it sees, where its heat goes), and keeps the size and the parts its code moves (data/bosses.ts,
// actors/bosses/<name>.ts). The plain bosses (glowing solids with outlines) are in the bosses' own files (dev: ?plain).
// A boss's origin is the middle of its body and it faces +z.

export const BOSS_POOL_SIDE = 9; // the pool of light under a boss (m)
const torusGeos: Record<string, THREE.BufferGeometry> = {};
export const torusGeo = (r: number, tube: number) =>
  (torusGeos[`${r},${tube}`] ??= shared(new THREE.TorusGeometry(r, tube, 8, 28)));
// a prism (or a frustum: rt = radius at the top, rb = at the bottom) with flat faces, where cylGeo's are shaded round.
// The hull's picture goes across `per` faces, so it is not stretched all the way round
const prismGeos: Record<string, THREE.BufferGeometry> = {};
export function prismGeo(rt: number, rb: number, len: number, seg: number, per = 2): THREE.BufferGeometry {
  const key = `${rt},${rb},${len},${seg},${per}`,
    kept = prismGeos[key];
  if (kept) return kept;
  const geo = new THREE.CylinderGeometry(rt, rb, len, seg).toNonIndexed(),
    uv = geo.getAttribute('uv');
  // (the side faces come first, six corners to a face, in order round the axis)
  for (let f = 0; f < seg; f++)
    for (let c = 0; c < 6; c++) uv.setX(f * 6 + c, (uv.getX(f * 6 + c) * seg - f + (f % per)) / per);
  geo.computeVertexNormals();
  prismGeos[key] = shared(geo);
  return geo;
}
// a ball of flat plates, for a reactor's shell (ballGeo's is shaded round)
const plateBalls: Record<number, THREE.BufferGeometry> = {};
export function plateBallGeo(r: number): THREE.BufferGeometry {
  const kept = plateBalls[r];
  if (kept) return kept;
  const geo = shared(new THREE.IcosahedronGeometry(r, 1));
  geo.computeVertexNormals(); // (its faces do not share corners, so this makes each one flat)
  plateBalls[r] = geo;
  return geo;
}
// a mesh turned (radians about x, y, z)
export function turned<T extends THREE.Object3D>(m: T, x: number, y: number, z: number): T {
  m.rotation.set(x, y, z);
  return m;
}
// n groups turned evenly about the upright axis, the first by `off`: what `build` puts at +x in one stands out from
// the middle (for parts set round a body)
export function spokes(n: number, off: number, build: (s: THREE.Group, k: number) => void): THREE.Group[] {
  return Array.from({ length: n }, (_, k) => {
    const s = new THREE.Group();
    s.rotation.y = off + (k / n) * Math.PI * 2;
    build(s, k);
    return s;
  });
}
export const HALF = Math.PI / 2;
