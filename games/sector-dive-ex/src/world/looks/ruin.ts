import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { SIDE_STEP, tileCenter } from '@engine/world/tiles.ts';
import type { PropRule } from '@engine/world/slots.ts';
import { WALL_H } from '../../data/level.ts';
import { RUIN_KEEP_OUT, RUIN_NOTICE_BOARD } from '../../i18n/signs.ts';
import type { FloorPlan } from '../building.ts';
import { WALL_PLAIN_SHARE, variantOf } from './common.ts';
import type { Look } from './common.ts';
import {
  DOOR_ASPECT,
  SIGN_FONT,
  TEX,
  WALL_ASPECT,
  grain,
  grime,
  oval,
  paint,
  poolTex,
  rowOf,
  smudge,
} from './paint.ts';
import type { Paint } from './paint.ts';
import { FULL_SIZE, LAMP_POOL, facing, lightMat, onWall, pose, propTools } from './props.ts';
import type { WallSlot } from './props.ts';
// The ruined streets (RUIN): the inside of a housing block that fell in long ago. Pale cracked mortar gone green at
// the foot, faded wallpaper, broken windows with the grey daylight behind them, ivy and grass, and what the people
// who lived here left. Nothing is lit: the only light is the day's, through the windows and the holes in the ceiling.
// ---- tuning numbers used only here ----
const DAY_POOL_OPACITY = 0.34; // the daylight on the ground under a window or a hole (kept faint: shots and pickups must stand out)
const WINDOW_POOL = { out: 1.9, wide: 0.42, deep: 0.56 }; // ... under a window: how far from the wall (m), its size (of LAMP_POOL)
const HOLE_POOL = 0.6; // ... under a hole in the ceiling (of LAMP_POOL)
// the wall pictures. The first three are the quiet ones; the rest catch the eye, and each of those is on about one
// wall in fifteen
const RUIN_WALLS = 10;
const WALL_STAINED = 1; // mortar with the damp in it
const WALL_BLOCKS = 2; // the mortar fallen off the blocks
const WALL_PAPER = 3; // wallpaper, half of it gone
const WALL_PAPER_BLUE = 4; // ... of another room
const WALL_WINDOW = 5; // a broken window
const WALL_IVY = 6; // ivy up the wall
const WALL_GRAFFITI = 7; // spray paint
const WALL_REBAR = 8; // a hole down to the reinforcing bars
const WALL_NOTICES = 9; // the residents' notice board
const QUIET_WALLS = [0, WALL_STAINED, WALL_BLOCKS, WALL_PAPER, WALL_PAPER_BLUE]; // the walls a shelf or a lamp may hang on
const RUIN_FLOORS = 6; // 0 bare, 1 what is left of the tiles, 2 ... of the floorboards, 3 grass in a crack, 4 a puddle, 5 crumbs of rubble
const LEAVES = ['#4f6d3b', '#5f7f47', '#3f5b31', '#718d55'];
const RUST = '#7c4a2b';
const TAPE_YELLOW = '#c7a52e';
const TAPE_BLACK = '#1d1f1a';
const DAYLIGHT = 0xd3e0c8; // the colour of the light the day throws on the ground

