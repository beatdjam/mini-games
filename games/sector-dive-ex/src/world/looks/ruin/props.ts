import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { SIDE_STEP, tileCenter } from '@engine/world/tiles.ts';
import type { PropRule } from '@engine/world/slots.ts';
import { WALL_H } from '../../../data/level.ts';
import type { FloorPlan } from '../../building.ts';
import { wallPic } from '../common.ts';
import { TEX, grime, paint, poolTex } from '../paint.ts';
import type { Paint } from '../paint.ts';
import { FULL_SIZE, LAMP_POOL, facing, lightMat, onWall, pose, propTools } from '../props.ts';
import type { Light, WallSlot } from '../props.ts';
import { dressWalls } from '../dress.ts';
import type { WallKit } from '../dress.ts';
import { flatBoxTex, flatHeapTex, flatTex, ragsTex } from './cutouts.ts';
import {
  RUIN_WALLS,
  RUIN_WALL_SIDES,
  WALL_BLOCKS,
  WALL_NOTICES,
  WALL_PAPER,
  WALL_PAPER_BLUE,
  WALL_STAINED,
  WALL_WINDOW,
  creeper,
  leaf,
  ragged,
} from './pictures.ts';
// The props of the ruined streets (RUIN): the things fixed to its walls and ceilings, and the light they throw. They
// go by the pictures on the walls (pictures.ts, next to this file), which are painted there. world/looks.ts puts the
// two together.
// ---- tuning numbers used only here ----
const DAY_POOL_OPACITY = 0.34; // the daylight on the ground under a window or a hole (kept faint: shots and pickups must stand out)
const WINDOW_POOL = { out: 1.9, wide: 0.42, deep: 0.56 }; // ... under a window: how far from the wall (m), its size (of LAMP_POOL)
const HOLE_POOL = 0.6; // ... under a hole in the ceiling (of LAMP_POOL)
const QUIET_WALLS = [0, WALL_STAINED, WALL_BLOCKS, WALL_PAPER, WALL_PAPER_BLUE]; // the walls a shelf or a lamp may hang on
const DAYLIGHT = 0xd3e0c8; // the colour of the light the day throws on the ground
// ivy hanging from the top of a wall: strands of leaves on nothing (the rest of the picture is clear)
const vinePaint: Paint = (g, rand) => {
  for (let k = 0; k < 11; k++)
    creeper(g, rand, [14 + rand() * (TEX - 28), 0], 8 + rand() * 20, [(rand() - 0.5) * 3, 9], 9, 1);
};
// a hole in the ceiling from below: the broken boards and laths round it, the grey sky through it
const holePaint: Paint = (g, rand) => {
  const c = TEX / 2;
  g.fillStyle = '#1a1d18';
  g.beginPath();
  ragged(g, rand, c, c, 122, 122);
  g.fill();
  g.fillStyle = '#3d3528';
  g.save();
  g.clip();
  for (let l = 4; l < TEX; l += 22) g.fillRect(0, l, TEX, 7);
  g.restore();
  g.save();
  g.beginPath();
  ragged(g, rand, c, c, 86, 86);
  g.clip();
  const sky = g.createRadialGradient(c, c, 10, c, c, 90);
  sky.addColorStop(0, '#b3c0ab');
  sky.addColorStop(1, '#93a28d');
  g.fillStyle = sky;
  g.fillRect(0, 0, TEX, TEX);
  // a rafter and a couple of laths still cross it
  g.fillStyle = '#2c2a21';
  g.fillRect(0, c - 40 + rand() * 60, TEX, 15);
  g.fillRect(c - 50 + rand() * 80, 0, 6, TEX);
  g.restore();
  for (let k = 0; k < 16; k++) {
    const a = rand() * Math.PI * 2;
    leaf(g, rand, c + Math.cos(a) * (80 + rand() * 16), c + Math.sin(a) * (80 + rand() * 16), 9, 1);
  }
};
// a plank of a shelf: old wood
const plankPaint: Paint = (g, rand) => {
  g.fillStyle = '#6d5e48';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 60, '#8a7a60', '#2c261c');
  g.fillStyle = 'rgba(30,24,16,.4)';
  for (let l = 0; l < 22; l++) g.fillRect(rand() * TEX * 0.6, rand() * TEX, TEX * (0.2 + rand() * 0.5), 2);
};
// ---- the things on the walls and ceilings ----
// (all of them are above head height, EYE in src/data/level.ts, so nothing gets in front of the eye)
const RUIN_PROPS: PropRule[] = [
  { id: 'vine', slots: ['wall'], blocks: false, count: [24, 32], gap: 2 },
  { id: 'shelf', slots: ['wall'], blocks: false, count: [10, 14], gap: 3 },
  { id: 'lamp', slots: ['wall'], blocks: false, count: [9, 13], gap: 3 },
  { id: 'wires', slots: ['floor', 'center', 'corridor'], blocks: false, count: [14, 18], gap: 3 },
  { id: 'hole', slots: ['floor', 'center', 'corridor'], blocks: false, count: [7, 10], gap: 4 },
];
const VINE = { w: 1.7, h: 2.9, out: 0.07 }; // ivy hanging down a wall from the ceiling (m)
const SHELF = { w: 1.5, deep: 0.3, thick: 0.06, y: [2.5, 3.3], tilt: [0.18, 0.5] }; // a shelf, one bracket gone (m, m, m, m, rad)
const LAMP = { w: 1.2, y: [3.5, 4.3], tilt: [0.25, 0.6] }; // a dead strip light, swung round on the one screw left (m, m, rad)
const WIRES = { len: [0.7, 2.1], spread: 0.22, r: 0.018 }; // wires hanging from the ceiling (m)
const HOLE = 2.3; // side of a hole in the ceiling (m)
const WIRE_DARK = 0x23261f;
const LAMP_BODY = 0x6b7164;
const LAMP_TUBE = 0x8f978a; // a dead tube: grey glass, not lit
interface RuinShared {
  vine: THREE.CanvasTexture;
  hole: THREE.CanvasTexture;
  plank: THREE.CanvasTexture;
}
let ruinShared: RuinShared | null = null;
// Ivy hanging down the walls, shelves and dead strip lights that have half come off them, wires hanging from the
// ceiling, holes in it with the sky behind, and the pale daylight that the holes and the broken windows let fall on
// the ground
// what the flats' walls are dressed with (looks/dress.ts): wardrobes, bedding cupboards, kitchen units and bookcases
// let into them, fallen wall and broken furniture along their feet, rags on a line
let ruinKit: WallKit | null = null;
const makeRuinKit = (): WallKit => ({
  pics: RUIN_WALLS,
  sides: RUIN_WALL_SIDES,
  bare: [0, 1, 2],
  units: {
    maps: [0, 1, 2, 3, 4, 5, 6, 7].map(n => flatTex(1200 + n)),
    w: 3.7,
    h: 2.84,
    hall: 0.26,
    lane: 0.12,
    counter: [0, 1, 2, 3].map(n => flatBoxTex(1220 + n)),
  },
  heaps: {
    maps: [0, 1, 2, 3, 4, 5].map(n => flatHeapTex(1240 + n)),
    solid: [0, 1, 2, 3, 4, 5].map(n => flatBoxTex(1260 + n)),
    w: 3.5,
    h: 1.75,
    hall: 0.6,
    lane: 0.75,
  },
  high: [
    {
      maps: [0, 1, 2].map(n => ragsTex(1280 + n)),
      w: 3.4,
      h: 1.4,
      y: [3.4, 4.3],
      out: [0.5, 1.2],
      hall: 0.14,
      lane: 0.2,
    },
  ],
});
export function ruinProps(plan: FloorPlan, group: THREE.Group, rng: Rng) {
  ruinShared ??= {
    vine: paint(1122, vinePaint),
    hole: paint(1123, holePaint),
    plank: paint(1124, plankPaint),
  };
  const shared = ruinShared,
    tools = propTools(plan, group, RUIN_PROPS, rng),
    { d, wallOf, add } = tools;
  // the picture on the wall a wall slot is on
  const pictureOf = (s: WallSlot) => wallPic(d, wallOf(s), RUIN_WALLS, undefined, RUIN_WALL_SIDES);
  // (nothing hangs where the ceiling is open, nor from the boss room's ceiling: it is higher than the others)
  const of = (id: string) =>
    tools
      .of(id)
      .filter(s => s.kind === 'wall' || (!plan.noCeil[s.j * d.W + s.i] && (!plan.hall || s.room !== plan.hall.room)));
  const daylight: THREE.Matrix4[] = [];

  // ivy: a sheet of leaves hanging from the top of the wall, a little in front of it (not over a window or the board)
  const vines = of('vine').filter(s => ![WALL_WINDOW, WALL_NOTICES].includes(pictureOf(s)));
  add(
    new THREE.PlaneGeometry(VINE.w, VINE.h),
    new THREE.MeshBasicMaterial({ map: shared.vine, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    vines.map(s => {
      const flip = rng.next() < 0.5 ? -1 : 1;
      return pose(
        onWall(s, rng.rand(-1.1, 1.1), VINE.out, WALL_H - VINE.h / 2),
        facing(s),
        new THREE.Vector3(flip, 1, 1),
      );
    }),
  );

  // shelves: a plank that has dropped at one end, and the bracket that still holds the other. Only on the quieter walls
  const shelves = of('shelf').filter(s => QUIET_WALLS.includes(pictureOf(s))),
    plank: THREE.Matrix4[] = [],
    bracket: THREE.Matrix4[] = [];
  shelves.forEach(s => {
    const off = rng.rand(-0.9, 0.9),
      y = rng.rand(SHELF.y[0]!, SHELF.y[1]!),
      roll = rng.rand(SHELF.tilt[0]!, SHELF.tilt[1]!) * (rng.next() < 0.5 ? -1 : 1),
      turn = facing(s);
    plank.push(pose(onWall(s, off, SHELF.deep / 2 + 0.02, y), turn, FULL_SIZE, roll));
    bracket.push(pose(onWall(s, off, SHELF.deep / 2 + 0.02, y - 0.14), turn));
  });
  add(
    new THREE.BoxGeometry(SHELF.w, SHELF.thick, SHELF.deep),
    new THREE.MeshBasicMaterial({ map: shared.plank }),
    plank,
  );
  const dark = new THREE.MeshBasicMaterial({ color: WIRE_DARK });
  add(new THREE.BoxGeometry(0.05, 0.28, SHELF.deep), dark, bracket);

  // strip lights: the back plate still on the wall, the fitting swung round on the one screw left, its tube dead
  const lamps = of('lamp').filter(s => QUIET_WALLS.includes(pictureOf(s))),
    plate: THREE.Matrix4[] = [],
    body: THREE.Matrix4[] = [],
    tube: THREE.Matrix4[] = [];
  lamps.forEach(s => {
    const off = rng.rand(-0.8, 0.8),
      y = rng.rand(LAMP.y[0]!, LAMP.y[1]!),
      roll = rng.rand(LAMP.tilt[0]!, LAMP.tilt[1]!) * (rng.next() < 0.5 ? -1 : 1),
      turn = facing(s);
    plate.push(pose(onWall(s, off, 0.03, y), turn));
    body.push(pose(onWall(s, off, 0.1, y), turn, FULL_SIZE, roll));
    tube.push(pose(onWall(s, off, 0.19, y), turn, FULL_SIZE, roll));
  });
  add(new THREE.BoxGeometry(LAMP.w, 0.16, 0.03), dark, plate);
  add(new THREE.BoxGeometry(LAMP.w, 0.13, 0.1), new THREE.MeshBasicMaterial({ color: LAMP_BODY }), body);
  add(
    new THREE.CylinderGeometry(0.035, 0.035, LAMP.w * 0.7, 6).rotateZ(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: LAMP_TUBE }),
    tube,
  );

  // wires: three of them hanging from one place in the ceiling, each its own length; the longest ends in a lamp holder
  const strand: THREE.Matrix4[] = [],
    holder: THREE.Matrix4[] = [];
  of('wires').forEach(s => {
    const x = tileCenter(s.i) + rng.rand(-1, 1),
      z = tileCenter(s.j) + rng.rand(-1, 1);
    for (let n = 0; n < 3; n++) {
      const len = n ? rng.rand(WIRES.len[0]!, WIRES.len[1]! * 0.7) : rng.rand(WIRES.len[1]! * 0.6, WIRES.len[1]!),
        wx = x + rng.rand(-WIRES.spread, WIRES.spread),
        wz = z + rng.rand(-WIRES.spread, WIRES.spread);
      strand.push(pose(new THREE.Vector3(wx, WALL_H - len / 2, wz), 0, new THREE.Vector3(1, len, 1)));
      if (!n) holder.push(pose(new THREE.Vector3(wx, WALL_H - len - 0.06, wz)));
    }
  });
  add(new THREE.CylinderGeometry(WIRES.r, WIRES.r, 1, 5), dark, strand);
  add(new THREE.CylinderGeometry(0.05, 0.06, 0.14, 8), dark, holder);

  // holes in the ceiling: the sky through the broken boards, and its light on the ground below
  const holes = of('hole');
  add(
    new THREE.PlaneGeometry(HOLE, HOLE).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shared.hole, transparent: true, alphaTest: 0.5 }),
    holes.map(s =>
      pose(new THREE.Vector3(tileCenter(s.i), WALL_H - 0.04, tileCenter(s.j)), rng.pick([0, 1, 2, 3]) * (Math.PI / 2)),
    ),
  );
  holes.forEach(s =>
    daylight.push(
      pose(new THREE.Vector3(tileCenter(s.i), 0.05, tileCenter(s.j)), 0, new THREE.Vector3(HOLE_POOL, 1, HOLE_POOL)),
    ),
  );

  // the light of every broken window that faces a flat floor tile, on the ground in front of it
  for (let j = 1; j < d.H - 1; j++)
    for (let i = 1; i < d.W - 1; i++) {
      const k = j * d.W + i;
      if (d.maps.grid[k] !== 1 || d.maps.hgt[k] !== 0 || d.maps.ramp[k] >= 0 || d.maps.cover[k]) continue;
      SIDE_STEP.forEach(([di, dj], side) => {
        const wall = (j + dj) * d.W + i + di;
        if (d.maps.grid[wall] || plan.voids[wall]) return;
        if (wallPic(d, wall, RUIN_WALLS, undefined, RUIN_WALL_SIDES) !== WALL_WINDOW) return;
        const s = { i, j, side };
        daylight.push(
          pose(
            onWall(s, 0, WINDOW_POOL.out, 0.05),
            facing(s),
            new THREE.Vector3(WINDOW_POOL.wide, 1, WINDOW_POOL.deep),
          ),
        );
      });
    }
  add(
    new THREE.PlaneGeometry(LAMP_POOL, LAMP_POOL).rotateX(-Math.PI / 2),
    lightMat(poolTex(), DAY_POOL_OPACITY, DAYLIGHT),
    daylight,
  );
  // what was left in the flats, wall by wall (looks/dress.ts)
  const dressLights: Light[] = [];
  dressWalls({ add }, d, plan, rng, (ruinKit ??= makeRuinKit()), dressLights);
}
