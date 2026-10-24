import { css } from '../../../data/colors.ts';
import { DATA_HALL_ENTRY, DATA_HALL_FIRE, DATA_HALL_ROOM } from '../../../i18n/signs.ts';
import { SIGN_FONT, TEX, WALL_ASPECT, grain, grime, oval, rowOf, smudge, stripes, words } from '../paint.ts';
import type { Paint } from '../paint.ts';
import {
  CABLES,
  DISPLAY_DARK,
  DISPLAY_LIT,
  HALL_BUTTON,
  HALL_HAZARD,
  HALL_HEAD,
  HALL_HOUSING,
  HALL_LAMPS,
  HALL_METAL,
  HALL_WELL,
  joint,
} from './strokes.ts';
// The pictures of the data layer's server hall, which is its boss room: walls of racks as tall as two men, the little
// lamps down their fronts (some of them dark), a tape library behind glass, the cold pipes and air supply, the
// window of a control room with nothing lit in it, and plates high up that say where one is. It is darker than the rest
// of the layer, so that the rows of lamps stand out. Its floor is the raised floor with its panels showing, a grating,
// and a hole where panels were taken up and the cables under them are seen. Its walls go on up in dark panels with a
// cable tray and a fire main, and its ceiling is hung with trays and pipes. The walls are numbered after the layer's
// own (pictures.ts DATA_WALLS; they come last): they are drawn whole.
// ---- tuning numbers used only here ----
const RACK_TOP = 4.3; // top of a row of racks (m); the plates over it are 4.6 to 5.8 m
const RACK_FOOT = 0.1; // the plinth under it
const RACKS_PER_TILE = 6; // a rack is 0.67 m wide
const ROW = 5; // px high one machine's front in a rack
const RACK_LIVE = 0.72; // share of the racks that have power
const LAMP_LIT = 0.9; // share of a live rack's lamps that are lit
const HALO_SHARE = 0.16; // share of the lit lamps that have a halo
const PLATE_TOP = 5.8; // the plates high on the wall, from ... (m)
const PLATE_FOOT = 4.6; // ... to
const FLOOR_PANEL = TEX / 8; // a panel of the raised floor is half a metre (px)
const PANEL_RED = '#8e2a22'; // the fire main and its plate
const PLATE_WHITE = '#dfe5e8';

// the wall every picture is painted on: dark panels, a joint every two thirds of a metre, a dark skirting
function hallWall(g: CanvasRenderingContext2D, rand: () => number) {
  const bg = g.createLinearGradient(0, 0, 0, TEX);
  bg.addColorStop(0, '#1b232a');
  bg.addColorStop(0.5, '#262f38');
  bg.addColorStop(1, '#1a2127');
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 70, '#3a4751', '#0b1014');
  for (const x of [TEX / 6, TEX / 2, (TEX * 5) / 6]) joint(g, x, 0, TEX, true, 0.5);
  g.fillStyle = '#0f1418';
  g.fillRect(0, rowOf(0.12), TEX, TEX - rowOf(0.12));
}
// the shade at the top and the foot of every wall, and the grain
function hallShade(g: CanvasRenderingContext2D, rand: () => number) {
  const shade = g.createLinearGradient(0, 0, 0, TEX);
  shade.addColorStop(0, 'rgba(4,8,12,.5)');
  shade.addColorStop(0.2, 'rgba(4,8,12,0)');
  shade.addColorStop(0.85, 'rgba(4,8,12,0)');
  shade.addColorStop(1, 'rgba(4,8,12,.45)');
  g.fillStyle = shade;
  g.fillRect(0, 0, TEX, TEX);
  grain(g, rand, 14);
}

