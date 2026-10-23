import { MALL_DOCK, MALL_DOCK_YARD, MALL_FORKLIFT } from '../../../i18n/signs.ts';
import { SIGN_FONT, TEX, WALL_ASPECT, grain, grime, oval, rowOf, smudge, stripes, words } from '../paint.ts';
import type { Paint } from '../paint.ts';
import { HAZARD_BLACK, HAZARD_YELLOW } from './shared.ts';
// The pictures of the mall's loading dock, which is its boss room: concrete block walls over a concrete skirting with a
// band of yellow and black, the bays' roll-up shutters with their numbers and rubber bumpers, a board of switches
// and pipes, and plates high up that say where one is. Its floor is concrete, its walls go on up in painted sheet steel
// and its ceiling is the bare roof deck. The walls are numbered after the mall's own (pictures.ts MALL_WALL_PICS puts
// them last); they are drawn whole, nothing of the mall's panels is under them.
// ---- tuning numbers used only here ----
const SKIRT_TOP = 1.25; // top of the concrete skirting along the foot of a wall (m)
const BAND_FOOT = 0.3; // the band of yellow and black on it, from ... (m)
const BAND_TOP = 0.78; // ... to (m)
const BLOCK_ROWS = 0.4; // a course of the blockwork is this high (m), ...
const BLOCK_LEN = 0.8; // ... and this long
const PITCH = 20; // px across one stripe of yellow and black
const BAY_X = 20; // the bay's opening: its left edge (px), ...
const BAY_TOP = 4.35; // ... its top (m)
const SLAT = 4; // height of a shutter's slat (px)
const OPEN_TO = 2.7; // a raised shutter is rolled up to this height (m)
const SKIRT = '#6f706b';
const BAND_WORN = 'rgba(30,20,10,.28)';
const PLATE_WHITE = '#e4e2d6';
const FLOOR_TILE_JOINT = TEX / 2; // the floor's saw-cut joints run through the middle of its picture (px), so no joint is on the edge of a tile

// the wall every picture is painted on: blockwork in a pale grey with the dirt of years and a rain streak or two, the
// concrete skirting with its band of yellow and black, and the steel angle that caps it
function dockWall(g: CanvasRenderingContext2D, rand: () => number) {
  const wall = g.createLinearGradient(0, 0, 0, TEX);
  wall.addColorStop(0, '#9c9d97');
  wall.addColorStop(0.7, '#8f908a');
  wall.addColorStop(1, '#85867f');
  g.fillStyle = wall;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 80, '#b0b1a8', '#44453f');
  const rail = rowOf(SKIRT_TOP),
    courseH = (TEX * BLOCK_ROWS) / 6,
    courseW = (TEX * BLOCK_LEN) / 4;
  g.fillStyle = 'rgba(36,37,33,.16)';
  for (let row = 0, y = 0; y < rail; row++, y += courseH) {
    g.fillRect(0, y, TEX, 1);
    for (let x = (row % 2) * (courseW / 2); x < TEX; x += courseW) g.fillRect(x, y, 1, courseH);
  }
  for (let k = 0; k < 4; k++) {
    const len = 24 + rand() * 60,
      streak = g.createLinearGradient(0, 0, 0, len);
    streak.addColorStop(0, 'rgba(70,64,48,.3)');
    streak.addColorStop(1, 'rgba(70,64,48,0)');
    g.fillStyle = streak;
    g.fillRect(rand() * TEX, 0, 3 + rand() * 8, len);
  }
  g.fillStyle = SKIRT;
  g.fillRect(0, rail, TEX, TEX - rail);
  for (let k = 0; k < 600; k++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(235,235,225,.12)' : 'rgba(20,20,18,.16)';
    g.fillRect(rand() * TEX, rail + rand() * (TEX - rail), 1 + rand() * 2, 1);
  }
  stripes(
    g,
    [0, rowOf(BAND_TOP), TEX, rowOf(BAND_FOOT) - rowOf(BAND_TOP)],
    PITCH,
    HAZARD_YELLOW,
    HAZARD_BLACK,
    BAND_WORN,
  );
  for (let k = 0; k < 10; k++) {
    // scrapes of tyres and pallets along the band
    g.fillStyle = `rgba(14,12,10,${0.14 + rand() * 0.18})`;
    g.fillRect(rand() * TEX, rowOf(BAND_TOP) + rand() * (rowOf(BAND_FOOT) - rowOf(BAND_TOP)), 8 + rand() * 30, 1.5);
  }
  g.fillStyle = '#4a4c4f';
  g.fillRect(0, rail - 2, TEX, 4);
  g.fillStyle = 'rgba(255,255,250,.28)';
  g.fillRect(0, rail - 2, TEX, 1);
  grime(g, rand, 24, '#8d8e86', '#2c2d29');
}
// a plain wall; the second has the stains of a leak and a patched hole
const plainWall =
  (worn: boolean): Paint =>
  (g, rand) => {
    dockWall(g, rand);
    if (!worn) return;
    smudge(g, TEX * 0.3, rowOf(4.2), 38, 70, '60,50,34', 0.3);
    smudge(g, TEX * 0.72, rowOf(2.6), 26, 40, '40,40,34', 0.25);
    g.fillStyle = 'rgba(120,122,116,.8)';
    g.fillRect(TEX * 0.55, rowOf(3.4), 40, rowOf(2.7) - rowOf(3.4));
    g.strokeStyle = 'rgba(30,30,26,.5)';
    g.strokeRect(TEX * 0.55, rowOf(3.4), 40, rowOf(2.7) - rowOf(3.4));
  };

