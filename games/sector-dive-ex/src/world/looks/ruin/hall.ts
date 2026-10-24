import {
  RUIN_HALL_BANNER,
  RUIN_HALL_DRILL,
  RUIN_HALL_MEETING,
  RUIN_HALL_TIMETABLE,
  RUIN_HALL_TOWN,
  RUIN_NOTICE_BOARD,
} from '../../../i18n/signs.ts';
import { SIGN_FONT, TEX, WALL_ASPECT, grain, grime, oval, rowOf, smudge, words } from '../paint.ts';
import type { Paint } from '../paint.ts';
import {
  chunk,
  crack,
  crackLines,
  creeper,
  damp,
  moss,
  mortar,
  pick,
  ragged,
  rounded,
  RUST,
  rustPatch,
  slab,
  tuft,
} from './strokes.ts';
// The pictures of the ruined streets' collapsed hall, which is its boss room: the community hall of the block, a big
// room whose roof has partly come in, so that the sky shows through. A small stage with its heavy curtain torn, folding
// chairs and tables stacked along the walls, the notice board, a clock that stopped, photographs and trophies, tall
// windows with the glass gone, paint peeling off the mortar, a wall that has fallen in, ivy, and plates high up that say
// what the place was. It is as grey and green as the rest of the sector; the day comes in at the windows and through the
// roof. Its floor is old floorboards, worn, broken, with plaster fallen on them; its walls go on up into the
// clerestory and the bare roof timbers, and so does its ceiling. The walls are numbered after the sector's own
// (pictures.ts RUIN_WALLS; they come last): they are drawn whole.
// ---- tuning numbers used only here ----
const STAGE_TOP = 0.95; // the height of the stage's floor (m)
const PLATE_TOP = 5.8; // the plates high on the wall, from ... (m)
const PLATE_FOOT = 4.6; // ... to
const SEAM = TEX / 2; // the joints of the floor: half a tile in from the picture's edge, so none is on a tile's edge
const BOARD_H = 16; // a floorboard's width (px)
const CREAM = '#b2ad91'; // the faded cream paint
const CREAM_PALE = '#c2bda2';
const WOOD = '#5a4a38'; // the old dark wood of the stage, the frames and the dado
const WOOD_LIGHT = '#8a775a';
const CURTAIN = '#5e4240'; // the heavy curtain, faded
const SKY_TOP = '#b5c2ac'; // the sky seen through a window or a hole in the roof
const SKY_FOOT = '#98a893';
const LIGHT_RGB = '196,212,184'; // the day's light on a wall