// a lamp: a lit dot, sometimes with a halo; `dim` for one seen through a door's mesh
function lamp(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, dim = 1) {
  g.globalAlpha = dim;
  g.fillStyle = css(HALL_LAMPS[Math.floor(rand() * HALL_LAMPS.length)]!);
  if (rand() < HALO_SHARE) {
    g.globalAlpha = 0.2 * dim;
    oval(g, x + 1.1, y + 0.75, 4.2, 4.2 * WALL_ASPECT);
    g.globalAlpha = dim;
  }
  g.fillRect(x, y, 2.4, 1.6);
  g.globalAlpha = 1;
}
// one rack from top to plinth: its frame, and the machines in it row by row (a blank here and there, drive bays, the
// lamps of a live rack, a dead rack's dark)
function rack(g: CanvasRenderingContext2D, rand: () => number, x: number, w: number, mesh: boolean) {
  const top = rowOf(RACK_TOP),
    foot = rowOf(RACK_FOOT),
    live = rand() < RACK_LIVE;
  g.fillStyle = '#0d1317';
  g.fillRect(x, top, w, foot - top);
  g.fillStyle = 'rgba(160,190,210,.18)';
  g.fillRect(x, top, w, 1.5);
  g.fillRect(x, top, 1.2, foot - top);
  g.fillStyle = 'rgba(0,0,0,.6)';
  g.fillRect(x + w - 1.5, top, 1.5, foot - top);
  const ix = x + 3,
    iw = w - 6;
  for (let y = top + 6; y < foot - 8; y += ROW) {
    const what = rand();
    if (what < 0.12) {
      g.fillStyle = '#1f272e';
      g.fillRect(ix, y, iw, ROW - 1);
      continue;
    }
    g.fillStyle = '#19222b';
    g.fillRect(ix, y, iw, ROW - 1);
    g.fillStyle = 'rgba(180,205,222,.08)';
    g.fillRect(ix, y, iw, 1);
    if (what < 0.5) {
      g.fillStyle = 'rgba(0,0,0,.5)';
      for (let bx = ix + iw * 0.42; bx < ix + iw - 3; bx += 4) g.fillRect(bx, y + 1.5, 2.4, ROW - 4);
    }
    if (!live) continue;
    for (let n = 0, count = 1 + Math.floor(rand() * 3); n < count; n++)
      if (rand() < LAMP_LIT) lamp(g, rand, ix + 2 + rand() * (iw * 0.4), y + 1.2, mesh ? 0.5 : 1);
  }
  if (mesh) {
    // a perforated door over it
    g.fillStyle = 'rgba(8,12,16,.6)';
    g.fillRect(ix, top + 6, iw, foot - top - 14);
    g.fillStyle = 'rgba(70,86,98,.6)';
    for (let py = top + 8; py < foot - 10; py += 3)
      for (let px = ix + 1 + ((py / 3) % 2) * 1.5; px < ix + iw - 1; px += 3) g.fillRect(px, py, 1.1, 1.1);
    g.fillStyle = '#7d8a94';
    g.fillRect(x + w - 6, rowOf(2.2), 2.2, rowOf(1.5) - rowOf(2.2));
  }
}
// a row of racks along the whole picture, the plate-less top of the wall above them left to the dark
function rackRow(g: CanvasRenderingContext2D, rand: () => number, mesh: number[] = []) {
  hallWall(g, rand);
  const w = TEX / RACKS_PER_TILE;
  g.fillStyle = 'rgba(2,4,6,.5)';
  g.fillRect(0, rowOf(RACK_TOP) - 10, TEX, 10);
  for (let n = 0; n < RACKS_PER_TILE; n++) rack(g, rand, n * w, w, mesh.includes(n));
}
const rackA: Paint = (g, rand) => {
  rackRow(g, rand);
  hallShade(g, rand);
};
const rackB: Paint = (g, rand) => {
  rackRow(g, rand, [1, 4]);
  hallShade(g, rand);
};
// the cables of a rack that took more than it was made for: a bundle out of a gap in one of the racks, down to the
// floor and spread across it
const rackCable: Paint = (g, rand) => {
  rackRow(g, rand, [0]);
  const cx = TEX * 0.5,
    top = rowOf(3.2),
    foot = rowOf(2.3);
  g.fillStyle = '#04070a';
  g.fillRect(cx - 18, top, 36, foot - top);
  g.lineCap = 'round';
  for (let n = 0; n < 11; n++) {
    const s = n - 5,
      x1 = cx + s * 3,
      x2 = cx + s * 11 + (rand() - 0.5) * 20,
      x3 = cx + s * 17 + (rand() - 0.5) * 24;
    for (const [off, color, width] of [
      [1.8, 'rgba(2,4,6,.6)', 4.2],
      [0, css(CABLES[n % CABLES.length]!), 3.2],
    ] as const) {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(x1 + off, foot - 8 + off);
      g.bezierCurveTo(x1 + off, rowOf(1.4), x2 + off, rowOf(0.9), x3 + off, rowOf(0.22));
      g.stroke();
    }
  }
  hallShade(g, rand);
};