// a plate with words in it, a pale rim round it
function plate(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  g.fillStyle = 'rgba(10,10,8,.4)';
  g.fillRect(x + 2, y + 2, w, h);
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
  g.strokeStyle = PLATE_WHITE;
  g.lineWidth = 2;
  g.strokeRect(x + 3, y + 3, w - 6, h - 6);
}
// a roll-up shutter's bay: the jambs with their bands, the housing over the opening with the bay's number on a plate,
// the shutter (down, or rolled up part of the way, with the dark bay and the dock leveler's plate under it) and the
// rubber bumpers on both sides of the opening
const bay =
  (number: string, raised: boolean): Paint =>
  (g, rand) => {
    dockWall(g, rand);
    const x = BAY_X,
      w = TEX - 2 * BAY_X,
      top = rowOf(BAY_TOP),
      foot = rowOf(0.12),
      shutterFoot = raised ? rowOf(OPEN_TO) : foot - 8;
    // the opening, and the dark bay behind a raised shutter
    g.fillStyle = '#34373a';
    g.fillRect(x - 9, top - 4, w + 18, foot - top + 4);
    if (raised) {
      const dark = g.createLinearGradient(0, top, 0, foot);
      dark.addColorStop(0, '#08090b');
      dark.addColorStop(1, '#1c2024');
      g.fillStyle = dark;
      g.fillRect(x, top, w, foot - top);
      g.fillStyle = 'rgba(150,180,205,.05)';
      g.beginPath();
      g.moveTo(x + w * 0.2, rowOf(OPEN_TO));
      g.lineTo(x + w * 0.5, rowOf(OPEN_TO));
      g.lineTo(x + w * 0.9, foot);
      g.lineTo(x + w * 0.35, foot);
      g.fill();
    }
    // the shutter: ribbed steel, a bar with a handle at its foot
    const steel = g.createLinearGradient(x, 0, x + w, 0);
    steel.addColorStop(0, '#80878d');
    steel.addColorStop(0.5, '#929aa0');
    steel.addColorStop(1, '#7a8187');
    g.fillStyle = steel;
    g.fillRect(x, top, w, shutterFoot - top);
    for (let sy = top; sy < shutterFoot - 8; sy += SLAT) {
      g.fillStyle = 'rgba(0,0,0,.28)';
      g.fillRect(x, sy + SLAT - 1.2, w, 1.2);
      g.fillStyle = 'rgba(255,255,255,.1)';
      g.fillRect(x, sy, w, 1);
    }
    g.fillStyle = '#3a3d41';
    g.fillRect(x, shutterFoot - 8, w, 8);
    g.fillStyle = '#b9b4a0';
    g.fillRect(x + w * 0.5 - 7, shutterFoot - 6, 14, 4);
    for (let k = 0; k < 5; k++) {
      // dents and dust on the slats
      g.fillStyle = 'rgba(30,30,28,.22)';
      g.fillRect(x + rand() * w * 0.8, top + rand() * (shutterFoot - top - 20), 16 + rand() * 40, 3);
    }
    grime(g, rand, 30, '#9aa0a4', '#262826');
    if (raised) {
      // the dock leveler's plate with a yellow lip, the wheel guides either side
      const plateTop = rowOf(0.5);
      g.fillStyle = '#585d61';
      g.fillRect(x, plateTop, w, foot - plateTop);
      g.fillStyle = 'rgba(0,0,0,.3)';
      for (let tx = x + 6; tx < x + w - 4; tx += 10) g.fillRect(tx, plateTop + 4, 5, 1.5);
      stripes(g, [x, foot - 7, w, 7], 10, HAZARD_YELLOW, HAZARD_BLACK);
      g.fillStyle = HAZARD_YELLOW;
      g.fillRect(x + 8, plateTop - 2, 5, foot - plateTop);
      g.fillRect(x + w - 13, plateTop - 2, 5, foot - plateTop);
    }
    // the housing and the plate with the bay's number
    g.fillStyle = '#5b5e62';
    g.fillRect(x - 12, rowOf(4.95), w + 24, top - rowOf(4.95) - 4);
    g.fillStyle = 'rgba(255,255,255,.2)';
    g.fillRect(x - 12, rowOf(4.95), w + 24, 1.5);
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (let rx = x - 4; rx < x + w + 8; rx += 22) g.fillRect(rx, rowOf(4.7), 2, 2);
    plate(g, TEX / 2 - 28, rowOf(5.85), 56, rowOf(5.0) - rowOf(5.85), '#274b6e');
    g.fillStyle = PLATE_WHITE;
    words(g, number, TEX / 2, (rowOf(5.85) + rowOf(5.0)) / 2 + 1, 36, WALL_ASPECT, SIGN_FONT, 40);
    // the rubber bumpers a truck backs onto, one each side of the opening
    for (const bx of [x - 17, x + w + 7]) {
      g.fillStyle = '#18191b';
      g.fillRect(bx, rowOf(1.6), 10, rowOf(1.0) - rowOf(1.6));
      g.fillStyle = 'rgba(255,255,255,.14)';
      g.fillRect(bx + 1, rowOf(1.6), 2, rowOf(1.0) - rowOf(1.6));
    }
  };

