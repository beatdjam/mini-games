import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { SIDE_STEP, tileCenter } from '@engine/world/tiles.ts';
import type { PropRule } from '@engine/world/slots.ts';
import { WALL_H } from '../../../data/level.ts';
import type { FloorPlan } from '../../building.ts';
import { roomKindOf, wallFloor, wallLinks, wallPic } from '../common.ts';
import { SIGN_FONT, canvasTex, poolTex } from '../paint.ts';
import { facing, floorNear, lightMat, onWall, overHead, pose, propTools } from '../props.ts';
import type { Light, WallSlot } from '../props.ts';
import { dressWalls } from '../dress.ts';
import type { WallKit } from '../dress.ts';
import { liftPlate } from '../mall/lift.ts';
import { shopFronts } from '../mall/fronts.ts';
import { tactileLine } from '../mall/tactile.ts';
import { HOSP_DEPARTMENTS, HOSP_DIRECTIONS, HOSP_LIFT } from '../../../i18n/signs.ts';
import {
  HOSP_BARE_WALLS,
  HOSP_EDGE_WALLS,
  HOSP_LANE_WALLS,
  HOSP_LIFT_WALLS,
  HOSP_ROOM_WALLS,
  HOSP_WALL_PICS,
  HOSP_WALL_SIDES,
  HOSP_WINDOW_PICS,
} from './pictures.ts';
import { boardTex } from './fronts.ts';
import { KIND_BAND, KIND_WAITING, PLATE_WHITE, SIGN_GREEN, STEEL_DARK } from './shared.ts';
import {
  hospBoxTex,
  hospCurtainTex,
  hospEdgeTex,
  hospHeapTex,
  hospTileTex,
  hospTvTex,
  hospUnitTex,
} from './cutouts.ts';
import { hospKindHeaps } from './kindHeaps.ts';
import { surgeryProps } from './surgeryProps.ts';
// The props of the closed hospital (HOSP): the things fixed to its walls and ceilings, and the light they throw. They go by
// the pictures on the walls (pictures.ts, next to this file), which are painted there. world/looks.ts puts the two together.
// The light is the point of them: a few bulbs and tubes still lit, warm and pale green by turns, the orange of the
// emergency lamps, the green of the exit signs, and the evening sun's patches in front of the windows, all soft.
// ---- tuning numbers used only here ----
const POOL_OPACITY = 0.22; // the light of a lamp or a window on the floor (faint: nothing may be lost in it)
const GLOW_OPACITY = 0.26; // ... an emergency lamp on its wall
const SUN = { color: 0xffb46a, size: 1.5, out: 1.6 }; // the evening sun in front of a window: its colour, its pool's size, how far out it lies (m)
const PLAIN_WALLS = [0, 7, 8]; // the walls that take a sign or a lamp (clear of the windows and notices): the plain ones and the damaged
const HOSP_PROPS: PropRule[] = [
  { id: 'direction', slots: ['corridor', 'center'], blocks: false, count: [4, 6], gap: 6 },
  { id: 'camera', slots: ['floor', 'center', 'corridor'], blocks: false, count: [6, 9], gap: 5 },
  { id: 'lamp', slots: ['floor', 'center', 'corridor'], blocks: false, count: [14, 20], gap: 4 },
  { id: 'exitSign', slots: ['wall'], blocks: false, count: [8, 11], gap: 4 },
  { id: 'emergency', slots: ['wall'], blocks: false, count: [8, 12], gap: 4 },
  { id: 'clock', slots: ['wall'], blocks: false, count: [5, 8], gap: 5 },
];
const DIRECTION = { w: 1.7, h: 0.55, thick: 0.08, bottom: 4.3, rod: 0.025 }; // a direction sign hung from the ceiling (m)
const CAMERA = { r: 0.17, baseR: 0.2, baseH: 0.04 }; // a dome camera under the ceiling (m)
// a ceiling lamp: a flat box, lit warm (a bulb behind a diffuser), lit pale green-white (a tube) or hanging by one end
const LAMP = { w: 1.2, h: 0.08, d: 0.36, warm: 0xffd49a, pale: 0xe2f0da, off: 0x59635d, size: 0.9, tilt: 0.35 };
const LAMP_WARM_SHARE = 0.4; // of the lamps, these are lit warm
const LAMP_PALE_SHARE = 0.25; // ... lit pale
const EXIT_SIGN = { w: 0.7, h: 0.3, thick: 0.1, y: 4.3, glow: 2, size: 0.55, color: 0x8fe0b0 }; // a green exit sign on a wall (m)
const EMERGENCY = { w: 0.34, h: 0.2, thick: 0.1, y: 3.9, color: 0xff9a4a, glow: 2.2, size: 0.8 }; // an orange emergency lamp on a wall (m)
const CLOCK = { r: 0.28, thick: 0.05, y: 3.6, out: 0.03 }; // a wall clock, stopped (m)
const DEPARTMENT_BOARD = { w: 3.0, h: 0.5, y: 4.25, out: 0.04 }; // a department's board over its way in (m)
const HALL_SIGN = { w: 4.4, h: 1.2, thick: 0.1, bottom: 4.0 }; // the waiting hall's hanging board (m)
const FITTING = 0x8b9490; // trims and mounts
const WALL_BOARD = '#e4e2d1';
const SIGN_W = 340,
  SIGN_H = 110; // px of a direction sign's picture