// a tape library: two cabinets side by side as one, a window with two reels turning in the dark, a row of buttons and a
// display, drawers under it
const tape: Paint = (g, rand) => {
  hallWall(g, rand);
  const x0 = 14,
    w = TEX - 28,
    top = rowOf(3.9),
    foot = rowOf(RACK_FOOT),
    body = g.createLinearGradient(x0, 0, x0 + w, 0);
  body.addColorStop(0, '#2c3841');
  body.addColorStop(0.5, '#38454f');
  body.addColorStop(1, '#2a363f');
  g.fillStyle = body;
  g.fillRect(x0, top, w, foot - top);
  g.fillStyle = 'rgba(180,205,222,.2)';
  g.fillRect(x0, top, w, 1.5);
  g.fillStyle = 'rgba(0,0,0,.5)';
  g.fillRect(TEX / 2 - 0.75, top, 1.5, foot - top);
  // the window
  const wx = 30,
    ww = TEX - 60,
    wy = rowOf(3.55),
    wh = rowOf(1.95) - wy;
  g.fillStyle = css(HALL_HOUSING);
  g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
  g.fillStyle = css(HALL_WELL);
  g.fillRect(wx, wy, ww, wh);
  const cy = wy + wh / 2;
  for (const cx of [TEX * 0.3, TEX * 0.7]) {
    g.fillStyle = '#25201d'; // the tape wound on it
    oval(g, cx, cy, 31, 31 * WALL_ASPECT);
    g.fillStyle = '#66717a';
    oval(g, cx, cy, 14, 14 * WALL_ASPECT);
    g.fillStyle = '#0c1115';
    oval(g, cx, cy, 5, 5 * WALL_ASPECT);
    g.strokeStyle = '#66717a';
    g.lineWidth = 2;
    for (let a = 0; a < 3; a++) {
      const t = a * ((Math.PI * 2) / 3) + 0.4;
      g.beginPath();
      g.moveTo(cx + Math.cos(t) * 5, cy + Math.sin(t) * 5 * WALL_ASPECT);
      g.lineTo(cx + Math.cos(t) * 14, cy + Math.sin(t) * 14 * WALL_ASPECT);
      g.stroke();
    }
  }
  g.strokeStyle = '#25201d'; // the tape between them, over two guides
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(TEX * 0.3 - 31, cy);
  g.lineTo(TEX * 0.3 - 31, wy + wh - 5);
  g.lineTo(TEX * 0.7 + 31, wy + wh - 5);
  g.lineTo(TEX * 0.7 + 31, cy);
  g.stroke();
  g.fillStyle = '#66717a';
  for (const gx of [TEX * 0.36, TEX * 0.64]) oval(g, gx, wy + wh - 5, 3, 3 * WALL_ASPECT);
  g.fillStyle = 'rgba(150,185,210,.07)'; // a slant of light across the glass
  g.beginPath();
  g.moveTo(wx + 10, wy);
  g.lineTo(wx + 60, wy);
  g.lineTo(wx + 24, wy + wh);
  g.lineTo(wx, wy + wh);
  g.lineTo(wx, wy + 14);
  g.fill();
  // the strip of buttons and a green display
  const sy = rowOf(1.75),
    sh = rowOf(1.3) - sy;
  g.fillStyle = '#12191e';
  g.fillRect(wx, sy, ww, sh);
  g.fillStyle = css(DISPLAY_DARK);
  g.fillRect(wx + 8, sy + 4, 56, sh - 8);
  g.fillStyle = css(DISPLAY_LIT);
  for (let sx = wx + 12; sx < wx + 60; sx += 7) g.fillRect(sx, sy + 8, 4, sh - 16);
  for (let n = 0; n < 6; n++) {
    g.fillStyle = css(HALL_BUTTON);
    g.fillRect(wx + 84 + n * 18, sy + 6, 12, 7);
    lamp(g, rand, wx + 88 + n * 18, sy + sh - 9);
  }
  // two drawers, each with a handle
  for (const [a, b] of [
    [rowOf(1.2), rowOf(0.7)],
    [rowOf(0.65), rowOf(0.2)],
  ] as const) {
    g.fillStyle = '#222c34';
    g.fillRect(wx, a, ww, b - a);
    g.fillStyle = 'rgba(180,205,222,.14)';
    g.fillRect(wx, a, ww, 1.2);
    g.fillStyle = '#8b97a0';
    g.fillRect(TEX / 2 - 22, a + (b - a) / 2 - 1.5, 44, 3);
  }
  hallShade(g, rand);
};

