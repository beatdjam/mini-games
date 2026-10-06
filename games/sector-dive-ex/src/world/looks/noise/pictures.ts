import { NOISE_DANGER, NOISE_PLATE_QUIET, NOISE_PLATE_STAFF } from '../../../i18n/signs.ts';
import type { Pictures } from '../common.ts';
import {
  DOOR_ASPECT,
  SIGN_FONT,
  TEX,
  WALL_ASPECT,
  grain,
  grime,
  oval,
  paint,
  rowOf,
  smudge,
  stripes,
} from '../paint.ts';
import type { Paint } from '../paint.ts';
// The deep noise (NOISE): a broadcasting station far underground, left as it was. Sound-absorbing walls gone grey
// and violet with dust, racks of old gear, monitors that still show static, worn carpet, studio doors. The fog is
// close here, so the pictures are kept light enough to read from near by.
// ---- tuning numbers used only here ----
export const FRAME_BLACK = '#17141b'; // door frames and bolts, the frame of a lamp sign
export const SCREEN = { w: 0.62, h: 0.48, y: 1.82, opacity: 0.55, every: 90 }; // the moving static on a monitor (m, m, m, -, ms a frame)
// The wall pictures. The first is the plainest and comes up most (WALL_PLAIN_SHARE); the others share the rest
// evenly, so a kind listed twice comes up twice as often, and the ones that catch the eye are listed once
export const WALL_KINDS = [
  'board', // perforated sound-absorbing board
  'foam', // wedge foam tiles, a few fallen off
  'cloth', // cloth-covered panels, one torn
  'rack', // racks of gear: knobs, meters, a tape deck
  'foam',
  'cables', // a cable ladder up the wall
  'cloth',
  'notice', // board with two notice plates
  'burnt', // a burnt-out switchboard
  'monitor', // a bank of monitors, the middle one showing static
] as const;
export type WallKind = (typeof WALL_KINDS)[number];
const NOISE_FLOORS = 5; // 0 worn carpet, 1 carpet torn away, 2 the lid of a floor box, 3 a stain, 4 tape marks

