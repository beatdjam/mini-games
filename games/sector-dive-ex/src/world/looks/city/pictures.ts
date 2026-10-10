import { CITY_EXIT, CITY_KEEP_OUT } from '../../../i18n/signs.ts';
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
  words,
} from '../paint.ts';
import type { Paint } from '../paint.ts';
// The old downtown (CITY): a wide floor of an old office building late in the afternoon. Beige wall panels and grey
// carpet, a hung ceiling with its lamps mostly off, and the low sun coming amber through the blinds. The sector is
// seen from far away (its fog starts late), so most of the walls are plain and the lights are kept soft: the enemies
// and the snipers' lasers must stand out from the room.
// ---- tuning numbers used only here ----
// (the wall pictures by number: CITY_WALL_PICS)
const WALL_CLOTH = 1;
const CITY_FLOORS = 6; // 0 carpet, 1 a stain, 2 a floor box, 3 carpet gone (old vinyl tiles), 4 newer carpet tiles, 5 papers
const CARPET = 32; // side of a carpet tile in the picture (px): half a metre
const CARPET_SHIFT = 16; // the carpet's joints are moved this far, so none of them lies on the picture's edge (px)
const FRAME = '#5b564c'; // aluminium frames gone dull
const SKIRTING = '#433b30';
const EXIT_GREEN = '#1d8651';
export const BARRIER_RED = '#b02a22';
export const BARRIER_WHITE = '#e4dccb';
const BARRIER_WORN = 'rgba(30,18,12,.2)'; // the dirt over the lower part of a barrier's stripes

