import * as THREE from 'three';
import { basicMat, shared } from '@engine/render/render.ts';
import { COLOR } from '../data/colors.ts';
import { bladeMat } from './enemyLooks.ts';
import { V, at, boxGeo, cylGeo, machine, piston } from './machine.ts';
// The bosses as machines, as the enemies are (world/enemyLooks.ts): dark hull plate (world/machine.ts), what glows
// kept to slits, bands and lenses in the boss's own colour, a pool of that colour on the ground under it
// (actors/bosses/common.ts bossBase). Each is built of the parts its fight would need (how it stays up, what it
// shoots with, how it sees, where its heat goes), and keeps the size and the parts its code moves (data/bosses.ts,
// actors/bosses/<name>.ts). The plain bosses (glowing solids with outlines) are in the bosses' own files (dev: ?plain).
// A boss's origin is the middle of its body and it faces +z.

export const BOSS_POOL_SIDE = 9; // the pool of light under a boss (m)
const torusGeos: Record<string, THREE.BufferGeometry> = {};
const torusGeo = (r: number, tube: number) =>
  (torusGeos[`${r},${tube}`] ??= shared(new THREE.TorusGeometry(r, tube, 8, 28)));
// a prism (or a frustum: rt = radius at the top, rb = at the bottom) with flat faces, where cylGeo's are shaded round.
// The hull's picture goes across `per` faces, so it is not stretched all the way round
const prismGeos: Record<string, THREE.BufferGeometry> = {};
function prismGeo(rt: number, rb: number, len: number, seg: number, per = 2): THREE.BufferGeometry {
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
// the flywheel of the NOISE CORE's rotor: a ring with flat faces
let wheelGeo: THREE.BufferGeometry | null = null;
function flywheelGeo(): THREE.BufferGeometry {
  if (wheelGeo) return wheelGeo;
  wheelGeo = shared(new THREE.TorusGeometry(1.3, 0.2, 6, 16).toNonIndexed());
  wheelGeo.computeVertexNormals();
  return wheelGeo;
}
// a ball of flat plates, for a reactor's shell (ballGeo's is shaded round)
const plateBalls: Record<number, THREE.BufferGeometry> = {};
function plateBallGeo(r: number): THREE.BufferGeometry {
  const kept = plateBalls[r];
  if (kept) return kept;
  const geo = shared(new THREE.IcosahedronGeometry(r, 1));
  geo.computeVertexNormals(); // (its faces do not share corners, so this makes each one flat)
  plateBalls[r] = geo;
  return geo;
}
// a mesh turned (radians about x, y, z)
function turned<T extends THREE.Object3D>(m: T, x: number, y: number, z: number): T {
  m.rotation.set(x, y, z);
  return m;
}
// a prism laid along z (its top to the front), a flat face up (seg = how many faces it has)
const laid = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, z: number, seg: number) =>
  turned(at(geo, mat, 0, y, z), Math.PI / 2, Math.PI / seg, 0);
// n groups turned evenly about the upright axis, the first by `off`: what `build` puts at +x in one stands out from
// the middle (for parts set round a body)
function spokes(n: number, off: number, build: (s: THREE.Group, k: number) => void): THREE.Group[] {
  return Array.from({ length: n }, (_, k) => {
    const s = new THREE.Group();
    s.rotation.y = off + (k / n) * Math.PI * 2;
    build(s, k);
    return s;
  });
}
const HALF = Math.PI / 2;

