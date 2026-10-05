import * as THREE from 'three';
import { basicMat, shared } from '@engine/render/render.ts';
import { COLOR } from '../data/colors.ts';
import { LOOK_GLOW, at, ballGeo, bladeMat, boxGeo, cylGeo, darkMat, lookBodyMat, steelMat } from './enemyLooks.ts';
// The bosses as machines, as the enemies are (world/enemyLooks.ts): dark armour plate, what glows kept to slits,
// bands and lenses in the boss's own colour, a pool of that colour on the ground under it (actors/bosses/common.ts
// bossBase). Each keeps the size and the parts its fight uses (data/bosses.ts, actors/bosses/<name>.ts): the looks
// only say what those parts are. The plain bosses (glowing solids with outlines) are in the bosses' own files (dev:
// ?plain).

// a boss's body material: armour plate with a little of its colour in it (more while it flashes). userData tells
// bossBase how it glows at rest and which colour its pool on the ground is
export function bossBodyMat(color: number): THREE.MeshLambertMaterial {
  const m = lookBodyMat({ color });
  m.userData.glow = LOOK_GLOW;
  m.userData.pool = color;
  return m;
}
export const BOSS_POOL_SIDE = 9; // the pool of light under a boss (m)
const torusGeos: Record<string, THREE.BufferGeometry> = {};
const torusGeo = (r: number, tube: number) =>
  (torusGeos[`${r},${tube}`] ??= shared(new THREE.TorusGeometry(r, tube, 8, 28)));

