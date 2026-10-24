import * as THREE from 'three';
import { basicMat, dynGroup, shared } from '@engine/render/render.ts';
import { floorY } from '@engine/world/tiles.ts';
import { at, ballGeo, boxGeo, cylGeo, groundPool, machine } from './machine.ts';
import { plainLooks } from '../looks.ts';
import { geoCache } from '../render.ts';
import { COLOR } from '../../data/colors.ts';
// The enemies' bullets as tracers, to go with the guns and the player's own tracers: a white-hot streak along the
// bullet's flight, in a glow of the bullet's colour, and a small pool of that colour on the ground under it (as
// the enemies have): where it is and how high. The colour is light, see-through and added to what is behind it (a
// solid block of colour looks like a toy). The bullet's colour, its size, how it flies and what it hits are not
// changed. The plain one (a glowing ball, which hangs in the air like nothing a gun fires) is still there for
// comparing (dev: ?plain).
const POOL_SIDE = 1.1; // the pool under a bullet of size 1 (m)
const POOL_Y = 0.07; // above the ground (and above the enemies' pools)
const along = (g: THREE.BufferGeometry) => shared(g.rotateX(Math.PI / 2)); // a cylinder laid along the flight (z)
const GEO = {
  glow: along(new THREE.CylinderGeometry(0.13, 0.13, 0.95, 10)),
  core: along(new THREE.CylinderGeometry(0.05, 0.05, 0.82, 8)),
};
const CORE = 0xfff4dc; // white-hot
const GLOW = 0.75; // how strong the colour round the core is
const glowMats: Record<number, THREE.Material> = {};
const glowMat = (color: number) =>
  (glowMats[color] ??= shared(
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: GLOW,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  ));
interface Extras {
  core: THREE.Mesh; // a child of the bullet's mesh
  pool: THREE.Mesh; // on the ground, not a child (it must not turn or rise with the bullet)
}
interface Dressed {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  alive: boolean;
}
const extrasOf = (b: Dressed): Extras | undefined => b.mesh.userData.extras;
// a bullet has just been fired (its mesh has its colour and its size): makes it a tracer
export function dressEBullet(b: Dressed, color: number) {
  let x = extrasOf(b);
  if (plainLooks()) {
    // (a mesh that was a tracer before goes back to the plain ball)
    b.mesh.geometry = geoCache.ebullet!;
    if (x) for (const m of [x.core, x.pool]) m.visible = false;
    return;
  }
  if (!x) {
    x = { core: new THREE.Mesh(GEO.core, basicMat(CORE)), pool: groundPool(color, POOL_SIDE) };
    b.mesh.add(x.core);
    dynGroup.add(x.pool);
    b.mesh.userData.extras = x;
  }
  b.mesh.geometry = GEO.glow;
  b.mesh.material = glowMat(color);
  x.core.visible = true;
  x.pool.material = groundPool(color, POOL_SIDE).material;
  x.pool.scale.setScalar(b.size);
  poseEBullet(b);
}
// every frame: a living bullet points where it flies and its pool lies under it; a dead one's pool goes
export function poseEBullet(b: Dressed) {
  const x = extrasOf(b);
  if (!x) return;
  if (!b.alive || plainLooks()) {
    x.pool.visible = false;
    return;
  }
  b.mesh.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
  x.pool.visible = true;
  x.pool.position.set(b.x, floorY(b.x, b.z) + POOL_Y, b.z);
}

// The mortar's round (actors/mortar.ts) as a mortar bomb, not a glowing ball: a dark olive body tapering to a steel
// nose with its fuse, a tail boom with four fins, and the charge burning at the tail. Made along +y with the nose up;
// the round is turned to point where it flies. Its size is for the eye (it is seen from far, against the ceiling)
const shellMats: Record<string, THREE.Material> = {};
const shellBody = () =>
  (shellMats.body ??= shared(new THREE.MeshPhongMaterial({ color: 0x4b5236, specular: 0x30362a, shininess: 20 })));
const shellBurn = () =>
  (shellMats.burn ??= shared(
    new THREE.MeshBasicMaterial({
      color: 0xffa040,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  ));
export function mortarRound(): THREE.Group {
  const k = machine(),
    body = shellBody(),
    burn = shellBurn(),
    g = new THREE.Group();
  g.add(
    at(cylGeo(0.16, 0.12, 0.42, 12), body, 0, 0.05, 0), // the body
    at(cylGeo(0.07, 0.16, 0.2, 12), body, 0, 0.36, 0), // its shoulder
    at(cylGeo(0.025, 0.07, 0.12, 10), k.steel, 0, 0.52, 0), // the nose
    at(cylGeo(0.03, 0.03, 0.04, 8), basicMat(COLOR.orange), 0, 0.6, 0), // the fuse
    at(cylGeo(0.165, 0.165, 0.03, 12), k.black, 0, 0.14, 0), // the band round the body
    at(cylGeo(0.05, 0.05, 0.3, 8), k.steel, 0, -0.3, 0), // the tail boom
    at(ballGeo(0.12), burn, 0, -0.5, 0), // the charge burning at the tail
  );
  for (let i = 0; i < 4; i++) {
    const fin = at(boxGeo(0.02, 0.2, 0.26), k.black, 0, -0.36, 0);
    fin.rotation.y = (i * Math.PI) / 2;
    fin.translateZ(0.1);
    g.add(fin);
  }
  return g;
}