// the wall every picture is painted on: mortar gone green, the damp, a crack from the top
function hallWall(g: CanvasRenderingContext2D, rand: () => number) {
  mortar(g, rand);
  damp(g, rand, 6);
  crack(g, rand, 30 + rand() * 190, 0, 8, 0, 13);
}
// the shade at the top and the foot of every wall, the moss at the foot, and the grain
function hallShade(g: CanvasRenderingContext2D, rand: () => number, strength = 0.4) {
  const shade = g.createLinearGradient(0, 0, 0, TEX);
  shade.addColorStop(0, 'rgba(12,16,10,.38)');
  shade.addColorStop(0.2, 'rgba(12,16,10,0)');
  shade.addColorStop(0.85, 'rgba(12,16,10,0)');
  shade.addColorStop(1, 'rgba(12,16,10,.22)');
  g.fillStyle = shade;
  g.fillRect(0, 0, TEX, TEX);
  moss(g, rand, 0.8, strength);
  grain(g, rand, 18);
}
// the day's light on a wall: a soft pale glow over a spot, added to what is there
function spill(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a: number) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.translate(x, y);
  g.scale(1, ry / rx);
  const fade = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  fade.addColorStop(0, `rgba(${LIGHT_RGB},${a})`);
  fade.addColorStop(1, `rgba(${LIGHT_RGB},0)`);
  g.fillStyle = fade;
  g.fillRect(-rx, -rx, rx * 2, rx * 2);
  g.restore();
}
// faded cream paint from the top of the wall down to `foot` (a picture row), torn away in `holes` places (the mortar
// shows there) and along its foot, so that it does not end in a straight line
function cream(g: CanvasRenderingContext2D, rand: () => number, foot: number, holes: number) {
  g.save();
  g.beginPath();
  g.rect(0, 0, TEX, foot);
  for (let k = 0; k < holes; k++) ragged(g, rand, rand() * TEX, rand() * foot, 14 + rand() * 40, 10 + rand() * 32);
  for (let ex = 0; ex < TEX; ex += 36) ragged(g, rand, ex + rand() * 18, foot + 3, 14 + rand() * 20, 7 + rand() * 16);
  g.clip('evenodd');
  g.fillStyle = CREAM;
  g.fillRect(0, 0, TEX, foot);
  grime(g, rand, 50, CREAM_PALE, '#6c6a54');
  for (let k = 0; k < 6; k++) {
    g.fillStyle = `rgba(110,98,56,${0.1 + rand() * 0.14})`;
    oval(g, rand() * TEX, rand() * foot, 16 + rand() * 38, 8 + rand() * 20);
  }
  g.restore();
}
// the dark panelling up to `top` metres, with a rail on it
function wainscot(g: CanvasRenderingContext2D, rand: () => number, top: number) {
  const y = rowOf(top);
  g.fillStyle = 'rgba(14,18,12,.4)';
  g.fillRect(0, y - 2, TEX, 3);
  g.fillStyle = '#4e4132';
  g.fillRect(0, y, TEX, TEX - y);
  g.fillStyle = WOOD_LIGHT;
  g.fillRect(0, y, TEX, 3);
  g.fillStyle = 'rgba(14,10,6,.5)';
  for (let x = 20; x < TEX; x += 32) g.fillRect(x, y + 4, 1.4, TEX - y);
  for (let k = 0; k < 7; k++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '20,16,10' : '150,134,100'},${0.1 + rand() * 0.12})`;
    g.fillRect(rand() * TEX, y + 6 + rand() * (TEX - y - 8), 3 + rand() * 12, 1.2);
  }
}
// a frame with a picture in it: `tilt` turns it on its nail
function frame(
  g: CanvasRenderingContext2D,
  rand: () => number,
  x: number,
  y: number,
  w: number,
  h: number,
  tilt: number,
  smashed: boolean,
) {
  g.save();
  g.translate(x + w / 2, y);
  g.rotate(tilt);
  g.fillStyle = 'rgba(14,18,12,.4)';
  g.fillRect(-w / 2 + 2, 2, w, h);
  g.fillStyle = WOOD;
  g.fillRect(-w / 2, 0, w, h);
  g.fillStyle = '#b3a584'; // the photograph, gone brown, rows of small heads over their coats
  g.fillRect(-w / 2 + 3, 3, w - 6, h - 6);
  g.fillStyle = 'rgba(70,56,40,.6)';
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 6; c++) {
      const hx = -w / 2 + 8 + c * ((w - 16) / 5),
        hy = 8 + r * ((h - 16) / 3);
      oval(g, hx, hy, 1.7, 1.7 * WALL_ASPECT);
      g.fillRect(hx - 2.2, hy + 1.8, 4.4, 3);
    }
  g.fillStyle = 'rgba(230,236,220,.18)'; // the glass
  g.beginPath();
  g.moveTo(-w / 2 + 3, 3);
  g.lineTo(-w / 2 + 14, 3);
  g.lineTo(-w / 2 + 3, 14);
  g.fill();
  if (smashed) {
    g.strokeStyle = 'rgba(236,240,226,.7)';
    g.lineWidth = 0.8;
    crackLines(g, rand, 0, h * 0.45, 6, w * 0.7);
  }
  g.restore();
}

// ---- the stage ----
// the heavy curtain from `top` down to a hem (picture rows, one at each side), folds running down it, mildew in it
function curtain(
  g: CanvasRenderingContext2D,
  rand: () => number,
  x0: number,
  x1: number,
  top: number,
  hemLeft: number,
  hemRight: number,
) {
  g.save();
  g.beginPath();
  g.moveTo(x0, top);
  g.lineTo(x1, top);
  const steps = 9;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps,
      y = hemRight + (hemLeft - hemRight) * t + (s > 0 && s < steps ? (rand() - 0.3) * 14 : 0);
    g.lineTo(x1 + (x0 - x1) * t, y);
  }
  g.closePath();
  g.clip();
  const body = g.createLinearGradient(x0, 0, x1, 0);
  body.addColorStop(0, '#4e3533');
  body.addColorStop(0.5, CURTAIN);
  body.addColorStop(1, '#4a3230');
  g.fillStyle = body;
  g.fillRect(x0, top, x1 - x0, TEX);
  for (let x = x0; x < x1; x += 11) {
    g.fillStyle = 'rgba(20,6,6,.3)';
    g.fillRect(x, top, 4 + rand() * 2, TEX);
    g.fillStyle = 'rgba(232,150,132,.1)';
    g.fillRect(x + 5, top, 2.5, TEX);
  }
  for (let k = 0; k < 9; k++)
    smudge(g, x0 + rand() * (x1 - x0), top + 30 + rand() * 120, 10 + rand() * 18, 12 + rand() * 24, '70,86,64', 0.3);
  // the damp has run down it from the top
  const wet = g.createLinearGradient(0, top, 0, top + 90);
  wet.addColorStop(0, 'rgba(30,40,28,.4)');
  wet.addColorStop(1, 'rgba(30,40,28,0)');
  g.fillStyle = wet;
  g.fillRect(x0, top, x1 - x0, 90);
  g.restore();
}
const stage: Paint = (g, rand) => {
  hallWall(g, rand);
  const lip = rowOf(STAGE_TOP),
    foot = rowOf(0.1),
    rail = rowOf(5.0),
    valance = rowOf(4.5);
  // between the curtains: the back of the stage, dark, with the daylight coming in through a hole in it
  g.fillStyle = '#242820';
  g.fillRect(90, valance, 76, lip - valance);
  g.fillStyle = '#7c8470';
  g.beginPath();
  ragged(g, rand, 150, valance + 26, 22, 14);
  g.fill();
  spill(g, 150, valance + 26, 46, 40, 0.3);
  curtain(g, rand, 0, 100, valance, rowOf(1.25), rowOf(1.9));
  // the right one has come away at the top corner and hangs from its rail in a long diagonal tear
  curtain(g, rand, 156, TEX, valance, rowOf(3.2), rowOf(1.3));
  g.strokeStyle = 'rgba(250,236,200,.35)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(TEX, rowOf(1.3));
  g.lineTo(156, rowOf(3.2));
  g.stroke();
  // the tie-back rope of the left one
  g.strokeStyle = '#8c7a4a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, rowOf(2.7));
  g.quadraticCurveTo(50, rowOf(2.3), 100, rowOf(2.8));
  g.stroke();
  // the valance: a board along the top and its swags, a fringe
  slab(g, 0, rail, TEX, rowOf(4.75) - rail, WOOD);
  for (let x = 0; x < TEX; x += 64) {
    g.fillStyle = '#6a4a44';
    g.beginPath();
    g.moveTo(x, rowOf(4.75));
    g.quadraticCurveTo(x + 32, rowOf(4.0), x + 64, rowOf(4.75));
    g.fill();
    g.fillStyle = '#8c7a4a';
    for (let f = x + 6; f < x + 62; f += 7) g.fillRect(f, rowOf(4.75), 1.6, 3 + Math.sin(f * 0.4) * 1.5);
  }
  // the banner over the stage, a corner of it fallen
  const bt = rowOf(5.85),
    bh = rowOf(5.15) - bt;
  g.fillStyle = 'rgba(14,18,12,.4)';
  g.fillRect(26, bt + 2, 208, bh);
  g.fillStyle = '#cfc8a8';
  g.beginPath();
  g.moveTo(24, bt);
  g.lineTo(232, bt);
  g.lineTo(232, bt + bh + 14);
  g.lineTo(214, bt + bh);
  g.lineTo(24, bt + bh);
  g.fill();
  g.fillStyle = '#6e2f2a';
  words(g, RUIN_HALL_BANNER, 120, bt + bh / 2 + 1, 22, WALL_ASPECT, SIGN_FONT, 150);
  g.fillStyle = 'rgba(110,98,56,.25)';
  g.fillRect(24, bt + bh - 6, 208, 6);
  // the front of the stage: boards, its lip, a board gone
  g.fillStyle = 'rgba(14,18,12,.5)';
  g.fillRect(0, lip, TEX, 4);
  g.fillStyle = WOOD;
  g.fillRect(0, lip, TEX, foot - lip);
  g.fillStyle = 'rgba(14,10,6,.5)';
  for (let x = 14; x < TEX; x += 21) g.fillRect(x, lip, 1.4, foot - lip);
  g.fillStyle = WOOD_LIGHT;
  g.fillRect(0, lip, TEX, 4);
  g.fillStyle = 'rgba(14,10,6,.55)';
  g.fillRect(0, foot - 2, TEX, 6);
  g.fillStyle = '#1b1e18';
  g.beginPath();
  g.moveTo(170, lip + 4);
  g.lineTo(205, lip + 4);
  g.lineTo(200, foot - 8);
  g.lineTo(176, foot - 12);
  g.fill();
  for (let k = 0; k < 8; k++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '20,16,10' : '150,134,100'},.2)`;
    g.fillRect(rand() * TEX, lip + 6 + rand() * (foot - lip - 10), 4 + rand() * 12, 1.2);
  }
  hallShade(g, rand);
};

