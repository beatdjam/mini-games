import * as THREE from 'three';
import { basicMat } from '@engine/render/render.ts';
import { V, at, boxGeo, cylGeo, machine, piston } from '../machine.ts';
import { HALF, plateBallGeo, prismGeo, spokes, torusGeo, turned } from './shared.ts';
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
