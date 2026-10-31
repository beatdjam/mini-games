import { PAINT } from '../../../data/colors.ts';
import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { tileCenter } from '@engine/world/tiles.ts';
import type { PropRule } from '@engine/world/slots.ts';
import { WALL_H } from '../../../data/level.ts';
import type { FloorPlan } from '../../building.ts';
import { roomKindOf, wallFloor, wallLinks, wallPic } from '../common.ts';
import { SIGN_FONT, canvasTex, poolTex } from '../paint.ts';
import { FULL_SIZE, facing, floorNear, lightMat, onWall, overHead, pose, propTools } from '../props.ts';
import { tactileLine } from './tactile.ts';
import { boardTex, shopFronts } from './fronts.ts';
import { KIND_FOOD } from './rooms.ts';
import { liftPlate } from './lift.ts';
import type { Light, WallSlot } from '../props.ts';
import { dressWalls } from '../dress.ts';
import type { WallKit } from '../dress.ts';
import { mallBoxTex, mallEdgeTex, mallHeapTex, mallPopTex, mallTileTex, mallUnitTex } from './cutouts.ts';
import { dockProps } from './dockProps.ts';
import { mallShopHeaps } from './shopHeaps.ts';
import { MALL_DIRECTIONS, MALL_LIFT, MALL_SHOP_NAMES } from '../../../i18n/signs.ts';
import {
  MALL_BARE_WALLS,
  MALL_EDGE_WALLS,
  MALL_LANE_WALLS,
  MALL_LIFT_WALLS,
  MALL_ROOM_WALLS,
  MALL_WALL_PICS,
  MALL_WALL_SIDES,
} from './pictures.ts';
import { BRASS, SIGN_WORDS } from './shared.ts';
// The props of the shopping mall (MALL): the things fixed to its walls and ceilings, and the light they throw. They go
// by the pictures on the walls (pictures.ts, next to this file), which are painted there. world/looks.ts puts the two
// together.
// ---- tuning numbers used only here ----
const POOL_OPACITY = 0.22; // the light a downlight or an emergency lamp throws on the floor (faint: nothing may be lost in it)
const GLOW_OPACITY = 0.26; // ... an emergency lamp on its wall
const PLAIN_WALLS = [0, 3, 4, 5, 6, 7]; // the walls that take an emergency lamp (clear of the signs and windows)
const POTTED_WALLS = [0, 1, 4, 6, 7]; // ... a dead plant (clear of the doors, cases and machines)
// ---- the things on the walls and ceilings ----
// (everything hangs above head height, EYE in src/data/level.ts, or lies flat on a wall or the ceiling; none of it has a
// body in the tile world)
const MALL_PROPS: PropRule[] = [
  { id: 'direction', slots: ['corridor', 'center'], blocks: false, count: [4, 6], gap: 6 },
  { id: 'camera', slots: ['floor', 'center', 'corridor'], blocks: false, count: [10, 14], gap: 5 },
  { id: 'speaker', slots: ['floor', 'center', 'corridor'], blocks: false, count: [12, 16], gap: 4 },
  { id: 'banner', slots: ['floor', 'center'], blocks: false, count: [5, 8], gap: 5 },
  { id: 'downlight', slots: ['floor', 'center', 'corridor'], blocks: false, count: [8, 12], gap: 5 },
  { id: 'exitLamp', slots: ['wall'], blocks: false, count: [10, 14], gap: 4 },
  { id: 'plant', slots: ['wall'], blocks: false, count: [9, 13], gap: 4 },
];
const DIRECTION = { w: 1.7, h: 0.55, thick: 0.08, bottom: 4.3, rod: 0.025 }; // a direction sign hung from the ceiling (m)
const CAMERA = { r: 0.17, baseR: 0.2, baseH: 0.04 }; // a dome camera under the ceiling (m)
const SPEAKER = { r: 0.14, h: 0.06, grille: 0.1 }; // a ceiling speaker (m)
const BANNER = { w: 0.95, len: [2.0, 2.5] as const, bottom: 3.3, bar: 0.05 }; // a cloth banner from the ceiling (m)
const DOWNLIGHT = { r: 0.2, color: PAINT.amber6, size: 0.8 }; // a downlight that is still on (m; size of its pool)
const EXIT_LAMP = { w: 0.5, h: 0.16, thick: 0.12, y: 4.2, color: 0xe6e8c6, glow: 2.2, size: 0.5 }; // an emergency lamp on a wall (m)
const SHOP_BOARD = { w: 3.0, h: 0.5, y: 4.25, out: 0.04 }; // a shop's name board on its front (m)
const FOOD_SIGN = { w: 4.4, h: 1.2, thick: 0.1, bottom: 4.0 }; // the food court's hanging sign (m)
const PLANT = { potR: 0.26, potH: 0.42, out: 0.36, twigH: 1.0, color: 0x7a5b41, dry: 0x5e4b33, leaf: 0x80703f }; // a dead plant in a pot (m)
const BANNER_COLORS = [0x8aa7a3, 0xb08c7e, 0x9aa07c, 0x8b8fb0, 0xb7a174]; // cloth gone pale
const FITTING = 0x8b887c; // trims and mounts
const DARK_GLASS = 0x2c2c2e;
const SIGN_BOARD = '#4d3626'; // a board of dark wood
const SIGN_W = 340,
  SIGN_H = 110; // px of a direction sign's picture

