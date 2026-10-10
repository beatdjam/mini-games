import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { SIDE_STEP, tileCenter } from '@engine/world/tiles.ts';
import type { PropRule } from '@engine/world/slots.ts';
import { WALL_H } from '../../../data/level.ts';
import { COLOR, PAINT, css } from '../../../data/colors.ts';
import type { FloorPlan } from '../../building.ts';
import { wallPic } from '../common.ts';
import { TEX, canvasTex, grime, paint } from '../paint.ts';
import type { Paint } from '../paint.ts';
import { spanLines } from '../dress.ts';
import { facing, floorNear, onWall, overHead, pose, propTools, raised } from '../props.ts';
import type { Light, WallSlot } from '../props.ts';
import { KWLN_NEON_WORDS, KWLN_SHOP_NAMES } from '../../../i18n/signs.ts';
import { KWLN_FONT, KWLN_LANE_WALLS, KWLN_WALL_PICS } from './pictures.ts';
import { cageTex, neonTex as hangNeonTex, tinTex } from '../../yardProps.ts';
import { crateFaceTex, heapTex, stallTex, washingTex } from './cutouts.ts';
// The props of the walled city (KWLN): the things fixed to its walls and ceilings, and the light they throw. They go
// by the pictures on the walls (pictures.ts, next to this file), which are painted there. world/looks.ts puts the two
// together.
// ---- tuning numbers used only here ----
const LAMP_POOL_OPACITY = 0.7;
const KWLN_SHUTTER = 1; // (a shop's board hangs over each shutter: kwlnProps)
// the front of an air conditioner
const acPaint: Paint = (g, rand) => {
  g.fillStyle = '#6b6a66';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 50, '#8a8984', '#1e1d1c');
  g.fillStyle = '#1c1b1a';
  g.beginPath();
  g.arc(TEX * 0.36, TEX / 2, TEX * 0.3, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#55534f';
  g.lineWidth = 5;
  for (let k = 0; k < 6; k++) {
    g.beginPath();
    g.arc(TEX * 0.36, TEX / 2, 10 + k * 11, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#1c1b1a';
  for (let k = 0; k < 7; k++) g.fillRect(TEX * 0.74, 40 + k * 26, TEX * 0.2, 10);
  const rust = g.createLinearGradient(0, TEX * 0.8, 0, TEX);
  rust.addColorStop(0, 'rgba(110,60,30,0)');
  rust.addColorStop(1, 'rgba(110,60,30,.6)');
  g.fillStyle = rust;
  g.fillRect(0, TEX * 0.8, TEX, TEX * 0.2);
};
// ---- the signs ----
// a shop's board over its shutter: [paint colour, board colour], one per name of KWLN_SHOP_NAMES
const BOARD_PAINT: [string, string][] = [
  ['#b3261e', '#e6dcc3'],
  ['#f1e6c8', '#8f1d18'],
  ['#1f5c3a', '#e2dcc8'],
  ['#f4e9c9', '#1d3f5e'],
  ['#d8b23a', '#3a1414'],
  ['#b3261e', '#d9d2ba'],
];
const BOARDS = KWLN_SHOP_NAMES.map((name, n): [string, string, string] => [
  name,
  ...BOARD_PAINT[n % BOARD_PAINT.length]!,
]);
// a neon sign standing out from a wall, read top to bottom: the tube colour, one per word of KWLN_NEON_WORDS
const NEON_TUBES = [
  COLOR.neonMint,
  COLOR.neonPink,
  COLOR.neonGold,
  COLOR.neonPink,
  COLOR.neonSky,
  COLOR.neonGold,
  COLOR.neonMint,
  COLOR.neonSky,
];
const NEONS = KWLN_NEON_WORDS.map((words, n): [string, number] => [words, NEON_TUBES[n % NEON_TUBES.length]!]);
function boardTex([name, ink, board]: [string, string, string]): THREE.CanvasTexture {
  return canvasTex(512, 128, g => {
    g.fillStyle = board;
    g.fillRect(0, 0, 512, 128);
    // weathered: darker at the edges, streaks from the top
    const edge = g.createLinearGradient(0, 0, 0, 128);
    edge.addColorStop(0, 'rgba(0,0,0,.28)');
    edge.addColorStop(0.3, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,.34)');
    g.fillStyle = edge;
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = 'rgba(0,0,0,.45)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 506, 122);
    g.fillStyle = ink;
    g.font = `900 ${name.length > 4 ? 78 : 88}px ${KWLN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name, 256, 68, 470);
  });
}
function neonTex([words, color]: [string, number]): THREE.CanvasTexture {
  const h = 512,
    w = 160;
  return canvasTex(w, h, g => {
    g.fillStyle = '#0d0b0c';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = css(color);
    g.shadowColor = css(color);
    g.shadowBlur = 16;
    g.lineWidth = 5;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#fff';
    g.font = `900 ${words.length > 1 ? 118 : 132}px ${KWLN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const step = (h - 60) / words.length;
    [...words].forEach((ch, n) => {
      const y = 30 + step * (n + 0.5);
      g.shadowBlur = 26;
      g.fillStyle = css(color);
      g.fillText(ch, w / 2, y);
      g.shadowBlur = 6;
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillText(ch, w / 2, y);
    });
  });
}

const LAMP_COLORS = [PAINT.glow5, PAINT.glow5, 0xdff3ff]; // bare bulbs and a cold tube now and then
// (the first four were there before the alleys were crowded: their order is kept, so they stay where they were)
const KWLN_PROPS: PropRule[] = [
  { id: 'neon', slots: ['wall'], blocks: false, count: [14, 20], gap: 2 },
  { id: 'pipes', slots: ['wall'], blocks: false, count: [16, 24], gap: 2 },
  { id: 'ac', slots: ['wall'], blocks: false, count: [6, 10], gap: 3 },
  { id: 'lamp', slots: ['floor', 'center', 'corridor'], blocks: false, count: [10, 14], gap: 3 },
  // what crowds the alleys: high on the walls and under the ceiling, out of the way of whoever walks there
  // the tangle overhead and the things of daily life along the walls
  // cables as cables: bundles run along the walls under the ceiling, and bundles slung across from wall to wall
  // painted set pieces (cutouts.ts): stalls, heaps along the walls, lines of washing
];
const WIRES = [css(PAINT.ink3), '#1b1816', '#3a332c', '#8f8576', '#5a4a3a']; // the colours of the wires overhead
const TUBE_WHITE = 0xe8f1ff; // a bare fluorescent tube
// a board of electricity meters with the wires that run to them (a share of a wall, about 2.2 m by 1.7 m)
const meterBoard: Paint = (g, rand) => {
  g.clearRect(0, 0, TEX, TEX);
  g.fillStyle = '#3b2f24';
  g.fillRect(8, 40, TEX - 16, TEX - 80);
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 5; c++) {
      if (rand() < 0.18) continue;
      const x = 22 + c * 45,
        y = 58 + r * 78;
      g.fillStyle = '#1c1b1b';
      g.fillRect(x, y, 34, 48);
      g.fillStyle = '#b9b8ae';
      g.fillRect(x + 4, y + 5, 26, 18);
      g.fillStyle = '#2a2a2a';
      g.fillRect(x + 8, y + 30, 18, 10);
    }
  g.lineCap = 'round';
  for (let k = 0; k < 22; k++) {
    g.strokeStyle = WIRES[Math.floor(rand() * WIRES.length)]!;
    g.lineWidth = 1 + rand() * 3;
    g.beginPath();
    g.moveTo(rand() * TEX, 0);
    g.bezierCurveTo(
      rand() * TEX,
      30 + rand() * 40,
      rand() * TEX,
      20 + rand() * 60,
      20 + rand() * (TEX - 40),
      50 + rand() * 150,
    );
    g.stroke();
  }
};
// an old television set's face: the tube, dark, and its knobs
const tvFace: Paint = (g, rand) => {
  g.fillStyle = css(PAINT.soot6);
  g.fillRect(0, 0, TEX, TEX);
  g.fillStyle = '#3d4a47';
  g.fillRect(18, 22, TEX - 90, TEX - 44);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(26, 30, 60, 30);
  g.fillStyle = css(PAINT.grey7);
  for (let k = 0; k < 3; k++) g.fillRect(TEX - 54, 40 + k * 56 + rand() * 6, 34, 34);
};
const TINS = [css(PAINT.rust2), css(PAINT.teal), css(PAINT.grey9), css(PAINT.olive)]; // the paints of the tin awnings
const HANG_COLORS: [string, number][] = [
  [css(PAINT.red1), PAINT.red1],
  [css(PAINT.pink), PAINT.pink],
  [css(PAINT.mint1), PAINT.mint1],
  [css(PAINT.amber5), PAINT.amber5],
];
const BOARD = { w: 3.5, h: 0.9, y: 4.75, out: 0.07, tilt: 0.1, chance: 0.8 }; // a shop's board (m, m, m, m, rad)
const NEON = { thick: 0.12, h: 2.5, out: 0.85, y: 4.2 }; // a neon sign standing out from a wall (m)
interface KwlnShared {
  stalls: THREE.CanvasTexture[];
  crates: THREE.CanvasTexture[];
  heaps: THREE.CanvasTexture[];
  washing: THREE.CanvasTexture[];
  meterBoard: THREE.CanvasTexture;
  tv: THREE.CanvasTexture;
  tins: THREE.CanvasTexture[];
  cages: THREE.CanvasTexture[];
  hangs: THREE.CanvasTexture[];
  ac: THREE.CanvasTexture;
  boards: THREE.CanvasTexture[];
  neons: THREE.CanvasTexture[];
}
let kwlnShared: KwlnShared | null = null;
// Signboards over the shutters, neon signs standing out from the walls with their colour on the ground, pipes and
// air conditioners on the walls, bare lamps on the ceiling
export function kwlnProps(plan: FloorPlan, group: THREE.Group, rng: Rng) {
  kwlnShared ??= {
    stalls: [21, 22, 23, 24, 25, 26, 27, 28].map(stallTex),
    crates: [50, 51, 52, 53, 54, 55].map(crateFaceTex),
    heaps: [31, 32, 33, 34, 35, 36, 37, 38].map(heapTex),
    washing: [41, 42, 43].map(washingTex),
    meterBoard: paint(31, meterBoard),
    tv: paint(32, tvFace),
    tins: TINS.map(tinTex),
    cages: [0, 1, 2, 3].map(cageTex),
    hangs: KWLN_SHOP_NAMES.map((name, n) => hangNeonTex(name, HANG_COLORS[n % HANG_COLORS.length]![0], true)),
    ac: paint(12, acPaint),
    boards: BOARDS.map(boardTex),
    neons: NEONS.map(neonTex),
  };
  const shared = kwlnShared,
    { d, of, add, pools } = propTools(plan, group, KWLN_PROPS, rng),
    one = new THREE.Vector3(1, 1, 1),
    lights: Light[] = [];

  // a board over every shutter that faces a floor tile (most of them): the shop's name
  const fronts: WallSlot[] = [];
  for (let j = 1; j < d.H - 1; j++)
    for (let i = 1; i < d.W - 1; i++) {
      if (d.maps.grid[j * d.W + i] !== 1) continue;
      SIDE_STEP.forEach(([di, dj], side) => {
        const wall = (j + dj) * d.W + i + di;
        if (d.maps.grid[wall] || plan.voids[wall]) return;
        if (wallPic(d, wall, KWLN_WALL_PICS.length, KWLN_LANE_WALLS) === KWLN_SHUTTER && rng.next() < BOARD.chance)
          fronts.push({ i, j, side });
      });
    }
  // tipped a little toward the street, as boards hang
  const hung = (s: WallSlot) =>
    new THREE.Matrix4().compose(
      onWall(s, 0, BOARD.out, BOARD.y),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(BOARD.tilt, facing(s), 0, 'YXZ')),
      one,
    );
  shared.boards.forEach((map, b) =>
    add(
      new THREE.PlaneGeometry(BOARD.w, BOARD.h),
      new THREE.MeshBasicMaterial({ map }),
      fronts.filter((_, n) => n % shared.boards.length === b).map(hung),
    ),
  );

  // neon signs: a thin box standing out from the wall, its two broad faces lit, read along the street
  const neons = of('neon').filter(s => !plan.noCeil[s.j * d.W + s.i]);
  shared.neons.forEach((map, b) => {
    const lit = new THREE.MeshBasicMaterial({ map }),
      edge = new THREE.MeshBasicMaterial({ color: 0x15121a }),
      where = neons
        .filter((_, n) => n % shared.neons.length === b)
        .map(s => {
          const off = rng.rand(-1.2, 1.2),
            pos = onWall(s, off, NEON.out / 2 + 0.05, NEON.y + rng.rand(-0.4, 0.3));
          lights.push({ x: pos.x, z: pos.z, color: NEONS[b]![1], size: 1 });
          return pose(pos, facing(s));
        });
    add(new THREE.BoxGeometry(NEON.thick, NEON.h, NEON.out), [lit, lit, edge, edge, edge, edge], where);
  });

  // pipes: a thick and a thin one side by side, floor to ceiling
  add(
    new THREE.CylinderGeometry(0.1, 0.1, WALL_H, 8),
    new THREE.MeshBasicMaterial({ color: 0x55504a }),
    of('pipes').flatMap(s => {
      const off = rng.rand(-1.3, 1.3);
      return [
        pose(onWall(s, off, 0.14, WALL_H / 2)),
        pose(onWall(s, off + 0.3, 0.1, WALL_H / 2), 0, new THREE.Vector3(0.55, 1, 0.55)),
      ];
    }),
  );
  // air conditioners: a box high on the wall, its front toward the street
  const front = new THREE.MeshBasicMaterial({ map: shared.ac }),
    body = new THREE.MeshBasicMaterial({ color: 0x4d4c49 });
  add(
    new THREE.BoxGeometry(1.3, 0.8, 0.5),
    [body, body, body, body, front, front],
    of('ac').map(s => pose(onWall(s, rng.rand(-1, 1), 0.26, rng.rand(2.9, 3.6)), facing(s))),
  );
  // lamps (not where the ceiling is open): a bright plate on the ceiling
  // (none in the boss room: its ceiling is twice as high, and a fitting at the usual height would hang in the air)
  const bossRoom = plan.hall?.room ?? -1,
    plateColors: number[] = [];
  add(
    new THREE.BoxGeometry(0.9, 0.08, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xffffff }), // takes each copy's own colour
    of('lamp')
      .filter(s => !plan.noCeil[s.j * d.W + s.i] && s.room !== bossRoom)
      .map(s => {
        const x = tileCenter(s.i),
          z = tileCenter(s.j),
          c = rng.pick(LAMP_COLORS);
        plateColors.push(c);
        lights.push({ x, z, color: c, size: 1 });
        return pose(new THREE.Vector3(x, WALL_H - 0.06, z), rng.pick([0, Math.PI / 2]));
      }),
    plateColors,
  );
  // ---- what crowds the alleys ----
  // Not handed out by placeProps (a slot there holds one thing, and a wall here holds many, one over another): every
  // wall face and every tile under a ceiling is dressed, each layer by its own throw of the dice. A wall, from the
  // ground up: a heap at its foot, a stall or a board of meters let into it, an awning or a cage or a line of washing
  // over that, conduits and a bundle of cables under the ceiling. Overhead: cables slung across, sheets of tin, a
  // shop's neon hung out
  type Face = WallSlot & { room: number };
  const roomAt = (i: number, j: number): number => plan.gen.maps.roomOf?.[j * d.W + i] ?? -1,
    arena = plan.hall?.room ?? -1,
    faces: Face[] = [],
    ceilings: { i: number; j: number; room: number }[] = [];
  for (let j = 1; j < d.H - 1; j++)
    for (let i = 1; i < d.W - 1; i++) {
      const k = j * d.W + i,
        room = roomAt(i, j);
      if (d.maps.grid[k] !== 1 || room === arena || (plan.court && plan.court.tiles.includes(k))) continue;
      if (!plan.noCeil[k]) ceilings.push({ i, j, room });
      SIDE_STEP.forEach(([di, dj], side) => {
        const wall = (j + dj) * d.W + i + di;
        if (!d.maps.grid[wall] && !plan.voids[wall]) faces.push({ i, j, side, room });
      });
    }
  // (nothing stands at the foot of a wall by a door: it would be in the doorway)
  const byDoor = (f: { i: number; j: number }): boolean =>
      [[0, 0], ...SIDE_STEP].some(([di, dj]) => !!d.maps.door?.[(f.j + dj!) * d.W + f.i + di!]),
    inLane = (f: { room: number }): boolean => f.room < 0,
    // (a neon sign stands out from its wall at the height of the awnings: nothing else hangs on that face)
    neonOn = new Set(
      // (nor on the faces next to it along the wall: an awning is nearly a tile wide)
      of('neon').flatMap(s =>
        [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].map(([a, b]) => `${s.i + a!}:${s.j + b!}:${s.side}`),
      ),
    ),
    // (nor over a deck or a walkway: there they would stand out from the wall at the eye)
    clear = (f: WallSlot): boolean => !neonOn.has(`${f.i}:${f.j}:${f.side}`) && !raised(d, f),
    some = <T>(list: T[], share: number): T[] => list.filter(() => rng.next() < share),
    low = faces.map(() => rng.next()), // what is let into the wall: a stall, a board of meters, or nothing
    high = faces.map(() => rng.next()), // what hangs over it: an awning, a cage, washing, or nothing
    // (an alley's walls are busier at eye height than a hall's: more meters and lamps, fewer whole stalls)
    // (what is let into a wall goes on bare concrete or over posters, not over a window, a gate or a shutter painted
    // there)
    // (nor by a deck or a walkway: what stands on the ground there would be half in it)
    bare = (f: WallSlot): boolean => {
      const [di, dj] = SIDE_STEP[f.side ?? 0]!,
        v = wallPic(d, (f.j + dj) * d.W + f.i + di, KWLN_WALL_PICS.length, KWLN_LANE_WALLS);
      return (v === 0 || v === KWLN_WALL_PICS.length - 1) && !raised(d, f);
    },
    stalls = faces.filter((f, n) => bare(f) && !byDoor(f) && low[n]! < (inLane(f) ? 0.18 : 0.3)),
    lanes = ceilings.filter(c => c.room < 0),
    halls = ceilings.filter(c => c.room >= 0),
    spot = {
      stall: stalls,
      board: faces.filter((f, n) => bare(f) && low[n]! >= 0.3 && low[n]! < (inLane(f) ? 0.62 : 0.48)),
      meter: faces.filter(
        (f, n) => bare(f) && low[n]! >= (inLane(f) ? 0.62 : 0.48) && low[n]! < (inLane(f) ? 0.8 : 0.6),
      ),
      heap: faces.filter(f => !byDoor(f) && !raised(d, f) && rng.next() < (inLane(f) ? 0.8 : 0.62)),
      // (over most stalls, and over a bare wall now and then)
      awning: faces.filter((f, n) => clear(f) && (low[n]! < 0.3 ? high[n]! < 0.8 : high[n]! < 0.12)),
      cage: faces.filter((f, n) => clear(f) && low[n]! >= 0.3 && high[n]! >= 0.12 && high[n]! < 0.42),
      wash: faces.filter((f, n) => clear(f) && low[n]! >= 0.3 && high[n]! >= 0.42 && high[n]! < 0.6),
      duct: faces.filter(f => rng.next() < (inLane(f) ? 0.85 : 0.5)),
      bundle: some(faces, 0.9),
      tube: faces.filter(f => !raised(d, f) && rng.next() < (inLane(f) ? 0.14 : 0.05)),
      // (an alley is roofed with cables: nearly every tile of it has a bundle across, low enough to be seen)
      span: spanLines(ceilings, { lane: 0.92, hall: 0.42 }, rng),
      hangsign: [...some(lanes, 0.2), ...some(halls, 0.035)],
      bulb: some(lanes, 0.3), // a bare bulb on its cord down the middle of an alley
      roof: lanes, // the alleys are roofed over (see below)
      sign: faces.filter(f => inLane(f) && bare(f) && rng.next() < 0.4), // a shop's board flat on an alley's wall
    };
  const flatMat = (color: number) => new THREE.MeshBasicMaterial({ color }),
    tipped = (pos: THREE.Vector3, turn: number, tip: number) =>
      new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(tip, turn, 0, 'YXZ')), one),
    open = (s: { i: number; j: number }) => !plan.noCeil[s.j * d.W + s.i],
    under = (s: { i: number; j: number; room?: number }) => open(s) && s.room !== bossRoom;
  // Tin, as it is built there: a lean-to roof over a shop front, fixed to the wall at its top edge and held out by
  // two braces. (Sheets of it hung free under the ceiling were only in the way: tin belongs to a wall)
  const roofs = spot.awning.map(s => ({ s, y: rng.rand(3.1, 3.45) }));
  shared.tins.forEach((map, v) =>
    add(
      new THREE.PlaneGeometry(3.9, 1.5),
      new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }),
      roofs
        .filter((_, n) => n % shared.tins.length === v)
        .map(r => tipped(onWall(r.s, 0, 0.66, r.y), facing(r.s), -1.15)),
    ),
  );
  add(
    new THREE.BoxGeometry(0.05, 0.05, 1.25),
    flatMat(0x2a2624),
    roofs.flatMap(r => [-1.7, 1.7].map(off => tipped(onWall(r.s, off, 0.6, r.y - 0.42), facing(r.s), 0.62))),
  );
  // the cages built out round the windows upstairs, full of what people keep in them
  shared.cages.forEach((map, v) =>
    add(
      new THREE.BoxGeometry(2.6, 1.4, 0.9),
      new THREE.MeshBasicMaterial({ map }),
      spot.cage
        .filter((_, n) => n % shared.cages.length === v)
        .map(s => pose(onWall(s, rng.rand(-0.5, 0.5), 0.45, rng.rand(4.1, 4.8)), facing(s))),
    ),
  );
  // conduits run along the walls under the ceiling, two together
  add(
    new THREE.CylinderGeometry(0.07, 0.07, 4, 6),
    flatMat(0x3d3a37),
    spot.duct.flatMap(s => {
      // (in an alley they run lower, where they are seen)
      const y = (s as Face).room < 0 ? rng.rand(3.2, 4.4) : rng.rand(5, 5.6);
      return [
        pose(onWall(s, 0, 0.12, y), facing(s), undefined, Math.PI / 2),
        pose(onWall(s, 0, 0.12, y - 0.22), facing(s), new THREE.Vector3(0.6, 1, 0.6), Math.PI / 2),
      ];
    }),
  );
  // electricity meters in a row, with the conduit that feeds them
  const meters = spot.meter.map(s => ({ s, off: rng.rand(-1, 0.4), y: rng.rand(1.5, 1.9) }));
  add(
    new THREE.BoxGeometry(0.34, 0.46, 0.14),
    flatMat(0x7c7a72),
    meters.flatMap(m => [0, 0.42, 0.84].map(k => pose(onWall(m.s, m.off + k, 0.08, m.y), facing(m.s)))),
  );
  add(
    new THREE.BoxGeometry(0.05, 1, 0.05),
    flatMat(0x2c2a28),
    meters.map(m =>
      pose(onWall(m.s, m.off + 0.42, 0.05, (m.y + WALL_H) / 2 + 0.2), 0, new THREE.Vector3(1, WALL_H - m.y - 0.4, 1)),
    ),
  );
  // a shop's neon hung out over the alley on two rods, read from both ways
  const hung2 = spot.hangsign.filter(under).map((s, n) => ({
    x: tileCenter(s.i),
    z: tileCenter(s.j),
    turn: rng.pick([0, Math.PI / 2]),
    // (its bottom, 0.36 under its middle, over the head of someone on a deck there)
    y: overHead((s.room < 0 ? rng.rand(3.4, 3.8) : rng.rand(4.1, 4.6)) - 0.36, floorNear(d, s.i, s.j)) + 0.36,
    n,
  }));
  shared.hangs.forEach((map, v) =>
    add(
      new THREE.PlaneGeometry(2.8, 0.72),
      new THREE.MeshBasicMaterial({ map }),
      hung2
        .filter(h => h.n % shared.hangs.length === v)
        .flatMap(h => [0, Math.PI].map(back => pose(new THREE.Vector3(h.x, h.y, h.z), h.turn + back))),
    ),
  );
  add(
    new THREE.BoxGeometry(0.03, 1, 0.03),
    flatMat(PAINT.ink3),
    hung2.flatMap(h =>
      [-1.2, 1.2].map(k =>
        pose(
          new THREE.Vector3(h.x + Math.cos(h.turn) * k, (h.y + 0.36 + WALL_H) / 2, h.z - Math.sin(h.turn) * k),
          0,
          new THREE.Vector3(1, WALL_H - h.y - 0.36, 1),
        ),
      ),
    ),
  );
  hung2.forEach(h => lights.push({ x: h.x, z: h.z, color: HANG_COLORS[h.n % HANG_COLORS.length]![1], size: 0.9 }));
  // ---- cables ----
  // Round cables of several thicknesses, in bundles (thin flat lines read as scratches on the picture, not as
  // cables). A bundle runs the length of its tile along the wall, on brackets under the ceiling: tile after tile they
  // make runs. Each cable its own grey
  const cableColors: number[] = [],
    cableAt: THREE.Matrix4[] = [],
    CABLE = [0x121011, 0x1d1a19, PAINT.soot7, PAINT.soot11, 0x6f675a];
  for (const s of spot.bundle) {
    const y = rng.rand(4.5, 5.5),
      n = rng.randi(4, 8);
    for (let k = 0; k < n; k++) {
      const thick = rng.rand(0.6, 1.7);
      cableColors.push(rng.pick(CABLE));
      cableAt.push(
        pose(
          onWall(s, 0, 0.1 + (k % 4) * 0.085, y - Math.floor(k / 4) * 0.1 + rng.rand(-0.02, 0.02)),
          facing(s),
          new THREE.Vector3(thick, 1, thick),
          Math.PI / 2 + rng.rand(-0.012, 0.012),
        ),
      );
    }
  }
  // a bundle slung across from wall to wall sags: two halves, each dropping to the middle
  // (in a room one bundle goes the whole way from wall to wall: see spanLines)
  for (const { tiles, turn } of spot.span) {
    const high = tiles[0]!.room < 0 ? rng.rand(3.5, 4.05) : rng.rand(4.6, 5.4),
      sag = rng.rand(0.08, 0.2),
      // (where it sags lowest, over the head of someone on a deck under or next to any tile of the line)
      y = overHead(high - sag * 1.1 - 0.1, Math.max(...tiles.map(s => floorNear(d, s.i, s.j)))) + sag * 1.1 + 0.1,
      n = rng.randi(3, 6);
    for (let k = 0; k < n; k++) {
      const thick = rng.rand(0.7, 1.9),
        side = (k - n / 2) * 0.09,
        color = rng.pick(CABLE);
      for (const s of tiles.filter(under))
        for (const half of [-1, 1]) {
          cableColors.push(color);
          cableAt.push(
            pose(
              new THREE.Vector3(
                tileCenter(s.i) + Math.cos(turn) * half + Math.sin(turn) * side,
                y - sag * 1.1,
                tileCenter(s.j) - Math.sin(turn) * half + Math.cos(turn) * side,
              ),
              turn,
              new THREE.Vector3(thick, 0.52, thick),
              Math.PI / 2 + half * sag,
            ),
          );
        }
    }
  }
  add(
    new THREE.CylinderGeometry(0.035, 0.035, 4.05, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    cableAt,
    cableColors,
  );
  // ---- on the walls ----
  // boards of electricity meters with their wires, at eye height
  add(
    new THREE.PlaneGeometry(2.3, 1.8),
    new THREE.MeshBasicMaterial({ map: shared.meterBoard, transparent: true, alphaTest: 0.35 }),
    spot.board.map(s => pose(onWall(s, rng.rand(-0.7, 0.7), 0.06, rng.rand(1.8, 2.3)), facing(s))),
  );
  // bare fluorescent tubes on the walls: a hard white light under each
  const tubeSlots = spot.tube,
    tubes = tubeSlots.map(s => onWall(s, rng.rand(-0.8, 0.8), 0.12, rng.rand(2.7, 3.2)));
  add(
    new THREE.BoxGeometry(1.25, 0.07, 0.07),
    flatMat(TUBE_WHITE),
    tubeSlots.map((s, n) => pose(tubes[n]!, facing(s))),
  );
  tubes.forEach(pos => lights.push({ x: pos.x, z: pos.z, color: TUBE_WHITE, size: 0.6 }));
  // ---- the painted set pieces (cutouts.ts) ----
  const cutout = (map: THREE.Texture) =>
    new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  // stalls let into the walls, each lit by its bulb (its light falls on the ground in front)
  const stallAt = spot.stall.map(s => ({ s, pos: onWall(s, 0, 0.1, 1.42) }));
  shared.stalls.forEach((map, v) =>
    add(
      new THREE.PlaneGeometry(3.7, 2.84),
      new THREE.MeshBasicMaterial({ map }),
      stallAt.filter((_, n) => n % shared.stalls.length === v).map(a => pose(a.pos, facing(a.s))),
    ),
  );
  stallAt.forEach(a => {
    const out = onWall(a.s, 0, 1.6, 0);
    if (rng.next() < 0.5) lights.push({ x: out.x, z: out.z, color: PAINT.amber6, size: 0.55 });
  });
  // Flat pictures alone read as paper from the side, so each has something solid to it. A stall: a counter of
  // crates in front, two shelf boards standing out of the picture, a post at each end. A heap: real crates stacked
  // against the wall, with the picture of smaller things stood in front of them
  const solid: THREE.Matrix4[][] = shared.crates.map(() => []),
    crate = (pos: THREE.Vector3, turn: number, w: number, h: number, deep: number) =>
      solid[rng.randi(0, solid.length - 1)]!.push(pose(pos, turn, new THREE.Vector3(w, h, deep)));
  for (const a of stallAt) {
    const turn = facing(a.s);
    for (let off = -1.4; off < 1.5; off += 0.95) {
      const h = rng.rand(0.55, 0.9);
      crate(onWall(a.s, off + rng.rand(-0.05, 0.05), 0.36, h / 2), turn + rng.rand(-0.06, 0.06), 0.9, h, 0.46);
    }
  }
  add(
    new THREE.BoxGeometry(3.6, 0.05, 0.3),
    flatMat(0x2e2218),
    stallAt.flatMap(a => [1.5, 2.12].map(y => pose(onWall(a.s, 0, 0.24, y), facing(a.s)))),
  );
  add(
    new THREE.BoxGeometry(0.09, 2.84, 0.09),
    flatMat(0x241b14),
    stallAt.flatMap(a => [-1.8, 1.8].map(off => pose(onWall(a.s, off, 0.52, 1.42), facing(a.s)))),
  );
  // (and against the sides of the raised decks: things pile up there as they do along a wall)
  const deckFeet: Face[] = [];
  for (let j = 1; j < d.H - 1; j++)
    for (let i = 1; i < d.W - 1; i++) {
      const k = j * d.W + i;
      if (d.maps.grid[k] !== 1 || d.maps.hgt[k]! > 0 || d.maps.ramp[k]! >= 0) continue;
      SIDE_STEP.forEach(([di, dj], side) => {
        const n = (j + dj) * d.W + i + di;
        if (
          d.maps.grid[n] === 1 &&
          d.maps.ramp[n]! < 0 &&
          d.maps.hgt[n]! >= 1.5 &&
          !d.maps.cover[n] &&
          rng.next() < 0.5
        )
          deckFeet.push({ i, j, side, room: roomAt(i, j) });
      });
    }
  const heapAt = [...spot.heap, ...deckFeet].map(s => ({ s, off: rng.rand(-0.3, 0.3) }));
  for (const h of heapAt) {
    const turn = facing(h.s);
    for (let k = 0, n = rng.randi(2, 4); k < n; k++) {
      const w = rng.rand(0.55, 0.95),
        tall = rng.rand(0.4, 0.75),
        off = h.off + rng.rand(-1.3, 1.3);
      crate(onWall(h.s, off, 0.27, tall / 2), turn + rng.rand(-0.1, 0.1), w, tall, 0.45);
      if (rng.next() < 0.4)
        crate(
          onWall(h.s, off + rng.rand(-0.1, 0.1), 0.27, tall + 0.25),
          turn + rng.rand(-0.15, 0.15),
          w * 0.8,
          0.5,
          0.4,
        );
    }
  }
  shared.crates.forEach((map, v) =>
    add(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map }), solid[v]!),
  );
  // ... and the picture of the smaller things in front of the crates
  shared.heaps.forEach((map, v) =>
    add(
      new THREE.PlaneGeometry(3.5, 1.75),
      cutout(map),
      heapAt
        .filter((_, n) => n % shared.heaps.length === v)
        .map(h => pose(onWall(h.s, h.off, 0.56, 0.78), facing(h.s), new THREE.Vector3(1, 0.9, 1))),
    ),
  );
  // lines of washing out from the walls, above head height
  shared.washing.forEach((map, v) =>
    add(
      new THREE.PlaneGeometry(3.8, 1.5),
      cutout(map),
      spot.wash
        .filter((_, n) => n % shared.washing.length === v)
        .map(s => pose(onWall(s, 0, rng.rand(0.5, 1.1), rng.rand(3.6, 4.5)), facing(s))),
    ),
  );
  // ---- the alleys ----
  // An alley is roofed over, wall to wall, a little over the height of a shop front: sheets of tin on a beam at
  // every tile. That is what makes it an alley and not a slot between two high walls; what is above the roof is
  // dark. A sheet is left out here and there, and where a neon sign stands up through it
  const roofed = spot.roof.filter(
      c => under(c) && rng.next() < 0.86 && !SIDE_STEP.some((_, side) => neonOn.has(`${c.i}:${c.j}:${side}`)),
    ),
    LANE_ROOF = 4.35,
    // (its beam's underside, over the head of someone on a walkway there)
    roofY = (c: { i: number; j: number }) => overHead(LANE_ROOF - 0.18, floorNear(d, c.i, c.j)) + 0.18;
  shared.tins.forEach((map, v) =>
    add(
      new THREE.PlaneGeometry(4, 4).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ map, color: PAINT.grey8, side: THREE.DoubleSide }),
      roofed
        .filter((_, n) => n % shared.tins.length === v)
        .map(c =>
          pose(
            new THREE.Vector3(tileCenter(c.i), roofY(c) + rng.rand(0, 0.12), tileCenter(c.j)),
            rng.pick([0, Math.PI / 2]),
          ),
        ),
    ),
  );
  add(
    new THREE.BoxGeometry(4, 0.16, 0.16),
    flatMat(0x241b14),
    roofed.flatMap(c => {
      const alongX = d.maps.grid[c.j * d.W + c.i - 1] === 1 || d.maps.grid[c.j * d.W + c.i + 1] === 1;
      return [pose(new THREE.Vector3(tileCenter(c.i), roofY(c) - 0.1, tileCenter(c.j)), alongX ? Math.PI / 2 : 0)];
    }),
  );
  // bare bulbs on their cords down the middle, each with its warm light on the ground
  const bulbs = spot.bulb.filter(under).map(c => ({
    x: tileCenter(c.i) + rng.rand(-0.7, 0.7),
    z: tileCenter(c.j) + rng.rand(-0.7, 0.7),
    y: overHead(rng.rand(2.9, 3.4) - 0.1, floorNear(d, c.i, c.j)) + 0.1,
  }));
  add(
    new THREE.BoxGeometry(0.025, 1, 0.025),
    flatMat(PAINT.ink3),
    bulbs.map(b => pose(new THREE.Vector3(b.x, (b.y + WALL_H) / 2, b.z), 0, new THREE.Vector3(1, WALL_H - b.y, 1))),
  );
  add(
    new THREE.SphereGeometry(0.09, 8, 6),
    flatMat(0xfff0cf),
    bulbs.map(b => pose(new THREE.Vector3(b.x, b.y, b.z))),
  );
  bulbs.forEach(b => lights.push({ x: b.x, z: b.z, color: PAINT.glow3, size: 0.7 }));
  // shops' boards flat on the walls, a little over head height
  shared.boards.forEach((map, b) =>
    add(
      new THREE.PlaneGeometry(BOARD.w * 0.8, BOARD.h * 0.8),
      new THREE.MeshBasicMaterial({ map }),
      spot.sign
        .filter((_, n) => n % shared.boards.length === b)
        .map(s => pose(onWall(s, rng.rand(-0.3, 0.3), 0.05, rng.rand(2.5, 3.1)), facing(s))),
    ),
  );
  // the light the lamps and the neon throw on the ground: a soft pool of their colour
  pools(lights, LAMP_POOL_OPACITY);
}