// the cold pipes: one wrapped in blue, one in white lagging, each with a band every metre, and a riser with a valve,
// over the air supply: a slotted diffuser high on the wall with the light of the room along its slots
const cool: Paint = (g, rand) => {
  hallWall(g, rand);
  for (const [m, color, band] of [
    [3.9, '#3d6d8f', '#27465e'],
    [3.25, '#b8c2c8', '#7c868c'],
  ] as const) {
    const y = rowOf(m),
      h = rowOf(m - 0.28) - y;
    g.fillStyle = 'rgba(2,4,6,.5)';
    g.fillRect(0, y + h, TEX, 4);
    const pipe = g.createLinearGradient(0, y, 0, y + h);
    pipe.addColorStop(0, color);
    pipe.addColorStop(0.35, 'rgba(255,255,255,.28)');
    pipe.addColorStop(1, 'rgba(0,0,0,.45)');
    g.fillStyle = color;
    g.fillRect(0, y, TEX, h);
    g.fillStyle = pipe;
    g.fillRect(0, y, TEX, h);
    g.fillStyle = band;
    for (let x = 14; x < TEX; x += 64) g.fillRect(x, y - 2, 5, h + 4);
  }
  const rx = TEX * 0.82;
  g.fillStyle = '#9fa9b0'; // the riser
  g.fillRect(rx, rowOf(3.25) + 4, 12, rowOf(0.12) - rowOf(3.25) - 4);
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.fillRect(rx + 8, rowOf(3.25) + 4, 4, rowOf(0.12) - rowOf(3.25) - 4);
  g.fillStyle = '#3d6d8f'; // its valve wheel
  oval(g, rx + 6, rowOf(1.6), 12, 12 * WALL_ASPECT);
  g.fillStyle = css(HALL_HOUSING);
  oval(g, rx + 6, rowOf(1.6), 4, 4 * WALL_ASPECT);
  for (let k = 0; k < 10; k++) {
    // condensation: drips running down from the pipes
    const len = 20 + rand() * 60,
      drip = g.createLinearGradient(0, rowOf(3.25), 0, rowOf(3.25) + len);
    drip.addColorStop(0, 'rgba(120,170,205,.3)');
    drip.addColorStop(1, 'rgba(120,170,205,0)');
    g.fillStyle = drip;
    g.fillRect(8 + rand() * (TEX - 16), rowOf(3.25) + 4, 1.5 + rand() * 2.5, len);
  }
  const dx = 24,
    dw = TEX - 48,
    dy = rowOf(5.5),
    dh = rowOf(4.7) - dy;
  g.fillStyle = '#3a4650';
  g.fillRect(dx - 4, dy - 4, dw + 8, dh + 8);
  g.fillStyle = css(HALL_WELL);
  g.fillRect(dx, dy, dw, dh);
  for (let sx = dx + 6; sx < dx + dw - 8; sx += 11) {
    g.fillStyle = css(HALL_METAL);
    g.fillRect(sx, dy + 2, 7, dh - 4);
    g.fillStyle = 'rgba(160,215,245,.35)';
    g.fillRect(sx, dy + 2, 7, 1.5);
  }
  hallShade(g, rand);
};

