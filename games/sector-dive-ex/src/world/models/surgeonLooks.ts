import * as THREE from 'three';
import { mergeParts } from '@engine/render/merge.ts';
import { basicMat, shared } from '@engine/render/render.ts';
import { PAINT } from '../../data/colors.ts';
import { TEX, grain, grime, paint, smudge, stripes } from '../looks/paint.ts';
import type { Paint } from '../looks/paint.ts';
import { HALF, spokes, torusGeo, turned } from './bossLooks.ts';
import { at, ballGeo, boxGeo, cylGeo, machine } from './machine.ts';
// SURGEON: a multi-armed surgical robot hung from the ceiling of an operating theatre (its fight is in
// actors/bosses/surgeon.ts, which poses what is built here). White-and-pale-green enamel gone grimy (surgeonHullMat),
// not the dark plate of the others. The body (surgeonBody) is layered housings: a black core under six enamel plates
// and a grey under-hull, a belt of lights, a camera cluster for a face (its main lens turns to follow the player), a
// round operating light under the belly (its lamps take the colour of the attack), and a hub for each arm. Its neck
// turns on a slewing ring under the gantry (surgeonMount: a plate, a rail carriage, a column and the cables up into
// the ceiling), and the gantry stays after the body is gone. Each arm (surgeonArm) is two links, each a housing with
// two telescoping stages sliding out of it, a ram and a cable alongside, and a knuckle between; the tool on the wrist
// is a scalpel with a red emitter, a rotary injector with vials, or a two-jaw clamp on rams. The parts that never move
// by themselves are joined into one mesh per material (mergeParts); what the boss poses is left apart.
export const SURGEON_NECK = 1.9; // the neck's top is this far above the body's middle (m)
export const SURGEON_SHOULDER = { r: 1.3, y: -0.62 }; // the hub of arm 0 is this far out (in front) and down from the body's middle; the others turn round
export const SURGEON_SLOT_TURN = Math.PI / 3; // the three arms are turned this far from the front (the lens is between two of them)
export type SurgeonArmKind = 'scalpel' | 'needle' | 'clamp';
// the body: g the model; lens its main camera (turned by the boss to look at the player; null in the plain look);
// light(life, tint, lamp) sets the lights: life 1 (lit) to 0 (out) for all of them, the operating light's lamps at
// `lamp` of that, and those lamps and the lens in the colour `tint`
export interface SurgeonBodyLook {
  g: THREE.Group;
  lens: THREE.Group | null;
  light: (life: number, tint: number, lamp: number) => void;
}
// an arm: end is the tool (its origin is its middle and it points along +z), limb the links and the knuckle (posed in
// world space), mat its own enamel (each arm flashes by itself when hit). pose lays the arm along shoulder s, knuckle
// el and tool end p (pole: which way the knuckle bends; size: 0 to 1, how grown it is); open turns a clamp's jaws;
// heat (0 to 1) lights a scalpel's emitter or the flare at an injector's muzzle; spin turns an injector's drum
export interface SurgeonArmLook {
  end: THREE.Group;
  limb: THREE.Group;
  mat: THREE.MeshLambertMaterial;
  pose: (s: THREE.Vector3, el: THREE.Vector3, p: THREE.Vector3, pole: THREE.Vector3, size: number) => void;
  open: (a: number) => void;
  heat: (k: number) => void;
  spin: (a: number) => void;
}
const SURGEON_GLOW = 0.14; // the enamel's glow in the boss's colour: it has to read in the dark theatre
const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// ---- the pictures ----
const surgeonPaint: Paint = (g, rand) => {
  g.fillStyle = '#d8e3da';
  g.fillRect(0, 0, TEX, TEX);
  // panel seams, a green band, a cross
  g.fillStyle = 'rgba(40,64,54,.4)';
  g.fillRect(TEX / 2 - 1, 0, 2, TEX);
  g.fillRect(0, TEX * 0.3, TEX, 2);
  g.fillRect(TEX * 0.25, TEX * 0.3, 2, TEX * 0.7);
  g.fillRect(TEX * 0.75, 0, 2, TEX * 0.3);
  g.fillStyle = '#7fc9a4';
  g.fillRect(0, TEX * 0.62, TEX, 14);
  g.fillStyle = 'rgba(70,170,120,.75)';
  g.fillRect(TEX * 0.7, TEX * 0.1, 34, 10);
  g.fillRect(TEX * 0.7 + 12, TEX * 0.1 - 12, 10, 34);
  // screws along the seams
  g.fillStyle = 'rgba(40,64,54,.55)';
  for (let x = 12; x < TEX; x += 32) for (const y of [TEX * 0.3 - 6, TEX * 0.3 + 8]) g.fillRect(x, y, 3, 3);
  // stencilled marks, worn
  g.fillStyle = 'rgba(47,106,78,.7)';
  g.font = '700 22px "Arial Narrow",Arial,sans-serif';
  g.textBaseline = 'top';
  g.fillText('SG-03 STERILE', TEX * 0.06, TEX * 0.7);
  // the grime of years: dirt in the seams, rust runs, grey stains, scuffs and chips down to the metal
  grime(g, rand, 110, '#f4faf4', '#3a3828');
  for (let n = 0; n < 5; n++) smudge(g, rand() * TEX, rand() * TEX, 14 + rand() * 26, 8 + rand() * 16, '70,62,40', 0.3);
  for (let n = 0; n < 14; n++) {
    const len = 30 + rand() * 90,
      st = g.createLinearGradient(0, 0, 0, len);
    st.addColorStop(0, 'rgba(120,76,36,.35)');
    st.addColorStop(1, 'rgba(120,76,36,0)');
    g.fillStyle = st;
    g.fillRect(rand() * TEX, rand() * TEX * 0.7, 2 + rand() * 6, len);
  }
  for (let n = 0; n < 26; n++) {
    g.fillStyle = `rgba(90,98,96,${0.4 + rand() * 0.4})`;
    g.fillRect(rand() * TEX, rand() * TEX, 2 + rand() * 6, 1 + rand() * 3);
  }
  for (let n = 0; n < 40; n++) {
    g.strokeStyle = `rgba(60,64,60,${0.1 + rand() * 0.2})`;
    g.lineWidth = 1;
    const x = rand() * TEX,
      y = rand() * TEX;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 36, y + (rand() - 0.5) * 8);
    g.stroke();
  }
  grain(g, rand, 12);
};
// warning stripes for the collars (the picture runs five times round)
const hazardPaint: Paint = (g, rand) => {
  stripes(g, [0, 0, TEX, TEX], 52, '#d9a02a', '#17191a');
  grime(g, rand, 50, '#f4e8b0', '#262014');
  grain(g, rand, 14);
};
const PLATE_ASPECT = 2.2; // the unit plates are this much wider than high
// a unit plate: the picture is drawn as wide as it is high on the plate, then squeezed into the square picture
const platePaint: Paint = (g, rand) => {
  g.save();
  g.scale(1 / PLATE_ASPECT, 1);
  const w = TEX * PLATE_ASPECT;
  g.fillStyle = '#e8eee8';
  g.fillRect(0, 0, w, TEX);
  g.fillStyle = '#2f6a4e';
  g.fillRect(0, 0, w, TEX * 0.14);
  g.fillRect(0, TEX * 0.86, w, TEX * 0.14);
  g.strokeStyle = '#2f6a4e';
  g.lineWidth = 8;
  g.strokeRect(14, 14, w - 28, TEX - 28);
  g.fillStyle = '#17302a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 150px "Arial Narrow","Helvetica Neue",Arial,sans-serif';
  g.fillText('OR-3', w / 2, TEX * 0.5);
  g.font = '700 30px "Arial Narrow",Arial,sans-serif';
  g.fillStyle = '#e8eee8';
  g.fillText('SURGICAL  UNIT', w / 2, TEX * 0.07);
  for (const x of [34, w - 34])
    for (const y of [TEX * 0.5 - 6]) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
    }
  g.restore();
  grime(g, rand, 24, 'rgba(255,255,255,.5)', 'rgba(0,0,0,.5)');
  grain(g, rand, 10);
};

