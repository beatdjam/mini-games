import type { EnemyDef, HumanoidRig } from '../../data/types.ts';
import * as THREE from 'three';
import { basicMat, lineMat, shared } from '@engine/render/render.ts';
import { COLOR } from '../../data/colors.ts';
import { edges, geoCache } from '../render.ts';
import { TEX, grain, paint } from '../looks/paint.ts';
import type { Paint } from '../looks/paint.ts';
import { V, at, ballGeo, bossHullMat, boxGeo, cylGeo, groundPool, machine, piston } from './machine.ts';
// The enemies as machines, to go with the sectors' looks (world/looks/) and the guns (world/models/gunLooks.ts): each type
// in the shape of what it is (a wheel that runs at you, a quadcopter, a sentry gun on a post ...), in painted armour
// plate, rubber and steel. What glows is small and in the type's own colour (an eye, a lamp), so a type can still be
// told by its colour; the whole body flashes in that colour when it is hit (the body material's emissive, as before).
// The plain enemies (glowing solids with outlines, world/models.ts) are still there for comparing (dev: ?plain).
// A model's origin is the middle of the body, def.y above the feet, and it faces +z; its size follows the plain
// solid's, since the collision radius and the hit sphere (def.r, def.hitR) are not changed.

// how the game moves a model's parts (actors/enemies.ts): the parts that roll forward while it moves (a wheel), the
// parts that whirl about their own upright axis (rotor blades, a mine), the part that looks about while it is asleep
// (a head); hover = it floats, so it bobs while asleep (the ones on the ground stand still)
export interface EnemyAnim {
  roll?: THREE.Object3D[];
  whirl?: { part: THREE.Object3D; rate: number }[];
  scan?: THREE.Object3D;
  hover?: boolean;
}
// A dark machine is lost against a dark wall, so every enemy stands in a pool of light of its own colour on the
// ground under it (as the sectors' lamps throw one), and its lamps are big enough to read from across a room
const POOL_SIZE = 3.2; // side of the pool as a multiple of the type's radius

// armour plate: dark gunmetal, a few seams, scratches worn bright (kept plain: busy panels and rivets read as a toy)
const platePaint: Paint = (g, rand) => {
  const base = g.createLinearGradient(0, 0, 0, TEX);
  base.addColorStop(0, '#3f444a');
  base.addColorStop(1, '#25282c');
  g.fillStyle = base;
  g.fillRect(0, 0, TEX, TEX);
  for (let n = 0; n < 90; n++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.14)';
    g.fillRect(rand() * TEX, rand() * TEX, 8 + rand() * 60, 3 + rand() * 18);
  }
  g.strokeStyle = 'rgba(0,0,0,.55)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, TEX * 0.66);
  g.lineTo(TEX, TEX * 0.66);
  g.moveTo(TEX * 0.38, 0);
  g.lineTo(TEX * 0.38, TEX * 0.66);
  g.stroke();
  for (let n = 0; n < 34; n++) {
    g.strokeStyle = `rgba(190,198,205,${0.1 + rand() * 0.22})`;
    g.lineWidth = 1;
    const x = rand() * TEX,
      y = rand() * TEX;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 46, y + (rand() - 0.5) * 12);
    g.stroke();
  }
  // worn edges
  g.fillStyle = 'rgba(170,178,186,.16)';
  g.fillRect(0, 0, TEX, 4);
  g.fillRect(0, TEX - 4, TEX, 4);
  grain(g, rand, 12);
};
// a tyre's tread (and a track's): black rubber with chevrons across it
const treadPaint: Paint = (g, rand) => {
  g.fillStyle = '#191a1c';
  g.fillRect(0, 0, TEX, TEX);
  g.strokeStyle = '#34363a';
  g.lineWidth = 9;
  for (let x = -TEX; x < TEX * 2; x += 30) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 26, TEX / 2);
    g.lineTo(x, TEX);
    g.stroke();
  }
  grain(g, rand, 14);
};
// a riot shield (and a dozer blade): steel with black and yellow chevrons along the bottom and a slit to see through
const shieldPaint: Paint = (g, rand) => {
  g.fillStyle = '#3d4852';
  g.fillRect(0, 0, TEX, TEX);
  for (let n = 0; n < 70; n++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.12)';
    g.fillRect(rand() * TEX, rand() * TEX, 6 + rand() * 46, 2 + rand() * 12);
  }
  g.fillStyle = '#0b0d10';
  g.fillRect(TEX * 0.22, TEX * 0.16, TEX * 0.56, TEX * 0.07);
  g.save();
  g.beginPath();
  g.rect(0, TEX * 0.82, TEX, TEX * 0.12);
  g.clip();
  g.fillStyle = '#c9a233';
  g.fillRect(0, TEX * 0.82, TEX, TEX * 0.12);
  g.fillStyle = '#17150f';
  for (let x = -40; x < TEX; x += 44) {
    g.beginPath();
    g.moveTo(x, TEX * 0.94);
    g.lineTo(x + 30, TEX * 0.82);
    g.lineTo(x + 52, TEX * 0.82);
    g.lineTo(x + 22, TEX * 0.94);
    g.fill();
  }
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,.6)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, TEX - 6, TEX - 6);
  grain(g, rand, 12);
};
let tex: { plate: THREE.CanvasTexture; tread: THREE.CanvasTexture; shield: THREE.CanvasTexture } | null = null;
const textures = () =>
  (tex ??= { plate: paint(3001, platePaint), tread: paint(3002, treadPaint), shield: paint(3003, shieldPaint) });