const pick = <V>(rand: () => number, list: V[]): V => list[Math.floor(rand() * list.length)]!;
// adds a ragged closed outline to the path being built (a hole, a patch, a stain)
function ragged(
  g: CanvasRenderingContext2D | Path2D,
  rand: () => number,
  x: number,
  y: number,
  rx: number,
  ry: number,
) {
  const n = 13;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2,
      r = 0.68 + rand() * 0.42;
    if (k) g.lineTo(x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r);
    else g.moveTo(x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r);
  }
  g.closePath();
}
// ... a rounded one (standing water)
function rounded(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, rx: number, ry: number) {
  const n = 9,
    at = Array.from({ length: n }, (_, k): [number, number] => {
      const a = (k / n) * Math.PI * 2,
        r = 0.74 + rand() * 0.34;
      return [x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r];
    }),
    mid = (k: number): [number, number] => [
      (at[k % n]![0] + at[(k + 1) % n]![0]) / 2,
      (at[k % n]![1] + at[(k + 1) % n]![1]) / 2,
    ];
  g.moveTo(...mid(0));
  for (let k = 1; k <= n; k++) g.quadraticCurveTo(...at[k % n]!, ...mid(k));
  g.closePath();
}
// a crack: a jagged line that wanders on from (x, y), with a branch or two
function crack(
  g: CanvasRenderingContext2D,
  rand: () => number,
  x: number,
  y: number,
  steps: number,
  dx: number,
  dy: number,
) {
  const branches: [number, number][] = [];
  const line = (sx: number, sy: number, n: number, bx: number, by: number, w: number) => {
    let cx = sx,
      cy = sy;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(cx, cy);
    for (let s = 0; s < n; s++) {
      cx += bx + (rand() - 0.5) * 12;
      cy += by + (rand() - 0.5) * 12;
      g.lineTo(cx, cy);
      if (w > 1 && rand() < 0.3) branches.push([cx, cy]);
    }
    g.stroke();
  };
  g.strokeStyle = 'rgba(28,32,24,.7)';
  line(x, y, steps, dx, dy, 1.6);
  branches.forEach(([bx, by]) => line(bx, by, 3, dy * 0.8 + dx * 0.4, dx * 0.8 + dy * 0.4, 0.9));
}
// one ivy leaf (round things on a wall or a door are painted flat by `aspect`)
function leaf(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, size: number, aspect: number) {
  g.save();
  g.translate(x, y);
  g.scale(1, aspect);
  g.rotate(rand() * Math.PI * 2);
  for (const [o, c] of [
    [1.4, 'rgba(18,26,14,.45)'],
    [0, pick(rand, LEAVES)],
  ] as [number, string][]) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(o, -size + o);
    g.quadraticCurveTo(size * 1.1 + o, -size * 0.3 + o, o, size + o);
    g.quadraticCurveTo(-size * 1.1 + o, -size * 0.3 + o, o, -size + o);
    g.fill();
  }
  g.strokeStyle = 'rgba(190,210,160,.3)';
  g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(0, -size * 0.8);
  g.lineTo(0, size * 0.8);
  g.stroke();
  g.restore();
}
// a strand of ivy from (x, y), `steps` leaves long, growing by (dx, dy) a step: the stem first, then its leaves
function creeper(
  g: CanvasRenderingContext2D,
  rand: () => number,
  [x, y]: [number, number],
  steps: number,
  [dx, dy]: [number, number],
  size: number,
  aspect: number,
) {
  const at: [number, number][] = [[x, y]];
  for (let s = 0; s < steps; s++) {
    const [px, py] = at[at.length - 1]!;
    at.push([px + dx + (rand() - 0.5) * size * 1.6, py + dy + (rand() - 0.5) * size * 0.6 * aspect]);
  }
  g.strokeStyle = 'rgba(52,44,30,.8)';
  g.lineWidth = 1.3;
  g.beginPath();
  at.forEach(([px, py], n) => (n ? g.lineTo(px, py) : g.moveTo(px, py)));
  g.stroke();
  at.forEach(([px, py], n) => {
    const s = size * (1 - (n / at.length) * 0.35);
    leaf(g, rand, px + (rand() - 0.5) * size * 1.7, py + (rand() - 0.5) * size * aspect, s, aspect);
    if (rand() < 0.55)
      leaf(g, rand, px + (rand() - 0.5) * size * 2.4, py + (rand() - 0.5) * size * aspect, s * 0.8, aspect);
  });
}
// damp running down a wall or a door from the top
function damp(g: CanvasRenderingContext2D, rand: () => number, n: number) {
  for (let k = 0; k < n; k++) {
    const len = 50 + rand() * 170,
      st = g.createLinearGradient(0, 0, 0, len);
    st.addColorStop(0, 'rgba(38,48,34,.42)');
    st.addColorStop(1, 'rgba(38,48,34,0)');
    g.fillStyle = st;
    g.fillRect(rand() * TEX, 0, 3 + rand() * 12, len);
  }
}
// moss and dirt at the foot of a wall or a door
function moss(g: CanvasRenderingContext2D, rand: () => number, from: number, strength: number) {
  const band = g.createLinearGradient(0, TEX * from, 0, TEX);
  band.addColorStop(0, 'rgba(58,78,44,0)');
  band.addColorStop(0.7, `rgba(58,78,44,${strength})`);
  band.addColorStop(1, `rgba(30,38,24,${strength + 0.2})`);
  g.fillStyle = band;
  g.fillRect(0, TEX * from, TEX, TEX * (1 - from));
  for (let k = 0; k < 90; k++) {
    g.fillStyle = rand() < 0.6 ? 'rgba(84,110,60,.5)' : 'rgba(34,46,28,.5)';
    const y = TEX - rand() * rand() * TEX * (1 - from);
    g.fillRect(rand() * TEX, y, 2 + rand() * 7, 1 + rand() * 2.5);
  }
}
// pale cracked mortar over the whole picture
function mortar(g: CanvasRenderingContext2D, rand: () => number) {
  const bg = g.createLinearGradient(0, 0, 0, TEX);
  bg.addColorStop(0, '#858c7b');
  bg.addColorStop(0.7, '#7b8272');
  bg.addColorStop(1, '#666d5d');
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 150, '#9da492', '#3d4337');
}
// faded wallpaper from the ceiling down to the skirting, torn away in places (the mortar shows there)
function wallpaper(g: CanvasRenderingContext2D, rand: () => number, blue: boolean) {
  const top = 0,
    foot = rowOf(0.55);
  g.save();
  g.beginPath();
  g.rect(0, top, TEX, foot - top);
  // the torn places: holes in what is painted next
  for (let k = 0; k < (blue ? 6 : 4); k++)
    ragged(g, rand, rand() * TEX, top + rand() * (foot - top), 22 + rand() * 46, 14 + rand() * 34);
  // ... along the foot and down both edges, so that it does not end in a straight line
  for (let ex = 0; ex < TEX; ex += 34) ragged(g, rand, ex + rand() * 20, foot + 4, 16 + rand() * 22, 8 + rand() * 20);
  for (const ex of [-6, TEX + 6])
    for (let ey = -10; ey < foot; ey += 30) ragged(g, rand, ex, ey + rand() * 14, 12 + rand() * 20, 22 + rand() * 10);
  g.clip('evenodd');
  g.fillStyle = blue ? '#7f8f8c' : '#a39d83';
  g.fillRect(0, top, TEX, foot - top);
  // its pattern: stripes, and a small flower between them
  for (let x = 8; x < TEX; x += 32) {
    g.fillStyle = blue ? 'rgba(54,70,72,.3)' : 'rgba(120,96,64,.3)';
    g.fillRect(x, top, 5, foot - top);
    g.fillRect(x + 9, top, 1.5, foot - top);
    g.fillStyle = blue ? 'rgba(200,214,206,.35)' : 'rgba(134,84,70,.4)';
    for (let y = top + 10; y < foot; y += 20) oval(g, x + 21, y, 3, 3 * WALL_ASPECT);
  }
  grime(g, rand, 70, '#b9b49c', '#3c4034');
  // the paper has yellowed and the damp has got under it
  for (let k = 0; k < 7; k++) {
    g.fillStyle = `rgba(96,84,48,${0.1 + rand() * 0.14})`;
    oval(g, rand() * TEX, top + rand() * (foot - top), 14 + rand() * 40, 8 + rand() * 22);
  }
  g.restore();
}
// concrete blocks where the mortar has come off
function blocks(g: CanvasRenderingContext2D, rand: () => number) {
  const bare = new Path2D();
  ragged(bare, rand, 150, rowOf(1.9), 120, 74);
  ragged(bare, rand, 60, rowOf(4.3), 46, 26);
  g.save();
  g.clip(bare);
  g.fillStyle = '#4b4f45';
  g.fillRect(0, 0, TEX, TEX);
  const bw = 40,
    bh = 13;
  for (let row = 0, y = 0; y < TEX; row++, y += bh)
    for (let x = row % 2 ? -bw / 2 : 0; x < TEX; x += bw) {
      const v = 96 + Math.floor(rand() * 26);
      g.fillStyle = `rgb(${v},${v + 3},${v - 9})`;
      g.fillRect(x, y, bw - 2, bh - 2);
      g.fillStyle = 'rgba(232,236,214,.14)';
      g.fillRect(x, y, bw - 2, 1.5);
    }
  g.restore();
  // the broken edge of the mortar round them
  g.strokeStyle = 'rgba(30,34,26,.55)';
  g.lineWidth = 2;
  g.stroke(bare);
}
// A broken window: the grey day outside and the block across the street, what is left of the glass, a rusty frame
function brokenWindow(g: CanvasRenderingContext2D, rand: () => number) {
  const x = 52,
    w = TEX - 104,
    y = rowOf(3.7),
    h = rowOf(1.35) - y;
  // the daylight on the wall round it
  g.globalCompositeOperation = 'lighter';
  const spill = g.createRadialGradient(TEX / 2, y + h / 2, 30, TEX / 2, y + h / 2, 150);
  spill.addColorStop(0, 'rgba(190,206,176,.22)');
  spill.addColorStop(1, 'rgba(190,206,176,0)');
  g.fillStyle = spill;
  g.fillRect(0, 0, TEX, TEX);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#3f4339';
  g.fillRect(x - 7, y - 5, w + 14, h + 10);
  const sky = g.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, '#b9c5b0');
  sky.addColorStop(0.6, '#a3b29c');
  sky.addColorStop(1, '#8c9b86');
  g.fillStyle = sky;
  g.fillRect(x, y, w, h);
  // the block across the street, its own windows empty, and the trees that have come up in front of it
  g.fillStyle = '#7d8a7a';
  g.fillRect(x + 18, y + h * 0.3, 62, h * 0.7);
  g.fillRect(x + 96, y + h * 0.48, 56, h * 0.52);
  g.fillStyle = 'rgba(56,66,56,.6)';
  for (let wy = y + h * 0.36; wy < y + h - 8; wy += 11)
    for (let wx = x + 25; wx < x + 76; wx += 14) g.fillRect(wx, wy, 7, 5);
  g.fillStyle = '#5d7155';
  for (let k = 0; k < 9; k++) oval(g, x + rand() * w, y + h - rand() * 12, 12 + rand() * 20, 6 + rand() * 9);
  // the glass that is left: dirty panes, with the shards standing in the frame
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  for (let k = 0; k < 7; k++) {
    const sx = x + rand() * w,
      up = rand() < 0.5,
      sy = up ? y + h : y,
      len = (14 + rand() * 40) * (up ? -1 : 1);
    g.fillStyle = `rgba(70,84,72,${0.45 + rand() * 0.3})`;
    g.beginPath();
    g.moveTo(sx - 12 - rand() * 22, sy);
    g.lineTo(sx + (rand() - 0.5) * 16, sy + len);
    g.lineTo(sx + 12 + rand() * 22, sy);
    g.fill();
  }
  g.fillStyle = 'rgba(70,84,72,.6)';
  g.fillRect(x, y, w / 2, h / 2); // one pane is whole
  g.strokeStyle = 'rgba(226,234,214,.5)';
  g.lineWidth = 0.8;
  crackLines(g, rand, x + w * 0.3, y + h * 0.3, 5, 28);
  g.restore();
  // the frame: a cross of bars
  g.fillStyle = '#4a4e43';
  g.fillRect(x + w / 2 - 3, y, 6, h);
  g.fillRect(x, y + h / 2 - 2, w, 4);
  g.fillStyle = 'rgba(124,74,43,.55)';
  g.fillRect(x + w / 2 - 3, y + h * 0.6, 6, h * 0.4);
  // the sill, and the rain that has run down the wall from it
  g.fillStyle = '#585c50';
  g.fillRect(x - 11, y + h + 4, w + 22, 6);
  for (let k = 0; k < 6; k++) {
    const sx = x + rand() * w,
      len = 30 + rand() * 60,
      st = g.createLinearGradient(0, y + h + 10, 0, y + h + 10 + len);
    st.addColorStop(0, 'rgba(34,44,30,.5)');
    st.addColorStop(1, 'rgba(34,44,30,0)');
    g.fillStyle = st;
    g.fillRect(sx, y + h + 10, 3 + rand() * 8, len);
  }
  creeper(g, rand, [x + w + 2, y + h + 6], 9, [-5, -9], 6, WALL_ASPECT);
}
// the cracks of a pane of glass: lines out from a point
function crackLines(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, n: number, len: number) {
  for (let k = 0; k < n; k++) {
    const a = rand() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.4);
    g.lineTo(x + Math.cos(a + 0.2) * len, y + Math.sin(a + 0.2) * len * 0.7);
    g.stroke();
  }
}
// spray paint: loops and scrawls, no words
function graffiti(g: CanvasRenderingContext2D, rand: () => number) {
  const top = rowOf(2.9),
    foot = rowOf(0.9);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [c, w, n] of [
    ['rgba(132,58,48,.8)', 6, 2],
    ['rgba(210,212,196,.7)', 4, 2],
    ['rgba(34,38,34,.8)', 5, 2],
  ] as [string, number, number][])
    for (let k = 0; k < n; k++) {
      let x = 24 + rand() * 150,
        y = top + rand() * (foot - top);
      g.strokeStyle = c;
      g.shadowColor = c;
      g.shadowBlur = 5;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        const nx = Math.min(TEX - 20, Math.max(20, x + (rand() - 0.3) * 70)),
          ny = Math.min(foot, Math.max(top, y + (rand() - 0.5) * 60));
        g.quadraticCurveTo(x + (rand() - 0.5) * 80, y + (rand() - 0.5) * 50, nx, ny);
        x = nx;
        y = ny;
      }
      g.stroke();
      // the paint ran
      g.shadowBlur = 0;
      g.fillStyle = c;
      g.fillRect(x - 1, y, 2, 10 + rand() * 26);
    }
  g.shadowBlur = 0;
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
}
// a hole in the wall down to the concrete and its reinforcing bars, the rubble's dust below it
function rebarHole(g: CanvasRenderingContext2D, rand: () => number) {
  const cx = 122,
    cy = rowOf(2.5);
  const hole = new Path2D();
  ragged(hole, rand, cx, cy, 86, 62);
  g.save();
  g.clip(hole);
  g.fillStyle = '#3a3d35';
  g.fillRect(0, 0, TEX, TEX);
  for (let k = 0; k < 260; k++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(120,124,108,.5)' : 'rgba(18,20,16,.5)';
    g.fillRect(rand() * TEX, cy - 70 + rand() * 140, 1 + rand() * 4, 1 + rand() * 3);
  }
  // the bars: a grid, bent where the wall gave
  for (let n = 0; n < 6; n++) {
    const bx = cx - 84 + n * 32 + rand() * 6;
    g.strokeStyle = 'rgba(0,0,0,.5)';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(bx + 2, 0);
    g.quadraticCurveTo(bx + 2 + (rand() - 0.5) * 30, cy, bx + 2, TEX);
    g.stroke();
    g.strokeStyle = RUST;
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(bx, 0);
    g.quadraticCurveTo(bx + (rand() - 0.5) * 30, cy, bx, TEX);
    g.stroke();
  }
  for (let n = 0; n < 5; n++) {
    const by = cy - 52 + n * 26;
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.fillRect(0, by + 2, TEX, 3);
    g.fillStyle = '#8b5a36';
    g.fillRect(0, by, TEX, 2.5);
  }
  g.restore();
  g.strokeStyle = 'rgba(176,182,162,.6)'; // the broken edge of the mortar
  g.lineWidth = 2.5;
  g.stroke(hole);
  // rust has run down from the bars
  for (let k = 0; k < 6; k++) {
    const len = 40 + rand() * 70,
      y = cy + 44 + rand() * 12,
      st = g.createLinearGradient(0, y, 0, y + len);
    st.addColorStop(0, 'rgba(124,74,43,.5)');
    st.addColorStop(1, 'rgba(124,74,43,0)');
    g.fillStyle = st;
    g.fillRect(cx - 70 + rand() * 140, y, 3 + rand() * 7, len);
  }
}
// the residents' notice board: a framed board with a few sheets still pinned to it
function noticeBoard(g: CanvasRenderingContext2D, rand: () => number) {
  const x = 44,
    w = TEX - 88,
    y = rowOf(2.75),
    h = rowOf(1.25) - y;
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.fillRect(x + 3, y + 3, w, h);
  g.fillStyle = '#6a5b44';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#566050';
  g.fillRect(x + 6, y + 14, w - 12, h - 18);
  // its name on the frame's head
  g.fillStyle = '#c4bda2';
  g.fillRect(x + w / 2 - 34, y + 2, 68, 10);
  g.fillStyle = '#3a3a30';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(x + w / 2, y + 7.5);
  g.scale(1, WALL_ASPECT);
  g.font = `900 13px ${SIGN_FONT}`;
  g.fillText(RUIN_NOTICE_BOARD, 0, 0, 60);
  g.restore();
  // the sheets: lines of writing nobody reads, a corner curled or torn off
  const paper = ['#c9c4ad', '#b8b296', '#a8ae9c', '#bfa98c'];
  for (let k = 0; k < 5; k++) {
    const px = x + 12 + k * 31 + rand() * 6,
      py = y + 18 + rand() * 12,
      pw = 22 + rand() * 6,
      ph = 22 + rand() * 12;
    g.save();
    g.translate(px + pw / 2, py);
    g.rotate((rand() - 0.5) * 0.3);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(-pw / 2 + 1.5, 1.5, pw, ph);
    g.fillStyle = pick(rand, paper);
    g.fillRect(-pw / 2, 0, pw, ph);
    g.fillStyle = 'rgba(52,50,42,.6)';
    for (let l = 0; l < 4; l++) g.fillRect(-pw / 2 + 3, 6 + l * 4.5, (pw - 6) * (0.4 + rand() * 0.6), 1.3);
    g.fillStyle = '#566050';
    g.beginPath();
    g.moveTo(pw / 2, ph);
    g.lineTo(pw / 2 - 5 - rand() * 8, ph);
    g.lineTo(pw / 2, ph - 5 - rand() * 8);
    g.fill();
    g.fillStyle = '#8a3b30';
    oval(g, 0, 2.5, 1.6, 1.6 * WALL_ASPECT);
    g.restore();
  }
  // one has fallen half off
  g.fillStyle = 'rgba(0,0,0,.3)';
  g.fillRect(x + 52, y + h + 5, 30, 18);
  g.save();
  g.translate(x + 64, y + h - 4);
  g.rotate(0.5);
  g.fillStyle = '#b8b296';
  g.fillRect(-14, 0, 28, 24);
  g.restore();
}
const ruinWall =
  (variant: number): Paint =>
  (g, rand) => {
    mortar(g, rand);
    damp(g, rand, variant === WALL_STAINED ? 16 : 7);
    // cracks: one from the top on every wall, more on the bare ones
    crack(g, rand, 30 + rand() * 190, 0, 8, 0, 13);
    if (variant < WALL_PAPER) {
      crack(g, rand, 20 + rand() * 60, rowOf(1 + rand() * 3), 7, 16, -3);
      crack(g, rand, 120 + rand() * 100, TEX, 6, 0, -12);
    }
    if (variant === WALL_STAINED) {
      // the damp has come through in dark patches
      for (let k = 0; k < 5; k++) {
        g.fillStyle = `rgba(44,54,40,${0.14 + rand() * 0.14})`;
        g.beginPath();
        ragged(g, rand, rand() * TEX, rand() * TEX * 0.8, 24 + rand() * 50, 16 + rand() * 40);
        g.fill();
      }
    } else if (variant === WALL_BLOCKS) blocks(g, rand);
    else if (variant === WALL_PAPER || variant === WALL_PAPER_BLUE) wallpaper(g, rand, variant === WALL_PAPER_BLUE);
    else if (variant === WALL_WINDOW) brokenWindow(g, rand);
    else if (variant === WALL_IVY) {
      // up from the ground and down from the top, thickest low down
      for (let k = 0; k < 9; k++)
        creeper(g, rand, [10 + rand() * 236, TEX], 8 + rand() * 20, [(rand() - 0.5) * 5, -8], 6, WALL_ASPECT);
      for (let k = 0; k < 4; k++)
        creeper(g, rand, [rand() * TEX, 0], 5 + rand() * 9, [(rand() - 0.5) * 4, 8], 5.5, WALL_ASPECT);
    } else if (variant === WALL_GRAFFITI) graffiti(g, rand);
    else if (variant === WALL_REBAR) rebarHole(g, rand);
    else if (variant === WALL_NOTICES) noticeBoard(g, rand);
    moss(g, rand, 0.78, variant === WALL_IVY ? 0.55 : 0.4);
    grain(g, rand, 20);
  };