// ---- the folding chairs ----
// a stack of folding chairs seen from behind: the tubes of the legs, the seats one over the next, the backs on top
function chairs(g: CanvasRenderingContext2D, rand: () => number, x: number, count: number, lean: number) {
  const w = 36,
    foot = rowOf(0.1),
    step = 8,
    top = foot - 18 - count * step;
  g.save();
  g.translate(x, foot);
  g.transform(1, 0, lean, 1, 0, 0);
  g.translate(0, -foot);
  g.fillStyle = 'rgba(14,18,12,.4)';
  g.fillRect(3, top + 3, w, foot - top);
  g.strokeStyle = '#3e423c';
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(2, top + 10);
  g.lineTo(2, foot);
  g.moveTo(w - 2, top + 10);
  g.lineTo(w - 2, foot);
  g.stroke();
  g.fillStyle = '#4c504a'; // the backs: a curved rail across the top, and the tubes up to it
  g.fillRect(0, top, w, 5);
  g.fillRect(2, top, 2.4, 14);
  g.fillRect(w - 4.4, top, 2.4, 14);
  for (let s = 0; s < count; s++) {
    const y = top + 14 + s * step;
    g.fillStyle = '#2a2d27';
    g.fillRect(-1, y + 5, w + 2, 2);
    g.fillStyle = HALL_SEATS[(s + Math.floor(rand() * 3)) % HALL_SEATS.length]!;
    g.fillRect(0, y, w, 5.4);
    g.fillStyle = 'rgba(236,240,220,.2)';
    g.fillRect(0, y, w, 1);
  }
  g.restore();
}
const HALL_SEATS = ['#4e6a59', '#38485d', '#6e403b', '#4e6a59', '#5c5a48'];
// a folding table stood on its edge against the wall: its top, the edge and the folded legs
function tableOnEdge(g: CanvasRenderingContext2D, x: number, w: number, top: number) {
  const foot = rowOf(0.1);
  g.fillStyle = 'rgba(14,18,12,.4)';
  g.fillRect(x + 3, top + 2, w, foot - top);
  g.fillStyle = '#a49a7d';
  g.fillRect(x, top, w, foot - top);
  g.fillStyle = 'rgba(236,240,220,.22)';
  g.fillRect(x, top, 3, foot - top);
  g.fillStyle = 'rgba(14,18,12,.35)';
  g.fillRect(x + w - 6, top, 6, foot - top);
  g.fillStyle = '#3e423c';
  g.fillRect(x + 8, top + 12, 2.4, foot - top - 24);
  g.fillRect(x + w - 14, top + 12, 2.4, foot - top - 24);
  g.fillRect(x + 8, foot - 22, w - 20, 2.4);
}
const chairsWall: Paint = (g, rand) => {
  hallWall(g, rand);
  cream(g, rand, rowOf(0.9), 4);
  wainscot(g, rand, 0.9);
  // the hooks along the wall, and a coat forgotten on one
  g.fillStyle = '#3e423c';
  g.fillRect(14, rowOf(2.3), TEX - 28, 3);
  for (let x = 30; x < TEX - 20; x += 36) g.fillRect(x, rowOf(2.3) + 3, 2.4, 6);
  g.fillStyle = '#4a5a52';
  g.beginPath();
  g.moveTo(104, rowOf(2.3) + 6);
  g.lineTo(122, rowOf(2.3) + 6);
  g.lineTo(130, rowOf(0.9) - 24);
  g.lineTo(98, rowOf(0.9) - 24);
  g.fill();
  tableOnEdge(g, 76, 46, rowOf(2.4));
  tableOnEdge(g, 178, 52, rowOf(2.7));
  chairs(g, rand, 18, 9, 0.04);
  chairs(g, rand, 126, 7, -0.05);
  chairs(g, rand, 214, 8, 0.03);
  hallShade(g, rand);
};

// ---- the notice board ----
// a framed board of old felt with the sheets still pinned to it: a timetable, a calendar, bills; some of them fallen
const notices: Paint = (g, rand) => {
  hallWall(g, rand);
  cream(g, rand, rowOf(0.9), 5);
  wainscot(g, rand, 0.9);
  const x = 20,
    w = TEX - 40,
    y = rowOf(4.2),
    h = rowOf(2.0) - y;
  g.fillStyle = 'rgba(14,18,12,.4)';
  g.fillRect(x + 3, y + 3, w, h);
  g.fillStyle = WOOD;
  g.fillRect(x, y, w, h);
  g.fillStyle = '#4f6455';
  g.fillRect(x + 6, y + 16, w - 12, h - 22);
  g.fillStyle = 'rgba(236,240,220,.1)';
  for (let k = 0; k < 90; k++) g.fillRect(x + 8 + rand() * (w - 16), y + 18 + rand() * (h - 26), 1.5, 1.5);
  g.fillStyle = '#c4bda3'; // its name on the head of the frame
  g.fillRect(x + w / 2 - 36, y + 2, 72, 11);
  g.fillStyle = '#3a3a31';
  words(g, RUIN_NOTICE_BOARD, x + w / 2, y + 8, 12, WALL_ASPECT, SIGN_FONT, 62);
  // the timetable: a big sheet ruled in a grid, some squares filled in
  const tx = x + 12,
    ty = y + 22,
    tw = 74,
    th = h - 34;
  g.fillStyle = 'rgba(14,18,12,.35)';
  g.fillRect(tx + 2, ty + 2, tw, th);
  g.fillStyle = '#d3cdb4';
  g.fillRect(tx, ty, tw, th);
  g.fillStyle = '#3a3a31';
  words(g, RUIN_HALL_TIMETABLE, tx + tw / 2, ty + 6, 9, WALL_ASPECT, SIGN_FONT, tw - 8);
  g.strokeStyle = 'rgba(52,50,42,.7)';
  g.lineWidth = 0.9;
  for (let r = 0; r < 6; r++) {
    g.beginPath();
    g.moveTo(tx + 3, ty + 14 + r * ((th - 18) / 5));
    g.lineTo(tx + tw - 3, ty + 14 + r * ((th - 18) / 5));
    g.stroke();
  }
  for (let c = 0; c < 5; c++) {
    g.beginPath();
    g.moveTo(tx + 3 + c * ((tw - 6) / 4), ty + 14);
    g.lineTo(tx + 3 + c * ((tw - 6) / 4), ty + th - 4);
    g.stroke();
  }
  g.fillStyle = 'rgba(52,50,42,.55)';
  for (let k = 0; k < 11; k++)
    g.fillRect(
      tx + 5 + Math.floor(rand() * 4) * ((tw - 6) / 4),
      ty + 16 + Math.floor(rand() * 5) * ((th - 18) / 5),
      9 + rand() * 6,
      1.5,
    );
  // the calendar beside it, and the other sheets
  const paper = ['#c9c4af', '#b8b297', '#a8ae9d', '#bfa98d', '#9fb0b0'];
  for (let k = 0; k < 6; k++) {
    const pw = 24 + rand() * 12,
      ph = 28 + rand() * 18,
      px = tx + tw + 8 + (k % 3) * 38 + rand() * 4,
      py = y + 22 + Math.floor(k / 3) * (ph + 6) + rand() * 5;
    if (px + pw > x + w - 6) continue;
    g.save();
    g.translate(px + pw / 2, py);
    g.rotate((rand() - 0.5) * 0.28);
    g.fillStyle = 'rgba(14,18,12,.35)';
    g.fillRect(-pw / 2 + 1.5, 1.5, pw, ph);
    g.fillStyle = pick(rand, paper);
    g.fillRect(-pw / 2, 0, pw, ph);
    g.fillStyle = k === 1 ? 'rgba(122,60,50,.75)' : 'rgba(52,50,42,.6)'; // a poster with a heading, the rest lines
    if (k === 1) g.fillRect(-pw / 2 + 2, 3, pw - 4, 8);
    for (let l = 0; l < 4; l++) g.fillRect(-pw / 2 + 3, 13 + l * 4.5, (pw - 6) * (0.4 + rand() * 0.6), 1.3);
    g.fillStyle = '#8a3b31';
    oval(g, 0, 2.5, 1.6, 1.6 * WALL_ASPECT);
    g.restore();
  }
  // two sheets have fallen off, and lie at the foot
  for (const [fx, fy, a] of [
    [60, rowOf(1.1), 0.6],
    [168, rowOf(0.6), -0.4],
  ] as const) {
    g.save();
    g.translate(fx, fy);
    g.rotate(a);
    g.fillStyle = 'rgba(14,18,12,.3)';
    g.fillRect(-13, 2, 28, 22);
    g.fillStyle = '#b8b297';
    g.fillRect(-14, 0, 28, 22);
    g.fillStyle = 'rgba(52,50,42,.5)';
    for (let l = 0; l < 3; l++) g.fillRect(-10, 5 + l * 5, 18, 1.3);
    g.restore();
  }
  rustPatch(g, rand, x + 20, y + h, 6);
  hallShade(g, rand);
};