// ---- the materials ----
let surgeonMap: THREE.CanvasTexture | null = null;
// the enamel as a material: one for the body and one for each arm (each flashes by itself when hit)
export function surgeonHullMat(color: number): THREE.MeshLambertMaterial {
  surgeonMap ??= paint(6010, surgeonPaint, true);
  const m = new THREE.MeshPhongMaterial({
    map: surgeonMap,
    specular: 0x9aa8a0,
    shininess: 55,
    emissive: color,
    emissiveIntensity: SURGEON_GLOW,
  });
  m.userData.glow = SURGEON_GLOW;
  return m as unknown as THREE.MeshLambertMaterial; // (as bossHullMat: the code that flashes it touches only what the two share)
}
const phong = (color: number, specular: number, shininess: number) =>
  shared(new THREE.MeshPhongMaterial({ color, specular, shininess }));
const glassMat = (color: number, opacity: number) =>
  shared(
    new THREE.MeshPhongMaterial({
      color,
      specular: 0xffffff,
      shininess: 90,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  );
let kitMats: {
  under: THREE.Material; // the grey enamel of the under-panels
  rubber: THREE.Material;
  hazard: THREE.Material;
  plate: THREE.Material;
  glass: THREE.Material;
  fluid: THREE.Material; // pale green, lit
  lens: THREE.Material; // the dark glass of a camera
} | null = null;
function kit() {
  if (kitMats) return kitMats;
  const hazard = paint(6011, hazardPaint, true),
    plate = paint(6012, platePaint);
  hazard.repeat.set(5, 1);
  return (kitMats = {
    under: phong(0x7c8884, 0x5a6662, 30),
    rubber: phong(0x14181a, 0x2e3438, 18),
    hazard: shared(new THREE.MeshPhongMaterial({ map: hazard, specular: 0x403c30, shininess: 20 })),
    plate: shared(new THREE.MeshPhongMaterial({ map: plate, specular: 0x778880, shininess: 40 })),
    glass: glassMat(0xb8f0dc, 0.5),
    fluid: shared(new THREE.MeshBasicMaterial({ color: 0x8ff0c0 })),
    lens: phong(0x061418, 0xbfe8ff, 120),
  });
}

// ---- parts ----
const _d = new THREE.Vector3();
const unitBar = (): THREE.BufferGeometry => cylGeo(1, 1, 1, 10);
// a round bar of radius r laid between two points
function layBar(m: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, r: number) {
  const len = Math.max(from.distanceTo(to), 0.001);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, _d.copy(to).sub(from).divideScalar(len));
  m.scale.set(r, len, r);
}
const barMesh = (mat: THREE.Material) => new THREE.Mesh(unitBar(), mat);
// a hose along a curve through the points (radius r)
function hose(pts: [number, number, number][], r: number, mat: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 6, r, 6, false), mat);
}
// a screw head or a bolt, standing out of a surface whose outward direction is `n`
function stud(mat: THREE.Material, p: THREE.Vector3, n: THREE.Vector3, r: number): THREE.Mesh {
  const m = new THREE.Mesh(cylGeo(r, r, r * 0.8, 6), mat);
  m.position.copy(p);
  m.quaternion.setFromUnitVectors(UP, n.clone().normalize());
  return m;
}
// a ram between two points that the boss moves: the dark cylinder and the bright rod out of it
interface Ram {
  barrel: THREE.Mesh;
  rod: THREE.Mesh;
}
const _e = new THREE.Vector3();
function makeRam(parent: THREE.Object3D): Ram {
  const k = machine(),
    r: Ram = { barrel: barMesh(k.black), rod: barMesh(k.steel) };
  parent.add(r.barrel, r.rod);
  return r;
}
function layRam(r: Ram, from: THREE.Vector3, to: THREE.Vector3, rad: number) {
  layBar(r.barrel, from, _e.copy(from).lerp(to, 0.56), rad);
  layBar(r.rod, _e.copy(from).lerp(to, 0.5), to, rad * 0.55);
}