// the materials every enemy of a kind can share are made once and kept (shared: disposeTree leaves them)
const mats: Record<string, THREE.Material> = {};
const steelMat = () => (mats.steel ??= shared(new THREE.MeshLambertMaterial({ color: 0x3b4046 })));
const treadMat = () => (mats.tread ??= shared(new THREE.MeshLambertMaterial({ map: textures().tread })));
export const bladeMat = () => (mats.blade ??= shared(new THREE.MeshLambertMaterial({ map: textures().shield })));
interface Built {
  g: THREE.Group;
  body: THREE.Object3D;
  anim: EnemyAnim;
}
// body = the type's own body material (plate, flashing when hit), glow = unlit, in the type's colour
type Make = (body: THREE.Material, glow: THREE.Material) => Built;

// a thin whip aerial standing at (x, z), its foot at y
const aerial = (x: number, y: number, z: number, len: number) =>
  at(cylGeo(0.006, 0.014, len, 5), machine().steel, x, y + len / 2, z);
// a runner's wheel: the tyre, a dark rim, a hub and a bar across its outer face (side = +1 / -1: which side is out)
function runnerWheel(r: number, w: number, side: number): THREE.Mesh[] {
  const k = machine();
  return [
    at(cylGeo(r, r, w, 14), treadMat(), 0, 0, 0, 'x'),
    at(cylGeo(r * 0.68, r * 0.68, w + 0.02, 8), k.black, 0, 0, 0, 'x'),
    at(cylGeo(r * 0.26, r * 0.26, w + 0.08, 6), k.steel, 0, 0, 0, 'x'),
    at(boxGeo(0.02, r * 1.2, r * 0.17), k.steel, side * (w / 2 + 0.014), 0, 0),
  ];
}