// a tuft of grass seen from above: blades out from a point
function tuft(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, size: number) {
  g.lineCap = 'round';
  for (let k = 0; k < 11; k++) {
    const a = rand() * Math.PI * 2,
      len = size * (0.5 + rand() * 0.6);
    g.strokeStyle = pick(rand, LEAVES);
    g.lineWidth = 1.2 + rand() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      x + Math.cos(a) * len * 0.6,
      y + Math.sin(a) * len * 0.6 - 2,
      x + Math.cos(a + 0.4) * len,
      y + Math.sin(a + 0.4) * len,
    );
    g.stroke();
  }
  g.lineCap = 'butt';
}
// a broken bit of concrete lying on the ground, with its shadow
function chunk(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, r: number) {
  const v = 104 + Math.floor(rand() * 44);
  g.fillStyle = 'rgba(20,22,18,.5)';
  g.beginPath();
  ragged(g, rand, x + r * 0.25, y + r * 0.3, r, r * 0.8);
  g.fill();
  g.fillStyle = `rgb(${v},${v + 2},${v - 10})`;
  g.beginPath();
  ragged(g, rand, x, y, r, r * 0.8);
  g.fill();
  g.fillStyle = 'rgba(232,236,214,.2)';
  g.beginPath();
  ragged(g, rand, x - r * 0.2, y - r * 0.2, r * 0.5, r * 0.4);
  g.fill();
}
// The ground: the same dusty slab under every variant (the painter is given the same seed for all of them), with
// soft patches that run on across the picture's edge, so the floor reads as one surface and not as tiles. What a
// variant adds stays clear of the edge
const ruinFloor =
  (variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = '#5f6156';
    g.fillRect(0, 0, TEX, TEX);
    for (let k = 0; k < 50; k++) {
      const tone = rand();
      smudge(
        g,
        rand() * TEX,
        rand() * TEX,
        14 + rand() * 46,
        10 + rand() * 30,
        tone < 0.4 ? '34,38,30' : tone < 0.75 ? '132,134,116' : '70,88,56',
        0.1 + rand() * 0.18,
      );
    }
    // dust and grit
    for (let k = 0; k < 170; k++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(26,28,22,.5)' : 'rgba(168,170,150,.34)';
      g.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 2.5, 1 + rand() * 2.5);
    }
    crack(g, rand, 60 + rand() * 40, 60 + rand() * 40, 5, 12, 9);
    if (variant === 1) {
      // what is left of the tiles: the ones in the middle are still down, the rest have gone
      const size = 30,
        x0 = 38,
        y0 = 38;
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 6; c++) {
          const far = Math.hypot(c - 2.5, r - 2.5) / 3.6;
          if (rand() < far * far) continue;
          const x = x0 + c * size,
            y = y0 + r * size;
          g.fillStyle = '#2f322b';
          g.fillRect(x, y, size, size);
          g.fillStyle = (r + c) % 2 ? '#8f9280' : '#67776c';
          g.fillRect(x + 1, y + 1, size - 2, size - 2);
          g.fillStyle = `rgba(30,34,26,${rand() * 0.3})`;
          g.fillRect(x + 1, y + 1, size - 2, size - 2);
          if (rand() < 0.3) {
            g.strokeStyle = 'rgba(28,32,24,.7)';
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(x + rand() * size, y + 1);
            g.lineTo(x + rand() * size, y + size - 1);
            g.stroke();
          }
        }
    } else if (variant === 2) {
      // what is left of the floorboards: broken off short at both ends
      for (let b = 0; b < 7; b++) {
        if (rand() < 0.15) continue;
        const y = 50 + b * 22,
          x = 30 + rand() * 40,
          w = TEX - 60 - x - rand() * 40 + 30;
        g.fillStyle = 'rgba(18,20,16,.55)';
        g.fillRect(x + 2, y + 2, w, 20);
        g.fillStyle = pick(rand, ['#6b5b45', '#5e5140', '#75654c', '#544938']);
        g.fillRect(x, y, w, 20);
        g.fillStyle = 'rgba(228,214,180,.14)';
        g.fillRect(x, y, w, 1.5);
        g.fillStyle = 'rgba(28,24,18,.35)';
        for (let l = 0; l < 3; l++) g.fillRect(x + rand() * w * 0.5, y + 4 + l * 6, w * (0.2 + rand() * 0.3), 1);
        // the broken ends
        g.fillStyle = '#5f6156';
        for (const ex of [x, x + w]) {
          g.beginPath();
          g.moveTo(ex - 6, y - 1);
          g.lineTo(ex + (rand() - 0.5) * 12, y + 7);
          g.lineTo(ex + (rand() - 0.5) * 12, y + 14);
          g.lineTo(ex - 6 + rand() * 12, y + 21);
          g.lineTo(ex + (ex === x ? -8 : 8), y + 21);
          g.lineTo(ex + (ex === x ? -8 : 8), y - 1);
          g.fill();
        }
      }
    } else if (variant === 3) {
      // grass has come up through a crack
      let x = 44 + rand() * 30,
        y = 60 + rand() * 40;
      for (let s = 0; s < 9; s++) {
        smudge(g, x, y, 20, 16, '60,84,46', 0.4);
        tuft(g, rand, x + (rand() - 0.5) * 10, y + (rand() - 0.5) * 10, 13 + rand() * 8);
        if (rand() < 0.6) tuft(g, rand, x + (rand() - 0.5) * 34, y + (rand() - 0.5) * 34, 8 + rand() * 6);
        x = Math.min(TEX - 44, x + 12 + rand() * 12);
        y = Math.min(TEX - 44, Math.max(44, y + (rand() - 0.4) * 26));
      }
    } else if (variant === 4) {
      // rain water standing in a hollow, the grey sky in it
      const cx = 104 + rand() * 48,
        cy = 104 + rand() * 48;
      smudge(g, cx, cy, 96, 70, '26,32,24', 0.7); // the wet earth round it
      g.save();
      g.beginPath();
      rounded(g, rand, cx, cy, 66, 44);
      g.clip();
      const water = g.createLinearGradient(0, cy - 50, 0, cy + 50);
      water.addColorStop(0, '#3c4841');
      water.addColorStop(1, '#5d6c62');
      g.fillStyle = water;
      g.fillRect(0, 0, TEX, TEX);
      g.fillStyle = 'rgba(176,192,174,.1)';
      for (let k = 0; k < 5; k++) g.fillRect(cx - 50 + rand() * 70, cy - 30 + rand() * 60, 20 + rand() * 30, 1.5);
      g.restore();
      g.strokeStyle = 'rgba(20,24,18,.5)';
      g.lineWidth = 2;
      g.stroke();
    } else if (variant === 5) {
      // crumbs of rubble where a bit of the ceiling came down
      for (let k = 0; k < 26; k++) {
        const a = rand() * Math.PI * 2,
          d = rand() * 76;
        chunk(g, rand, TEX / 2 + Math.cos(a) * d, TEX / 2 + Math.sin(a) * d, 4 + rand() * 9 * (1 - d / 110));
      }
    }
    grain(g, rand, 18);
  };
