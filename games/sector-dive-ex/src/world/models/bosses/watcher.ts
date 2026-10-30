import * as THREE from 'three';
import { basicMat } from '@engine/render/render.ts';
import { COLOR } from '../../../data/colors.ts';
import { V, at, boxGeo, cylGeo, machine, piston } from '../machine.ts';
import { prismGeo, spokes, torusGeo, turned } from './shared.ts';
// a prism laid along z (its top to the front), a flat face up (seg = how many faces it has)
const laid = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, z: number, seg: number) =>
  turned(at(geo, mat, 0, y, z), Math.PI / 2, Math.PI / seg, 0);
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