// a board of switches: a grey steel cabinet with its two doors and a sign with a bolt on it, conduits up from it, and two
// pipes along the top of the wall with a flange at every joint and a handwheel
const service: Paint = (g, rand) => {
  dockWall(g, rand);
  const x = 76,
    w = 90,
    top = rowOf(2.5),
    foot = rowOf(0.85);
  g.fillStyle = '#4b6989';
  g.fillRect(0, rowOf(5.05), TEX, rowOf(4.75) - rowOf(5.05));
  g.fillStyle = '#6b7a52';
  g.fillRect(0, rowOf(5.6), TEX, rowOf(5.3) - rowOf(5.6));
  g.fillStyle = 'rgba(255,255,255,.2)';
  g.fillRect(0, rowOf(5.05), TEX, 1.5);
  g.fillRect(0, rowOf(5.6), TEX, 1.5);
  g.fillStyle = 'rgba(0,0,0,.3)';
  g.fillRect(0, rowOf(4.75) - 2, TEX, 2);
  g.fillRect(0, rowOf(5.3) - 2, TEX, 2);
  for (const fx of [24, 100, 188]) {
    g.fillStyle = '#3c4247';
    g.fillRect(fx, rowOf(5.15), 8, rowOf(4.65) - rowOf(5.15));
    g.fillRect(fx, rowOf(5.7), 8, rowOf(5.2) - rowOf(5.7));
  }
  g.fillStyle = '#c4a02a'; // a handwheel on the lower pipe
  oval(g, 150, rowOf(4.9), 9, 9 * WALL_ASPECT);
  g.fillStyle = '#4b6989';
  oval(g, 150, rowOf(4.9), 3.5, 3.5 * WALL_ASPECT);
  g.fillStyle = '#4a4e52';
  for (const cx of [x + 14, x + w / 2, x + w - 14]) g.fillRect(cx - 2, rowOf(5.0), 4, top - rowOf(5.0));
  g.fillStyle = '#2e3236';
  g.fillRect(x - 3, top - 3, w + 6, foot - top + 6);
  g.fillStyle = '#6e7c84';
  g.fillRect(x, top, w, foot - top);
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.fillRect(x + w / 2 - 0.5, top, 1.5, foot - top);
  g.fillStyle = '#2b2d2c';
  for (const hx of [x + w / 2 - 6, x + w / 2 + 4]) g.fillRect(hx, rowOf(1.6), 2.5, 7);
  g.fillStyle = 'rgba(255,255,255,.14)';
  g.fillRect(x, top, w, 1.5);
  // the sign on the left door: a yellow triangle with a bolt
  const tx = x + w * 0.25,
    ty = rowOf(2.05),
    r = 13;
  g.fillStyle = HAZARD_YELLOW;
  g.beginPath();
  g.moveTo(tx, ty - r * WALL_ASPECT * 1.5);
  g.lineTo(tx + r, ty + r * WALL_ASPECT * 0.9);
  g.lineTo(tx - r, ty + r * WALL_ASPECT * 0.9);
  g.fill();
  g.fillStyle = HAZARD_BLACK;
  g.beginPath();
  g.moveTo(tx + 2, ty - 8);
  g.lineTo(tx - 4, ty + 1);
  g.lineTo(tx, ty + 1);
  g.lineTo(tx - 2, ty + 9);
  g.lineTo(tx + 5, ty - 2);
  g.lineTo(tx + 1, ty - 2);
  g.fill();
  grime(g, rand, 24, '#9aa0a4', '#262826');
};