// The top of a deck, a ramp or a heap of rubble (cover has this on top too): broken concrete, slabs lying where they
// fell, with a bar or two sticking out. Paler at the rim, so where a deck ends shows
const ruinDeck: Paint = (g, rand) => {
  g.fillStyle = '#4a4d44';
  g.fillRect(0, 0, TEX, TEX);
  // slabs, big ones first and the small ones over them
  for (let k = 0; k < 44; k++) {
    const r = k < 16 ? 34 + rand() * 30 : 9 + rand() * 16,
      x = rand() * TEX,
      y = rand() * TEX,
      v = 90 + Math.floor(rand() * 22);
    g.fillStyle = 'rgba(16,18,14,.32)';
    g.beginPath();
    ragged(g, rand, x + 3, y + 3, r, r * 0.8);
    g.fill();
    g.fillStyle = `rgb(${v},${v + 3},${v - 10})`;
    g.beginPath();
    ragged(g, rand, x, y, r, r * 0.8);
    g.fill();
    g.strokeStyle = 'rgba(236,240,220,.1)';
    g.lineWidth = 1.2;
    g.stroke();
  }
  for (let k = 0; k < 2; k++) {
    const x = 30 + rand() * (TEX - 60),
      y = 30 + rand() * (TEX - 60),
      a = rand() * Math.PI;
    g.strokeStyle = 'rgba(0,0,0,.5)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x + 1.5, y + 1.5);
    g.lineTo(x + 1.5 + Math.cos(a) * 28, y + 1.5 + Math.sin(a) * 28);
    g.stroke();
    g.strokeStyle = 'rgba(92,62,42,.9)'; // dull, so that it is not taken for something to pick up
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * 28, y + Math.sin(a) * 28);
    g.stroke();
  }
  grime(g, rand, 50, '#a6aa98', '#2a2d26');
  // the rim: dust, and the edge broken away
  g.strokeStyle = 'rgba(178,182,164,.3)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, TEX - 6, TEX - 6);
  for (let k = 0; k < 18; k++) {
    const along = rand() * TEX,
      side = Math.floor(rand() * 4);
    g.fillStyle = 'rgba(40,44,36,.7)';
    g.beginPath();
    ragged(
      g,
      rand,
      side < 2 ? along : side === 2 ? 2 : TEX - 2,
      side >= 2 ? along : side ? TEX - 2 : 2,
      5 + rand() * 7,
      5 + rand() * 7,
    );
    g.fill();
  }
  grain(g, rand, 18);
};
// The ceiling from below: sagging boards, some of them down (the dark of the roof space and its laths behind), one
// beam that runs on from tile to tile, and the damp
const ruinCeiling: Paint = (g, rand) => {
  g.fillStyle = '#4c5147';
  g.fillRect(0, 0, TEX, TEX);
  const size = TEX / 4;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      const x = c * size,
        y = r * size,
        gone = r === 1 && c === 2;
      if (gone) {
        g.fillStyle = '#262a23';
        g.fillRect(x, y, size, size);
        g.fillStyle = '#39352a';
        for (let l = 6; l < size; l += 13) g.fillRect(x, y + l, size, 4);
        // what is left of the board hangs by a corner
        g.fillStyle = '#434840';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + size * (0.4 + rand() * 0.4), y);
        g.lineTo(x, y + size * (0.4 + rand() * 0.4));
        g.fill();
        continue;
      }
      g.fillStyle = `rgba(${rand() < 0.5 ? '20,24,18' : '120,126,110'},${rand() * 0.16})`;
      g.fillRect(x, y, size, size);
      g.fillStyle = 'rgba(14,16,12,.45)';
      g.fillRect(x, y, size, 1.5);
      g.fillRect(x, y, 1.5, size);
    }
  grime(g, rand, 70, '#6a7062', '#141612');
  for (let k = 0; k < 5; k++) {
    g.fillStyle = `rgba(72,62,36,${0.12 + rand() * 0.14})`;
    g.beginPath();
    ragged(g, rand, rand() * TEX, rand() * TEX, 18 + rand() * 30, 14 + rand() * 24);
    g.fill();
  }
  // the beam
  const at = TEX / 2 - 15;
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.fillRect(0, at - 4, TEX, 38);
  g.fillStyle = '#585646';
  g.fillRect(0, at, TEX, 30);
  g.fillStyle = 'rgba(226,226,196,.2)';
  g.fillRect(0, at, TEX, 2.5);
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.fillRect(0, at + 27, TEX, 3);
  grain(g, rand, 14);
};
// a patch of rust, and what has run down from it
function rustPatch(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, r: number) {
  g.fillStyle = `rgba(112,72,46,${0.3 + rand() * 0.3})`;
  g.beginPath();
  ragged(g, rand, x, y, r, r * (0.2 + rand() * 0.5));
  g.fill();
  const len = 14 + rand() * 30,
    st = g.createLinearGradient(0, y, 0, y + len);
  st.addColorStop(0, 'rgba(124,74,43,.5)');
  st.addColorStop(1, 'rgba(124,74,43,0)');
  g.fillStyle = st;
  g.fillRect(x - r * 0.5, y, r, len);
}
// warning tape between two points: black and yellow
function tape(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, half: number) {
  g.save();
  g.beginPath();
  g.moveTo(x0, y0 - half);
  g.lineTo(x1, y1 - half);
  g.lineTo(x1, y1 + half);
  g.lineTo(x0, y0 + half);
  g.closePath();
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.fill();
  g.clip();
  g.fillStyle = TAPE_YELLOW;
  g.fillRect(0, 0, TEX, TEX);
  g.fillStyle = TAPE_BLACK;
  for (let x = -TEX; x < TEX * 2; x += 36) {
    g.beginPath();
    g.moveTo(x, TEX);
    g.lineTo(x + 18, TEX);
    g.lineTo(x + 18 + 60, 0);
    g.lineTo(x + 60, 0);
    g.fill();
  }
  g.restore();
}
// One leaf of a flat's steel door (a leaf is 2 m wide and a wall high, so its picture is stretched three times as
// tall): cream paint coming off the rust, a wired pane, a slot for the post, a vent at the foot. The boss room's has
// been shut for good: red lead paint, boards nailed across it, warning tape, and a plate that says to keep out. All
// of that is below the height of the door's "BOSS" label (world/doors.ts BOSS_LABEL_Y), which hangs in front of the
// door and so covers the part above it from where the player stands
const ruinDoor =
  (boss: boolean): Paint =>
  (g, rand) => {
    const steel = g.createLinearGradient(0, 0, TEX, 0);
    steel.addColorStop(0, boss ? '#5a2f25' : '#8f8b74');
    steel.addColorStop(0.5, boss ? '#6c3a2d' : '#a09b82');
    steel.addColorStop(1, boss ? '#4f2920' : '#858069');
    g.fillStyle = steel;
    g.fillRect(0, 0, TEX, TEX);
    grime(g, rand, 110, boss ? '#8a5444' : '#b4b098', '#23241d');
    // the pressed panels of the leaf, and its frame
    g.strokeStyle = 'rgba(0,0,0,.3)';
    g.lineWidth = 2;
    for (const [top, foot] of [
      [5.5, 3.3],
      [2.9, 0.95],
    ] as [number, number][]) {
      g.strokeRect(30, rowOf(top), TEX - 60, rowOf(foot) - rowOf(top));
      g.fillStyle = 'rgba(255,250,225,.12)';
      g.fillRect(31, rowOf(top) + 1.5, TEX - 62, 1.2);
    }
    g.fillStyle = boss ? '#3a1e18' : '#5e5c4c';
    g.fillRect(0, 0, 12, TEX);
    g.fillRect(TEX - 12, 0, 12, TEX);
    g.fillRect(0, 0, TEX, 5);
    // where the paint has come off: rust, and its runs
    for (let k = 0; k < (boss ? 9 : 12); k++) {
      // most of it along the edges and low down
      const edge = rand() < 0.6;
      rustPatch(
        g,
        rand,
        edge ? pick(rand, [18, TEX - 18]) + (rand() - 0.5) * 30 : 16 + rand() * (TEX - 32),
        edge ? rand() * TEX : TEX * (0.5 + rand() * 0.5),
        5 + rand() * 22,
      );
    }
    // dents
    for (let k = 0; k < 4; k++) {
      const x = 40 + rand() * (TEX - 80),
        y = rowOf(0.6 + rand() * 2.6),
        r = 12 + rand() * 12,
        dent = g.createRadialGradient(x, y, 1, x, y, r);
      dent.addColorStop(0, 'rgba(0,0,0,.3)');
      dent.addColorStop(0.7, 'rgba(0,0,0,.08)');
      dent.addColorStop(1, 'rgba(255,250,225,.1)');
      g.fillStyle = dent;
      oval(g, x, y, r, r * DOOR_ASPECT * 1.6);
    }
    if (boss) {
      // tape across it both ways, the plate over the tape, boards nailed over the lot
      tape(g, 12, rowOf(3.05), TEX - 12, rowOf(0.5), 5);
      tape(g, 12, rowOf(0.5), TEX - 12, rowOf(3.05), 5);
      const top = rowOf(2.95),
        foot = rowOf(0.95),
        x = 86,
        w = TEX - 172;
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(x + 3, top + 1.5, w, foot - top);
      g.fillStyle = '#cfc9b2';
      g.fillRect(x, top, w, foot - top);
      g.strokeStyle = '#9f2a1e';
      g.lineWidth = 5;
      g.strokeRect(x + 6, top + 2.5, w - 12, foot - top - 5);
      g.fillStyle = '#9f2a1e';
      g.font = `900 62px ${SIGN_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.save();
      g.scale(1, DOOR_ASPECT);
      const step = (foot - top - 8) / RUIN_KEEP_OUT.length;
      [...RUIN_KEEP_OUT].forEach((ch, n) => g.fillText(ch, TEX / 2, (top + 4 + step * (n + 0.5)) / DOOR_ASPECT + 3));
      g.restore();
      g.fillStyle = 'rgba(60,40,24,.25)'; // the plate is dirty too
      g.fillRect(x, top + (foot - top) * 0.7, w, (foot - top) * 0.3);
      for (const [m, tilt] of [
        [3.3, 0.02],
        [0.62, -0.025],
        [5.2, -0.015],
      ] as [number, number][]) {
        g.save();
        g.translate(TEX / 2, rowOf(m));
        g.rotate(tilt);
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillRect(-TEX / 2, -4, TEX, 12);
        g.fillStyle = '#84745a';
        g.fillRect(-TEX / 2, -6, TEX, 12);
        g.fillStyle = 'rgba(40,30,18,.4)';
        for (let l = 0; l < 3; l++) g.fillRect(-TEX / 2 + rand() * 120, -4 + l * 3.5, 60 + rand() * 80, 0.8);
        g.fillStyle = 'rgba(236,224,190,.2)';
        g.fillRect(-TEX / 2, -6, TEX, 1.2);
        g.fillStyle = '#23241d';
        for (const nx of [-104, -88, 88, 104]) oval(g, nx, 0, 2.6, 2.6 * DOOR_ASPECT);
        g.restore();
      }
    } else {
      // a wired pane at eye height: grey glass, cracked
      const wx = 84,
        ww = TEX - 168,
        wy = rowOf(2.25),
        wh = rowOf(1.55) - wy;
      g.fillStyle = '#4c4b3e';
      g.fillRect(wx - 6, wy - 2, ww + 12, wh + 4);
      const glass = g.createLinearGradient(0, wy, 0, wy + wh);
      glass.addColorStop(0, '#6f7a6c');
      glass.addColorStop(1, '#515a50');
      g.fillStyle = glass;
      g.fillRect(wx, wy, ww, wh);
      g.strokeStyle = 'rgba(24,26,20,.5)';
      g.lineWidth = 1;
      for (let x = wx + 11; x < wx + ww; x += 11) {
        g.beginPath();
        g.moveTo(x, wy);
        g.lineTo(x, wy + wh);
        g.stroke();
      }
      for (let y = wy + 3.7; y < wy + wh; y += 3.7) {
        g.beginPath();
        g.moveTo(wx, y);
        g.lineTo(wx + ww, y);
        g.stroke();
      }
      g.strokeStyle = 'rgba(220,228,208,.5)';
      crackLines(g, rand, wx + ww * 0.6, wy + wh * 0.5, 5, 30);
      // the slot for the post, a handle, the vent at the foot
      g.fillStyle = '#4c4b3e';
      g.fillRect(TEX / 2 - 30, rowOf(1.2), 60, 4.5);
      g.fillStyle = '#23241d';
      g.fillRect(TEX / 2 - 24, rowOf(1.2) + 1.5, 48, 1.5);
      g.fillStyle = '#4c4b3e';
      g.fillRect(26, rowOf(1.12), 26, 9);
      g.fillStyle = '#23241d';
      g.fillRect(31, rowOf(1.12) + 3.5, 30, 2.2);
      for (let l = 0; l < 5; l++) {
        g.fillStyle = 'rgba(0,0,0,.5)';
        g.fillRect(56, rowOf(0.72) + l * 3.4, TEX - 112, 1.6);
        g.fillStyle = 'rgba(255,250,225,.14)';
        g.fillRect(56, rowOf(0.72) + l * 3.4 + 1.6, TEX - 112, 0.8);
      }
    }
    damp(g, rand, 5);
    moss(g, rand, 0.9, 0.4);
    creeper(g, rand, [boss ? TEX - 20 : 18, TEX], 7, [boss ? -3 : 3, -3.2], 7, DOOR_ASPECT);
    grain(g, rand, 20);
  };
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
function ruinProps(plan: FloorPlan, group: THREE.Group, rng: Rng) {
  ruinShared ??= {
    vine: paint(1122, vinePaint),
    hole: paint(1123, holePaint),
    plank: paint(1124, plankPaint),
  };
  const shared = ruinShared,
    tools = propTools(plan, group, RUIN_PROPS, rng),
    { d, wallOf, add } = tools;
  // the picture on the wall a wall slot is on
  const pictureOf = (s: WallSlot) => variantOf(wallOf(s), RUIN_WALLS, WALL_PLAIN_SHARE);
  // (nothing hangs where the ceiling is open, nor from the boss room's ceiling: it is higher than the others)
  const of = (id: string) =>
    tools
      .of(id)
      .filter(s => s.kind === 'wall' || (!plan.noCeil[s.j * d.W + s.i] && s.room !== (plan.hall?.room ?? -1)));
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
        if (variantOf(wall, RUIN_WALLS, WALL_PLAIN_SHARE) !== WALL_WINDOW) return;
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
}

// the ruined streets' look (world/looks.ts makes it the first time the sector is drawn)
export function ruinLook(): Look {
  return {
    walls: Array.from({ length: RUIN_WALLS }, (_, v) => paint(1100 + v, ruinWall(v))),
    floors: Array.from({ length: RUIN_FLOORS }, (_, v) => paint(1200, ruinFloor(v))),
    deck: paint(1300, ruinDeck),
    ceiling: paint(1400, ruinCeiling),
    door: paint(1500, ruinDoor(false)),
    bossDoor: paint(1501, ruinDoor(true)),
    fog: 0x29312b,
    props: ruinProps,
  };
}
