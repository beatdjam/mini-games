import type * as THREE from 'three';
import { createRng } from '@engine/core/util.ts';
import { BACKDROP_EYE, BACKDROP_H, BACKDROP_W, FACADE_PX, GROUND_PX, canvasTex, hazeUnder } from '../paint.ts';
import type { OutsideView } from '../common.ts';
import type { BlockStyle } from '../outside.ts';
// What the ruined blocks' broken windows look out on (Look.outside): the other blocks of the estate under a white
// overcast sky, all round (no sun: the light is the same everywhere). Housing blocks in three rows, long and plain,
// with the storeys of their window holes dark and empty, here and there a top fallen in; trees and scrub grown up
// round their feet. All of it pale and green in the damp haze, the far row almost gone into it. Under the horizon,
// laid flat (ruinGround), the overgrown ground, going into the haze far off; on it, across the way, the nearer blocks
// stand as boxes (ruinFacades, ruinRoof).
// ---- tuning numbers used only here ----
const HORIZON = BACKDROP_EYE + 6; // the row of the far ground, a little under the eye (px)
const SEED = 1910;
const SKY_TOP = 0xd6dccf; // the overcast straight up (the band's top row)
const HAZE = 0x848e7c; // the damp haze over the ground far off
type RGB = [number, number, number];
const SKY: RGB = [168, 180, 160]; // the haze at the horizon
interface Row {
  top: [number, number]; // the rows of the roofs, from the horizon (px)
  wide: [number, number]; // how long a block is (px)
  gap: [number, number]; // ... and the gap to the next one
  base: RGB; // the concrete's colour
  haze: number; // how much it fades into the sky (0..1)
  cell: [number, number]; // a window's cell: its width and the storey's height (px)
}
const ROWS: Row[] = [
  { top: [-50, -20], wide: [60, 140], gap: [10, 60], base: [120, 128, 116], haze: 0.7, cell: [5, 6] },
  { top: [-74, -28], wide: [70, 160], gap: [30, 120], base: [104, 110, 100], haze: 0.45, cell: [6, 7] },
  // (no near row: the band goes with the eye, and what is near must shift as one walks. See city/backdrop.ts)
];

export function ruinView(): OutsideView {
  return {
    backdrop: ruinBackdrop(),
    sky: SKY_TOP,
    ground: ruinGround(),
    haze: HAZE,
    blocks: {
      style: RUIN_BLOCKS,
      facades: ruinFacades(),
      roofs: [ruinRoof()],
      light: [
        [0.9, 0.95, 0.9],
        [0.95, 1, 0.95],
        [0.85, 0.9, 0.85],
        [0.95, 1, 0.95],
      ],
      roofLight: [1.05, 1.1, 1.05],
    },
  };
}

function ruinBackdrop(): THREE.CanvasTexture {
  return canvasTex(BACKDROP_W, BACKDROP_H, g => {
    const rand = createRng(SEED).next,
      rgb = (c: RGB) => `rgb(${c.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`,
      mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map(n => a[n]! + (b[n]! - a[n]!) * t) as RGB;
    // the overcast: white high up, the green haze toward the ground
    const sky = g.createLinearGradient(0, 0, 0, HORIZON);
    sky.addColorStop(0, `#${SKY_TOP.toString(16)}`);
    sky.addColorStop(0.6, '#c2cbb9');
    sky.addColorStop(1, rgb(SKY));
    g.fillStyle = sky;
    g.fillRect(0, 0, BACKDROP_W, HORIZON);
    // trees: a clump of round crowns, dark green faded by the haze
    const trees = (x: number, y: number, w: number, haze: number) => {
      for (let n = 0; n < w / 5; n++) {
        const cx = x + rand() * w,
          r = 4 + rand() * 9;
        g.fillStyle = rgb(mix(mix([62, 80, 56], [90, 108, 78], rand()), SKY, haze));
        g.beginPath();
        g.ellipse(cx, y - rand() * r, r, r * 0.8, 0, 0, Math.PI * 2);
        g.fill();
      }
    };
    const block = (row: Row, x: number, w: number, top: number, bottom: number) => {
      const face = mix(row.base, SKY, row.haze),
        [cw, ch] = row.cell,
        hole = mix(mix(face, [30, 36, 30], 0.6), SKY, row.haze * 0.6);
      g.fillStyle = rgb(face);
      g.fillRect(x, top, w, bottom - top);
      // a top fallen in: a ragged notch out of the roof, the sky through it
      if (rand() < 0.4) {
        const nx = x + rand() * w * 0.7,
          nw = 10 + rand() * w * 0.3;
        g.fillStyle = rgb(SKY);
        g.beginPath();
        g.moveTo(nx, top - 1);
        for (let k = 0; k <= 6; k++) g.lineTo(nx + (nw * k) / 6, top + rand() * ch * 2.5);
        g.lineTo(nx + nw, top - 1);
        g.fill();
      }
      // the stains run down from the roof
      for (let k = 0; k < w / 12; k++) {
        g.fillStyle = `rgba(40,52,40,${0.08 + rand() * 0.12})`;
        g.fillRect(x + rand() * w, top, 2 + rand() * 4, (bottom - top) * (0.2 + rand() * 0.6));
      }
      // the storeys: the slab's line, the window holes dark and empty
      for (let y = top + ch * 0.8; y < bottom - 2; y += ch) {
        g.fillStyle = rgb(mix(face, [220, 226, 214], 0.12));
        g.fillRect(x, y - 2, w, 1);
        for (let wx = x + 3; wx + cw * 0.6 < x + w - 3; wx += cw) {
          g.fillStyle = rgb(mix(hole, face, rand() * 0.2));
          g.fillRect(wx, y, Math.max(2, Math.round(cw * 0.6)), Math.max(2, Math.round(ch * 0.55)));
        }
      }
      trees(x - 10, bottom - (bottom - top) * 0.25, w + 20, row.haze);
    };
    for (const row of ROWS)
      for (let x = rand() * row.gap[1]; x < BACKDROP_W;) {
        const w = row.wide[0] + rand() * (row.wide[1] - row.wide[0]),
          top = HORIZON + row.top[0] + rand() * (row.top[1] - row.top[0]);
        block(row, x, w, top, HORIZON + 40);
        x += w + row.gap[0] + rand() * (row.gap[1] - row.gap[0]);
      }
    // under the horizon: the damp haze the ground goes into (the ground itself is ruinGround, laid flat)
    hazeUnder(g, HAZE);
  });
}

