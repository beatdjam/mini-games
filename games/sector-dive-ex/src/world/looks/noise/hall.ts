import { css } from '../../../data/colors.ts';
import { NOISE_HALL_DANGER, NOISE_HALL_STUDIO, NOISE_HALL_TX } from '../../../i18n/signs.ts';
import { SIGN_FONT, TEX, WALL_ASPECT, grain, grime, oval, rowOf, smudge, stripes, words } from '../paint.ts';
import type { Paint } from '../paint.ts';
import {
  CABLE_TONES,
  HALL_METAL,
  HALL_ON_AIR,
  HALL_STEEL,
  HALL_STUDIO_LIGHT,
  HALL_VALVE,
  HALL_WELL,
  crt,
  knob,
  meter,
  slab,
} from './strokes.ts';
// The pictures of the deep noise's big studio, which is its boss room: a broadcaster's studio that doubles as the
// transmitter hall. Padded acoustic walls (one with a torn cover), the tall cabinets of the transmitter with their
// valves glowing orange behind glass, the dark window of a control room, a wall of old monitors, the foot of the
// antenna's feeder lines, the pale curve of a cyclorama, and plates high up that say where one is. It is darker than
// the rest of the sector, so that the glow of the valves stands out in the fog. Its floor is worn studio floor: bare,
// with a dolly's track, with tape marks, with the cover of a cable trench. Its walls go on up into a lighting grid
// (catwalk, truss, cable trays), and so does its ceiling. The walls are numbered after the sector's own
// (pictures.ts WALL_KINDS; they come last): they are drawn whole.
// ---- tuning numbers used only here ----
const PADDED_TOP = 4.35; // top of the padded panels and of the cabinets (m); the plates over them are 4.6 to 5.8 m
const PANEL_W = TEX / 4; // a padded panel is a metre wide
const PLATE_TOP = 5.8; // the plates high on the wall, from ... (m)
const PLATE_FOOT = 4.6; // ... to
const CABINETS = 3; // transmitter cabinets on a wall of a tile
const TUBES = [5, 4, 5]; // the valves behind each cabinet's window
const TUBES_DEAD = 0.18; // share of the valves that no longer light
const SEAM = TEX / 2; // the joints of the floor: half a tile in from the picture's edge, so none is on a tile's edge
const PLATE_WHITE = '#e6e1ee';
const PLATE_BLUE = '#2e3d66';
const PLATE_RED = '#7c2a2a';

const lens = css(HALL_STUDIO_LIGHT);
const glow = css(HALL_VALVE);

// the wall every picture is painted on: dark violet board, a seam every third of a tile, a dark skirting
function hallWall(g: CanvasRenderingContext2D, rand: () => number) {
  const bg = g.createLinearGradient(0, 0, 0, TEX);
  bg.addColorStop(0, '#2e2840');
  bg.addColorStop(0.5, '#3a3350');
  bg.addColorStop(1, '#2b2539');
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 80, '#4e4668', '#140f1c');
  g.fillStyle = 'rgba(10,6,16,.4)';
  for (const x of [TEX / 4, TEX / 2, (TEX * 3) / 4]) g.fillRect(x, 0, 1.5, TEX);
  g.fillStyle = '#16111e';
  g.fillRect(0, rowOf(0.12), TEX, TEX - rowOf(0.12));
}
// the shade at the top and the foot of every wall, and the grain
function hallShade(g: CanvasRenderingContext2D, rand: () => number) {
  const shade = g.createLinearGradient(0, 0, 0, TEX);
  shade.addColorStop(0, 'rgba(6,4,10,.5)');
  shade.addColorStop(0.2, 'rgba(6,4,10,0)');
  shade.addColorStop(0.85, 'rgba(6,4,10,0)');
  shade.addColorStop(1, 'rgba(6,4,10,.45)');
  g.fillStyle = shade;
  g.fillRect(0, 0, TEX, TEX);
  grain(g, rand, 14);
}
// a soft glow of `color` (an rgb triple) over a spot, laid on the light
function halo(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.translate(x, y);
  g.scale(1, WALL_ASPECT);
  const fade = g.createRadialGradient(0, 0, 0, 0, 0, r);
  fade.addColorStop(0, `rgba(${color},${a})`);
  fade.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = fade;
  g.fillRect(-r, -r, r * 2, r * 2);
  g.restore();
}

