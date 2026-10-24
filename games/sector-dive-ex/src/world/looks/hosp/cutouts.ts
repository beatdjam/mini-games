import type * as THREE from 'three';
import {
  HOSP_AED,
  HOSP_CHART,
  HOSP_LINEN,
  HOSP_LOCKER,
  HOSP_MEDICINE,
  HOSP_PAYMENT,
  HOSP_PHONE,
  HOSP_SANITIZER,
  HOSP_STRETCHER,
} from '../../../i18n/signs.ts';
import { SIGN_FONT, canvasTex, oval } from '../paint.ts';
import { block, pick, seeded, soil } from '../cutoutTools.ts';
import type { G } from '../cutoutTools.ts';
import {
  HAZARD_BLACK,
  HAZARD_YELLOW,
  LINEN_BLUE,
  LINEN_WHITE,
  MINT_DADO,
  MINT_MID,
  MINT_TOP,
  PLATE_WHITE,
  RAIL,
  SIGN_GREEN,
  SKIRTING,
  STEEL,
  STEEL_DARK,
} from './shared.ts';
import { bed, ivStand, stretcher, trolley, wheelchair } from './objects.ts';
// The hospital's painted set pieces (see looks/dress.ts): the side of a raised deck, then what the closed hospital was
// left full of: along the corridors, vending machines, lockers, public telephones, medicine cabinets and payment machines
// let into the walls; stretchers, wheelchairs, boxes of charts, fallen drip stands, bags of linen and a tipped bed along
// their feet; ceiling tiles come down, a privacy curtain half off its rail and a television hanging crooked up high.
// The colours are the hospital's: pale mint, cream, stainless steel and dull vinyl, and nothing at the foot of a wall is a
// bright red (it would be taken for a hazard floor).
const CARTON = ['#a98a5f', '#9a7c53', '#b39469'];
const CHART_PAPER = ['#d8d6c5', '#cdd0bc', '#e0dccb'];
const VENDING = [
  ['#3f6a66', '#8a6a3c', '#56606a'],
  ['#6b7a3c', '#56606a', '#3f6a66'],
];
const DRINKS = ['#a8664a', '#4f7a8d', '#c0a448', '#5a8c62', '#8a6a92', '#d8d6c5'];
const LOCKER_DOORS = ['#8ba396', '#b5ad8a', '#7e9a8c'];
const FOOT_PX = 14; // the skirting at the foot of a unit's picture (px)
const UNIT_KINDS = 5; // vending machines, lockers, telephones, medicine cabinets, payment machines (a unit's kind is its number % this)

// ---- the side of a raised deck ----
const DECK_BODY = ['#8aa898', '#82a090', '#92b0a0'];
// The side of a raised deck of the hospital, a tile wide and a deck high: a platform faced in pale green panels with a
// steel cap under a band of yellow and black, dust and old water marks at the foot
export function hospDeckTex(): THREE.CanvasTexture {
  const rand = seeded(4301),
    W = 256,
    H = 128;
  return canvasTex(W, H, g => {
    g.fillStyle = '#7e9c8d';
    g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 64) {
      g.fillStyle = pick(rand, DECK_BODY);
      g.fillRect(x + 1, 22, 62, H - 22);
      g.fillStyle = 'rgba(230,244,236,.12)';
      g.fillRect(x + 1, 22, 62, 2);
      g.fillStyle = 'rgba(14,24,18,.3)';
      g.fillRect(x, 22, 1.4, H - 22);
    }
    g.fillStyle = STEEL;
    g.fillRect(0, 12, W, 6);
    g.fillStyle = HAZARD_BLACK;
    g.fillRect(0, 0, W, 12);
    g.fillStyle = HAZARD_YELLOW;
    for (let x = 0; x < W; x += 16) g.fillRect(x, 0, 8, 12);
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.fillRect(0, 18, W, 3);
    soil(g, rand, W, H, H * 0.5);
  });
}

