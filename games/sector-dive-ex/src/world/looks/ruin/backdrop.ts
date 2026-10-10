import type * as THREE from 'three';
import { createRng } from '@engine/core/util.ts';
import { BACKDROP_EYE, BACKDROP_H, BACKDROP_W, canvasTex } from '../paint.ts';
// What the ruined blocks' broken windows look out on (Look.outside): the other blocks of the estate under a white
// overcast sky, all round (no sun: the light is the same everywhere). Housing blocks in three rows, long and plain,
// with the storeys of their window holes dark and empty, here and there a top fallen in; trees and scrub grown up
// round their feet and over the low roofs below the eye. All of it pale and green in the damp haze, the far row
// almost gone into it.
// ---- tuning numbers used only here ----
const HORIZON = BACKDROP_EYE + 6; // the row of the far ground, a little under the eye (px)
const SEED = 1910;
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
  { top: [-120, -50], wide: [90, 190], gap: [120, 320], base: [96, 100, 90], haze: 0.15, cell: [9, 11] },
];

export function ruinBackdrop(): THREE.CanvasTexture {
  return canvasTex(BACKDROP_W, BACKDROP_H, g => {
    const rand = createRng(SEED).next,
      rgb = (c: RGB) => `rgb(${c.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`,
      mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map(n => a[n]! + (b[n]! - a[n]!) * t) as RGB;
    // the overcast: white high up, the green haze toward the ground
    const sky = g.createLinearGradient(0, 0, 0, HORIZON);
    sky.addColorStop(0, '#d6dccf');
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
    // below the eye: scrub and trees over the low roofs and the paths, darker further down
    const ground = g.createLinearGradient(0, HORIZON + 8, 0, BACKDROP_H);
    ground.addColorStop(0, '#6e7c66');
    ground.addColorStop(1, '#2c3428');
    g.fillStyle = ground;
    g.fillRect(0, HORIZON + 8, BACKDROP_W, BACKDROP_H - HORIZON - 8);
    for (let y = HORIZON + 14; y < BACKDROP_H; y += 10 + rand() * 14) {
      const fade = (y - HORIZON) / (BACKDROP_H - HORIZON);
      for (let x = rand() * 30; x < BACKDROP_W;) {
        const w = 24 + rand() * 70;
        if (rand() < 0.35) {
          // a low roof, grey, with green on it
          g.fillStyle = rgb(mix([104, 108, 98], [40, 46, 38], fade));
          g.fillRect(x, y, w, 6 + rand() * 6);
        } else trees(x, y + 6, w, 0.3 * (1 - fade));
        x += w + rand() * 12;
      }
    }
  });
}
