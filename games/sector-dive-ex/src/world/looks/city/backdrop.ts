import type * as THREE from 'three';
import { createRng } from '@engine/core/util.ts';
import { BACKDROP_EYE, BACKDROP_H, BACKDROP_W, FACADE_PX, GROUND_PX, canvasTex, hazeUnder } from '../paint.ts';
import type { OutsideView } from '../common.ts';
import type { BlockStyle } from '../outside.ts';
// What the old downtown's windows look out on (Look.outside): the city at dusk all round, painted on a band that is
// wrapped round the player (world/level.ts). The sun is low in the west (the -x side, a quarter of the band before
// its end: facesWest in common.ts), the sky glowing amber round it and going grey toward the east.
// Buildings in three rows, each with its storeys of windows (dark glass, a few lit), the lines of its floors and
// what stands on its roof (a water tank, plant, an aerial): the far row pale in the haze, the near row with big
// office blocks whose window frames can be made out. Toward the sun they stand dark against the glow; away from it
// their faces take the low sun, warm. Under the horizon, laid flat (cityGround), the street, going into the dusk
// haze far off; on it, across the street, the nearer blocks stand as boxes (cityFacades, cityRoofs).
// ---- tuning numbers used only here ----
const SUN_U = 0.75; // where the sun is along the band (the band starts at +z and goes round through +x: 0.75 is -x)
const HORIZON = BACKDROP_EYE + 6; // the row of the far ground, a little under the eye (px)
const SEED = 1900;
const SKY_TOP = 0x1f2230; // the sky straight up (the band's top row)
const HAZE = 0x3e3430; // the dusk haze over the ground far off
type RGB = [number, number, number];
interface Row {
  top: [number, number]; // the rows of the roofs, from the horizon (px)
  wide: [number, number]; // how wide a building is (px)
  gap: [number, number]; // ... and the gap to the next one
  base: RGB; // the face's colour with no sun on it
  haze: number; // how much it fades into the sky (0..1)
  cell: [number, number]; // a window's cell: its width and the storey's height (px)
  lit: number; // the share of the windows that are lit
  detail: boolean; // window frames, blinds and a band at each floor (the near row)
}
const ROWS: Row[] = [
  // far: low and pale
  {
    top: [-58, -16],
    wide: [18, 46],
    gap: [0, 3],
    base: [92, 86, 92],
    haze: 0.55,
    cell: [4, 5],
    lit: 0.03,
    detail: false,
  },
  // middle
  {
    top: [-84, -22],
    wide: [26, 64],
    gap: [2, 10],
    base: [70, 62, 62],
    haze: 0.25,
    cell: [5, 6],
    lit: 0.08,
    detail: false,
  },
  // near: big blocks across the way, with gaps between them
  {
    top: [-150, -60],
    wide: [70, 150],
    gap: [60, 220],
    base: [82, 72, 66],
    haze: 0,
    cell: [9, 11],
    lit: 0.12,
    detail: true,
  },
];

export function cityView(): OutsideView {
  return {
    backdrop: cityBackdrop(),
    sky: SKY_TOP,
    ground: cityGround(),
    haze: HAZE,
    blocks: {
      style: CITY_BLOCKS,
      facades: cityFacades(),
      roofs: cityRoofs(),
      light: CITY_LIGHT,
      roofLight: [1, 0.92, 0.9],
    },
  };
}