// the plates high on the wall: where one is. `lines`: its words, one line each; each is as large as its plate allows
const signWall =
  (lines: string[], color: string, ink: string): Paint =>
  (g, rand) => {
    dockWall(g, rand);
    const w = TEX - 40,
      top = rowOf(5.75),
      h = rowOf(4.55) - top;
    plate(g, 20, top, w, h, color);
    const px = Math.min(Math.floor((w - 40) / Math.max(...lines.map(l => l.length))), 52),
      step = h / lines.length;
    g.fillStyle = ink;
    lines.forEach((line, n) => words(g, line, TEX / 2, top + step * (n + 0.5) + 1, px, WALL_ASPECT, SIGN_FONT, w - 40));
    grime(g, rand, 20, '#9aa0a4', '#262826');
  };
// the forklift plate: black on yellow, with a warning triangle beside the words
const forkliftSign: Paint = (g, rand) => {
  signWall(MALL_FORKLIFT, HAZARD_YELLOW, HAZARD_BLACK)(g, rand);
  const cx = 52,
    cy = (rowOf(5.75) + rowOf(4.55)) / 2,
    r = 17;
  g.fillStyle = HAZARD_BLACK;
  g.beginPath();
  g.moveTo(cx, cy - r * WALL_ASPECT * 1.6);
  g.lineTo(cx + r, cy + r * WALL_ASPECT);
  g.lineTo(cx - r, cy + r * WALL_ASPECT);
  g.fill();
  g.fillStyle = HAZARD_YELLOW;
  g.fillRect(cx - 1.5, cy - 7, 3, 9);
  g.fillRect(cx - 1.5, cy + 4, 3, 3);
};