// WATCHER: a hovering surveillance platform. An eight-sided fuselage with one great camera lens under a hood in its
// nose; a lift jet on a pylon at each side and a thruster behind; under its belly the gun ring its rings of shots come
// from, and a twin gun under the lens for the aimed ones; a sensor housing, a scanner bar and aerials on top
export function watcherLook(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group(),
    k = machine(),
    glow = basicMat(COLOR.cyan),
    lens = basicMat(COLOR.mag);
  g.add(
    laid(prismGeo(1.45, 1.45, 1.9, 8), mat, 0, -0.1, 8), // the fuselage
    laid(prismGeo(1.1, 1.45, 0.5, 8), mat, 0, 1.1, 8), // its nose
    laid(prismGeo(1.45, 0.95, 0.6, 8), mat, 0, -1.35, 8), // its tail
    laid(prismGeo(1.48, 1.48, 0.06, 8), k.black, 0, 0.85, 8), // the seams between them
    laid(prismGeo(1.48, 1.48, 0.06, 8), k.black, 0, -1.05, 8),
    at(boxGeo(0.04, 0.1, 1.3), glow, 1.35, -0.3, -0.1), // the running light down each side
    at(boxGeo(0.04, 0.1, 1.3), glow, -1.35, -0.3, -0.1),
  );
  // the camera: a barrel, a steel bezel, dark glass with the lit lens deep in it, a hood over it
  g.add(
    at(cylGeo(1.0, 1.08, 0.4, 16), k.black, 0, 0, 1.5, 'z'),
    at(torusGeo(0.96, 0.07), k.steel, 0, 0, 1.7),
    at(cylGeo(0.86, 0.86, 0.04, 18), k.black, 0, 0, 1.7, 'z'),
    at(torusGeo(0.6, 0.05), k.steel, 0, 0, 1.72), // (the inner barrel's rim)
    at(torusGeo(0.46, 0.025), lens, 0, 0, 1.73),
    at(cylGeo(0.27, 0.27, 0.04, 18), lens, 0, 0, 1.73, 'z'),
    at(cylGeo(0.08, 0.08, 0.04, 12), basicMat(0xffffff), 0, 0, 1.75, 'z'),
    at(boxGeo(1.7, 0.08, 0.7), mat, 0, 1.13, 1.5),
  );
  // the twin gun under the lens
  g.add(at(boxGeo(0.8, 0.3, 0.5), k.black, 0, -1.2, 1.05));
  for (const x of [-0.22, 0.22])
    g.add(
      at(cylGeo(0.06, 0.06, 0.9, 8), k.black, x, -1.2, 1.7, 'z'),
      at(cylGeo(0.085, 0.085, 0.16, 8), k.steel, x, -1.2, 2.1, 'z'),
    );
  // the gun ring under the belly: a drum with a muzzle in each of its twelve faces
  g.add(
    at(cylGeo(0.7, 0.7, 0.2, 12), k.black, 0, -1.36, 0),
    at(prismGeo(1.15, 1.0, 0.44, 12, 3), mat, 0, -1.64, 0),
    at(cylGeo(1.17, 1.17, 0.05, 12), glow, 0, -1.45, 0),
    at(cylGeo(0.5, 0.4, 0.1, 12), k.black, 0, -1.9, 0),
    ...spokes(12, Math.PI / 12, s => s.add(at(cylGeo(0.06, 0.06, 0.3, 8), k.black, 1.18, -1.68, 0, 'x'))),
  );
  // the lift jets: a duct on a pylon at each side, braced from below; and the hatches its drones leave by
  for (const sx of [-1, 1])
    g.add(
      at(boxGeo(0.6, 0.22, 0.7), mat, sx * 1.6, 0.3, -0.1),
      at(prismGeo(0.42, 0.38, 0.6, 8, 4), mat, sx * 1.95, 0.2, -0.1),
      at(cylGeo(0.36, 0.36, 0.02, 12), k.black, sx * 1.95, 0.56, -0.1),
      at(cylGeo(0.45, 0.45, 0.06, 12), k.steel, sx * 1.95, 0.52, -0.1),
      at(cylGeo(0.3, 0.3, 0.04, 12), k.jet, sx * 1.95, -0.11, -0.1),
      piston(V(sx * 1.15, -0.75, 0.3), V(sx * 1.85, -0.08, 0.1), 0.07),
      turned(at(boxGeo(0.6, 0.04, 0.6), k.black, sx * 0.955, -0.955, -0.55), 0, 0, sx * (Math.PI / 4)),
    );
  // on top: the sensor housing with its slit, a scanner bar on a post, aerials, the radiator's slats
  g.add(
    at(boxGeo(1.0, 0.3, 1.1), mat, 0, 1.47, -0.2),
    at(boxGeo(0.7, 0.06, 0.03), glow, 0, 1.5, 0.36),
    at(cylGeo(0.05, 0.05, 0.3, 8), k.black, 0.2, 1.75, 0.1),
    turned(at(boxGeo(0.9, 0.2, 0.06), k.steel, 0.2, 1.97, 0.1), 0, 0.4, 0),
    at(boxGeo(0.9, 0.08, 0.05), k.black, 0, 1.37, -0.84),
    at(boxGeo(0.9, 0.08, 0.05), k.black, 0, 1.37, -0.95),
  );
  for (const [x, z] of [
    [0.35, -0.5],
    [-0.35, -0.3],
    [0, -0.65],
  ] as const)
    g.add(at(cylGeo(0.015, 0.035, 1.2, 6), k.steel, x, 2.2, z));
  // behind: the thruster's bell, hot inside
  g.add(
    at(cylGeo(0.6, 0.8, 0.36, 12), k.black, 0, 0, -1.8, 'z'),
    at(cylGeo(0.5, 0.5, 0.04, 12), k.jet, 0, 0, -1.97, 'z'),
  );
  return g;
}
// PHANTOM: a rail rifle that flies. A tall narrow hull tapering to a keel; the rifle through it at the height its shot
// leaves from: two long rails with the charge lit between them, clamps along them, a breech behind, a magazine at one
// side; a scope with the lens over it; a vane at each side with a lift jet under it; the coils it warps with round the
// keel (color = the boss's own colour)
export function phantomLook(mat: THREE.Material, color: number): THREE.Group {
  const g = new THREE.Group(),
    k = machine(),
    glow = basicMat(color);
  g.add(
    at(boxGeo(0.72, 1.5, 0.8), mat, 0, 0.25, -0.1), // the hull
    turned(at(prismGeo(0.18, 0.5, 0.6, 4, 1), mat, 0, 1.3, -0.1), 0, Math.PI / 4, 0), // its cap
    turned(at(prismGeo(0.5, 0.1, 1.4, 4, 1), mat, 0, -1.2, -0.1), 0, Math.PI / 4, 0), // the keel
    at(boxGeo(0.76, 0.05, 0.84), k.black, 0, 1.0, -0.1), // the seams
    at(boxGeo(0.76, 0.05, 0.84), k.black, 0, -0.5, -0.1),
    at(boxGeo(0.05, 0.6, 0.03), glow, 0, -0.15, 0.31), // the lit seam down its front
    at(cylGeo(0.012, 0.03, 0.6, 6), k.steel, 0.1, 1.85, -0.2), // an aerial
  );
  // the rifle
  g.add(
    at(boxGeo(0.44, 0.44, 1.3), k.black, 0, 0.5, 0.05), // the receiver, through the hull
    at(boxGeo(0.07, 0.09, 1.7), k.steel, 0, 0.63, 1.5), // the rails
    at(boxGeo(0.07, 0.09, 1.7), k.steel, 0, 0.37, 1.5),
    at(boxGeo(0.02, 0.06, 1.6), glow, 0, 0.5, 1.45), // the charge between them
    at(boxGeo(0.16, 0.4, 0.1), k.steel, 0, 0.5, 2.3), // the muzzle
    at(cylGeo(0.2, 0.2, 0.3, 10), k.steel, 0, 0.5, -0.72, 'z'), // the breech
    at(boxGeo(0.24, 0.4, 0.34), mat, 0.34, 0.42, 0.5), // the magazine
  );
  for (const z of [0.95, 1.45, 1.95]) g.add(at(boxGeo(0.2, 0.46, 0.12), k.black, 0, 0.5, z)); // the clamps
  // the scope over the rifle, the lens in its end
  g.add(
    at(cylGeo(0.15, 0.15, 0.8, 12), k.black, 0, 0.94, 0.35, 'z'),
    at(cylGeo(0.19, 0.19, 0.1, 12), k.steel, 0, 0.94, 0.72, 'z'),
    at(cylGeo(0.13, 0.13, 0.04, 12), basicMat(COLOR.mag), 0, 0.94, 0.78, 'z'),
  );
  // the vanes: a plate held off each side, lit down its front edge, slats on its face, a lift jet under it; the rifle's
  // recoil rams run from the hull to the rails
  for (const sx of [-1, 1]) {
    g.add(
      at(boxGeo(0.4, 0.12, 0.3), k.black, sx * 0.55, 0.3, -0.2),
      at(boxGeo(0.4, 0.12, 0.3), k.black, sx * 0.55, -0.3, -0.2),
      at(boxGeo(0.1, 1.7, 0.7), mat, sx * 0.8, 0, -0.2),
      at(boxGeo(0.04, 1.5, 0.03), glow, sx * 0.8, 0, 0.16),
      at(cylGeo(0.1, 0.14, 0.24, 8), k.black, sx * 0.8, -0.95, -0.2),
      at(cylGeo(0.09, 0.09, 0.04, 8), k.jet, sx * 0.8, -1.08, -0.2),
      piston(V(sx * 0.3, 0.15, 0.25), V(sx * 0.12, 0.42, 0.9), 0.05),
    );
    for (const y of [0.3, 0.45, 0.6]) g.add(at(boxGeo(0.04, 0.05, 0.5), k.black, sx * 0.86, y, -0.25));
  }
  // the warp coils round the keel, and the radiator's slats on its back
  g.add(
    turned(at(torusGeo(0.42, 0.05), k.black, 0, -0.85, -0.1), HALF, 0, 0),
    turned(at(torusGeo(0.36, 0.02), glow, 0, -1.07, -0.1), HALF, 0, 0),
    turned(at(torusGeo(0.3, 0.04), k.black, 0, -1.3, -0.1), HALF, 0, 0),
    at(cylGeo(0.04, 0.01, 0.3, 6), k.steel, 0, -2.0, -0.1),
  );
  for (let n = 0; n < 4; n++) g.add(at(boxGeo(0.5, 0.05, 0.06), k.black, 0, -0.3 + n * 0.15, -0.52));
  return g;
}
// CRUSHER: a siege machine that throws itself at you. A low hull with a stepped upper deck and a sloped bow; a
// toothed ram held out on two hydraulic arms; four landing legs on rams of their own, a jump jet beside each; a
// rocket pod on each shoulder; stacks and a radiator behind; one narrow slit to see through
export function crusherLook(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group(),
    k = machine(),
    glow = basicMat(COLOR.amber),
    bow = at(boxGeo(2.5, 1.0, 0.5), mat, 0, 0.45, 1.36);
  bow.rotation.x = -0.5; // the sloped bow plate
  g.add(
    at(boxGeo(3.0, 1.25, 3.0), mat, 0, -0.55, 0), // the lower hull
    at(boxGeo(2.5, 1.05, 2.3), mat, 0, 0.58, -0.2), // the upper deck
    bow,
    at(boxGeo(1.5, 0.42, 1.3), mat, 0, 1.3, -0.45), // the cupola
    at(boxGeo(1.1, 0.1, 0.05), glow, 0, 1.3, 0.21), // its slit
    at(cylGeo(0.09, 0.09, 0.1, 10), basicMat(COLOR.mag), 0.52, 1.36, 0.22, 'z'), // the range-finder beside it
    at(boxGeo(3.06, 0.07, 3.06), k.black, 0, 0.09, 0), // the seam between hull and deck
    at(boxGeo(0.05, 0.16, 2.2), glow, 1.52, -0.3, 0), // the running lights down each side
    at(boxGeo(0.05, 0.16, 2.2), glow, -1.52, -0.3, 0),
  );
  // the ram: a slab with teeth, held out in front on two arms
  g.add(at(boxGeo(3.4, 1.5, 0.34), bladeMat(), 0, -0.55, 2.05));
  for (let n = 0; n < 6; n++) {
    const tooth = at(boxGeo(0.34, 0.34, 0.5), k.steel, -1.4 + n * 0.56, -1.2, 2.32);
    tooth.rotation.x = Math.PI / 4;
    g.add(tooth);
  }
  for (const x of [-1.0, 1.0]) {
    g.add(piston(V(x, -0.2, 1.4), V(x, -0.4, 1.95), 0.13), piston(V(x, -0.95, 1.4), V(x, -0.8, 1.95), 0.1));
    g.add(at(boxGeo(0.3, 0.9, 0.2), k.black, x, -0.6, 1.5)); // the arms' mount on the bow
  }
  // the legs: a ram down from each corner to a pad, and a jump jet beside it
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 1.25,
        z = sz * 1.2;
      g.add(
        piston(V(x * 1.02, -0.7, z), V(x * 1.16, -1.5, z * 1.08), 0.16),
        at(boxGeo(0.7, 0.14, 0.8), k.black, x * 1.16, -1.53, z * 1.08), // the pad
        at(cylGeo(0.2, 0.28, 0.4, 10), k.black, x * 0.6, -1.3, z * 0.75), // the jet's bell
        at(cylGeo(0.17, 0.2, 0.06, 10), k.jet, x * 0.6, -1.5, z * 0.75), // its throat, hot
      );
    }
  // the rocket pods: a box on each shoulder with six tubes in its face
  for (const sx of [-1, 1]) {
    g.add(
      at(boxGeo(0.7, 0.62, 1.3), mat, sx * 1.62, 0.75, -0.2),
      at(boxGeo(0.2, 0.3, 0.5), k.black, sx * 1.27, 0.7, -0.2),
    );
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 3; c++)
        g.add(at(cylGeo(0.075, 0.075, 0.06, 8), k.black, sx * 1.62 + (c - 1) * 0.2, 0.62 + r * 0.26, 0.46, 'z'));
  }
  // behind: two exhaust stacks and the radiator's slats
  for (const x of [-0.7, 0.7])
    g.add(
      at(cylGeo(0.13, 0.16, 1.1, 10), k.black, x, 1.3, -1.25),
      at(cylGeo(0.17, 0.17, 0.1, 10), k.steel, x, 1.86, -1.25),
    );
  for (let n = 0; n < 5; n++) g.add(at(boxGeo(1.6, 0.06, 0.1), k.black, 0, 0.2 + n * 0.17, -1.38));
  // a whip aerial and the grab rails along the deck
  g.add(
    at(cylGeo(0.012, 0.03, 1.7, 6), k.steel, -0.6, 2.3, -0.9),
    at(boxGeo(0.04, 0.04, 1.6), k.steel, 1.1, 1.2, -0.2),
    at(boxGeo(0.04, 0.04, 1.6), k.steel, -1.1, 1.2, -0.2),
  );
  return g;
}
// TRINITY: one of its three bodies: a gun platform that spins as it flies, so it is the same all the way round. A
// six-sided hull tapering up and down; three guns and, between them, three blades it rams with; a turret with a slit
// all round and an aerial on top (the link the three share their health over); a lift jet under it. The band and the
// slit are in the body's own colour (the three share their body material)
export function trinityBodyLook(mat: THREE.Material, color: number): THREE.Group {
  const b = new THREE.Group(),
    k = machine(),
    glow = basicMat(color);
  b.add(
    at(prismGeo(0.9, 0.9, 0.5, 6), mat, 0, 0, 0), // the hull
    at(prismGeo(0.42, 0.9, 0.5, 6), mat, 0, 0.5, 0),
    at(prismGeo(0.9, 0.3, 0.75, 6), mat, 0, -0.625, 0),
    at(cylGeo(0.93, 0.93, 0.05, 6), k.black, 0, 0.25, 0), // the seams
    at(cylGeo(0.93, 0.93, 0.05, 6), k.black, 0, -0.25, 0),
    at(cylGeo(0.94, 0.94, 0.06, 6), glow, 0, 0, 0), // the band
    at(cylGeo(0.36, 0.4, 0.22, 10), k.black, 0, 0.86, 0), // the turret
    at(cylGeo(0.41, 0.41, 0.04, 10), glow, 0, 0.88, 0), // its slit
    at(cylGeo(0.012, 0.03, 0.8, 6), k.steel, 0, 1.37, 0), // the aerial
    at(cylGeo(0.26, 0.34, 0.24, 10), k.black, 0, -1.1, 0), // the lift jet's bell
    at(cylGeo(0.26, 0.26, 0.04, 10), k.jet, 0, -1.21, 0), // its throat, hot
    // the guns: a mount on every other face, a barrel out of it
    ...spokes(3, 0, s =>
      s.add(
        at(boxGeo(0.3, 0.3, 0.36), k.black, 0.86, 0, 0),
        at(cylGeo(0.06, 0.06, 0.4, 8), k.black, 1.12, 0, 0, 'x'),
        at(cylGeo(0.085, 0.085, 0.1, 8), k.steel, 1.29, 0, 0, 'x'),
      ),
    ),
    // the blades on the faces between, a steel edge outward
    ...spokes(3, Math.PI / 3, s =>
      s.add(at(boxGeo(0.5, 0.9, 0.07), mat, 1.0, -0.1, 0), at(boxGeo(0.05, 0.9, 0.1), k.steel, 1.26, -0.1, 0)),
    ),
  );
  return b;
}
// NOISE CORE: a reactor that hangs in the middle of the room. What turns (knot) is its rotor: an armoured core, lit
// along its seams and white-hot at its poles, in a flywheel with three emitters on it and a steel hoop across it. The
// frame it tumbles in stands still: three pylons with radiator slats, a lift jet under each, rams in to the hubs above
// and below, two rings round them (one lit), the beams' head under the lower hub
export function coreLook(mat: THREE.Material): { g: THREE.Group; knot: THREE.Mesh } {
  const g = new THREE.Group(),
    k = machine(),
    glow = basicMat(COLOR.violet),
    white = basicMat(0xffffff),
    knot = new THREE.Mesh(plateBallGeo(0.72), mat);
  knot.add(
    at(cylGeo(0.735, 0.735, 0.05, 14), glow, 0, 0, 0, 'z'), // the lit seams
    at(cylGeo(0.735, 0.735, 0.05, 14), glow, 0, 0, 0, 'x'),
    at(cylGeo(0.16, 0.16, 0.1, 10), white, 0, 0.7, 0), // the poles
    at(cylGeo(0.16, 0.16, 0.1, 10), white, 0, -0.7, 0),
    at(flywheelGeo(), mat, 0, 0, 0),
    turned(at(torusGeo(1.0, 0.04), k.steel, 0, 0, 0), 0, HALF, 0),
    at(cylGeo(0.06, 0.06, 0.5, 8), k.steel, 0.9, 0, 0, 'x'), // the flywheel's spokes
    at(cylGeo(0.06, 0.06, 0.5, 8), k.steel, -0.9, 0, 0, 'x'),
    at(cylGeo(0.06, 0.06, 0.5, 8), k.steel, 0, 0.9, 0),
    at(cylGeo(0.06, 0.06, 0.5, 8), k.steel, 0, -0.9, 0),
  );
  for (let n = 0; n < 3; n++) {
    const a = (n / 3) * Math.PI * 2 + 0.5,
      emitter = new THREE.Group();
    emitter.position.set(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0);
    emitter.rotation.z = a;
    emitter.add(at(boxGeo(0.5, 0.36, 0.5), k.black, 0, 0, 0), at(boxGeo(0.04, 0.16, 0.16), glow, 0.26, 0, 0));
    knot.add(emitter);
  }
  const ringA = turned(at(torusGeo(2.0, 0.08), k.black, 0, 1.2, 0), HALF, 0, 0),
    ringB = turned(at(torusGeo(2.0, 0.08), k.black, 0, -1.2, 0), HALF, 0, 0),
    lit = turned(at(torusGeo(2.0, 0.03), glow, 0, 1.32, 0), HALF, 0, 0);
  g.add(
    knot,
    ringA,
    ringB,
    lit,
    at(cylGeo(0.34, 0.42, 0.3, 10), k.black, 0, 1.9, 0), // the hubs
    at(cylGeo(0.42, 0.34, 0.3, 10), k.black, 0, -1.9, 0),
    at(boxGeo(0.5, 0.16, 0.5), mat, 0, 2.12, 0), // the box on the upper one, an aerial out of it
    at(cylGeo(0.012, 0.03, 0.8, 6), k.steel, 0.15, 2.6, 0.1),
    at(cylGeo(0.3, 0.2, 0.2, 8), k.steel, 0, -2.14, 0), // the beams' head
    at(cylGeo(0.31, 0.31, 0.04, 8), glow, 0, -2.1, 0),
    ...spokes(3, Math.PI / 6, s => {
      s.add(
        at(boxGeo(0.34, 3.0, 0.5), mat, 2.0, 0, 0), // the pylon
        at(boxGeo(0.03, 1.1, 0.08), glow, 2.18, -0.35, 0), // the light down its outside
        at(cylGeo(0.14, 0.2, 0.3, 8), k.black, 2.0, -1.62, 0), // the lift jet under it
        at(cylGeo(0.13, 0.13, 0.04, 8), k.jet, 2.0, -1.78, 0),
        piston(V(0.3, 1.88, 0), V(1.85, 1.38, 0), 0.08),
        piston(V(0.3, -1.88, 0), V(1.85, -1.38, 0), 0.08),
      );
      for (let n = 0; n < 3; n++) s.add(at(boxGeo(0.12, 0.05, 0.6), k.black, 2.2, 0.6 + n * 0.16, 0));
    }),
  );
  return { g, knot };
}
// BASTION: a fortress round a reactor. A plinth of two eight-sided tiers on the ground, twin guns and radiator slats
// in every other face (its rings of shots); on the faces between, four buttresses, each with a claw that leans in over
// the reactor, an emitter at its tip, a ram to brace it and an exhaust stack. The reactor (core) tumbles between the
// claws over the feed in the deck: a faceted ball in two steel hoops with capped ports. The shield (the fight's own
// sphere) covers it all (color = the boss's own colour: the bands and the emitters)
export function bastionLook(mat: THREE.Material, color: number): { g: THREE.Group; core: THREE.Mesh } {
  const g = new THREE.Group(),
    k = machine(),
    glow = basicMat(color),
    core = new THREE.Mesh(plateBallGeo(1.0), mat);
  core.position.y = 0.25;
  core.add(
    turned(at(torusGeo(1.03, 0.05), glow, 0, 0, 0), HALF, 0, 0), // the band
    at(torusGeo(1.08, 0.04), k.steel, 0, 0, 0), // the hoops
    turned(at(torusGeo(1.08, 0.04), k.steel, 0, 0, 0), 0, HALF, 0),
    at(cylGeo(0.14, 0.14, 0.04, 10), glow, 0, 1.06, 0), // the lit ports at its poles
    at(cylGeo(0.14, 0.14, 0.04, 10), glow, 0, -1.06, 0),
  );
  for (const s of [-1, 1])
    core.add(
      at(cylGeo(0.3, 0.3, 0.14, 10), k.black, s * 0.98, 0, 0, 'x'), // the ports' caps
      at(cylGeo(0.3, 0.3, 0.14, 10), k.black, 0, s * 0.98, 0),
      at(cylGeo(0.3, 0.3, 0.14, 10), k.black, 0, 0, s * 0.98, 'z'),
    );
  g.add(
    core,
    at(prismGeo(2.7, 3.0, 0.7, 8), mat, 0, -2.05, 0), // the plinth's lower tier
    at(prismGeo(2.2, 2.5, 0.7, 8), mat, 0, -1.35, 0), // its upper tier
    at(cylGeo(2.74, 2.74, 0.06, 8), k.black, 0, -1.7, 0), // the seam between them
    at(cylGeo(2.23, 2.23, 0.06, 8), glow, 0, -1.0, 0), // the lit rim of the deck
    at(cylGeo(2.15, 2.15, 0.08, 8), k.black, 0, -0.98, 0), // the deck
    at(cylGeo(0.4, 0.6, 0.16, 10), k.black, 0, -0.9, 0), // the feed under the reactor
    at(cylGeo(0.3, 0.3, 0.04, 10), k.jet, 0, -0.82, 0),
    // the buttresses and their claws
    ...spokes(4, Math.PI / 8, (s, n) => {
      s.add(
        at(boxGeo(1.0, 1.6, 0.7), mat, 2.45, -1.6, 0),
        turned(at(boxGeo(0.36, 1.9, 0.5), mat, 2.05, 0.05, 0), 0, 0, 0.3),
        at(boxGeo(0.5, 0.3, 0.6), k.black, 1.7, 1.0, 0), // the emitter at the claw's tip
        at(boxGeo(0.04, 0.1, 0.4), glow, 1.44, 1.0, 0),
        piston(V(1.5, -0.95, 0), V(1.92, 0.1, 0), 0.09),
        at(cylGeo(0.1, 0.13, 0.8, 8), k.black, 2.62, -0.45, 0.22), // the stack
        at(cylGeo(0.14, 0.14, 0.08, 8), k.steel, 2.62, -0.05, 0.22),
      );
      if (n === 0) s.add(at(cylGeo(0.012, 0.03, 1.0, 6), k.steel, 1.75, 1.65, 0.15)); // one aerial
    }),
    // the guns in the faces between: a dark port with two barrels, slats in the tier under it
    ...spokes(4, (Math.PI * 3) / 8, s => {
      s.add(
        at(boxGeo(0.12, 0.4, 1.0), k.black, 2.2, -1.35, 0),
        at(boxGeo(0.1, 0.06, 1.2), k.black, 2.66, -1.95, 0),
        at(boxGeo(0.1, 0.06, 1.2), k.black, 2.63, -2.1, 0),
      );
      for (const z of [-0.25, 0.25])
        s.add(
          at(cylGeo(0.07, 0.07, 0.5, 8), k.black, 2.42, -1.35, z, 'x'),
          at(cylGeo(0.095, 0.095, 0.1, 8), k.steel, 2.64, -1.35, z, 'x'),
        );
    }),
  );
  return { g, core };
}
