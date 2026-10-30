import { HOSP_NURSE_CALL } from '../../../i18n/signs.ts';
import { TEX, rowOf, smudge } from '../paint.ts';
import type { Paint } from '../paint.ts';
import { KIND_EXAM, KIND_WARD, PLATE_WHITE, STEEL, STEEL_DARK, box, glow } from './shared.ts';
import {
  BLANKETS,
  FRONT_TOP,
  WOOD,
  WOOD_DARK,
  boxesOnShelf,
  doorLeaf,
  dot,
  inKind,
  numberPlate,
  pane,
  plateWords,
} from './kit.ts';
import type { G } from './kit.ts';
// The wards' and the consulting rooms' pictures (roomPics.ts puts them in the order of the kinds). Ward: the heads of two
// beds under the curtain rail, a big window with the dusk in it, a privacy curtain drawn across. Consulting room: an
// examination couch under an anatomy chart, two light boxes with films on them, a desk with its monitor off. And the
// fronts of both, where they meet the corridor: a sliding door with its room number, a door with a frosted pane.
const GAS = ['#5aa875', '#d8c453', '#d8d6cc', '#6b95c7']; // the outlets of a bed-head rail: oxygen, vacuum, air, nitrous
const BINDERS = ['#7d8f9c', '#a9a27c', '#8a9f84', '#b0b6ae', '#7f8a86', '#9c8f7a'];
const SKY_TOP = '#5b8795';
const SKY_LOW = '#efc690';
const ROOFS = '#344447';
const FRAME_WHITE = '#c9ccbd'; // aluminium window frames
const CURTAIN_PLEAT = 8; // px across one fold of a curtain
// the ward's big window: three columns of panes under a transom, a blind over the middle and a curtain drawn back
const WARD_X = 30; // px: the glass's left edge
const WARD_W = TEX - 60; // px: its width
const WARD_Y = rowOf(3.7); // px: its top
const WARD_FOOT = rowOf(1.1); // px: its foot
const WARD_H = WARD_FOOT - WARD_Y; // px: its height
const WARD_BAR = 4; // px: the mullions and the transom
const WARD_TRANSOM = 0.42; // where the transom crosses, as a share of the height
const WARD_BLIND_DOWN = 0.3; // share of the height the blind hangs over the middle column
const WARD_CURTAIN_OUT = 6; // px the curtain hangs over the left edge of the glass
const WARD_CURTAIN_W = 36; // px: the curtain's width
const VIEWER_LIT = '#eef0d9'; // the light boxes' glass: a warm white, not the cold white of the data layer

// the wash of a light box on the wall round it
function viewerGlow(g: G, x: number, y: number, r: number, strength: number) {
  const wash = g.createRadialGradient(x, y, r * 0.1, x, y, r);
  wash.addColorStop(0, `rgba(228,238,200,${strength})`);
  wash.addColorStop(1, 'rgba(228,238,200,0)');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = wash;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.globalCompositeOperation = 'source-over';
}
// a curtain's cloth over x .. x + w from the row `top` to `foot`: folds, a band, a hem and the dirt on it
function cloth(g: G, rand: () => number, x: number, w: number, top: number, foot: number, color: string) {
  g.fillStyle = color;
  g.fillRect(x, top, w, foot - top);
  for (let fx = x; fx < x + w; fx += CURTAIN_PLEAT) {
    const fold = g.createLinearGradient(fx, 0, fx + CURTAIN_PLEAT, 0);
    fold.addColorStop(0, 'rgba(255,252,236,.16)');
    fold.addColorStop(0.55, 'rgba(0,0,0,0)');
    fold.addColorStop(1, 'rgba(20,30,28,.24)');
    g.fillStyle = fold;
    g.fillRect(fx, top, CURTAIN_PLEAT, foot - top);
  }
  g.fillStyle = 'rgba(255,255,255,.22)';
  g.fillRect(x, top + (foot - top) * 0.55, w, 6);
  g.fillStyle = 'rgba(20,30,28,.2)';
  g.fillRect(x, foot - 5, w, 5);
  smudge(g, x + rand() * w, foot - 14, 18, 10, '80,70,40', 0.3);
}
// the curtain rail along the top of a wall, with the rings
function curtainRail(g: G, y: number) {
  g.fillStyle = STEEL;
  g.fillRect(0, y, TEX, 3);
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.fillRect(0, y + 3, TEX, 1.4);
  g.fillStyle = 'rgba(60,70,64,.8)';
  for (let x = 6; x < TEX; x += 9) g.fillRect(x, y + 3, 1.4, 5);
}

