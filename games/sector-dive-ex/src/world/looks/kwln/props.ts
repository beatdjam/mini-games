import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { SIDE_STEP, tileCenter } from '@engine/world/tiles.ts';
import type { PropRule } from '@engine/world/slots.ts';
import { WALL_H } from '../../../data/level.ts';
import { COLOR, css } from '../../../data/colors.ts';
import type { FloorPlan } from '../../building.ts';
import { WALL_PLAIN_SHARE, variantOf } from '../common.ts';
import { TEX, canvasTex, grime, paint } from '../paint.ts';
import type { Paint } from '../paint.ts';
import { facing, onWall, pose, propTools } from '../props.ts';
import type { Light, WallSlot } from '../props.ts';
import { KWLN_NEON_WORDS, KWLN_SHOP_NAMES } from '../../../i18n/signs.ts';
import { KWLN_FONT, KWLN_WALL_PICS } from './pictures.ts';
import { cageTex, neonTex as hangNeonTex, tinTex } from '../../yardProps.ts';
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

const LAMP_COLORS = [0xffe2b0, 0xffe2b0, 0xdff3ff]; // bare bulbs and a cold tube now and then
// (the first four were there before the alleys were crowded: their order is kept, so they stay where they were)
const KWLN_PROPS: PropRule[] = [
  { id: 'neon', slots: ['wall'], blocks: false, count: [14, 20], gap: 2 },
  { id: 'pipes', slots: ['wall'], blocks: false, count: [16, 24], gap: 2 },
  { id: 'ac', slots: ['wall'], blocks: false, count: [6, 10], gap: 3 },
  { id: 'lamp', slots: ['floor', 'center', 'corridor'], blocks: false, count: [10, 14], gap: 3 },
  // what crowds the alleys: high on the walls and under the ceiling, out of the way of whoever walks there
  { id: 'awning', slots: ['wall'], blocks: false, count: [16, 24], gap: 1 },
  { id: 'cage', slots: ['wall'], blocks: false, count: [12, 18], gap: 1 },
  { id: 'laundry', slots: ['wall'], blocks: false, count: [8, 12], gap: 2 },
  { id: 'duct', slots: ['wall'], blocks: false, count: [22, 32], gap: 1 },
  { id: 'meter', slots: ['wall'], blocks: false, count: [10, 16], gap: 2 },
  { id: 'stack', slots: ['wall'], blocks: false, count: [12, 18], gap: 2 },
  { id: 'cables', slots: ['floor', 'center', 'corridor'], blocks: false, count: [34, 48], gap: 1 },
  { id: 'lantern', slots: ['floor', 'center', 'corridor'], blocks: false, count: [10, 16], gap: 2 },
  { id: 'hangsign', slots: ['corridor', 'floor'], blocks: false, count: [8, 12], gap: 3 },
];
const TINS = ['#7a4a35', '#3f6a66', '#8f8a7c', '#5a5f3e']; // the paints of the tin awnings
const HANG_COLORS: [string, number][] = [
  ['#ff3b4e', 0xff3b4e],
  ['#ff5fa8', 0xff5fa8],
  ['#3dffb0', 0x3dffb0],
  ['#ffd24a', 0xffd24a],
];
const LANTERN_RED = 0xff4a32;
const CLOTHS = [0xc9c2b4, 0x7a2f2f, 0x3b5d8a, 0xb8a04a, 0x4d6b55]; // washing
const CRATES = [0x6b5236, 0x57493a, 0x7a6a4c, 0x3f4a52]; // crates and tubs stacked against the walls
const BOARD = { w: 3.5, h: 0.9, y: 4.75, out: 0.07, tilt: 0.1, chance: 0.8 }; // a shop's board (m, m, m, m, rad)
const NEON = { thick: 0.12, h: 2.5, out: 0.85, y: 4.2 }; // a neon sign standing out from a wall (m)
interface KwlnShared {
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
        if (variantOf(wall, KWLN_WALL_PICS.length, WALL_PLAIN_SHARE) === KWLN_SHUTTER && rng.next() < BOARD.chance)
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
  const flatMat = (color: number) => new THREE.MeshBasicMaterial({ color }),
    tipped = (pos: THREE.Vector3, turn: number, tip: number) =>
      new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(tip, turn, 0, 'YXZ')), one),
    open = (s: { i: number; j: number }) => !plan.noCeil[s.j * d.W + s.i],
    under = (s: { i: number; j: number; room?: number }) => open(s) && s.room !== bossRoom;
  // tin awnings over the shop fronts, hanging forward
  shared.tins.forEach((map, v) =>
    add(
      new THREE.PlaneGeometry(3, 1.3),
      new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }),
      of('awning')
        .filter((_, n) => n % shared.tins.length === v)
        .map(s => tipped(onWall(s, rng.rand(-0.4, 0.4), 0.6, rng.rand(3.05, 3.5)), facing(s), -1.1)),
    ),
  );
  // the cages built out round the windows upstairs, full of what people keep in them
  shared.cages.forEach((map, v) =>
    add(
      new THREE.BoxGeometry(2.6, 1.4, 0.9),
      new THREE.MeshBasicMaterial({ map }),
      of('cage')
        .filter((_, n) => n % shared.cages.length === v)
        .map(s => pose(onWall(s, rng.rand(-0.5, 0.5), 0.45, rng.rand(4.1, 4.8)), facing(s))),
    ),
  );
  // washing on a pole pushed out from the wall: the pole, then three pieces, each its own colour
  const poles = of('laundry').map(s => ({ s, off: rng.rand(-1.2, 1.2), y: rng.rand(3.5, 4.3) })),
    clothColors: number[] = [];
  add(
    new THREE.BoxGeometry(0.04, 0.04, 2),
    flatMat(0x8d8a80),
    poles.map(p => pose(onWall(p.s, p.off, 1, p.y), facing(p.s))),
  );
  add(
    new THREE.PlaneGeometry(0.55, 0.8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    poles.flatMap(p =>
      [0.5, 1.1, 1.7].map(out => {
        clothColors.push(rng.pick(CLOTHS));
        return pose(onWall(p.s, p.off, out, p.y - 0.45), facing(p.s) + Math.PI / 2);
      }),
    ),
    clothColors,
  );
  // conduits run along the walls under the ceiling, two together
  add(
    new THREE.CylinderGeometry(0.07, 0.07, 4, 6),
    flatMat(0x3d3a37),
    of('duct').flatMap(s => {
      const y = rng.rand(5, 5.6);
      return [
        pose(onWall(s, 0, 0.12, y), facing(s), undefined, Math.PI / 2),
        pose(onWall(s, 0, 0.12, y - 0.22), facing(s), new THREE.Vector3(0.6, 1, 0.6), Math.PI / 2),
      ];
    }),
  );
  // electricity meters in a row, with the conduit that feeds them
  const meters = of('meter').map(s => ({ s, off: rng.rand(-1, 0.4), y: rng.rand(1.5, 1.9) }));
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
  // crates and tubs stacked against the walls (flat to them: nobody is kept from walking by)
  const crateColors: number[] = [];
  add(
    new THREE.BoxGeometry(0.75, 0.55, 0.4),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    of('stack').flatMap(s => {
      const off = rng.rand(-1.1, 1.1),
        high = rng.randi(1, 3);
      return Array.from({ length: high }, (_, k) => {
        crateColors.push(rng.pick(CRATES));
        return pose(onWall(s, off + rng.rand(-0.08, 0.08), 0.22, 0.28 + k * 0.56), facing(s) + rng.rand(-0.12, 0.12));
      });
    }),
    crateColors,
  );
  // cables slung under the ceiling, this way and that
  add(
    new THREE.BoxGeometry(4.6, 0.04, 0.04),
    flatMat(0x0f0d0e),
    of('cables')
      .filter(under)
      .flatMap(s =>
        [0, 1, 2].map(() =>
          tipped(
            new THREE.Vector3(
              tileCenter(s.i) + rng.rand(-1.5, 1.5),
              rng.rand(4.9, 5.7),
              tileCenter(s.j) + rng.rand(-1.5, 1.5),
            ),
            rng.pick([0, Math.PI / 2]) + rng.rand(-0.25, 0.25),
            0,
          ),
        ),
      ),
  );
  // strings of red lanterns across the alley: the wire, the lanterns on it, and their light on the ground
  const strings = of('lantern')
    .filter(under)
    .map(s => ({ x: tileCenter(s.i), z: tileCenter(s.j), turn: rng.pick([0, Math.PI / 2]), y: rng.rand(4.3, 4.9) }));
  add(
    new THREE.BoxGeometry(4, 0.03, 0.03),
    flatMat(0x0f0d0e),
    strings.map(l => pose(new THREE.Vector3(l.x, l.y + 0.2, l.z), l.turn)),
  );
  add(
    new THREE.SphereGeometry(0.16, 8, 6),
    flatMat(LANTERN_RED),
    strings.flatMap(l =>
      [-1.5, -0.75, 0, 0.75, 1.5].map(k =>
        pose(
          new THREE.Vector3(l.x + Math.cos(l.turn) * k, l.y, l.z - Math.sin(l.turn) * k),
          0,
          new THREE.Vector3(1, 1.25, 1),
        ),
      ),
    ),
  );
  strings.forEach(l => lights.push({ x: l.x, z: l.z, color: LANTERN_RED, size: 0.8 }));
  // a shop's neon hung out over the alley on two rods, read from both ways
  const hung2 = of('hangsign')
    .filter(under)
    .map((s, n) => ({
      x: tileCenter(s.i),
      z: tileCenter(s.j),
      turn: rng.pick([0, Math.PI / 2]),
      y: rng.rand(4.1, 4.6),
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
    flatMat(0x0f0d0e),
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
  // the light the lamps and the neon throw on the ground: a soft pool of their colour
  pools(lights, LAMP_POOL_OPACITY);
}
