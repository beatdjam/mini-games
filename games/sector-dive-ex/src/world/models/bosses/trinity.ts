import * as THREE from 'three';
import { basicMat } from '@engine/render/render.ts';
import { at, boxGeo, cylGeo, machine } from '../machine.ts';
import { prismGeo, spokes } from './shared.ts';
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
