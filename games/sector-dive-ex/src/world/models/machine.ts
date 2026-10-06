import * as THREE from 'three';
import { shared } from '@engine/render/render.ts';
import { TEX, grain, paint, poolTex } from '../looks/paint.ts';
import type { Paint } from '../looks/paint.ts';
// What a machine built to be believed is made with, for the bosses (world/models/bossLooks.ts) and the enemies
// (world/models/enemyLooks.ts): hull plate with panel lines, a vent and a stencilled mark on it, steel that takes the light,
// and parts a machine would need (a hydraulic ram between two points). A model made with these should show what the
// machine does: how it moves (tracks, wheels, jets, legs on rams), what it fights with (barrels, launchers, rams,
// blades), how it sees (a slit, lenses, aerials), and where its heat goes (stacks, radiators).
// The parts the other models are put together from are here too (the pickups, world/models/itemLooks.ts; the enemies' shots,
// world/models/ebulletLooks.ts): boxes and cylinders made once per size, and the pool of light on the ground under a thing.
export const LOOK_GLOW = 0.05; // a machine's own glow in its colour (the plain enemies are at 0.4: they are all glow)
const POOL_OPACITY = 0.55; // how strong a pool of light on the ground is

// ---- the parts every model is put together from ----
// geometries are made once per size and kept (shared: disposeTree leaves them)
const geos: Record<string, THREE.BufferGeometry> = {};
export const boxGeo = (w: number, h: number, d: number) =>
  (geos[`b${w},${h},${d}`] ??= shared(new THREE.BoxGeometry(w, h, d)));
export const cylGeo = (rt: number, rb: number, len: number, seg = 14) =>
  (geos[`c${rt},${rb},${len},${seg}`] ??= shared(new THREE.CylinderGeometry(rt, rb, len, seg)));
// a faceted ball (flat faces: armour, not a toy ball)
export const ballGeo = (r: number, detail = 1) =>
  (geos[`s${r},${detail}`] ??= shared(new THREE.IcosahedronGeometry(r, detail)));
type Axis = 'x' | 'y' | 'z';
// a mesh at (x, y, z); a cylinder's own axis is y: `along` lays it along x or z instead
export function at(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, along: Axis = 'y') {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (along === 'x') m.rotation.z = Math.PI / 2;
  if (along === 'z') m.rotation.x = Math.PI / 2;
  return m;
}
// ---- the pool of light on the ground under a thing (a dark machine is lost against a dark wall) ----
const poolMats: Record<number, THREE.Material> = {};
const poolGeo = (side: number) =>
  (geos[`p${side}`] ??= shared(new THREE.PlaneGeometry(side, side).rotateX(-Math.PI / 2)));