// ---- the clock, the photographs and the trophies ----
// a clock that stopped, a shelf of trophies and the photographs of past years
function trophy(g: CanvasRenderingContext2D, x: number, y: number, size: number, tone: string) {
  g.fillStyle = 'rgba(14,18,12,.4)';
  g.fillRect(x - size * 0.45 + 2, y - 3 + 1, size * 0.9, 4);
  g.fillStyle = '#3e423c'; // the plinth
  g.fillRect(x - size * 0.45, y - 5, size * 0.9, 5);
  g.fillStyle = tone;
  g.fillRect(x - 1.5, y - size * 0.7, 3, size * 0.7 - 5);
  g.beginPath(); // the cup, wide at its top
  g.moveTo(x - size * 0.4, y - size * 1.5);
  g.lineTo(x + size * 0.4, y - size * 1.5);
  g.quadraticCurveTo(x + size * 0.36, y - size * 0.7, x, y - size * 0.7);
  g.quadraticCurveTo(x - size * 0.36, y - size * 0.7, x - size * 0.4, y - size * 1.5);
  g.fill();
  g.strokeStyle = tone;
  g.lineWidth = 1.6;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(x + s * size * 0.4, y - size * 1.4);
    g.quadraticCurveTo(x + s * size * 0.68, y - size * 1.3, x + s * size * 0.34, y - size * 0.95);
    g.stroke();
  }
  g.fillStyle = 'rgba(236,240,220,.3)';
  g.fillRect(x - size * 0.22, y - size * 1.42, 2, size * 0.5);
  g.fillStyle = 'rgba(70,100,80,.35)'; // the green of old brass
  g.fillRect(x - size * 0.3, y - size * 1.1, size * 0.4, 3);
}
const clockWall: Paint = (g, rand) => {
  hallWall(g, rand);
  cream(g, rand, rowOf(0.9), 6);
  wainscot(g, rand, 0.9);
  // the clock: a dark rim, a face gone yellow, the hands at ten past ten, cracks over the glass
  const cx = TEX / 2,
    cy = rowOf(4.3),
    r = 36;
  g.fillStyle = 'rgba(14,18,12,.4)';
  oval(g, cx + 3, cy + 3, r + 3, (r + 3) * WALL_ASPECT);
  g.fillStyle = '#3b3226';
  oval(g, cx, cy, r + 3, (r + 3) * WALL_ASPECT);
  g.fillStyle = '#d6cfb2';
  oval(g, cx, cy, r, r * WALL_ASPECT);
  g.fillStyle = 'rgba(110,98,56,.25)';
  oval(g, cx + 8, cy + 6, r * 0.7, r * 0.5 * WALL_ASPECT);
  g.strokeStyle = '#3a3a31';
  g.lineWidth = 1.6;
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2,
      len = h % 3 ? 0.84 : 0.74;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r * len, cy + Math.sin(a) * r * len * WALL_ASPECT);
    g.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92 * WALL_ASPECT);
    g.stroke();
  }
  g.lineWidth = 2.4;
  for (const [a, len] of [
    [-2.6, 0.5],
    [-1.05, 0.72],
  ] as const) {
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * r * len, cy + Math.sin(a) * r * len * WALL_ASPECT);
    g.stroke();
  }
  g.strokeStyle = 'rgba(236,240,226,.65)';
  g.lineWidth = 0.8;
  crackLines(g, rand, cx - 12, cy + 6, 5, 28);
  // the photographs of past years, two of them crooked, one smashed
  frame(g, rand, 14, rowOf(4.9), 44, 36, -0.04, false);
  frame(g, rand, 198, rowOf(4.9), 44, 36, 0.12, true);
  for (let n = 0; n < 4; n++) frame(g, rand, 18 + n * 58, rowOf(2.0), 40, 32, (rand() - 0.5) * 0.16, n === 2);
  // the shelf with the trophies standing on it, and one that has fallen
  const sy = rowOf(2.95);
  slab(g, 12, sy, TEX - 24, 6, WOOD);
  g.fillStyle = '#3e423c';
  for (const bx of [30, 120, 210]) g.fillRect(bx, sy + 6, 4, 12);
  const tones = ['#a09566', '#8e948a', '#a09566', '#7e8a70', '#a09566'];
  [
    [34, 15],
    [70, 22],
    [112, 12],
    [166, 20],
    [208, 14],
  ].forEach(([tx, size], n) => trophy(g, tx!, sy, size!, tones[n]!));
  g.save();
  g.translate(236, sy - 3);
  g.rotate(-1.35);
  g.fillStyle = '#8e948a';
  g.fillRect(-6, -2, 14, 4);
  g.fillRect(8, -5, 7, 10);
  g.restore();
  hallShade(g, rand);
};