function cityBackdrop(): THREE.CanvasTexture {
  return canvasTex(BACKDROP_W, BACKDROP_H, g => {
    const rand = createRng(SEED).next,
      sunX = BACKDROP_W * SUN_U,
      // how near the sun a point of the band is (1 at the sun, -1 opposite it)
      toSun = (x: number) => Math.cos(((x - sunX) / BACKDROP_W) * Math.PI * 2),
      rgb = (c: RGB) => `rgb(${c.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`,
      mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map(n => a[n]! + (b[n]! - a[n]!) * t) as RGB,
      skyAt = (x: number): RGB => mix([110, 104, 112], [226, 152, 92], Math.max(0, toSun(x)) ** 2);
    // the sky: grey high up, toward the roofs dusk, amber round the sun
    for (let x = 0; x < BACKDROP_W; x += 8) {
      const sky = g.createLinearGradient(0, 0, 0, HORIZON);
      sky.addColorStop(0, `#${SKY_TOP.toString(16).padStart(6, '0')}`);
      sky.addColorStop(0.55, rgb(mix([69, 68, 79], skyAt(x), 0.35)));
      sky.addColorStop(1, rgb(skyAt(x)));
      g.fillStyle = sky;
      g.fillRect(x, 0, 8, HORIZON);
    }
    // the sun, low behind the roofs
    const sun = g.createRadialGradient(sunX, HORIZON - 30, 2, sunX, HORIZON - 30, 46);
    sun.addColorStop(0, 'rgba(255,240,206,1)');
    sun.addColorStop(0.4, 'rgba(255,214,150,.85)');
    sun.addColorStop(1, 'rgba(255,190,120,0)');
    g.fillStyle = sun;
    g.fillRect(sunX - 46, HORIZON - 76, 92, 92);

    // a building's face: its colour from the sun (dark against the glow toward it, warm in its light away from it),
    // then faded toward the sky by the haze
    const faceOf = (row: Row, x: number): RGB => {
      const s = toSun(x),
        lit = mix(row.base, [row.base[0] * 1.9, row.base[1] * 1.35, row.base[2] * 0.95], Math.max(0, -s) * 0.8),
        dark = mix(lit, [row.base[0] * 0.55, row.base[1] * 0.5, row.base[2] * 0.55], Math.max(0, s));
      return mix(dark, skyAt(x), row.haze);
    };
    const building = (row: Row, x: number, w: number, top: number, bottom: number) => {
      const face = faceOf(row, x),
        [cw, ch] = row.cell;
      g.fillStyle = rgb(face);
      g.fillRect(x, top, w, bottom - top);
      // a thin lighter edge on the side toward the sun (a corner of the block)
      g.fillStyle = rgb(mix(face, skyAt(x), 0.35));
      g.fillRect(toSun(x) > 0 ? x + w - 2 : x, top, 2, bottom - top);
      // the parapet along the roof
      g.fillStyle = rgb(mix(face, [20, 16, 14], 0.35));
      g.fillRect(x, top, w, 2);
      // the storeys: a band at each floor (near row), the windows in a grid
      const glass = mix(face, [18, 20, 26], 0.55),
        margin = Math.max(2, Math.floor(cw / 2)),
        ww = Math.max(2, Math.round(cw * 0.6)),
        wh = Math.max(2, Math.round(ch * 0.55));
      for (let y = top + ch * 0.7; y < bottom - 2; y += ch) {
        if (row.detail) {
          g.fillStyle = rgb(mix(face, [255, 240, 220], 0.08));
          g.fillRect(x, y - 2, w, 1);
        }
        for (let wx = x + margin; wx + ww < x + w - margin; wx += cw) {
          const on = rand() < row.lit;
          g.fillStyle = on ? `rgba(240,200,128,${0.7 + rand() * 0.3})` : rgb(mix(glass, skyAt(x), rand() * 0.25));
          g.fillRect(wx, y, ww, wh);
          if (!row.detail) continue;
          // the frame's bar down the middle, and in some a blind part down
          g.fillStyle = rgb(mix(face, [30, 26, 24], 0.4));
          g.fillRect(wx + Math.floor(ww / 2), y, 1, wh);
          if (!on && rand() < 0.3) {
            g.fillStyle = rgb(mix(face, [200, 190, 170], 0.25));
            g.fillRect(wx, y, ww, Math.floor(wh * (0.3 + rand() * 0.5)));
          }
        }
      }
      // on the roof: a water tank on legs, a box of plant, an aerial
      const big = row.detail ? 2 : 1;
      g.fillStyle = rgb(mix(face, [16, 14, 14], 0.45));
      if (rand() < 0.5 && w > 20) {
        const tx = x + 4 + rand() * (w - 16),
          th = 5 * big;
        g.fillRect(tx, top - th - 3, th * 1.2, th);
        g.fillRect(tx + 1, top - 3, 1, 3);
        g.fillRect(tx + th * 1.2 - 2, top - 3, 1, 3);
      }
      if (rand() < 0.6 && w > 14) g.fillRect(x + 2 + rand() * (w - 12), top - 3 * big, 6 * big, 3 * big);
      if (rand() < 0.35) g.fillRect(x + rand() * w, top - 11 * big, 1, 11 * big);
    };
    for (const row of ROWS)
      for (let x = rand() * row.gap[1]; x < BACKDROP_W;) {
        const w = row.wide[0] + rand() * (row.wide[1] - row.wide[0]),
          top = HORIZON + row.top[0] + rand() * (row.top[1] - row.top[0]);
        building(row, x, w, top, HORIZON + 40);
        x += w + row.gap[0] + rand() * (row.gap[1] - row.gap[0]);
      }

    // under the horizon: the haze the ground goes into (the ground itself is cityGround, laid flat)
    hazeUnder(g, HAZE);
  });
}

