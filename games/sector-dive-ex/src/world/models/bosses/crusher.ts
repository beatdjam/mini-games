import * as THREE from 'three';
import { basicMat } from '@engine/render/render.ts';
import { COLOR } from '../../../data/colors.ts';
import { V, at, bladeMat, boxGeo, cylGeo, machine, piston } from '../machine.ts';
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