// ---- what the closed hospital was left full of ----
// the wall a unit stands against: the corridor's mint wall over its darker paint, the handrail between, as in the rest
// of the corridors
function alcove(g: G, W: number, H: number) {
  const wall = g.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, MINT_TOP);
  wall.addColorStop(0.3, MINT_MID);
  wall.addColorStop(1, MINT_DADO);
  g.fillStyle = wall;
  g.fillRect(0, 0, W, H);
  g.fillStyle = MINT_DADO;
  g.fillRect(0, 252, W, H - 252);
  g.fillStyle = RAIL;
  g.fillRect(0, 248, W, 8);
  g.fillStyle = SKIRTING;
  g.fillRect(0, H - FOOT_PX + 2, W, FOOT_PX);
}
// three vending machines side by side: a lit-out header, the glass with rows of cans and bottles, the buttons, the bin
function vending(g: G, rand: () => number, _W: number, H: number, n: number) {
  const bodies = VENDING[Math.floor(n / UNIT_KINDS) % VENDING.length]!,
    foot = H - FOOT_PX,
    top = 62;
  bodies.forEach((body, k) => {
    const x = 30 + k * 158,
      w = 142;
    block(g, x, top, w, foot - top, body);
    g.fillStyle = k === 1 ? '#2a3430' : '#d8dcc8';
    g.fillRect(x + 8, top + 8, w - 16, 28);
    g.fillStyle = 'rgba(40,50,40,.5)';
    g.fillRect(x + 20, top + 18, w - 40, 7);
    g.fillStyle = '#1d2321';
    g.fillRect(x + 8, top + 46, w - 54, 160);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 5; c++)
        if (rand() < 0.85) {
          g.fillStyle = pick(rand, DRINKS);
          g.fillRect(x + 12 + c * 16, top + 52 + r * 38, 12, 28);
        }
    g.fillStyle = 'rgba(210,222,222,.12)';
    g.fillRect(x + 8, top + 46, (w - 54) * 0.35, 160);
    g.fillStyle = '#2a3430';
    g.fillRect(x + w - 38, top + 46, 30, 100);
    for (let b = 0; b < 6; b++) {
      g.fillStyle = b % 3 ? '#9aa29a' : '#c9c0a0';
      g.fillRect(x + w - 34, top + 52 + b * 14, 22, 8);
    }
    g.fillStyle = '#121714';
    g.fillRect(x + 10, foot - 48, w - 20, 32);
  });
}
// a block of lockers: rows of small doors with a number plate, one or two ajar, a plate over them
function lockers(g: G, rand: () => number, W: number, H: number, n: number) {
  const cols = 8,
    rows = 4,
    cw = 58,
    ch = 64,
    x0 = (W - cols * cw) / 2,
    y0 = H - FOOT_PX - rows * ch,
    tone = LOCKER_DOORS[n % LOCKER_DOORS.length]!;
  g.fillStyle = '#3a4340';
  g.fillRect(x0 - 5, y0 - 5, cols * cw + 10, rows * ch + 10);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * cw,
        y = y0 + r * ch;
      if (rand() < 0.07) {
        g.fillStyle = '#121714';
        g.fillRect(x + 2, y + 2, cw - 4, ch - 4);
        g.fillStyle = tone;
        g.beginPath();
        g.moveTo(x + 2, y + 2);
        g.lineTo(x + 16, y + 8);
        g.lineTo(x + 16, y + ch - 10);
        g.lineTo(x + 2, y + ch - 2);
        g.fill();
        continue;
      }
      g.fillStyle = tone;
      g.fillRect(x + 2, y + 2, cw - 4, ch - 4);
      g.fillStyle = 'rgba(255,255,255,.12)';
      g.fillRect(x + 2, y + 2, cw - 4, 2);
      g.fillStyle = 'rgba(0,0,0,.28)';
      g.fillRect(x + 2, y + ch - 4, cw - 4, 2);
      g.fillStyle = '#26302c';
      g.fillRect(x + cw / 2 - 3, y + 14, 6, 14);
      g.fillStyle = PLATE_WHITE;
      g.fillRect(x + cw / 2 - 9, y + ch - 24, 18, 9);
    }
  g.fillStyle = SIGN_GREEN;
  g.fillRect(x0 + 90, y0 - 52, 190, 34);
  g.strokeStyle = PLATE_WHITE;
  g.lineWidth = 2;
  g.strokeRect(x0 + 93, y0 - 49, 184, 28);
  g.fillStyle = PLATE_WHITE;
  g.font = `700 20px ${SIGN_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(HOSP_LOCKER, x0 + 185, y0 - 34, 170);
}
// a row of public telephones: green boxes on the wall with a handset on its hook, a coin slot, a card slot, a shelf
// under each and a plate over them
function phones(g: G, rand: () => number) {
  for (let k = 0; k < 3; k++) {
    const x = 46 + k * 150,
      w = 112;
    block(g, x, 150, w, 120, '#58805f');
    g.fillStyle = '#1d2723';
    g.fillRect(x + 12, 162, w - 24, 26);
    g.fillStyle = '#6a6a50';
    g.fillRect(x + 16, 168, 30, 6);
    g.fillStyle = '#c9c0a0';
    g.fillRect(x + w - 34, 196, 20, 6);
    g.fillRect(x + 14, 196, 36, 4);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 3; c++) {
        g.fillStyle = '#d0cdb8';
        g.fillRect(x + 20 + c * 24, 214 + r * 12, 16, 8);
      }
    // the handset on the side, hanging by its cord
    g.fillStyle = '#2a3430';
    g.fillRect(x + w - 8, 160, 10, 60);
    g.strokeStyle = 'rgba(40,48,44,.8)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x + w - 3, 220);
    g.bezierCurveTo(x + w + 6, 236, x + w - 14, 246, x + w - 3, 262);
    g.stroke();
    block(g, x - 8, 276, w + 16, 14, '#8a8a76');
    if (rand() < 0.5) {
      g.fillStyle = PLATE_WHITE; // a slip of paper left on the shelf
      g.fillRect(x + 20 + rand() * 50, 268, 16, 8);
    }
  }
  g.fillStyle = SIGN_GREEN;
  g.fillRect(150, 90, 212, 36);
  g.strokeStyle = PLATE_WHITE;
  g.lineWidth = 2;
  g.strokeRect(153, 93, 206, 30);
  g.fillStyle = PLATE_WHITE;
  g.font = `700 22px ${SIGN_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(HOSP_PHONE, 256, 109, 180);
}
// tall medicine cabinets, glass-fronted: bottles and boxes on the shelves, a lock on each door, a plate over them
function cabinets(g: G, rand: () => number, _W: number, H: number) {
  const foot = H - FOOT_PX;
  for (let k = 0; k < 3; k++) {
    const x = 34 + k * 156,
      w = 142,
      top = 74;
    block(g, x, top, w, foot - top, '#b9c4b2');
    g.fillStyle = '#1b2724';
    g.fillRect(x + 8, top + 8, w - 16, foot - top - 70);
    for (let s = 0; s < 4; s++) {
      const by = top + 8 + ((foot - top - 70) / 4) * (s + 1);
      g.fillStyle = '#7d8884';
      g.fillRect(x + 10, by - 3, w - 20, 3);
      for (let bx = x + 14; bx < x + w - 24; bx += 12 + rand() * 6) {
        g.fillStyle = pick(rand, ['#7a5a3b', '#4f7a5a', '#cfcfc0', '#d8d6c5', '#7ea0b8']);
        g.fillRect(bx, by - 10 - rand() * 14, 8, 10 + rand() * 14);
      }
    }
    g.fillStyle = 'rgba(210,226,222,.12)';
    g.beginPath();
    g.moveTo(x + 8, top + 8);
    g.lineTo(x + 50, top + 8);
    g.lineTo(x + 20, foot - 62);
    g.lineTo(x + 8, foot - 62);
    g.fill();
    block(g, x + 8, foot - 56, w - 16, 44, '#a5b0a0');
    g.fillStyle = STEEL_DARK;
    g.fillRect(x + w / 2 - 2, top + 8, 4, foot - top - 70);
    g.fillRect(x + w / 2 - 8, foot - 40, 16, 4);
  }
  g.fillStyle = '#2f5a52';
  g.fillRect(150, 30, 212, 34);
  g.strokeStyle = PLATE_WHITE;
  g.lineWidth = 2;
  g.strokeRect(153, 33, 206, 28);
  g.fillStyle = PLATE_WHITE;
  g.font = `700 20px ${SIGN_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(HOSP_MEDICINE, 256, 48, 180);
}
// payment machines: three kiosks with their screens dark, a bill slot, a card reader and a receipt slot, the sign on top
function kiosks(g: G, rand: () => number, _W: number, H: number) {
  const foot = H - FOOT_PX;
  for (let k = 0; k < 3; k++) {
    const x = 36 + k * 154,
      w = 134;
    block(g, x, 96, w, foot - 96, '#d0d4c4');
    g.fillStyle = '#16201d';
    g.fillRect(x + 12, 110, w - 24, 70);
    g.fillStyle = 'rgba(190,214,208,.12)';
    g.beginPath();
    g.moveTo(x + 12, 110);
    g.lineTo(x + 54, 110);
    g.lineTo(x + 24, 180);
    g.lineTo(x + 12, 180);
    g.fill();
    g.fillStyle = '#2f5a52';
    g.fillRect(x + 12, 194, 50, 22);
    g.fillStyle = '#4a514e';
    g.fillRect(x + 70, 194, 52, 10);
    g.fillRect(x + 70, 210, 52, 6);
    g.fillStyle = '#c9c0a0';
    for (let b = 0; b < 4; b++) g.fillRect(x + 14 + b * 28, 232, 20, 10);
    g.fillStyle = '#0f1513';
    g.fillRect(x + 20, 256, w - 40, 10);
    if (rand() < 0.6) {
      g.fillStyle = PLATE_WHITE; // a receipt hanging out of its slot
      g.fillRect(x + 40 + rand() * 30, 262, 12, 20 + rand() * 10);
    }
  }
  g.fillStyle = '#2f5a52';
  g.fillRect(150, 30, 212, 40);
  g.strokeStyle = PLATE_WHITE;
  g.lineWidth = 2;
  g.strokeRect(153, 33, 206, 34);
  g.fillStyle = PLATE_WHITE;
  g.font = `700 22px ${SIGN_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(HOSP_PAYMENT, 256, 51, 180);
}
const UNIT_PAINTERS = [vending, lockers, phones, cabinets, kiosks];
// What is let into a wall of the corridor, about 3.7 m by 2.8 m, by the number: the kind is `n % UNIT_KINDS` and a second
// round of vending machines and lockers is in other colours
export function hospUnitTex(n: number): THREE.CanvasTexture {
  const rand = seeded(2200 + n * 31),
    W = 512,
    H = 400;
  return canvasTex(W, H, g => {
    alcove(g, W, H);
    UNIT_PAINTERS[n % UNIT_KINDS]!(g, rand, W, H, n);
    const dark = g.createLinearGradient(0, 0, W, H);
    dark.addColorStop(0.4, 'rgba(0,0,0,0)');
    dark.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = dark;
    g.fillRect(0, 0, W, H);
    soil(g, rand, W, H, H * 0.55);
  });
}

const EDGE_KINDS = 3; // a vending machine, a block of lockers, a tall cabinet with an AED and a sanitiser pump on it
const EDGE_W = 192,
  EDGE_H = 320; // px: 1.2 m by 2 m
const EDGE_BODIES = ['#3f6a66', '#8a6a3c', '#56606a', '#6b7a3c'];
// a vending machine filling the picture: the header, the glass with its rows, the buttons, the bin
function vendingOne(g: G, rand: () => number, v: number) {
  block(g, 6, 6, EDGE_W - 12, EDGE_H - 12, EDGE_BODIES[v % EDGE_BODIES.length]!);
  g.fillStyle = '#d8dcc8';
  g.fillRect(16, 16, EDGE_W - 32, 28);
  g.fillStyle = '#1d2321';
  g.fillRect(16, 56, EDGE_W - 74, 190);
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++)
      if (rand() < 0.85) {
        g.fillStyle = pick(rand, DRINKS);
        g.fillRect(22 + c * 18, 62 + r * 36, 13, 26);
      }
  g.fillStyle = '#2a3430';
  g.fillRect(EDGE_W - 50, 56, 34, 110);
  for (let b = 0; b < 6; b++) {
    g.fillStyle = b % 3 ? '#9aa29a' : '#c9c0a0';
    g.fillRect(EDGE_W - 46, 62 + b * 16, 26, 9);
  }
  g.fillStyle = '#121714';
  g.fillRect(20, EDGE_H - 56, EDGE_W - 40, 36);
}
// a block of lockers: three columns of tall doors, a few ajar
function lockersOne(g: G, rand: () => number, v: number) {
  const tone = LOCKER_DOORS[v % LOCKER_DOORS.length]!;
  g.fillStyle = '#3a4340';
  g.fillRect(4, 4, EDGE_W - 8, EDGE_H - 8);
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 2; r++) {
      const x = 8 + c * 59,
        y = 8 + r * 152;
      g.fillStyle = rand() < 0.1 ? '#121714' : tone;
      g.fillRect(x, y, 56, 148);
      g.fillStyle = 'rgba(255,255,255,.12)';
      g.fillRect(x, y, 56, 2);
      g.fillStyle = 'rgba(0,0,0,.26)';
      for (let s = 0; s < 4; s++) g.fillRect(x + 12, y + 14 + s * 4, 32, 1.4);
      g.fillStyle = '#26302c';
      g.fillRect(x + 40, y + 70, 6, 16);
      g.fillStyle = PLATE_WHITE;
      g.fillRect(x + 16, y + 120, 24, 11);
    }
}
// a tall cabinet in the wall's own paint with an AED box hung on it at chest height, a sanitiser pump under it and a
// notice over them
function aedOne(g: G, rand: () => number, v: number) {
  g.fillStyle = v % 2 ? MINT_MID : '#cfd4be';
  g.fillRect(4, 4, EDGE_W - 8, EDGE_H - 8);
  g.fillStyle = 'rgba(30,44,34,.2)';
  g.fillRect(EDGE_W / 2 - 1, 4, 2, EDGE_H - 8);
  block(g, 40, 70, 112, 78, '#e4e8d8');
  g.fillStyle = SIGN_GREEN;
  g.fillRect(46, 76, 100, 24);
  g.fillStyle = '#e8f0e4';
  g.font = `700 20px ${SIGN_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(HOSP_AED, 96, 89, 80);
  g.fillStyle = '#1f2b27';
  g.fillRect(52, 108, 88, 32);
  block(g, 70, 190, 50, 82, PLATE_WHITE);
  g.fillStyle = STEEL;
  g.fillRect(90, 180, 8, 12);
  g.fillRect(90, 178, 22, 4);
  g.fillStyle = '#2c5a7a';
  g.font = `700 11px ${SIGN_FONT}`;
  g.fillText(HOSP_SANITIZER, 95, 234, 44);
  g.fillStyle = PLATE_WHITE;
  g.fillRect(34, 14 + rand() * 6, 56, 38);
  g.fillStyle = 'rgba(40,44,44,.5)';
  for (let ly = 20; ly < 48; ly += 6) g.fillRect(40, ly, 20 + rand() * 24, 1.6);
}
const EDGE_PAINTERS = [vendingOne, lockersOne, aedOne];
// What stands at the end of a wall face, 1.2 m by 2 m, by the number: the kind is `n % EDGE_KINDS`, the rest of the number
// the colours
export function hospEdgeTex(n: number): THREE.CanvasTexture {
  const rand = seeded(2250 + n * 29);
  return canvasTex(EDGE_W, EDGE_H, g => {
    EDGE_PAINTERS[n % EDGE_KINDS]!(g, rand, Math.floor(n / EDGE_KINDS));
    const dark = g.createLinearGradient(0, 0, EDGE_W, EDGE_H);
    dark.addColorStop(0.4, 'rgba(0,0,0,0)');
    dark.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = dark;
    g.fillRect(0, 0, EDGE_W, EDGE_H);
    soil(g, rand, EDGE_W, EDGE_H, EDGE_H * 0.55);
  });
}

// a box of charts: a carton with its lid open, folders standing in it and sheets spilled over the front
function chartBox(g: G, rand: () => number, x: number, foot: number, w: number, h: number) {
  block(g, x, foot - h, w, h, pick(rand, CARTON));
  g.fillStyle = 'rgba(60,40,20,.35)';
  g.fillRect(x, foot - h, w, 6);
  for (let f = x + 4; f < x + w - 8; f += 9) {
    g.fillStyle = pick(rand, CHART_PAPER);
    g.fillRect(f, foot - h - 14 - rand() * 14, 8, 20 + rand() * 12);
    g.fillStyle = 'rgba(60,80,110,.5)';
    g.fillRect(f, foot - h - 10, 8, 3);
  }
  g.fillStyle = PLATE_WHITE;
  g.fillRect(x + 6, foot - h * 0.6, w * 0.36, h * 0.28);
  g.fillStyle = 'rgba(60,40,40,.55)';
  g.font = `700 10px ${SIGN_FONT}`;
  g.textAlign = 'center';
  g.fillText(HOSP_CHART, x + 6 + w * 0.18, foot - h * 0.4, w * 0.32);
}
// a bag of linen, tied at the neck, with a highlight (white, pale blue or pale green)
function linenBag(g: G, x: number, foot: number, r: number, color: string) {
  g.fillStyle = color;
  oval(g, x, foot - r * 0.85, r, r * 0.85);
  g.beginPath();
  g.moveTo(x - r * 0.22, foot - r * 1.5);
  g.lineTo(x + r * 0.3, foot - r * 1.5);
  g.lineTo(x + r * 0.12, foot - r * 1.95);
  g.lineTo(x - r * 0.12, foot - r * 1.95);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.18)';
  oval(g, x - r * 0.35, foot - r * 1.05, r * 0.28, r * 0.4);
  g.fillStyle = 'rgba(30,50,60,.18)';
  g.fillRect(x - r * 0.5, foot - r * 0.9, r, 2);
}
const HEAP_KINDS = 6;
// A heap along the foot of a wall, about 3.5 m by 1.75 m, by its number, piled up to the chest (the picture is hung 0.9 of
// its height, so a pile 200 px high stands about 1.3 m): two stretchers one over the other with a drip stand;
// wheelchairs folded and stacked; boxes of charts in columns with sheets spilled; drip stands fallen over and a trolley
// on its side; bags of linen heaped; a bed tipped on its side with its mattress
export function hospHeapTex(n: number): THREE.CanvasTexture {
  const rand = seeded(2300 + n * 17),
    W = 512,
    H = 256,
    foot = H - 6,
    kind = n % HEAP_KINDS;
  return canvasTex(W, H, g => {
    if (kind === 0) {
      stretcher(g, 40, foot, 320, 0, n);
      stretcher(g, 70, foot - 70, 290, 0.03, n + 1);
      ivStand(g, 400, foot, 190, 0.12);
      ivStand(g, 440, foot, 170, -0.1);
      g.fillStyle = 'rgba(210,214,200,.75)';
      oval(g, 470, foot - 6, 22, 6);
    } else if (kind === 1) {
      for (let k = 0; k < 4; k++) wheelchair(g, 30 + k * 50, foot - (k % 2) * 6, 150 - k * 6, -0.06 + k * 0.03);
      wheelchair(g, 250, foot, 160, 0);
      wheelchair(g, 340, foot, 150, 0.04);
      wheelchair(g, 410, foot - 4, 140, -0.04, '#4a5561');
    } else if (kind === 2) {
      [2, 3, 5, 4, 3, 2].forEach((m, c) => {
        const w = 62 + rand() * 24,
          x = 10 + c * 82 + rand() * 6;
        let y = foot;
        for (let k = 0; k < m; k++) {
          const h = 38 + rand() * 12;
          chartBox(g, rand, x + rand() * 6 - 3, y, w * (0.85 + rand() * 0.15), h - 2);
          y -= h;
        }
      });
      for (let k = 0; k < 22; k++) {
        g.save();
        g.translate(20 + rand() * (W - 60), foot - 4 - rand() * 6);
        g.rotate(rand() * 0.7 - 0.35);
        g.fillStyle = pick(rand, CHART_PAPER);
        g.fillRect(0, 0, 18 + rand() * 10, 4 + rand() * 4);
        g.restore();
      }
    } else if (kind === 3) {
      ivStand(g, 50, foot, 210, 1.15);
      ivStand(g, 150, foot, 200, 0.95);
      ivStand(g, 380, foot, 215, -0.12);
      trolley(g, 220, foot, 120, 90, -1.45);
      g.fillStyle = 'rgba(184,206,214,.8)';
      oval(g, 300, foot - 5, 20, 6);
      oval(g, 330, foot - 4, 14, 5);
      g.fillStyle = 'rgba(210,214,200,.8)';
      g.fillRect(420, foot - 10, 60, 8);
      g.fillRect(436, foot - 22, 40, 12);
    } else if (kind === 4) {
      const colors = [LINEN_WHITE, LINEN_BLUE, '#a9c4a9', '#e8e4cc'];
      for (let row = 0; row < 5; row++) {
        const count = 9 - row * 2;
        for (let c = 0; c < count; c++)
          linenBag(
            g,
            W / 2 + (c - (count - 1) / 2) * 54 + rand() * 8 - 4,
            foot - row * 42,
            29 + rand() * 6,
            pick(rand, colors),
          );
      }
      g.fillStyle = LINEN_WHITE;
      g.font = `700 14px ${SIGN_FONT}`;
      g.textAlign = 'center';
      g.fillText(HOSP_LINEN, 90, foot - 24, 60);
    } else {
      bed(g, 24, foot, 330, -1.25, '#a9c4a9');
      g.fillStyle = LINEN_BLUE; // the blanket slipped off onto the floor
      g.beginPath();
      g.moveTo(330, foot);
      g.quadraticCurveTo(360, foot - 40, 420, foot - 10);
      g.lineTo(440, foot);
      g.fill();
      stretcher(g, 330, foot, 170, 0.0, n);
      g.fillStyle = 'rgba(14,18,14,.5)';
      g.font = `700 11px ${SIGN_FONT}`;
      g.textAlign = 'center';
      g.fillText(HOSP_STRETCHER, 415, foot - 54, 70);
    }
    soil(g, rand, W, H, H * 0.45);
  });
}

// The face of a carton, a linen sack, a plastic crate or a cabinet drawer, the whole picture: the solid things the heaps are
// made of
export function hospBoxTex(n: number): THREE.CanvasTexture {
  const rand = seeded(2400 + n * 13),
    S = 128;
  return canvasTex(S, S, g => {
    if (n % 4 === 2) {
      g.fillStyle = '#56788d';
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(0,0,0,.4)';
      for (let k = 0; k < 4; k++) g.fillRect(14, 14 + k * 28, S - 28, 12);
    } else if (n % 4 === 3) {
      g.fillStyle = '#b8c2b0';
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(30,40,34,.4)';
      g.fillRect(0, S / 2 - 1, S, 3);
      g.fillStyle = STEEL_DARK;
      g.fillRect(S / 2 - 14, S * 0.25, 28, 5);
      g.fillRect(S / 2 - 14, S * 0.75, 28, 5);
    } else if (n % 4 === 1) {
      g.fillStyle = LINEN_WHITE;
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(30,50,60,.2)';
      for (let k = 0; k < 6; k++) g.fillRect(0, 12 + k * 20, S, 2);
      g.fillStyle = 'rgba(60,70,100,.5)';
      g.fillRect(S * 0.3, S * 0.4, S * 0.4, 10);
    } else {
      g.fillStyle = pick(rand, CARTON);
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(60,40,20,.35)';
      g.fillRect(S * 0.44, 0, S * 0.12, S);
      g.fillStyle = 'rgba(245,240,225,.8)';
      g.fillRect(10, S * 0.55, S * 0.34, S * 0.25);
    }
    const shade = g.createLinearGradient(0, 0, S, S);
    shade.addColorStop(0, 'rgba(255,255,255,.1)');
    shade.addColorStop(1, 'rgba(0,0,0,.38)');
    g.fillStyle = shade;
    g.fillRect(0, 0, S, S);
    soil(g, rand, S, S, S * 0.3);
  });
}

// A ceiling panel come down on one side, its hanger wires and a bent corner (about 2.4 m by 1.8 m, seen against the ceiling)
export function hospTileTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 256,
    H = 192;
  return canvasTex(W, H, g => {
    g.strokeStyle = '#1c211e';
    g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      g.lineWidth = 1.5 + rand() * 2;
      g.beginPath();
      const x = 30 + rand() * (W - 60);
      g.moveTo(x, 0);
      g.quadraticCurveTo(x + (rand() - 0.5) * 50, 60, x + (rand() - 0.5) * 60, 50 + rand() * 80);
      g.stroke();
    }
    g.save();
    g.translate(W / 2, 80);
    g.rotate(0.3 + rand() * 0.3);
    g.fillStyle = '#b9c2b6';
    g.fillRect(-92, -9, 184, 18);
    g.fillStyle = 'rgba(40,50,44,.3)';
    for (let x = -80; x < 90; x += 6) g.fillRect(x, -5, 1.4, 1.4);
    g.fillStyle = '#7a867c';
    g.beginPath();
    g.moveTo(60, -9);
    g.lineTo(92, -9);
    g.lineTo(92, 9);
    g.fill();
    g.fillStyle = 'rgba(96,84,50,.35)';
    g.fillRect(-40, -9, 50, 18);
    g.restore();
    soil(g, rand, W, H, 0);
  });
}
// A privacy curtain half off its rail: the rail across the top with a few rings, the cloth hanging from it in folds and
// torn at its foot, in a faded stripe (about 1.8 m by 1.6 m)
export function hospCurtainTex(n: number): THREE.CanvasTexture {
  const rand = seeded(2500 + n * 19),
    W = 224,
    H = 200,
    colors = ['#9cb7c8', '#a9c4a9', '#c9cdb8'];
  return canvasTex(W, H, g => {
    g.fillStyle = STEEL;
    g.fillRect(0, 2, W, 4);
    for (let x = 14; x < W; x += 14) {
      g.strokeStyle = STEEL_DARK;
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(x, 12, 4, 0, Math.PI * 2);
      g.stroke();
    }
    const lo = 20 + rand() * 30,
      hi = W - 20 - rand() * 50;
    g.fillStyle = colors[n % colors.length]!;
    g.beginPath();
    g.moveTo(lo, 10);
    g.lineTo(hi, 10);
    g.lineTo(hi - 6, 120 + rand() * 40);
    for (let x = hi - 6; x > lo; x -= 12) g.lineTo(x, 150 + rand() * 40);
    g.lineTo(lo + 6, 130 + rand() * 30);
    g.closePath();
    g.fill();
    for (let x = lo; x < hi; x += 9) {
      g.fillStyle = x % 18 < 9 ? 'rgba(255,255,255,.14)' : 'rgba(20,30,28,.2)';
      g.fillRect(x, 10, 5, 140);
    }
    soil(g, rand, W, H, 0);
  });
}
// A television on a bracket high on the wall, hanging by one side, the glass cracked (about 1.4 m by 1.2 m)
export function hospTvTex(): THREE.CanvasTexture {
  const rand = seeded(2600),
    W = 192,
    H = 160;
  return canvasTex(W, H, g => {
    g.fillStyle = STEEL_DARK;
    g.fillRect(W / 2 - 4, 0, 8, 30);
    g.save();
    g.translate(W / 2, 40);
    g.rotate(0.14);
    block(g, -80, 0, 160, 96, '#1c2420');
    g.fillStyle = '#0d1311';
    g.fillRect(-74, 6, 148, 84);
    g.strokeStyle = 'rgba(190,206,200,.45)';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(-30, 6);
    g.lineTo(-18, 36);
    g.lineTo(-34, 56);
    g.lineTo(-10, 90);
    g.moveTo(-18, 36);
    g.lineTo(24, 28);
    g.stroke();
    g.fillStyle = 'rgba(190,210,204,.1)';
    g.fillRect(-74, 6, 40, 84);
    g.restore();
    g.strokeStyle = '#1c2124';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(W / 2 + 70, 60);
    g.quadraticCurveTo(W / 2 + 90, 100, W / 2 + 60, 130);
    g.stroke();
    soil(g, rand, W, H, 0);
  });
}
