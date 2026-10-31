import {
  HOSP_AED,
  HOSP_BED_LIFT,
  HOSP_DEPT_GUIDE,
  HOSP_DEPT_LIST,
  HOSP_EXIT,
  HOSP_GUIDE,
  HOSP_HYDRANT,
  HOSP_NOTICE,
  HOSP_POSTERS,
  HOSP_SANITIZER,
  HOSP_TOILET,
} from '../../../i18n/signs.ts';
import type { Pictures, RoomFloors, RoomWalls, WallSides } from '../common.ts';
import { TEX, WALL_ASPECT, grain, grime, oval, paint, rowOf, smudge } from '../paint.ts';
import type { Paint } from '../paint.ts';
import {
  HOSP_KINDS,
  KIND_BAND,
  KIND_WARD,
  PLATE_WHITE,
  SIGN_GREEN,
  STEEL,
  STEEL_DARK,
  box,
  glow,
  panels,
  paper,
  peeled,
} from './shared.ts';
import { plateWords } from './kit.ts';
import { CORRIDOR_PICS, ROOM_FLOOR_PICS, THEATRE_PICS } from './floors.ts';
import { hospRoomKinds } from './rooms.ts';
import { ROOM_FRONTS, ROOM_GROUNDS, ROOM_PICS } from './roomPics.ts';
import { THEATRE_WALL_MAP, THEATRE_WALL_PICS, hospDoor, theatreCeiling, theatreUpper } from './surgery.ts';
import { wardWindowPanes } from './wardPics.ts';
import { cityView } from '../city/backdrop.ts';
// The closed hospital (HOSP): a general hospital shut up at dusk. Mint-green walls under a wooden handrail, cream above,
// linoleum floors; the evening sun comes through the windows and a few bulbs and emergency lamps are still on, so the
// warm light (amber, the last of the sun) is mixed into the green. Paint is peeling, water has come through the ceiling,
// and the beds, chairs and charts are where they were left; nothing here is gruesome. Like the other buildings it is
// seen from far away, so the walls are mostly plain and the lights soft: the enemies, their shots and the pick-ups must
// stand out from the background.
// ---- tuning numbers used only here ----
const CEILING_PANELS = 3; // panels across one ceiling picture
const LIFT_PAD_TOP = 1.9; // m: the padding on the lift car's walls goes up to here
const QUILT = 12; // px across one diamond of quilted padding
// the corridor windows: a steel frame of four panes, a blind half down or a curtain drawn back
const WINDOW_X = 52; // px: the glass's left edge
const WINDOW_W = TEX - 104; // px: its width
const WINDOW_Y = rowOf(3.5); // px: its top
const WINDOW_FOOT = rowOf(1.5); // px: its foot
const WINDOW_H = WINDOW_FOOT - WINDOW_Y; // px: its height
const WINDOW_BAR = 4; // px: the mullion and the transom
const BLIND_DOWN = 0.4; // share of the height the blind hangs over the glass
const CURTAIN_OUT = 4; // px the curtain hangs over the left edge of the glass
const CURTAIN_SHARE = 0.3; // share of the width the curtain covers
const WINDOW_FRAME = 0xc9ccbc; // the frame's white (#c9ccbc), as three.js takes it

