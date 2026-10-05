import * as THREE from 'three';
import { basicMat, dynGroup, shared } from '@engine/render/render.ts';
import { floorY } from '@engine/world/tiles.ts';
import { groundPool } from './enemyLooks.ts';
import { geoCache } from './render.ts';
// A trial of how the enemies' bullets should look (dev only, ?ebullet=a / ?ebullet=b; src/dev/dev.ts). The plain
// one is a glowing ball, which hangs in the air like nothing a gun fires. Both trials keep the bullet's colour, its
// size on screen and everything about how it flies and hits; they give it a direction and a place:
//   a: a tracer: a white-hot streak along its flight, in a glow of its colour
//   b: a white-hot ball in a glow of its colour, with a tail of that colour behind it
// (the colour is light, see-through and added to what is behind it: a solid block of colour looks like a toy)
// and under either, a small pool of its colour on the ground (as the enemies have): where it is and how high.
export type EBulletStyle = 'plain' | 'a' | 'b';
let style: EBulletStyle = 'plain';
export function devEBulletStyle(s: EBulletStyle) {
  style = s;
}
const POOL_SIDE = 1.1; // the pool under a bullet of size 1 (m)
const POOL_Y = 0.07; // above the ground (and above the enemies' pools)
const along = (g: THREE.BufferGeometry) => shared(g.rotateX(Math.PI / 2)); // a cylinder or a cone laid along the flight (z)
const GEO = {
  // a: the round, and its core
  slug: along(new THREE.CylinderGeometry(0.13, 0.13, 1.15, 10)),
  slugCore: along(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8)),
  // b: the ball, its core, and the tail behind it (its point away from the flight)
  ball: shared(new THREE.SphereGeometry(0.19, 10, 8)),
  ballCore: shared(new THREE.SphereGeometry(0.09, 8, 6)),
  tail: shared(new THREE.ConeGeometry(0.15, 1.3, 10).rotateX(-Math.PI / 2).translate(0, 0, -0.7)),
};
const CORE = 0xfff4dc; // white-hot
// the bullet's colour as light: the glow round the core (strong) and the tail (weak)
const lightMats: Record<string, THREE.Material> = {};
const lightMat = (color: number, opacity: number) =>
  (lightMats[`${color},${opacity}`] ??= shared(
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  ));
const GLOW = 0.75,
  TAIL = 0.4;
interface Extras {
  core: THREE.Mesh; // a child of the bullet's mesh
  tail: THREE.Mesh; // ... (b only)
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
function extrasOf(b: Dressed): Extras {
  const kept = b.mesh.userData.extras as Extras | undefined;
  if (kept) return kept;
  const made: Extras = {
    core: new THREE.Mesh(GEO.slugCore, basicMat(CORE)),
    tail: new THREE.Mesh(GEO.tail, lightMat(0xffffff, TAIL)),
    pool: groundPool(0xffffff, POOL_SIDE),
  };
  b.mesh.add(made.core, made.tail);
  dynGroup.add(made.pool);
  b.mesh.userData.extras = made;
  return made;
}
// a bullet has just been fired (its mesh has its colour and its size): gives it the look that is on
export function dressEBullet(b: Dressed, color: number) {
  if (style === 'plain') {
    // (a mesh used with a look before goes back to the plain ball)
    b.mesh.geometry = geoCache.ebullet!;
    const kept = b.mesh.userData.extras as Extras | undefined;
    if (kept) for (const m of [kept.core, kept.tail, kept.pool]) m.visible = false;
    return;
  }
  const x = extrasOf(b),
    lit = groundPool(color, POOL_SIDE);
  b.mesh.geometry = style === 'a' ? GEO.slug : GEO.ball;
  b.mesh.material = lightMat(color, GLOW);
  x.core.geometry = style === 'a' ? GEO.slugCore : GEO.ballCore;
  x.core.visible = true;
  x.tail.visible = style === 'b';
  x.tail.material = lightMat(color, TAIL);
  x.pool.material = lit.material;
  x.pool.scale.setScalar(b.size);
  poseEBullet(b);
}
// every frame: a living bullet points where it flies and its pool lies under it; a dead one's pool goes
export function poseEBullet(b: Dressed) {
  const x = b.mesh.userData.extras as Extras | undefined;
  if (!x) return;
  if (!b.alive || style === 'plain') {
    x.pool.visible = false;
    return;
  }
  b.mesh.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
  x.pool.visible = true;
  x.pool.position.set(b.x, floorY(b.x, b.z) + POOL_Y, b.z);
}
