import * as THREE from 'three';
import { basicMat } from '@engine/render/render.ts';
import { COLOR } from '../../../data/colors.ts';
import { V, at, boxGeo, cylGeo, machine, piston } from '../machine.ts';
import { HALF, prismGeo, torusGeo, turned } from './shared.ts';
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