// the window of the control room: an aluminium frame in three panes, the glass dark with a slant of reflection and,
// behind it, the shapes of a desk and a few monitors that nobody has switched on for years
const control: Paint = (g, rand) => {
  hallWall(g, rand);
  const x = 20,
    w = TEX - 40,
    top = rowOf(3.7),
    foot = rowOf(1.15);
  g.fillStyle = 'rgba(2,4,6,.5)';
  g.fillRect(x + 3, top + 3, w, foot - top);
  g.fillStyle = '#7e8a93';
  g.fillRect(x - 5, top - 5, w + 10, foot - top + 10);
  g.fillStyle = '#04070a';
  g.fillRect(x, top, w, foot - top);
  // the room behind: a desk along the back, monitors on it, a chair
  g.fillStyle = '#0c1318';
  g.fillRect(x, foot - 34, w, 34);
  g.fillStyle = '#131c22';
  g.fillRect(x, foot - 36, w, 3);
  for (const mx of [x + 22, x + 74, x + 128, x + 180]) {
    g.fillStyle = '#10181d';
    g.fillRect(mx, foot - 70, 38, 31);
    g.fillStyle = rand() < 0.3 ? '#0e2733' : '#0a1217';
    g.fillRect(mx + 3, foot - 67, 32, 25);
    g.fillStyle = '#10181d';
    g.fillRect(mx + 16, foot - 40, 6, 5);
  }
  g.fillStyle = '#0f171c';
  oval(g, x + 110, foot - 20, 14, 14 * WALL_ASPECT);
  // the frame's two mullions, the sill, the reflection
  g.fillStyle = '#7e8a93';
  for (const mx of [x + w / 3, x + (2 * w) / 3]) g.fillRect(mx - 2.5, top, 5, foot - top);
  g.fillStyle = 'rgba(2,4,6,.4)';
  for (const mx of [x + w / 3, x + (2 * w) / 3]) g.fillRect(mx + 2.5, top, 2, foot - top);
  g.fillStyle = '#5f6b74';
  g.fillRect(x - 9, foot + 5, w + 18, 7);
  g.fillStyle = 'rgba(150,190,215,.09)';
  g.beginPath();
  g.moveTo(x + 14, top);
  g.lineTo(x + 84, top);
  g.lineTo(x + 30, foot);
  g.lineTo(x, foot);
  g.lineTo(x, top + 20);
  g.fill();
  g.beginPath();
  g.moveTo(x + 120, top);
  g.lineTo(x + 140, top);
  g.lineTo(x + 86, foot);
  g.lineTo(x + 70, foot);
  g.fill();
  // under it, a panel of keyed switches
  g.fillStyle = '#10171c';
  g.fillRect(x, foot + 16, w, rowOf(0.5) - foot - 16);
  for (let n = 0; n < 8; n++) {
    g.fillStyle = '#566069';
    g.fillRect(x + 10 + n * 26, foot + 22, 11, 9);
    if (n % 3 === 0) lamp(g, rand, x + 14 + n * 26, foot + 38);
  }
  hallShade(g, rand);
};

// a bare panel wall: where the air-conditioning units and the cable ladders stand. The second has a yellow and black
// band at the foot and a small notice board
const plainWall =
  (marked: boolean): Paint =>
  (g, rand) => {
    hallWall(g, rand);
    for (const y of [rowOf(3.6), rowOf(1.9)]) joint(g, 0, y, TEX, false, 0.45);
    if (marked) {
      stripes(g, [0, rowOf(0.5), TEX, rowOf(0.15) - rowOf(0.5)], 20, css(HALL_HAZARD), '#14181b', 'rgba(10,10,10,.3)');
      g.fillStyle = '#10171c';
      g.fillRect(150, rowOf(2.9), 74, rowOf(1.9) - rowOf(2.9));
      g.fillStyle = '#566069';
      for (let n = 0; n < 4; n++) g.fillRect(156, rowOf(2.7) + n * 11, 62 - (n % 2) * 18, 2.4);
    }
    hallShade(g, rand);
  };

// a plate high on the wall over a row of racks. `lines`: its words, one line each; each is as large as its plate allows
const signWall =
  (lines: string[], color: string, ink: string): Paint =>
  (g, rand) => {
    rackRow(g, rand);
    const w = TEX - 40,
      top = rowOf(PLATE_TOP),
      h = rowOf(PLATE_FOOT) - top;
    g.fillStyle = 'rgba(2,4,6,.5)';
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
    hallShade(g, rand);
  };

// the walls by number, after the layer's (pictures.ts)
export const DATA_HALL_WALLS: Paint[] = [
  rackA,
  rackB,
  rackCable,
  tape,
  cool,
  control,
  plainWall(false),
  plainWall(true),
  signWall([DATA_HALL_ROOM], '#27506f', PLATE_WHITE),
  signWall([DATA_HALL_ENTRY], '#1b2127', '#e1b43a'),
  signWall(DATA_HALL_FIRE, PANEL_RED, PLATE_WHITE),
];
const [RACK_A, RACK_B, RACK_CABLE, TAPE, COOL, CONTROL, PLAIN_A, PLAIN_B, SIGN_ROOM, SIGN_ENTRY, SIGN_FIRE] =
  DATA_HALL_WALLS.map((_, n) => n);
