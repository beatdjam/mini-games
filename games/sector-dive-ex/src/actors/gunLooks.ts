import * as THREE from 'three';
import { shared } from '@engine/render/render.ts';
import { TEX, grain, paint } from '../world/looks/common.ts';
import type { Paint } from '../world/looks/common.ts';
// The gun in hand, one look per weapon: each in its own shape (a pistol's slide and raked grip, a pump shotgun's
// two tubes and wooden forend ...) in steel, polymer and wood painted on canvases, as the sectors are (world/looks/).
// Nothing glows but small marks in the weapon's colour (the dots on the sights, a charge lamp), so a weapon can
// still be told by its colour. The plain guns (boxes in the body colours with a glowing strip, data/viewmodels.ts)
// are still there for comparing (dev: ?plain).
// Sizes and positions are in metres in camera space (-z is forward), as in data/viewmodels.ts. The gun sits low on
// the right of the screen, so what shows is its top, its back and its left side.

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
// oiled walnut: long dark streaks of grain
const woodPaint: Paint = (g, rand) => {
  const base = g.createLinearGradient(0, 0, 0, TEX);
  base.addColorStop(0, '#6a4226');
  base.addColorStop(1, '#4a2c18');
  g.fillStyle = base;
  g.fillRect(0, 0, TEX, TEX);
  for (let n = 0; n < 70; n++) {
    g.strokeStyle = `rgba(${rand() < 0.5 ? '30,15,6' : '150,100,60'},${0.12 + rand() * 0.2})`;
    g.lineWidth = 1 + rand() * 2.5;
    const y = rand() * TEX;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(
      TEX * 0.3,
      y + (rand() - 0.5) * 14,
      TEX * 0.7,
      y + (rand() - 0.5) * 14,
      TEX,
      y + (rand() - 0.5) * 8,
    );
    g.stroke();
  }
  grain(g, rand, 12);
};
// a launch tube's olive paint: chipped to the metal here and there, a yellow band round it
const tubePaint: Paint = (g, rand) => {
  g.fillStyle = '#4a5136';
  g.fillRect(0, 0, TEX, TEX);
  for (let n = 0; n < 120; n++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.12)';
    g.fillRect(rand() * TEX, rand() * TEX, 6 + rand() * 40, 2 + rand() * 6);
  }
  for (let n = 0; n < 18; n++) {
    g.fillStyle = 'rgba(160,166,170,.5)';
    g.fillRect(rand() * TEX, rand() * TEX, 2 + rand() * 7, 1 + rand() * 3);
  }
  g.fillStyle = '#b89a2c';
  g.fillRect(0, TEX * 0.2, TEX, 6);
  grain(g, rand, 12);
};
interface GunMats {
  steel: THREE.Material;
  polymer: THREE.Material;
  wood: THREE.Material;
  tube: THREE.Material;
  black: THREE.Material;
  copper: THREE.Material;
}
let mats: GunMats | null = null;
const gunMats = (): GunMats =>
  (mats ??= {
    // (shared: a gun lying on the floor is thrown away with its pickup, and these must outlive it)
    steel: shared(new THREE.MeshLambertMaterial({ map: paint(2001, steelPaint) })),
    polymer: shared(new THREE.MeshLambertMaterial({ map: paint(2002, polymerPaint) })),
    wood: shared(new THREE.MeshLambertMaterial({ map: paint(2003, woodPaint) })),
    tube: shared(new THREE.MeshLambertMaterial({ map: paint(2004, tubePaint) })),
    black: shared(new THREE.MeshLambertMaterial({ color: 0x0c0d0f })),
    copper: shared(new THREE.MeshLambertMaterial({ color: 0x9a6233 })),
  });