// WATCHER: a faceted eye the size of a room's door, one great lens, a lit band round it, aerials on top
export function watcherLook(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group(),
    glow = basicMat(COLOR.cyan),
    band = at(torusGeo(2.02, 0.07), glow, 0, 0, 0);
  band.rotation.x = Math.PI / 2;
  g.add(
    at(ballGeo(2.0, 1), mat, 0, 0, 0),
    band,
    at(cylGeo(1.05, 1.2, 0.6, 16), darkMat(), 0, 0, 1.62, 'z'), // the lens's housing
    at(cylGeo(0.72, 0.72, 0.1, 18), basicMat(COLOR.mag), 0, 0, 1.94, 'z'), // the lens
    at(cylGeo(0.3, 0.3, 0.12, 12), basicMat(0xffffff), 0, 0, 1.96, 'z'), // its hot middle
  );
  for (const [x, z] of [
    [0.5, -0.3],
    [-0.4, 0.2],
    [0, -0.7],
  ] as const)
    g.add(at(cylGeo(0.03, 0.05, 1.3, 6), steelMat(), x, 2.4, z));
  for (const a of [0.8, 2.4, 4.0, 5.5])
    g.add(at(boxGeo(0.5, 0.4, 0.5), darkMat(), Math.cos(a) * 1.5, -1.5, Math.sin(a) * 1.5));
  return g;
}
// PHANTOM: a tall narrow sniper: an armoured spindle with a long barrel under its lens and a fin on each side
// (color = the boss's own colour: its seam and the edge of its fins)
export function phantomLook(mat: THREE.Material, color: number): THREE.Group {
  const g = new THREE.Group(),
    glow = basicMat(color),
    body = new THREE.Mesh(shared(new THREE.OctahedronGeometry(1.2, 0)), mat);
  body.scale.set(0.8, 1.7, 0.8);
  g.add(
    body,
    at(boxGeo(0.06, 2.6, 0.06), glow, 0, 0, 0.5), // the lit seam down its front
    at(cylGeo(0.36, 0.42, 0.4, 14), darkMat(), 0, 0.5, 0.62, 'z'), // the lens's housing
    at(cylGeo(0.26, 0.26, 0.06, 14), basicMat(COLOR.mag), 0, 0.5, 0.84, 'z'), // the lens
    at(cylGeo(0.09, 0.09, 1.9, 10), darkMat(), 0, 0.05, 1.3, 'z'), // the barrel
    at(cylGeo(0.14, 0.14, 0.3, 10), steelMat(), 0, 0.05, 2.2, 'z'), // its muzzle brake
    at(boxGeo(1.5, 0.1, 0.5), darkMat(), 0, -0.3, -0.2), // the fins
    at(boxGeo(1.56, 0.04, 0.1), glow, 0, -0.3, 0.06),
  );
  return g;
}
// CRUSHER: a block of armour on four feet that throws itself at you: a ram plate across its front, a slit of light
// over it, a lit strip down each side
export function crusherLook(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group(),
    glow = basicMat(COLOR.amber);
  g.add(
    at(boxGeo(3.0, 2.5, 3.0), mat, 0, 0.2, 0),
    at(boxGeo(2.5, 0.5, 2.5), mat, 0, 1.55, -0.1), // the housing on top
    at(boxGeo(3.3, 1.7, 0.3), bladeMat(), 0, -0.35, 1.62), // the ram
    at(boxGeo(2.4, 0.24, 0.06), glow, 0, 0.95, 1.52), // the slit it sees through
    at(boxGeo(0.06, 0.2, 2.6), glow, 1.52, 0.6, 0), // the strips
    at(boxGeo(0.06, 0.2, 2.6), glow, -1.52, 0.6, 0),
    at(boxGeo(2.2, 0.2, 0.06), glow, 0, 0.6, -1.52),
  );
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(at(boxGeo(0.9, 0.5, 0.9), darkMat(), sx * 1.1, -1.32, sz * 1.1));
  return g;
}
// TRINITY: one of its three bodies: an armoured spindle with a band and a lens in the body's own colour (they share
// their health and their body material)
export function trinityBodyLook(mat: THREE.Material, color: number): THREE.Group {
  const b = new THREE.Group(),
    glow = basicMat(color),
    band = at(torusGeo(0.86, 0.06), glow, 0, 0, 0);
  band.rotation.x = Math.PI / 2;
  b.add(
    new THREE.Mesh(shared(new THREE.OctahedronGeometry(1.2, 0)), mat),
    band,
    at(boxGeo(0.5, 0.1, 0.04), glow, 0, 0.3, 0.6), // the slit it sees through
    at(cylGeo(0.04, 0.06, 0.9, 6), steelMat(), 0, 1.5, 0), // its aerial
  );
  return b;
}
// NOISE CORE: a knot of armoured conduit round a core too bright to look at, in a cage of two rings
export function coreLook(mat: THREE.Material): { g: THREE.Group; knot: THREE.Mesh } {
  const g = new THREE.Group(),
    knot = new THREE.Mesh(shared(new THREE.TorusKnotGeometry(1.3, 0.38, 72, 8)), mat),
    ringA = at(torusGeo(2.15, 0.08), darkMat(), 0, 0, 0),
    ringB = at(torusGeo(2.15, 0.08), darkMat(), 0, 0, 0),
    lit = at(torusGeo(2.15, 0.03), basicMat(COLOR.violet), 0, 0, 0);
  ringA.rotation.x = Math.PI / 2;
  ringB.rotation.y = Math.PI / 2;
  lit.rotation.set(Math.PI / 2, 0, 0);
  lit.position.y = 0.12;
  g.add(
    knot,
    at(ballGeo(0.75, 2), basicMat(0xffffff), 0, 0, 0), // the core
    at(
      ballGeo(0.95, 2),
      new THREE.MeshBasicMaterial({ color: COLOR.violet, transparent: true, opacity: 0.35, depthWrite: false }),
      0,
      0,
      0,
    ),
    ringA,
    ringB,
    lit,
  );
  return { g, knot };
}
// BASTION: a reactor on an armoured plinth with four buttresses; the reactor is what the shield (the fight's own
// sphere) covers
// (color = the boss's own colour: the bands)
export function bastionLook(mat: THREE.Material, color: number): { g: THREE.Group; core: THREE.Mesh } {
  const g = new THREE.Group(),
    glow = basicMat(color),
    core = new THREE.Mesh(ballGeo(1.3, 1), mat),
    band = at(torusGeo(1.32, 0.06), glow, 0, 0, 0);
  band.rotation.x = Math.PI / 2;
  core.add(band); // it turns with the reactor
  g.add(
    at(cylGeo(2.4, 3, 1.6, 8), mat, 0, -1.6, 0), // the plinth
    at(cylGeo(2.44, 2.5, 0.12, 8), glow, 0, -1.0, 0), // the lit band round its top
    at(cylGeo(0.5, 0.7, 0.9, 10), darkMat(), 0, -0.65, 0), // the stem the reactor sits on
    core,
  );
  for (let n = 0; n < 4; n++) {
    const a = (n / 4) * Math.PI * 2 + Math.PI / 4,
      butt = at(boxGeo(0.7, 1.9, 1.3), darkMat(), Math.cos(a) * 2.6, -1.45, Math.sin(a) * 2.6);
    butt.rotation.y = -a + Math.PI / 2;
    g.add(butt);
  }
  return { g, core };
}