// ---- the body ----
const shellGeos: Record<string, THREE.BufferGeometry> = {};
// a part of a sphere (angles from the pole, round the axis)
function capGeo(r: number, phi0: number, phi: number, th0: number, th: number): THREE.BufferGeometry {
  return (shellGeos[`${r},${phi0},${phi},${th0},${th}`] ??= shared(
    new THREE.SphereGeometry(r, Math.max(4, Math.ceil(phi * 5)), Math.max(3, Math.ceil(th * 7)), phi0, phi, th0, th),
  ));
}
const SHELL_R = 1.5; // the body is this round (a sphere's radius, flattened to SHELL_FLAT)
const SHELL_FLAT = 0.85;
const PLATES = 6; // enamel plates round the upper shell
// the body: `mat` its enamel (it flashes), `color` the boss's colour (a dead one dims its lights)
export function surgeonBody(mat: THREE.Material, color: number): SurgeonBodyLook {
  const g = new THREE.Group(),
    k = machine(),
    x = kit(),
    glow = new THREE.MeshBasicMaterial({ color }),
    lamps = new THREE.MeshBasicMaterial({ color }),
    iris = new THREE.MeshBasicMaterial({ color }),
    lit: [THREE.MeshBasicMaterial, number][] = [[glow, color]];
  const status = (c: number) => {
    const m = new THREE.MeshBasicMaterial({ color: c });
    lit.push([m, c]);
    return m;
  };
  // the shell, flattened: a black core, enamel plates with gaps between, a cap, a grey under-hull, screws
  const sh = new THREE.Group();
  sh.scale.y = SHELL_FLAT;
  sh.add(at(capGeo(SHELL_R - 0.04, 0, Math.PI * 2, 0, Math.PI), k.black));
  for (let n = 0; n < PLATES; n++)
    sh.add(
      new THREE.Mesh(
        capGeo(SHELL_R + 0.04, ((n + 0.04) / PLATES) * Math.PI * 2, (0.92 / PLATES) * Math.PI * 2, 0.2, 1.22),
        mat,
      ),
    );
  sh.add(
    new THREE.Mesh(capGeo(SHELL_R + 0.07, 0, Math.PI * 2, 0, 0.22), mat),
    new THREE.Mesh(capGeo(SHELL_R + 0.03, 0, Math.PI * 2, 1.42, 1.0), x.under),
  );
  for (const [th, off] of [
    [0.3, 0],
    [1.3, 0.5],
  ] as const)
    for (let n = 0; n < 12; n++) {
      const ph = ((n + off) / 12) * Math.PI * 2,
        r = SHELL_R + 0.08,
        nrm = new THREE.Vector3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
      sh.add(stud(k.steel, nrm.clone().multiplyScalar(r), nrm, 0.04));
    }
  g.add(sh);
  // the belt of lights round the middle
  g.add(turned(at(torusGeo(1.5, 0.08), k.steel, 0, -0.05, 0), HALF, 0, 0));
  g.add(...spokes(12, 0, s => s.add(at(boxGeo(0.12, 0.1, 0.14), glow, 0, -0.05, 1.56))));
  g.add(...spokes(12, Math.PI / 12, s => s.add(at(boxGeo(0.1, 0.18, 0.1), k.black, 0, -0.05, 1.54))));
  // the face: a visor housing, the main lens in a gimbal ring, two small cameras, a brow, a rangefinder, status lamps
  g.add(
    at(torusGeo(0.86, 0.07), k.steel, 0, -0.14, 1.28),
    at(torusGeo(0.7, 0.04), k.black, 0, -0.14, 1.34),
    at(boxGeo(1.4, 0.12, 0.5), mat, 0, 0.52, 1.28),
    at(boxGeo(1.5, 0.05, 0.3), k.black, 0, 0.44, 1.46),
    at(cylGeo(0.14, 0.17, 0.3, 12), k.black, -0.66, -0.12, 1.48, 'z'),
    at(cylGeo(0.14, 0.17, 0.3, 12), k.black, 0.66, -0.12, 1.48, 'z'),
    at(cylGeo(0.1, 0.1, 0.04, 12), x.lens, -0.66, -0.12, 1.65, 'z'),
    at(cylGeo(0.1, 0.1, 0.04, 12), x.lens, 0.66, -0.12, 1.65, 'z'),
    at(cylGeo(0.035, 0.035, 0.05, 8), status(PAINT.red1), -0.66, -0.12, 1.675, 'z'),
    at(cylGeo(0.035, 0.035, 0.05, 8), status(PAINT.red1), 0.66, -0.12, 1.675, 'z'),
    at(boxGeo(0.12, 0.1, 0.12), k.black, 0, 0.3, 1.58),
    at(cylGeo(0.03, 0.03, 0.06, 8), status(PAINT.red1), 0, 0.3, 1.64, 'z'),
  );
  for (let n = 0; n < 5; n++)
    g.add(
      at(
        boxGeo(0.12, 0.07, 0.04),
        status([PAINT.mint2, PAINT.mint2, PAINT.amber3, PAINT.mint2, PAINT.red1][n]!),
        (n - 2) * 0.2,
        -0.6,
        1.4,
      ),
      at(boxGeo(0.15, 0.1, 0.03), k.black, (n - 2) * 0.2, -0.6, 1.385),
    );
  const lens = new THREE.Group();
  lens.position.set(0, -0.14, 1.12);
  lens.add(
    at(cylGeo(0.5, 0.56, 0.36, 18), k.black, 0, 0, 0.2, 'z'),
    at(torusGeo(0.52, 0.05), k.steel, 0, 0, 0.4),
    at(torusGeo(0.6, 0.04), k.steel, 0, 0, 0.32),
    at(cylGeo(0.42, 0.42, 0.04, 20), x.lens, 0, 0, 0.42, 'z'),
    at(torusGeo(0.3, 0.03), iris, 0, 0, 0.45),
    at(cylGeo(0.17, 0.17, 0.04, 14), iris, 0, 0, 0.45, 'z'),
    at(cylGeo(0.07, 0.07, 0.04, 10), basicMat(0xffffff), 0, 0, 0.48, 'z'),
    at(boxGeo(0.5, 0.07, 0.3), mat, 0, 0.56, 0.3),
  );
  g.add(lens);
  // the plate under the face
  const plate = at(boxGeo(0.92, 0.42, 0.06), x.plate, 0, -0.9, 1.1);
  plate.rotation.x = 0.55;
  g.add(plate);
  // the side pods (sensors, with an aerial and a lamp each)
  for (const sx of [-1, 1])
    g.add(
      at(cylGeo(0.3, 0.34, 0.34, 14), k.black, sx * 1.42, 0.3, 0.1, 'x'),
      at(torusGeo(0.3, 0.04), k.steel, sx * 1.6, 0.3, 0.1),
      at(ballGeo(0.2, 1), x.glass, sx * 1.62, 0.3, 0.1),
      at(cylGeo(0.015, 0.03, 0.9, 6), k.steel, sx * 1.1, 1.0, -0.3),
      at(ballGeo(0.05, 1), status(PAINT.amber3), sx * 1.1, 1.47, -0.3),
    );
  // the back: a vent plate with louvres, a fan housing, two exhausts
  g.add(
    at(boxGeo(1.3, 0.95, 0.12), x.under, 0, 0.12, -1.36),
    at(torusGeo(0.3, 0.04), k.steel, 0.3, 0.3, -1.44),
    at(cylGeo(0.26, 0.26, 0.04, 14), k.black, 0.3, 0.3, -1.43, 'z'),
    ...[0, 1, 2, 3, 4].map(n => at(boxGeo(1.0, 0.05, 0.08), k.black, -0.05, -0.2 + n * 0.08, -1.43)),
    at(cylGeo(0.12, 0.14, 0.5, 8), k.black, -0.5, 0.75, -1.2),
    at(cylGeo(0.12, 0.14, 0.5, 8), k.black, 0.5, 0.75, -1.2),
    at(torusGeo(0.12, 0.03), k.steel, -0.5, 1.0, -1.2),
    at(torusGeo(0.12, 0.03), k.steel, 0.5, 1.0, -1.2),
  );
  // the neck: a hazard collar and the slewing ring (the part that turns under the gantry), teeth on its rim
  g.add(
    at(cylGeo(0.8, 0.95, 0.3, 16), x.under, 0, 1.22, 0),
    at(cylGeo(0.66, 0.66, 0.2, 18), x.hazard, 0, 1.45, 0),
    at(cylGeo(1.0, 1.0, 0.16, 24), k.steel, 0, 1.64, 0),
    at(cylGeo(0.62, 0.66, 0.16, 16), k.black, 0, 1.82, 0),
    at(torusGeo(0.62, 0.05), k.steel, 0, 1.74, 0),
    turned(at(torusGeo(0.9, 0.04), k.black, 0, 1.73, 0), HALF, 0, 0),
  );
  g.add(...spokes(24, 0, s => s.add(at(boxGeo(0.1, 0.12, 0.08), k.steel, 1.03, 1.64, 0))));
  g.add(...spokes(8, 0, s => s.add(at(cylGeo(0.04, 0.04, 0.05, 6), k.black, 0.9, 1.73, 0))));
  // under the belly: the operating light, a dish of lamps on a stem, a sterile handle in the middle
  const dish = [at(cylGeo(0.1, 0.1, 0.2, 10), k.steel, 0, -1.34, 0)];
  dish.push(
    at(cylGeo(0.98, 0.86, 0.14, 24), x.under, 0, -1.46, 0),
    turned(at(torusGeo(0.95, 0.05), k.steel, 0, -1.5, 0), HALF, 0, 0),
    at(cylGeo(0.84, 0.84, 0.03, 24), k.black, 0, -1.53, 0),
    at(cylGeo(0.07, 0.07, 0.3, 8), mat, 0, -1.66, 0),
    at(ballGeo(0.1, 1), k.steel, 0, -1.82, 0),
  );
  for (let n = 0; n < 8; n++) {
    const a = (n / 8) * Math.PI * 2;
    dish.push(at(cylGeo(0.1, 0.1, 0.05, 8), lamps, Math.sin(a) * 0.64, -1.545, Math.cos(a) * 0.64));
  }
  for (let n = 0; n < 4; n++) {
    const a = (n / 4) * Math.PI * 2 + 0.4;
    dish.push(at(cylGeo(0.075, 0.075, 0.05, 8), lamps, Math.sin(a) * 0.32, -1.545, Math.cos(a) * 0.32));
  }
  g.add(...dish);
  // a hub for each arm: a joint housing across, a ball in it, a lit ring; and a hose from the belly to it
  const hub = SURGEON_SHOULDER;
  g.add(
    ...spokes(3, SURGEON_SLOT_TURN, s => {
      s.add(
        at(boxGeo(0.5, 0.34, 0.6), x.under, 0, hub.y + 0.28, hub.r - 0.25),
        at(cylGeo(0.4, 0.4, 0.62, 14), mat, 0, hub.y, hub.r, 'x'),
        at(cylGeo(0.3, 0.3, 0.74, 12), k.steel, 0, hub.y, hub.r, 'x'),
        at(ballGeo(0.34, 1), k.black, 0, hub.y, hub.r),
        at(torusGeo(0.34, 0.04), glow, 0.34, hub.y, hub.r).rotateY(HALF),
        at(torusGeo(0.34, 0.04), glow, -0.34, hub.y, hub.r).rotateY(HALF),
        hose(
          [
            [0.12, -1.35, 0.6],
            [0.1, -1.3, 1.0],
            [0.1, -0.95, 1.3],
            [0.1, hub.y - 0.1, hub.r + 0.12],
          ],
          0.05,
          x.rubber,
        ),
        hose(
          [
            [-0.12, -1.2, 0.5],
            [-0.14, -1.25, 0.95],
            [-0.14, -0.9, 1.35],
            [-0.12, hub.y - 0.1, hub.r + 0.12],
          ],
          0.04,
          k.black,
        ),
      );
    }),
  );
  mergeParts(g, [lens]);
  return {
    g,
    lens,
    light(life, tint, lamp) {
      for (const [m, c] of lit) m.color.setHex(c).multiplyScalar(life);
      lamps.color.setHex(tint).multiplyScalar(life * lamp);
      iris.color.setHex(tint).multiplyScalar(life);
    },
  };
}

