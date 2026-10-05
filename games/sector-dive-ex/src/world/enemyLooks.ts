import type { EnemyDef } from '../data/types.ts';
import * as THREE from 'three';
import { basicMat, lineMat, shared } from '@engine/render/render.ts';
import { COLOR } from '../data/colors.ts';
import { edges, geoCache } from './render.ts';
import { TEX, grain, paint, poolPaint } from './looks/common.ts';
import type { Paint } from './looks/common.ts';
// The enemies as machines, to go with the sectors' looks (world/looks/) and the guns (actors/gunLooks.ts): each type
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
export const LOOK_GLOW = 0.05; // the body's own glow in its colour (the plain enemies are at 0.4: they are all glow)
// A dark machine is lost against a dark wall, so every enemy stands in a pool of light of its own colour on the
// ground under it (as the sectors' lamps throw one), and its lamps are big enough to read from across a room
const POOL = { size: 3.2, opacity: 0.55 }; // side of the pool as a multiple of the type's radius; how strong

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
// geometries and the materials every enemy of a kind can share are made once and kept (shared: disposeTree leaves them)
const geos: Record<string, THREE.BufferGeometry> = {};
const boxGeo = (w: number, h: number, d: number) =>
  (geos[`b${w},${h},${d}`] ??= shared(new THREE.BoxGeometry(w, h, d)));
const cylGeo = (rt: number, rb: number, len: number, seg = 14) =>
  (geos[`c${rt},${rb},${len},${seg}`] ??= shared(new THREE.CylinderGeometry(rt, rb, len, seg)));
// a faceted ball (flat faces: armour, not a toy ball)
const ballGeo = (r: number, detail = 1) =>
  (geos[`s${r},${detail}`] ??= shared(new THREE.IcosahedronGeometry(r, detail)));
const mats: Record<string, THREE.Material> = {};
const darkMat = () => (mats.dark ??= shared(new THREE.MeshLambertMaterial({ color: 0x17191c })));
const steelMat = () => (mats.steel ??= shared(new THREE.MeshLambertMaterial({ color: 0x3b4046 })));
const treadMat = () => (mats.tread ??= shared(new THREE.MeshLambertMaterial({ map: textures().tread })));
const bladeMat = () => (mats.blade ??= shared(new THREE.MeshLambertMaterial({ map: textures().shield })));
type Axis = 'x' | 'y' | 'z';
// a mesh at (x, y, z); a cylinder's own axis is y: `along` lays it along x or z instead
function at(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, along: Axis = 'y') {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (along === 'x') m.rotation.z = Math.PI / 2;
  if (along === 'z') m.rotation.x = Math.PI / 2;
  return m;
}
interface Built {
  g: THREE.Group;
  body: THREE.Object3D;
  anim: EnemyAnim;
}
// body = the type's own body material (plate, flashing when hit), glow = unlit, in the type's colour
type Make = (body: THREE.Material, glow: THREE.Material) => Built;

// the runner: low and wide, a wedge of armour between two wheels with a toothed ram in front and one slit of light
const runner =
  (scale: number): Make =>
  (body, glow) => {
    const g = new THREE.Group(),
      wheels = [0.4, -0.4].map(x => {
        const w = new THREE.Group();
        w.position.set(x, -0.14, 0);
        w.add(
          at(cylGeo(0.44, 0.44, 0.22, 14), treadMat(), 0, 0, 0, 'x'),
          at(cylGeo(0.2, 0.2, 0.25, 8), steelMat(), 0, 0, 0, 'x'),
        );
        return w;
      });
    const hull = at(boxGeo(0.54, 0.3, 0.9), body, 0, 0.02, 0.02),
      nose = at(boxGeo(0.5, 0.2, 0.34), body, 0, -0.08, 0.5);
    nose.rotation.x = 0.5; // the wedge
    g.add(
      ...wheels,
      hull,
      nose,
      at(boxGeo(0.42, 0.06, 0.02), glow, 0, 0.07, 0.475), // the slit it sees through
      at(boxGeo(0.56, 0.03, 0.5), glow, 0, 0.176, -0.1), // the strip along its back
    );
    for (const x of [-0.2, 0, 0.2]) {
      const tooth = at(boxGeo(0.07, 0.07, 0.3), steelMat(), x, -0.24, 0.72);
      tooth.rotation.z = Math.PI / 4;
      g.add(tooth);
    }
    g.scale.setScalar(scale);
    return { g, body: g, anim: { roll: wheels } };
  };