// the runner: it runs at you and rams. Two driven wheels on an axle, a low hull with a deck stepped on it, a wedge
// of a bow, a toothed ram held out on two short rams, a sprung castor behind to keep it level, exhausts and a
// radiator at the back, one slit to see through. lite = the small one that comes in numbers: fewer parts
const runner =
  (scale: number, lite = false): Make =>
  (body, glow) => {
    const g = new THREE.Group(),
      k = machine(),
      wheels = [0.4, -0.4].map(x => {
        const w = new THREE.Group();
        w.position.set(x, -0.14, 0);
        w.add(...runnerWheel(0.44, 0.22, Math.sign(x)));
        return w;
      }),
      nose = at(boxGeo(0.5, 0.2, 0.34), body, 0, -0.08, 0.5);
    nose.rotation.x = 0.5; // the wedge
    g.add(
      ...wheels,
      at(boxGeo(0.56, 0.2, 0.9), body, 0, -0.04, 0.02), // the hull
      at(boxGeo(0.575, 0.025, 0.915), k.black, 0, 0.0675, 0.02), // the seam under the deck
      at(boxGeo(0.5, 0.1, 0.84), body, 0, 0.125, -0.02), // the deck
      nose,
      at(boxGeo(0.42, 0.06, 0.02), glow, 0, 0.125, 0.405), // the slit it sees through
      at(boxGeo(0.52, 0.03, 0.5), glow, 0, 0.176, -0.1), // the strip along its back
      at(boxGeo(0.58, 0.07, 0.06), k.steel, 0, -0.22, 0.67), // the ram's bar
      piston(V(0, -0.06, -0.42), V(0, -0.47, -0.66), 0.04), // the castor's strut
      at(cylGeo(0.1, 0.1, 0.08, 8), k.black, 0, -0.49, -0.68, 'x'), // the castor
    );
    for (const x of [-0.2, 0, 0.2]) {
      const tooth = at(boxGeo(0.07, 0.07, 0.3), k.steel, x, -0.24, 0.74);
      tooth.rotation.z = Math.PI / 4;
      g.add(tooth);
    }
    for (const x of [-0.15, 0.15]) g.add(at(cylGeo(0.04, 0.04, 0.16, 8), k.black, x, 0.0, -0.5, 'z')); // the exhausts
    if (!lite) {
      for (const x of [-0.21, 0.21]) g.add(piston(V(x, -0.1, 0.5), V(x, -0.22, 0.66), 0.035)); // the ram's arms
      for (const y of [0.1, 0.15]) g.add(at(boxGeo(0.2, 0.025, 0.02), k.black, 0, y, -0.445)); // the radiator
      g.add(aerial(-0.19, 0.17, -0.34, 0.5));
    }
    g.scale.setScalar(scale);
    return { g, body: g, anim: { roll: wheels } };
  };