// ---- the ward ----
// the heads of two beds against the wall: a headboard, the bed-head rail over it with its gas outlets, the call pad on its
// cord and a reading lamp; a bedside cabinet between them and the curtain rail up near the ceiling, the curtain gathered
const wardBeds: Paint = inKind(KIND_WARD, (g, rand) => {
  const railY = rowOf(3.3);
  curtainRail(g, railY);
  cloth(g, rand, 0, 30, railY + 8, rowOf(0.5), BLANKETS[0]!);
  cloth(g, rand, TEX - 30, 30, railY + 8, rowOf(0.5), BLANKETS[2]!);
  for (const bx of [38, 156]) {
    box(g, bx - 6, rowOf(2.0), 66, rowOf(1.65) - rowOf(2.0), STEEL);
    GAS.forEach((c, n) => {
      g.fillStyle = c;
      dot(g, bx + 5 + n * 13, rowOf(1.82), 3.6);
      g.fillStyle = 'rgba(0,0,0,.4)';
      dot(g, bx + 5 + n * 13, rowOf(1.82), 1.5);
    });
    g.fillStyle = PLATE_WHITE;
    g.fillRect(bx + 52, rowOf(1.97), 6, rowOf(1.68) - rowOf(1.97));
    g.strokeStyle = STEEL_DARK;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(bx + 28, rowOf(2.0));
    g.lineTo(bx + 28, rowOf(2.55));
    g.lineTo(bx + 44, rowOf(2.62));
    g.stroke();
    g.fillStyle = '#d8d0a6';
    g.fillRect(bx + 40, rowOf(2.66), 14, 4);
    g.strokeStyle = 'rgba(40,44,40,.7)'; // the call pad's cord, hanging down behind the headboard
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(bx + 55, rowOf(1.65));
    g.quadraticCurveTo(bx + 62, rowOf(1.3), bx + 50, rowOf(1.1));
    g.stroke();
    // the headboard: a laminate panel in a darker rim
    box(g, bx, rowOf(1.25), 54, rowOf(0.25) - rowOf(1.25), WOOD_DARK);
    g.fillStyle = WOOD;
    g.fillRect(bx + 4, rowOf(1.19), 46, rowOf(0.31) - rowOf(1.19));
    g.fillStyle = 'rgba(255,250,224,.16)';
    g.fillRect(bx + 4, rowOf(1.19), 46, 2);
    g.fillStyle = PLATE_WHITE; // the name card in its holder
    g.fillRect(bx + 16, rowOf(0.95), 22, 9);
    g.fillStyle = 'rgba(40,44,44,.5)';
    g.fillRect(bx + 19, rowOf(0.95) + 3, 16, 1);
    g.fillRect(bx + 19, rowOf(0.95) + 6, 12, 1);
  }
  // the cabinet between the beds: two drawers
  box(g, 100, rowOf(0.85), 38, rowOf(0.2) - rowOf(0.85), '#c2b99b');
  g.fillStyle = 'rgba(40,36,24,.4)';
  g.fillRect(102, rowOf(0.52), 34, 1.4);
  g.fillStyle = STEEL_DARK;
  g.fillRect(112, rowOf(0.7), 14, 2.4);
  g.fillRect(112, rowOf(0.36), 14, 2.4);
  g.fillStyle = 'rgba(40,44,40,.55)';
  plateWords(g, HOSP_NURSE_CALL, 128, rowOf(2.55), 10, 60);
});
// a big window, the dusk in it: a sky going from blue-green to pale orange over the roofs, the mullions, a blind let
// down in part, a curtain drawn back, the radiator under it, and the warmth of the sun on the wall round it
const wardWindow: Paint = inKind(KIND_WARD, (g, rand) => {
  const x = WARD_X,
    w = WARD_W,
    y = WARD_Y,
    foot = WARD_FOOT,
    h = WARD_H;
  glow(g, TEX / 2, y + h * 0.7, 160, 0.2);
  box(g, x - 6, y - 5, w + 12, h + 10, FRAME_WHITE);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const sky = g.createLinearGradient(0, y, 0, foot);
  sky.addColorStop(0, SKY_TOP);
  sky.addColorStop(0.55, '#c9b98c');
  sky.addColorStop(1, SKY_LOW);
  g.fillStyle = sky;
  g.fillRect(x, y, w, h);
  glow(g, x + w * 0.7, foot - 4, 80, 0.5);
  // the roofs across the way, a few windows lit in them
  for (let rx = x; rx < x + w;) {
    const rw = 14 + rand() * 24,
      rh = 8 + rand() * 20;
    g.fillStyle = ROOFS;
    g.fillRect(rx, foot - rh, rw, rh);
    if (rand() < 0.4) {
      g.fillStyle = 'rgba(244,176,90,.8)';
      g.fillRect(rx + 3 + rand() * (rw - 8), foot - rh + 4 + rand() * (rh - 8), 3, 2);
    }
    rx += rw + 1;
  }
  g.restore();
  // the mullions and the transom
  g.fillStyle = FRAME_WHITE;
  g.fillRect(x + w / 3 - WARD_BAR / 2, y, WARD_BAR, h);
  g.fillRect(x + (w * 2) / 3 - WARD_BAR / 2, y, WARD_BAR, h);
  g.fillRect(x, y + h * WARD_TRANSOM, w, WARD_BAR);
  g.fillStyle = 'rgba(0,0,0,.2)';
  g.fillRect(x + w / 3 + WARD_BAR / 2, y, 1.4, h);
  g.fillRect(x + (w * 2) / 3 + WARD_BAR / 2, y, 1.4, h);
  // the blind, let down over the top of the window; one slat hangs crooked
  g.fillStyle = '#d6d1b6';
  for (let sy = y; sy < y + h * WARD_BLIND_DOWN; sy += 4) g.fillRect(x + w / 3 + WARD_BAR / 2, sy, w / 3 - WARD_BAR, 3);
  g.fillStyle = '#b4af98';
  g.beginPath();
  g.moveTo(x + w / 3 + 2, y + h * WARD_BLIND_DOWN);
  g.lineTo(x + w / 3 + 40, y + h * WARD_BLIND_DOWN + 3);
  g.lineTo(x + w / 3 + 2, y + h * WARD_BLIND_DOWN + 12);
  g.fill();
  cloth(g, rand, x - WARD_CURTAIN_OUT, WARD_CURTAIN_W, y - 8, foot + 16, BLANKETS[1]!);
  // the sill and the radiator under it
  box(g, x - 10, foot + 4, w + 20, 6, '#d6d3c1');
  g.fillStyle = '#d9d8cb';
  g.fillRect(x + 14, rowOf(0.98), w - 28, rowOf(0.32) - rowOf(0.98));
  for (let fx = x + 18; fx < x + w - 18; fx += 6) {
    g.fillStyle = 'rgba(30,40,34,.28)';
    g.fillRect(fx, rowOf(0.98) + 3, 1.6, rowOf(0.32) - rowOf(0.98) - 6);
  }
});
// The glass of the ward's big window, in the picture's pixels: three columns by two rows of panes, with the curtain's
// strip off the left and the blind's share off the middle's top (Look.outside)
export function wardWindowPanes(): [number, number, number, number][] {
  const left = WARD_X - WARD_CURTAIN_OUT + WARD_CURTAIN_W,
    right = WARD_X + WARD_W,
    midTop = WARD_Y + WARD_H * WARD_BLIND_DOWN,
    transom = WARD_Y + WARD_H * WARD_TRANSOM,
    bar = WARD_BAR / 2,
    col = [
      WARD_X + WARD_W / 3 - bar,
      WARD_X + WARD_W / 3 + bar,
      WARD_X + (WARD_W * 2) / 3 - bar,
      WARD_X + (WARD_W * 2) / 3 + bar,
    ];
  return [
    [left, WARD_Y, col[0]!, transom],
    [col[1]!, midTop, col[2]!, transom],
    [col[3]!, WARD_Y, right, transom],
    [left, transom + WARD_BAR, col[0]!, WARD_FOOT],
    [col[1]!, transom + WARD_BAR, col[2]!, WARD_FOOT],
    [col[3]!, transom + WARD_BAR, right, WARD_FOOT],
  ];
}
// a privacy curtain drawn across: netting along the top, cloth below, two panels with a gap between them and a drip
// stand standing in the gap
const wardCurtain: Paint = inKind(KIND_WARD, (g, rand) => {
  const railY = rowOf(3.3),
    meshFoot = rowOf(2.3),
    foot = rowOf(0.42);
  curtainRail(g, railY);
  for (const [x, w, c] of [
    [10, 132, 0],
    [162, 84, 1],
  ] as const) {
    g.fillStyle = 'rgba(214,222,206,.6)';
    g.fillRect(x, railY + 8, w, meshFoot - railY - 8);
    g.strokeStyle = 'rgba(90,100,90,.4)';
    g.lineWidth = 0.8;
    for (let mx = x; mx <= x + w; mx += 4) {
      g.beginPath();
      g.moveTo(mx, railY + 8);
      g.lineTo(mx, meshFoot);
      g.stroke();
    }
    for (let my = railY + 8; my <= meshFoot; my += 4) {
      g.beginPath();
      g.moveTo(x, my);
      g.lineTo(x + w, my);
      g.stroke();
    }
    cloth(g, rand, x, w, meshFoot, foot, BLANKETS[c]!);
  }
  // the stand: a pole on a five-legged foot, hooks at the top, a clear bag hanging with a tube down from it
  g.fillStyle = STEEL;
  g.fillRect(150, rowOf(2.85), 3, rowOf(0.18) - rowOf(2.85));
  g.fillRect(142, rowOf(2.85), 19, 2);
  g.fillRect(138, rowOf(0.18), 27, 3);
  g.fillStyle = 'rgba(184,206,214,.8)';
  g.fillRect(142, rowOf(2.8), 11, 22);
  g.strokeStyle = 'rgba(184,206,214,.7)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(148, rowOf(2.8) + 22);
  g.quadraticCurveTo(156, rowOf(1.8), 146, rowOf(1.3));
  g.stroke();
});