// The street under the windows, seen from above at dusk, a picture that wraps (GROUND_PX a side, 64 m): worn tarmac
// in patches, the lids of manholes, and the pools of light of the street lamps. (The buildings stand on it as boxes,
// cityBlocks, wherever they are: so nothing on it lines up with them, no kerbs and no lines down the middle)
function cityGround(): THREE.CanvasTexture {
  return canvasTex(GROUND_PX, GROUND_PX, g => {
    const rand = createRng(SEED + 1).next,
      S = GROUND_PX,
      margin = 60; // (nothing crosses the picture's edge)
    g.fillStyle = '#26221f';
    g.fillRect(0, 0, S, S);
    for (let n = 0; n < 500; n++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '255,240,220' : '0,0,0'},${0.03 + rand() * 0.05})`;
      g.fillRect(
        margin + rand() * (S - 2 * margin),
        margin + rand() * (S - 2 * margin),
        10 + rand() * 50,
        10 + rand() * 50,
      );
    }
    for (let n = 0; n < 6; n++) {
      g.fillStyle = '#3a3530';
      g.beginPath();
      g.arc(margin + rand() * (S - 2 * margin), margin + rand() * (S - 2 * margin), 9, 0, Math.PI * 2);
      g.fill();
    }
    for (let n = 0; n < 9; n++) {
      const x = margin + rand() * (S - 2 * margin),
        y = margin + rand() * (S - 2 * margin),
        pool = g.createRadialGradient(x, y, 2, x, y, 56);
      pool.addColorStop(0, 'rgba(255,210,140,0.42)');
      pool.addColorStop(1, 'rgba(255,190,120,0)');
      g.fillStyle = pool;
      g.fillRect(x - 56, y - 56, 112, 112);
    }
  });
}

// ---- the buildings across the street (looks/outside.ts) ----
// The near row like the band's: office blocks and flats from 4 storeys up to 17, the row behind taller. The sun is
// low in the west: a face looking west (toward -x: side 1) takes it, warm; one looking east is in its own shadow;
// the others between
const CITY_BLOCKS: BlockStyle = {
  high: [
    [14, 60],
    [30, 95],
  ],
  facades: 3,
  roofs: 2,
};
// (by side: looking east, west, south, north)
const CITY_LIGHT: [number, number, number][] = [
  [0.5, 0.48, 0.56],
  [1.3, 1.05, 0.82],
  [0.85, 0.8, 0.82],
  [0.85, 0.8, 0.82],
];
const BAY = FACADE_PX / 4, // px: a bay is 4 m, a storey 3.5 m (FACADE_M), four of each on a picture
  STOREY = FACADE_PX / 4;
// the windows of a facade: one per bay per storey, at (x, y) w by h px in its cell; lit ones warm, the others glass
// with the dusk in it, some with the blind part down
function windowGrid(
  g: CanvasRenderingContext2D,
  rand: () => number,
  [x, y, w, h]: [number, number, number, number],
  lit: number,
  frame: string,
) {
  for (let by = 0; by < 4; by++)
    for (let bx = 0; bx < 4; bx++) {
      const wx = bx * BAY + x,
        wy = by * STOREY + y;
      g.fillStyle = frame;
      g.fillRect(wx - 3, wy - 3, w + 6, h + 6);
      if (rand() < lit) {
        g.fillStyle = `rgb(${226 + rand() * 24},${178 + rand() * 30},${104 + rand() * 30})`;
        g.fillRect(wx, wy, w, h);
      } else {
        const glass = g.createLinearGradient(0, wy, 0, wy + h);
        glass.addColorStop(0, '#5c5a66');
        glass.addColorStop(1, '#2a2a33');
        g.fillStyle = glass;
        g.fillRect(wx, wy, w, h);
        if (rand() < 0.3) {
          g.fillStyle = 'rgba(200,190,170,0.55)';
          g.fillRect(wx, wy, w, h * (0.2 + rand() * 0.5));
        }
      }
    }
}
function cityFacades(): THREE.CanvasTexture[] {
  const S = FACADE_PX;
  return [
    // an office block: bands of grey stone at each floor, glass between them split by mullions
    canvasTex(S, S, g => {
      const rand = createRng(SEED + 10).next;
      g.fillStyle = '#6e6862';
      g.fillRect(0, 0, S, S);
      for (let by = 0; by < 4; by++) {
        const y = by * STOREY + 34;
        for (let x = 0; x < S; x += BAY / 2) {
          const on = rand() < 0.14,
            glass = g.createLinearGradient(0, y, 0, y + 86);
          glass.addColorStop(0, on ? '#f0c886' : '#5a5e6c');
          glass.addColorStop(1, on ? '#d8a868' : '#282a34');
          g.fillStyle = glass;
          g.fillRect(x + 3, y, BAY / 2 - 6, 86);
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let x = 0; x < S; x += BAY / 2) g.fillRect(x, 0, 3, S);
    }),
    // flats: tiled walls, a window per room with its frame, an air conditioner beside some, a balcony rail along
    // each floor
    canvasTex(S, S, g => {
      const rand = createRng(SEED + 11).next;
      g.fillStyle = '#9c9284';
      g.fillRect(0, 0, S, S);
      for (let n = 0; n < 120; n++) {
        g.fillStyle = `rgba(40,32,28,${0.04 + rand() * 0.06})`;
        g.fillRect(rand() * S, rand() * S, 4 + rand() * 30, 20 + rand() * 80);
      }
      windowGrid(g, rand, [28, 26, 72, 62], 0.22, '#d8d2c4');
      for (let by = 0; by < 4; by++) {
        const y = by * STOREY + 100;
        g.fillStyle = 'rgba(30,26,24,0.75)';
        g.fillRect(0, y, S, 4);
        g.fillRect(0, y + 22, S, 3);
        for (let x = 0; x < S; x += 10) g.fillRect(x, y, 2, 24);
        for (let bx = 0; bx < 4; bx++)
          if (rand() < 0.5) {
            g.fillStyle = '#c9c4b8';
            g.fillRect(bx * BAY + 104, by * STOREY + 70, 20, 16);
          }
      }
    }),
    // an older block in brick, the windows tall with white frames and stone sills
    canvasTex(S, S, g => {
      const rand = createRng(SEED + 12).next;
      g.fillStyle = '#7a4a3a';
      g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 8)
        for (let x = (y / 8) % 2 ? -10 : 0; x < S; x += 20) {
          g.fillStyle = `rgba(${rand() < 0.5 ? '255,220,200' : '20,10,8'},${0.05 + rand() * 0.08})`;
          g.fillRect(x + 1, y + 1, 18, 6);
        }
      windowGrid(g, rand, [40, 22, 48, 78], 0.16, '#d6d0c6');
      g.fillStyle = '#b8b0a2';
      for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++) g.fillRect(bx * BAY + 32, by * STOREY + 103, 64, 6);
    }),
  ];
}
// roofs: grey asphalt and concrete in squares, stained, with plant and a vent or two on one of them
function cityRoofs(): THREE.CanvasTexture[] {
  const S = FACADE_PX;
  return [0, 1].map(v =>
    canvasTex(S, S, g => {
      const rand = createRng(SEED + 20 + v).next;
      g.fillStyle = v ? '#5e5852' : '#6a645c';
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let k = 0; k < S; k += 64) {
        g.fillRect(k, 0, 2, S);
        g.fillRect(0, k, S, 2);
      }
      for (let n = 0; n < 40; n++) {
        g.fillStyle = `rgba(20,16,14,${0.06 + rand() * 0.1})`;
        g.fillRect(rand() * S, rand() * S, 20 + rand() * 60, 20 + rand() * 60);
      }
      if (v)
        for (let n = 0; n < 4; n++) {
          const x = 40 + rand() * (S - 140),
            y = 40 + rand() * (S - 120);
          g.fillStyle = 'rgba(0,0,0,0.4)';
          g.fillRect(x + 8, y + 6, 80, 50);
          g.fillStyle = '#8a8378';
          g.fillRect(x, y, 80, 50);
        }
    }),
  );
}
