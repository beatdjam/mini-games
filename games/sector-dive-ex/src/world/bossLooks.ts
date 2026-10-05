import * as THREE from 'three';
import { basicMat, shared } from '@engine/render/render.ts';
import { COLOR } from '../data/colors.ts';
import { LOOK_GLOW, at, ballGeo, bladeMat, boxGeo, cylGeo, darkMat, lookBodyMat, steelMat } from './enemyLooks.ts';
import { TEX, grain, paint } from './looks/common.ts';
import type { Paint } from './looks/common.ts';
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
// ---- a machine built to be believed: plate with panel lines, vents and stencilled marks on it, steel that takes the
// light, and the parts a machine of its kind would need (rams on hydraulic arms, jets, launchers, sensors) ----
// hull plate: panels of slightly different greys, a louvred vent, a stencilled unit mark, chipped edges
const hullPaint: Paint = (g, rand) => {
  g.fillStyle = '#33383d';
  g.fillRect(0, 0, TEX, TEX);
  // panels: a few rectangles, each a shade of its own, with a dark seam and a bright upper edge
  const cuts = [0, 0.34, 0.62, 1],
    rows = [0, 0.45, 1];
  for (let r = 0; r < rows.length - 1; r++)
    for (let c = 0; c < cuts.length - 1; c++) {
      const x = cuts[c]! * TEX,
        y = rows[r]! * TEX,
        w = (cuts[c + 1]! - cuts[c]!) * TEX,
        h = (rows[r + 1]! - rows[r]!) * TEX,
        v = 44 + Math.floor(rand() * 22);
      g.fillStyle = `rgb(${v},${v + 4},${v + 8})`;
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
      g.fillStyle = 'rgba(255,255,255,.1)';
      g.fillRect(x + 2, y + 2, w - 4, 2);
      g.fillStyle = 'rgba(0,0,0,.5)';
      for (const [bx, by] of [
        [x + 9, y + 9],
        [x + w - 12, y + 9],
        [x + 9, y + h - 12],
        [x + w - 12, y + h - 12],
      ] as const)
        g.fillRect(bx, by, 4, 4);
    }
  // a louvred vent in the lower middle panel
  for (let n = 0; n < 6; n++) {
    g.fillStyle = '#0b0c0e';
    g.fillRect(TEX * 0.38, TEX * 0.56 + n * 14, TEX * 0.2, 7);
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fillRect(TEX * 0.38, TEX * 0.56 + n * 14 + 7, TEX * 0.2, 2);
  }
  // the unit mark, stencilled, and a warning stripe along the bottom of one panel
  g.fillStyle = 'rgba(214,218,206,.75)';
  g.font = '900 44px "Arial Narrow","Helvetica Neue",Arial,sans-serif';
  g.textBaseline = 'top';
  g.fillText(HULL_MARK, TEX * 0.66, TEX * 0.08);
  g.fillStyle = '#c4a02e';
  g.fillRect(TEX * 0.64, TEX * 0.9, TEX * 0.34, 12);
  g.fillStyle = '#181610';
  for (let x = TEX * 0.64; x < TEX; x += 24) g.fillRect(x, TEX * 0.9, 12, 12);
  // scratches and chipped paint
  for (let n = 0; n < 60; n++) {
    g.strokeStyle = `rgba(198,204,210,${0.1 + rand() * 0.25})`;
    g.lineWidth = 1;
    const x = rand() * TEX,
      y = rand() * TEX;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 30, y + (rand() - 0.5) * 10);
    g.stroke();
  }
  for (let n = 0; n < 40; n++) {
    g.fillStyle = `rgba(0,0,0,${0.08 + rand() * 0.14})`;
    g.fillRect(rand() * TEX, rand() * TEX, 6 + rand() * 30, 8 + rand() * 40);
  }
  grain(g, rand, 12);
};
const HULL_MARK = 'K-07'; // the stencil on the hull (a made-up unit number)
// bare machined steel: for pistons, barrels, joints
let machineMats: {
  hull: THREE.CanvasTexture;
  steel: THREE.Material;
  black: THREE.Material;
  jet: THREE.Material;
} | null = null;
const machine = () =>
  (machineMats ??= {
    hull: paint(6001, hullPaint),
    steel: shared(new THREE.MeshPhongMaterial({ color: 0x4d535a, specular: 0xaab2ba, shininess: 60 })),
    black: shared(new THREE.MeshPhongMaterial({ color: 0x15171a, specular: 0x555b62, shininess: 30 })),
    jet: shared(new THREE.MeshBasicMaterial({ color: 0xffd9a0 })),
  });