// ---- the tall windows ----
// two tall windows, the glass gone from most of the panes: the pale sky behind, the crowns of trees, the shards left
// in the frames, a wide pale light on the wall round them, weeds coming in over the sill
function tallWindow(g: CanvasRenderingContext2D, rand: () => number, x: number, w: number) {
  const y = rowOf(4.9),
    h = rowOf(1.2) - y;
  spill(g, x + w / 2, y + h * 0.55, 100, 150, 0.3);
  g.fillStyle = '#6b6f5e'; // the frame, with its cream paint gone
  g.fillRect(x - 7, y - 6, w + 14, h + 12);
  const sky = g.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, SKY_TOP);
  sky.addColorStop(1, SKY_FOOT);
  g.fillStyle = sky;
  g.fillRect(x, y, w, h);
  g.fillStyle = '#566b4c'; // the crowns of the trees that have come up outside
  for (let k = 0; k < 7; k++) oval(g, x + rand() * w, y + h - rand() * 24, 12 + rand() * 18, 8 + rand() * 10);
  g.fillStyle = '#6d7d62';
  for (let k = 0; k < 4; k++) oval(g, x + rand() * w, y + h * 0.5 + rand() * 20, 10 + rand() * 12, 6 + rand() * 8);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  for (let k = 0; k < 5; k++) {
    // the shards standing in the frame, from the top and from the sill
    const up = k % 2 === 0,
      sx = x + rand() * w,
      len = 14 + rand() * 34;
    g.fillStyle = `rgba(70,84,72,${0.4 + rand() * 0.3})`;
    g.beginPath();
    g.moveTo(sx - 8 - rand() * 10, up ? y : y + h);
    g.lineTo(sx + (rand() - 0.5) * 12, up ? y + len : y + h - len);
    g.lineTo(sx + 8 + rand() * 10, up ? y : y + h);
    g.fill();
  }
  g.fillStyle = 'rgba(70,84,72,.55)'; // the one pane that is whole, dirty, cracked
  g.fillRect(x, y, w, h * 0.22);
  g.strokeStyle = 'rgba(226,234,214,.55)';
  g.lineWidth = 0.8;
  crackLines(g, rand, x + w * 0.5, y + h * 0.1, 5, 26);
  g.restore();
  g.fillStyle = '#6b6f5e'; // the bars: a cross, and another across the top
  g.fillRect(x + w / 2 - 2.5, y, 5, h);
  for (const m of [0.22, 0.58]) g.fillRect(x, y + h * m - 2, w, 4);
  g.fillStyle = 'rgba(124,74,43,.5)';
  g.fillRect(x + w / 2 - 2.5, y + h * 0.7, 5, h * 0.3);
  slab(g, x - 11, y + h + 5, w + 22, 6, '#6f7364');
  creeper(g, rand, [x + w * 0.3, y + h + 4], 9, [3, -8], 6, WALL_ASPECT);
  creeper(g, rand, [x + w - 4, y + h + 4], 6, [-3, -7], 5.5, WALL_ASPECT);
}
const windows: Paint = (g, rand) => {
  hallWall(g, rand);
  cream(g, rand, rowOf(0.9), 5);
  wainscot(g, rand, 0.9);
  tallWindow(g, rand, 22, 84);
  tallWindow(g, rand, 150, 84);
  for (let k = 0; k < 5; k++) {
    // the rain that has run down the wall from the sills
    const sx = 20 + rand() * 216,
      len = 30 + rand() * 50,
      st = g.createLinearGradient(0, rowOf(1.1), 0, rowOf(1.1) + len);
    st.addColorStop(0, 'rgba(34,44,30,.5)');
    st.addColorStop(1, 'rgba(34,44,30,0)');
    g.fillStyle = st;
    g.fillRect(sx, rowOf(1.1), 3 + rand() * 7, len);
  }
  hallShade(g, rand, 0.45);
};

// ---- peeling paint ----
// cream paint coming off the mortar in sheets: the pale squares where frames hung, the panelling below, flakes at the foot
const peeling: Paint = (g, rand) => {
  hallWall(g, rand);
  cream(g, rand, rowOf(0.9), 7);
  g.fillStyle = 'rgba(232,228,206,.2)'; // where something hung for years, now gone
  for (const [px, py, pw, ph] of [
    [30, rowOf(4.4), 46, 36],
    [150, rowOf(4.0), 60, 44],
    [86, rowOf(2.7), 30, 26],
  ] as const)
    g.fillRect(px, py, pw, ph);
  wainscot(g, rand, 0.9);
  for (let k = 0; k < 16; k++) {
    // flakes of paint that have curled off and lie at the foot
    g.fillStyle = k % 2 ? '#c4bea0' : '#b3ad8f';
    g.save();
    g.translate(rand() * TEX, rowOf(0.12) + rand() * 6);
    g.rotate(rand() * 3);
    g.fillRect(-5, -2, 8 + rand() * 6, 3.5);
    g.restore();
  }
  hallShade(g, rand);
};

// ---- the wall that fell in ----
// a breach right down to the floor: the brick under the mortar, the bars bent where the wall gave, the dark behind it,
// the bricks and mortar in a heap at its foot
const collapsed: Paint = (g, rand) => {
  hallWall(g, rand);
  cream(g, rand, rowOf(0.9), 4);
  const cx = 128,
    cy = rowOf(2.6),
    hole = new Path2D();
  ragged(hole, rand, cx, cy, 104, 96);
  g.save();
  g.clip(hole);
  g.fillStyle = '#1c201a';
  g.fillRect(0, 0, TEX, TEX);
  // the brick of the wall's skin, still standing in the upper left, and the dark of the room behind in the rest
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(190, 0);
  g.lineTo(120, rowOf(3.4));
  g.lineTo(60, rowOf(1.5));
  g.lineTo(0, rowOf(1.2));
  g.clip();
  const bw = 34,
    bh = 11;
  for (let row = 0, y = 0; y < TEX; row++, y += bh)
    for (let x = row % 2 ? -bw / 2 : 0; x < TEX; x += bw) {
      const v = 112 + Math.floor(rand() * 30);
      g.fillStyle = `rgb(${v},${v - 40},${v - 52})`;
      g.fillRect(x, y, bw - 2, bh - 2);
      g.fillStyle = 'rgba(232,236,214,.12)';
      g.fillRect(x, y, bw - 2, 1.4);
    }
  g.restore();
  g.save();
  g.clip(hole);
  // the bars, bent
  for (let n = 0; n < 5; n++) {
    const bx = cx - 76 + n * 36 + rand() * 8;
    g.strokeStyle = 'rgba(0,0,0,.5)';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(bx + 2, 0);
    g.quadraticCurveTo(bx + 2 + (rand() - 0.2) * 44, cy + 20, bx + 12, rowOf(0.3));
    g.stroke();
    g.strokeStyle = RUST;
    g.lineWidth = 3.4;
    g.beginPath();
    g.moveTo(bx, 0);
    g.quadraticCurveTo(bx + (rand() - 0.2) * 44, cy + 20, bx + 10, rowOf(0.3));
    g.stroke();
  }
  g.restore();
  g.strokeStyle = 'rgba(176,182,162,.6)'; // the broken edge of the mortar
  g.lineWidth = 2.5;
  g.stroke(hole);
  spill(g, 190, rowOf(1.6), 60, 50, 0.16); // a little of the day comes in from the room behind
  // the rubble heaped in front of it
  for (let k = 0; k < 40; k++) {
    const a = rand() * Math.PI,
      d = rand() * 110;
    chunk(g, rand, 128 + Math.cos(a) * -d, rowOf(0.35) + rand() * 14 - Math.sin(a) * d * 0.14, 4 + rand() * 9);
  }
  hallShade(g, rand);
};