// ---- the studio: padded panels ----
// a metre-wide panel of cloth over padding from the plinth to PADDED_TOP: its edge shaded, buttons in a grid
function paddedPanel(g: CanvasRenderingContext2D, rand: () => number, x: number, tone: string) {
  const top = rowOf(PADDED_TOP),
    foot = rowOf(0.35),
    body = g.createLinearGradient(x, 0, x + PANEL_W, 0);
  body.addColorStop(0, 'rgba(255,250,255,.12)');
  body.addColorStop(0.15, 'rgba(0,0,0,0)');
  body.addColorStop(0.85, 'rgba(0,0,0,0)');
  body.addColorStop(1, 'rgba(8,4,14,.5)');
  g.fillStyle = tone;
  g.fillRect(x + 1, top, PANEL_W - 2, foot - top);
  g.fillStyle = body;
  g.fillRect(x + 1, top, PANEL_W - 2, foot - top);
  g.fillStyle = 'rgba(8,4,14,.45)'; // the buttons pulling the cloth in, with a crease to the next
  for (let by = top + 18; by < foot - 10; by += 27)
    for (const bx of [x + PANEL_W * 0.25, x + PANEL_W * 0.75]) {
      oval(g, bx, by, 1.8, 1.8 * WALL_ASPECT);
      g.fillRect(bx - 7, by + 4.5, 14, 0.8);
    }
  for (let k = 0; k < 6; k++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '14,8,20' : '200,190,220'},${0.05 + rand() * 0.07})`;
    g.fillRect(x + 2 + rand() * (PANEL_W - 6), top + rand() * (foot - top), 1 + rand() * 2, 12 + rand() * 40);
  }
}
const PADDED_TONES = ['#5e5280', '#554a74', '#675a88', '#4f4570'];
function studioWall(g: CanvasRenderingContext2D, rand: () => number) {
  hallWall(g, rand);
  g.fillStyle = 'rgba(2,0,6,.5)'; // the shadow under the rail the panels hang from
  g.fillRect(0, rowOf(PADDED_TOP) - 6, TEX, 6);
  slab(g, 0, rowOf(PADDED_TOP) - 10, TEX, 5, css(HALL_METAL));
  slab(g, 0, rowOf(0.35), TEX, 5, css(HALL_METAL));
  for (let n = 0; n < 4; n++) paddedPanel(g, rand, n * PANEL_W, PADDED_TONES[(n + Math.floor(rand() * 3)) % 4]!);
}
const padded: Paint = (g, rand) => {
  studioWall(g, rand);
  hallShade(g, rand);
};
// one panel's cover torn open from the rail down: the padding showing, a flap of the cloth hanging off
const paddedTorn: Paint = (g, rand) => {
  studioWall(g, rand);
  const x = PANEL_W * (1 + Math.floor(rand() * 2)),
    top = rowOf(4.0),
    foot = rowOf(1.6);
  g.fillStyle = '#18121f';
  g.beginPath();
  g.moveTo(x + 6, top);
  g.lineTo(x + 30, top + 14);
  g.lineTo(x + 54, top + 4);
  g.lineTo(x + 56, foot - 10);
  g.lineTo(x + 38, foot);
  g.lineTo(x + 14, foot - 14);
  g.lineTo(x + 4, top + 30);
  g.fill();
  g.fillStyle = '#9c9488'; // the grey wool inside, in tufts
  for (let k = 0; k < 90; k++) {
    const tx = x + 8 + rand() * 44,
      ty = top + 8 + rand() * (foot - top - 24);
    g.globalAlpha = 0.25 + rand() * 0.35;
    g.fillRect(tx, ty, 1.5 + rand() * 3, 1);
  }
  g.globalAlpha = 1;
  g.fillStyle = '#4f4570'; // the flap
  g.beginPath();
  g.moveTo(x + 40, top + 6);
  g.lineTo(x + 58, top + 8);
  g.lineTo(x + 52, top + 46);
  g.lineTo(x + 42, top + 34);
  g.fill();
  g.fillStyle = 'rgba(8,4,14,.4)';
  g.fillRect(x + 40, top + 30, 12, 3);
  hallShade(g, rand);
};

// ---- the transmitter: tall cabinets ----
// a valve behind glass: a socket, a tall glass bulb, a glowing filament, a halo
function valve(g: CanvasRenderingContext2D, x: number, y: number, h: number, lit: boolean) {
  g.fillStyle = '#26202f';
  g.fillRect(x - 4.5, y + h - 4, 9, 4);
  g.fillStyle = lit ? 'rgba(255,170,90,.2)' : 'rgba(180,170,200,.12)';
  g.beginPath();
  g.moveTo(x - 4, y + h - 4);
  g.lineTo(x - 4, y + 6 * WALL_ASPECT);
  g.quadraticCurveTo(x - 4, y, x, y);
  g.quadraticCurveTo(x + 4, y, x + 4, y + 6 * WALL_ASPECT);
  g.lineTo(x + 4, y + h - 4);
  g.fill();
  if (!lit) return;
  halo(g, x, y + h * 0.55, 30, '255,150,60', 0.55);
  g.fillStyle = glow;
  g.fillRect(x - 1, y + h * 0.3, 2, h * 0.45);
  g.fillStyle = lens;
  g.fillRect(x - 0.6, y + h * 0.4, 1.2, h * 0.22);
}
// the transmitter's cabinets side by side: grey steel, a glass window of valves over a row of meters and knobs, a
// warning plate and the vents under them
const cabinet: Paint = (g, rand) => {
  hallWall(g, rand);
  const w = (TEX - 8) / CABINETS,
    top = rowOf(PADDED_TOP - 0.1),
    foot = rowOf(0.1);
  for (let c = 0; c < CABINETS; c++) {
    const x = 4 + c * w,
      body = g.createLinearGradient(x, 0, x + w, 0);
    body.addColorStop(0, '#7b7490');
    body.addColorStop(0.5, '#8b84a0');
    body.addColorStop(1, css(HALL_STEEL));
    g.fillStyle = 'rgba(2,0,6,.5)';
    g.fillRect(x + 3, top + 2, w - 2, foot - top);
    g.fillStyle = body;
    g.fillRect(x + 1, top, w - 3, foot - top);
    g.fillStyle = 'rgba(255,250,255,.2)';
    g.fillRect(x + 1, top, w - 3, 1.5);
    g.fillStyle = 'rgba(2,0,6,.45)';
    g.fillRect(x + w - 4, top, 1.5, foot - top);
    // the window
    const wx = x + 8,
      ww = w - 19,
      wy = rowOf(3.95),
      wh = rowOf(2.75) - wy;
    g.fillStyle = '#16111e';
    g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
    g.fillStyle = css(HALL_WELL);
    g.fillRect(wx, wy, ww, wh);
    const n = TUBES[c]!;
    for (let t = 0; t < n; t++) valve(g, wx + (ww * (t + 0.5)) / n, wy + 8, wh - 12, rand() > TUBES_DEAD);
    g.fillStyle = 'rgba(190,180,230,.08)'; // a slant of light across the glass
    g.beginPath();
    g.moveTo(wx + 4, wy);
    g.lineTo(wx + 22, wy);
    g.lineTo(wx + 6, wy + wh);
    g.lineTo(wx, wy + wh);
    g.lineTo(wx, wy + 8);
    g.fill();
    // meters and knobs
    const my = rowOf(2.45);
    meter(g, wx, my, 15, 11, rand() - 0.5);
    meter(g, wx + ww - 15, my, 15, 11, rand() - 0.5);
    for (let k = 0; k < 2; k++) knob(g, wx + ww / 2 + (k - 0.5) * 16, my + 6, 5.2, rand() * 6.3);
    g.fillStyle = '#2a2335'; // a row of small switches and one lamp
    for (let s = 0; s < 4; s++) g.fillRect(wx + 3 + s * 9, rowOf(1.95), 4, 5);
    g.fillStyle = css(HALL_ON_AIR);
    g.globalAlpha = 0.5 + rand() * 0.5;
    g.fillRect(wx + ww - 7, rowOf(1.95) + 1, 3, 3);
    g.globalAlpha = 1;
    // the warning plate
    stripes(g, [wx, rowOf(1.55), ww, rowOf(1.2) - rowOf(1.55)], 10, '#d8b640', '#1a1520', 'rgba(10,6,16,.3)');
    // the vents
    g.fillStyle = 'rgba(8,4,14,.55)';
    for (let v = 0; v < 5; v++) g.fillRect(wx, rowOf(1.0) + v * 6, ww, 2.4);
    g.fillStyle = '#c9c3d6';
    g.fillRect(x + w - 11, rowOf(1.9), 2.2, rowOf(1.6) - rowOf(1.9));
  }
  hallShade(g, rand);
};

// ---- the control room ----
// the window of a control room: a frame, the glass leaning out at the top (a slanted lintel and a wide sill), dark,
// with the shapes of a mixing desk and some dead monitors behind it and a faint reflection over them
const control: Paint = (g, rand) => {
  hallWall(g, rand);
  const x = 14,
    w = TEX - 28,
    top = rowOf(3.9),
    foot = rowOf(1.4),
    lean = 9;
  g.fillStyle = 'rgba(2,0,6,.5)';
  g.fillRect(x + 3, top + 3, w, foot - top + 8);
  g.fillStyle = css(HALL_METAL);
  g.beginPath(); // the frame, with the lintel slanting in at the top
  g.moveTo(x - 5, top - 10);
  g.lineTo(x + w + 5, top - 10);
  g.lineTo(x + w + 5, foot + 6);
  g.lineTo(x - 5, foot + 6);
  g.fill();
  g.fillStyle = '#06040a';
  g.beginPath();
  g.moveTo(x + lean, top);
  g.lineTo(x + w - lean, top);
  g.lineTo(x + w, foot);
  g.lineTo(x, foot);
  g.fill();
  // behind the glass: the desk, with its faders in rows, the monitors over it, a chair
  g.fillStyle = '#17121f';
  g.beginPath();
  g.moveTo(x + 14, foot - 12);
  g.lineTo(x + w - 14, foot - 12);
  g.lineTo(x + w - 4, foot);
  g.lineTo(x + 4, foot);
  g.fill();
  g.fillStyle = 'rgba(190,180,225,.22)';
  for (let r = 0; r < 2; r++) for (let f = 0; f < 22; f++) g.fillRect(x + 22 + f * 9.5, foot - 9 + r * 4, 2.2, 1.2);
  for (const mx of [x + 32, x + 80, x + 130, x + 178]) {
    g.fillStyle = '#17121f';
    g.fillRect(mx, foot - 38, 36, 22);
    g.fillStyle = rand() < 0.3 ? '#1c1a30' : '#0b0912';
    g.fillRect(mx + 3, foot - 35, 30, 16);
  }
  g.fillStyle = '#17121f';
  oval(g, x + 118, foot - 14, 11, 11 * WALL_ASPECT);
  g.fillStyle = glow; // the one standby lamp that is still lit
  g.fillRect(x + 190, foot - 11, 2.4, 1.6);
  halo(g, x + 191, foot - 10, 7, '255,150,60', 0.4);
  g.fillStyle = css(HALL_METAL); // the mullions
  for (const mx of [x + w / 3, x + (2 * w) / 3]) g.fillRect(mx - 2.5, top, 5, foot - top);
  g.fillStyle = 'rgba(190,200,230,.1)'; // the reflection
  g.beginPath();
  g.moveTo(x + 24, top);
  g.lineTo(x + 94, top);
  g.lineTo(x + 40, foot);
  g.lineTo(x + 6, foot);
  g.fill();
  g.beginPath();
  g.moveTo(x + 130, top);
  g.lineTo(x + 150, top);
  g.lineTo(x + 96, foot);
  g.lineTo(x + 80, foot);
  g.fill();
  slab(g, x - 9, foot + 6, w + 18, 7, css(HALL_STEEL)); // the sill
  g.fillStyle = css(HALL_ON_AIR); // the lamp over the window, off
  g.globalAlpha = 0.28;
  g.fillRect(TEX / 2 - 22, top - 9, 44, 6);
  g.globalAlpha = 1;
  hallShade(g, rand);
};

// ---- a wall of old monitors ----
// four rows of four on a frame, one of them showing static, the glow of it on its neighbours
const monitors: Paint = (g, rand) => {
  hallWall(g, rand);
  const cols = 4,
    rows = 4,
    pitch = TEX / cols,
    w = pitch - 8,
    h = 27,
    first = rowOf(3.95),
    lit = [1 + Math.floor(rand() * 2), 1];
  slab(g, 2, first - 5, TEX - 4, rows * 31 + 14, '#241e30');
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) crt(g, rand, c * pitch + 4, first + r * 31, w, h, lit[0] === c && lit[1] === r);
  halo(g, lit[0]! * pitch + pitch / 2, first + lit[1]! * 31 + h / 2, 70, '150,150,205', 0.3);
  slab(g, 8, rowOf(1.3), TEX - 16, 6, css(HALL_STEEL)); // the shelf under them, a bundle of cables to the floor
  g.lineCap = 'round';
  CABLE_TONES.forEach((c, n) => {
    g.strokeStyle = css(c);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(TEX * 0.7 + n * 5, rowOf(1.3));
    g.bezierCurveTo(TEX * 0.7 + n * 7, rowOf(0.8), TEX * 0.78 + n * 10, rowOf(0.5), TEX * 0.8 + n * 12, rowOf(0.12));
    g.stroke();
  });
  hallShade(g, rand);
};

// ---- the feeder lines ----
// the foot of the aerial's feeders: three thick coaxial lines with their rings, a rectangular waveguide beside them,
// all rising from a junction box on the floor, held by clamps, up to the duct under the ceiling
const feeder: Paint = (g, rand) => {
  hallWall(g, rand);
  const lines = [64, 92, 120],
    guide = 176;
  g.fillStyle = 'rgba(2,0,6,.45)';
  for (const x of [...lines, guide + 10]) g.fillRect(x + 5, 0, 15, TEX);
  for (const x of lines) {
    const pipe = g.createLinearGradient(x - 9, 0, x + 9, 0);
    pipe.addColorStop(0, '#16111e');
    pipe.addColorStop(0.35, '#4f4868');
    pipe.addColorStop(1, '#16111e');
    g.fillStyle = pipe;
    g.fillRect(x - 9, 0, 18, rowOf(0.9));
    g.fillStyle = 'rgba(8,4,14,.55)'; // the rings round the jacket
    for (let y = 6; y < rowOf(0.9); y += 9) g.fillRect(x - 9, y, 18, 1.6);
  }
  const gw = g.createLinearGradient(guide - 13, 0, guide + 13, 0);
  gw.addColorStop(0, css(HALL_STEEL));
  gw.addColorStop(0.4, '#a29bb8');
  gw.addColorStop(1, '#575071');
  g.fillStyle = gw;
  g.fillRect(guide - 13, 0, 26, rowOf(0.9));
  g.fillStyle = '#3a3350';
  for (let y = rowOf(4.4); y < rowOf(0.9); y += rowOf(0.6) - rowOf(1.6)) {
    g.fillRect(guide - 17, y, 34, 5); // a flange every metre
    g.fillStyle = '#cfc8dc';
    for (const bx of [guide - 14, guide + 11]) g.fillRect(bx, y + 1, 2.4, 2.4);
    g.fillStyle = '#3a3350';
  }
  g.fillStyle = css(HALL_METAL); // clamps
  for (const m of [1.3, 2.9, 4.5]) slab(g, 52, rowOf(m), 82, 5, css(HALL_METAL));
  // the junction box where they come up through the floor
  slab(g, 40, rowOf(1.2), 112, rowOf(0.12) - rowOf(1.2), '#59526f');
  slab(g, 150, rowOf(1.2), 52, rowOf(0.12) - rowOf(1.2), css(HALL_STEEL));
  g.fillStyle = '#16111e';
  for (let k = 0; k < 4; k++) g.fillRect(54 + k * 24, rowOf(1.0), 14, 12);
  stripes(g, [40, rowOf(0.5), 162, rowOf(0.12) - rowOf(0.5)], 12, '#d8b640', '#1a1520', 'rgba(10,6,16,.3)');
  g.fillStyle = css(HALL_ON_AIR);
  g.globalAlpha = 0.6;
  g.fillRect(212, rowOf(3.3), 3, 3);
  g.globalAlpha = 1;
  hallShade(g, rand);
};

// ---- the cyclorama ----
// a pale backdrop that curves into the floor: light cloth gone grey, a coved foot lit from the side, scuffs and the
// scorch of lamps, a curtain track along the top
const cyclorama: Paint = (g, rand) => {
  const bg = g.createLinearGradient(0, 0, 0, TEX);
  bg.addColorStop(0, '#6c6384');
  bg.addColorStop(0.55, '#a29bb8');
  bg.addColorStop(0.82, '#b3acc6');
  bg.addColorStop(1, '#7c7494');
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 60, '#c0bad0', '#5d557a');
  const cove = g.createLinearGradient(0, rowOf(1.6), 0, rowOf(0.1)); // the curve at the foot, going over to the floor
  cove.addColorStop(0, 'rgba(60,50,80,0)');
  cove.addColorStop(0.55, 'rgba(60,50,80,.28)');
  cove.addColorStop(1, 'rgba(36,28,52,.62)');
  g.fillStyle = cove;
  g.fillRect(0, rowOf(1.6), TEX, rowOf(0.1) - rowOf(1.6));
  for (let k = 0; k < 7; k++)
    smudge(
      g,
      rand() * TEX,
      rowOf(0.3 + rand() * 1.2),
      18 + rand() * 30,
      8 + rand() * 18,
      '30,24,44',
      0.12 + rand() * 0.12,
    );
  for (let k = 0; k < 3; k++)
    smudge(
      g,
      rand() * TEX,
      rowOf(3 + rand() * 1.5),
      30 + rand() * 30,
      22 + rand() * 20,
      '70,52,40',
      0.1 + rand() * 0.08,
    );
  for (const x of [TEX * 0.33, TEX * 0.66]) {
    // the folds of the cloth
    const fold = g.createLinearGradient(x - 10, 0, x + 10, 0);
    fold.addColorStop(0, 'rgba(30,22,44,0)');
    fold.addColorStop(0.5, 'rgba(30,22,44,.2)');
    fold.addColorStop(1, 'rgba(255,250,255,.1)');
    g.fillStyle = fold;
    g.fillRect(x - 10, 0, 20, rowOf(0.5));
  }
  slab(g, 0, rowOf(5.1), TEX, 5, '#46405a'); // the track, with the rings
  g.fillStyle = css(HALL_METAL);
  for (let x = 8; x < TEX; x += 22) g.fillRect(x, rowOf(5.1) + 5, 1.6, 6);
  g.fillStyle = '#140f1c';
  g.fillRect(0, rowOf(0.12), TEX, TEX - rowOf(0.12));
  hallShade(g, rand);
};

// ---- plain walls and plates ----
// a bare panel wall: seams, a conduit, a small yellow and black band
const panel: Paint = (g, rand) => {
  hallWall(g, rand);
  for (const y of [rowOf(3.6), rowOf(1.9)]) {
    g.fillStyle = 'rgba(10,6,16,.45)';
    g.fillRect(0, y, TEX, 1.5);
  }
  slab(g, 0, rowOf(3.0), TEX, 4, '#59526f');
  stripes(g, [0, rowOf(0.5), TEX, rowOf(0.15) - rowOf(0.5)], 20, '#cfa83a', '#1a1520', 'rgba(10,6,16,.3)');
  hallShade(g, rand);
};
// a plate high on the wall over a base picture. `lines`: its words, one line each; each is as large as its plate allows
const signWall =
  (base: Paint, lines: string[], color: string, ink: string): Paint =>
  (g, rand) => {
    base(g, rand);
    const w = TEX - 40,
      top = rowOf(PLATE_TOP),
      h = rowOf(PLATE_FOOT) - top;
    g.fillStyle = 'rgba(2,0,6,.5)';
    g.fillRect(22, top + 2, w, h);
    g.fillStyle = color;
    g.fillRect(20, top, w, h);
    g.strokeStyle = PLATE_WHITE;
    g.lineWidth = 2;
    g.strokeRect(23, top + 3, w - 6, h - 6);
    const px = Math.min(Math.floor((w - 40) / Math.max(...lines.map(l => l.length))), 40),
      step = h / lines.length;
    g.fillStyle = ink;
    lines.forEach((line, n) => words(g, line, TEX / 2, top + step * (n + 0.5) + 1, px, WALL_ASPECT, SIGN_FONT, w - 40));
  };

// the walls by number, after the sector's (pictures.ts)
export const NOISE_HALL_WALLS: Paint[] = [
  padded,
  paddedTorn,
  cabinet,
  control,
  monitors,
  feeder,
  cyclorama,
  panel,
  signWall(padded, [NOISE_HALL_STUDIO], PLATE_BLUE, PLATE_WHITE),
  signWall(cabinet, [NOISE_HALL_TX], '#1f1a28', '#f0b248'),
  signWall(panel, NOISE_HALL_DANGER, PLATE_RED, PLATE_WHITE),
];
const [PADDED, TORN, CABINET, CONTROL, MONITORS, FEEDER, CYCLO, PANEL, SIGN_STUDIO, SIGN_TX, SIGN_DANGER] =
  NOISE_HALL_WALLS.map((_, n) => n);
// the walls of the hall by the share of it each picture takes: each is in the list as many times as it comes up (the
// padded walls and the cabinets take most of it)
export const NOISE_HALL_MAP = [
  PADDED,
  PADDED,
  PADDED,
  TORN,
  CABINET,
  CABINET,
  CABINET,
  CONTROL,
  MONITORS,
  FEEDER,
  CYCLO,
  PANEL,
  PANEL,
  SIGN_STUDIO,
  SIGN_TX,
  SIGN_DANGER,
].map(n => n!);
// what is set up by the hall's walls (hallProps.ts): the walls that are a transmitter (its glow), the plain walls a
// lamp box is hung on
export const NOISE_HALL_CABINETS = [CABINET!, SIGN_TX!];
export const NOISE_HALL_PLAIN = [PADDED!, PANEL!, SIGN_STUDIO!, SIGN_DANGER!];

// ---- the floor: worn studio floor ----
// Painted concrete in a dark violet grey, worn in patches, with a saw-cut joint across the middle both ways (half a
// tile in from the picture's edge, so none is on a tile's edge); the painter is given the same seed for every
// variant, so the wear runs on across the edge. Variant 0 bare, 1 a dolly's track, 2 tape marks, 3 the cover of a
// cable trench
const hallFloor =
  (variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = '#3c3450';
    g.fillRect(0, 0, TEX, TEX);
    for (let k = 0; k < 46; k++)
      smudge(
        g,
        rand() * TEX,
        rand() * TEX,
        14 + rand() * 46,
        10 + rand() * 30,
        rand() < 0.55 ? '14,8,22' : '130,120,156',
        0.06 + rand() * 0.11,
      );
    g.fillStyle = 'rgba(8,4,14,.5)';
    g.fillRect(SEAM - 0.75, 0, 1.5, TEX);
    g.fillRect(0, SEAM - 0.75, TEX, 1.5);
    g.fillStyle = 'rgba(190,180,215,.1)';
    g.fillRect(SEAM + 0.75, 0, 1, TEX);
    g.fillRect(0, SEAM + 0.75, TEX, 1);
    if (variant === 1) {
      // track for a camera dolly: two steel rails on ties, and the rubber of its wheels worn along them
      g.fillStyle = 'rgba(190,180,215,.14)';
      for (const y of [86, 168]) g.fillRect(0, y, TEX, 3);
      for (let x = 30; x < 226; x += 16) {
        g.fillStyle = '#2a2236';
        g.fillRect(x, 92, 7, 70);
        g.fillStyle = 'rgba(190,180,215,.12)';
        g.fillRect(x, 92, 7, 1.2);
      }
      for (const y of [98, 150]) {
        g.fillStyle = '#4a4260';
        g.fillRect(24, y, 208, 5);
        g.fillStyle = '#9c95b4';
        g.fillRect(24, y, 208, 1.5);
      }
      g.fillStyle = '#1d1728';
      g.fillRect(228, 94, 6, 66);
    } else if (variant === 2) {
      // marks in tape where a stand or a performer was to go: crosses and corner marks in three colours, an arrow
      const marks: [number, number, string][] = [
        [52, 62, '#c9c4d6'],
        [176, 70, '#d8b640'],
        [70, 178, '#d8864a'],
        [188, 174, '#c9c4d6'],
      ];
      g.globalAlpha = 0.72;
      for (const [x, y, c] of marks) {
        g.fillStyle = c;
        g.save();
        g.translate(x, y);
        g.rotate((rand() - 0.5) * 0.5);
        g.fillRect(-14, -1.8, 28, 3.6);
        g.fillRect(-1.8, -14, 3.6, 28);
        g.restore();
      }
      g.fillStyle = '#c9c4d6';
      g.beginPath();
      g.moveTo(104, 120);
      g.lineTo(150, 120);
      g.lineTo(150, 112);
      g.lineTo(166, 124);
      g.lineTo(150, 136);
      g.lineTo(150, 128);
      g.lineTo(104, 128);
      g.fill();
      g.globalAlpha = 1;
    } else if (variant === 3) {
      // the cover of a cable trench: a steel plate with a raised pattern, in a frame, two lifting holes, cable pushed
      // out through a slot at one end
      const x = 30,
        y = 100,
        w = 196,
        h = 56;
      g.fillStyle = '#0c0812';
      g.fillRect(x - 5, y - 5, w + 10, h + 10);
      g.fillStyle = '#5a5272';
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(190,180,215,.18)';
      for (let tx = x + 5; tx < x + w - 4; tx += 10)
        for (let ty = y + 6 + ((tx / 10) % 2) * 5; ty < y + h - 4; ty += 10) g.fillRect(tx, ty, 5, 1.6);
      g.fillStyle = '#0c0812';
      for (const hx of [x + 30, x + w - 40]) g.fillRect(hx, y + h / 2 - 4, 14, 8);
      g.fillStyle = 'rgba(8,4,14,.55)';
      g.fillRect(x + w / 2 - 1, y, 2, h);
      g.lineCap = 'round';
      g.strokeStyle = '#0c0812';
      g.lineWidth = 4.4;
      g.beginPath();
      g.moveTo(x + w, y + 36);
      g.bezierCurveTo(x + w + 14, y + 40, x + w + 8, y + 70, x + w - 12, y + 84);
      g.stroke();
    }
    grain(g, rand, 14);
  };
export const NOISE_HALL_FLOORS: Paint[] = [0, 1, 2, 3].map(hallFloor);

// ---- the wall above the usual height (a tile wide, as high as the boss room goes above the usual wall) ----
const TRUSS_AT = [0.05, 0.19]; // the lighting truss across the top: its two chords, from the top of the picture, as shares of its height
const CATWALK_AT = 0.52; // the catwalk
const TRAY_AT = 0.8; // the cable tray under it
const TRUSS_STEP = 26; // the diagonals of a truss (px)
// a length of truss across the picture: two chords and the zigzag between them
function truss(g: CanvasRenderingContext2D, y0: number, y1: number, color: string) {
  g.strokeStyle = 'rgba(2,0,6,.5)';
  g.lineWidth = 4;
  g.strokeRect(-4, y0 + 2, TEX + 8, y1 - y0);
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, y0);
  g.lineTo(TEX, y0);
  g.moveTo(0, y1);
  g.lineTo(TEX, y1);
  g.stroke();
  g.lineWidth = 1.6;
  g.beginPath();
  for (let x = 0; x < TEX; x += TRUSS_STEP) {
    g.moveTo(x, y1);
    g.lineTo(x + TRUSS_STEP / 2, y0);
    g.lineTo(x + TRUSS_STEP, y1);
  }
  g.stroke();
}
// a studio lamp hanging from a truss: a yoke, a dark can, a warm lens
function lamp(g: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = '#16111e';
  g.fillRect(x - 1, y, 2, 6);
  g.fillRect(x - 8, y + 6, 16, 18);
  g.fillStyle = lens;
  g.globalAlpha = 0.55;
  oval(g, x, y + 24, 6.5, 2.4);
  g.globalAlpha = 1;
  halo(g, x, y + 26, 22, '255,226,170', 0.2);
}
// dark board, a truss with studio lamps on it across the top, a catwalk with its handrail, and a cable tray
export const noiseHallUpper: Paint = (g, rand) => {
  hallWall(g, rand);
  g.fillStyle = 'rgba(6,4,10,.32)';
  g.fillRect(0, 0, TEX, TEX);
  g.fillStyle = 'rgba(2,0,6,.3)';
  for (const y of [TEX * 0.36, TEX * 0.7]) g.fillRect(0, y, TEX, 1.5);
  const [t0, t1] = TRUSS_AT.map(a => a * TEX);
  truss(g, t0!, t1!, css(HALL_STEEL));
  for (const x of [34, 110, 190]) lamp(g, x + rand() * 12, t1!);
  const cy = TEX * CATWALK_AT;
  g.fillStyle = 'rgba(2,0,6,.5)'; // the catwalk: a grating plate, a handrail on posts
  g.fillRect(0, cy + 2, TEX, 11);
  g.fillStyle = '#4d4666';
  g.fillRect(0, cy, TEX, 5);
  g.fillStyle = css(HALL_METAL);
  g.fillRect(0, cy, TEX, 1.5);
  g.fillStyle = '#5c5578';
  for (let x = 6; x < TEX; x += 32) g.fillRect(x, cy - 24, 2.2, 24);
  g.fillRect(0, cy - 24, TEX, 2);
  g.fillRect(0, cy - 12, TEX, 1.4);
  g.fillStyle = 'rgba(8,4,14,.55)'; // the underside, dark ribs
  for (let x = 4; x < TEX; x += 12) g.fillRect(x, cy + 5, 2, 6);
  const ty = TEX * TRAY_AT,
    th = 24;
  g.fillStyle = 'rgba(2,0,6,.5)';
  g.fillRect(0, ty - 3, TEX, th + 8);
  g.fillStyle = '#4d4666';
  g.fillRect(0, ty, TEX, 3);
  g.fillRect(0, ty + th - 3, TEX, 3);
  for (let x = 6; x < TEX; x += 16) g.fillRect(x, ty, 2.4, th);
  CABLE_TONES.forEach((c, n) => {
    g.fillStyle = css(c);
    g.fillRect(0, ty + 5 + n * 5, TEX, 3.4);
    g.fillStyle = 'rgba(8,4,14,.35)';
    g.fillRect(0, ty + 5 + n * 5, TEX, 3.4);
  });
  for (let k = 0; k < 8; k++) {
    // stains running down from the grid
    const len = 30 + rand() * 80,
      st = g.createLinearGradient(0, t1!, 0, t1! + len);
    st.addColorStop(0, 'rgba(6,4,10,.35)');
    st.addColorStop(1, 'rgba(6,4,10,0)');
    g.fillStyle = st;
    g.fillRect(rand() * TEX, t1!, 2 + rand() * 6, len);
  }
  hallShade(g, rand);
};

// ---- the ceiling: the lighting grid ----
const GRID = TEX / 2; // the truss runs across the tile both ways, every two metres
// the ceiling from below: dark board, a grid of truss running on from tile to tile both ways, clamps where they cross,
// a cable tray along one way, and a few lamp cans with a faint warm lens
export const noiseHallCeiling: Paint = (g, rand) => {
  g.fillStyle = '#1d1828';
  g.fillRect(0, 0, TEX, TEX);
  for (let k = 0; k < 500; k++) {
    g.fillStyle = 'rgba(2,0,6,.4)';
    g.fillRect(rand() * TEX, rand() * TEX, 1.4, 1.4);
  }
  grime(g, rand, 40, '#32293f', '#0a0710');
  for (let p = GRID / 2; p < TEX; p += GRID) {
    const a = p - 6,
      b = p + 6;
    g.fillStyle = 'rgba(2,0,6,.5)';
    g.fillRect(0, a - 2, TEX, 14);
    g.fillRect(a - 2, 0, 14, TEX);
    g.fillStyle = '#4d4666';
    g.fillRect(0, a, TEX, 2.4);
    g.fillRect(0, b - 2.4, TEX, 2.4);
    g.fillRect(a, 0, 2.4, TEX);
    g.fillRect(b - 2.4, 0, 2.4, TEX);
    g.strokeStyle = '#3a3350';
    g.lineWidth = 1.4;
    g.beginPath();
    for (let x = 0; x < TEX; x += 12) {
      g.moveTo(x, a);
      g.lineTo(x + 6, b);
      g.lineTo(x + 12, a);
      g.moveTo(a, x);
      g.lineTo(b, x + 6);
      g.lineTo(a, x + 12);
    }
    g.stroke();
  }
  g.fillStyle = css(HALL_METAL); // the clamps where they cross
  for (const x of [GRID / 2, GRID * 1.5]) for (const y of [GRID / 2, GRID * 1.5]) g.fillRect(x - 5, y - 5, 10, 10);
  const tray = GRID * 1.5 - 22; // a cable tray beside one of the trusses
  g.fillStyle = 'rgba(2,0,6,.5)';
  g.fillRect(0, tray - 2, TEX, 12);
  g.fillStyle = '#3a3350';
  g.fillRect(0, tray, TEX, 8);
  CABLE_TONES.forEach((c, n) => {
    g.fillStyle = css(c);
    g.fillRect(0, tray + 1 + n * 2.2, TEX, 1.8);
  });
  for (const [x, y] of [
    [GRID * 0.5 + 20, GRID * 0.5 + 12],
    [GRID * 1.5 - 16, GRID * 0.5 - 10],
  ] as const) {
    g.fillStyle = '#100c18'; // a lamp can, seen from below
    oval(g, x, y, 10, 10);
    g.fillStyle = lens;
    g.globalAlpha = 0.4;
    oval(g, x, y, 6, 6);
    g.globalAlpha = 1;
  }
  grain(g, rand, 10);
};
