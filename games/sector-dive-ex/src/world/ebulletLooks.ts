import * as THREE from 'three';
import { basicMat, dynGroup, shared } from '@engine/render/render.ts';
import { floorY } from '@engine/world/tiles.ts';
import { groundPool } from './enemyLooks.ts';
import { plainLooks } from './looks.ts';
import { geoCache } from './render.ts';
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