// ---- the consulting room ----
// an examination couch under the anatomy chart: a vinyl cushion with paper over it, the paper roll at its head, a cabinet
// under it, a stool beside it, and the boxes of gloves on the wall
const examCouch: Paint = inKind(KIND_EXAM, (g, rand) => {
  box(g, 70, rowOf(3.2), 74, rowOf(1.9) - rowOf(3.2), '#d9d6c0');
  g.fillStyle = '#b88f7c'; // the chart: a figure in muted colours
  dot(g, 107, rowOf(2.95), 6);
  g.fillRect(100, rowOf(2.8), 14, rowOf(2.2) - rowOf(2.8));
  g.fillStyle = '#7f98a8';
  g.fillRect(94, rowOf(2.75), 6, rowOf(2.3) - rowOf(2.75));
  g.fillRect(114, rowOf(2.75), 6, rowOf(2.3) - rowOf(2.75));
  g.fillStyle = 'rgba(70,60,40,.4)';
  for (let ly = 0; ly < 3; ly++) g.fillRect(122, rowOf(3.0) + ly * 7, 18, 1.2);
  box(g, 24, rowOf(0.95), 150, 10, '#5c7f87');
  g.fillStyle = '#e6e3d3';
  g.fillRect(24, rowOf(0.95) - 2, 150, 3);
  box(g, 28, rowOf(0.95) + 10, 142, rowOf(0.2) - rowOf(0.95) - 10, '#cfd0c2');
  g.fillStyle = 'rgba(40,46,40,.4)';
  g.fillRect(28, rowOf(0.6), 142, 1.4);
  g.fillRect(98, rowOf(0.95) + 10, 1.4, rowOf(0.6) - rowOf(0.95) - 10);
  g.fillStyle = STEEL_DARK;
  g.fillRect(60, rowOf(0.78), 14, 2.4);
  g.fillRect(120, rowOf(0.78), 14, 2.4);
  g.fillStyle = '#ece8d8'; // the paper roll
  dot(g, 34, rowOf(1.1), 8);
  g.fillStyle = 'rgba(0,0,0,.2)';
  dot(g, 34, rowOf(1.1), 3);
  // the stool: a round seat on a column and a base
  g.fillStyle = '#4c5a56';
  g.fillRect(208, rowOf(0.62), 24, 6);
  g.fillStyle = STEEL;
  g.fillRect(218, rowOf(0.62) + 6, 4, rowOf(0.12) - rowOf(0.62) - 8);
  g.fillRect(208, rowOf(0.16), 24, 3);
  // boxes of gloves and a roll of towels on a bracket
  for (const [c, n] of [
    ['#7ea0ba', 0],
    ['#9bb27d', 1],
    ['#d3b45c', 2],
  ] as const)
    box(g, 188 + n * 16, rowOf(1.7), 14, 18, c);
  g.fillStyle = STEEL;
  g.fillRect(184, rowOf(1.7) + 19, 56, 2);
  smudge(g, 60 + rand() * 120, rowOf(0.4), 30, 8, '20,20,14', 0.18);
});
// two light boxes on the wall, lit still (the power came back on for them), a film on each: ribs and spine of a chest,
// the bones of a hand; a shelf with binders under them
const examLight: Paint = inKind(KIND_EXAM, (g, rand) => {
  for (const [x, hand] of [
    [22, false],
    [134, true],
  ] as const) {
    const w = 100,
      y = rowOf(3.4),
      foot = rowOf(1.9);
    viewerGlow(g, x + w / 2, (y + foot) / 2, 120, 0.16);
    box(g, x - 4, y - 4, w + 8, foot - y + 8, '#46514e');
    g.fillStyle = VIEWER_LIT;
    g.fillRect(x, y, w, foot - y);
    g.fillStyle = '#18262b';
    g.fillRect(x + 10, y + 5, w - 20, foot - y - 10);
    g.strokeStyle = 'rgba(206,222,224,.5)';
    g.lineWidth = 1.6;
    const cx = x + w / 2,
      mid = (y + foot) / 2;
    if (!hand) {
      g.beginPath();
      g.moveTo(cx, y + 8);
      g.lineTo(cx, foot - 8);
      g.stroke();
      for (let r = 0; r < 6; r++)
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(cx + s * 3, y + 14 + r * 7);
          g.quadraticCurveTo(cx + s * 22, y + 10 + r * 7, cx + s * 30, y + 22 + r * 7);
          g.stroke();
        }
    } else {
      g.lineWidth = 3;
      for (let f = 0; f < 5; f++) {
        g.beginPath();
        g.moveTo(cx - 20 + f * 10, mid + 10);
        g.lineTo(cx - 24 + f * 12, y + 10 + Math.abs(f - 2) * 3);
        g.stroke();
      }
      g.fillStyle = 'rgba(206,222,224,.45)';
      g.fillRect(cx - 18, mid + 8, 38, 14);
    }
    g.fillStyle = STEEL; // the clips
    g.fillRect(x + 14, y + 2, 8, 5);
    g.fillRect(x + w - 22, y + 2, 8, 5);
  }
  box(g, 18, rowOf(1.25), 220, 7, WOOD);
  boxesOnShelf(g, rand, 24, 208, rowOf(1.25), 36, BINDERS);
});
// a desk: the monitor dark on it, a keyboard, a chair pushed back; a shelf of binders over it, a calendar and a clock
const examDesk: Paint = inKind(KIND_EXAM, (g, rand) => {
  box(g, 22, rowOf(3.15), 212, 6, WOOD);
  boxesOnShelf(g, rand, 28, 200, rowOf(3.15), 38, BINDERS);
  box(g, 22, rowOf(2.35), 212, 6, WOOD);
  boxesOnShelf(g, rand, 28, 150, rowOf(2.35), 32, BINDERS);
  g.save();
  g.translate(212, rowOf(2.7));
  g.fillStyle = PLATE_WHITE; // the calendar
  g.fillRect(-15, -14, 30, 24);
  g.fillStyle = 'rgba(40,44,44,.45)';
  for (let cy = -8; cy < 8; cy += 4) for (let cx = -12; cx < 12; cx += 5) g.fillRect(cx, cy, 3, 2);
  g.restore();
  box(g, 26, rowOf(1.0), 136, 8, WOOD);
  box(g, 32, rowOf(1.0) + 8, 124, rowOf(0.15) - rowOf(1.0) - 8, '#bfb596');
  g.fillStyle = 'rgba(40,36,24,.35)';
  g.fillRect(94, rowOf(1.0) + 8, 1.4, rowOf(0.15) - rowOf(1.0) - 8);
  g.fillStyle = STEEL_DARK;
  g.fillRect(58, rowOf(0.7), 14, 2.4);
  g.fillRect(114, rowOf(0.7), 14, 2.4);
  box(g, 48, rowOf(1.95), 44, rowOf(1.1) - rowOf(1.95), '#1d2623'); // the monitor, off, a glare on it
  g.fillStyle = 'rgba(190,210,206,.14)';
  g.fillRect(52, rowOf(1.9), 14, rowOf(1.15) - rowOf(1.9));
  g.fillStyle = STEEL_DARK;
  g.fillRect(66, rowOf(1.1), 8, 6);
  g.fillStyle = '#3d4743';
  g.fillRect(100, rowOf(1.0) - 4, 34, 4); // the keyboard
  // the chair, pushed back from the desk: a dark seat back on a stem
  box(g, 176, rowOf(1.55), 34, rowOf(0.8) - rowOf(1.55), '#3a4a48');
  g.fillStyle = STEEL_DARK;
  g.fillRect(190, rowOf(0.8), 6, rowOf(0.25) - rowOf(0.8));
  g.fillRect(176, rowOf(0.2), 34, 3);
});