// ---- the ivy ----
// a wall that the ivy has taken, thickest where the light falls
const vines: Paint = (g, rand) => {
  hallWall(g, rand);
  cream(g, rand, rowOf(0.9), 8);
  spill(g, 170, rowOf(3.4), 90, 110, 0.18);
  for (let k = 0; k < 18; k++)
    creeper(g, rand, [8 + rand() * 240, TEX], 8 + rand() * 20, [(rand() - 0.5) * 5, -8], 6.5, WALL_ASPECT);
  for (let k = 0; k < 7; k++)
    creeper(g, rand, [rand() * TEX, 0], 6 + rand() * 10, [(rand() - 0.5) * 4, 8], 6, WALL_ASPECT);
  hallShade(g, rand, 0.55);
};

// ---- bare walls ----
// plain cracked mortar, two kinds
const mortarA: Paint = (g, rand) => {
  hallWall(g, rand);
  crack(g, rand, 20 + rand() * 60, rowOf(1 + rand() * 3), 7, 16, -3);
  crack(g, rand, 120 + rand() * 100, TEX, 6, 0, -12);
  hallShade(g, rand);
};
// ... with the damp through it, a pipe up it and a socket that was never taken down
const mortarB: Paint = (g, rand) => {
  hallWall(g, rand);
  cream(g, rand, rowOf(3.4), 4);
  for (let k = 0; k < 5; k++) {
    g.fillStyle = `rgba(44,54,40,${0.14 + rand() * 0.14})`;
    g.beginPath();
    ragged(g, rand, rand() * TEX, rand() * TEX * 0.8, 24 + rand() * 50, 16 + rand() * 40);
    g.fill();
  }
  const px = 200;
  g.fillStyle = 'rgba(14,18,12,.4)';
  g.fillRect(px + 3, 0, 8, TEX);
  g.fillStyle = '#4f544a';
  g.fillRect(px, 0, 8, TEX);
  g.fillStyle = 'rgba(236,240,220,.2)';
  g.fillRect(px + 1, 0, 2, TEX);
  for (const m of [0.6, 2.6, 4.6]) slab(g, px - 3, rowOf(m), 14, 5, '#3e423c');
  slab(g, 60, rowOf(1.4), 20, 28, '#a9a690');
  g.fillStyle = '#2a2d27';
  g.fillRect(66, rowOf(1.4) + 6, 3, 5);
  g.fillRect(72, rowOf(1.4) + 6, 3, 5);
  hallShade(g, rand);
};

// ---- plates high on the wall over a base picture ----
// `lines`: its words, one line each, as large as the plate allows
const signWall =
  (base: Paint, lines: string[], color: string, ink: string): Paint =>
  (g, rand) => {
    base(g, rand);
    const w = TEX - 60,
      top = rowOf(PLATE_TOP),
      h = rowOf(PLATE_FOOT) - top;
    g.fillStyle = 'rgba(14,18,12,.5)';
    g.fillRect(32, top + 2, w, h);
    g.fillStyle = color;
    g.fillRect(30, top, w, h);
    g.strokeStyle = ink;
    g.lineWidth = 1.6;
    g.strokeRect(34, top + 4, w - 8, h - 8);
    const px = Math.min(Math.floor((w - 40) / Math.max(...lines.map(l => l.length))), 38),
      step = h / lines.length;
    g.fillStyle = ink;
    lines.forEach((line, n) => words(g, line, TEX / 2, top + step * (n + 0.5) + 1, px, WALL_ASPECT, SIGN_FONT, w - 40));
    g.fillStyle = 'rgba(110,98,56,.28)'; // the plate is dirty too
    g.fillRect(30, top + h * 0.6, w, h * 0.4);
    rustPatch(g, rand, 30 + rand() * w, top + h, 6);
  };

// the walls by number, after the sector's (pictures.ts)
export const RUIN_HALL_WALLS: Paint[] = [
  stage,
  chairsWall,
  notices,
  clockWall,
  windows,
  peeling,
  collapsed,
  vines,
  mortarA,
  mortarB,
  signWall(peeling, [RUIN_HALL_MEETING], '#33493d', '#dad4b8'),
  signWall(mortarA, [RUIN_HALL_DRILL], '#3b4f66', '#e0dccc'),
  signWall(chairsWall, [RUIN_HALL_TOWN], '#5e4c36', '#d9d1b0'),
];
const [
  STAGE,
  CHAIRS,
  NOTICES,
  CLOCK,
  WINDOWS,
  PEELING,
  COLLAPSED,
  VINES,
  MORTAR_A,
  MORTAR_B,
  SIGN_MEETING,
  SIGN_DRILL,
  SIGN_TOWN,
] = RUIN_HALL_WALLS.map((_, n) => n);
// the walls of the hall by the share of it each picture takes: each is in the list as many times as it comes up (the
// windows, the peeling paint and the stage take most of it)
export const RUIN_HALL_MAP = [
  STAGE,
  STAGE,
  STAGE,
  CHAIRS,
  CHAIRS,
  NOTICES,
  CLOCK,
  CLOCK,
  WINDOWS,
  WINDOWS,
  WINDOWS,
  PEELING,
  PEELING,
  PEELING,
  COLLAPSED,
  VINES,
  VINES,
  MORTAR_A,
  MORTAR_A,
  MORTAR_B,
  SIGN_MEETING,
  SIGN_DRILL,
  SIGN_TOWN,
].map(n => n!);
// what is set up by the hall's walls (hallProps.ts): where the lectern stands, where the daylight falls and the weeds
// come up, where the ivy is
export const RUIN_HALL_STAGE = [STAGE!];
export const RUIN_HALL_LIT = [WINDOWS!, VINES!, COLLAPSED!];