// the drone: a quadcopter with a camera in its nose and a gun under it
const copter: Make = (body, glow) => {
  const g = new THREE.Group(),
    whirl: EnemyAnim['whirl'] = [];
  g.add(
    at(boxGeo(0.42, 0.24, 0.56), body, 0, 0, 0),
    at(boxGeo(0.3, 0.1, 0.02), glow, 0, 0.02, 0.285), // the camera
    at(boxGeo(0.44, 0.03, 0.3), glow, 0, -0.125, -0.08), // the strip under its belly (seen from below, where the player is)
    at(cylGeo(0.035, 0.035, 0.34, 8), darkMat(), 0, -0.15, 0.2, 'z'), // the gun
  );
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    const arm = at(boxGeo(0.06, 0.04, 0.62), darkMat(), sx * 0.3, 0.06, sz * 0.3),
      blade = at(boxGeo(0.5, 0.012, 0.06), steelMat(), sx * 0.5, 0.15, sz * 0.5);
    arm.rotation.y = (sx * sz * Math.PI) / 4;
    g.add(arm, at(cylGeo(0.05, 0.05, 0.1, 8), darkMat(), sx * 0.5, 0.1, sz * 0.5), blade);
    whirl.push({ part: blade, rate: 34 * sx * sz });
  }
  return { g, body: g, anim: { whirl, hover: true } };
};
// the turret: a sentry gun on a post, twin barrels, a lamp on top
const sentry: Make = (body, glow) => {
  const g = new THREE.Group(),
    head = new THREE.Group();
  head.position.y = 0.5;
  head.add(
    at(boxGeo(0.72, 0.46, 0.9), body, 0, 0, 0),
    at(cylGeo(0.06, 0.06, 0.6, 10), darkMat(), 0.16, -0.04, 0.72, 'z'),
    at(cylGeo(0.06, 0.06, 0.6, 10), darkMat(), -0.16, -0.04, 0.72, 'z'),
    at(boxGeo(0.24, 0.1, 0.24), glow, 0, 0.28, -0.1), // the lamp
    at(boxGeo(0.5, 0.08, 0.02), glow, 0, 0.1, 0.46), // the sensor in its face
    at(boxGeo(0.74, 0.05, 0.6), glow, 0, -0.14, -0.1), // the strip round its sides
  );
  g.add(
    at(cylGeo(0.62, 0.84, 0.24, 10), darkMat(), 0, -0.78, 0), // the foot
    at(cylGeo(0.2, 0.26, 0.96, 10), steelMat(), 0, -0.2, 0), // the post
    head,
  );
  return { g, body: head, anim: { scan: head } };
};
// the brute: a tracked hull with a dozer blade, a turret box with a visor and two launchers on its shoulders
const tank: Make = (body, glow) => {
  const g = new THREE.Group();
  g.add(
    at(boxGeo(0.5, 0.62, 1.9), treadMat(), 0.72, -0.79, 0), // the tracks
    at(boxGeo(0.5, 0.62, 1.9), treadMat(), -0.72, -0.79, 0),
    at(boxGeo(1.5, 0.9, 1.7), body, 0, -0.2, 0), // the hull
    at(boxGeo(1.2, 0.74, 1.2), body, 0, 0.62, -0.05), // the turret box
    at(boxGeo(1.0, 0.14, 0.03), glow, 0, 0.74, 0.565), // its visor
    at(boxGeo(1.52, 0.06, 1.4), glow, 0, 0.22, 0), // the strip round the hull
    at(boxGeo(0.36, 0.36, 0.84), darkMat(), 0.8, 0.72, 0.05), // the launchers
    at(boxGeo(0.36, 0.36, 0.84), darkMat(), -0.8, 0.72, 0.05),
    at(boxGeo(1.86, 0.62, 0.12), bladeMat(), 0, -0.6, 1.02), // the blade
  );
  return { g, body: g, anim: {} };
};
// the sniper: a long rifle on a thin post, a lens that shows where it looks
const marksman: Make = (body, glow) => {
  const g = new THREE.Group(),
    lens = at(cylGeo(0.09, 0.09, 0.06, 10), basicMat(COLOR.mag), 0, 0.76, 0.3, 'z');
  g.add(
    at(cylGeo(0.4, 0.5, 0.08, 10), darkMat(), 0, -0.9, 0), // the foot
    at(boxGeo(0.16, 1.3, 0.16), steelMat(), 0, -0.25, 0), // the post
    at(boxGeo(0.36, 0.3, 0.56), body, 0, 0.55, 0), // the head
    at(cylGeo(0.045, 0.045, 1.1, 8), darkMat(), 0, 0.52, 0.8, 'z'), // the barrel
    at(cylGeo(0.08, 0.08, 0.3, 10), darkMat(), 0, 0.76, 0.14, 'z'), // the scope
    at(boxGeo(0.38, 0.05, 0.4), glow, 0, 0.42, 0), // the strip under its head
    at(boxGeo(0.18, 0.5, 0.18), glow, 0, -0.4, 0), // the lit collar on the post
    lens,
  );
  return { g, body: g, anim: {} };
};
// the shield bearer: a squat machine behind a riot shield as tall as it is
const riot: Make = (body, glow) => {
  const g = new THREE.Group(),
    plate = new THREE.Mesh(geoCache.shieldPlate, new THREE.MeshLambertMaterial({ map: textures().shield })),
    edge = new THREE.LineSegments(edges('shieldPlate'), lineMat(COLOR.shield));
  plate.position.set(0, 0.1, 0.75);
  edge.position.copy(plate.position);
  g.add(
    at(boxGeo(0.94, 0.5, 0.84), darkMat(), 0, -0.65, 0), // the base
    at(boxGeo(0.84, 0.92, 0.62), body, 0, 0.06, 0), // the trunk
    at(boxGeo(0.38, 0.3, 0.38), body, 0, 0.67, 0), // the head
    at(boxGeo(0.34, 0.09, 0.02), glow, 0, 0.69, 0.195), // its visor
    at(boxGeo(0.86, 0.06, 0.64), glow, 0, -0.36, 0), // the strip round its waist (seen from the sides and behind)
    at(boxGeo(0.16, 0.16, 0.5), darkMat(), 0.52, 0.2, 0.36), // the arms that hold the shield
    at(boxGeo(0.16, 0.16, 0.5), darkMat(), -0.52, 0.2, 0.36),
    plate,
    edge,
  );
  g.userData.shield = [plate, edge];
  return { g, body: g, anim: {} };
};
// the bomber: a mine that comes at you: a faceted ball with long spikes and a band of light round it
const mine: Make = (body, glow) => {
  const g = new THREE.Group(),
    ball = new THREE.Group();
  ball.add(at(ballGeo(0.42), body, 0, 0, 0), at(cylGeo(0.435, 0.435, 0.07, 14), glow, 0, 0, 0));
  for (let n = 0; n < 8; n++) {
    const a = (n / 8) * Math.PI * 2,
      up = n % 2 ? 0.22 : -0.22,
      spike = at(cylGeo(0.01, 0.05, 0.3, 6), steelMat(), Math.cos(a) * 0.5, up, Math.sin(a) * 0.5, 'x');
    spike.rotation.y = -a;
    spike.rotation.z = -Math.PI / 2; // the point outward
    ball.add(spike);
  }
  ball.add(at(cylGeo(0.01, 0.05, 0.3, 6), steelMat(), 0, 0.52, 0));
  g.add(ball);
  return { g, body: ball, anim: { whirl: [{ part: ball, rate: 3 }], hover: true } };
};
// the splitter: a faceted pod with a runner's wheels slung on each side (they are what it breaks into); the seam it
// splits along is lit
const carrier: Make = (body, glow) => {
  const g = new THREE.Group();
  g.add(
    at(ballGeo(0.7, 0), body, 0, 0, 0),
    at(cylGeo(0.66, 0.66, 0.05, 12), glow, 0, 0, 0, 'x'), // the seam
    at(cylGeo(0.3, 0.3, 0.2, 12), treadMat(), 0.72, -0.25, 0, 'x'), // the runners' wheels
    at(cylGeo(0.3, 0.3, 0.2, 12), treadMat(), -0.72, -0.25, 0, 'x'),
    at(boxGeo(0.5, 0.07, 0.02), glow, 0, 0.22, 0.56), // the slit it sees through
  );
  return { g, body: g, anim: { hover: true } };
};
const MAKERS: Record<string, Make> = {
  tetra: runner(1),
  tetraS: runner(0.66),
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
  const mat = lookBodyMat(def),
    built = make(mat, basicMat(def.color));
  built.g.add(lightPool(def));
  return { ...built, mat };
}
// the pool of light on the ground under an enemy, in its colour (under a flying one too: it shows where it is)
const poolMats: Record<number, THREE.Material> = {};
let poolTex: THREE.CanvasTexture | null = null;
const poolGeo = (side: number) =>
  (geos[`p${side}`] ??= shared(new THREE.PlaneGeometry(side, side).rotateX(-Math.PI / 2)));
const poolMat = (color: number) =>
  (poolMats[color] ??= shared(
    new THREE.MeshBasicMaterial({
      map: (poolTex ??= paint(3004, poolPaint)),
      color,
      transparent: true,
      opacity: POOL.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  ));
export function lightPool(def: EnemyDef): THREE.Mesh {
  const m = groundPool(def.color, def.r * POOL.size);
  m.position.y = -def.y + POOL_Y;
  return m;
}
// a pool of light of a colour, `side` metres across, lying flat (the caller puts it at the ground): for the enemies,
// and for the things lying on the floor (world/itemLooks.ts)
export const groundPool = (color: number, side: number): THREE.Mesh => new THREE.Mesh(poolGeo(side), poolMat(color));
const POOL_Y = 0.06; // above the ground (and above a hazard floor's two layers)
// an enemy's own body material: armour plate with a little of the type's colour in it (more while it flashes)
export const lookBodyMat = (def: EnemyDef): THREE.MeshLambertMaterial =>
  new THREE.MeshLambertMaterial({ map: textures().plate, emissive: def.color, emissiveIntensity: LOOK_GLOW });