const GUIDE_LINE = { w: 0.3, thick: 0.02, y: 0.03, color: 0x4d907c }; // the coloured guide line along the corridors

interface HospShared {
  directions: THREE.CanvasTexture[];
  exit: THREE.CanvasTexture;
  clock: THREE.CanvasTexture;
}
let hospShared: HospShared | null = null;
// a direction sign: a white board with a band of a department's colour along its left side and where it points
function directionTex(text: string, n: number): THREE.CanvasTexture {
  return canvasTex(SIGN_W, SIGN_H, g => {
    g.fillStyle = WALL_BOARD;
    g.fillRect(0, 0, SIGN_W, SIGN_H);
    g.fillStyle = KIND_BAND[n % KIND_BAND.length]!;
    g.fillRect(0, 0, 36, SIGN_H);
    g.strokeStyle = STEEL_DARK;
    g.lineWidth = 5;
    g.strokeRect(2.5, 2.5, SIGN_W - 5, SIGN_H - 5);
    g.fillStyle = '#26332e';
    g.font = `700 44px ${SIGN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 36 + (SIGN_W - 36) / 2, SIGN_H / 2 + 2, SIGN_W - 80);
    g.fillStyle = 'rgba(40,36,20,.2)';
    g.fillRect(0, 0, SIGN_W, SIGN_H);
  });
}
// the exit sign's face: the green ground, the white running figure and the arrow
function exitTex(): THREE.CanvasTexture {
  return canvasTex(140, 60, g => {
    g.fillStyle = SIGN_GREEN;
    g.fillRect(0, 0, 140, 60);
    g.strokeStyle = '#e4eadd';
    g.fillStyle = '#e4eadd';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(46, 14, 6, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(46, 22);
    g.lineTo(40, 36);
    g.lineTo(50, 44);
    g.lineTo(48, 54);
    g.moveTo(40, 36);
    g.lineTo(30, 42);
    g.lineTo(24, 52);
    g.moveTo(44, 28);
    g.lineTo(58, 32);
    g.moveTo(44, 28);
    g.lineTo(30, 28);
    g.stroke();
    g.beginPath();
    g.moveTo(84, 30);
    g.lineTo(122, 30);
    g.moveTo(108, 18);
    g.lineTo(122, 30);
    g.lineTo(108, 42);
    g.stroke();
  });
}
// a wall clock's face: white, twelve ticks, two hands that stopped
function clockTex(): THREE.CanvasTexture {
  return canvasTex(64, 64, g => {
    g.fillStyle = STEEL_DARK;
    g.beginPath();
    g.arc(32, 32, 31, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = PLATE_WHITE;
    g.beginPath();
    g.arc(32, 32, 27, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#26302d';
    g.lineWidth = 2;
    for (let n = 0; n < 12; n++) {
      const a = (n * Math.PI) / 6;
      g.beginPath();
      g.moveTo(32 + Math.sin(a) * 22, 32 - Math.cos(a) * 22);
      g.lineTo(32 + Math.sin(a) * 26, 32 - Math.cos(a) * 26);
      g.stroke();
    }
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(32, 32);
    g.lineTo(32 + 14, 32 - 8);
    g.moveTo(32, 32);
    g.lineTo(32 - 4, 32 - 20);
    g.stroke();
  });
}

// what the closed hospital was left full of (looks/dress.ts): vending machines, lockers, public telephones, medicine cabinets
// and payment machines let into the corridors' walls (hardly any in the rooms: their walls are the rooms' own), a vending
// machine, lockers or an AED cabinet at an end of a room's front, stretchers, wheelchairs, boxes of charts, fallen drip stands,
// bags of linen and a tipped bed along the foot of the walls (in a room, the room's own things instead), ceiling panels, a
// privacy curtain and a television that have come down, the medical gas pipes and cables under the ceiling
let hospKit: WallKit | null = null;
const makeHospKit = (): WallKit => ({
  pics: HOSP_WALL_PICS.length,
  laneWalls: HOSP_LANE_WALLS,
  sides: HOSP_WALL_SIDES,
  rooms: HOSP_ROOM_WALLS,
  liftWalls: HOSP_LIFT_WALLS,
  bare: HOSP_BARE_WALLS,
  units: { maps: [0, 1, 2, 3, 4, 5, 6].map(hospUnitTex), w: 3.7, h: 2.84, hall: 0.03, lane: 0.3 },
  edges: {
    on: HOSP_EDGE_WALLS,
    maps: [0, 1, 2, 3, 4, 5].map(hospEdgeTex),
    w: 1.2,
    h: 2,
    deep: 0.5,
    side: 0x4f5a54,
    hall: 0,
    lane: 0.7,
  },
  heaps: {
    maps: [0, 1, 2, 3, 4, 5].map(hospHeapTex),
    solid: [0, 1, 2, 3].map(hospBoxTex),
    shops: hospKindHeaps(),
    w: 3.5,
    h: 1.75,
    hall: 0.45,
    lane: 0.75,
  },
  high: [
    {
      maps: [0, 1].map(n => hospTileTex(1700 + n)),
      w: 2.4,
      h: 1.8,
      y: [4.7, 5.1],
      out: [0.9, 1.7],
      hall: 0.05,
      lane: 0.08,
    },
    { maps: [0, 1, 2].map(hospCurtainTex), w: 1.8, h: 1.6, y: [4.2, 4.6], out: [0.7, 1.4], hall: 0.08, lane: 0.04 },
    { maps: [hospTvTex()], w: 1.4, h: 1.2, y: [3.4, 3.8], out: [0.6, 1.0], hall: 0.04, lane: 0.04 },
  ],
  runs: [
    {
      // the medical gas pipes: a green one, a white one, a copper one, thick, under the ceiling
      colors: [0x5b8c6c, 0xc9c6aa, 0x8c6b48],
      r: 0.045,
      n: [1, 3],
      hall: 0.1,
      lane: 0.22,
      y: [5.2, 5.6],
      laneY: [4.9, 5.4],
    },
    { colors: [0x4a554f, 0x59635d], r: 0.022, n: [1, 3], hall: 0.08, lane: 0.14, y: [4.9, 5.4], laneY: [4.7, 5.1] },
  ],
});

// Direction signs hung over the corridors, dome cameras under the ceiling, lamps (some lit, one or two hanging by an end),
// exit signs and emergency lamps on the walls, each glowing a little on the wall round it, the department boards over the
// rooms' doors, the waiting hall's hanging board, a guide line along the corridors, the sun in front of the windows
export function hospProps(plan: FloorPlan, group: THREE.Group, rng: Rng) {
  hospShared ??= { directions: HOSP_DIRECTIONS.map(directionTex), exit: exitTex(), clock: clockTex() };
  const shared = hospShared,
    tools = propTools(plan, group, HOSP_PROPS, rng),
    { d, wallOf, add, inHallRoom, hallRoom } = tools,
    pictureOf = (wall: number) =>
      wallPic(d, wall, {
        count: HOSP_WALL_PICS.length,
        laneWalls: HOSP_LANE_WALLS,
        sides: HOSP_WALL_SIDES,
        rooms: HOSP_ROOM_WALLS,
        liftWalls: HOSP_LIFT_WALLS,
      });
  // (no ceiling where it is open to the sky; none in the boss room: its ceiling is twice as high, and a fitting at the usual
  // height would hang in the air)
  const overhead = (id: string) => tools.of(id).filter(s => !plan.noCeil[s.j * d.W + s.i] && !inHallRoom(s)),
    lights: Light[] = [],
    fitting = new THREE.MeshBasicMaterial({ color: FITTING });

  // direction signs: a board on two rods, one of the sorts at random, across or along the way. Over a deck they are moved up
  // out of the eye (overHead). Only over the corridors (not in a ward: a sign to the pharmacy there reads wrong)
  const signs: THREE.Matrix4[][] = shared.directions.map(() => []),
    rods: THREE.Matrix4[] = [];
  overhead('direction')
    .filter(s => s.room < 0)
    .forEach(s => {
      const x = tileCenter(s.i),
        z = tileCenter(s.j),
        bottom = overHead(DIRECTION.bottom, floorNear(d, s.i, s.j)),
        turn = rng.next() < 0.5 ? 0 : Math.PI / 2,
        rodLen = WALL_H - bottom - DIRECTION.h;
      signs[rng.randi(0, signs.length - 1)]!.push(pose(new THREE.Vector3(x, bottom + DIRECTION.h / 2, z), turn));
      if (rodLen <= 0) return;
      for (const dx of [-DIRECTION.w * 0.35, DIRECTION.w * 0.35])
        rods.push(
          pose(
            new THREE.Vector3(x + Math.cos(turn) * dx, bottom + DIRECTION.h + rodLen / 2, z - Math.sin(turn) * dx),
            0,
            new THREE.Vector3(1, rodLen, 1),
          ),
        );
    });
  const board = new THREE.BoxGeometry(DIRECTION.w, DIRECTION.h, DIRECTION.thick);
  signs.forEach((where, n) => {
    const face = new THREE.MeshBasicMaterial({ map: shared.directions[n]! });
    add(board, [fitting, fitting, fitting, fitting, face, face], where);
  });
  add(new THREE.BoxGeometry(DIRECTION.rod, 1, DIRECTION.rod), fitting, rods);

  // dome cameras: a pale mount and a smoked dome under it
  const mounts: THREE.Matrix4[] = [],
    domes: THREE.Matrix4[] = [];
  overhead('camera').forEach(s => {
    const x = tileCenter(s.i) + rng.rand(-1, 1),
      z = tileCenter(s.j) + rng.rand(-1, 1);
    mounts.push(pose(new THREE.Vector3(x, WALL_H - CAMERA.baseH / 2, z)));
    domes.push(pose(new THREE.Vector3(x, WALL_H - CAMERA.baseH, z)));
  });
  add(new THREE.CylinderGeometry(CAMERA.baseR, CAMERA.baseR, CAMERA.baseH, 12), fitting, mounts);
  add(
    new THREE.SphereGeometry(CAMERA.r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x3a403e }),
    domes,
  );

  // lamps: a flat box under the ceiling. Some are lit (warm, or pale green-white) and throw a faint pool of light on the
  // floor; the rest are out, and one in a few hangs by an end
  const lit = { warm: [] as THREE.Matrix4[], pale: [] as THREE.Matrix4[], off: [] as THREE.Matrix4[] };
  overhead('lamp').forEach(s => {
    const x = tileCenter(s.i) + rng.rand(-1, 1),
      z = tileCenter(s.j) + rng.rand(-1, 1),
      turn = rng.next() < 0.5 ? 0 : Math.PI / 2,
      dice = rng.next();
    if (dice < LAMP_WARM_SHARE) {
      lit.warm.push(pose(new THREE.Vector3(x, WALL_H - LAMP.h / 2, z), turn));
      lights.push({ x, z, color: LAMP.warm, size: LAMP.size });
    } else if (dice < LAMP_WARM_SHARE + LAMP_PALE_SHARE) {
      lit.pale.push(pose(new THREE.Vector3(x, WALL_H - LAMP.h / 2, z), turn));
      lights.push({ x, z, color: LAMP.pale, size: LAMP.size * 0.8 });
    } else if (rng.next() < 0.3)
      lit.off.push(
        pose(new THREE.Vector3(x, WALL_H - LAMP.h / 2 - 0.12, z), turn, new THREE.Vector3(1, 1, 1), LAMP.tilt),
      );
    else lit.off.push(pose(new THREE.Vector3(x, WALL_H - LAMP.h / 2, z), turn));
  });
  for (const key of ['warm', 'pale', 'off'] as const)
    add(new THREE.BoxGeometry(LAMP.w, LAMP.h, LAMP.d), new THREE.MeshBasicMaterial({ color: LAMP[key] }), lit[key]);

  // exit signs: a green lit box on a plain wall above the eye, its glow on the wall round it and a faint green pool before it
  const signBox: THREE.Matrix4[] = [],
    signFace: THREE.Matrix4[] = [],
    signGlow: THREE.Matrix4[] = [];
  tools
    .of('exitSign')
    .filter(s => PLAIN_WALLS.includes(pictureOf(wallOf(s))))
    .forEach(s => {
      const off = rng.rand(-1.2, 1.2),
        turn = facing(s),
        floor = onWall(s, off, 1.2, 0);
      signBox.push(pose(onWall(s, off, EXIT_SIGN.thick / 2, EXIT_SIGN.y), turn));
      signFace.push(pose(onWall(s, off, EXIT_SIGN.thick + 0.006, EXIT_SIGN.y), turn));
      signGlow.push(pose(onWall(s, off, 0.03, EXIT_SIGN.y), turn));
      lights.push({ x: floor.x, z: floor.z, color: EXIT_SIGN.color, size: EXIT_SIGN.size });
    });
  add(new THREE.BoxGeometry(EXIT_SIGN.w, EXIT_SIGN.h, EXIT_SIGN.thick), fitting, signBox);
  add(
    new THREE.PlaneGeometry(EXIT_SIGN.w - 0.06, EXIT_SIGN.h - 0.05),
    new THREE.MeshBasicMaterial({ map: shared.exit }),
    signFace,
  );
  add(
    new THREE.PlaneGeometry(EXIT_SIGN.glow, EXIT_SIGN.glow * 0.7),
    lightMat(poolTex(), GLOW_OPACITY, EXIT_SIGN.color),
    signGlow,
  );

  // emergency lamps: an orange lens in a dark housing, high on a plain wall, a strong orange glow round it and on the floor
  const lampBox: THREE.Matrix4[] = [],
    lampLens: THREE.Matrix4[] = [],
    lampGlow: THREE.Matrix4[] = [];
  tools
    .of('emergency')
    .filter(s => PLAIN_WALLS.includes(pictureOf(wallOf(s))))
    .forEach(s => {
      const off = rng.rand(-1.2, 1.2),
        turn = facing(s),
        floor = onWall(s, off, 1.4, 0);
      lampBox.push(pose(onWall(s, off, EMERGENCY.thick / 2, EMERGENCY.y), turn));
      lampLens.push(pose(onWall(s, off, EMERGENCY.thick + 0.006, EMERGENCY.y), turn));
      lampGlow.push(pose(onWall(s, off, 0.03, EMERGENCY.y), turn));
      lights.push({ x: floor.x, z: floor.z, color: EMERGENCY.color, size: EMERGENCY.size });
    });
  add(new THREE.BoxGeometry(EMERGENCY.w, EMERGENCY.h, EMERGENCY.thick), fitting, lampBox);
  add(
    new THREE.PlaneGeometry(EMERGENCY.w - 0.08, EMERGENCY.h - 0.06),
    new THREE.MeshBasicMaterial({ color: EMERGENCY.color }),
    lampLens,
  );
  add(
    new THREE.PlaneGeometry(EMERGENCY.glow, EMERGENCY.glow * 0.7),
    lightMat(poolTex(), GLOW_OPACITY * 1.4, EMERGENCY.color),
    lampGlow,
  );

  // wall clocks, stopped, on the plain walls
  const clocks: THREE.Matrix4[] = [];
  tools
    .of('clock')
    .filter(s => PLAIN_WALLS.includes(pictureOf(wallOf(s))))
    .forEach(s => clocks.push(pose(onWall(s, rng.rand(-1, 1), CLOCK.out, CLOCK.y), facing(s))));
  add(
    new THREE.CircleGeometry(CLOCK.r, 20),
    new THREE.MeshBasicMaterial({ map: shared.clock, side: THREE.DoubleSide }),
    clocks,
  );

  // the department board of each room over its way in, at the middle of its longest stretch along the corridor
  const boardsOf = new Map<THREE.CanvasTexture, THREE.Matrix4[]>();
  for (const f of shopFronts(plan, HOSP_DEPARTMENTS)) {
    const s = { i: f.i, j: f.j, side: f.side },
      tex = boardTex(f.kind, f.name);
    (boardsOf.get(tex) ?? boardsOf.set(tex, []).get(tex)!).push(
      pose(onWall(s, 0, DEPARTMENT_BOARD.out, DEPARTMENT_BOARD.y), facing(s)),
    );
  }
  for (const [tex, where] of boardsOf)
    add(
      new THREE.PlaneGeometry(DEPARTMENT_BOARD.w, DEPARTMENT_BOARD.h),
      new THREE.MeshBasicMaterial({ map: tex }),
      where,
    );

  // the waiting hall's big board, hung from the ceiling over the middle of its room
  const hall: THREE.Matrix4[] = [],
    hallRods: THREE.Matrix4[] = [];
  d.rooms.forEach((r, n) => {
    if (roomKindOf(d.maps.grid, n) !== KIND_WAITING || n === hallRoom) return;
    const i = Math.floor(r.x + r.w / 2),
      j = Math.floor(r.y + r.h / 2);
    if (plan.noCeil[j * d.W + i]) return;
    const bottom = overHead(HALL_SIGN.bottom, floorNear(d, i, j)),
      rodLen = WALL_H - bottom - HALL_SIGN.h;
    hall.push(pose(new THREE.Vector3(tileCenter(i), bottom + HALL_SIGN.h / 2, tileCenter(j))));
    if (rodLen > 0)
      for (const dx of [-HALL_SIGN.w * 0.4, HALL_SIGN.w * 0.4])
        hallRods.push(
          pose(
            new THREE.Vector3(tileCenter(i) + dx, bottom + HALL_SIGN.h + rodLen / 2, tileCenter(j)),
            0,
            new THREE.Vector3(1, rodLen, 1),
          ),
        );
  });
  const hallFace = new THREE.MeshBasicMaterial({ map: boardTex(KIND_WAITING, HOSP_DEPARTMENTS[KIND_WAITING]![0]!) });
  add(
    new THREE.BoxGeometry(HALL_SIGN.w, HALL_SIGN.h, HALL_SIGN.thick),
    [fitting, fitting, fitting, fitting, hallFace, hallFace],
    hall,
  );
  add(new THREE.BoxGeometry(DIRECTION.rod, 1, DIRECTION.rod), fitting, hallRods);

  liftPlate(
    plan,
    tools.add,
    wallLinks.get(d.maps.grid)?.lifts ?? new Set(),
    wallFloor.get(d.maps.grid) ?? 0,
    HOSP_LIFT,
  );

  tactileLine(plan, tools.add, GUIDE_LINE);

  // the evening sun: in front of every wall with a window painted on it, a warm patch on the floor
  for (let j = 1; j < d.H - 1; j++)
    for (let i = 1; i < d.W - 1; i++) {
      const k = j * d.W + i;
      if (d.maps.grid[k] !== 1 || plan.noFloor[k] || plan.shaft[k] || d.maps.cover[k]) continue;
      SIDE_STEP.forEach(([di, dj], side) => {
        const wall = (j + dj) * d.W + i + di;
        if (d.maps.grid[wall] || plan.voids[wall] || !HOSP_WINDOW_PICS.includes(pictureOf(wall))) return;
        const at = onWall({ i, j, side }, 0, SUN.out, 0);
        lights.push({ x: at.x, z: at.z, color: SUN.color, size: SUN.size });
      });
    }

  // what was left along the walls: not on a face that has a department board or an emergency lamp (above the eye), not under
  // the open sky; no units and no heaps in a lift's car, or where a piece of cover stands (it fills the tile)
  const key = (f: WallSlot) => `${f.side}:${f.i}:${f.j}`,
    hung = new Set([
      ...shopFronts(plan, HOSP_DEPARTMENTS).map(f => key(f)),
      ...tools.of('emergency').map(key),
      ...tools.of('exitSign').map(key),
      ...tools.of('clock').map(key),
    ]),
    lifts = wallLinks.get(d.maps.grid)?.lifts ?? new Set<number>(),
    tileOf = (f: WallSlot) => f.j * d.W + f.i;
  dressWalls(
    { add },
    d,
    plan,
    rng,
    {
      ...(hospKit ??= makeHospKit()),
      leave: f =>
        lifts.has(tileOf(f)) ||
        !!d.maps.cover[tileOf(f)] ||
        d.maps.hgt[tileOf(f)]! < 0 ||
        !!plan.noFloor[tileOf(f)] ||
        !!plan.shaft[tileOf(f)],
    },
    lights,
    f => hung.has(key(f)) || !!plan.noCeil[tileOf(f)],
  );
  // the boss room is the operating theatre: its own things (after the rest, so the random numbers of the others go on as they did)
  surgeryProps(plan, tools, rng, lights);
  tools.pools(lights, POOL_OPACITY);
}