const poolMat = (color: number) =>
  (poolMats[color] ??= shared(
    new THREE.MeshBasicMaterial({
      map: poolTex(),
      color,
      transparent: true,
      opacity: POOL_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  ));
// a pool of light of a colour, `side` metres across, lying flat (the caller puts it at the ground): for the enemies
// and bosses, their shots, and the things lying on the floor
export const groundPool = (color: number, side: number): THREE.Mesh => new THREE.Mesh(poolGeo(side), poolMat(color));

// ---- the hull ----
// hull plate: panels of slightly different greys, a louvred vent, a stencilled unit mark, chipped edges
const hullPaint: Paint = (g, rand) => {
  g.fillStyle = '#33383d';
  g.fillRect(0, 0, TEX, TEX);
  // panels: a few rectangles, each a shade of its own, with a dark seam and a bright upper edge
  const cuts = [0, 0.34, 0.62, 1],
    rows = [0, 0.45, 1];
  for (let r = 0; r < rows.length - 1; r++)
    for (let c = 0; c < cuts.length - 1; c++) {
      const x = cuts[c]! * TEX,
        y = rows[r]! * TEX,
        w = (cuts[c + 1]! - cuts[c]!) * TEX,
        h = (rows[r + 1]! - rows[r]!) * TEX,
        v = 44 + Math.floor(rand() * 22);
      g.fillStyle = `rgb(${v},${v + 4},${v + 8})`;
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
      g.fillStyle = 'rgba(255,255,255,.1)';
      g.fillRect(x + 2, y + 2, w - 4, 2);
      g.fillStyle = 'rgba(0,0,0,.5)';
      for (const [bx, by] of [
        [x + 9, y + 9],
        [x + w - 12, y + 9],
        [x + 9, y + h - 12],
        [x + w - 12, y + h - 12],
      ] as const)
        g.fillRect(bx, by, 4, 4);
    }
  // a louvred vent in the lower middle panel
  for (let n = 0; n < 6; n++) {
    g.fillStyle = '#0b0c0e';
    g.fillRect(TEX * 0.38, TEX * 0.56 + n * 14, TEX * 0.2, 7);
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fillRect(TEX * 0.38, TEX * 0.56 + n * 14 + 7, TEX * 0.2, 2);
  }
  // the unit mark, stencilled, and a warning stripe along the bottom of one panel
  g.fillStyle = 'rgba(214,218,206,.75)';
  g.font = '900 44px "Arial Narrow","Helvetica Neue",Arial,sans-serif';
  g.textBaseline = 'top';
  g.fillText(HULL_MARK, TEX * 0.66, TEX * 0.08);
  g.fillStyle = '#c4a02e';
  g.fillRect(TEX * 0.64, TEX * 0.9, TEX * 0.34, 12);
  g.fillStyle = '#181610';
  for (let x = TEX * 0.64; x < TEX; x += 24) g.fillRect(x, TEX * 0.9, 12, 12);
  // scratches and chipped paint
  for (let n = 0; n < 60; n++) {
    g.strokeStyle = `rgba(198,204,210,${0.1 + rand() * 0.25})`;
    g.lineWidth = 1;
    const x = rand() * TEX,
      y = rand() * TEX;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 30, y + (rand() - 0.5) * 10);
    g.stroke();
  }
  for (let n = 0; n < 40; n++) {
    g.fillStyle = `rgba(0,0,0,${0.08 + rand() * 0.14})`;
    g.fillRect(rand() * TEX, rand() * TEX, 6 + rand() * 30, 8 + rand() * 40);
  }
  grain(g, rand, 12);
};
const HULL_MARK = 'K-07'; // the stencil on the hull (a made-up unit number)
// bare machined steel: for pistons, barrels, joints
let machineMats: {
  hull: THREE.CanvasTexture;
  steel: THREE.Material;
  black: THREE.Material;
  jet: THREE.Material;
} | null = null;
export const machine = () =>
  (machineMats ??= {
    hull: paint(6001, hullPaint),
    steel: shared(new THREE.MeshPhongMaterial({ color: 0x4d535a, specular: 0xaab2ba, shininess: 60 })),
    black: shared(new THREE.MeshPhongMaterial({ color: 0x15171a, specular: 0x555b62, shininess: 30 })),
    jet: shared(new THREE.MeshBasicMaterial({ color: 0xffd9a0 })),
  });
// a boss's hull material with the looks of a machine: hull plate that takes the light. (A Phong material where the
// boss's code names a Lambert one: the two share what that code touches, the emissive colour and its strength)
export function bossHullMat(color: number): THREE.MeshLambertMaterial {
  const m = new THREE.MeshPhongMaterial({
    map: machine().hull,
    specular: 0x6f7780,
    shininess: 34,
    emissive: color,
    emissiveIntensity: LOOK_GLOW,
  });
  m.userData.glow = LOOK_GLOW;
  m.userData.pool = color;
  return m as unknown as THREE.MeshLambertMaterial;
}
// a hydraulic ram between two points: the dark cylinder and the bright rod out of it
export function piston(from: THREE.Vector3, to: THREE.Vector3, r: number): THREE.Group {
  const g = new THREE.Group(),
    len = from.distanceTo(to),
    barrel = new THREE.Mesh(cylGeo(r, r, len * 0.56, 10), machine().black),
    rod = new THREE.Mesh(cylGeo(r * 0.55, r * 0.55, len * 0.5, 8), machine().steel);
  barrel.position.y = -len * 0.22;
  rod.position.y = len * 0.25;
  g.add(barrel, rod);
  g.position.copy(from).add(to).multiplyScalar(0.5);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return g;
}
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