// a boss's hull material with the looks of a machine: hull plate that takes the light. (A Phong material where the
// boss's code names a Lambert one: the two share what that code touches, the emissive colour and its strength)
export function bossHullMat(color: number): THREE.MeshLambertMaterial {
  const m = new THREE.MeshPhongMaterial({
    map: machine().hull,
    specular: 0x6f7780,
    shininess: 34,
    emissive: color,
    emissiveIntensity: LOOK_GLOW,
  });
  m.userData.glow = LOOK_GLOW;
  m.userData.pool = color;
  return m as unknown as THREE.MeshLambertMaterial;
}
// a hydraulic ram between two points: the dark cylinder and the bright rod out of it
function piston(from: THREE.Vector3, to: THREE.Vector3, r: number): THREE.Group {
  const g = new THREE.Group(),
    len = from.distanceTo(to),
    barrel = new THREE.Mesh(cylGeo(r, r, len * 0.56, 10), machine().black),
    rod = new THREE.Mesh(cylGeo(r * 0.55, r * 0.55, len * 0.5, 8), machine().steel);
  barrel.position.y = -len * 0.22;
  rod.position.y = len * 0.25;
  g.add(barrel, rod);
  g.position.copy(from).add(to).multiplyScalar(0.5);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return g;
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// CRUSHER: a siege machine that throws itself at you. A low hull with a stepped upper deck and a sloped bow; a
// toothed ram held out on two hydraulic arms; four landing legs on rams of their own, a jump jet beside each; a
// rocket pod on each shoulder; stacks and a radiator behind; one narrow slit to see through
export function crusherLook(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group(),
    k = machine(),
    glow = basicMat(COLOR.amber),
    bow = at(boxGeo(2.5, 1.0, 0.5), mat, 0, 0.45, 1.36);
  bow.rotation.x = -0.5; // the sloped bow plate
  g.add(
    at(boxGeo(3.0, 1.25, 3.0), mat, 0, -0.55, 0), // the lower hull
    at(boxGeo(2.5, 1.05, 2.3), mat, 0, 0.58, -0.2), // the upper deck
    bow,
    at(boxGeo(1.5, 0.42, 1.3), mat, 0, 1.3, -0.45), // the cupola
    at(boxGeo(1.1, 0.1, 0.05), glow, 0, 1.3, 0.21), // its slit
    at(cylGeo(0.09, 0.09, 0.1, 10), basicMat(COLOR.mag), 0.52, 1.36, 0.22, 'z'), // the range-finder beside it
    at(boxGeo(3.06, 0.07, 3.06), k.black, 0, 0.09, 0), // the seam between hull and deck
    at(boxGeo(0.05, 0.16, 2.2), glow, 1.52, -0.3, 0), // the running lights down each side
    at(boxGeo(0.05, 0.16, 2.2), glow, -1.52, -0.3, 0),
  );
  // the ram: a slab with teeth, held out in front on two arms
  g.add(at(boxGeo(3.4, 1.5, 0.34), bladeMat(), 0, -0.55, 2.05));
  for (let n = 0; n < 6; n++) {
    const tooth = at(boxGeo(0.34, 0.34, 0.5), k.steel, -1.4 + n * 0.56, -1.2, 2.32);
    tooth.rotation.x = Math.PI / 4;
    g.add(tooth);
  }
  for (const x of [-1.0, 1.0]) {
    g.add(piston(V(x, -0.2, 1.4), V(x, -0.4, 1.95), 0.13), piston(V(x, -0.95, 1.4), V(x, -0.8, 1.95), 0.1));
    g.add(at(boxGeo(0.3, 0.9, 0.2), k.black, x, -0.6, 1.5)); // the arms' mount on the bow
  }
  // the legs: a ram down from each corner to a pad, and a jump jet beside it
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 1.25,
        z = sz * 1.2;
      g.add(
        piston(V(x * 1.02, -0.7, z), V(x * 1.16, -1.5, z * 1.08), 0.16),
        at(boxGeo(0.7, 0.14, 0.8), k.black, x * 1.16, -1.53, z * 1.08), // the pad
        at(cylGeo(0.2, 0.28, 0.4, 10), k.black, x * 0.6, -1.3, z * 0.75), // the jet's bell
        at(cylGeo(0.17, 0.2, 0.06, 10), k.jet, x * 0.6, -1.5, z * 0.75), // its throat, hot
      );
    }
  // the rocket pods: a box on each shoulder with six tubes in its face
  for (const sx of [-1, 1]) {
    g.add(
      at(boxGeo(0.7, 0.62, 1.3), mat, sx * 1.62, 0.75, -0.2),
      at(boxGeo(0.2, 0.3, 0.5), k.black, sx * 1.27, 0.7, -0.2),
    );
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 3; c++)
        g.add(at(cylGeo(0.075, 0.075, 0.06, 8), k.black, sx * 1.62 + (c - 1) * 0.2, 0.62 + r * 0.26, 0.46, 'z'));
  }
  // behind: two exhaust stacks and the radiator's slats
  for (const x of [-0.7, 0.7])
    g.add(
      at(cylGeo(0.13, 0.16, 1.1, 10), k.black, x, 1.3, -1.25),
      at(cylGeo(0.17, 0.17, 0.1, 10), k.steel, x, 1.86, -1.25),
    );
  for (let n = 0; n < 5; n++) g.add(at(boxGeo(1.6, 0.06, 0.1), k.black, 0, 0.2 + n * 0.17, -1.38));
  // a whip aerial and the grab rails along the deck
  g.add(
    at(cylGeo(0.012, 0.03, 1.7, 6), k.steel, -0.6, 2.3, -0.9),
    at(boxGeo(0.04, 0.04, 1.6), k.steel, 1.1, 1.2, -0.2),
    at(boxGeo(0.04, 0.04, 1.6), k.steel, -1.1, 1.2, -0.2),
  );
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
