import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { tileCenter } from '@engine/world/tiles.ts';
import type { PropRule } from '@engine/world/slots.ts';
import { WALL_H } from '../../../data/level.ts';
import type { FloorPlan } from '../../building.ts';
import { WALL_PLAIN_SHARE, variantOf } from '../common.ts';
import { TEX, grain, paint, poolTex } from '../paint.ts';
import type { Paint } from '../paint.ts';
import { facing, lightMat, onWall, pose, propTools } from '../props.ts';
import type { Light } from '../props.ts';
import { dressWalls } from '../dress.ts';
import type { WallKit } from '../dress.ts';
import { chainsTex, pipeRackTex, plantBoxTex, plantHeapTex, plantTex } from './cutouts.ts';
import { FORGE_WALL_PICS } from './pictures.ts';
// The props of the smelter block (FORGE): the things fixed to its walls and ceilings, and the light they throw. They
// go by the pictures on the walls (pictures.ts, next to this file), which are painted there. world/looks.ts puts the
// two together.
// ---- tuning numbers used only here ----
const WALL_SHEET = 6;
const POOL_OPACITY = 0.5; // the light a lamp throws on the ground (paler than the molten floor, which must stand out)
const WALL_GLOW = { size: 3.4, opacity: 0.5 }; // the light a wall lamp throws on its wall (m)
const BARE_WALLS = [0, 1, WALL_SHEET]; // the walls with nothing on them
// The skin of a pipe: across the picture is round the pipe (bright where it faces the room and the lamps, dark at
// the wall), down the picture is along it (rust and soot in rings)
const pipePaint: Paint = (g, rand) => {
  for (let x = 0; x < TEX; x++) {
    const lit = 0.5 + 0.5 * Math.cos((x / TEX - 0.13) * Math.PI * 2),
      v = 0.3 + 0.7 * lit;
    g.fillStyle = `rgb(${Math.round(116 * v)},${Math.round(100 * v)},${Math.round(87 * v)})`;
    g.fillRect(x, 0, 1, TEX);
  }
  for (let k = 0; k < 26; k++) {
    g.globalAlpha = 0.1 + rand() * 0.2;
    g.fillStyle = rand() < 0.55 ? '#7d3d1c' : '#120e0c';
    g.fillRect(0, rand() * TEX, TEX, 2 + rand() * 12);
  }
  g.globalAlpha = 1;
  grain(g, rand, 16);
};
// ---- the things on the walls and ceilings ----
// (the valve wheels and the lamps hang above head height, EYE in src/data/level.ts, so nothing gets in front of the eye)
const FORGE_PROPS: PropRule[] = [
  { id: 'main', slots: ['wall'], blocks: false, count: [14, 20], gap: 2 },
  { id: 'riser', slots: ['wall'], blocks: false, count: [20, 28], gap: 2 },
  { id: 'wallLamp', slots: ['wall'], blocks: false, count: [10, 14], gap: 3 },
  { id: 'lamp', slots: ['floor', 'center', 'corridor'], blocks: false, count: [12, 16], gap: 3 },
];
const MAIN = { r: 0.3, len: 3, y: 4.7, out: 0.4 }; // a thick pipe along a wall, high up (m)
const RISER = { r: 0.2, out: 0.24, thin: 0.08, valveY: 2.5, wheel: 0.24 }; // a pipe up a wall, with its valve (m)
const WALL_LAMP_Y = 3.4; // m
const SHADE = { drop: 0.75, r: 0.55, h: 0.36 }; // a ceiling lamp's shade: how far it hangs, its radius and height (m)
const LAMP_COLORS = [0xffc98a, 0xffc98a, 0xffe9c4]; // sodium lamps, and a white-hot bulb now and then
const WALL_LAMP_COLOR = 0xffb46e;
const VALVE_RED = 0xa8351f;
const PIPE_DARK = 0x3a332e; // flanges, brackets, lamp housings
interface ForgeShared {
  pipe: THREE.CanvasTexture;
}
let forgeShared: ForgeShared | null = null;
// Thick pipes along the walls and up them (flanged, the risers with a valve wheel), caged lamps on the walls with
// their glow on the wall, shaded lamps hanging from the roof with a pool of light under each
// what the walls of the plant are dressed with (looks/dress.ts): control panels, tool boards, manifolds and lockers
// let into them, drums and cylinders and ingots along their feet, chains from the roof steel, pipes run under the
// ceiling, and over the alleys a rack of pipes
let forgeKit: WallKit | null = null;
const makeForgeKit = (): WallKit => ({
  pics: FORGE_WALL_PICS.length,
  bare: BARE_WALLS,
  units: {
    maps: [0, 1, 2, 3, 4, 5, 6, 7].map(n => plantTex(700 + n)),
    w: 3.7,
    h: 2.84,
    hall: 0.28,
    lane: 0.2,
    counter: [0, 1, 2, 3].map(n => plantBoxTex(720 + n)),
    light: 0xff8a3d,
  },
  heaps: {
    maps: [0, 1, 2, 3, 4, 5].map(n => plantHeapTex(740 + n)),
    solid: [0, 1, 2, 3, 4, 5].map(n => plantBoxTex(760 + n)),
    w: 3.5,
    h: 1.75,
    hall: 0.55,
    lane: 0.7,
  },
  high: [
    {
      maps: [0, 1, 2].map(n => chainsTex(780 + n)),
      w: 1.6,
      h: 2.6,
      y: [4.3, 4.7],
      out: [0.6, 1.6],
      hall: 0.2,
      lane: 0.1,
    },
  ],
  runs: {
    colors: [0x5a4636, 0x3d3229, 0x6a5038, 0x2e2824],
    r: 0.06,
    n: [2, 4],
    hall: 0.5,
    lane: 0.85,
    y: [5, 5.6],
    laneY: [3.4, 4.2],
  },
  roof: { maps: [0, 1, 2].map(n => pipeRackTex(790 + n)), y: 4.5, tint: 0xffffff, beam: 0x2a221c, share: 0.8 },
  bulbs: { share: 0.25, color: 0xffb070, y: [3, 3.5] },
});
export function forgeProps(plan: FloorPlan, group: THREE.Group, rng: Rng) {
  forgeShared ??= { pipe: paint(22, pipePaint) };
  const shared = forgeShared,
    { d, wallOf, of, add, pools } = propTools(plan, group, FORGE_PROPS, rng);
  const skin = new THREE.MeshBasicMaterial({ map: shared.pipe }),
    dark = new THREE.MeshBasicMaterial({ color: PIPE_DARK }),
    lights: Light[] = [];

  // mains: a thick pipe along the wall under the roof, turning into the wall at both ends
  const mains = of('main'),
    run: THREE.Matrix4[] = [],
    bend: THREE.Matrix4[] = [],
    stub: THREE.Matrix4[] = [],
    collar: THREE.Matrix4[] = [];
  mains.forEach(s => {
    const turn = facing(s),
      y = MAIN.y + rng.rand(-0.25, 0.25);
    run.push(pose(onWall(s, 0, MAIN.out, y), turn));
    for (const end of [-1, 1]) {
      bend.push(pose(onWall(s, (end * MAIN.len) / 2, MAIN.out, y), turn));
      stub.push(pose(onWall(s, (end * MAIN.len) / 2, MAIN.out / 2, y), turn));
      collar.push(pose(onWall(s, end * MAIN.len * 0.22, MAIN.out, y), turn));
    }
  });
  const along = (r: number, len: number) => new THREE.CylinderGeometry(r, r, len, 12).rotateZ(Math.PI / 2);
  add(along(MAIN.r, MAIN.len), skin, run);
  add(new THREE.SphereGeometry(MAIN.r, 10, 8), dark, bend);
  add(new THREE.CylinderGeometry(MAIN.r, MAIN.r, MAIN.out, 12).rotateX(Math.PI / 2), skin, stub);
  add(along(MAIN.r + 0.07, 0.12), dark, collar);

  // risers: a pipe up the wall with flanges and a red valve wheel, a thin pipe beside it. Only on the plainer walls
  // (the hatches, plates and boards stay clear)
  const risers = of('riser').filter(s =>
      BARE_WALLS.includes(variantOf(wallOf(s), FORGE_WALL_PICS.length, WALL_PLAIN_SHARE)),
    ),
    pipe: THREE.Matrix4[] = [],
    thin: THREE.Matrix4[] = [],
    flange: THREE.Matrix4[] = [],
    body: THREE.Matrix4[] = [],
    stem: THREE.Matrix4[] = [],
    wheel: THREE.Matrix4[] = [];
  risers.forEach(s => {
    const off = rng.rand(-1.3, 1.3),
      turn = facing(s),
      valveOut = RISER.out + RISER.r + 0.2;
    pipe.push(pose(onWall(s, off, RISER.out, WALL_H / 2), turn));
    thin.push(pose(onWall(s, off + 0.38, RISER.thin + 0.03, WALL_H / 2), turn));
    for (const y of [0.9, 4.1, 5.5]) flange.push(pose(onWall(s, off, RISER.out, y), turn));
    body.push(pose(onWall(s, off, RISER.out, RISER.valveY), turn));
    stem.push(pose(onWall(s, off, (RISER.out + valveOut) / 2, RISER.valveY), turn));
    wheel.push(pose(onWall(s, off, valveOut, RISER.valveY), turn));
  });
  add(new THREE.CylinderGeometry(RISER.r, RISER.r, WALL_H, 12), skin, pipe);
  add(new THREE.CylinderGeometry(RISER.thin, RISER.thin, WALL_H, 8), skin, thin);
  add(new THREE.CylinderGeometry(RISER.r + 0.08, RISER.r + 0.08, 0.12, 12), dark, flange);
  add(new THREE.CylinderGeometry(RISER.r + 0.06, RISER.r + 0.06, 0.5, 12), dark, body);
  add(new THREE.CylinderGeometry(0.04, 0.04, RISER.r + 0.2, 6).rotateX(Math.PI / 2), dark, stem);
  const red = new THREE.MeshBasicMaterial({ color: VALVE_RED });
  add(new THREE.TorusGeometry(RISER.wheel, 0.035, 6, 18), red, wheel);
  add(new THREE.BoxGeometry(RISER.wheel * 2, 0.05, 0.03), red, wheel);
  add(new THREE.BoxGeometry(0.05, RISER.wheel * 2, 0.03), red, wheel);

  // wall lamps: a caged lamp, and its glow on the wall round it
  const wallLamps = of('wallLamp'),
    box: THREE.Matrix4[] = [],
    lens: THREE.Matrix4[] = [],
    glow: THREE.Matrix4[] = [];
  wallLamps.forEach(s => {
    const off = rng.rand(-1, 1),
      turn = facing(s),
      p = onWall(s, off, 0.12, WALL_LAMP_Y);
    box.push(pose(onWall(s, off, 0.05, WALL_LAMP_Y), turn));
    lens.push(pose(p, turn));
    glow.push(pose(onWall(s, off, 0.03, WALL_LAMP_Y), turn));
    lights.push({ x: p.x, z: p.z, color: WALL_LAMP_COLOR, size: 0.7 });
  });
  add(new THREE.BoxGeometry(0.62, 0.4, 0.1), dark, box);
  add(new THREE.BoxGeometry(0.46, 0.24, 0.16), new THREE.MeshBasicMaterial({ color: WALL_LAMP_COLOR }), lens);
  add(
    new THREE.PlaneGeometry(WALL_GLOW.size, WALL_GLOW.size),
    lightMat(poolTex(), WALL_GLOW.opacity, WALL_LAMP_COLOR),
    glow,
  );

  // roof lamps (not where the ceiling is open): a shade on a rod, the lit bulb seen from below
  // (none in the boss room: its ceiling is twice as high, and a fitting at the usual height would hang in the air)
  const bossRoom = plan.hall?.room ?? -1;
  const lamps = of('lamp').filter(s => !plan.noCeil[s.j * d.W + s.i] && s.room !== bossRoom),
    rod: THREE.Matrix4[] = [],
    shade: THREE.Matrix4[] = [],
    bulb: THREE.Matrix4[] = [],
    bulbColors: number[] = [];
  lamps.forEach(s => {
    const x = tileCenter(s.i),
      z = tileCenter(s.j),
      c = rng.pick(LAMP_COLORS);
    rod.push(pose(new THREE.Vector3(x, WALL_H - SHADE.drop / 2, z)));
    shade.push(pose(new THREE.Vector3(x, WALL_H - SHADE.drop - SHADE.h / 2, z)));
    bulb.push(pose(new THREE.Vector3(x, WALL_H - SHADE.drop - SHADE.h + 0.04, z)));
    bulbColors.push(c);
    lights.push({ x, z, color: c, size: 1 });
  });
  add(new THREE.CylinderGeometry(0.03, 0.03, SHADE.drop, 6), dark, rod);
  add(
    new THREE.CylinderGeometry(0.12, SHADE.r, SHADE.h, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: PIPE_DARK, side: THREE.DoubleSide }),
    shade,
  );
  add(
    new THREE.CircleGeometry(SHADE.r * 0.82, 14).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    bulb,
    bulbColors,
  );

  // the light the lamps throw on the ground: a soft pool of their colour
  // the working floor's clutter, wall by wall (looks/dress.ts)
  dressWalls({ add }, d, plan, rng, (forgeKit ??= makeForgeKit()), lights);
  pools(lights, POOL_OPACITY);
}