// a box; tilt = turned about x (a raked grip)
const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, tilt = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.x = tilt;
  return m;
};
// a cylinder along the barrel
const cyl = (r: number, len: number, mat: THREE.Material, x: number, y: number, z: number) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
};
// the muzzle flash, in multiples of the gun's flash size: the burst across the barrel, the tongue's length and width
const FLASH = { across: 5, along: 6, wide: 2.6 };
// a ragged star of fire: white-hot in the middle, orange out to the points
const flashPaint: Paint = (g, rand) => {
  g.clearRect(0, 0, TEX, TEX);
  const c = TEX / 2;
  g.translate(c, c);
  for (let n = 0; n < 9; n++) {
    const a = (n / 9) * Math.PI * 2 + rand() * 0.4,
      len = c * (0.55 + rand() * 0.45),
      half = 0.16 + rand() * 0.1,
      ray = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    ray.addColorStop(0, 'rgba(255,244,214,1)');
    ray.addColorStop(0.45, 'rgba(255,186,84,.85)');
    ray.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = ray;
    g.beginPath();
    g.moveTo(Math.cos(a - half) * c * 0.2, Math.sin(a - half) * c * 0.2);
    g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    g.lineTo(Math.cos(a + half) * c * 0.2, Math.sin(a + half) * c * 0.2);
    g.fill();
  }
  const core = g.createRadialGradient(0, 0, 2, 0, 0, c * 0.42);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,214,140,0)');
  g.fillStyle = core;
  g.fillRect(-c, -c, TEX, TEX);
  g.setTransform(1, 0, 0, 1, 0, 0);
};
let fireMat: THREE.Material | null = null;
const flashMat = () =>
  (fireMat ??= shared(
    new THREE.MeshBasicMaterial({
      map: paint(2005, flashPaint),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  ));
type V3 = [number, number, number];
// one gun: its parts (given the materials and the glowing one), the muzzle, where it sits on screen, the flash's size
interface GunLook {
  tip: V3;
  pos: V3;
  flash: number;
  parts: (m: GunMats, glow: THREE.Material) => THREE.Object3D[];
}
const GUNS: Record<string, GunLook> = {
  pistol: {
    tip: [0, 0.048, -0.23],
    pos: [0.26, -0.26, -0.55],
    flash: 0.08,
    parts: (m, glow) => [
      box(0.066, 0.06, 0.38, m.steel, 0, 0.048, -0.01), // the slide
      box(0.06, 0.05, 0.3, m.polymer, 0, -0.004, 0), // the frame under it
      cyl(0.017, 0.03, m.black, 0, 0.048, -0.205), // the muzzle
      box(0.058, 0.21, 0.105, m.polymer, 0, -0.125, 0.105, 0.22), // the grip, raked back
      box(0.05, 0.03, 0.07, m.black, 0, -0.235, 0.135, 0.22), // the magazine's base plate
      box(0.03, 0.012, 0.1, m.polymer, 0, -0.082, -0.035), // the trigger guard: under ...
      box(0.028, 0.058, 0.012, m.polymer, 0, -0.055, -0.085), // ... and in front (a hair narrower: no shared face)
      box(0.012, 0.042, 0.014, m.black, 0, -0.05, -0.02, -0.3), // the trigger
      box(0.014, 0.016, 0.022, m.black, 0.02, 0.086, 0.15), // the rear sight's two posts
      box(0.014, 0.016, 0.022, m.black, -0.02, 0.086, 0.15),
      box(0.012, 0.016, 0.024, m.black, 0, 0.086, -0.18), // the front sight
      box(0.007, 0.007, 0.004, glow, 0.02, 0.087, 0.162), // the dots on the sights
      box(0.007, 0.007, 0.004, glow, -0.02, 0.087, 0.162),
      box(0.006, 0.007, 0.004, glow, 0, 0.087, -0.167),
      box(0.05, 0.05, 0.012, m.black, 0, 0.046, 0.183), // the back plate of the slide
    ],
  },
  // a compact submachine gun: a boxy receiver, a long magazine ahead of the grip, a stub of a stock
  smg: {
    tip: [0, 0.03, -0.42],
    pos: [0.29, -0.29, -0.6],
    flash: 0.08,
    parts: (m, glow) => [
      box(0.072, 0.092, 0.42, m.steel, 0, 0.022, 0), // the receiver
      box(0.064, 0.07, 0.15, m.polymer, 0, 0.012, -0.275), // the handguard
      cyl(0.016, 0.1, m.black, 0, 0.03, -0.37), // the barrel
      box(0.04, 0.24, 0.058, m.black, 0, -0.135, -0.1, -0.1), // the magazine
      box(0.054, 0.16, 0.074, m.polymer, 0, -0.095, 0.115, 0.22), // the grip
      box(0.03, 0.012, 0.11, m.polymer, 0, -0.045, 0.01), // the trigger guard
      box(0.046, 0.05, 0.16, m.polymer, 0, 0.012, 0.285), // the stock's stub
      box(0.03, 0.014, 0.34, m.black, 0, 0.075, -0.02), // the rail on top
      box(0.034, 0.03, 0.014, m.black, 0, 0.097, 0.11), // the rear sight
      box(0.012, 0.03, 0.014, m.black, 0, 0.097, -0.17), // the front sight
      box(0.007, 0.007, 0.004, glow, 0, 0.104, -0.161), // its dot
      box(0.02, 0.004, 0.05, glow, 0, 0.084, 0.03), // the lamp on the rail
    ],
  },
  // a pump-action shotgun: the barrel over the magazine tube, a wooden forend to pump and a wooden grip
  shotgun: {
    tip: [0, 0.034, -0.72],
    pos: [0.3, -0.3, -0.55],
    flash: 0.08,
    parts: (m, glow) => [
      box(0.076, 0.096, 0.3, m.steel, 0, 0.004, 0.08), // the receiver
      box(0.08, 0.032, 0.09, m.black, 0, 0.016, 0.06), // the ejection port, a hair proud of it
      cyl(0.022, 0.64, m.black, 0, 0.034, -0.39), // the barrel
      cyl(0.019, 0.5, m.steel, 0, -0.014, -0.32), // the magazine tube under it
      box(0.072, 0.066, 0.2, m.wood, 0, -0.018, -0.3), // the forend
      box(0.056, 0.17, 0.092, m.wood, 0, -0.105, 0.245, 0.5), // the grip
      box(0.03, 0.012, 0.1, m.steel, 0, -0.058, 0.13), // the trigger guard
      box(0.008, 0.008, 0.008, glow, 0, 0.06, -0.69), // the bead at the muzzle
      box(0.012, 0.004, 0.026, glow, 0, 0.054, 0.12), // the lamp on the receiver
    ],
  },
  // a railgun: two bare rails out in front of the body, copper coils round them, a scope, a charge lamp
  rail: {
    tip: [0, 0.03, -0.7],
    pos: [0.3, -0.3, -0.6],
    flash: 0.08,
    parts: (m, glow) => [
      box(0.076, 0.1, 0.5, m.steel, 0, 0.004, 0.06), // the body
      box(0.016, 0.03, 0.56, m.black, 0.028, 0.03, -0.44), // the rails
      box(0.016, 0.03, 0.56, m.black, -0.028, 0.03, -0.44),
      box(0.1, 0.084, 0.03, m.copper, 0, 0.03, -0.26), // the coils
      box(0.1, 0.084, 0.03, m.copper, 0, 0.03, -0.42),
      box(0.1, 0.084, 0.03, m.copper, 0, 0.03, -0.58),
      box(0.09, 0.07, 0.15, m.polymer, 0, -0.078, -0.03), // the capacitor under the body
      box(0.052, 0.16, 0.072, m.polymer, 0, -0.115, 0.2, 0.22), // the grip
      cyl(0.024, 0.22, m.black, 0, 0.092, 0.08), // the scope
      box(0.03, 0.03, 0.03, m.black, 0, 0.066, 0.02), // its mounts
      box(0.03, 0.03, 0.03, m.black, 0, 0.066, 0.14),
      box(0.014, 0.004, 0.05, glow, 0, 0.057, 0.25), // the charge lamp, on top behind the scope
      box(0.012, 0.012, 0.5, glow, 0, 0.03, -0.44), // the glow between the rails
    ],
  },
  // a shoulder-fired launcher: an olive tube flared at both ends, a sight on its left, a grip under it
  launcher: {
    tip: [0, 0, -0.6],
    pos: [0.32, -0.25, -0.5],
    flash: 0.16,
    parts: (m, glow) => [
      cyl(0.11, 0.95, m.tube, 0, 0, -0.05), // the tube
      cyl(0.126, 0.08, m.black, 0, 0, -0.5), // the collar at the muzzle
      cyl(0.126, 0.06, m.black, 0, 0, 0.4), // ... and at the back
      box(0.06, 0.05, 0.3, m.steel, 0, -0.125, -0.02), // the trigger housing
      box(0.062, 0.18, 0.08, m.polymer, 0, -0.2, 0.09, 0.2), // the grip
      box(0.05, 0.14, 0.06, m.polymer, 0, -0.185, -0.2, -0.1), // the fore grip
      box(0.04, 0.1, 0.14, m.black, -0.13, 0.11, -0.1), // the sight
      box(0.03, 0.004, 0.06, glow, -0.13, 0.163, -0.1), // its lamp
      box(0.014, 0.004, 0.03, glow, 0, 0.112, 0.02), // the armed lamp, on top
    ],
  },
};
// The gun in hand for a weapon, as buildViewmodel (engine) would return it: the parts in a group whose userData has
// tip (an Object3D at the muzzle), flash (the hidden muzzle-flash mesh) and pos. acc = the weapon's colour
export function gunLook(id: string, acc: number): THREE.Group {
  const def = GUNS[id]!,
    g = new THREE.Group();
  g.add(...def.parts(gunMats(), new THREE.MeshBasicMaterial({ color: acc })));
  const tip = new THREE.Object3D();
  tip.position.set(...def.tip);
  g.add(tip);
  // the muzzle flash: a burst of fire seen from behind (a plane across the barrel) and its tongue along the barrel
  const flash = new THREE.Group(),
    fire = flashMat(),
    across = new THREE.Mesh(new THREE.PlaneGeometry(def.flash * FLASH.across, def.flash * FLASH.across), fire),
    along = new THREE.Mesh(new THREE.PlaneGeometry(def.flash * FLASH.along, def.flash * FLASH.wide), fire);
  along.rotation.y = Math.PI / 2;
  along.position.z = (-def.flash * FLASH.along) / 2;
  const flat = along.clone();
  flat.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  flash.add(across, along, flat);
  flash.position.copy(tip.position);
  flash.visible = false;
  g.add(flash);
  g.userData = { tip, flash, pos: def.pos };
  return g;
}
export const hasGunLook = (id: string): boolean => !!GUNS[id];