// The ground under the windows, seen from above under the overcast, a picture that wraps (GROUND_PX a side, 64 m):
// grass and scrub grown over everything, two paths of cracked concrete across it with the green coming up through
// them, puddles with the white sky in them, and trees in clumps, their crowns round, of several greens. No shadows: the light is the same from everywhere.
function ruinGround(): THREE.CanvasTexture {
  return canvasTex(GROUND_PX, GROUND_PX, g => {
    const rand = createRng(SEED + 1).next,
      S = GROUND_PX,
      // draw a thing at its place and again a picture over, wherever it would cross the edge (the picture wraps)
      wrapped = (fn: () => void) => {
        for (const dx of [-S, 0, S])
          for (const dy of [-S, 0, S]) {
            g.save();
            g.translate(dx, dy);
            fn();
            g.restore();
          }
      };
    g.fillStyle = '#5c6a4c';
    g.fillRect(0, 0, S, S);
    // the grass: patches lighter and darker, yellowed in places
    for (let n = 0; n < 900; n++) {
      const x = rand() * S,
        y = rand() * S,
        r = 6 + rand() * 30,
        ry = r * (0.6 + rand() * 0.4),
        c = rand() < 0.2 ? '150,150,96' : rand() < 0.5 ? '120,140,96' : '50,64,42';
      g.fillStyle = `rgba(${c},${0.12 + rand() * 0.2})`;
      wrapped(() => {
        g.beginPath();
        g.ellipse(x, y, r, ry, 0, 0, Math.PI * 2);
        g.fill();
      });
    }
    // two paths across, 4 m wide, cracked, the grass over their edges and up through them
    for (const [x, y, w, h] of [
      [0, 380, S, 64],
      [700, 0, 64, S],
    ] as [number, number, number, number][]) {
      g.fillStyle = '#8b8d84';
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(40,44,36,0.6)';
      g.lineWidth = 1.5;
      for (let k = 0; k < 40; k++) {
        const cx = x + rand() * w,
          cy = y + rand() * h;
        g.beginPath();
        g.moveTo(cx, cy);
        for (let s = 0; s < 4; s++) g.lineTo(cx + (rand() - 0.5) * 40, cy + (rand() - 0.5) * 40);
        g.stroke();
      }
      for (let k = 0; k < 70; k++) {
        g.fillStyle = `rgba(78,96,60,${0.4 + rand() * 0.4})`;
        const edge = rand() < 0.7,
          px = w > h ? x + rand() * w : x + (edge ? (rand() < 0.5 ? 0 : w) : rand() * w),
          py = w > h ? y + (edge ? (rand() < 0.5 ? 0 : h) : rand() * h) : y + rand() * h;
        g.beginPath();
        g.ellipse(px, py, 4 + rand() * 12, 3 + rand() * 8, rand() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    // puddles with the white sky in them
    for (let n = 0; n < 8; n++) {
      g.fillStyle = 'rgba(206,214,200,0.7)';
      g.beginPath();
      g.ellipse(rand() * S, 380 + rand() * 64, 10 + rand() * 16, 5 + rand() * 6, 0, 0, Math.PI * 2);
      g.fill();
    }
    // trees in clumps: each crown a few round lobes of different greens, darker toward its edge
    for (let c = 0; c < 22; c++) {
      const cx = rand() * S,
        cy = rand() * S;
      for (let n = 0; n < 3 + rand() * 6; n++) {
        const x = cx + (rand() - 0.5) * 120,
          y = cy + (rand() - 0.5) * 120,
          r = 24 + rand() * 40,
          lobes = Array.from({ length: 7 }, (_, k) => {
            const a = rand() * Math.PI * 2,
              d = k ? r * (0.2 + rand() * 0.4) : 0,
              tone = 40 + rand() * 40;
            return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: r * (k ? 0.45 + rand() * 0.25 : 1), tone };
          });
        wrapped(() =>
          lobes.forEach((l, k) => {
            g.fillStyle = k ? `rgb(${l.tone + 6},${l.tone + 30},${l.tone - 4})` : 'rgb(34,46,30)';
            g.beginPath();
            g.arc(l.x, l.y, l.r, 0, Math.PI * 2);
            g.fill();
          }),
        );
      }
    }
  });
}

// ---- the blocks across the way (looks/outside.ts) ----
// Housing blocks of 3 to 10 storeys, the row behind a little higher; much the same light on every face (the
// overcast), the roofs a little brighter
const RUIN_BLOCKS: BlockStyle = {
  high: [
    [12, 36],
    [20, 48],
  ],
  facades: 2,
  roofs: 1,
};
const CELL = FACADE_PX / 4; // px: a bay of 4 m by a storey of 3.5 m (FACADE_M), four of each on a picture
// the concrete of a block: pale and streaked with the damp from the slab of each floor down, moss in places
function slab(g: CanvasRenderingContext2D, rand: () => number) {
  const S = FACADE_PX;
  g.fillStyle = '#8c9286';
  g.fillRect(0, 0, S, S);
  for (let n = 0; n < 160; n++) {
    g.fillStyle = `rgba(${rand() < 0.3 ? '60,84,48' : '40,48,40'},${0.05 + rand() * 0.1})`;
    g.fillRect(rand() * S, rand() * S, 3 + rand() * 18, 20 + rand() * 90);
  }
  g.fillStyle = 'rgba(220,226,214,0.25)';
  for (let y = 0; y < S; y += CELL) g.fillRect(0, y + CELL - 8, S, 5); // the edge of each floor's slab
}
function ruinFacades(): THREE.CanvasTexture[] {
  const S = FACADE_PX;
  return [
    // windows in a grid, their glass gone: dark holes, a frame left in some
    canvasTex(S, S, g => {
      const rand = createRng(SEED + 10).next;
      slab(g, rand);
      for (let by = 0; by < 4; by++)
        for (let bx = 0; bx < 4; bx++) {
          const x = bx * CELL + 28,
            y = by * CELL + 24;
          g.fillStyle = `rgb(${26 + rand() * 14},${30 + rand() * 14},${28 + rand() * 10})`;
          g.fillRect(x, y, 72, 66);
          if (rand() < 0.4) {
            g.fillStyle = '#5c6058';
            g.fillRect(x + 34, y, 4, 66);
            g.fillRect(x, y + 30, 72, 4);
          }
        }
    }),
    // balconies along each floor, the doors behind them dark, the rails rusted and broken in places
    canvasTex(S, S, g => {
      const rand = createRng(SEED + 11).next;
      slab(g, rand);
      for (let by = 0; by < 4; by++) {
        const y = by * CELL;
        for (let bx = 0; bx < 4; bx++) {
          g.fillStyle = '#2a2f2a';
          g.fillRect(bx * CELL + 20, y + 18, 40, 84);
          g.fillRect(bx * CELL + 70, y + 30, 40, 50);
        }
        g.fillStyle = 'rgba(70,52,40,0.85)';
        g.fillRect(0, y + 78, S, 4);
        for (let x = 0; x < S; x += 12) if (rand() < 0.85) g.fillRect(x, y + 78, 2, 30);
        g.fillStyle = '#7a7e74';
        g.fillRect(0, y + 106, S, 10); // the balcony's slab
      }
    }),
  ];
}
// a flat roof: concrete gone green and black, puddles of the white sky, scrub grown up on it
function ruinRoof(): THREE.CanvasTexture {
  const S = FACADE_PX;
  return canvasTex(S, S, g => {
    const rand = createRng(SEED + 20).next;
    g.fillStyle = '#767c70';
    g.fillRect(0, 0, S, S);
    for (let n = 0; n < 60; n++) {
      g.fillStyle = `rgba(${rand() < 0.6 ? '70,96,52' : '30,34,28'},${0.15 + rand() * 0.3})`;
      g.beginPath();
      g.ellipse(rand() * S, rand() * S, 10 + rand() * 40, 8 + rand() * 30, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (let n = 0; n < 5; n++) {
      g.fillStyle = 'rgba(206,214,200,0.6)';
      g.beginPath();
      g.ellipse(rand() * S, rand() * S, 14 + rand() * 20, 8 + rand() * 10, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}