const FIELD_TOP = rowOf(4.9); // the walls are lined between these two rows; above is bare, below is the dado
const FIELD_FOOT = rowOf(1.0);
// a flat box with a shadow under it and a light top edge: a panel, a plate, a unit of gear
function slab(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  g.fillStyle = 'rgba(8,6,12,.45)';
  g.fillRect(x + 1.5, y + 1.5, w, h);
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,250,255,.16)';
  g.fillRect(x, y, w, 1.2);
}
// What every wall has: painted board, a bare band and a cable duct under the ceiling, a dado and a skirting at the
// foot. They run on from one picture to the next
function shell(g: CanvasRenderingContext2D, rand: () => number) {
  const bg = g.createLinearGradient(0, 0, 0, TEX);
  bg.addColorStop(0, '#5a4f70');
  bg.addColorStop(1, '#685d80');
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 120, '#84789a', '#3a3247');
  g.fillStyle = 'rgba(30,24,40,.3)'; // the bare band
  g.fillRect(0, 0, TEX, FIELD_TOP);
  // the dado: dark laminate under a metal rail
  g.fillStyle = '#4d4460';
  g.fillRect(0, FIELD_FOOT, TEX, TEX - FIELD_FOOT);
  for (let k = 0; k < 40; k++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '30,24,40' : '170,160,190'},${0.05 + rand() * 0.08})`;
    g.fillRect(rand() * TEX, FIELD_FOOT, 1 + rand() * 3, TEX - FIELD_FOOT);
  }
  g.fillStyle = '#322c3c';
  g.fillRect(0, rowOf(0.2), TEX, TEX - rowOf(0.2));
}
// ... and what goes over the lining: the duct, the rail, water marks from the ceiling, dust at the foot
function trim(g: CanvasRenderingContext2D, rand: () => number) {
  slab(g, 0, FIELD_TOP - 7, TEX, 7, '#9a93a8');
  g.fillStyle = 'rgba(20,16,28,.3)';
  for (let x = 30 + rand() * 40; x < TEX; x += 70 + rand() * 30) g.fillRect(x, FIELD_TOP - 7, 1.2, 7);
  slab(g, 0, FIELD_FOOT - 1.5, TEX, 3.5, '#a9a3b6');
  for (let k = 0; k < 7; k++) {
    const len = 30 + rand() * 120,
      st = g.createLinearGradient(0, 0, 0, len);
    st.addColorStop(0, 'rgba(24,18,32,.4)');
    st.addColorStop(1, 'rgba(24,18,32,0)');
    g.fillStyle = st;
    g.fillRect(rand() * TEX, 0, 2 + rand() * 9, len);
  }
  const foot = g.createLinearGradient(0, rowOf(0.7), 0, TEX);
  foot.addColorStop(0, 'rgba(22,17,30,0)');
  foot.addColorStop(1, 'rgba(22,17,30,.45)');
  g.fillStyle = foot;
  g.fillRect(0, rowOf(0.7), TEX, TEX - rowOf(0.7));
}
// perforated board over the lined part of a wall, in sheets with joints; a sheet here and there was replaced later
function board(g: CanvasRenderingContext2D, rand: () => number) {
  const h = FIELD_FOOT - FIELD_TOP,
    mid = rowOf(2.95);
  g.fillStyle = '#72668a';
  g.fillRect(0, FIELD_TOP, TEX, h);
  g.fillStyle = 'rgba(200,192,215,.16)';
  if (rand() < 0.6) g.fillRect(64, mid, 128, FIELD_FOOT - mid);
  else g.fillRect(192, FIELD_TOP, 64, mid - FIELD_TOP);
  grime(g, rand, 50, '#8b80a2', '#4a4258');
  // the holes, a hand apart (painted flat, as the picture is stretched upward)
  g.fillStyle = 'rgba(28,22,38,.62)';
  for (let y = FIELD_TOP + 4; y < FIELD_FOOT - 2; y += 6.4 * WALL_ASPECT)
    for (let x = 3.2; x < TEX; x += 6.4) g.fillRect(x - 1, y - 0.75, 2, 1.5);
  g.fillStyle = 'rgba(24,18,32,.5)';
  g.fillRect(63, FIELD_TOP, 1.5, h);
  g.fillRect(191, FIELD_TOP, 1.5, h);
  g.fillRect(0, mid, TEX, 1.2);
}
// wedge foam tiles, the ridges of each turned the other way from its neighbours'; some have come off their glue
function foam(g: CanvasRenderingContext2D, rand: () => number) {
  const side = 32, // half a metre
    tall = side * WALL_ASPECT,
    top = FIELD_TOP + 6;
  g.fillStyle = '#786d90'; // the board they were stuck to
  g.fillRect(0, FIELD_TOP, TEX, FIELD_FOOT - FIELD_TOP);
  for (let row = 0, y = top; y + tall <= FIELD_FOOT - 2; row++, y += tall)
    for (let col = 0; col < TEX / side; col++) {
      const x = col * side;
      if (rand() < 0.07) {
        // gone: dabs of old glue where it was
        g.fillStyle = 'rgba(150,134,96,.5)';
        for (const [dx, dy] of [
          [0.25, 0.3],
          [0.75, 0.3],
          [0.5, 0.7],
        ] as [number, number][])
          oval(g, x + side * dx, y + tall * dy, 5, 5 * WALL_ASPECT);
        continue;
      }
      g.fillStyle = '#50485f';
      g.fillRect(x, y, side, tall);
      const across = (row + col) % 2 === 0,
        ridges = 4;
      for (let r = 0; r < ridges; r++) {
        const step = (across ? tall : side) / ridges,
          at = r * step;
        g.fillStyle = 'rgba(176,166,198,.5)'; // the lit flank of a ridge
        if (across) g.fillRect(x, y + at, side, step * 0.38);
        else g.fillRect(x + at, y, step * 0.38, tall);
        g.fillStyle = 'rgba(16,12,24,.5)'; // the valley
        if (across) g.fillRect(x, y + at + step * 0.72, side, step * 0.28);
        else g.fillRect(x + at + step * 0.72, y, step * 0.28, tall);
      }
      g.fillStyle = `rgba(20,16,28,${rand() * 0.22})`; // some are dustier
      g.fillRect(x, y, side, tall);
    }
}
// cloth-covered panels standing side by side; the cloth of one has come away from a corner, the wool showing
function cloth(g: CanvasRenderingContext2D, rand: () => number) {
  const top = FIELD_TOP + 8,
    h = FIELD_FOOT - 6 - top,
    tones = ['#6f6088', '#7a6d90', '#675b80'],
    torn = Math.floor(rand() * 3);
  for (let p = 0; p < 3; p++) {
    const x = 6 + p * 83,
      w = 78;
    slab(g, x, top, w, h, tones[(p + Math.floor(rand() * 3)) % 3]!);
    // the weave: fine upright and level threads
    for (let k = 0; k < 60; k++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '24,18,34' : '205,196,222'},${0.05 + rand() * 0.07})`;
      if (rand() < 0.5) g.fillRect(x + rand() * w, top, 1, h);
      else g.fillRect(x, top + rand() * h, w, 0.8);
    }
    const sag = g.createLinearGradient(0, top + h * 0.7, 0, top + h); // dust settles toward the foot
    sag.addColorStop(0, 'rgba(24,18,34,0)');
    sag.addColorStop(1, 'rgba(24,18,34,.3)');
    g.fillStyle = sag;
    g.fillRect(x, top + h * 0.7, w, h * 0.3);
    if (p === torn) {
      g.fillStyle = '#a89c7c'; // mineral wool
      g.beginPath();
      g.moveTo(x + w, top);
      g.lineTo(x + w - 34, top);
      g.lineTo(x + w, top + 40);
      g.fill();
      g.fillStyle = 'rgba(40,32,24,.35)';
      for (let k = 0; k < 14; k++) g.fillRect(x + w - rand() * 22, top + rand() * 22, 2, 1);
      g.fillStyle = '#5d5371'; // the cloth hanging down
      g.beginPath();
      g.moveTo(x + w - 34, top);
      g.lineTo(x + w - 20, top + 32);
      g.lineTo(x + w, top + 40);
      g.fill();
    }
  }
}
// a round dial knob with its pointer
function knob(g: CanvasRenderingContext2D, x: number, y: number, r: number, turn: number) {
  g.fillStyle = 'rgba(8,6,12,.6)';
  oval(g, x + 0.7, y + 0.5, r, r * WALL_ASPECT);
  g.fillStyle = '#2a2632';
  oval(g, x, y, r * 0.9, r * 0.9 * WALL_ASPECT);
  g.strokeStyle = '#d6d0de';
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + Math.cos(turn) * r * 0.9, y + Math.sin(turn) * r * 0.9 * WALL_ASPECT);
  g.stroke();
}
// a meter: a cream face, a scale and a needle
function meter(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lean: number) {
  g.fillStyle = '#1e1b25';
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = '#cfc8b0';
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(150,60,40,.8)'; // the red end of the scale
  g.fillRect(x + w * 0.68, y + h * 0.25, w * 0.22, 1);
  g.fillStyle = 'rgba(40,34,30,.8)';
  g.fillRect(x + w * 0.1, y + h * 0.25, w * 0.58, 1);
  g.strokeStyle = '#2a2420';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(x + w / 2, y + h);
  g.lineTo(x + w / 2 + lean * w * 0.4, y + h * 0.3);
  g.stroke();
}
// three racks of gear standing against the wall, their cables going up to the duct
function racks(g: CanvasRenderingContext2D, rand: () => number) {
  const w = 44,
    top = rowOf(2.5),
    foot = rowOf(0.12),
    x0 = TEX / 2 - w * 1.5 - 3;
  g.fillStyle = '#3b3546';
  for (let k = 0; k < 5; k++) g.fillRect(x0 + 20 + k * 26 + rand() * 6, FIELD_TOP, 2.2, top - FIELD_TOP);
  for (let r = 0; r < 3; r++) {
    const x = x0 + r * (w + 3);
    slab(g, x, top, w, foot - top, '#34303d');
    let y = top + 3;
    while (y < foot - 8) {
      const kind = Math.floor(rand() * 6),
        h = kind === 5 ? 22 : kind === 4 ? 6 : 11;
      if (y + h > foot - 2) break;
      const dark = rand() < 0.45;
      slab(g, x + 3, y, w - 6, h, dark ? '#4a4556' : '#9b96a6');
      const ink = dark ? 'rgba(210,204,222,.75)' : 'rgba(30,26,38,.8)';
      if (kind === 0) {
        // a row of knobs
        for (let k = 0; k < 4; k++) knob(g, x + 9 + k * 8.6, y + h / 2, 3, rand() * 6.3);
      } else if (kind === 1) {
        // two meters and a lamp (dead, but for one now and then)
        meter(g, x + 6, y + 2.5, 13, h - 5, rand() - 0.5);
        meter(g, x + 22, y + 2.5, 13, h - 5, rand() - 0.5);
        g.fillStyle = rand() < 0.3 ? '#b8d49a' : '#4c4638';
        oval(g, x + w - 6.5, y + h / 2, 1.3, 1.3 * WALL_ASPECT);
      } else if (kind === 2) {
        // a patch bay: rows of sockets, a few leads still in
        g.fillStyle = ink;
        for (let row = 0; row < 2; row++)
          for (let k = 0; k < 10; k++) g.fillRect(x + 6.5 + k * 3.2, y + 3 + row * 4, 1.5, 1.2);
      } else if (kind === 3) {
        // switches and a slot
        g.fillStyle = ink;
        for (let k = 0; k < 6; k++) g.fillRect(x + 7 + k * 3.4, y + 3, 1.6, 2.4);
        g.fillStyle = '#1a1720';
        g.fillRect(x + 7, y + h - 4, w - 20, 1.6);
      } else if (kind === 5) {
        // a tape deck: two reels
        for (const cx of [x + 13, x + w - 13]) {
          g.fillStyle = '#1a1720';
          oval(g, cx, y + 9, 8, 8 * WALL_ASPECT);
          g.fillStyle = '#c4bfcd';
          oval(g, cx, y + 9, 6.6, 6.6 * WALL_ASPECT);
          g.fillStyle = '#5a4a40'; // what tape is left
          oval(g, cx, y + 9, 4.4, 4.4 * WALL_ASPECT);
          g.fillStyle = '#1a1720';
          oval(g, cx, y + 9, 1.4, 1.4 * WALL_ASPECT);
        }
        g.fillStyle = '#1a1720';
        g.fillRect(x + 15, y + 16.5, w - 30, 3);
      }
      y += h + 1.5;
    }
  }
}
// static: grey specks, bright and dark, inside a rectangle
function snow(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, w: number, h: number) {
  for (let py = y; py < y + h; py += 1)
    for (let px = x; px < x + w; px += 1.5) {
      const v = Math.floor(70 + rand() * 150);
      g.fillStyle = `rgb(${v - 8},${v - 6},${v + 10})`;
      g.fillRect(px, py, 1.5, 1);
    }
}
// a monitor: a deep box, a dark bezel, glass that bulges (lit: showing static)
function crt(
  g: CanvasRenderingContext2D,
  rand: () => number,
  x: number,
  y: number,
  w: number,
  h: number,
  lit: boolean,
) {
  slab(g, x, y, w, h, '#4b4657');
  const sx = x + w * 0.1,
    sy = y + h * 0.12,
    sw = w * 0.8,
    sh = h * 0.68;
  g.fillStyle = '#17141d';
  g.fillRect(sx - 2, sy - 1.4, sw + 4, sh + 2.8);
  if (lit) snow(g, rand, sx, sy, sw, sh);
  else {
    g.fillStyle = '#2b2a35';
    g.fillRect(sx, sy, sw, sh);
    g.fillStyle = 'rgba(190,186,214,.12)'; // the room in the glass
    g.fillRect(sx + sw * 0.1, sy + sh * 0.12, sw * 0.3, sh * 0.2);
  }
  const bulge = g.createRadialGradient(sx + sw / 2, sy + sh / 2, 2, sx + sw / 2, sy + sh / 2, sw * 0.7);
  bulge.addColorStop(0, 'rgba(10,8,16,0)');
  bulge.addColorStop(1, 'rgba(10,8,16,.5)');
  g.fillStyle = bulge;
  g.fillRect(sx, sy, sw, sh);
  // two knobs under the glass
  g.fillStyle = '#1c1922';
  oval(g, x + w * 0.78, y + h * 0.9, 1.6, 1.6 * WALL_ASPECT);
  oval(g, x + w * 0.88, y + h * 0.9, 1.6, 1.6 * WALL_ASPECT);
}
// A bank of monitors on a desk: only the middle one still shows static. Its screen is in the middle of the picture
// at SCREEN.y (the moving static of noiseProps goes over it)
function monitors(g: CanvasRenderingContext2D, rand: () => number) {
  board(g, rand);
  const deskTop = rowOf(1.38);
  // the frame the monitors sit in, the desk under it with a strip of faders
  slab(g, 34, rowOf(2.42), TEX - 68, deskTop - rowOf(2.42), '#2f2b38');
  slab(g, 26, deskTop, TEX - 52, rowOf(0.15) - deskTop, '#4f495c');
  slab(g, 26, deskTop, TEX - 52, 5, '#8f899c');
  g.fillStyle = 'rgba(20,16,28,.7)';
  for (let k = 0; k < 22; k++) g.fillRect(40 + k * 8, deskTop + 9, 1.4, 9);
  g.fillStyle = '#c9c4d2';
  for (let k = 0; k < 22; k++) g.fillRect(39.2 + k * 8, deskTop + 10 + rand() * 6, 3, 1.6);
  const cy = rowOf(SCREEN.y),
    h = 34,
    w = 56;
  // the light of the static on what is round it
  g.globalCompositeOperation = 'lighter';
  const halo = g.createRadialGradient(TEX / 2, cy, 8, TEX / 2, cy, 86);
  halo.addColorStop(0, 'rgba(150,150,205,.34)');
  halo.addColorStop(1, 'rgba(150,150,205,0)');
  g.fillStyle = halo;
  g.fillRect(0, cy - 60, TEX, 120);
  g.globalCompositeOperation = 'source-over';
  crt(g, rand, TEX / 2 - w / 2, cy - h * 0.46, w, h, true);
  crt(g, rand, TEX / 2 - w * 1.5 - 5, cy - h * 0.46, w, h, false);
  crt(g, rand, TEX / 2 + w / 2 + 5, cy - h * 0.46, w, h, false);
}
// a switchboard that burnt out: the door hanging open, the paint blistered, soot up the wall above it
function burnt(g: CanvasRenderingContext2D, rand: () => number) {
  const x = 84,
    w = 88,
    y = rowOf(2.6),
    h = rowOf(0.7) - y;
  g.fillStyle = '#4a4455'; // the conduit up to the duct
  g.fillRect(x + w / 2 - 5, FIELD_TOP, 10, y - FIELD_TOP);
  // soot: thick over the cabinet, thinning toward the ceiling
  for (let k = 0; k < 9; k++) {
    const cx = x + w / 2 + (rand() - 0.5) * 50,
      top = y - 20 - rand() * 86,
      s = g.createRadialGradient(cx, y, 4, cx, y, y - top);
    s.addColorStop(0, 'rgba(10,8,12,.5)');
    s.addColorStop(1, 'rgba(10,8,12,0)');
    g.fillStyle = s;
    g.fillRect(cx - 70, top, 140, y - top + 10);
  }
  slab(g, x, y, w, h, '#77808a');
  g.fillStyle = '#16131a'; // the inside, where the door stands open
  g.fillRect(x + 6, y + 4, w * 0.5, h - 8);
  for (let row = 0; row < 4; row++)
    for (let k = 0; k < 4; k++) {
      g.fillStyle = rand() < 0.4 ? '#0c0a0f' : '#3f3a48'; // breakers, some melted
      g.fillRect(x + 10 + k * 9, y + 9 + row * 15, 6, 8);
    }
  g.strokeStyle = 'rgba(20,16,26,.6)';
  g.lineWidth = 1.5;
  g.strokeRect(x + w * 0.56 + 4, y + 5, w * 0.44 - 9, h - 10);
  // a small warning mark on the door: a yellow triangle
  g.fillStyle = '#c7a43c';
  g.beginPath();
  g.moveTo(x + w * 0.78, y + 14);
  g.lineTo(x + w * 0.78 + 9, y + 25);
  g.lineTo(x + w * 0.78 - 9, y + 25);
  g.fill();
  g.fillStyle = '#1c1820';
  g.fillRect(x + w * 0.78 - 0.8, y + 18, 1.6, 4);
  g.fillRect(x + w * 0.78 - 0.8, y + 23, 1.6, 1.2);
  // scorched from the top down, the paint blistered
  const scorch = g.createLinearGradient(0, y, 0, y + h * 0.75);
  scorch.addColorStop(0, 'rgba(10,8,12,.85)');
  scorch.addColorStop(1, 'rgba(10,8,12,0)');
  g.fillStyle = scorch;
  g.fillRect(x, y, w, h * 0.75);
  for (let k = 0; k < 16; k++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '120,84,60' : '14,11,16'},${0.3 + rand() * 0.3})`;
    oval(g, x + rand() * w, y + rand() * h * 0.6, 2 + rand() * 5, 1 + rand() * 2.5);
  }
}
// a cable ladder up the wall, thick with cables; a few have slipped their ties and hang in loops
function cables(g: CanvasRenderingContext2D, rand: () => number) {
  const x = TEX / 2 - 24,
    w = 48,
    tones = ['#2d2836', '#3b3546', '#544d62', '#8e8778', '#2d2836', '#6a5a52'];
  g.fillStyle = '#9a94a6'; // the ladder's two rails and its rungs
  g.fillRect(x - 3, 0, 3, TEX);
  g.fillRect(x + w, 0, 3, TEX);
  for (let y = 10; y < TEX; y += 21) g.fillRect(x, y, w, 2);
  for (let k = 0; k < 13; k++) {
    const cx = x + 3 + k * 3.4 + rand() * 1.5;
    g.fillStyle = tones[Math.floor(rand() * tones.length)]!;
    g.fillRect(cx, 0, 2.2 + rand() * 1.6, TEX);
    g.fillStyle = 'rgba(230,224,244,.14)';
    g.fillRect(cx, 0, 0.8, TEX);
  }
  g.fillStyle = '#211d28'; // ties
  for (let y = 30; y < TEX; y += 63) g.fillRect(x - 1, y, w + 2, 2.5);
  // the loose ones
  g.lineWidth = 2.2;
  for (let k = 0; k < 3; k++) {
    const from = FIELD_TOP + 20 + rand() * 40,
      drop = 50 + rand() * 60,
      reach = (k % 2 ? 1 : -1) * (40 + rand() * 46);
    g.strokeStyle = tones[k]!;
    g.beginPath();
    g.moveTo(TEX / 2, from);
    g.bezierCurveTo(
      TEX / 2 + reach,
      from + drop * 0.4,
      TEX / 2 + reach,
      from + drop,
      TEX / 2 + reach * 0.3,
      from + drop,
    );
    g.stroke();
  }
  // a junction box beside the ladder
  slab(g, x + w + 14, rowOf(1.9), 34, 18, '#7f7a8c');
  g.fillStyle = '#2d2836';
  g.fillRect(x + w + 3, rowOf(1.9) + 8, 11, 2.2);
}
// an enamel plate with words on it, the letters set upright on the wall
function wordPlate(
  g: CanvasRenderingContext2D,
  [x, y, w, h]: [number, number, number, number],
  plate: string,
  ink: string,
  words: string,
) {
  slab(g, x, y, w, h, plate);
  g.strokeStyle = ink;
  g.lineWidth = 1.5;
  g.strokeRect(x + 3, y + 2, w - 6, h - 4);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(x + w / 2, y + h / 2 + 0.5);
  g.scale(1, WALL_ASPECT);
  g.font = `900 ${Math.floor(Math.min((w - 14) / words.length, (h - 8) / WALL_ASPECT))}px ${SIGN_FONT}`;
  g.fillText(words, 0, 0, w - 12);
  g.restore();
  // rust creeping in from a corner
  g.fillStyle = 'rgba(120,70,40,.45)';
  g.fillRect(x, y + h - 2.5, w * 0.35, 2.5);
  g.fillRect(x + w - 4, y, 4, h * 0.4);
}
const noiseWall =
  (kind: WallKind): Paint =>
  (g, rand) => {
    shell(g, rand);
    if (kind === 'board' || kind === 'notice' || kind === 'rack' || kind === 'burnt' || kind === 'cables')
      board(g, rand);
    if (kind === 'foam') foam(g, rand);
    else if (kind === 'cloth') cloth(g, rand);
    else if (kind === 'rack') racks(g, rand);
    else if (kind === 'monitor') monitors(g, rand);
    else if (kind === 'burnt') burnt(g, rand);
    else if (kind === 'cables') cables(g, rand);
    else if (kind === 'notice') {
      wordPlate(g, [TEX / 2 - 42, rowOf(2.75), 84, 30], '#d9d4c6', '#8a2a24', NOISE_PLATE_QUIET);
      wordPlate(g, [TEX / 2 - 62, rowOf(1.95), 124, 13], '#3d4a66', '#dcd8e4', NOISE_PLATE_STAFF);
    }
    trim(g, rand);
    grain(g, rand, 18);
  };

// The ground: the same carpet under every variant (the painter is given the same seed for all of them), worn pale
// where people walked and dark where things were spilt, in soft patches that run on across the picture's edge. So
// the floor reads as one surface and not as tiles; what a variant adds stays clear of the edge
const noiseFloor =
  (variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = '#544968';
    g.fillRect(0, 0, TEX, TEX);
    for (let k = 0; k < 44; k++) {
      const dark = rand() < 0.5;
      smudge(
        g,
        rand() * TEX,
        rand() * TEX,
        16 + rand() * 50,
        12 + rand() * 34,
        dark ? '30,24,42' : '150,140,170',
        0.1 + rand() * 0.16,
      );
    }
    // the pile: fine flecks of the carpet's two yarns
    for (let k = 0; k < 2600; k++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(30,24,42,.3)' : 'rgba(176,166,196,.2)';
      g.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 1.6, 1 + rand() * 1.6);
    }
    if (variant === 1) {
      // the carpet torn away: the screed under it, ridged with old glue
      const cx = 118 + rand() * 20,
        cy = 118 + rand() * 20,
        edge = Array.from({ length: 11 }, (_, n): [number, number] => {
          const a = (n / 11) * Math.PI * 2,
            r = 42 + rand() * 44;
          return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8];
        });
      const shape = () => {
        g.beginPath();
        edge.forEach(([x, y], n) => (n ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
      };
      g.save();
      shape();
      g.clip();
      g.fillStyle = '#6b6577';
      g.fillRect(0, 0, TEX, TEX);
      g.strokeStyle = 'rgba(150,134,96,.4)';
      g.lineWidth = 1.6;
      for (let d = -TEX; d < TEX; d += 7) {
        g.beginPath();
        g.moveTo(d, 0);
        g.lineTo(d + TEX, TEX);
        g.stroke();
      }
      for (let k = 0; k < 30; k++) {
        g.fillStyle = `rgba(40,34,50,${0.1 + rand() * 0.2})`;
        g.fillRect(rand() * TEX, rand() * TEX, 3 + rand() * 16, 2 + rand() * 8);
      }
      g.restore();
      g.strokeStyle = 'rgba(22,17,32,.6)'; // the cut edge of the carpet, standing a little proud
      g.lineWidth = 3;
      shape();
      g.stroke();
      g.strokeStyle = 'rgba(190,180,210,.3)';
      g.lineWidth = 1;
      g.save();
      g.translate(-1.5, -1.5);
      shape();
      g.stroke();
      g.restore();
    } else if (variant === 2) {
      // the lid of a floor box (the wiring runs under the floor): a steel plate let into the carpet
      const x = 84,
        y = 96,
        w = 88,
        h = 62;
      g.fillStyle = 'rgba(18,14,26,.7)';
      g.fillRect(x - 3, y - 3, w + 6, h + 6);
      g.fillStyle = '#8b8797';
      g.fillRect(x, y, w, h);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(${rand() < 0.5 ? '40,34,50' : '220,214,232'},${0.06 + rand() * 0.1})`;
        g.fillRect(x, y + rand() * h, w, 1);
      }
      g.fillStyle = 'rgba(240,234,250,.25)';
      g.fillRect(x, y, w, 1.5);
      g.fillStyle = '#211c2a';
      for (const [sx, sy] of [
        [x + 7, y + 7],
        [x + w - 7, y + 7],
        [x + 7, y + h - 7],
        [x + w - 7, y + h - 7],
      ] as [number, number][])
        oval(g, sx, sy, 2.4, 2.4);
      // the notch a lead comes out of, and the lead
      g.beginPath();
      g.arc(x + w / 2, y + h, 9, Math.PI, 0);
      g.fill();
      g.strokeStyle = '#2b2634';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x + w / 2, y + h - 3);
      g.bezierCurveTo(x + w / 2 + 6, y + h + 30, x + w / 2 + 44, y + h + 16, x + w / 2 + 52, y + h + 44);
      g.stroke();
    } else if (variant === 3) {
      // something leaked here long ago: a dark patch with a tide mark
      const cx = 104 + rand() * 48,
        cy = 104 + rand() * 48;
      for (let k = 0; k < 5; k++) {
        const px = cx + (rand() - 0.5) * 60,
          py = cy + (rand() - 0.5) * 60,
          r = 24 + rand() * 26;
        smudge(g, px, py, r + 5, (r + 5) * 0.75, '164,150,130', 0.2);
        smudge(g, px, py, r, r * 0.75, '24,18,32', 0.5);
      }
    } else if (variant === 4) {
      // marks in tape, where a camera or a stand was to go: worn through in places
      g.save();
      g.translate(96 + rand() * 60, 96 + rand() * 60);
      g.rotate(rand() * Math.PI);
      g.fillStyle = 'rgba(206,198,168,.7)';
      g.fillRect(-34, -4, 68, 8);
      g.fillRect(-4, -4, 8, 46);
      for (let k = 0; k < 26; k++) {
        g.fillStyle = 'rgba(84,73,104,.8)';
        g.fillRect(-34 + rand() * 68, -4 + rand() * 46, 2 + rand() * 7, 1 + rand() * 3);
      }
      g.restore();
    }
    grain(g, rand, 18);
  };