// ---- the gantry ----
const GANTRY_W = 4.4; // the ceiling plate is this wide (m)
// the gantry from the ceiling: its origin is its lower end (the neck's top); it stands `len` m up to the ceiling. A
// stator ring and a hazard collar the neck turns in, a column in two stages, cables from the collar up into the plate,
// a plate on rails with a carriage under it, braces, and bolts
export function surgeonMount(len: number): THREE.Group {
  const g = new THREE.Group(),
    k = machine(),
    x = kit(),
    top = len - 0.3; // the underside of the plate
  g.add(
    at(cylGeo(0.96, 0.96, 0.2, 24), k.steel, 0, 0.1, 0),
    at(cylGeo(0.7, 0.7, 0.26, 20), x.hazard, 0, 0.33, 0),
    at(cylGeo(0.52, 0.52, 0.12, 16), k.black, 0, 0.52, 0),
    // the column: a thick lower stage, a slim upper stage that slides in it, rings between
    at(cylGeo(0.5, 0.5, top * 0.55, 16), k.steel, 0, 0.55 + top * 0.275, 0),
    at(cylGeo(0.41, 0.41, top * 0.5, 14), k.black, 0, 0.55 + top * 0.75, 0),
    at(cylGeo(0.56, 0.56, 0.14, 16), k.black, 0, 0.55 + top * 0.55, 0),
    at(cylGeo(0.5, 0.5, 0.1, 16), k.steel, 0, 0.55 + top * 0.55 + 0.14, 0),
    at(cylGeo(0.5, 0.5, 0.2, 16), k.black, 0, top - 0.1, 0),
  );
  // the plate and its frame
  g.add(
    at(boxGeo(GANTRY_W, 0.3, GANTRY_W), k.black, 0, len - 0.15, 0),
    at(boxGeo(GANTRY_W - 0.3, 0.1, 0.3), x.hazard, 0, top - 0.04, GANTRY_W / 2 - 0.15),
    at(boxGeo(GANTRY_W - 0.3, 0.1, 0.3), x.hazard, 0, top - 0.04, -GANTRY_W / 2 + 0.15),
    at(boxGeo(0.3, 0.1, GANTRY_W - 0.3), x.hazard, GANTRY_W / 2 - 0.15, top - 0.04, 0),
    at(boxGeo(0.3, 0.1, GANTRY_W - 0.3), x.hazard, -GANTRY_W / 2 + 0.15, top - 0.04, 0),
  );
  // two rails under the plate, a carriage on them, wheels, end stops
  for (const sz of [-1, 1])
    g.add(
      at(boxGeo(GANTRY_W - 0.6, 0.12, 0.2), k.steel, 0, top - 0.16, sz * 0.78),
      at(boxGeo(0.2, 0.3, 0.3), x.hazard, 1.9, top - 0.2, sz * 0.78),
      at(boxGeo(0.2, 0.3, 0.3), x.hazard, -1.9, top - 0.2, sz * 0.78),
    );
  g.add(at(boxGeo(2.1, 0.46, 1.9), x.under, 0, top - 0.46, 0), at(boxGeo(1.7, 0.1, 1.5), k.black, 0, top - 0.74, 0));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      g.add(
        at(cylGeo(0.14, 0.14, 0.12, 10), k.steel, sx * 0.7, top - 0.3, sz * 0.78, 'z'),
        at(cylGeo(0.07, 0.07, 0.12, 6), k.steel, sx * 1.1, top - 0.74, sz * 0.8),
      );
  // braces from the carriage to the column
  for (const [sx, sz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const brace = barMesh(k.steel);
    layBar(
      brace,
      new THREE.Vector3(sx * 0.9, top - 0.7, sz * 0.9),
      new THREE.Vector3(sx * 0.46, top - 1.3, sz * 0.46),
      0.07,
    );
    g.add(brace);
  }
  // bolts: on the plate's underside, and a ring round the stator
  for (let n = 0; n < 12; n++) {
    const a = (n / 12) * Math.PI * 2;
    g.add(at(cylGeo(0.07, 0.07, 0.07, 6), k.steel, Math.sin(a) * 0.82, 0.22, Math.cos(a) * 0.82));
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      for (const f of [0.55, 1]) g.add(at(cylGeo(0.1, 0.1, 0.1, 6), k.steel, sx * 1.9 * f, top - 0.06, sz * 1.9));
  // the cable bundle: five hoses of different thickness round the column, two straps, and a big one that goes on up
  const around = (a: number, r: number, y: number): [number, number, number] => [Math.sin(a) * r, y, Math.cos(a) * r];
  for (let n = 0; n < 5; n++) {
    const a = 0.5 + n * 0.42,
      r = 0.62 + (n % 2) * 0.05;
    g.add(
      hose(
        [
          around(a, 0.7, 0.55),
          around(a + 0.2, r, top * 0.35),
          around(a + 0.5, r + 0.03, top * 0.7),
          around(a + 0.6, 0.8, top - 0.3),
          [Math.sin(a + 0.6) * 1.0, top - 0.1, Math.cos(a + 0.6) * 1.0],
        ],
        0.07 + (n % 3) * 0.02,
        n % 2 ? x.rubber : k.black,
      ),
    );
  }
  for (const f of [0.3, 0.62]) g.add(turned(at(torusGeo(0.76, 0.05), k.steel, 0, 0.55 + top * f, 0), HALF, 0, 0));
  // a junction box on the column, with its plate and lamps
  g.add(
    at(boxGeo(0.7, 0.5, 0.36), x.under, 0, 0.55 + top * 0.42, 0.74),
    at(boxGeo(0.62, 0.28, 0.04), x.plate, 0, 0.55 + top * 0.42 + 0.04, 0.94),
    at(boxGeo(0.1, 0.06, 0.04), basicMat(PAINT.mint2), -0.18, 0.55 + top * 0.42 - 0.17, 0.94),
    at(boxGeo(0.1, 0.06, 0.04), basicMat(PAINT.amber3), 0, 0.55 + top * 0.42 - 0.17, 0.94),
    at(boxGeo(0.1, 0.06, 0.04), basicMat(PAINT.red1), 0.18, 0.55 + top * 0.42 - 0.17, 0.94),
  );
  mergeParts(g);
  return g;
}

// ---- the arms ----
const SLEEVE = 1.5; // the housing at the root of a link is this long (m): what slides out of it is the rest
const SLEEVE_R = 0.34; // ... and this thick
const STAGE1_R = 0.3; // the two stages that slide out of it
const STAGE2_R = 0.22;
const STAGE_IN = 0.1; // the last stage goes this far into the knuckle (m)
const RAM_R = 0.075;
const CABLE_R = 0.05;
const SCALPEL_DIM = 0x7a1a22; // the scalpel's emitter at rest ...
const SCALPEL_HOT = 0xffd8d0; // ... and at its brightest
const FLARE_COLOR = 0xc8ffe4; // the flash at the injector's muzzle
interface Link {
  root: THREE.Group;
  stage1: THREE.Mesh;
  stage2: THREE.Mesh;
  ram: Ram;
  cable: THREE.Mesh;
}
// a link: a housing (joined into a few meshes), two stages sliding out of it, a ram and a cable alongside
function buildLink(mat: THREE.Material, parent: THREE.Object3D): Link {
  const k = machine(),
    x = kit(),
    root = new THREE.Group();
  root.add(
    at(cylGeo(0.3, 0.3, SLEEVE, 12), k.black, 0, SLEEVE / 2, 0),
    at(cylGeo(SLEEVE_R, SLEEVE_R, 0.5, 14), mat, 0, 0.4, 0),
    at(cylGeo(SLEEVE_R, SLEEVE_R, 0.4, 14), mat, 0, 1.15, 0),
    at(cylGeo(0.42, 0.42, 0.12, 14), k.steel, 0, 0.04, 0),
    at(cylGeo(0.39, 0.39, 0.08, 14), k.steel, 0, 0.72, 0),
    at(cylGeo(0.39, 0.39, 0.08, 14), k.steel, 0, 0.9, 0),
    at(cylGeo(0.4, 0.4, 0.1, 14), k.steel, 0, SLEEVE - 0.05, 0),
    // the side plate that the ram stands on, the ram's lug, cable clips
    at(boxGeo(0.34, 0.9, 0.16), mat, 0, 0.75, 0.33),
    at(boxGeo(0.16, 0.16, 0.16), k.steel, 0, 1.1, 0.46),
    at(boxGeo(0.2, 0.1, 0.12), k.black, 0, 0.3, -0.34),
    at(boxGeo(0.2, 0.1, 0.12), k.black, 0, 1.05, -0.34),
  );
  for (const sx of [-1, 1])
    for (const y of [0.45, 1.05]) root.add(at(cylGeo(0.03, 0.03, 0.04, 6), k.steel, sx * 0.12, y, 0.42, 'z'));
  mergeParts(root);
  const link = {
    root,
    stage1: barMesh(k.black),
    stage2: barMesh(k.steel),
    ram: makeRam(parent),
    cable: barMesh(x.rubber),
  };
  parent.add(root, link.stage1, link.stage2, link.cable);
  return link;
}
const _dir = new THREE.Vector3(),
  _side = new THREE.Vector3(),
  _p0 = new THREE.Vector3(),
  _p1 = new THREE.Vector3(),
  _p2 = new THREE.Vector3(),
  _p3 = new THREE.Vector3(),
  _fx = new THREE.Vector3(),
  _fy = new THREE.Vector3(),
  _fz = new THREE.Vector3(),
  _fm = new THREE.Matrix4();
// the turn that lays a link along from -> to, with its side (+z) toward the pole (where the knuckle bends)
function frameOf(q: THREE.Quaternion, from: THREE.Vector3, to: THREE.Vector3, pole: THREE.Vector3) {
  _fy.copy(to).sub(from).normalize();
  _fz.copy(pole).addScaledVector(_fy, -pole.dot(_fy));
  if (_fz.lengthSq() < 1e-4) {
    const ref = Math.abs(_fy.y) < 0.95 ? UP : Z_AXIS;
    _fz.copy(ref).addScaledVector(_fy, -ref.dot(_fy));
  }
  _fz.normalize();
  _fx.crossVectors(_fy, _fz);
  q.setFromRotationMatrix(_fm.makeBasis(_fx, _fy, _fz));
}
// a link from a to b: the housing at a, the stages overlapping between, the ram and cable from housing to b
function layLink(l: Link, a: THREE.Vector3, b: THREE.Vector3, q: THREE.Quaternion, size: number) {
  const dir = _dir.set(0, 1, 0).applyQuaternion(q),
    side = _side.set(0, 0, 1).applyQuaternion(q),
    sl = SLEEVE * size,
    span = Math.max(a.distanceTo(b) - sl - STAGE_IN * size, 0.05);
  l.root.position.copy(a);
  l.root.quaternion.copy(q);
  l.root.scale.setScalar(size);
  const end = _p3.copy(b).addScaledVector(dir, -STAGE_IN * size);
  layBar(
    l.stage1,
    _p0.copy(a).addScaledVector(dir, sl - 0.1 * size),
    _p1.copy(a).addScaledVector(dir, sl + span * 0.62),
    STAGE1_R * size,
  );
  layBar(l.stage2, _p2.copy(a).addScaledVector(dir, sl + span * 0.38), end, STAGE2_R * size);
  layRam(
    l.ram,
    _p0
      .copy(a)
      .addScaledVector(dir, sl * 0.75)
      .addScaledVector(side, 0.5 * size),
    _p1
      .copy(b)
      .addScaledVector(dir, -0.5 * size)
      .addScaledVector(side, 0.46 * size),
    RAM_R * size,
  );
  layBar(
    l.cable,
    _p0
      .copy(a)
      .addScaledVector(dir, sl * 0.85)
      .addScaledVector(side, -0.38 * size),
    _p1
      .copy(b)
      .addScaledVector(dir, -0.5 * size)
      .addScaledVector(side, -0.3 * size),
    CABLE_R * size,
  );
}
const additiveMat = (color: number, opacity: number) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
// n bolt heads on a ring round the tool's axis, at z
function boltRing(parent: THREE.Object3D, mat: THREE.Material, n: number, r: number, z: number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    parent.add(at(cylGeo(0.035, 0.035, 0.05, 6), mat, Math.cos(a) * r, Math.sin(a) * r, z, 'z'));
  }
}
interface Tool {
  jaws: THREE.Group[];
  open: (a: number) => void;
  heat: (k: number) => void;
  spin: (a: number) => void;
}
const noTool: Tool = { jaws: [], open: () => undefined, heat: () => undefined, spin: () => undefined };
// the tool on the wrist (added to `end`, which is made along +z): the wrist, then the scalpel, the injector or the clamp
function buildTool(kind: SurgeonArmKind, end: THREE.Group, mat: THREE.Material, glow: THREE.Material): Tool {
  const k = machine(),
    x = kit(),
    keep: THREE.Object3D[] = [];
  end.add(
    at(ballGeo(0.3, 1), k.steel, 0, 0, -0.62),
    at(cylGeo(0.27, 0.3, 0.4, 14), mat, 0, 0, -0.38, 'z'),
    at(torusGeo(0.3, 0.045), glow, 0, 0, -0.2),
    at(cylGeo(0.34, 0.34, 0.08, 14), k.steel, 0, 0, -0.1, 'z'),
    hose(
      [
        [0.22, 0.1, -0.7],
        [0.4, 0.16, -0.35],
        [0.24, 0.2, 0.15],
      ],
      0.04,
      x.rubber,
    ),
    hose(
      [
        [-0.22, 0.1, -0.7],
        [-0.4, 0.16, -0.35],
        [-0.24, 0.2, 0.15],
      ],
      0.04,
      x.rubber,
    ),
  );
  boltRing(end, k.black, 6, 0.31, -0.06);
  let tool: Tool = noTool;
  if (kind === 'scalpel') {
    // a housing with vents and a lit slit, a guard, a long blade with its edge lit red along it, the emitter at its tip
    const emit = new THREE.MeshBasicMaterial({ color: SCALPEL_DIM }),
      halo = new THREE.Mesh(ballGeo(1, 2), additiveMat(PAINT.red1, 0.1)),
      lit = new THREE.Color(SCALPEL_DIM),
      hot = new THREE.Color(SCALPEL_HOT);
    halo.position.set(0, -0.2, 2.05);
    halo.scale.setScalar(0.25);
    keep.push(halo);
    end.add(
      at(boxGeo(0.46, 0.42, 0.9), mat, 0, 0, 0.3),
      at(boxGeo(0.4, 0.08, 0.74), k.black, 0, -0.24, 0.3),
      at(boxGeo(0.2, 0.05, 0.26), emit, 0, 0.22, 0.52),
      at(boxGeo(0.8, 0.1, 0.18), k.steel, 0, 0, 0.78),
      at(boxGeo(0.1, 0.34, 0.2), k.steel, 0.4, 0, 0.78),
      at(boxGeo(0.1, 0.34, 0.2), k.steel, -0.4, 0, 0.78),
      at(boxGeo(0.2, 0.2, 0.3), k.black, 0, 0, 0.96),
      at(boxGeo(0.07, 0.42, 0.8), k.steel, 0, 0, 1.4),
      at(boxGeo(0.05, 0.2, 0.4), k.steel, 0, -0.1, 1.95),
      at(boxGeo(0.03, 0.04, 1.2), emit, 0, -0.22, 1.5),
      at(ballGeo(0.1, 1), emit, 0, -0.2, 2.05),
      halo,
    );
    for (let n = 0; n < 3; n++) end.add(at(boxGeo(0.3, 0.03, 0.08), k.black, 0, 0.22, 0.02 + n * 0.12));
    tool = {
      ...noTool,
      heat(f) {
        emit.color.copy(lit).lerp(hot, f);
        (halo.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.6 * f;
        halo.scale.setScalar(0.25 + 0.35 * f);
      },
    };
  } else if (kind === 'needle') {
    // an injector: a case with a rack of three vials of pale fluid on it, and a drum of six barrels that turns
    const drum = new THREE.Group(),
      flare = new THREE.Mesh(ballGeo(1, 2), additiveMat(FLARE_COLOR, 0));
    drum.position.z = 0.55;
    flare.position.z = 1.08;
    flare.visible = false;
    keep.push(drum, flare);
    end.add(
      at(boxGeo(0.6, 0.56, 0.9), mat, 0, 0, -0.05),
      at(boxGeo(0.5, 0.1, 0.8), k.black, 0, -0.32, -0.05),
      at(boxGeo(0.5, 0.08, 0.62), k.black, 0, 0.32, -0.1),
      at(boxGeo(0.4, 0.04, 0.04), x.fluid, 0, 0.18, 0.4),
      at(cylGeo(0.34, 0.34, 0.3, 14), k.black, 0, 0, 0.52, 'z'),
      turned(at(torusGeo(0.32, 0.03), k.steel, 0, 0, 0.67), 0, 0, 0),
      hose(
        [
          [-0.17, 0.4, -0.1],
          [-0.3, 0.3, 0.2],
          [-0.2, 0.15, 0.45],
        ],
        0.035,
        x.rubber,
      ),
      hose(
        [
          [0.17, 0.4, -0.1],
          [0.3, 0.3, 0.2],
          [0.2, 0.15, 0.45],
        ],
        0.035,
        x.rubber,
      ),
      flare,
      drum,
    );
    for (const vx of [-0.17, 0, 0.17])
      end.add(
        at(cylGeo(0.1, 0.1, 0.5, 10), x.glass, vx, 0.6, -0.1),
        at(cylGeo(0.07, 0.07, 0.4, 8), x.fluid, vx, 0.57, -0.1),
        at(cylGeo(0.11, 0.11, 0.06, 10), k.steel, vx, 0.88, -0.1),
      );
    drum.add(
      at(cylGeo(0.3, 0.3, 0.06, 14), k.steel, 0, 0, -0.1, 'z'),
      at(cylGeo(0.3, 0.3, 0.06, 14), k.black, 0, 0, 0.5, 'z'),
      at(torusGeo(0.24, 0.03), k.steel, 0, 0, 0.22),
      at(cylGeo(0.07, 0.07, 0.6, 8), k.black, 0, 0, 0.2, 'z'),
    );
    for (let n = 0; n < 6; n++) {
      const a = (n / 6) * Math.PI * 2,
        bx = Math.cos(a) * 0.19,
        by = Math.sin(a) * 0.19;
      drum.add(
        at(cylGeo(0.055, 0.05, 0.6, 8), k.steel, bx, by, 0.2, 'z'),
        at(cylGeo(0.07, 0.07, 0.05, 8), x.lens, bx, by, 0.52, 'z'),
      );
    }
    tool = {
      ...noTool,
      heat(f) {
        flare.visible = f > 0.01;
        (flare.material as THREE.MeshBasicMaterial).opacity = 0.9 * f;
        flare.scale.setScalar(0.15 + 0.5 * f);
      },
      spin(a) {
        drum.rotation.z = a;
      },
    };
  } else {
    // forceps: a hinge block, two heavy jaws with ridged inner faces, a ram from the block to each jaw's lever
    const jaws: THREE.Group[] = [],
      rams: Ram[] = [],
      JAW_AT = new THREE.Vector3(0.3, 0, 0.2), // a jaw's hinge (the left jaw's x is mirrored)
      LEVER = new THREE.Vector3(0.18, 0.27, 0.15), // where its ram takes hold, in the jaw's own place
      FIXED = new THREE.Vector3(0.5, 0.3, -0.15); // and where the ram stands on the block
    end.add(
      at(boxGeo(0.95, 0.56, 0.5), mat, 0, 0, -0.08),
      at(cylGeo(0.12, 0.12, 0.7, 8), k.steel, 0, 0, 0.22),
      at(cylGeo(0.18, 0.18, 0.08, 10), k.black, 0, 0.38, 0.22),
      at(boxGeo(0.7, 0.1, 0.3), k.black, 0, 0.32, -0.2),
    );
    for (const s of [-1, 1]) {
      const jaw = new THREE.Group();
      jaw.position.set(s * JAW_AT.x, 0, JAW_AT.z);
      jaw.add(
        at(boxGeo(0.34, 0.46, 0.4), mat, 0, 0, 0.05),
        at(boxGeo(0.2, 0.42, 0.6), k.steel, 0, 0, 0.55),
        at(boxGeo(0.22, 0.46, 0.18), k.black, 0, 0, 0.82),
        at(boxGeo(0.1, 0.3, 0.14), k.steel, -s * 0.16, 0, 0.82),
        at(boxGeo(0.12, 0.1, 0.2), k.steel, s * LEVER.x, LEVER.y, LEVER.z),
      );
      for (let n = 0; n < 5; n++) jaw.add(at(boxGeo(0.09, 0.3, 0.07), k.black, -s * 0.13, 0, 0.3 + n * 0.13));
      end.add(jaw);
      jaws.push(jaw);
      rams.push(makeRam(end));
      keep.push(jaw, rams[rams.length - 1]!.barrel, rams[rams.length - 1]!.rod);
    }
    const from = new THREE.Vector3(),
      to = new THREE.Vector3();
    tool = {
      ...noTool,
      jaws,
      open(a) {
        jaws.forEach((j, n) => {
          const s = n ? 1 : -1,
            c = Math.cos(s * a),
            sn = Math.sin(s * a);
          j.rotation.y = s * a;
          from.set(s * FIXED.x, FIXED.y, FIXED.z);
          to.set(
            s * LEVER.x * c + LEVER.z * sn + j.position.x,
            LEVER.y,
            -s * LEVER.x * sn + LEVER.z * c + j.position.z,
          );
          layRam(rams[n]!, from, to, 0.06);
        });
      },
    };
  }
  mergeParts(end, keep);
  return tool;
}
// an arm: the links in the enamel with steel stages, a knuckle between them with a lit ring each side; the tool on the
// wrist has the lit band, so the arms read as targets of their own
export function surgeonArm(kind: SurgeonArmKind, color: number): SurgeonArmLook {
  const mat = surgeonHullMat(color),
    k = machine(),
    glow = basicMat(color),
    limb = new THREE.Group(),
    end = new THREE.Group(),
    knuckle = new THREE.Group(),
    upper = buildLink(mat, limb),
    fore = buildLink(mat, limb);
  knuckle.add(
    at(cylGeo(0.44, 0.44, 0.82, 16), mat, 0, 0, 0, 'x'),
    at(cylGeo(0.32, 0.32, 1.04, 12), k.steel, 0, 0, 0, 'x'),
    at(cylGeo(0.2, 0.2, 1.14, 10), k.black, 0, 0, 0, 'x'),
    turned(at(torusGeo(0.35, 0.04), glow, 0.42, 0, 0), 0, HALF, 0),
    turned(at(torusGeo(0.35, 0.04), glow, -0.42, 0, 0), 0, HALF, 0),
    at(boxGeo(0.3, 0.2, 0.14), k.black, 0, 0, 0.44),
  );
  for (const sx of [-1, 1])
    for (let n = 0; n < 6; n++) {
      const a = (n / 6) * Math.PI * 2;
      knuckle.add(at(cylGeo(0.035, 0.035, 0.05, 6), k.black, sx * 0.44, Math.cos(a) * 0.4, Math.sin(a) * 0.4, 'x'));
    }
  mergeParts(knuckle);
  limb.add(knuckle);
  const tool = buildTool(kind, end, mat, glow),
    q1 = new THREE.Quaternion(),
    q2 = new THREE.Quaternion();
  return {
    end,
    limb,
    mat,
    pose(s, el, p, pole, size) {
      frameOf(q1, s, el, pole);
      frameOf(q2, el, p, pole);
      layLink(upper, s, el, q1, size);
      layLink(fore, el, p, q2, size);
      knuckle.position.copy(el);
      knuckle.quaternion.copy(q1);
      knuckle.scale.setScalar(size);
      end.position.copy(p);
      end.scale.setScalar(size);
      end.quaternion.setFromUnitVectors(Z_AXIS, _dir.copy(p).sub(el).normalize());
    },
    open: tool.open,
    heat: tool.heat,
    spin: tool.spin,
  };
}
