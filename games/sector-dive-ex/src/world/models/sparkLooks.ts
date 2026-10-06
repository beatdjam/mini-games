import * as THREE from 'three';
import { FX, parts } from '@engine/render/fx.ts';
import { shared } from '@engine/render/render.ts';
import { plainLooks } from '../looks.ts';
// The particles as sparks and smoke, to go with the looks (the plain ones are flat cubes of a colour): what flies
// out of a hit, a kill or a blast is a small sharp chip of light in its colour, added to what is behind it; what
// rises (smoke) is a soft grey that the scene shows through. Where and how the particles fly is the engine's and is
// not changed (engine/src/render/fx.ts)
const SPARK = 0.085; // half the length of a spark (m); a plain particle is a cube 0.13 across
const SPARK_GLOW = 0.95,
  SMOKE = 0.4; // how solid each is
const mats: Record<string, THREE.MeshBasicMaterial> = {};
const sparkMat = (color: number, rising: boolean): THREE.MeshBasicMaterial =>
  (mats[`${color},${rising}`] ??= shared(
    new THREE.MeshBasicMaterial(
      rising
        ? { color, transparent: true, opacity: SMOKE, depthWrite: false }
        : { color, transparent: true, opacity: SPARK_GLOW, depthWrite: false, blending: THREE.AdditiveBlending },
    ),
  ));
// call once at start, and again when the plain looks are switched (dev)
export function useSparkLooks() {
  const on = !plainLooks();
  FX.partMat = on ? sparkMat : null;
  const geo = on ? sparkGeo() : cubeGeo;
  parts.forEach(p => {
    p.mesh.geometry = geo as typeof p.mesh.geometry;
  });
}
const cubeGeo = parts[0]!.mesh.geometry; // the engine's own
let chip: THREE.BufferGeometry | null = null;
const sparkGeo = () => (chip ??= shared(new THREE.OctahedronGeometry(SPARK, 0)));
useSparkLooks();
