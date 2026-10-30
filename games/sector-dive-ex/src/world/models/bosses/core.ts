import * as THREE from 'three';
import { basicMat, shared } from '@engine/render/render.ts';
import { COLOR } from '../../../data/colors.ts';
import { V, at, boxGeo, cylGeo, machine, piston } from '../machine.ts';
import { HALF, plateBallGeo, spokes, torusGeo, turned } from './shared.ts';
// the flywheel of the NOISE CORE's rotor: a ring with flat faces
let wheelGeo: THREE.BufferGeometry | null = null;
function flywheelGeo(): THREE.BufferGeometry {
  if (wheelGeo) return wheelGeo;
  wheelGeo = shared(new THREE.TorusGeometry(1.3, 0.2, 6, 16).toNonIndexed());
  wheelGeo.computeVertexNormals();
  return wheelGeo;
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