// the walls of the hall by the share of it each picture takes: each is in the list as many times as it comes up (the
// racks are over half)
export const DATA_HALL_MAP = [
  RACK_A,
  RACK_A,
  RACK_A,
  RACK_B,
  RACK_B,
  RACK_B,
  RACK_CABLE,
  RACK_CABLE,
  TAPE,
  TAPE,
  COOL,
  COOL,
  CONTROL,
  PLAIN_A,
  PLAIN_B,
  SIGN_ROOM,
  SIGN_ENTRY,
  SIGN_FIRE,
].map(n => n!);
// what is set up by the hall's walls (hallProps.ts): the walls that are a row of racks (the lamps, the pulled boards,
// the ladders), the walls an air-conditioning unit may stand against
export const DATA_HALL_RACKS = [RACK_A!, RACK_B!, RACK_CABLE!, SIGN_ROOM!, SIGN_ENTRY!, SIGN_FIRE!];
export const DATA_HALL_PLAIN = [PLAIN_A!, PLAIN_B!, COOL!];

// ---- the floor: the raised floor ----
// The raised floor in a darker grey with its joints showing (half a panel in from the picture's edge, so none is on a
// tile's edge; the painter is given the same seed for every variant, so the marks run on across the edge).
// Variant 0 plain, 1 a grating, 2 panels taken up (the cables under the floor seen), 3 a cable cut-out and scuffs
const hallFloor =
  (variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = '#2f3a43';
    g.fillRect(0, 0, TEX, TEX);
    for (let a = 0; a < 8; a++)
      for (let b = 0; b < 8; b++) {
        g.fillStyle = rand() < 0.5 ? `rgba(255,255,255,${rand() * 0.04})` : `rgba(4,8,12,${rand() * 0.1})`;
        for (const ox of [0, -TEX])
          for (const oy of [0, -TEX])
            g.fillRect(FLOOR_PANEL * (a + 0.5) + ox, FLOOR_PANEL * (b + 0.5) + oy, FLOOR_PANEL, FLOOR_PANEL);
      }
    for (let k = 0; k < 36; k++)
      smudge(
        g,
        rand() * TEX,
        rand() * TEX,
        14 + rand() * 46,
        10 + rand() * 30,
        rand() < 0.6 ? '6,10,14' : '110,124,136',
        0.06 + rand() * 0.1,
      );
    for (let p = FLOOR_PANEL / 2; p < TEX; p += FLOOR_PANEL) {
      joint(g, p, 0, TEX, true, 0.6);
      joint(g, 0, p, TEX, false, 0.6);
    }
    const at = (n: number) => FLOOR_PANEL * (n + 0.5); // the joint before panel n
    if (variant === 1) {
      // a grating: four panels of steel bars over a dark well, the cold air coming up through it
      const x = at(2),
        y = at(3),
        s = FLOOR_PANEL * 2;
      g.fillStyle = '#04070a';
      g.fillRect(x, y, s, s);
      g.fillStyle = '#6a7882';
      for (let bx = x + 2; bx < x + s - 1; bx += 4) g.fillRect(bx, y, 1.8, s);
      g.fillStyle = '#4a5760';
      for (let by = y + 5; by < y + s - 1; by += 16) g.fillRect(x, by, s, 2);
      g.strokeStyle = '#7e8a93';
      g.lineWidth = 3;
      g.strokeRect(x, y, s, s);
    } else if (variant === 2) {
      // two panels taken up: the pit, the pedestals the floor stands on, the cables running through under it
      const x = at(2),
        y = at(3),
        w = FLOOR_PANEL * 2,
        h = FLOOR_PANEL;
      const pit = g.createLinearGradient(x, y, x, y + h);
      pit.addColorStop(0, '#020406');
      pit.addColorStop(1, '#0b1015');
      g.fillStyle = pit;
      g.fillRect(x, y, w, h);
      g.fillStyle = '#5d6a74'; // the cut edge of the panels round it
      g.fillRect(x - 2, y - 2, w + 4, 3);
      g.fillRect(x - 2, y - 2, 3, h + 4);
      g.fillStyle = '#1e2830';
      g.fillRect(x + w, y - 2, 2, h + 4);
      g.fillRect(x - 2, y + h, w + 4, 2);
      g.fillStyle = '#3b4650'; // pedestals
      for (const px of [x + 4, x + w - 8]) for (const py of [y + 4, y + h - 9]) g.fillRect(px, py, 4, 5);
      g.lineCap = 'round';
      CABLES.forEach((c, n) => {
        const cy = y + 5 + n * 4.6;
        for (const [off, color, width] of [
          [1.4, 'rgba(0,0,0,.6)', 3.4],
          [0, css(c), 2.6],
        ] as const) {
          g.strokeStyle = color;
          g.lineWidth = width;
          g.beginPath();
          g.moveTo(x + 2, cy + off);
          g.bezierCurveTo(x + w * 0.3, cy + off + 5 - n, x + w * 0.6, cy + off - 5 + n, x + w - 2, cy + off + 1);
          g.stroke();
        }
      });
      g.fillStyle = 'rgba(120,150,170,.18)'; // the lamp of a rack falling on it
      oval(g, x + w * 0.5, y + 4, 22, 4);
    } else if (variant === 3) {
      // a panel with a cut-out and a cable up through it, and the scuffs of boards dragged over the floor
      const x = at(3),
        y = at(2);
      g.fillStyle = '#6a7882';
      g.fillRect(x + 3, y + 3, FLOOR_PANEL - 6, FLOOR_PANEL - 6);
      g.fillStyle = '#040608';
      g.fillRect(x + 6, y + 6, FLOOR_PANEL - 12, FLOOR_PANEL - 12);
      g.lineCap = 'round';
      g.strokeStyle = css(CABLES[1]!);
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(x + FLOOR_PANEL / 2, y + FLOOR_PANEL / 2);
      g.bezierCurveTo(x + 40, y + 30, x + 70, y + 60, x + 96, y + 52);
      g.stroke();
      g.strokeStyle = 'rgba(150,170,184,.2)';
      g.lineWidth = 1.2;
      for (let k = 0; k < 14; k++) {
        const sx = 40 + rand() * 176,
          sy = 40 + rand() * 176;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx + 14 + rand() * 40, sy + (rand() - 0.5) * 6);
        g.stroke();
      }
    }
    grain(g, rand, 12);
  };