// ---- the fronts ----
// a sliding door of a ward, wide, with a strip of glass in the leaf, its room number on a plate beside it and the
// rail it hangs from along the top
const wardSlide: Paint = inKind(KIND_WARD, (g, rand) => {
  const x = 72,
    w = 100;
  g.fillStyle = STEEL;
  g.fillRect(x - 14, rowOf(FRONT_TOP) - 9, w + 70, 5);
  doorLeaf(g, rand, x, w, FRONT_TOP - 0.3, '#d3d0bd');
  pane(g, x + 12, rowOf(3.0), 16, rowOf(1.3) - rowOf(3.0), '#263320');
  g.fillStyle = 'rgba(0,0,0,.2)';
  g.fillRect(x + w / 2, rowOf(FRONT_TOP - 0.3), 1.4, rowOf(0.55) - rowOf(FRONT_TOP - 0.3));
  g.fillStyle = '#6a5a3c'; // the call lamp over the door, out
  dot(g, x + w / 2, rowOf(3.5), 4);
  numberPlate(g, x + w + 12, rowOf(2.2), String(301 + Math.floor(rand() * 40)));
});
// a door of a ward with a big frosted pane, and the holder with the patients' name cards beside it
const wardDoor: Paint = inKind(KIND_WARD, (g, rand) => {
  const x = 62,
    w = 78;
  doorLeaf(g, rand, x, w, FRONT_TOP - 0.3, '#cfcdb8');
  pane(g, x + 12, rowOf(3.0), w - 24, rowOf(1.5) - rowOf(3.0), '#7d908a');
  g.fillStyle = 'rgba(255,255,255,.22)';
  for (let ly = rowOf(3.0) + 4; ly < rowOf(1.5) - 2; ly += 5) g.fillRect(x + 12, ly, w - 24, 0.8);
  box(g, 164, rowOf(2.7), 44, rowOf(1.7) - rowOf(2.7), STEEL);
  for (let n = 0; n < 3; n++) {
    g.fillStyle = PLATE_WHITE;
    g.fillRect(168, rowOf(2.62) + n * 12, 36, 9);
    g.fillStyle = 'rgba(40,44,44,.5)';
    g.fillRect(171, rowOf(2.62) + n * 12 + 3, 14 + rand() * 12, 1);
  }
  numberPlate(g, 164, rowOf(1.4), String(301 + Math.floor(rand() * 40)), 44);
});
// a consulting room's door: a pale leaf with a narrow frosted pane, the lamp over it that says someone is being seen
// (out), the hand-sanitiser pump on the wall beside it
const examDoor: Paint = inKind(KIND_EXAM, (g, rand) => {
  const x = 94,
    w = 70;
  doorLeaf(g, rand, x, w, FRONT_TOP - 0.3, '#d4cdae');
  pane(g, x + 20, rowOf(3.0), 14, rowOf(1.8) - rowOf(3.0), '#8ea39b');
  box(g, x + 10, rowOf(3.5) - 4, 50, 11, '#2a3320');
  g.fillStyle = '#6f5a36';
  g.fillRect(x + 13, rowOf(3.5) - 1, 44, 5);
  box(g, 52, rowOf(1.9), 14, 30, PLATE_WHITE);
  g.fillStyle = STEEL_DARK;
  g.fillRect(56, rowOf(1.9) - 6, 6, 6);
  g.fillRect(62, rowOf(1.9) - 6, 8, 2);
  numberPlate(g, x + w + 14, rowOf(2.2), String(1 + Math.floor(rand() * 9)), 22);
});
// a double door of leaves with round portholes and steel push plates, a notice taped to it
const examDouble: Paint = inKind(KIND_EXAM, (g, rand) => {
  for (const x of [70, 128]) {
    doorLeaf(g, rand, x, 56, FRONT_TOP - 0.3, '#c9c4a4');
    g.fillStyle = STEEL_DARK;
    dot(g, x + 28, rowOf(2.6), 15);
    g.fillStyle = '#263320';
    dot(g, x + 28, rowOf(2.6), 12);
    g.fillStyle = STEEL;
    g.fillRect(x + 8, rowOf(1.5), 40, rowOf(1.0) - rowOf(1.5));
  }
  g.save();
  g.translate(198, rowOf(2.0));
  g.rotate(0.05);
  g.fillStyle = PLATE_WHITE;
  g.fillRect(-14, -18, 28, 36);
  g.fillStyle = 'rgba(40,44,44,.5)';
  for (let ly = -12; ly < 14; ly += 4) g.fillRect(-10, ly, 12 + rand() * 8, 1);
  g.fillStyle = 'rgba(214,204,160,.6)';
  g.fillRect(-5, -21, 10, 5);
  g.restore();
});

export const WARD_PICS: Paint[] = [wardBeds, wardWindow, wardCurtain];
export const WARD_FRONTS: Paint[] = [wardSlide, wardDoor];
export const EXAM_PICS: Paint[] = [examCouch, examLight, examDesk];
export const EXAM_FRONTS: Paint[] = [examDoor, examDouble];