interface MallShared {
  directions: THREE.CanvasTexture[];
  banner: THREE.CanvasTexture;
}
let mallShared: MallShared | null = null;
// a direction sign: a dark blue board with a brass rim and where it points, in pale letters
function directionTex(text: string): THREE.CanvasTexture {
  return canvasTex(SIGN_W, SIGN_H, g => {
    g.fillStyle = SIGN_BOARD;
    g.fillRect(0, 0, SIGN_W, SIGN_H);
    g.strokeStyle = BRASS;
    g.lineWidth = 5;
    g.strokeRect(5, 5, SIGN_W - 10, SIGN_H - 10);
    g.fillStyle = SIGN_WORDS;
    g.font = `700 46px ${SIGN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, SIGN_W / 2, SIGN_H / 2 + 2, SIGN_W - 40);
    g.fillStyle = 'rgba(14,12,10,.22)';
    g.fillRect(0, 0, SIGN_W, SIGN_H);
  });
}
// a banner of cloth, a pale ground that each copy tints in its own colour: a stripe at its head and foot, a ring and
// a pennant between them, creases and stains
function bannerTex(): THREE.CanvasTexture {
  const w = 96,
    h = 256;
  return canvasTex(w, h, g => {
    g.fillStyle = '#d9d6cc';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(40,36,30,.35)';
    g.fillRect(0, 0, w, 16);
    g.fillRect(0, h - 22, w, 22);
    g.strokeStyle = 'rgba(40,36,30,.4)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(w / 2, h * 0.36, 22, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(40,36,30,.3)';
    g.beginPath();
    g.moveTo(14, h * 0.58);
    g.lineTo(w - 14, h * 0.58);
    g.lineTo(w / 2, h * 0.58 + 52);
    g.fill();
    g.fillStyle = 'rgba(60,50,36,.16)';
    for (let x = 12; x < w; x += 22) g.fillRect(x, 16, 2, h - 40);
    g.fillStyle = 'rgba(76,60,40,.2)';
    g.beginPath();
    g.ellipse(w * 0.3, h * 0.82, 16, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(210,214,222,.14)';
    g.fillRect(0, 0, w * 0.4, h);
  });
}
// what the closed mall was left full of (looks/dress.ts): vending machines, coin lockers, a shuttered wagon, photo
// booths and massage chairs let into the concourse's walls (hardly any in the rooms: their walls are the shops' own),
// a vending machine, coin lockers or capsule toys at an end of a shop's front, cartons, a toppled rack, stacked chairs,
// rolls of carpet, bags of rubbish and a fallen sign along the foot of the walls (in a shop's room, the shop's own
// goods and fittings instead), ceiling tiles and paper pops come down, a few cables under the ceiling (a mall that was
// kept tidy)
let mallKit: WallKit | null = null;
const makeMallKit = (): WallKit => ({
  pics: MALL_WALL_PICS.length,
  laneWalls: MALL_LANE_WALLS,
  sides: MALL_WALL_SIDES,
  rooms: MALL_ROOM_WALLS,
  liftWalls: MALL_LIFT_WALLS,
  bare: MALL_BARE_WALLS,
  units: { maps: [0, 1, 2, 3, 4, 5].map(mallUnitTex), w: 3.7, h: 2.84, hall: 0.03, lane: 0.35 },
  // a vending machine, coin lockers or capsule toys at one end of a shop's front (not in the rooms: their walls are the
  // shops' own)
  edges: {
    on: MALL_EDGE_WALLS,
    maps: [0, 1, 2, 3, 4, 5].map(mallEdgeTex),
    w: 1.2,
    h: 2,
    deep: 0.5,
    side: 0x35383a,
    hall: 0,
    lane: 0.8,
  },
  heaps: {
    maps: [0, 1, 2, 3, 4, 5].map(mallHeapTex),
    solid: [0, 1, 2, 3].map(mallBoxTex),
    shops: mallShopHeaps(),
    w: 3.5,
    h: 1.75,
    hall: 0.45,
    lane: 0.75,
  },
  high: [
    {
      maps: [0, 1].map(n => mallTileTex(1600 + n)),
      w: 2.4,
      h: 1.8,
      y: [4.7, 5.1],
      out: [0.9, 1.7],
      hall: 0.05,
      lane: 0.08,
    },
    { maps: [0, 1].map(mallPopTex), w: 1.8, h: 1.6, y: [4.9, 5.2], out: [0.9, 1.7], hall: 0.06, lane: 0.1 },
  ],
  runs: {
    colors: [0x544f49, 0x6b655a, 0x4d4942],
    r: 0.025,
    n: [1, 3],
    hall: 0.1,
    lane: 0.2,
    y: [5.2, 5.6],
    laneY: [4.9, 5.4],
  },
});
// Direction signs hung over the concourse and the rooms, dome cameras and speakers under the ceiling, a few
// downlights that are still on, cloth banners from the ceilings of the rooms, and emergency lamps on the walls, each
// glowing a little on the wall round it
export function mallProps(plan: FloorPlan, group: THREE.Group, rng: Rng) {
  mallShared ??= { directions: MALL_DIRECTIONS.map(directionTex), banner: bannerTex() };
  const shared = mallShared,
    tools = propTools(plan, group, MALL_PROPS, rng),
    { d, wallOf, add, inHallRoom, hallRoom } = tools,
    pictureOf = (wall: number) =>
      wallPic(d, wall, {
        count: MALL_WALL_PICS.length,
        laneWalls: MALL_LANE_WALLS,
        sides: MALL_WALL_SIDES,
        rooms: MALL_ROOM_WALLS,
        liftWalls: MALL_LIFT_WALLS,
      });
  // (no ceiling where it is open to the sky; none in the boss room: its ceiling is twice as high, and a fitting at the
  // usual height would hang in the air)
  const overhead = (id: string) => tools.of(id).filter(s => !plan.noCeil[s.j * d.W + s.i] && !inHallRoom(s)),
    lights: Light[] = [];

  // direction signs: a board on two rods, one of the sorts at random, across or along the way. Over a deck they are
  // moved up out of the eye (overHead). Only over the concourse (not in a shop: a sign to the toilets in a cafe reads wrong)
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
  const fitting = new THREE.MeshBasicMaterial({ color: FITTING });
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
    new THREE.MeshBasicMaterial({ color: 0x3a3b40 }),
    domes,
  );

  // ceiling speakers: a round case with a dark grille
  const cases: THREE.Matrix4[] = [],
    grilles: THREE.Matrix4[] = [];
  overhead('speaker').forEach(s => {
    const x = tileCenter(s.i) + rng.rand(-1.2, 1.2),
      z = tileCenter(s.j) + rng.rand(-1.2, 1.2);
    cases.push(pose(new THREE.Vector3(x, WALL_H - SPEAKER.h / 2, z)));
    grilles.push(pose(new THREE.Vector3(x, WALL_H - SPEAKER.h - 0.004, z)));
  });
  add(new THREE.CylinderGeometry(SPEAKER.r, SPEAKER.r, SPEAKER.h, 12), fitting, cases);
  add(
    new THREE.CircleGeometry(SPEAKER.grille, 12).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: DARK_GLASS }),
    grilles,
  );

  // downlights still on: over the painted one of the tile (the middle of the tile, as painted), with a faint warm pool
  // of light on the floor under it
  const rims: THREE.Matrix4[] = [],
    lit: THREE.Matrix4[] = [];
  overhead('downlight').forEach(s => {
    const x = tileCenter(s.i),
      z = tileCenter(s.j);
    rims.push(pose(new THREE.Vector3(x, WALL_H - 0.012, z)));
    lit.push(pose(new THREE.Vector3(x, WALL_H - 0.02, z)));
    lights.push({ x, z, color: DOWNLIGHT.color, size: DOWNLIGHT.size });
  });
  add(new THREE.CircleGeometry(DOWNLIGHT.r + 0.04, 16).rotateX(Math.PI / 2), fitting, rims);
  add(
    new THREE.CircleGeometry(DOWNLIGHT.r, 16).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: DOWNLIGHT.color }),
    lit,
  );

  // banners: a cloth on a bar, hung from the ceiling of a room; over a deck it hangs higher (overHead), shorter
  const cloths: THREE.Matrix4[] = [],
    clothColors: number[] = [],
    bars: THREE.Matrix4[] = [];
  overhead('banner').forEach(s => {
    const x = tileCenter(s.i) + rng.rand(-1, 1),
      z = tileCenter(s.j) + rng.rand(-1, 1),
      turn = rng.rand(0, Math.PI),
      bottom = overHead(BANNER.bottom, floorNear(d, s.i, s.j)),
      top = WALL_H - 0.05,
      len = Math.min(rng.rand(BANNER.len[0], BANNER.len[1]), top - bottom);
    if (len < 0.8) return;
    cloths.push(pose(new THREE.Vector3(x, top - len / 2, z), turn, new THREE.Vector3(1, len, 1)));
    clothColors.push(rng.pick(BANNER_COLORS));
    bars.push(pose(new THREE.Vector3(x, top, z), turn));
  });
  add(
    new THREE.PlaneGeometry(BANNER.w, 1),
    new THREE.MeshBasicMaterial({ map: shared.banner, side: THREE.DoubleSide }),
    cloths,
    clothColors,
  );
  add(new THREE.BoxGeometry(BANNER.w + 0.1, BANNER.bar, BANNER.bar), fitting, bars);

  // emergency lamps: a pale lit box on a plain wall above the eye, its glow on the wall round it and a faint pool on
  // the floor before it
  const lampBox: THREE.Matrix4[] = [],
    lampFace: THREE.Matrix4[] = [],
    glow: THREE.Matrix4[] = [];
  tools
    .of('exitLamp')
    .filter(s => PLAIN_WALLS.includes(pictureOf(wallOf(s))))
    .forEach(s => {
      const off = rng.rand(-1.2, 1.2),
        turn = facing(s),
        floor = onWall(s, off, 1.2, 0);
      lampBox.push(pose(onWall(s, off, EXIT_LAMP.thick / 2, EXIT_LAMP.y), turn));
      lampFace.push(pose(onWall(s, off, EXIT_LAMP.thick + 0.006, EXIT_LAMP.y), turn));
      glow.push(pose(onWall(s, off, 0.03, EXIT_LAMP.y), turn));
      lights.push({ x: floor.x, z: floor.z, color: EXIT_LAMP.color, size: EXIT_LAMP.size });
    });
  add(new THREE.BoxGeometry(EXIT_LAMP.w, EXIT_LAMP.h, EXIT_LAMP.thick), fitting, lampBox);
  add(
    new THREE.PlaneGeometry(EXIT_LAMP.w - 0.08, EXIT_LAMP.h - 0.06),
    new THREE.MeshBasicMaterial({ color: EXIT_LAMP.color }),
    lampFace,
  );
  add(
    new THREE.PlaneGeometry(EXIT_LAMP.glow, EXIT_LAMP.glow * 0.7),
    lightMat(poolTex(), GLOW_OPACITY, EXIT_LAMP.color),
    glow,
  );

  // dead plants in pots, at the foot of a plain wall: a pot, bare twigs leaning out of it, a few dry leaves
  const pots: THREE.Matrix4[] = [],
    twigs: THREE.Matrix4[] = [],
    leaves: THREE.Matrix4[] = [];
  tools
    .of('plant')
    .filter(s => POTTED_WALLS.includes(pictureOf(wallOf(s))))
    .forEach(s => {
      const off = rng.rand(-1.4, 1.4),
        turn = facing(s);
      pots.push(pose(onWall(s, off, PLANT.out, PLANT.potH / 2), turn));
      for (const lean of [-0.45, 0.05, 0.4]) {
        const tip = lean + rng.rand(-0.1, 0.1);
        twigs.push(
          pose(
            onWall(s, off + Math.sin(tip) * 0.2, PLANT.out, PLANT.potH + PLANT.twigH / 2 - 0.05),
            turn,
            FULL_SIZE,
            -tip,
          ),
        );
        leaves.push(
          pose(
            onWall(s, off + Math.sin(tip) * (0.2 + PLANT.twigH * 0.5), PLANT.out, PLANT.potH + PLANT.twigH * 0.85),
            turn,
            FULL_SIZE,
            -tip,
          ),
        );
      }
    });
  add(
    new THREE.CylinderGeometry(PLANT.potR, PLANT.potR * 0.75, PLANT.potH, 10),
    new THREE.MeshBasicMaterial({ color: PLANT.color }),
    pots,
  );
  add(new THREE.BoxGeometry(0.035, PLANT.twigH, 0.035), new THREE.MeshBasicMaterial({ color: PLANT.dry }), twigs);
  add(new THREE.BoxGeometry(0.28, 0.05, 0.16), new THREE.MeshBasicMaterial({ color: PLANT.leaf }), leaves);

  // the name board of each shop on its front, at the middle of its longest stretch along the concourse
  const boardsOf = new Map<THREE.CanvasTexture, THREE.Matrix4[]>();
  for (const f of shopFronts(plan)) {
    const s = { i: f.i, j: f.j, side: f.side },
      tex = boardTex(f.kind, f.name);
    (boardsOf.get(tex) ?? boardsOf.set(tex, []).get(tex)!).push(
      pose(onWall(s, 0, SHOP_BOARD.out, SHOP_BOARD.y), facing(s)),
    );
  }
  for (const [tex, where] of boardsOf)
    add(new THREE.PlaneGeometry(SHOP_BOARD.w, SHOP_BOARD.h), new THREE.MeshBasicMaterial({ map: tex }), where);

  // the food court's big sign, hung from the ceiling over the middle of its room
  const court: THREE.Matrix4[] = [],
    courtRods: THREE.Matrix4[] = [];
  d.rooms.forEach((r, n) => {
    if (roomKindOf(d.maps.grid, n) !== KIND_FOOD || n === hallRoom) return;
    const i = Math.floor(r.x + r.w / 2),
      j = Math.floor(r.y + r.h / 2);
    if (plan.noCeil[j * d.W + i]) return;
    const bottom = overHead(FOOD_SIGN.bottom, floorNear(d, i, j)),
      rodLen = WALL_H - bottom - FOOD_SIGN.h;
    court.push(pose(new THREE.Vector3(tileCenter(i), bottom + FOOD_SIGN.h / 2, tileCenter(j))));
    if (rodLen > 0)
      for (const dx of [-FOOD_SIGN.w * 0.4, FOOD_SIGN.w * 0.4])
        courtRods.push(
          pose(
            new THREE.Vector3(tileCenter(i) + dx, bottom + FOOD_SIGN.h + rodLen / 2, tileCenter(j)),
            0,
            new THREE.Vector3(1, rodLen, 1),
          ),
        );
  });
  const foodFace = new THREE.MeshBasicMaterial({ map: boardTex(KIND_FOOD, MALL_SHOP_NAMES[KIND_FOOD]![0]!) });
  add(
    new THREE.BoxGeometry(FOOD_SIGN.w, FOOD_SIGN.h, FOOD_SIGN.thick),
    [fitting, fitting, fitting, fitting, foodFace, foodFace],
    court,
  );
  add(new THREE.BoxGeometry(DIRECTION.rod, 1, DIRECTION.rod), fitting, courtRods);

  liftPlate(
    plan,
    tools.add,
    wallLinks.get(d.maps.grid)?.lifts ?? new Set(),
    wallFloor.get(d.maps.grid) ?? 0,
    MALL_LIFT,
  );

  tactileLine(plan, tools.add);

  // what was left along the walls: not on a face that has a shop's name board or an emergency lamp (above the eye),
  // not under the open sky, and not at the foot of a face with a potted plant; no units and no heaps in a lift's car,
  // on the sunk floor of the food court, or where a piece of cover stands (it fills the tile)
  const key = (f: WallSlot) => `${f.side}:${f.i}:${f.j}`,
    hung = new Set([...shopFronts(plan).map(f => key(f)), ...tools.of('exitLamp').map(key)]),
    potted = new Set(tools.of('plant').map(key)),
    lifts = wallLinks.get(d.maps.grid)?.lifts ?? new Set<number>(),
    tileOf = (f: WallSlot) => f.j * d.W + f.i;
  dressWalls(
    { add },
    d,
    plan,
    rng,
    {
      ...(mallKit ??= makeMallKit()),
      leave: f =>
        potted.has(key(f)) ||
        lifts.has(tileOf(f)) ||
        !!d.maps.cover[tileOf(f)] ||
        d.maps.hgt[tileOf(f)]! < 0 ||
        !!plan.noFloor[tileOf(f)] ||
        !!plan.shaft[tileOf(f)],
    },
    lights,
    f => hung.has(key(f)) || !!plan.noCeil[tileOf(f)],
  );
  // the boss room is the loading dock: its own things (after the rest, so the random numbers of the others go on as they did)
  dockProps(plan, tools, rng, lights);
  tools.pools(lights, POOL_OPACITY);
}