// the drone: it hangs overhead and shoots down at you. A fuselage with a battery on its back, four arms each with a
// motor and a rotor, a camera behind a bezel in the nose, a gun with its magazine slung under the belly, skids to
// land on
const copter: Make = (body, glow) => {
  const g = new THREE.Group(),
    k = machine(),
    whirl: EnemyAnim['whirl'] = [];
  g.add(
    at(boxGeo(0.4, 0.2, 0.56), body, 0, 0, 0),
    at(boxGeo(0.3, 0.07, 0.34), k.black, 0, 0.135, -0.05), // the battery
    at(boxGeo(0.36, 0.16, 0.04), k.black, 0, 0.02, 0.285), // the camera's bezel
    at(boxGeo(0.3, 0.1, 0.02), glow, 0, 0.02, 0.31), // the camera
    at(boxGeo(0.44, 0.03, 0.3), glow, 0, -0.115, -0.08), // the strip under its belly (seen from below, where the player is)
    at(boxGeo(0.1, 0.09, 0.24), k.steel, 0, -0.18, 0.1), // the gun: its receiver,
    at(cylGeo(0.028, 0.028, 0.3, 8), k.black, 0, -0.19, 0.36, 'z'), // its barrel
    at(boxGeo(0.06, 0.13, 0.08), k.black, 0, -0.28, 0.06), // and its magazine
    aerial(0.1, 0.17, -0.2, 0.34),
  );
  for (const sx of [-1, 1])
    g.add(
      at(boxGeo(0.03, 0.03, 0.5), k.steel, sx * 0.17, -0.3, 0), // the skids
      at(boxGeo(0.025, 0.2, 0.14), k.black, sx * 0.17, -0.2, -0.04),
    );
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    const arm = at(boxGeo(0.06, 0.04, 0.62), k.black, sx * 0.3, 0.06, sz * 0.3),
      rotor = new THREE.Group();
    arm.rotation.y = (sx * sz * Math.PI) / 4;
    rotor.position.set(sx * 0.5, 0.165, sz * 0.5);
    rotor.add(at(boxGeo(0.5, 0.012, 0.06), k.steel, 0, 0, 0), at(cylGeo(0.03, 0.03, 0.04, 6), k.black, 0, 0.01, 0));
    g.add(arm, at(cylGeo(0.055, 0.055, 0.13, 8), k.black, sx * 0.5, 0.09, sz * 0.5), rotor);
    whirl.push({ part: rotor, rate: 34 * sx * sz });
  }
  return { g, body: g, anim: { whirl, hover: true } };
};
// the turret: a sentry gun bolted to the floor. A base plate held by four bolts, a post with its cable, a slew ring;
// on it a gun cradle on trunnions with twin barrels in cooling shrouds through a mantlet, the ammunition box behind,
// cooling fins and a lamp on top
const sentry: Make = (body, glow) => {
  const g = new THREE.Group(),
    k = machine(),
    head = new THREE.Group();
  head.position.y = 0.5;
  head.add(
    at(boxGeo(0.6, 0.4, 0.8), body, 0, 0, -0.02), // the cradle
    at(boxGeo(0.66, 0.3, 0.08), k.black, 0, -0.02, 0.41), // the mantlet
    at(cylGeo(0.1, 0.1, 0.7, 8), k.steel, 0, 0.05, -0.05, 'x'), // the trunnions
    at(boxGeo(0.46, 0.34, 0.24), body, 0, -0.02, -0.54), // the ammunition box
    at(boxGeo(0.3, 0.05, 0.3), k.black, 0, 0.22, -0.1), // the lamp's seat
    at(boxGeo(0.24, 0.1, 0.24), glow, 0, 0.29, -0.1), // the lamp
    at(boxGeo(0.5, 0.08, 0.02), glow, 0, 0.07, 0.455), // the sensor in its face
    at(boxGeo(0.62, 0.05, 0.6), glow, 0, -0.14, -0.1), // the strip round its sides
    aerial(-0.18, 0.15, -0.56, 0.6),
  );
  for (const x of [-0.16, 0.16])
    head.add(
      at(cylGeo(0.042, 0.042, 0.62, 8), k.black, x, -0.06, 0.76, 'z'), // a barrel
      at(cylGeo(0.07, 0.07, 0.26, 8), k.steel, x, -0.06, 0.58, 'z'), // and its shroud
    );
  for (let n = 0; n < 3; n++) head.add(at(boxGeo(0.4, 0.07, 0.03), k.black, 0, 0.225, -0.3 - n * 0.07)); // the fins
  g.add(
    at(cylGeo(0.76, 0.84, 0.08, 8), k.black, 0, -0.86, 0), // the base plate
    at(cylGeo(0.36, 0.56, 0.2, 8), steelMat(), 0, -0.72, 0), // the plinth
    at(cylGeo(0.16, 0.2, 0.8, 10), k.steel, 0, -0.24, 0), // the post
    at(cylGeo(0.3, 0.3, 0.1, 12), k.black, 0, 0.21, 0), // the slew ring
    at(cylGeo(0.03, 0.03, 0.74, 6), k.black, 0.12, -0.26, -0.17), // the cable up the post
    head,
  );
  for (let n = 0; n < 4; n++) {
    const a = (n + 0.5) * (Math.PI / 2);
    g.add(at(cylGeo(0.05, 0.05, 0.06, 6), k.steel, Math.cos(a) * 0.66, -0.8, Math.sin(a) * 0.66)); // the bolts
  }
  return { g, body: head, anim: { scan: head } };
};
// the brute: a tracked assault machine that shoves and shells. Tracks over a sprocket and an idler, a hull with a
// sloped bow, a dozer blade on two rams with a steel edge, a turret with a visor, a pod of two launch
// tubes on each shoulder, exhaust stacks and a grille behind
const tank: Make = (body, glow) => {
  const g = new THREE.Group(),
    k = machine(),
    bow = at(boxGeo(1.46, 0.42, 0.1), body, 0, -0.04, 0.87);
  bow.rotation.x = -0.3; // the sloped bow plate
  g.add(
    at(boxGeo(1.5, 0.83, 1.7), body, 0, -0.235, 0), // the hull
    bow,
    at(boxGeo(1.52, 0.06, 1.4), glow, 0, 0.21, 0), // the strip round the hull, under the turret
    at(boxGeo(1.2, 0.72, 1.2), body, 0, 0.6, -0.05), // the turret
    at(boxGeo(1.0, 0.14, 0.03), glow, 0, 0.74, 0.565), // its visor
    at(boxGeo(1.86, 0.62, 0.12), bladeMat(), 0, -0.6, 1.02), // the blade
    at(boxGeo(1.9, 0.08, 0.17), k.steel, 0, -0.94, 1.04), // its cutting edge
    aerial(0.42, 0.96, -0.5, 0.8),
  );
  for (const sx of [-1, 1]) {
    g.add(
      at(boxGeo(0.46, 0.6, 1.9), treadMat(), sx * 0.72, -0.8, 0), // a track
      at(boxGeo(0.34, 0.36, 0.8), body, sx * 0.79, 0.7, 0.05), // a launcher pod
      piston(V(sx * 0.5, -0.32, 0.85), V(sx * 0.5, -0.52, 0.97), 0.07), // a ram behind the blade
      at(cylGeo(0.07, 0.09, 0.6, 8), k.black, sx * 0.4, 0.45, -0.75), // an exhaust stack
    );
    for (const y of [0.61, 0.79]) g.add(at(cylGeo(0.075, 0.075, 0.06, 8), k.black, sx * 0.79, y, 0.45, 'z')); // tubes
    // the sprocket in front and the idler behind, each with its hub
    for (const z of [0.62, -0.62])
      g.add(
        at(cylGeo(0.24, 0.24, 0.05, 8), k.steel, sx * 0.96, -0.82, z, 'x'),
        at(cylGeo(0.09, 0.09, 0.09, 6), k.black, sx * 0.96, -0.82, z, 'x'),
      );
  }
  g.add(at(boxGeo(0.9, 0.3, 0.05), k.black, 0, -0.2, -0.86)); // the grille behind
  return { g, body: g, anim: {} };
};
// the sniper: a long rifle that keeps its distance. A tripod of three rams on castors, a post with a lit collar, a
// head tilted by a ram of its own; the rifle's barrel through a handguard to a muzzle brake, a scope with a red
// lens over it, the battery behind as a counterweight
const marksman: Make = (body, glow) => {
  const g = new THREE.Group(),
    k = machine();
  g.add(
    at(cylGeo(0.13, 0.13, 0.12, 8), k.black, 0, -0.62, 0), // the tripod's hub
    at(boxGeo(0.14, 1.02, 0.14), k.steel, 0, -0.1, 0), // the post
    at(boxGeo(0.18, 0.5, 0.18), glow, 0, -0.22, 0), // the lit collar on the post
    at(boxGeo(0.34, 0.26, 0.5), body, 0, 0.55, 0), // the head
    at(boxGeo(0.38, 0.05, 0.4), glow, 0, 0.42, 0), // the strip under its head
    at(boxGeo(0.24, 0.2, 0.16), k.black, 0, 0.55, -0.33), // the battery
    piston(V(0, 0.1, -0.09), V(0, 0.44, -0.3), 0.03), // the ram that tilts the head
    at(cylGeo(0.034, 0.034, 1.0, 8), k.black, 0, 0.52, 0.85, 'z'), // the barrel
    at(cylGeo(0.06, 0.06, 0.36, 8), k.steel, 0, 0.52, 0.44, 'z'), // its handguard
    at(cylGeo(0.058, 0.058, 0.13, 8), k.steel, 0, 0.52, 1.36, 'z'), // its muzzle brake
    at(boxGeo(0.08, 0.06, 0.2), k.black, 0, 0.69, 0.08), // the scope's mount
    at(cylGeo(0.065, 0.065, 0.38, 10), k.black, 0, 0.77, 0.09, 'z'), // the scope
    at(cylGeo(0.095, 0.095, 0.08, 10), k.black, 0, 0.77, 0.3, 'z'), // its bell
    at(cylGeo(0.08, 0.08, 0.03, 10), basicMat(COLOR.mag), 0, 0.77, 0.335, 'z'), // the lens
    aerial(-0.11, 0.68, -0.2, 0.5),
  );
  for (const a of [-Math.PI / 2, Math.PI / 6, (Math.PI * 5) / 6]) {
    const x = Math.cos(a) * 0.44,
      z = Math.sin(a) * 0.44;
    g.add(
      piston(V(x * 0.2, -0.62, z * 0.2), V(x, -0.84, z), 0.035), // a leg
      at(cylGeo(0.09, 0.09, 0.07, 8), k.black, x, -0.86, z, 'x'), // and its castor
    );
  }
  return { g, body: g, anim: {} };
};
// the shield bearer: it walks its shield into you. Two short tracks under a turntable, a trunk with the power pack,
// its stacks and its radiator on the back (where you have to shoot it), a head with one slit; the shield as tall as
// it is, held out on a ram from each shoulder with a brace bar across
const riot: Make = (body, glow) => {
  const g = new THREE.Group(),
    k = machine(),
    plate = new THREE.Mesh(geoCache.shieldPlate, new THREE.MeshLambertMaterial({ map: textures().shield })),
    edge = new THREE.LineSegments(edges('shieldPlate'), lineMat(COLOR.shield));
  plate.position.set(0, 0.1, 0.75);
  edge.position.copy(plate.position);
  g.add(
    at(boxGeo(0.56, 0.3, 0.8), k.black, 0, -0.72, 0), // the chassis between the tracks
    at(cylGeo(0.3, 0.3, 0.18, 10), k.steel, 0, -0.49, 0), // the turntable
    at(boxGeo(0.84, 0.92, 0.62), body, 0, 0.06, 0), // the trunk
    at(boxGeo(0.86, 0.06, 0.64), glow, 0, -0.36, 0), // the strip round its waist (seen from the sides and behind)
    at(cylGeo(0.13, 0.13, 0.06, 8), k.black, 0, 0.55, 0), // the neck
    at(boxGeo(0.38, 0.26, 0.38), body, 0, 0.71, 0), // the head
    at(boxGeo(0.34, 0.09, 0.02), glow, 0, 0.71, 0.195), // its visor
    at(boxGeo(0.6, 0.5, 0.2), body, 0, 0.12, -0.4), // the power pack on its back
    at(boxGeo(1.2, 0.06, 0.05), k.steel, 0, 0.2, 0.66), // the brace bar behind the shield
    aerial(0.3, 0.52, -0.2, 0.55),
    plate,
    edge,
  );
  for (const sx of [-1, 1])
    g.add(
      at(boxGeo(0.26, 0.4, 0.96), treadMat(), sx * 0.4, -0.8, 0), // a track
      at(cylGeo(0.15, 0.15, 0.04, 8), k.steel, sx * 0.54, -0.82, 0.3, 'x'), // its wheels
      at(cylGeo(0.15, 0.15, 0.04, 8), k.steel, sx * 0.54, -0.82, -0.3, 'x'),
      at(boxGeo(0.18, 0.22, 0.26), k.black, sx * 0.51, 0.26, 0.05), // a shoulder
      piston(V(sx * 0.52, 0.26, 0.16), V(sx * 0.52, 0.2, 0.66), 0.05), // the ram that holds the shield
      at(cylGeo(0.06, 0.07, 0.44, 8), k.black, sx * 0.2, 0.5, -0.43), // a stack
    );
  for (const y of [0.0, 0.14]) g.add(at(boxGeo(0.4, 0.05, 0.03), k.black, 0, y, -0.505)); // the radiator
  g.userData.shield = [plate, edge];
  return { g, body: g, anim: {} };
};
// the bomber: a mine that flies at you. A faceted shell with a lit band between two dark girdles, long contact
// horns all round, a fuse cap with an arming light and the firing pin on top; under it the lift jet it rides on
// (the shell and its horns turn; the jet does not)
const mine: Make = (body, glow) => {
  const g = new THREE.Group(),
    k = machine(),
    ball = new THREE.Group();
  ball.add(
    at(ballGeo(0.42), body, 0, 0, 0),
    at(cylGeo(0.435, 0.435, 0.07, 14), glow, 0, 0, 0),
    at(cylGeo(0.428, 0.4, 0.035, 14), k.black, 0, 0.0525, 0), // the girdles
    at(cylGeo(0.4, 0.428, 0.035, 14), k.black, 0, -0.0525, 0),
    at(cylGeo(0.13, 0.17, 0.1, 8), k.black, 0, 0.42, 0), // the fuse cap
    at(cylGeo(0.07, 0.07, 0.03, 8), k.jet, 0, 0.485, 0), // the arming light
    at(cylGeo(0.01, 0.045, 0.28, 6), k.steel, 0, 0.63, 0), // the firing pin
  );
  for (let n = 0; n < 8; n++) {
    const a = (n / 8) * Math.PI * 2,
      up = n % 2 ? 0.22 : -0.22,
      horn = at(cylGeo(0.01, 0.05, 0.3, 6), k.steel, Math.cos(a) * 0.5, up, Math.sin(a) * 0.5, 'x');
    horn.rotation.y = -a;
    horn.rotation.z = -Math.PI / 2; // the point outward
    ball.add(horn);
  }
  g.add(
    ball,
    at(cylGeo(0.2, 0.3, 0.16, 10), k.black, 0, -0.43, 0), // the jet's bell
    at(cylGeo(0.26, 0.26, 0.03, 10), k.jet, 0, -0.5, 0), // its throat, hot
  );
  return { g, body: ball, anim: { whirl: [{ part: ball, rate: 3 }], hover: true } };
};
// the splitter: a carrier that breaks open into two small runners. A faceted pod on a lift jet, split down a lit
// seam that three latches hold shut; a runner's wheel clamped to each side (they are what it breaks into); one slit
// in a dark housing to see through, exhausts behind
const carrier: Make = (body, glow) => {
  const g = new THREE.Group(),
    k = machine();
  g.add(
    at(ballGeo(0.7, 0), body, 0, 0, 0),
    at(cylGeo(0.66, 0.66, 0.05, 12), glow, 0, 0, 0, 'x'), // the seam
    at(boxGeo(0.56, 0.14, 0.16), k.black, 0, 0.22, 0.61), // the housing of the slit (it sits over the seam)
    at(boxGeo(0.5, 0.07, 0.02), glow, 0, 0.22, 0.695), // the slit it sees through
    at(cylGeo(0.24, 0.34, 0.2, 10), k.black, 0, -0.66, 0), // the lift jet's bell
    at(cylGeo(0.3, 0.3, 0.03, 10), k.jet, 0, -0.75, 0), // its throat, hot
    aerial(0.22, 0.5, -0.2, 0.6),
  );
  // the latches across the seam: on top, behind, and low in front
  for (const a of [Math.PI / 2, Math.PI * 1.02, -0.9]) {
    const latch = at(boxGeo(0.22, 0.08, 0.16), k.steel, 0, Math.sin(a) * 0.65, Math.cos(a) * 0.65);
    latch.rotation.x = Math.PI / 2 - a;
    g.add(latch);
  }
  for (const sx of [-1, 1]) {
    const wheel = new THREE.Group();
    wheel.position.set(sx * 0.72, -0.25, 0);
    wheel.add(...runnerWheel(0.3, 0.2, sx));
    g.add(
      wheel,
      at(boxGeo(0.34, 0.07, 0.18), k.black, sx * 0.66, 0.085, 0), // the clamp over it
      at(cylGeo(0.055, 0.055, 0.2, 8), k.black, sx * 0.26, 0.12, -0.56, 'z'), // an exhaust
    );
  }
  return { g, body: g, anim: { hover: true } };
};
const MAKERS: Record<string, Make> = {
  tetra: runner(1),
  tetraS: runner(0.66, true),
  octa: copter,
  cyl: sentry,
  box: tank,
  rod: marksman,
  slab: riot,
  ico: mine,
  dodeca: carrier,
};
// The model of an enemy type with a look (null for a type without one: the trooper has its own, below), and the
// material that flashes when it is hit
export function enemyLook(def: EnemyDef): (Built & { mat: THREE.MeshLambertMaterial }) | null {
  const make = MAKERS[def.geo];
  if (!make) return null;
  const mat = enemyHullMat(def, FACETED.includes(def.geo)),
    built = make(mat, basicMat(def.color));
  built.g.add(lightPool(def));
  return { ...built, mat };
}
// An enemy's own body material as a machine's: hull plate that takes the light, a little of the type's colour in it
// (more while it flashes). The same as a boss's (world/models/machine.ts). unmarked = without the panels and the stencilled
// mark: for a faceted shell, where they would lie askew across the faces
export function enemyHullMat(def: { color: number }, unmarked = false): THREE.MeshLambertMaterial {
  const m = bossHullMat(def.color);
  if (unmarked) m.map = textures().plate;
  return m;
}
const FACETED = ['ico', 'dodeca']; // the shapes (def.geo) whose body is a faceted shell
// The trooper as a soldier machine: armour and kit on the jointed doll (buildHumanoid in world/models.ts). Every part
// goes on a joint, so it moves with the walk and the aim (poseHumanoid in actors/enemies.ts). body = its body
// material, color = its type's colour
export function dressTrooper(rig: HumanoidRig, body: THREE.Material, color: number) {
  const k = machine(),
    glow = basicMat(color);
  rig.upper.add(
    at(boxGeo(0.5, 0.3, 0.06), body, 0, 0.55, 0.2), // the chest plate
    at(boxGeo(0.3, 0.04, 0.02), glow, 0, 0.33, 0.2), // the lamp under it
    at(boxGeo(0.64, 0.07, 0.4), k.black, 0, 0.14, 0), // the belt
    at(boxGeo(0.3, 0.06, 0.3), k.black, 0, 0.77, 0), // the collar
    at(boxGeo(0.44, 0.44, 0.16), body, 0, 0.46, -0.27), // the pack on its back,
    at(cylGeo(0.05, 0.05, 0.3, 8), k.black, 0.13, 0.74, -0.27), // its stacks
    at(cylGeo(0.05, 0.05, 0.3, 8), k.black, -0.13, 0.74, -0.27),
    at(boxGeo(0.46, 0.04, 0.02), glow, 0, 0.3, -0.355), // and the lamp across it (seen from behind)
  );
  rig.neck.add(
    at(boxGeo(0.36, 0.07, 0.12), k.black, 0, 0.265, 0.14), // the helmet's brow over the visor
    at(boxGeo(0.1, 0.06, 0.3), body, 0, 0.345, -0.02), // its crest
    at(cylGeo(0.05, 0.05, 0.06, 8), k.steel, -0.19, 0.14, 0, 'x'), // the radio on its ear
    aerial(-0.2, 0.16, -0.04, 0.4),
  );
  for (const [arm, sx] of [
    [rig.armL, -1],
    [rig.armR, 1],
  ] as const)
    arm.add(
      at(boxGeo(0.22, 0.16, 0.26), body, sx * 0.02, 0.0, 0), // a shoulder guard
      at(boxGeo(0.19, 0.07, 0.21), k.black, 0, -0.32, 0), // an elbow
    );
  // the rifle along the forearm (it points forward when the arm is raised): barrel, magazine ahead of the hand
  rig.armR.add(
    at(cylGeo(0.022, 0.022, 0.28, 6), k.black, 0, -1.06, 0.1),
    at(boxGeo(0.06, 0.14, 0.12), k.black, 0, -0.76, -0.02),
  );
  for (const leg of [rig.legL, rig.legR])
    leg.add(
      at(boxGeo(0.24, 0.16, 0.1), body, 0, -0.47, 0.11), // a knee guard
      at(boxGeo(0.24, 0.1, 0.36), k.black, 0, -0.95, 0.05), // a foot
    );
}
// the pool of light on the ground under an enemy, in its colour (under a flying one too: it shows where it is)
export function lightPool(def: EnemyDef): THREE.Mesh {
  const m = groundPool(def.color, def.r * POOL_SIZE);
  m.position.y = -def.y + POOL_Y;
  return m;
}
const POOL_Y = 0.06; // above the ground (and above a hazard floor's two layers)