// warm light added to a part of the picture: the low sun, or what a window throws on the wall round it
function warm(g: CanvasRenderingContext2D, x: number, y: number, r: number, strength: number) {
  const glow = g.createRadialGradient(x, y, r * 0.1, x, y, r);
  glow.addColorStop(0, `rgba(255,190,110,${strength})`);
  glow.addColorStop(1, 'rgba(255,190,110,0)');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = glow;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.globalCompositeOperation = 'source-over';
}
// a box with a soft shadow under and beside it, lit from above
function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  g.fillStyle = 'rgba(20,14,8,.35)';
  g.fillRect(x + 2.5, y + 2, w, h);
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,244,222,.2)';
  g.fillRect(x, y, w, 1.5);
  g.fillStyle = 'rgba(0,0,0,.22)';
  g.fillRect(x, y + h - 1.5, w, 1.5);
}
// The office wall under every picture: panels to the picture rail, painted plaster above it, a dark skirting board.
// `cloth`: the panels are covered in ribbed cloth
function panels(g: CanvasRenderingContext2D, rand: () => number, cloth: boolean) {
  const bg = g.createLinearGradient(0, 0, 0, TEX);
  bg.addColorStop(0, '#6c6453'); // in the ceiling's shade
  bg.addColorStop(0.22, '#887d67');
  bg.addColorStop(0.8, '#82775f');
  bg.addColorStop(1, '#6b6150');
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 70, '#9d927a', '#4d4638');
  const rail = rowOf(3.2),
    foot = rowOf(0.2);
  if (cloth) {
    g.fillStyle = 'rgba(96,104,92,.2)'; // a greyer cloth
    g.fillRect(0, rail, TEX, foot - rail);
    g.fillStyle = 'rgba(30,24,16,.1)';
    for (let x = 1; x < TEX; x += 4) g.fillRect(x, rail, 1, foot - rail);
  }
  // the joints between the panels (2 m wide), and the rail over them
  for (const x of [0, TEX / 2]) {
    g.fillStyle = 'rgba(30,22,14,.34)';
    g.fillRect(x - 0.75, rail, 1.5, foot - rail);
    g.fillStyle = 'rgba(255,246,226,.16)';
    g.fillRect(x + 0.75, rail, 1, foot - rail);
  }
  g.fillStyle = 'rgba(30,22,14,.4)';
  g.fillRect(0, rail - 2.5, TEX, 2.5);
  g.fillStyle = 'rgba(255,246,226,.2)';
  g.fillRect(0, rail - 3.5, TEX, 1);
  // scuffs low down, where chairs and trolleys have rubbed
  for (let k = 0; k < 9; k++) {
    g.fillStyle = `rgba(40,32,24,${0.08 + rand() * 0.12})`;
    g.fillRect(rand() * TEX, rowOf(0.3 + rand() * 0.8), 8 + rand() * 30, 1 + rand() * 1.5);
  }
  // a water mark or two from the ceiling
  for (let k = 0; k < 3; k++) {
    const len = 20 + rand() * 50,
      st = g.createLinearGradient(0, 0, 0, len);
    st.addColorStop(0, 'rgba(70,56,38,.3)');
    st.addColorStop(1, 'rgba(70,56,38,0)');
    g.fillStyle = st;
    g.fillRect(rand() * TEX, 0, 3 + rand() * 9, len);
  }
  // the low sun lies along the lower part of every wall: the same all the way across, so it does not show as a patch
  const sun = g.createLinearGradient(0, rowOf(3.6), 0, rowOf(0.2));
  sun.addColorStop(0, 'rgba(255,170,84,0)');
  sun.addColorStop(0.55, 'rgba(255,170,84,.15)');
  sun.addColorStop(1, 'rgba(255,170,84,.04)');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = sun;
  g.fillRect(0, rowOf(3.6), TEX, rowOf(0.2) - rowOf(3.6));
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = SKIRTING;
  g.fillRect(0, foot, TEX, TEX - foot);
  g.fillStyle = 'rgba(255,240,215,.18)';
  g.fillRect(0, foot, TEX, 1);
}
// A window with a slatted blind, the low sun behind it. `raised`: this share of the pane shows under the blind (the
// roofs of the old downtown against the sky)
function blindWindow(g: CanvasRenderingContext2D, rand: () => number, raised: number) {
  const x = 28,
    w = TEX - 56,
    y = rowOf(4.5),
    h = rowOf(1.05) - y,
    open = y + h * (1 - raised);
  warm(g, TEX / 2, y + h / 2, 150, 0.2);
  g.fillStyle = FRAME;
  g.fillRect(x - 5, y - 4, w + 10, h + 8);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const sky = g.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, '#d9b377');
  sky.addColorStop(0.7, '#e2a961');
  sky.addColorStop(1, '#c98447');
  g.fillStyle = sky;
  g.fillRect(x, y, w, h);
  if (raised) {
    // the sun low between the buildings, then two rows of roofs, the nearer one darker
    warm(g, x + w * 0.62, open + (y + h - open) * 0.45, 46, 0.5);
    for (const [shade, low, high] of [
      ['#8f6a4c', 6, 20],
      ['#57422f', 2, 12],
    ] as [string, number, number][]) {
      g.fillStyle = shade;
      for (let bx = x - 4; bx < x + w;) {
        const bw = 9 + rand() * 20,
          bh = low + rand() * (high - low);
        g.fillRect(bx, y + h - bh, bw, bh);
        if (rand() < 0.3) g.fillRect(bx + bw * 0.4, y + h - bh - 4, 1.5, 4); // an aerial
        bx += bw + rand() * 3;
      }
    }
  }
  // the slats: each one lit from behind, a line of sky between two of them
  for (let sy = y; sy < open - 3; sy += 5) {
    g.fillStyle = '#b89668';
    g.fillRect(x, sy, w, 4);
    g.fillStyle = 'rgba(255,226,170,.3)';
    g.fillRect(x, sy, w, 1.2);
    g.fillStyle = 'rgba(70,46,22,.32)';
    g.fillRect(x, sy + 3, w, 1);
  }
  // a few slats bent or hanging: the sky shows through
  for (let k = 0; k < 4; k++) {
    const sy = y + 5 * Math.floor((rand() * (open - y - 10)) / 5),
      sx = x + rand() * (w - 50);
    g.fillStyle = 'rgba(244,200,130,.75)';
    g.fillRect(sx, sy + 2.6, 18 + rand() * 30, 2.2);
  }
  // brighter in the middle of the blind than at its edges
  const side = g.createLinearGradient(x, 0, x + w, 0);
  side.addColorStop(0, 'rgba(50,30,12,.3)');
  side.addColorStop(0.3, 'rgba(50,30,12,0)');
  side.addColorStop(0.7, 'rgba(50,30,12,0)');
  side.addColorStop(1, 'rgba(50,30,12,.3)');
  g.fillStyle = side;
  g.fillRect(x, y, w, open - y);
  // the blind's bottom rail and its cords
  g.fillStyle = '#7d6a50';
  g.fillRect(x, open - 3, w, 3);
  g.fillStyle = 'rgba(60,40,20,.5)';
  for (const cx of [x + 26, x + w - 26]) g.fillRect(cx, y, 1, open - y);
  g.restore();
  g.fillStyle = FRAME;
  g.fillRect(TEX / 2 - 2.5, y, 5, h);
  g.fillStyle = 'rgba(255,240,210,.22)';
  g.fillRect(x - 5, y - 4, w + 10, 1);
  // the sill, and the heater cabinet that runs under the windows
  box(g, x - 10, y + h + 4, w + 20, 4.5, '#7a7467');
  const top = rowOf(0.82),
    foot = rowOf(0.2);
  box(g, 10, top, TEX - 20, foot - top, '#8a8577');
  g.fillStyle = 'rgba(28,24,18,.5)';
  for (let gx = 22; gx < TEX - 24; gx += 5) g.fillRect(gx, top + 4, 2.5, 5);
  g.fillStyle = 'rgba(30,24,16,.3)';
  for (const jx of [TEX * 0.34, TEX * 0.67]) g.fillRect(jx, top, 1.2, foot - top);
}
// a sheet of paper pinned or lying somewhere, with a few lines of writing
function sheet(g: CanvasRenderingContext2D, rand: () => number, w: number, h: number, color: string) {
  g.fillStyle = 'rgba(20,14,8,.3)';
  g.fillRect(-w / 2 + 1.2, -h / 2 + 1.2, w, h);
  g.fillStyle = color;
  g.fillRect(-w / 2, -h / 2, w, h);
  g.fillStyle = 'rgba(40,40,46,.45)';
  for (let ly = -h / 2 + 2.5; ly < h / 2 - 1.5; ly += 2.2)
    g.fillRect(-w / 2 + 2, ly, (w - 4) * (0.5 + rand() * 0.5), 0.8);
}
const PAPERS = ['#cfc9b8', '#d6cfae', '#b9c4c6', '#cdb9b0', '#c2c9b0'];
// an air grille under the ceiling, a switch plate and a thermostat by the panel joint
const ventAndSwitch: Paint = g => {
  const y = rowOf(5.15);
  box(g, 92, y, 72, 19, '#6f6a5f');
  g.fillStyle = 'rgba(20,16,12,.6)';
  for (let sy = y + 3; sy < y + 17; sy += 3.2) g.fillRect(96, sy, 64, 1.6);
  box(g, 198, rowOf(1.45), 12, 8, '#c4bca6');
  g.fillStyle = 'rgba(60,54,44,.7)';
  g.fillRect(200.5, rowOf(1.45) + 2, 3, 4);
  g.fillRect(205, rowOf(1.45) + 2, 3, 4);
  box(g, 174, rowOf(1.5), 11, 9, '#b8b2a2');
};
// a partition of frosted glass in an aluminium frame, a room in the last of the sun behind it
const glassPartition: Paint = (g, rand) => {
  const y = rowOf(4.6),
    foot = rowOf(0.95),
    h = foot - y;
  g.fillStyle = FRAME;
  g.fillRect(0, y - 4, TEX, rowOf(0.2) - y + 4);
  box(g, 4, foot + 3, TEX - 8, rowOf(0.2) - foot - 4, '#7c776b');
  for (let p = 0; p < 3; p++) {
    const x = 5 + p * 83,
      w = 80;
    const glass = g.createLinearGradient(0, y, 0, foot);
    glass.addColorStop(0, '#8d9388');
    glass.addColorStop(0.55, '#a3a595');
    glass.addColorStop(1, '#8a8a7b');
    g.fillStyle = glass;
    g.fillRect(x, y, w, h);
    // what stands behind the glass: only its shape, soft
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    for (let k = 0; k < 3; k++) {
      const sw = 18 + rand() * 30,
        sh = 14 + rand() * 34;
      g.fillStyle = 'rgba(58,50,40,.16)';
      for (let b = 0; b < 4; b++) g.fillRect(x + rand() * (w - sw) - b, foot - sh - b, sw + b * 2, sh + b);
    }
    g.restore();
    g.fillStyle = 'rgba(255,255,244,.14)'; // a band left clear, at eye height
    for (let b = 0; b < 4; b++) g.fillRect(x, rowOf(1.75) + b * 2.4, w, 1);
  }
  warm(g, TEX * 0.6, y + h * 0.45, 120, 0.22);
};
// a notice board: cork in a frame, sheets pinned to it at all angles
const noticeBoard: Paint = (g, rand) => {
  const x = 40,
    w = TEX - 80,
    y = rowOf(3.0),
    h = rowOf(1.25) - y;
  box(g, x - 4, y - 3, w + 8, h + 6, FRAME);
  g.fillStyle = '#93744d';
  g.fillRect(x, y, w, h);
  for (let k = 0; k < 220; k++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(60,40,20,.25)' : 'rgba(190,160,110,.25)';
    g.fillRect(x + rand() * w, y + rand() * h, 1.5, 1);
  }
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  for (let k = 0; k < 9; k++) {
    const px = x + 18 + (k % 5) * 35 + rand() * 8,
      py = y + (k < 5 ? h * 0.3 : h * 0.72) + (rand() - 0.5) * 8;
    g.save();
    g.translate(px, py);
    g.rotate((rand() - 0.5) * 0.3);
    sheet(g, rand, 24 + rand() * 8, 22 + rand() * 6, PAPERS[Math.floor(rand() * PAPERS.length)]!);
    g.fillStyle = rand() < 0.5 ? '#a53a2c' : '#3d5f8a';
    oval(g, 0, -9, 1.5, 1.5 * WALL_ASPECT);
    g.restore();
  }
  g.restore();
};
// an emergency exit: a flush steel door with a push bar, the green sign over it
const emergencyExit: Paint = g => {
  const x = 86,
    w = 84,
    y = rowOf(2.2),
    foot = rowOf(0.02);
  g.fillStyle = FRAME;
  g.fillRect(x - 5, y - 4, w + 10, foot - y + 4);
  const steel = g.createLinearGradient(x, 0, x + w, 0);
  steel.addColorStop(0, '#7d8479');
  steel.addColorStop(0.5, '#8d9488');
  steel.addColorStop(1, '#757c72');
  g.fillStyle = steel;
  g.fillRect(x, y, w, foot - y);
  g.fillStyle = 'rgba(20,18,14,.3)';
  g.fillRect(x, foot - 9, w, 9);
  g.fillStyle = '#3f3e39';
  g.fillRect(x + 8, rowOf(1.05), w - 16, 3.5);
  g.fillStyle = 'rgba(255,255,240,.3)';
  g.fillRect(x + 8, rowOf(1.05), w - 16, 1);
  g.fillStyle = '#4c5a58'; // a small wired pane
  g.fillRect(x + w / 2 - 9, rowOf(1.85), 18, 16);
  const sy = rowOf(2.85),
    sh = rowOf(2.4) - sy,
    sx = 80;
  warm(g, TEX / 2, sy + sh / 2, 40, 0.1);
  box(g, sx, sy, 96, sh, '#d5d8c8');
  g.fillStyle = EXIT_GREEN;
  g.fillRect(sx + 2, sy + 2, 26, sh - 4);
  // the running figure, white on green
  g.strokeStyle = '#e9eede';
  g.fillStyle = '#e9eede';
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.save();
  g.translate(sx + 15, sy + sh / 2);
  g.scale(1, WALL_ASPECT);
  oval(g, 2, -9, 2.6, 2.6);
  g.beginPath();
  g.moveTo(2, -5);
  g.lineTo(-1, 2);
  g.lineTo(4, 6);
  g.lineTo(3, 11);
  g.moveTo(-1, 2);
  g.lineTo(-6, 5);
  g.lineTo(-9, 10);
  g.moveTo(1, -3);
  g.lineTo(7, -1);
  g.moveTo(1, -3);
  g.lineTo(-6, -3);
  g.stroke();
  g.restore();
  g.lineCap = 'butt';
  g.fillStyle = EXIT_GREEN;
  words(g, CITY_EXIT, sx + 62, sy + sh / 2 + 0.5, 20, WALL_ASPECT, SIGN_FONT, 60);
};
// stone facing, as round the lifts: slabs with their veins, a dark plinth
const stoneFacing: Paint = (g, rand) => {
  const foot = rowOf(0.3);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 2; c++) {
      const sx = c * (TEX / 2),
        sy = (foot / 4) * r;
      g.fillStyle = ['#8c8371', '#847b69', '#928876', '#877c68'][Math.floor(rand() * 4)]!;
      g.fillRect(sx, sy, TEX / 2, foot / 4);
      g.save();
      g.beginPath();
      g.rect(sx, sy, TEX / 2, foot / 4);
      g.clip();
      for (let v = 0; v < 5; v++) {
        g.strokeStyle = rand() < 0.5 ? 'rgba(232,224,204,.3)' : 'rgba(84,72,58,.26)';
        g.lineWidth = 0.6 + rand() * 1.4;
        let vx = sx + rand() * (TEX / 2),
          vy = sy;
        g.beginPath();
        g.moveTo(vx, vy);
        while (vy < sy + foot / 4) {
          vx += (rand() - 0.5) * 26;
          vy += 4 + rand() * 12;
          g.lineTo(vx, vy);
        }
        g.stroke();
      }
      g.restore();
      g.fillStyle = 'rgba(40,32,24,.4)';
      g.fillRect(sx, sy, TEX / 2, 1);
      g.fillRect(sx, sy, 1, foot / 4);
    }
  // the polish catches the light
  const sheen = g.createLinearGradient(0, 0, TEX, TEX * 0.6);
  sheen.addColorStop(0.3, 'rgba(255,236,200,0)');
  sheen.addColorStop(0.5, 'rgba(255,236,200,.14)');
  sheen.addColorStop(0.7, 'rgba(255,236,200,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, TEX, foot);
  g.fillStyle = '#463e34';
  g.fillRect(0, foot, TEX, TEX - foot);
  g.fillStyle = 'rgba(255,240,215,.2)';
  g.fillRect(0, foot, TEX, 1);
};
// an old vending machine, switched off, and the bin for its cans
const vendingMachine: Paint = (g, rand) => {
  const x = 70,
    w = 86,
    y = rowOf(1.95),
    foot = rowOf(0.04),
    h = foot - y;
  box(g, x, y, w, h, '#96937f');
  g.fillStyle = '#7e5546'; // the faded band along its top
  g.fillRect(x, y, w, 8);
  g.fillStyle = '#2d302c';
  g.fillRect(x + 6, y + 12, w - 12, 34);
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 7; c++) {
      g.fillStyle = ['#7c4a3c', '#4f6a78', '#87783f', '#56705a', '#84807a'][Math.floor(rand() * 5)]!;
      g.fillRect(x + 9 + c * 10, y + 15 + r * 16, 7, 10);
      g.fillStyle = 'rgba(214,208,190,.7)';
      g.fillRect(x + 9 + c * 10, y + 26.5 + r * 16, 7, 2);
    }
  g.fillStyle = 'rgba(255,244,220,.1)'; // the glass
  g.fillRect(x + 6, y + 12, (w - 12) * 0.4, 34);
  g.fillStyle = '#6c6b61';
  g.fillRect(x + w - 22, y + 50, 16, 14);
  g.fillStyle = '#23241f';
  g.fillRect(x + w - 18, y + 53, 8, 2);
  g.fillRect(x + 8, y + h - 16, w - 34, 9);
  g.fillStyle = 'rgba(30,24,18,.3)';
  g.fillRect(x, y + h - 3, w, 3);
  const bx = 170,
    by = rowOf(0.85);
  box(g, bx, by, 28, foot - by, '#5f6d70');
  g.fillStyle = '#22272a';
  oval(g, bx + 14, by + 8, 6, 6 * WALL_ASPECT);
};
// filing cabinets in a row, boxes left on top of them
const filingCabinets: Paint = g => {
  const y = rowOf(1.9),
    foot = rowOf(0.06),
    h = foot - y;
  for (let c = 0; c < 3; c++) {
    const x = 20 + c * 72,
      w = 70;
    box(g, x, y, w, h, c === 1 ? '#7b8274' : '#828878');
    if (c === 1) {
      // two doors
      g.fillStyle = 'rgba(20,18,14,.45)';
      g.fillRect(x + w / 2 - 0.6, y + 3, 1.2, h - 6);
      g.fillStyle = '#3b3c36';
      g.fillRect(x + w / 2 - 6, y + h * 0.45, 3, 7);
      g.fillRect(x + w / 2 + 3, y + h * 0.45, 3, 7);
    } else
      for (let d = 0; d < 4; d++) {
        const dy = y + 2 + (d * (h - 4)) / 4;
        g.fillStyle = 'rgba(20,18,14,.45)';
        g.fillRect(x + 2, dy + (h - 4) / 4 - 1, w - 4, 1);
        g.fillStyle = '#3b3c36';
        g.fillRect(x + w / 2 - 9, dy + 9, 18, 2);
        g.fillStyle = '#c9c3ae';
        g.fillRect(x + w / 2 - 7, dy + 3.5, 14, 3.5);
      }
  }
  box(g, 30, y - 13, 40, 13, '#93744f');
  box(g, 74, y - 9, 30, 9, '#8a6c49');
  box(g, 176, y - 15, 44, 15, '#93744f');
  g.fillStyle = 'rgba(214,204,180,.6)';
  g.fillRect(44, y - 9, 12, 4);
  g.fillRect(190, y - 10, 14, 4);
};
// a whiteboard: what was written on it half wiped off
const whiteboard: Paint = (g, rand) => {
  const x = 34,
    w = TEX - 68,
    y = rowOf(3.0),
    h = rowOf(1.2) - y;
  box(g, x - 3, y - 2.5, w + 6, h + 5, '#7a766c');
  g.fillStyle = '#a3a295';
  g.fillRect(x, y, w, h);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  for (let k = 0; k < 16; k++) {
    g.strokeStyle = ['rgba(40,52,96,.4)', 'rgba(120,40,34,.36)', 'rgba(34,34,36,.4)'][k % 3]!;
    g.lineWidth = 1;
    let lx = x + 10 + rand() * (w - 70);
    const ly = y + 8 + rand() * (h - 16);
    g.beginPath();
    g.moveTo(lx, ly);
    for (let s = 0; s < 8; s++) {
      lx += 3 + rand() * 6;
      g.lineTo(lx, ly + (rand() - 0.5) * 3.5);
    }
    g.stroke();
  }
  for (let k = 0; k < 5; k++) {
    g.fillStyle = 'rgba(172,171,158,.5)'; // where a hand has wiped
    oval(g, x + rand() * w, y + rand() * h, 18 + rand() * 20, 5 + rand() * 6);
  }
  g.restore();
  box(g, x + 8, y + h + 2.5, w - 16, 3, '#6b675e');
  g.fillStyle = '#34322e';
  g.fillRect(x + 40, y + h + 0.5, 14, 2.5);
};
// the casing of a column standing a little out from the wall: lit on one side, a stone foot, a guard on its edges
const pilaster: Paint = g => {
  const x = 92,
    w = 72,
    foot = rowOf(0.2);
  g.fillStyle = 'rgba(20,14,8,.3)';
  g.fillRect(x + w, 0, 7, foot);
  const face = g.createLinearGradient(x, 0, x + w, 0);
  face.addColorStop(0, 'rgba(255,214,150,.2)');
  face.addColorStop(0.5, 'rgba(255,214,150,.07)');
  face.addColorStop(1, 'rgba(20,14,8,.12)');
  g.fillStyle = face;
  g.fillRect(x, 0, w, foot);
  g.fillStyle = 'rgba(255,246,226,.3)';
  g.fillRect(x, 0, 1.2, foot);
  g.fillStyle = 'rgba(30,22,14,.4)';
  g.fillRect(x + w - 1.2, 0, 1.2, foot);
  for (const gx of [x, x + w - 3]) {
    g.fillStyle = 'rgba(120,112,98,.8)';
    g.fillRect(gx, rowOf(1.3), 3, foot - rowOf(1.3));
  }
  box(g, x - 3, rowOf(0.42), w + 6, TEX - rowOf(0.42), '#4b4338');
};
// The wall pictures: what is on the panels of each (nothing on the first two; the second has cloth panels). The first
// is the plainest and comes up most (variantOf).
// (thirteen of them: with twelve, variantOf gives every second tile along a row the same picture)
// along a corridor, in place of the plain panels: glass partitions, notice boards, cabinets, a vending machine, an
// emergency exit, a whiteboard (no windows: those are on the rooms' walls)
export const CITY_LANE_WALLS = [5, 6, 10, 5, 9, 11, 7, 10];
export const CITY_WALL_PICS: (Paint | null)[] = [
  null, // plain panels
  null, // cloth panels (WALL_CLOTH)
  ventAndSwitch,
  (g, rand) => blindWindow(g, rand, 0), // a window with its blind down (WALL_BLIND)
  (g, rand) => blindWindow(g, rand, 0.3), // ... with the blind part raised (WALL_BLIND_RAISED)
  glassPartition,
  noticeBoard,
  emergencyExit,
  stoneFacing,
  vendingMachine,
  filingCabinets,
  whiteboard,
  pilaster,
];
const cityWall =
  (variant: number): Paint =>
  (g, rand) => {
    panels(g, rand, variant === WALL_CLOTH);
    CITY_WALL_PICS[variant]?.(g, rand);
    grain(g, rand, 12);
  };