// the top of a deck or a ramp: a studio riser, grey linoleum with a strip of pale tape round its edge, so where a
// deck ends shows
const noiseDeck: Paint = (g, rand) => {
  g.fillStyle = '#716a7e';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 90, '#8d869a', '#3b3447');
  // scuffs
  g.strokeStyle = 'rgba(30,24,40,.35)';
  g.lineWidth = 1.2;
  for (let k = 0; k < 16; k++) {
    const x = rand() * TEX,
      y = rand() * TEX;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 60);
    g.stroke();
  }
  g.strokeStyle = '#cfc8ad';
  g.lineWidth = 9;
  g.strokeRect(5, 5, TEX - 10, TEX - 10);
  for (let k = 0; k < 40; k++) {
    // the tape is worn through here and there
    const along = rand() * TEX,
      far = rand() < 0.5 ? 0 : TEX - 11;
    g.fillStyle = 'rgba(113,106,126,.8)';
    if (rand() < 0.5) g.fillRect(along, far, 3 + rand() * 9, 11);
    else g.fillRect(far, along, 11, 3 + rand() * 9);
  }
  grain(g, rand, 18);
};
// The ceiling: sound-absorbing tiles in a grid of thin bars (a metre apart), one of them stained, a
// lighting track and a run of cables that go on from tile to tile
const noiseCeiling: Paint = (g, rand) => {
  g.fillStyle = '#443b58';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 70, '#584f6e', '#2c2638');
  for (let k = 0; k < 900; k++) {
    g.fillStyle = 'rgba(24,18,34,.4)'; // the tiles' pin holes
    g.fillRect(rand() * TEX, rand() * TEX, 1.3, 1.3);
  }
  const cell = TEX / 4;
  // one tile stained by a leak
  const leak = g.createRadialGradient(cell * 3.5, cell * 3.4, 3, cell * 3.5, cell * 3.4, cell * 0.6);
  leak.addColorStop(0, 'rgba(120,100,70,.16)');
  leak.addColorStop(0.8, 'rgba(120,100,70,.1)');
  leak.addColorStop(1, 'rgba(120,100,70,0)');
  g.fillStyle = leak;
  g.fillRect(cell * 2.8, cell * 2.7, cell * 1.2, cell * 1.3);
  for (let n = 0; n < 4; n++) {
    g.fillStyle = '#675e7e';
    g.fillRect(n * cell - 1.2, 0, 2.4, TEX);
    g.fillRect(0, n * cell - 1.2, TEX, 2.4);
    g.fillStyle = 'rgba(16,12,24,.4)';
    g.fillRect(n * cell + 1.2, 0, 1.2, TEX);
    g.fillRect(0, n * cell + 1.2, TEX, 1.2);
  }
  // the lighting track, down the middle
  g.fillStyle = 'rgba(12,9,18,.45)';
  g.fillRect(0, TEX / 2 - 6, TEX, 14);
  g.fillStyle = '#2a2633';
  g.fillRect(0, TEX / 2 - 5, TEX, 10);
  g.fillStyle = 'rgba(210,204,226,.3)';
  g.fillRect(0, TEX / 2 - 5, TEX, 1.5);
  g.fillStyle = '#0f0d14';
  g.fillRect(0, TEX / 2 - 1, TEX, 2);
  // cables tied to the grid
  for (const [y, w, c] of [
    [cell * 2.86, 3, '#211d29'],
    [cell * 2.86 + 4, 2.2, '#3a3445'],
    [cell * 2.86 + 7.5, 2.2, '#211d29'],
  ] as [number, number, string][]) {
    g.fillStyle = c;
    g.fillRect(0, y, TEX, w);
  }
  grain(g, rand, 14);
};