// ---- the pictures that stand in any room, on any wall ----
// the floor guide: a dark green board with its heading, a plan of the floor in the colours of the departments round a
// corridor, and the red dot of "you are here"
const floorGuide: Paint = (g, rand) => {
  const x = 40,
    w = TEX - 80,
    y = rowOf(3.5),
    h = rowOf(1.05) - y;
  box(g, x - 4, y - 3, w + 8, h + 6, '#6b6a58');
  g.fillStyle = '#2e4a3f';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#d8d6c2';
  plateWords(g, HOSP_GUIDE, x + w / 2, y + 11, 15, w - 20);
  g.fillRect(x + 10, y + 19, w - 20, 1.4);
  const px = x + 12,
    py = y + 26,
    pw = w - 24,
    ph = h - 54;
  KIND_BAND.forEach((c, n) => {
    const col = n % 3,
      top = n < 3;
    g.fillStyle = c;
    g.fillRect(px + col * (pw / 3) + 1, top ? py : py + ph * 0.66, pw / 3 - 2, ph * 0.34);
  });
  g.fillStyle = '#16282b';
  g.fillRect(px + 1, py + ph * 0.36, pw - 2, ph * 0.28);
  g.fillStyle = '#b3342c';
  oval(g, px + pw * 0.24, py + ph * 0.5, 3, 3 * WALL_ASPECT);
  g.fillStyle = 'rgba(216,214,194,.7)';
  for (let k = 0; k < 4; k++) g.fillRect(x + 10 + k * 36, y + h - 18, 10 + rand() * 14, 2.4);
  g.fillStyle = 'rgba(14,16,12,.2)';
  g.fillRect(x, y, w, h);
};
// the toilets: pale tiles up to the sign, the sign a blue plate with a man, a woman and a person in a wheelchair
const restroom: Paint = g => {
  const tileTop = rowOf(2.3),
    foot = rowOf(0.15);
  g.fillStyle = '#9db8b0';
  g.fillRect(0, tileTop, TEX, foot - tileTop);
  g.fillStyle = 'rgba(20,34,30,.28)';
  for (let ty = tileTop; ty < foot; ty += 7) g.fillRect(0, ty, TEX, 0.8);
  for (let tx = 0; tx < TEX; tx += 10) g.fillRect(tx, tileTop, 0.8, foot - tileTop);
  g.fillStyle = '#2f5a53';
  g.fillRect(0, tileTop - 3, TEX, 3);
  const x = 58,
    w = 140,
    y = rowOf(4.0),
    h = rowOf(2.7) - y;
  box(g, x, y, w, h, '#254050');
  const figure = (cx: number, kind: 'man' | 'woman' | 'chair', color: string) => {
    g.save();
    g.translate(cx, y + h * 0.42);
    g.scale(1, WALL_ASPECT);
    g.fillStyle = color;
    g.strokeStyle = color;
    g.lineWidth = 2;
    oval(g, 0, -17, 4, 4);
    if (kind === 'woman') {
      g.beginPath();
      g.moveTo(-3, -11);
      g.lineTo(3, -11);
      g.lineTo(8, 6);
      g.lineTo(-8, 6);
      g.fill();
      g.fillRect(-3, 6, 2, 9);
      g.fillRect(1, 6, 2, 9);
    } else if (kind === 'man') {
      g.fillRect(-5, -11, 10, 16);
      g.fillRect(-4, 5, 3, 10);
      g.fillRect(1, 5, 3, 10);
    } else {
      g.fillRect(-3, -11, 6, 12);
      g.beginPath();
      g.moveTo(-3, 1);
      g.lineTo(6, 1);
      g.lineTo(8, 12);
      g.stroke();
      g.beginPath();
      g.arc(-1, 7, 8, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  };
  figure(x + w * 0.2, 'man', '#aebdd3');
  figure(x + w * 0.5, 'woman', '#d1a6a7');
  figure(x + w * 0.8, 'chair', '#aebdd3');
  g.fillStyle = '#c0cadc';
  plateWords(g, HOSP_TOILET, x + w / 2, y + h - 9, 15, w - 16);
};
// a fire hydrant box let into the wall: a red door with the word on a plate, the hose coiled behind its window
const hydrant: Paint = g => {
  const x = 88,
    w = 80,
    y = rowOf(1.75),
    foot = rowOf(0.3);
  box(g, x - 4, y - 3, w + 8, foot - y + 3, '#6b2924');
  g.fillStyle = '#8c2d26';
  g.fillRect(x, y, w, foot - y);
  g.fillStyle = 'rgba(255,230,220,.14)';
  g.fillRect(x, y, 2, foot - y);
  g.fillStyle = '#d6ccb9';
  g.fillRect(x + 8, y + 6, w - 16, 15);
  g.fillStyle = '#7d2a23';
  plateWords(g, HOSP_HYDRANT, x + w / 2, y + 14, 14, w - 24);
  g.fillStyle = '#20282c';
  g.fillRect(x + 12, y + 28, w - 24, 30);
  g.strokeStyle = '#4a5a4f';
  g.lineWidth = 3;
  for (let r = 0; r < 3; r++) {
    g.beginPath();
    g.ellipse(x + w / 2, y + 43, 10 + r * 4, (10 + r * 4) * WALL_ASPECT, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#5a1f1b';
  oval(g, x + w / 2, rowOf(1.95), 5, 5 * WALL_ASPECT);
};
// a notice board: a frame round a cork-coloured board, a header, sheets pinned to it at all angles
const noticeBoard: Paint = (g, rand) => {
  const x = 40,
    w = TEX - 80,
    y = rowOf(3.2),
    h = rowOf(1.2) - y;
  box(g, x - 4, y - 3, w + 8, h + 6, '#73684c');
  g.fillStyle = '#a4966e';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#2f4a3f';
  g.fillRect(x, y, w, 15);
  g.fillStyle = '#d8d6c2';
  plateWords(g, HOSP_NOTICE, x + w / 2, y + 8, 12, w - 20);
  g.save();
  g.beginPath();
  g.rect(x, y + 17, w, h - 17);
  g.clip();
  for (let k = 0; k < 8; k++) {
    g.save();
    g.translate(x + 18 + (k % 4) * 42 + rand() * 8, y + (k < 4 ? 0.4 : 0.76) * h + (rand() - 0.5) * 8);
    g.rotate((rand() - 0.5) * 0.3);
    paper(g, rand, 24 + rand() * 8, 22 + rand() * 6, ['#dcd8c4', '#c9d6c8', '#d8d0a8'][k % 3]!);
    g.fillStyle = rand() < 0.5 ? '#a63a2e' : '#3e5f8c';
    oval(g, 0, -9, 1.5, 1.5 * WALL_ASPECT);
    g.restore();
  }
  g.restore();
};
// the emergency exit: a flush steel door with a push bar, the green running-figure sign over it
const emergencyExit: Paint = g => {
  const x = 86,
    w = 84,
    y = rowOf(2.2),
    foot = rowOf(0.02);
  g.fillStyle = STEEL_DARK;
  g.fillRect(x - 5, y - 4, w + 10, foot - y + 4);
  const steel = g.createLinearGradient(x, 0, x + w, 0);
  steel.addColorStop(0, '#8d9990');
  steel.addColorStop(0.5, '#9ca89d');
  steel.addColorStop(1, '#848f86');
  g.fillStyle = steel;
  g.fillRect(x, y, w, foot - y);
  g.fillStyle = 'rgba(20,24,18,.3)';
  g.fillRect(x, foot - 9, w, 9);
  g.fillStyle = '#383c37';
  g.fillRect(x + 8, rowOf(1.05), w - 16, 3.5);
  const sy = rowOf(2.85),
    sh = rowOf(2.4) - sy,
    sx = 80;
  box(g, sx, sy, 96, sh, '#cdd3c0');
  g.fillStyle = SIGN_GREEN;
  g.fillRect(sx + 2, sy + 2, 26, sh - 4);
  g.strokeStyle = '#e4eadc';
  g.fillStyle = '#e4eadc';
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
  g.fillStyle = SIGN_GREEN;
  plateWords(g, HOSP_EXIT, sx + 62, sy + sh / 2 + 0.5, 20, 60);
};
// an AED in its wall cabinet (a green box with the heart and the bolt on it, a window in the door) and a hand-sanitiser
// stand beside it
const defibrillator: Paint = g => {
  const x = 52,
    y = rowOf(2.5);
  box(g, x, y, 62, rowOf(1.5) - y, '#e4e8d9');
  g.fillStyle = SIGN_GREEN;
  g.fillRect(x + 4, y + 4, 54, 16);
  g.fillStyle = '#e8f0e5';
  plateWords(g, HOSP_AED, x + 31, y + 12, 13, 46);
  g.fillStyle = '#1f2b28';
  g.fillRect(x + 8, y + 26, 46, rowOf(1.5) - y - 34);
  g.fillStyle = '#4b9a6c';
  g.fillRect(x + 20, y + 32, 22, 18);
  g.fillStyle = '#e8f0e5';
  g.beginPath();
  g.moveTo(x + 33, y + 34);
  g.lineTo(x + 27, y + 42);
  g.lineTo(x + 32, y + 42);
  g.lineTo(x + 29, y + 48);
  g.lineTo(x + 38, y + 40);
  g.lineTo(x + 33, y + 40);
  g.fill();
  // the stand: a post, a pump bottle, a drip tray; its sign
  g.fillStyle = STEEL_DARK;
  g.fillRect(166, rowOf(1.1), 6, rowOf(0.12) - rowOf(1.1));
  g.fillRect(156, rowOf(0.12) - 3, 26, 3);
  box(g, 158, rowOf(1.5), 22, rowOf(1.1) - rowOf(1.5), PLATE_WHITE);
  g.fillStyle = STEEL;
  g.fillRect(166, rowOf(1.5) - 5, 6, 5);
  g.fillRect(166, rowOf(1.5) - 6, 12, 2);
  g.fillStyle = '#2c5a7b';
  plateWords(g, HOSP_SANITIZER, 169, rowOf(1.32), 6, 20);
};
// a stretch of wall where the paint has come away in big sheets: the plaster under it, the stain above it, curls
const peelingPaint: Paint = (g, rand) => {
  peeled(g, rand, 24, rowOf(3.7), 90, 70);
  peeled(g, rand, 120, rowOf(2.4), 100, 56);
  peeled(g, rand, 60, rowOf(1.3), 60, 30);
  for (let k = 0; k < 5; k++) smudge(g, 20 + rand() * 216, rowOf(3.6 - rand() * 2.4), 14, 9, '70,60,38', 0.28);
};
// a wall where water has run down from a leak above for years: the dark stain with its tide marks, a bloom of mould at
// its foot, the paint blistered on the edge
const stainedWall: Paint = (g, rand) => {
  const cx = 96 + rand() * 60;
  for (let r = 0; r < 4; r++) {
    g.fillStyle = `rgba(78,70,40,${0.2 - r * 0.03})`;
    g.beginPath();
    g.moveTo(cx - 40 - r * 8, 0);
    g.lineTo(cx + 40 + r * 8, 0);
    g.lineTo(cx + 24 + r * 6, rowOf(2.2 + r * 0.25));
    g.lineTo(cx - 24 - r * 6, rowOf(2.2 + r * 0.25));
    g.fill();
  }
  const stream = g.createLinearGradient(0, 0, 0, rowOf(1.4));
  stream.addColorStop(0, 'rgba(60,54,30,.4)');
  stream.addColorStop(1, 'rgba(60,54,30,0)');
  g.fillStyle = stream;
  g.fillRect(cx - 8, 0, 16, rowOf(1.4));
  smudge(g, cx, rowOf(1.5), 34, 14, '40,52,36', 0.35);
  peeled(g, rand, cx - 50, rowOf(3.2), 40, 26);
};
// a window in a corridor's wall at dusk: sky from blue-green to orange over the roofs, a steel frame of four panes, a
// blind half down; the sun's warmth on the wall below it. Seen from outside the building (`outside`: Look.innerWalls),
// the dark corridor behind its glass, and no sun on the wall
function corridorWindow(curtain: boolean, outside = false): Paint {
  return (g, rand) => {
    const x = WINDOW_X,
      w = WINDOW_W,
      y = WINDOW_Y,
      foot = WINDOW_FOOT,
      h = WINDOW_H;
    if (!outside) glow(g, TEX / 2, foot, 150, 0.2);
    box(g, x - 5, y - 4, w + 10, h + 8, '#c9ccbc');
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    if (outside) {
      const dark = g.createLinearGradient(0, y, 0, foot);
      dark.addColorStop(0, '#1b2522');
      dark.addColorStop(1, '#2c3632');
      g.fillStyle = dark;
      g.fillRect(x, y, w, h);
    } else {
      const sky = g.createLinearGradient(0, y, 0, foot);
      sky.addColorStop(0, '#5b8794');
      sky.addColorStop(0.6, '#d0b886');
      sky.addColorStop(1, '#f2c486');
      g.fillStyle = sky;
      g.fillRect(x, y, w, h);
      glow(g, x + w * 0.3, foot - 3, 60, 0.5);
      for (let rx = x; rx < x + w;) {
        const rw = 12 + rand() * 20,
          rh = 6 + rand() * 16;
        g.fillStyle = '#344446';
        g.fillRect(rx, foot - rh, rw, rh);
        rx += rw + 1;
      }
    }
    g.restore();
    g.fillStyle = '#c9ccbc';
    g.fillRect(x + w / 2 - WINDOW_BAR / 2, y, WINDOW_BAR, h);
    g.fillRect(x, y + h / 2 - WINDOW_BAR / 2, w, WINDOW_BAR);
    if (curtain) {
      g.fillStyle = '#a9c4ac';
      g.fillRect(x - CURTAIN_OUT, y - 2, w * CURTAIN_SHARE, h + 14);
      for (let fx = x - CURTAIN_OUT; fx < x - CURTAIN_OUT + w * CURTAIN_SHARE; fx += 7) {
        g.fillStyle = 'rgba(20,34,28,.2)';
        g.fillRect(fx, y - 2, 2, h + 14);
      }
    } else {
      g.fillStyle = '#d4cfb2';
      for (let sy = y; sy < y + h * BLIND_DOWN; sy += 4) g.fillRect(x + 2, sy, w - 4, 3);
    }
    box(g, x - 9, foot + 4, w + 18, 6, '#d6d3c0');
  };
}
// The glass of a corridor window, in the picture's pixels: the four panes between its cross of bars, with the blind's
// share taken off the top or the curtain's strip off the left (Look.outside)
function corridorPanes(curtain: boolean): [number, number, number, number][] {
  const left = curtain ? WINDOW_X - CURTAIN_OUT + WINDOW_W * CURTAIN_SHARE : WINDOW_X,
    right = WINDOW_X + WINDOW_W,
    top = curtain ? WINDOW_Y : WINDOW_Y + WINDOW_H * BLIND_DOWN,
    midX = WINDOW_X + WINDOW_W / 2,
    midY = WINDOW_Y + WINDOW_H / 2,
    bar = WINDOW_BAR / 2;
  return [
    [left, top, midX - bar, midY - bar],
    [midX + bar, top, right, midY - bar],
    [left, midY + bar, midX - bar, WINDOW_FOOT],
    [midX + bar, midY + bar, right, WINDOW_FOOT],
  ];
}
// the board of departments: a heading and a list of names, each with a bar in its colour, an arrow after it
const departmentBoard: Paint = g => {
  const x = 56,
    w = TEX - 112,
    y = rowOf(3.5),
    h = rowOf(1.3) - y;
  box(g, x - 4, y - 3, w + 8, h + 6, STEEL);
  g.fillStyle = '#e4e2d0';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#2f4a3f';
  g.fillRect(x, y, w, 15);
  g.fillStyle = '#d8d6c2';
  plateWords(g, HOSP_DEPT_GUIDE, x + w / 2, y + 8, 12, w - 20);
  HOSP_DEPT_LIST.forEach((name, n) => {
    const ry = y + 22 + n * 15;
    g.fillStyle = KIND_BAND[n % KIND_BAND.length]!;
    g.fillRect(x + 6, ry, 6, 11);
    g.fillStyle = '#2c3a36';
    plateWords(g, name, x + 40, ry + 6, 10, 46);
    g.fillRect(x + w - 24, ry + 5, 16, 1.6);
    g.beginPath();
    g.moveTo(x + w - 8, ry + 5.8);
    g.lineTo(x + w - 14, ry + 2);
    g.lineTo(x + w - 14, ry + 9.6);
    g.fill();
  });
  g.fillStyle = 'rgba(70,60,40,.14)';
  g.fillRect(x, y + h * 0.5, w, h * 0.5);
};
// a health poster: a pale sheet with a big pictogram (two hands under a tap) and its slogan, the corner curling
const healthPoster: Paint = (g, rand) => {
  const x = 78,
    w = 100,
    y = rowOf(3.5),
    h = rowOf(1.7) - y;
  box(g, x, y, w, h, '#dcdac6');
  g.fillStyle = '#7ba6b8';
  g.fillRect(x + 6, y + 6, w - 12, h * 0.52);
  g.fillStyle = '#e6eef0';
  oval(g, x + w * 0.38, y + h * 0.28, 15, 11);
  oval(g, x + w * 0.62, y + h * 0.28, 15, 11);
  g.fillStyle = '#a8c6d4';
  for (let d = 0; d < 4; d++) oval(g, x + w * 0.5 + (d - 1.5) * 8, y + h * 0.5 + (d % 2) * 4, 2, 3);
  g.fillStyle = '#2c3a36';
  plateWords(g, HOSP_POSTERS[0]!, x + w / 2, y + h * 0.75, 11, w - 14);
  g.fillStyle = 'rgba(40,44,44,.45)';
  for (let ly = 0; ly < 2; ly++) g.fillRect(x + 10, y + h * 0.84 + ly * 4, (w - 20) * (0.5 + rand() * 0.5), 1);
  g.fillStyle = '#928f7c';
  g.beginPath();
  g.moveTo(x + w, y + h - 20);
  g.lineTo(x + w - 22, y + h);
  g.lineTo(x + w, y + h);
  g.fill();
  g.fillStyle = 'rgba(214,204,160,.55)';
  g.fillRect(x + w / 2 - 6, y - 2, 12, 5);
};

// ---- the inside of a lift's car: the padded walls of a lift for beds, a thick handrail; one wall has the panels ----
const liftFace: Paint = (g, rand) => {
  const foot = rowOf(0.15),
    pad = rowOf(LIFT_PAD_TOP);
  const wall = g.createLinearGradient(0, 0, TEX, 0);
  wall.addColorStop(0, '#cdc7aa');
  wall.addColorStop(0.5, '#d8d2b6');
  wall.addColorStop(1, '#c6c0a4');
  g.fillStyle = wall;
  g.fillRect(0, 0, TEX, foot);
  for (let x = 0; x < TEX; x += TEX / 4) {
    g.fillStyle = 'rgba(30,26,16,.3)';
    g.fillRect(x - 0.7, 0, 1.4, pad);
  }
  // the quilted pad over the lower part
  g.fillStyle = '#6f8189';
  g.fillRect(0, pad, TEX, foot - pad);
  for (let y = pad; y < foot; y += QUILT)
    for (let x = ((y - pad) / QUILT) % 2 ? QUILT / 2 : 0; x < TEX; x += QUILT) {
      g.fillStyle = 'rgba(255,252,236,.1)';
      g.fillRect(x + 1, y + 1, QUILT - 2, QUILT - 2);
      g.fillStyle = 'rgba(14,22,24,.34)';
      g.fillRect(x, y + QUILT - 1, QUILT, 1);
      g.fillRect(x + QUILT - 1, y, 1, QUILT);
    }
  g.fillStyle = STEEL;
  g.fillRect(0, pad - 3, TEX, 4);
  // the thick wooden handrail on its posts
  g.fillStyle = '#a99467';
  g.fillRect(0, rowOf(1.0), TEX, 7);
  g.fillStyle = 'rgba(255,248,214,.4)';
  g.fillRect(0, rowOf(1.0), TEX, 2);
  g.fillStyle = STEEL_DARK;
  for (let x = TEX / 8; x < TEX; x += TEX / 4) g.fillRect(x - 2, rowOf(1.0) + 7, 4, 8);
  // a strip of pad torn loose at a corner
  g.fillStyle = '#5c6d75';
  g.beginPath();
  g.moveTo(TEX - 40, pad);
  g.lineTo(TEX - 20, pad);
  g.lineTo(TEX - 34, pad + 40);
  g.fill();
  g.fillStyle = '#3a342d';
  g.fillRect(0, foot - 6, TEX, 6);
  grime(g, rand, 40, '#aaa295', '#2a2c24');
};
const liftButtons: Paint = (g, rand) => {
  liftFace(g, rand);
  const x = 140,
    w = 52,
    y = rowOf(2.7),
    h = rowOf(1.4) - y;
  box(g, x, y, w, h, '#4a514f');
  g.fillStyle = '#181400';
  g.fillRect(x + 6, y + 6, w - 12, 12);
  g.fillStyle = '#b46a2b';
  g.fillRect(x + 12, y + 9, 10, 6);
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 2; c++) {
      g.fillStyle = '#c9c0a1';
      oval(g, x + 16 + c * 20, y + 28 + r * 11, 4.2, 4.2 * WALL_ASPECT);
      g.fillStyle = '#4a4339';
      oval(g, x + 16 + c * 20, y + 28 + r * 11, 2.4, 2.4 * WALL_ASPECT);
    }
  // the low panel for someone sitting, and the plate that says what the lift is for
  box(g, x + 4, rowOf(1.25), w - 8, rowOf(0.85) - rowOf(1.25), '#4a514f');
  g.fillStyle = '#c9c0a1';
  for (let c = 0; c < 3; c++) oval(g, x + 14 + c * 12, rowOf(1.05), 3.4, 3.4 * WALL_ASPECT);
  box(g, 40, rowOf(2.6), 70, 20, PLATE_WHITE);
  g.fillStyle = '#2c3a36';
  plateWords(g, HOSP_BED_LIFT, 75, rowOf(2.6) + 10, 8, 62);
};

// The wall pictures, by number. First those that stand in any room and on any wall (nothing on the first, which is the
// plainest and comes up most: variantOf), then the rooms' (roomPics.ts: the fronts, the pictures inside and the bare
// walls, kind by kind), then the operating theatre's.
const COMMON_PICS: (Paint | null)[] = [
  null, // plain panels
  floorGuide,
  restroom,
  hydrant,
  noticeBoard,
  emergencyExit, // WALL_EXIT
  defibrillator,
  peelingPaint,
  stainedWall,
  corridorWindow(false),
  corridorWindow(true),
  departmentBoard,
  healthPoster,
  liftFace,
  liftButtons,
];
const [
  ,
  GUIDE,
  RESTROOM,
  HYDRANT,
  NOTICE,
  WALL_EXIT,
  AED,
  PEEL,
  STAIN,
  WINDOW_A,
  WINDOW_B,
  DEPARTMENTS,
  POSTER,
  LIFT_FACE,
  LIFT_BUTTONS,
] = COMMON_PICS.map((_, n) => n);
const kinds = Array.from({ length: HOSP_KINDS }, (_, n) => n);
// the numbers of the rooms' pictures, after the common ones: all the fronts, all the pictures inside, all the bare walls,
// then the theatre's
let next = COMMON_PICS.length;
const frontWalls = ROOM_FRONTS.map(set => set.map(() => next++)),
  insideWalls = ROOM_PICS.map(set => set.map(() => next++)),
  groundWalls = ROOM_GROUNDS.map(() => next++),
  theatreFirst = next;
export const HOSP_WALL_PICS: (Paint | null)[] = [
  ...COMMON_PICS,
  ...ROOM_FRONTS.flat(),
  ...ROOM_PICS.flat(),
  ...ROOM_GROUNDS,
  ...THEATRE_WALL_PICS,
];
// What the walls that no room owns (the start room's, the light well's and a corridor with no room behind it) are made
// of. 40% are the plain wall, the rest are shared out in twentieths: the peeling paint, the stains and the windows the
// most; the things that stand out (the toilets, the exit, the AED) come up once each. A picture in the list more than
// once comes up that many twentieths. A room's front is only on the wall of its own room, where its board hangs
const COMMON_MAP = [
  0,
  PEEL,
  PEEL,
  PEEL,
  STAIN,
  STAIN,
  STAIN,
  WINDOW_A,
  WINDOW_A,
  WINDOW_B,
  WINDOW_B,
  NOTICE,
  NOTICE,
  POSTER,
  POSTER,
  HYDRANT,
  DEPARTMENTS,
  GUIDE,
  RESTROOM,
  AED,
  WALL_EXIT,
];
// along a corridor, in the places of the plain wall, on the walls that no room owns: mostly the stains and the peeling,
// the windows and the plain wall in between
export const HOSP_LANE_WALLS = [PEEL, 0, STAIN, 0, WINDOW_A, 0, PEEL, 0, WINDOW_B, POSTER, 0, STAIN];
// the walls that something may stand in front of (looks/dress.ts): the plain wall, the peeling and the stains
export const HOSP_BARE_WALLS = [0, PEEL, STAIN];
// the pictures of the walls round a lift: the face of a wall and the one with the panels
export const HOSP_LIFT_WALLS = [LIFT_FACE, LIFT_BUTTONS];
// the pictures with a window in them, where the evening sun lies on the floor in front (props.ts): the corridors' two and
// the ward's big one
export const HOSP_WINDOW_PICS = [WINDOW_A, WINDOW_B, insideWalls[KIND_WARD]![1]!];
export const HOSP_ROOM_WALLS: RoomWalls = {
  plain: COMMON_PICS.length,
  common: COMMON_MAP,
  shops: insideWalls,
  ground: groundWalls,
  fronts: frontWalls,
  hall: THEATRE_WALL_MAP.map(n => theatreFirst + n),
};
// the walls along the corridor that belong to a room: its fronts and the plain wall of its kind beside them. A narrow unit
// may stand at an end of such a face, clear of the door in the middle (looks/dress.ts `edges`)
export const HOSP_EDGE_WALLS = [...HOSP_ROOM_WALLS.fronts.flat(), ...HOSP_ROOM_WALLS.ground];
// the fire exit and the windows (seen through to the dusk outside, Look.outside) only on the building's outside wall
// (common.ts WallSides); on any other wall they give way to the plain one
export const HOSP_WALL_SIDES: WallSides = { outer: [WALL_EXIT, ...HOSP_WINDOW_PICS] };

// the floors: the corridors' own, then the rooms', two to a kind, then the operating theatre's
export const HOSP_ROOM_FLOORS: RoomFloors = {
  plain: CORRIDOR_PICS.length,
  shops: kinds.map(n => [CORRIDOR_PICS.length + 2 * n, CORRIDOR_PICS.length + 2 * n + 1]),
  hall: THEATRE_PICS.map((_, n) => CORRIDOR_PICS.length + ROOM_FLOOR_PICS.length + n),
};
const hospWall =
  (variant: number): Paint =>
  (g, rand) => {
    // (the kinds' pictures paint the wall of their kind themselves; the theatre's paint theirs whole)
    if (variant < HOSP_ROOM_WALLS.plain) panels(g, rand);
    HOSP_WALL_PICS[variant]?.(g, rand);
    grain(g, rand, 12);
  };
// The top of a raised deck or a ramp: a platform of the same linoleum in a darker green-grey with a yellow-and-black
// nosing round the edge and a pale line inside it, so where a deck ends shows from across the room
const hospDeck: Paint = (g, rand) => {
  g.fillStyle = '#7f988a';
  g.fillRect(0, 0, TEX, TEX);
  for (let k = 0; k < 900; k++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(14,20,16,.2)' : 'rgba(210,226,214,.12)';
    g.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 2, 1);
  }
  for (let k = 0; k < 16; k++)
    smudge(g, rand() * TEX, rand() * TEX, 18 + rand() * 40, 12 + rand() * 30, '24,30,22', 0.06 + rand() * 0.08);
  grime(g, rand, 50, '#9bb2a4', '#222c24');
  const band = 8;
  g.fillStyle = '#23251f';
  g.fillRect(0, 0, TEX, band);
  g.fillRect(0, TEX - band, TEX, band);
  g.fillRect(0, 0, band, TEX);
  g.fillRect(TEX - band, 0, band, TEX);
  g.fillStyle = '#d1b236';
  for (let s = 0; s < TEX; s += 16) {
    g.fillRect(s, 0, 8, band);
    g.fillRect(s, TEX - band, 8, band);
    g.fillRect(0, s, band, 8);
    g.fillRect(TEX - band, s, band, 8);
  }
  g.strokeStyle = 'rgba(230,236,220,.5)';
  g.lineWidth = 2;
  g.strokeRect(band + 3, band + 3, TEX - band * 2 - 6, TEX - band * 2 - 6);
  grain(g, rand, 12);
};
// The hung ceiling from below: perforated panels a third of a tile across (1.33 m) in a grid of bars that runs on from tile
// to tile, a troffer of two dead tubes in the middle panel (the ones still lit are props) and a smoke detector. It is
// also stuck on the vertical faces of a light well, so it is kept calm
const hospCeiling: Paint = (g, rand) => {
  const s = TEX / CEILING_PANELS;
  g.fillStyle = '#7e8a80';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 30, '#8c988e', '#5d685f');
  g.fillStyle = 'rgba(30,36,30,.14)'; // the holes of the panels
  for (let k = 0; k < 500; k++) g.fillRect(rand() * TEX, rand() * TEX, 1, 1);
  for (let p = 0; p <= CEILING_PANELS; p++) {
    g.fillStyle = 'rgba(214,222,210,.22)';
    g.fillRect(p * s - 1, 0, 2, TEX);
    g.fillRect(0, p * s - 1, TEX, 2);
  }
  g.fillStyle = '#6a766d';
  g.fillRect(s * 1.5 - 22, s * 1.5 - 9, 44, 18);
  g.fillStyle = '#4a554e';
  g.fillRect(s * 1.5 - 19, s * 1.5 - 6, 38, 4);
  g.fillRect(s * 1.5 - 19, s * 1.5 + 2, 38, 4);
  g.fillStyle = '#c9ccbc';
  oval(g, s * 0.5, s * 2.5, 3, 3);
  smudge(g, rand() * TEX, rand() * TEX, 26, 20, '86,76,46', 0.14); // a leak's tide mark
  grain(g, rand, 10);
};

// the hospital's look (world/looks.ts makes it the first time the sector is drawn)
export function hospPictures(): Pictures {
  return {
    walls: HOSP_WALL_PICS.map((_, v) => paint(4100 + v, hospWall(v))),
    laneWalls: HOSP_LANE_WALLS,
    wallSides: HOSP_WALL_SIDES,
    outside: {
      panes: {
        [WINDOW_A]: corridorPanes(false),
        [WINDOW_B]: corridorPanes(true),
        [insideWalls[KIND_WARD]![1]!]: wardWindowPanes(),
      },
      frame: WINDOW_FRAME,
      ...cityView(),
    },
    // the corridors' windows seen from outside, on the building's own outer walls (courtMesh.ts YARDS)
    innerWalls: Object.fromEntries(
      [WINDOW_A, WINDOW_B].map(v => [
        v,
        paint(4100 + v, (g, rand) => {
          panels(g, rand);
          corridorWindow(v === WINDOW_B, true)(g, rand);
          grain(g, rand, 12);
        }),
      ]),
    ),
    roomWalls: HOSP_ROOM_WALLS,
    liftWalls: HOSP_LIFT_WALLS,
    roomFloors: HOSP_ROOM_FLOORS,
    roomKinds: hospRoomKinds,
    floors: [
      ...CORRIDOR_PICS.map(fn => paint(4200, fn)),
      ...ROOM_FLOOR_PICS.map((fn, v) => paint(4210 + (v >> 1), fn)),
      ...THEATRE_PICS.map(fn => paint(4220, fn)),
    ],
    hall: { upper: paint(4600, theatreUpper), ceiling: paint(4601, theatreCeiling) },
    deck: paint(4300, hospDeck),
    ceiling: paint(4400, hospCeiling),
    door: paint(4500, hospDoor(false)),
    bossDoor: paint(4501, hospDoor(true)),
    fog: 0x1c241f,
  };
}
