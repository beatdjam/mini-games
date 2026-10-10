import type * as THREE from 'three';
import { createRng } from '@engine/core/util.ts';
import { BACKDROP_EYE, BACKDROP_H, BACKDROP_W, canvasTex } from '../paint.ts';
// What the old downtown's windows look out on (Look.outside): the city at dusk all round, painted on a band that is
// wrapped round the player (world/level.ts). The sun is low in the west (the -x side, a quarter of the band before
// its end: facesWest in common.ts), the sky glowing amber round it and going grey toward the east.
// Buildings in three rows, each with its storeys of windows (dark glass, a few lit), the lines of its floors and
// what stands on its roof (a water tank, plant, an aerial): the far row pale in the haze, the near row with big
// office blocks whose window frames can be made out. Toward the sun they stand dark against the glow; away from it
// their faces take the low sun, warm. Below the eye, the roofs of lower blocks and the streets with their lamps.
// ---- tuning numbers used only here ----
const SUN_U = 0.75; // where the sun is along the band (the band starts at +z and goes round through +x: 0.75 is -x)
const HORIZON = BACKDROP_EYE + 6; // the row of the far ground, a little under the eye (px)
const SEED = 1900;
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

export function cityBackdrop(): THREE.CanvasTexture {
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
      sky.addColorStop(0, '#1f2230');
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

    // below the eye: the roofs of the lower blocks, seen from above, and between them the streets in the dusk
    const ground = g.createLinearGradient(0, HORIZON + 8, 0, BACKDROP_H);
    ground.addColorStop(0, '#3a302b');
    ground.addColorStop(1, '#1d1712');
    g.fillStyle = ground;
    g.fillRect(0, HORIZON + 8, BACKDROP_W, BACKDROP_H - HORIZON - 8);
    for (let y = HORIZON + 10; y < BACKDROP_H; y += 14 + rand() * 18)
      for (let x = rand() * 40; x < BACKDROP_W;) {
        const w = 30 + rand() * 90,
          h = 8 + rand() * 12,
          roof = mix([78, 70, 66], skyAt(x), 0.12 * Math.max(0, -toSun(x)));
        g.fillStyle = rgb(mix(roof, [30, 26, 22], (y - HORIZON) / (BACKDROP_H - HORIZON)));
        g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.fillRect(x, y + h, w, 2); // its edge, in shadow
        g.fillStyle = 'rgba(20,16,14,.6)';
        if (rand() < 0.6) g.fillRect(x + rand() * (w - 8), y + 2, 6, 4); // plant on it
        x += w + 6 + rand() * 20;
      }
    for (let n = 0; n < 380; n++) {
      g.fillStyle = `rgba(240,196,120,${0.25 + rand() * 0.45})`;
      g.fillRect(rand() * BACKDROP_W, HORIZON + 12 + rand() * 200, 2, 2);
    }
  });
}
