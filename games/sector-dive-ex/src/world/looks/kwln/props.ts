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
const KWLN_PROPS: PropRule[] = [
  { id: 'neon', slots: ['wall'], blocks: false, count: [14, 20], gap: 2 },
  { id: 'pipes', slots: ['wall'], blocks: false, count: [16, 24], gap: 2 },
  { id: 'ac', slots: ['wall'], blocks: false, count: [6, 10], gap: 3 },
  { id: 'lamp', slots: ['floor', 'center', 'corridor'], blocks: false, count: [10, 14], gap: 3 },
];
const BOARD = { w: 3.5, h: 0.9, y: 4.75, out: 0.07, tilt: 0.1, chance: 0.8 }; // a shop's board (m, m, m, m, rad)
const NEON = { thick: 0.12, h: 2.5, out: 0.85, y: 4.2 }; // a neon sign standing out from a wall (m)
interface KwlnShared {
  ac: THREE.CanvasTexture;
  boards: THREE.CanvasTexture[];
  neons: THREE.CanvasTexture[];
}
let kwlnShared: KwlnShared | null = null;
// Signboards over the shutters, neon signs standing out from the walls with their colour on the ground, pipes and
// air conditioners on the walls, bare lamps on the ceiling
export function kwlnProps(plan: FloorPlan, group: THREE.Group, rng: Rng) {
  kwlnShared ??= {
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
  // the light the lamps and the neon throw on the ground: a soft pool of their colour
  pools(lights, LAMP_POOL_OPACITY);
}