// the walls by number, after the mall's (pictures.ts)
export const DOCK_WALL_PICS: Paint[] = [
  plainWall(false),
  plainWall(true),
  bay('2', false),
  bay('4', true),
  bay('7', false),
  service,
  signWall([MALL_DOCK], '#1d6046', PLATE_WHITE),
  signWall([MALL_DOCK_YARD], '#274b6e', PLATE_WHITE),
  forkliftSign,
];
const [PLAIN_A, PLAIN_B, BAY_A, BAY_B, BAY_C, SERVICE, SIGN_DOCK, SIGN_YARD, SIGN_FORK] = DOCK_WALL_PICS.map(
  (_, n) => n,
);
// the walls of the dock by the share of it each picture takes: each is in the list as many times as it comes up (the
// plain walls are about half), the bays' shutters most of the rest
export const DOCK_WALL_MAP = [
  PLAIN_A,
  PLAIN_A,
  PLAIN_A,
  PLAIN_A,
  PLAIN_B,
  PLAIN_B,
  PLAIN_B,
  BAY_A,
  BAY_B,
  BAY_C,
  SERVICE,
  SERVICE,
  SIGN_DOCK,
  SIGN_YARD,
  SIGN_FORK,
].map(n => n!);
// the pictures that nothing is set up before (the shutters' bays stay clear; the plates are read from across the room), and
// the one a rack may stand against
export const DOCK_BAYS = [BAY_A!, BAY_B!, BAY_C!];
export const DOCK_SIGNS = [SIGN_DOCK!, SIGN_YARD!, SIGN_FORK!];
export const DOCK_RACK_WALLS = [PLAIN_A!, PLAIN_B!];

// ---- the floor: concrete ----
// Concrete with saw-cut joints through the middle of the picture, speckled; the stains run on across the picture's edge.
// Variant 0 plain, 1 oil, 2 black skids of tyres, 3 a crack
const dockFloor =
  (variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = '#74756f';
    g.fillRect(0, 0, TEX, TEX);
    for (let k = 0; k < 40; k++)
      smudge(
        g,
        rand() * TEX,
        rand() * TEX,
        20 + rand() * 50,
        14 + rand() * 34,
        rand() < 0.5 ? '210,210,198' : '30,30,26',
        0.04 + rand() * 0.06,
      );
    for (let k = 0; k < 1400; k++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(20,20,18,.14)' : 'rgba(235,235,225,.12)';
      g.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 1.5, 1);
    }
    g.fillStyle = 'rgba(16,16,14,.55)';
    g.fillRect(FLOOR_TILE_JOINT - 1, 0, 2, TEX);
    g.fillRect(0, FLOOR_TILE_JOINT - 1, TEX, 2);
    g.fillStyle = 'rgba(235,235,225,.1)';
    g.fillRect(FLOOR_TILE_JOINT + 1, 0, 1, TEX);
    g.fillRect(0, FLOOR_TILE_JOINT + 1, TEX, 1);
    if (variant === 1) {
      smudge(g, TEX * 0.3, TEX * 0.7, 40, 30, '16,12,8', 0.5);
      smudge(g, TEX * 0.36, TEX * 0.64, 18, 14, '8,6,4', 0.5);
      smudge(g, TEX * 0.7, TEX * 0.25, 22, 16, '16,12,8', 0.4);
      g.strokeStyle = 'rgba(110,130,150,.25)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(TEX * 0.3, TEX * 0.7, 36, 26, 0, 0, Math.PI * 2);
      g.stroke();
    } else if (variant === 2) {
      g.lineCap = 'round';
      for (const [sx, sy, ex, ey, bend, a] of [
        [20, 60, 230, 90, 40, 0.3],
        [26, 72, 236, 104, 44, 0.24],
        [60, 200, 200, 150, -30, 0.22],
      ] as const) {
        g.strokeStyle = `rgba(10,10,10,${a})`;
        g.lineWidth = 5 + rand() * 3;
        g.beginPath();
        g.moveTo(sx, sy);
        g.quadraticCurveTo((sx + ex) / 2, (sy + ey) / 2 + bend, ex, ey);
        g.stroke();
      }
    } else if (variant === 3) {
      g.strokeStyle = 'rgba(14,14,12,.6)';
      g.lineWidth = 1.6;
      g.beginPath();
      let cx = 0,
        cy = TEX * (0.2 + rand() * 0.6);
      g.moveTo(cx, cy);
      while (cx < TEX) {
        cx += 10 + rand() * 18;
        cy += (rand() - 0.5) * 26;
        g.lineTo(cx, cy);
      }
      g.stroke();
    }
    grime(g, rand, 24, '#9a9a90', '#2a2a26');
    grain(g, rand, 10);
  };