// The floor: the same carpet under every variant (the painter is given the same seed for all of them). Its tiles are
// half a metre and laid turn about; their joints are faint and none of them lies on the picture's edge, and the worn
// patches run on across that edge, so the floor reads as one carpet and not as squares of four metres
const cityFloor =
  (variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = '#57534a';
    g.fillRect(0, 0, TEX, TEX);
    // the pile lies the other way on every second tile
    for (let r = -1; r <= TEX / CARPET; r++)
      for (let c = -1; c <= TEX / CARPET; c++) {
        g.fillStyle = (r + c) % 2 ? 'rgba(255,244,224,.035)' : 'rgba(0,0,0,.035)';
        g.fillRect(CARPET_SHIFT + c * CARPET, CARPET_SHIFT + r * CARPET, CARPET, CARPET);
      }
    for (let k = 0; k < 40; k++) {
      const dark = rand() < 0.55;
      smudge(
        g,
        rand() * TEX,
        rand() * TEX,
        16 + rand() * 50,
        12 + rand() * 34,
        dark ? '34,30,26' : '132,124,108',
        0.07 + rand() * 0.13,
      );
    }
    // the weave: short flecks, lighter and darker
    for (let k = 0; k < 900; k++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(30,28,24,.2)' : 'rgba(150,142,126,.16)';
      g.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 2, 1);
    }
    g.fillStyle = 'rgba(22,20,17,.2)';
    for (let p = CARPET_SHIFT; p < TEX; p += CARPET) {
      g.fillRect(p, 0, 0.8, TEX);
      g.fillRect(0, p, TEX, 0.8);
    }
    // everything below stays clear of the picture's edge
    if (variant === 1) {
      // something was spilt here long ago: a dark stain with a harder rim
      const cx = 100 + rand() * 56,
        cy = 100 + rand() * 56;
      for (let k = 0; k < 5; k++) {
        const px = cx + (rand() - 0.5) * 50,
          py = cy + (rand() - 0.5) * 50,
          r = 16 + rand() * 24;
        smudge(g, px, py, r + 4, (r + 4) * 0.8, '70,52,34', 0.3);
        smudge(g, px, py, r, r * 0.8, '36,28,22', 0.4);
      }
    } else if (variant === 2) {
      // a floor box: the brass lid over the sockets under the floor, a cable left plugged in
      const x = CARPET_SHIFT + CARPET * 3 + 4,
        y = CARPET_SHIFT + CARPET * 3 + 4,
        s = CARPET - 8;
      g.fillStyle = 'rgba(16,14,12,.6)';
      g.fillRect(x - 2, y - 2, s + 4, s + 4);
      g.fillStyle = '#8b7f62';
      g.fillRect(x, y, s, s);
      g.fillStyle = 'rgba(255,240,200,.25)';
      g.fillRect(x, y, s, 1.5);
      g.fillStyle = 'rgba(24,20,16,.6)';
      g.fillRect(x + 4, y + s / 2 - 0.5, s - 8, 1);
      oval(g, x + s - 6, y + 6, 2, 2);
      g.strokeStyle = 'rgba(22,20,18,.8)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x + s / 2, y + s);
      g.bezierCurveTo(x + s / 2, y + s + 30, x - 30, y + s + 10, x - 44, y + s + 38);
      g.stroke();
    } else if (variant === 3) {
      // carpet tiles taken up: the vinyl tiles of the first fit-out show, with the old glue on them
      const x = CARPET_SHIFT + CARPET * 2,
        y = CARPET_SHIFT + CARPET * 2,
        w = CARPET * 3,
        h = CARPET * 3,
        vinyl = 24;
      g.save();
      g.beginPath();
      g.rect(x, y, w, h);
      g.rect(x + w, y + CARPET, CARPET, CARPET); // one more at the side
      g.clip();
      for (let r = 0; r * vinyl < h; r++)
        for (let c = 0; c * vinyl < w + CARPET; c++) {
          g.fillStyle = (r + c) % 2 ? '#8f8873' : '#6f7868';
          g.fillRect(x + c * vinyl, y + r * vinyl, vinyl - 0.8, vinyl - 0.8);
        }
      for (let k = 0; k < 30; k++) {
        g.fillStyle = `rgba(60,46,28,${0.1 + rand() * 0.2})`;
        g.fillRect(x + rand() * (w + CARPET), y + rand() * h, 6 + rand() * 30, 2 + rand() * 5);
      }
      // the carpet round it stands a little higher: its shadow on two sides
      g.fillStyle = 'rgba(14,12,10,.5)';
      g.fillRect(x, y, w + CARPET, 2);
      g.fillRect(x, y, 2, h);
      g.restore();
    } else if (variant === 4) {
      // a few tiles replaced with newer ones that never matched
      for (const [c, r] of [
        [2, 3],
        [3, 3],
        [3, 4],
        [5, 2],
      ] as [number, number][]) {
        g.fillStyle = 'rgba(86,98,104,.5)';
        g.fillRect(CARPET_SHIFT + c * CARPET + 0.8, CARPET_SHIFT + r * CARPET + 0.8, CARPET - 0.8, CARPET - 0.8);
      }
    } else if (variant === 5) {
      // papers left on the floor
      for (let k = 0; k < 5; k++) {
        g.save();
        g.translate(70 + rand() * 116, 70 + rand() * 116);
        g.rotate(rand() * Math.PI);
        sheet(g, rand, 13, 18, PAPERS[Math.floor(rand() * 3)]!);
        g.restore();
      }
    }
    grain(g, rand, 14);
  };