// ---- the floor: old floorboards ----
// Boards in rows (the rows half a board in from the picture's edge, and the ends of the boards well clear of it, so
// that no joint is on a tile's edge), worn and dusty, with a seam across the middle both ways (half a tile in from the
// edge); the painter is given the same seed for every variant, so the boards and the wear run on across the edge.
// Variant 0 plain, 1 boards broken through and weeds in the gap, 2 fallen plaster, 3 a puddle with the sky in it
const BOARD_TONES = ['#6a5c46', '#5e5141', '#74664d', '#665843'];
const hallFloor =
  (variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = '#4a4538';
    g.fillRect(0, 0, TEX, TEX);
    for (let y = BOARD_H / 2 - BOARD_H; y < TEX; y += BOARD_H) {
      let x = -(10 + rand() * 60);
      while (x < TEX) {
        let len = 70 + rand() * 110;
        if (x + len > TEX - 8 && x + len < TEX + 8) len += 16;
        g.fillStyle = pick(rand, BOARD_TONES);
        g.fillRect(x, y + 0.5, len - 1.2, BOARD_H - 1);
        g.fillStyle = 'rgba(228,214,180,.12)';
        g.fillRect(x, y + 0.5, len - 1.2, 1.2);
        g.fillStyle = 'rgba(24,18,12,.35)';
        for (let l = 0; l < 2; l++) g.fillRect(x + rand() * len * 0.6, y + 4 + l * 6, len * (0.2 + rand() * 0.3), 1);
        x += len;
      }
    }
    for (let k = 0; k < 46; k++)
      smudge(
        g,
        rand() * TEX,
        rand() * TEX,
        14 + rand() * 46,
        10 + rand() * 30,
        rand() < 0.5 ? '34,38,30' : rand() < 0.5 ? '170,172,152' : '70,88,56',
        0.08 + rand() * 0.14,
      );
    g.fillStyle = 'rgba(14,16,12,.5)';
    g.fillRect(SEAM - 0.75, 0, 1.5, TEX);
    g.fillRect(0, SEAM - 0.75, TEX, 1.5);
    g.fillStyle = 'rgba(210,214,190,.1)';
    g.fillRect(SEAM + 0.75, 0, 1, TEX);
    g.fillRect(0, SEAM + 0.75, TEX, 1);
    for (let k = 0; k < 150; k++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(26,28,22,.5)' : 'rgba(168,170,150,.3)';
      g.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 2.5, 1 + rand() * 2.5);
    }
    if (variant === 1) {
      // boards broken through: the dark under the floor, a joist across it, the splinters of the boards, and weeds
      const x = 60 + rand() * 40,
        y = 70 + rand() * 40,
        w = 90 + rand() * 30,
        h = 56;
      g.fillStyle = '#1e211b';
      g.beginPath();
      g.moveTo(x, y + 6);
      for (let s = 0; s <= 6; s++) g.lineTo(x + (w * s) / 6, y + (s % 2 ? 0 : 7) + rand() * 5);
      for (let s = 6; s >= 0; s--) g.lineTo(x + (w * s) / 6, y + h - (s % 2 ? 0 : 6) - rand() * 5);
      g.fill();
      g.fillStyle = '#443a2b';
      g.fillRect(x + 4, y + h * 0.4, w - 8, 12);
      g.fillStyle = 'rgba(228,214,180,.14)';
      g.fillRect(x + 4, y + h * 0.4, w - 8, 1.4);
      g.fillStyle = '#7a6a4e';
      for (let k = 0; k < 7; k++) {
        const sx = x + 4 + k * (w / 7),
          up = k % 2;
        g.beginPath();
        g.moveTo(sx, up ? y + 4 : y + h - 4);
        g.lineTo(sx + 5, up ? y + 18 : y + h - 18);
        g.lineTo(sx + 9, up ? y + 4 : y + h - 4);
        g.fill();
      }
      for (let k = 0; k < 5; k++) tuft(g, rand, x + 6 + rand() * (w - 12), y + (k % 2 ? 6 : h - 6), 12 + rand() * 8);
    } else if (variant === 2) {
      // plaster that has come down off the ceiling: a drift of white dust, lumps, and strips of lath
      smudge(g, 128, 128, 90, 70, '206,208,192', 0.5);
      g.fillStyle = '#6a5a40';
      for (let k = 0; k < 5; k++) {
        g.save();
        g.translate(60 + rand() * 140, 70 + rand() * 110);
        g.rotate(rand() * Math.PI);
        g.fillRect(-26, -2, 52, 4);
        g.restore();
      }
      for (let k = 0; k < 24; k++) {
        const a = rand() * Math.PI * 2,
          d = rand() * 76;
        chunk(g, rand, 128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 3 + rand() * 9 * (1 - d / 110));
      }
    } else if (variant === 3) {
      // rain standing in a hollow of the floor with the pale sky in it, weeds along its rim
      const cx = 110 + rand() * 36,
        cy = 110 + rand() * 36;
      smudge(g, cx, cy, 100, 76, '26,32,24', 0.6);
      g.save();
      g.beginPath();
      rounded(g, rand, cx, cy, 70, 46);
      g.clip();
      const water = g.createLinearGradient(0, cy - 50, 0, cy + 50);
      water.addColorStop(0, '#6a7a72');
      water.addColorStop(1, '#4c5b52');
      g.fillStyle = water;
      g.fillRect(0, 0, TEX, TEX);
      g.fillStyle = 'rgba(176,192,174,.16)'; // the sky and the broken edge of the roof in it
      g.fillRect(cx - 36, cy - 30, 60, 22);
      g.fillStyle = 'rgba(30,36,28,.3)';
      g.fillRect(cx - 4, cy - 30, 8, 22);
      for (let k = 0; k < 5; k++) g.fillRect(cx - 50 + rand() * 70, cy - 20 + rand() * 50, 20 + rand() * 30, 1.5);
      g.restore();
      g.strokeStyle = 'rgba(20,24,18,.5)';
      g.lineWidth = 2;
      g.stroke();
      for (let k = 0; k < 4; k++) {
        const a = rand() * Math.PI * 2;
        tuft(g, rand, cx + Math.cos(a) * 72, cy + Math.sin(a) * 48, 11 + rand() * 7);
      }
    }
    grain(g, rand, 16);
  };
export const RUIN_HALL_FLOORS: Paint[] = [0, 1, 2, 3].map(hallFloor);