export const DATA_HALL_FLOORS: Paint[] = [0, 1, 2, 3].map(hallFloor);

// ---- the wall above the usual height (a tile wide, as high as the boss room goes above the usual wall) ----
const TRAY_AT = 0.7; // the cable tray along the upper wall, from the top of the picture, as a share of its height
const MAIN_AT = 0.32; // the fire main
// dark panels with joints, a cable tray of ladder with its cables, and the fire main in red with a flange at every
// metre and a hanger from the wall
export const dataHallUpper: Paint = (g, rand) => {
  hallWall(g, rand);
  g.fillStyle = 'rgba(4,8,12,.3)';
  g.fillRect(0, 0, TEX, TEX);
  for (let y = TEX * 0.5; y < TEX; y += TEX * 0.5) joint(g, 0, y, TEX, false, 0.4);
  const ty = TEX * TRAY_AT,
    th = 26;
  g.fillStyle = 'rgba(2,4,6,.5)';
  g.fillRect(0, ty - 3, TEX, th + 8);
  g.fillStyle = '#4c5963';
  g.fillRect(0, ty, TEX, 3);
  g.fillRect(0, ty + th - 3, TEX, 3);
  for (let x = 6; x < TEX; x += 16) g.fillRect(x, ty, 2.4, th);
  CABLES.forEach((c, n) => {
    g.fillStyle = css(c);
    g.fillRect(0, ty + 5 + n * 3.8, TEX, 3);
    g.fillStyle = 'rgba(4,8,12,.4)';
    g.fillRect(0, ty + 5 + n * 3.8, TEX, 3);
  });
  const my = TEX * MAIN_AT,
    mh = 12,
    main = g.createLinearGradient(0, my, 0, my + mh);
  g.fillStyle = 'rgba(2,4,6,.5)';
  g.fillRect(0, my + mh, TEX, 4);
  main.addColorStop(0, '#a63a30');
  main.addColorStop(0.4, '#c25a4a');
  main.addColorStop(1, '#5c1c16');
  g.fillStyle = main;
  g.fillRect(0, my, TEX, mh);
  g.fillStyle = '#2a0f0c';
  for (let x = 20; x < TEX; x += TEX / 4) g.fillRect(x, my - 3, 5, mh + 6);
  g.fillStyle = '#3a454e';
  for (const x of [TEX * 0.12, TEX * 0.62]) g.fillRect(x, my + mh, 3, ty - my - mh);
  for (let k = 0; k < 8; k++) {
    const len = 30 + rand() * 80,
      st = g.createLinearGradient(0, 0, 0, len);
    st.addColorStop(0, 'rgba(4,8,12,.35)');
    st.addColorStop(1, 'rgba(4,8,12,0)');
    g.fillStyle = st;
    g.fillRect(rand() * TEX, 0, 2 + rand() * 6, len);
  }
  hallShade(g, rand);
};