// The top of a deck or a ramp: a raised floor of pale vinyl tiles laid turn about, lighter than the carpet below, with
// a dark nosing and a brass line round the edge, so where a deck ends shows from across the room
const cityDeck: Paint = (g, rand) => {
  const n = 4,
    s = TEX / n;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      g.fillStyle = (r + c) % 2 ? '#8b826d' : '#7d7562';
      g.fillRect(c * s, r * s, s, s);
      g.fillStyle = 'rgba(30,24,18,.3)';
      g.fillRect(c * s, r * s, s, 1);
      g.fillRect(c * s, r * s, 1, s);
    }
  grime(g, rand, 60, '#a1977f', '#443d31');
  for (let k = 0; k < 14; k++) {
    // scratches where furniture was dragged
    g.strokeStyle = 'rgba(40,34,26,.25)';
    g.lineWidth = 0.8;
    const x = rand() * TEX,
      y = rand() * TEX;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 70, y + (rand() - 0.5) * 70);
    g.stroke();
  }
  const band = 8;
  g.fillStyle = '#463a2d';
  g.fillRect(0, 0, TEX, band);
  g.fillRect(0, TEX - band, TEX, band);
  g.fillRect(0, 0, band, TEX);
  g.fillRect(TEX - band, 0, band, TEX);
  g.strokeStyle = '#a98b50';
  g.lineWidth = 2;
  g.strokeRect(band + 1.5, band + 1.5, TEX - band * 2 - 3, TEX - band * 2 - 3);
  // the ribs of the nosing
  g.fillStyle = 'rgba(0,0,0,.3)';
  for (const p of [2, 5]) {
    g.fillRect(0, p, TEX, 1);
    g.fillRect(0, TEX - p - 1, TEX, 1);
    g.fillRect(p, 0, 1, TEX);
    g.fillRect(TEX - p - 1, 0, 1, TEX);
  }
  grain(g, rand, 12);
};
// The hung ceiling from below: square panels in a grid of thin bars that runs on from tile to tile, one lamp fitting
// in the middle (its tubes are off; the ones that are lit are props), an air outlet, a sprinkler
const cityCeiling: Paint = (g, rand) => {
  const s = TEX / 4;
  g.fillStyle = '#5d584e';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 50, '#6b665a', '#48443c');
  // the little holes of the panels
  g.fillStyle = 'rgba(30,26,22,.22)';
  for (let k = 0; k < 700; k++) g.fillRect(rand() * TEX, rand() * TEX, 1, 1);
  // a stained panel
  g.fillStyle = 'rgba(92,72,44,.22)';
  oval(g, s * 0.5 + s / 2 - 10, s * 0.5, 16, 11);
  // the bars: across the picture on the panel lines, down it half a panel over (so the fitting sits in the middle)
  for (let p = 0; p < 4; p++) {
    g.fillStyle = 'rgba(34,30,26,.3)';
    g.fillRect(0, p * s - 1, TEX, 2);
    g.fillRect(p * s + s / 2 - 1, 0, 2, TEX);
    g.fillStyle = 'rgba(255,246,226,.08)';
    g.fillRect(0, p * s + 1.4, TEX, 1);
    g.fillRect(p * s + s / 2 + 1.4, 0, 1, TEX);
  }
  // the fitting: one panel wide and two long, a louvre over two tubes
  const fx = TEX / 2 - s / 2 + 3,
    fy = s + 3,
    fw = s - 6,
    fh = s * 2 - 6;
  g.fillStyle = '#524e46';
  g.fillRect(fx, fy, fw, fh);
  g.fillStyle = '#6f6b60';
  for (const tx of [fx + fw * 0.3, fx + fw * 0.7]) g.fillRect(tx - 2.5, fy + 5, 5, fh - 10);
  g.fillStyle = 'rgba(20,18,16,.25)';
  for (let ly = fy + 6; ly < fy + fh - 4; ly += 7) g.fillRect(fx + 2, ly, fw - 4, 1.4);
  g.strokeStyle = '#6d695f';
  g.lineWidth = 1.5;
  g.strokeRect(fx, fy, fw, fh);
  // the air outlet: squares one inside the other
  const ax = s * 2.5 + 8,
    ay = s * 3 + 8,
    as = s - 16;
  g.fillStyle = '#68645a';
  g.fillRect(ax, ay, as, as);
  g.strokeStyle = 'rgba(30,26,22,.32)';
  g.lineWidth = 1.6;
  for (let k = 0; k < 4; k++) g.strokeRect(ax + 4 + k * 5, ay + 4 + k * 5, as - 8 - k * 10, as - 8 - k * 10);
  // a sprinkler head and a smoke detector
  g.fillStyle = '#403c36';
  oval(g, s, s * 0.5, 2.5, 2.5);
  g.fillStyle = '#787367';
  oval(g, s, s * 3.5, 6, 6);
  g.fillStyle = 'rgba(30,26,22,.5)';
  oval(g, s, s * 3.5, 3.5, 3.5);
  grain(g, rand, 10);
};
// One leaf of a door (a leaf is 2 m wide and a wall high, so its picture is stretched three times as tall). The
// office's door is bronze aluminium with a tall pane of frosted glass, a push bar across it and a plain panel over
// it up to the ceiling. The boss room's is the fire shutter come down: dark steel slats between red and white
// barrier stripes, two red lamps near the top and the words on a red plate below the height of the door's "BOSS"
// label (world/doors.ts BOSS_LABEL_Y), so the two do not cover each other
const cityDoor =
  (boss: boolean): Paint =>
  (g, rand) => {
    if (boss) {
      const steel = g.createLinearGradient(0, 0, TEX, 0);
      steel.addColorStop(0, '#3a3633');
      steel.addColorStop(0.5, '#4b4743');
      steel.addColorStop(1, '#35312f');
      g.fillStyle = steel;
      g.fillRect(0, 0, TEX, TEX);
      grime(g, rand, 90, '#6b6660', '#191614');
      // the slats
      for (let y = 0; y < TEX; y += 4) {
        g.fillStyle = 'rgba(0,0,0,.34)';
        g.fillRect(0, y, TEX, 1.2);
        g.fillStyle = 'rgba(255,240,220,.07)';
        g.fillRect(0, y + 1.2, TEX, 1);
      }
      // the guide rails at the sides
      g.fillStyle = '#26221f';
      g.fillRect(0, 0, 12, TEX);
      g.fillRect(TEX - 12, 0, 12, TEX);
      stripes(g, [12, rowOf(5.75), TEX - 24, rowOf(5.3) - rowOf(5.75)], 46, BARRIER_WHITE, BARRIER_RED, BARRIER_WORN);
      // two red lamps, their light on the slats round them
      const ly = rowOf(4.95);
      for (const lx of [TEX * 0.3, TEX * 0.7]) {
        g.globalCompositeOperation = 'lighter';
        g.save();
        g.translate(lx, ly);
        g.scale(1, DOOR_ASPECT);
        const halo = g.createRadialGradient(0, 0, 4, 0, 0, 60);
        halo.addColorStop(0, 'rgba(255,60,40,.6)');
        halo.addColorStop(1, 'rgba(255,60,40,0)');
        g.fillStyle = halo;
        g.fillRect(-60, -60, 120, 120);
        g.restore();
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#1c1816';
        oval(g, lx, ly, 19, 19 * DOOR_ASPECT);
        g.fillStyle = '#ff5a44';
        oval(g, lx, ly, 14, 14 * DOOR_ASPECT);
        g.fillStyle = 'rgba(255,230,210,.8)';
        oval(g, lx - 3, ly - 1, 5, 5 * DOOR_ASPECT);
      }
      // the red plate with the words, one character over the other
      const top = rowOf(2.75),
        foot = rowOf(1.05);
      g.fillStyle = BARRIER_RED;
      g.fillRect(58, top, TEX - 116, foot - top);
      g.strokeStyle = BARRIER_WHITE;
      g.lineWidth = 5;
      g.strokeRect(65, top + 2.5, TEX - 130, foot - top - 5);
      g.fillStyle = BARRIER_WHITE;
      const step = (foot - top - 8) / CITY_KEEP_OUT.length;
      [...CITY_KEEP_OUT].forEach((ch, n) => words(g, ch, TEX / 2, top + 4 + step * (n + 0.5) + 1, 50, DOOR_ASPECT));
      stripes(g, [12, rowOf(0.85), TEX - 24, rowOf(0.15) - rowOf(0.85)], 46, BARRIER_WHITE, BARRIER_RED, BARRIER_WORN);
      const dirt = g.createLinearGradient(0, 0, 0, TEX * 0.25);
      dirt.addColorStop(0, 'rgba(10,8,7,.5)');
      dirt.addColorStop(1, 'rgba(10,8,7,0)');
      g.fillStyle = dirt;
      g.fillRect(0, 0, TEX, TEX * 0.25);
    } else {
      const head = rowOf(2.55); // the top of the door itself; a fixed-looking panel above
      const metal = g.createLinearGradient(0, 0, TEX, 0);
      metal.addColorStop(0, '#5f5546');
      metal.addColorStop(0.5, '#73684f');
      metal.addColorStop(1, '#5a5042');
      g.fillStyle = metal;
      g.fillRect(0, 0, TEX, TEX);
      grime(g, rand, 70, '#8e8266', '#2a241c');
      // the panel over the door: two sunk fields
      g.strokeStyle = 'rgba(20,16,10,.45)';
      g.lineWidth = 2;
      g.strokeRect(22, rowOf(5.6), TEX - 44, rowOf(4.2) - rowOf(5.6));
      g.strokeRect(22, rowOf(4.0), TEX - 44, rowOf(2.85) - rowOf(4.0));
      g.fillStyle = 'rgba(20,16,10,.6)';
      g.fillRect(0, head - 2, TEX, 4);
      g.fillStyle = 'rgba(255,236,200,.2)';
      g.fillRect(0, head + 2, TEX, 1.2);
      // the pane: frosted, the light of the next room in it
      const gx = 34,
        gw = TEX - 68,
        gy = rowOf(2.3),
        gh = rowOf(0.5) - gy;
      g.fillStyle = '#2f2a22';
      g.fillRect(gx - 4, gy - 1.5, gw + 8, gh + 3);
      const glass = g.createLinearGradient(0, gy, 0, gy + gh);
      glass.addColorStop(0, '#a9a48f');
      glass.addColorStop(0.5, '#c2b490');
      glass.addColorStop(1, '#8f8a78');
      g.fillStyle = glass;
      g.fillRect(gx, gy, gw, gh);
      g.fillStyle = 'rgba(255,250,235,.16)';
      g.beginPath();
      g.moveTo(gx + gw * 0.15, gy);
      g.lineTo(gx + gw * 0.45, gy);
      g.lineTo(gx + gw * 0.2, gy + gh);
      g.lineTo(gx, gy + gh);
      g.lineTo(gx, gy + gh * 0.6);
      g.fill();
      // the push bar and its two posts, a kick plate
      g.fillStyle = '#2f2a22';
      g.fillRect(gx - 4, rowOf(1.12), gw + 8, 3.2);
      g.fillStyle = '#c9bb92';
      g.fillRect(gx - 4, rowOf(1.12), gw + 8, 1.1);
      g.fillStyle = '#8c8674';
      g.fillRect(14, rowOf(0.36), TEX - 28, rowOf(0.06) - rowOf(0.36));
      g.fillStyle = 'rgba(255,244,220,.25)';
      g.fillRect(14, rowOf(0.36), TEX - 28, 1);
    }
    grain(g, rand, 16);
  };

// the old downtown's look (world/looks.ts makes it the first time the sector is drawn)
export function cityPictures(): Pictures {
  return {
    walls: CITY_WALL_PICS.map((_, v) => paint(1100 + v, cityWall(v))),
    laneWalls: CITY_LANE_WALLS,
    floors: Array.from({ length: CITY_FLOORS }, (_, v) => paint(1200, cityFloor(v))),
    deck: paint(1300, cityDeck),
    ceiling: paint(1400, cityCeiling),
    door: paint(1500, cityDoor(false)),
    bossDoor: paint(1501, cityDoor(true)),
    fog: 0x2a1f15,
  };
}