// ---- the wall above the usual height (a tile wide, as high as the boss room goes above the usual wall) ----
const ROOF_SHARE = 0.3; // the share of its height at the top that is the bare roof, with the sky in it
const TRUSS_PITCH = TEX / 2; // the zigzag of a roof truss: its points are this far apart along the picture (px)
// the roof from below: dark boards with the sky through gaps in them, and a truss of heavy timbers across it
function roofTruss(g: CanvasRenderingContext2D, rand: () => number, h: number) {
  g.fillStyle = '#262a24';
  g.fillRect(0, 0, TEX, h);
  g.fillStyle = '#39352b';
  for (let l = 4; l < h; l += 13) g.fillRect(0, l, TEX, 4);
  for (let k = 0; k < 3; k++) {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, SKY_FOOT);
    sky.addColorStop(1, SKY_TOP);
    g.fillStyle = sky;
    g.beginPath();
    ragged(g, rand, 30 + k * 90 + rand() * 30, h * 0.4, 20 + rand() * 20, h * 0.28);
    g.fill();
  }
  g.lineCap = 'butt';
  const top = 6,
    foot = h - 6;
  for (const [w, c] of [
    [7, 'rgba(10,8,4,.5)'],
    [5, '#3a3328'],
  ] as const) {
    g.strokeStyle = c;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(0, foot);
    for (let x = 0; x < TEX; x += TRUSS_PITCH) {
      g.lineTo(x + TRUSS_PITCH / 2, top);
      g.lineTo(x + TRUSS_PITCH, foot);
    }
    g.moveTo(0, top);
    g.lineTo(TEX, top);
    g.moveTo(0, foot);
    g.lineTo(TEX, foot);
    g.stroke();
  }
  g.fillStyle = 'rgba(226,226,196,.16)';
  g.fillRect(0, top - 2.5, TEX, 1.4);
}
// a small high window of the clerestory: a pale pane or two left in a dark frame
function highWindow(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, w: number, h: number) {
  spill(g, x + w / 2, y + h / 2, 70, 90, 0.22);
  g.fillStyle = '#434a3c';
  g.fillRect(x - 4, y - 4, w + 8, h + 8);
  const sky = g.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, SKY_TOP);
  sky.addColorStop(1, SKY_FOOT);
  g.fillStyle = sky;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(70,84,72,.55)';
  g.fillRect(x, y, w, h * 0.3);
  for (let k = 0; k < 3; k++) {
    const sx = x + rand() * w;
    g.fillStyle = 'rgba(70,84,72,.6)';
    g.beginPath();
    g.moveTo(sx - 6, y + h);
    g.lineTo(sx + (rand() - 0.5) * 8, y + h - 14 - rand() * 22);
    g.lineTo(sx + 6, y + h);
    g.fill();
  }
  g.fillStyle = '#434a3c';
  g.fillRect(x + w / 2 - 2, y, 4, h);
  g.fillRect(x, y + h * 0.42, w, 3.4);
  slab(g, x - 7, y + h + 4, w + 14, 5, '#5b6054');
  creeper(g, rand, [x + w * 0.6, y + h + 3], 6, [-2, -8], 5, WALL_ASPECT);
}
// the wall going on up: cracked plaster over the mortar, a ledge at its foot, the high windows of the hall, the
// timbers of the roof at the top, ivy and cables hanging down
export const ruinHallUpper: Paint = (g, rand) => {
  hallWall(g, rand);
  const roof = TEX * ROOF_SHARE;
  g.fillStyle = 'rgba(12,16,10,.14)';
  g.fillRect(0, 0, TEX, TEX);
  for (let k = 0; k < 6; k++) {
    g.fillStyle = `rgba(44,54,40,${0.12 + rand() * 0.14})`;
    g.beginPath();
    ragged(g, rand, rand() * TEX, roof + rand() * (TEX - roof) * 0.7, 20 + rand() * 40, 14 + rand() * 30);
    g.fill();
  }
  crack(g, rand, 40 + rand() * 170, roof, 9, 0, 13);
  for (const wx of [30, 150]) highWindow(g, rand, wx + rand() * 10, TEX * 0.46, 56, 92);
  slab(g, 0, TEX - 14, TEX, 14, '#5b6054'); // the ledge, where the lower wall ends
  g.fillStyle = 'rgba(12,16,10,.4)';
  g.fillRect(0, TEX - 18, TEX, 4);
  roofTruss(g, rand, roof);
  g.fillStyle = 'rgba(12,16,10,.3)'; // the dark of the roof's shadow down the wall
  g.fillRect(0, roof, TEX, 10);
  for (let k = 0; k < 4; k++)
    creeper(g, rand, [rand() * TEX, roof - 4], 5 + rand() * 7, [(rand() - 0.5) * 4, 8], 6, WALL_ASPECT);
  g.strokeStyle = 'rgba(10,12,8,.8)'; // cables hanging from the roof, swaying
  g.lineWidth = 1.6;
  for (let k = 0; k < 3; k++) {
    const cx = 20 + rand() * 216;
    g.beginPath();
    g.moveTo(cx, roof);
    g.quadraticCurveTo(cx + (rand() - 0.5) * 30, roof + 50, cx + (rand() - 0.5) * 16, roof + 90 + rand() * 60);
    g.stroke();
  }
  g.fillStyle = 'rgba(12,16,10,.18)';
  g.fillRect(0, TEX - 90, TEX, 90);
  grain(g, rand, 16);
};

// ---- the ceiling: the roof broken open ----
// from below: the dark of the roof boards and laths, rafters across them, plasterboard hanging off them in sheets, and
// the sky through the gaps, ivy and cables hanging down
export const ruinHallCeiling: Paint = (g, rand) => {
  g.fillStyle = '#23271f';
  g.fillRect(0, 0, TEX, TEX);
  g.fillStyle = '#3a362a';
  for (let l = 3; l < TEX; l += 14) g.fillRect(0, l, TEX, 4);
  // the sky: a big gap, off the middle so that the tiles side by side do not make a row of holes
  const gaps: [number, number, number, number][] = [
    [150, 100, 70, 48],
    [40, 214, 30, 20],
  ];
  for (const [x, y, rx, ry] of gaps) {
    g.save();
    g.beginPath();
    ragged(g, rand, x, y, rx, ry);
    g.clip();
    const sky = g.createRadialGradient(x, y, 6, x, y, rx);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(1, SKY_FOOT);
    g.fillStyle = sky;
    g.fillRect(0, 0, TEX, TEX);
    g.fillStyle = 'rgba(54,62,50,.6)'; // the shadow of a rafter across the gap
    g.fillRect(x - rx, y - 6 + rand() * 20, rx * 2, 9);
    g.restore();
    g.strokeStyle = 'rgba(14,16,10,.7)';
    g.lineWidth = 2.5;
    g.beginPath();
    ragged(g, rand, x, y, rx + 2, ry + 2);
    g.stroke();
  }
  // plasterboard that is left, sagging: pale sheets in the corners, a corner of each hanging down
  for (const [x, y, w, h] of [
    [0, 0, 110, 70],
    [170, 168, 86, 88],
    [0, 150, 70, 60],
  ] as const) {
    g.fillStyle = 'rgba(14,16,10,.45)';
    g.fillRect(x + 3, y + 3, w, h);
    g.fillStyle = '#4c5148';
    g.fillRect(x, y, w, h);
    g.fillStyle = `rgba(${rand() < 0.5 ? '20,24,18' : '120,126,110'},.2)`;
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(14,16,10,.4)';
    g.fillRect(x, y + h - 2, w, 2);
    g.fillRect(x + w - 2, y, 2, h);
  }
  grime(g, rand, 60, '#6a7063', '#141613');
  // the rafters, in both directions, heavy and dark
  for (const at of [TEX * 0.12, TEX * 0.62]) {
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.fillRect(0, at - 3, TEX, 24);
    g.fillStyle = '#3d3529';
    g.fillRect(0, at, TEX, 17);
    g.fillStyle = 'rgba(226,226,196,.2)';
    g.fillRect(0, at, TEX, 2);
  }
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.fillRect(TEX * 0.42 - 3, 0, 22, TEX);
  g.fillStyle = '#3d3529';
  g.fillRect(TEX * 0.42, 0, 15, TEX);
  g.fillStyle = 'rgba(226,226,196,.14)';
  g.fillRect(TEX * 0.42, 0, 2, TEX);
  // ivy and cables hanging from them
  for (let k = 0; k < 3; k++)
    creeper(g, rand, [rand() * TEX, TEX * 0.12 + 17], 4 + rand() * 4, [(rand() - 0.5) * 8, 7], 6, 1);
  g.strokeStyle = 'rgba(10,12,8,.85)';
  g.lineWidth = 1.8;
  for (let k = 0; k < 4; k++) {
    const x = rand() * TEX,
      y = rand() * TEX;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 30 + rand() * 30, y + 20, x + 60 + rand() * 40, y + 10 + rand() * 30);
    g.stroke();
  }
  grain(g, rand, 14);
};
