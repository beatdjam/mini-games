import * as THREE from 'three';
import { TEX, grain, paint } from '../world/looks/common.ts';
import type { Paint } from '../world/looks/common.ts';
// A trial of how real the gun in hand should look (dev only, ?gun=a / ?gun=b; src/dev/dev.ts): the handgun built two
// ways, to set beside the plain one (boxes in the body colours with a glowing strip, src/data/viewmodels.ts).
//   a: a pistol's own shape (slide, frame, raked grip, trigger guard, sights) in steel and polymer, nothing glowing
//      but the dots on the sights
//   b: the plain one's shape, with the steel and polymer on it and the glowing strip made thin
// Sizes and positions are in metres in camera space (-z is forward), as in src/data/viewmodels.ts.

// brushed gunmetal: fine lines along the gun, worn bright at the edges, grip cuts at the back end
const steelPaint: Paint = (g, rand) => {
  const base = g.createLinearGradient(0, 0, 0, TEX);
  base.addColorStop(0, '#4b5158');
  base.addColorStop(0.5, '#353a40');
  base.addColorStop(1, '#2a2e33');
  g.fillStyle = base;
  g.fillRect(0, 0, TEX, TEX);
  for (let n = 0; n < 260; n++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.09)';
    g.fillRect(rand() * TEX, rand() * TEX, 30 + rand() * 120, 1);
  }
  // the cuts the hand pulls the slide back by
  for (let x = TEX * 0.74; x < TEX * 0.95; x += 9) {
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillRect(x, TEX * 0.12, 4, TEX * 0.76);
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fillRect(x + 4, TEX * 0.12, 1.5, TEX * 0.76);
  }
  // wear along the long edges
  for (const y of [0, TEX - 5]) {
    g.fillStyle = 'rgba(205,212,220,.3)';
    g.fillRect(0, y, TEX, 5);
  }
  grain(g, rand, 12);
};
// black polymer: a matt body with a stippled patch to hold it by
const polymerPaint: Paint = (g, rand) => {
  g.fillStyle = '#1c1e21';
  g.fillRect(0, 0, TEX, TEX);
  for (let y = 26; y < TEX - 20; y += 7)
    for (let x = 22 + ((y / 7) % 2) * 3.5; x < TEX - 20; x += 7) {
      g.fillStyle = 'rgba(255,255,255,.07)';
      g.fillRect(x, y, 2, 2);
      g.fillStyle = 'rgba(0,0,0,.4)';
      g.fillRect(x + 2, y + 2, 2, 2);
    }
  grain(g, rand, 10);
};
let mats: { steel: THREE.Material; polymer: THREE.Material; black: THREE.Material } | null = null;
const shared = () =>
  (mats ??= {
    steel: new THREE.MeshLambertMaterial({ map: paint(2001, steelPaint) }),
    polymer: new THREE.MeshLambertMaterial({ map: paint(2002, polymerPaint) }),
    black: new THREE.MeshLambertMaterial({ color: 0x0c0d0f }),
  });
const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, tilt = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.x = tilt;
  return m;
};
// the group buildViewmodel (engine) would return: the parts, and userData { tip, flash, pos }
function finish(g: THREE.Group, tip: [number, number, number], pos: [number, number, number]): THREE.Group {
  const at = new THREE.Object3D();
  at.position.set(...tip);
  g.add(at);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  flash.position.copy(at.position);
  flash.visible = false;
  g.add(flash);
  g.userData = { tip: at, flash, pos };
  return g;
}
// acc = the weapon's colour (the dots on the sights of `a`, the strip of `b`)
export function pistolLook(kind: 'a' | 'b', acc: number): THREE.Group {
  const m = shared(),
    glow = new THREE.MeshBasicMaterial({ color: acc }),
    g = new THREE.Group();
  if (kind === 'b') {
    g.add(
      box(0.1, 0.13, 0.34, m.steel, 0, 0, 0),
      box(0.104, 0.012, 0.3, glow, 0, 0.05, 0),
      box(0.05, 0.05, 0.12, m.black, 0, 0.01, -0.22),
      box(0.08, 0.2, 0.09, m.polymer, 0, -0.13, 0.1),
    );
    return finish(g, [0, 0.01, -0.3], [0.28, -0.28, -0.55]);
  }
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.03, 12), m.black);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.048, -0.205);
  g.add(
    box(0.066, 0.06, 0.38, m.steel, 0, 0.048, -0.01), // the slide
    box(0.06, 0.05, 0.3, m.polymer, 0, -0.004, 0.0), // the frame under it
    barrel,
    box(0.058, 0.21, 0.105, m.polymer, 0, -0.125, 0.105, 0.22), // the grip, raked back
    box(0.05, 0.03, 0.07, m.black, 0, -0.235, 0.135, 0.22), // the magazine's base plate
    box(0.03, 0.012, 0.1, m.polymer, 0, -0.082, -0.035), // the trigger guard: under ...
    box(0.03, 0.058, 0.012, m.polymer, 0, -0.055, -0.085), // ... and in front
    box(0.012, 0.042, 0.014, m.black, 0, -0.05, -0.02, -0.3), // the trigger
    box(0.014, 0.016, 0.022, m.black, 0.02, 0.086, 0.15), // the rear sight's two posts
    box(0.014, 0.016, 0.022, m.black, -0.02, 0.086, 0.15),
    box(0.012, 0.016, 0.024, m.black, 0, 0.086, -0.18), // the front sight
    box(0.007, 0.007, 0.004, glow, 0.02, 0.087, 0.162), // the dots on the sights, in the weapon's colour
    box(0.007, 0.007, 0.004, glow, -0.02, 0.087, 0.162),
    box(0.006, 0.007, 0.004, glow, 0, 0.087, -0.167),
    box(0.05, 0.05, 0.012, m.black, 0, 0.046, 0.183), // the back plate of the slide
  );
  return finish(g, [0, 0.048, -0.23], [0.26, -0.26, -0.55]);
}