// ---- the ceiling: a lattice of cable trays and the fire mains ----
const TRAY_HALF = 12; // half the width of a cable tray in the lattice (px)
// the ceiling from below: dark hung panels, a lattice of cable trays running on from tile to tile both ways, the fire
// main in red along the middle of one way with its sprinkler heads, and a smoke detector or two
export const dataHallCeiling: Paint = (g, rand) => {
  g.fillStyle = '#161d23';
  g.fillRect(0, 0, TEX, TEX);
  for (let k = 0; k < 500; k++) {
    g.fillStyle = 'rgba(2,4,6,.4)';
    g.fillRect(rand() * TEX, rand() * TEX, 1.4, 1.4);
  }
  grime(g, rand, 40, '#2a343c', '#080c10');
  for (let p = TEX / 8; p < TEX; p += TEX / 4) {
    g.fillStyle = '#242e36';
    g.fillRect(p - 1.5, 0, 3, TEX);
    g.fillRect(0, p - 1.5, TEX, 3);
  }
  for (const mid of [TEX / 4, (TEX * 3) / 4]) {
    g.fillStyle = '#2c3841';
    g.fillRect(0, mid - TRAY_HALF, TEX, 3);
    g.fillRect(0, mid + TRAY_HALF - 3, TEX, 3);
    g.fillRect(mid - TRAY_HALF, 0, 3, TEX);
    g.fillRect(mid + TRAY_HALF - 3, 0, 3, TEX);
    for (let x = 4; x < TEX; x += 14) {
      g.fillRect(x, mid - TRAY_HALF, 2.4, TRAY_HALF * 2);
      g.fillRect(mid - TRAY_HALF, x, TRAY_HALF * 2, 2.4);
    }
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(0, mid - TRAY_HALF + 4, TEX, TRAY_HALF * 2 - 8);
    g.fillRect(mid - TRAY_HALF + 4, 0, TRAY_HALF * 2 - 8, TEX);
    CABLES.forEach((c, n) => {
      g.fillStyle = css(c);
      g.fillRect(0, mid - 7 + n * 3, TEX, 2.4);
      g.fillRect(mid - 7 + n * 3, 0, 2.4, TEX);
    });
    g.fillStyle = 'rgba(4,8,12,.5)'; // the dark of the hall over the cables
    g.fillRect(0, mid - TRAY_HALF, TEX, TRAY_HALF * 2);
    g.fillRect(mid - TRAY_HALF, 0, TRAY_HALF * 2, TEX);
  }
  const my = TEX * 0.5 - 5;
  g.fillStyle = 'rgba(0,0,0,.5)';
  g.fillRect(0, my - 2, TEX, 14);
  const main = g.createLinearGradient(0, my, 0, my + 10);
  main.addColorStop(0, '#c25a4a');
  main.addColorStop(1, '#6a2018');
  g.fillStyle = main;
  g.fillRect(0, my, TEX, 10);
  g.fillStyle = '#2a0f0c';
  for (let x = 24; x < TEX; x += TEX / 4) g.fillRect(x, my - 2, 5, 14);
  g.fillStyle = css(HALL_HEAD); // sprinkler heads on short drops
  for (const x of [TEX * 0.2, TEX * 0.7]) {
    g.fillRect(x - 1.5, my + 10, 3, 6);
    oval(g, x, my + 20, 5, 5);
    g.fillStyle = '#9a2a20';
    oval(g, x, my + 20, 2.4, 2.4);
    g.fillStyle = css(HALL_HEAD);
  }
  g.fillStyle = '#c8cfd4'; // a smoke detector with its small red lamp
  oval(g, TEX * 0.4, TEX * 0.1, 7, 7);
  g.fillStyle = '#e04030';
  oval(g, TEX * 0.4 + 3, TEX * 0.1 - 2, 1.4, 1.4);
  grain(g, rand, 10);
};