export const DOCK_FLOOR_PICS: Paint[] = [0, 1, 2, 3].map(dockFloor);

// ---- the wall above the usual height (a tile wide, as high as the boss room goes above the usual wall) ----
const SHEET_RIB = 8; // px across a rib of the cladding
const SHEET_SEAMS = [0.34, 0.68]; // where the sheets of the cladding meet, as a share of the height
// painted steel cladding in vertical ribs, with a girder along its foot (it runs on from the picture of the wall under it) and
// seams with a row of bolts
export const dockUpper: Paint = (g, rand) => {
  g.fillStyle = '#7b8286';
  g.fillRect(0, 0, TEX, TEX);
  for (let x = 0; x < TEX; x += SHEET_RIB) {
    g.fillStyle = 'rgba(255,255,255,.1)';
    g.fillRect(x, 0, 2, TEX);
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.fillRect(x + SHEET_RIB / 2, 0, 2, TEX);
  }
  for (const at of SHEET_SEAMS) {
    const y = TEX * at;
    g.fillStyle = 'rgba(10,12,14,.45)';
    g.fillRect(0, y, TEX, 2);
    g.fillStyle = 'rgba(30,34,38,.7)';
    for (let bx = 6; bx < TEX; bx += 16) g.fillRect(bx, y + 4, 3, 2);
  }
  for (let k = 0; k < 10; k++) {
    const len = 30 + rand() * 90,
      rust = g.createLinearGradient(0, 0, 0, len),
      x = rand() * TEX,
      y = rand() * TEX * 0.6;
    rust.addColorStop(0, 'rgba(110,60,32,.34)');
    rust.addColorStop(1, 'rgba(110,60,32,0)');
    g.fillStyle = rust;
    g.fillRect(x, y, 2 + rand() * 5, len);
  }
  grime(g, rand, 70, '#a0a8ac', '#2e3234');
  g.fillStyle = '#464a4e'; // the girder along the foot, its web and flanges
  g.fillRect(0, 0, TEX, TEX * 0.075);
  g.fillStyle = '#5a5f64';
  g.fillRect(0, TEX * 0.075, TEX, 3);
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.fillRect(0, TEX * 0.075 + 3, TEX, 5);
  grain(g, rand, 12);
};

// ---- the ceiling: the roof deck, bare ----
const DECK_RIB = 16; // px across a rib of the roof deck (25 cm)
export const dockCeiling: Paint = (g, rand) => {
  g.fillStyle = '#4b4e51';
  g.fillRect(0, 0, TEX, TEX);
  for (let x = 0; x < TEX; x += DECK_RIB) {
    g.fillStyle = 'rgba(255,255,255,.1)';
    g.fillRect(x, 0, DECK_RIB / 3, TEX);
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.fillRect(x + DECK_RIB / 2, 0, DECK_RIB / 3, TEX);
  }
  for (let k = 0; k < 6; k++)
    smudge(g, rand() * TEX, rand() * TEX, 26 + rand() * 40, 20 + rand() * 40, '96,60,38', 0.14);
  grime(g, rand, 50, '#767a7e', '#1d1f21');
  grain(g, rand, 10);
};