// One leaf of a studio's soundproof door (a leaf is 2 m wide and a wall high, so its picture is stretched three
// times as tall): thick, padded in buttoned leatherette the colour of sand, with a round window at eye height, a
// push bar and a steel kick plate. The boss room's is the door of the transmitter hall: bare dark steel between red
// and white stripes, a high-voltage triangle near the top, and the warning written on a yellow plate below the
// height of the door's "BOSS" label (world/doors.ts BOSS_LABEL_Y), so the two do not cover each other
const noiseDoor =
  (boss: boolean): Paint =>
  (g, rand) => {
    const frame = boss ? '#25222c' : '#4a4556';
    g.fillStyle = boss ? '#3d3945' : '#a08c6c';
    g.fillRect(0, 0, TEX, TEX);
    grime(g, rand, 110, boss ? '#5c5766' : '#b8a585', '#2a2430');
    const bars = [4.9, 2.75]; // m above the floor
    if (!boss) {
      // the padding: sewn in diamonds a hand and a half across, a button at every crossing
      const dx = 32,
        dy = dx * DOOR_ASPECT,
        run = TEX / DOOR_ASPECT; // how far a seam goes sideways on its way down the picture
      g.lineWidth = 1.4;
      g.strokeStyle = 'rgba(40,30,22,.42)';
      for (let x = -run; x < TEX + run; x += dx)
        for (const lean of [1, -1]) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x + lean * run, TEX);
          g.stroke();
        }
      for (let row = 0, y = 0; y < TEX; row++, y += dy / 2)
        for (let x = row % 2 ? dx / 2 : 0; x <= TEX; x += dx) {
          g.fillStyle = 'rgba(40,30,22,.5)';
          oval(g, x + 0.6, y + 0.4, 2.6, 2.6 * DOOR_ASPECT);
          g.fillStyle = '#cdbb8e';
          oval(g, x, y, 1.9, 1.9 * DOOR_ASPECT);
        }
    } else {
      // plates, bolted
      for (let y = 6; y < TEX; y += 10.6) {
        g.fillStyle = 'rgba(8,6,12,.5)';
        oval(g, 24, y, 2.6, 2.6 * DOOR_ASPECT);
        oval(g, TEX - 24, y, 2.6, 2.6 * DOOR_ASPECT);
      }
    }
    // the steel frame of the leaf, bars across it
    g.fillStyle = frame;
    g.fillRect(0, 0, 14, TEX);
    g.fillRect(TEX - 14, 0, 14, TEX);
    for (const m of bars) g.fillRect(0, rowOf(m) - 3, TEX, 6);
    g.fillRect(0, 0, TEX, rowOf(5.75));
    g.fillStyle = 'rgba(240,234,250,.14)';
    g.fillRect(14, 0, 1.5, TEX);
    for (const m of bars) g.fillRect(0, rowOf(m) - 3, TEX, 1.2);
    if (boss) {
      const red = '#b32a22',
        white = '#ddd8d2';
      stripes(g, [14, rowOf(5.75), TEX - 28, rowOf(5.3) - rowOf(5.75)], 46, white, red);
      stripes(g, [14, rowOf(0.85), TEX - 28, rowOf(0.15) - rowOf(0.85)], 46, white, red);
      // the high-voltage triangle
      const cx = TEX / 2,
        top = rowOf(5.15),
        foot = rowOf(4.4);
      g.fillStyle = FRAME_BLACK;
      g.beginPath();
      g.moveTo(cx, top - 2);
      g.lineTo(cx + 62, foot + 1.5);
      g.lineTo(cx - 62, foot + 1.5);
      g.fill();
      g.fillStyle = '#e2b83a';
      g.beginPath();
      g.moveTo(cx, top + 2.5);
      g.lineTo(cx + 50, foot - 1);
      g.lineTo(cx - 50, foot - 1);
      g.fill();
      g.fillStyle = FRAME_BLACK; // the bolt
      g.beginPath();
      g.moveTo(cx + 6, top + 8);
      g.lineTo(cx - 12, top + 20);
      g.lineTo(cx - 1, top + 20);
      g.lineTo(cx - 8, foot - 3);
      g.lineTo(cx + 13, top + 16.5);
      g.lineTo(cx + 2, top + 16.5);
      g.fill();
      // the yellow plate with the warning, one character over the other
      const ptop = rowOf(2.8),
        pfoot = rowOf(1.0);
      slab(g, 52, ptop, TEX - 104, pfoot - ptop, '#e2b83a');
      g.strokeStyle = FRAME_BLACK;
      g.lineWidth = 5;
      g.strokeRect(59, ptop + 2.4, TEX - 118, pfoot - ptop - 4.8);
      g.fillStyle = FRAME_BLACK;
      g.font = `900 62px ${SIGN_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.save();
      g.scale(1, DOOR_ASPECT);
      const step = (pfoot - ptop - 8) / NOISE_DANGER.length;
      [...NOISE_DANGER].forEach((ch, n) => g.fillText(ch, TEX / 2, (ptop + 4 + step * (n + 0.5)) / DOOR_ASPECT + 5));
      g.restore();
    } else {
      // the round window: a steel ring, dark glass with a little of the corridor's light in it
      const cy = rowOf(1.72),
        r = 34;
      g.fillStyle = 'rgba(30,22,16,.5)';
      oval(g, TEX / 2 + 1.5, cy + 1, r + 7, (r + 7) * DOOR_ASPECT);
      g.fillStyle = '#a9a4b4';
      oval(g, TEX / 2, cy, r + 6, (r + 6) * DOOR_ASPECT);
      g.fillStyle = '#231f2e';
      oval(g, TEX / 2, cy, r, r * DOOR_ASPECT);
      g.fillStyle = 'rgba(170,160,214,.3)';
      oval(g, TEX / 2 - 9, cy - 3, r * 0.5, r * 0.2 * DOOR_ASPECT);
      // the push bar and the kick plate
      slab(g, 30, rowOf(1.12), TEX - 60, 3.4, '#b5b0c0');
      slab(g, 14, rowOf(0.55), TEX - 28, rowOf(0.06) - rowOf(0.55), '#8d889a');
      for (let k = 0; k < 14; k++) {
        g.fillStyle = 'rgba(30,24,40,.3)'; // kicked and scuffed
        g.fillRect(20 + rand() * (TEX - 50), rowOf(0.5) + rand() * 16, 6 + rand() * 20, 1);
      }
    }
    const dirt = g.createLinearGradient(0, 0, 0, TEX * 0.25);
    dirt.addColorStop(0, 'rgba(20,16,28,.4)');
    dirt.addColorStop(1, 'rgba(20,16,28,0)');
    g.fillStyle = dirt;
    g.fillRect(0, 0, TEX, TEX * 0.25);
    grain(g, rand, 18);
  };

// the deep noise's look (world/looks.ts makes it the first time the sector is drawn)
export function noisePictures(): Pictures {
  return {
    walls: WALL_KINDS.map((kind, v) => paint(2600 + v, noiseWall(kind))),
    floors: Array.from({ length: NOISE_FLOORS }, (_, v) => paint(2700, noiseFloor(v))),
    deck: paint(2800, noiseDeck),
    ceiling: paint(2900, noiseCeiling),
    door: paint(3000, noiseDoor(false)),
    bossDoor: paint(3001, noiseDoor(true)),
    fog: 0x1a1526,
  };
}
