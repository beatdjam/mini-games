import type * as THREE from 'three';
import {
  MALL_GACHA,
  MALL_LOCKERS,
  MALL_PHOTO,
  MALL_POPS,
  MALL_MASSAGE,
  MALL_STAND_SALE,
  MALL_WAGON,
} from '../../../i18n/signs.ts';
import { SIGN_FONT, canvasTex, oval } from '../paint.ts';
import { block, pick, seeded, soil } from '../cutoutTools.ts';
import type { G } from '../cutoutTools.ts';
import {
  BRASS,
  HAZARD_YELLOW,
  PAPER,
  SIGN_WORDS,
  SKIRTING,
  WAINSCOT,
  WALL_FOOT,
  WALL_MID,
  WALL_TOP,
} from './shared.ts';
// The shopping mall's painted set pieces (see looks/dress.ts): the side of a raised deck and the side of a step down into the
// food court. The decks of the mall are the planters and stages of its concourse. Then what the closed mall was left
// full of: along the concourse, vending machines, coin lockers, a shuttered sales wagon, photo booths and massage
// chairs let into the walls; cartons, a toppled rack, stacked chairs, rolls of carpet, rubbish bags and a fallen
// stand sign along their feet; ceiling tiles and paper pops come down. The colours are the mall's: dark wood, brass,
// warm stone and dull cloth, and nothing at the foot of a wall is a bright red (it would be taken for a hazard floor).

const PLANTER_TILES = ['#6f7a68', '#68735f', '#78826f', '#636d5b']; // sage glazed tiles gone dull
const PLANTER_BRASS = '#a58b4c';
// The side of a raised deck of the mall, a tile wide and a deck high: the tiled edge of a planter, small square
// tiles in a dull green glaze, a brass line along the top under a pale stone cap, dust and old water marks at the
// foot
export function mallDeckTex(): THREE.CanvasTexture {
  const rand = seeded(3301),
    W = 256,
    H = 128,
    tile = 16;
  return canvasTex(W, H, g => {
    g.fillStyle = '#566151';
    g.fillRect(0, 0, W, H);
    for (let y = 22; y < H; y += tile)
      for (let x = ((y / tile) % 2) * (tile / 2) - tile / 2; x < W; x += tile) {
        g.fillStyle = PLANTER_TILES[Math.floor(rand() * PLANTER_TILES.length)]!;
        g.fillRect(x + 0.6, y + 0.6, tile - 1.2, tile - 1.2);
        g.fillStyle = 'rgba(230,240,255,.1)';
        g.fillRect(x + 0.6, y + 0.6, tile - 1.2, 2);
      }
    g.fillStyle = '#8e8a79'; // the stone cap
    g.fillRect(0, 0, W, 13);
    g.fillStyle = 'rgba(255,248,226,.2)';
    g.fillRect(0, 0, W, 2);
    g.fillStyle = PLANTER_BRASS; // the brass line
    g.fillRect(0, 14, W, 4);
    g.fillStyle = 'rgba(255,244,200,.35)';
    g.fillRect(0, 14, W, 1.2);
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.fillRect(0, 18, W, 3);
    soil(g, rand, W, H, H * 0.5);
  });
}

const STEP_STONE = '#6f6857';
const STEP_JOINT = 40; // px between the joints of a step's stone
// The side of a step down into the sunk food court, a tile wide and a step high: warm stone with a joint now and then,
// a yellow safety line along the nosing at the top with a brass strip under it, dust at the foot
export function mallSunkTex(): THREE.CanvasTexture {
  const rand = seeded(3302),
    W = 256,
    H = 32;
  return canvasTex(W, H, g => {
    g.fillStyle = STEP_STONE;
    g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += STEP_JOINT) {
      g.fillStyle = 'rgba(20,16,10,.35)';
      g.fillRect(x, 8, 1.5, H);
    }
    for (let n = 0; n < 60; n++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(255,240,210,.07)' : 'rgba(20,14,8,.16)';
      g.fillRect(rand() * W, 8 + rand() * (H - 8), 2 + rand() * 8, 1);
    }
    g.fillStyle = HAZARD_YELLOW; // the safety line
    g.fillRect(0, 0, W, 5);
    g.fillStyle = 'rgba(255,244,200,.4)';
    g.fillRect(0, 0, W, 1);
    g.fillStyle = BRASS; // the strip under it
    g.fillRect(0, 5, W, 2);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(0, 7, W, 2);
    soil(g, rand, W, H, H * 0.5);
  });
}

// ---- what the mall was left full of ----
const CARTON = ['#a98a5e', '#9a7c52', '#b39468'];
const GOODS = ['#7f4a3c', '#4f6f7a', '#b39a52', '#587a58', '#7e5f86', '#d1c9b5']; // dull colours of tins and boxes
export const LEATHER = ['#3a2c26', '#2f2f33', '#4a3228'];
const LOCKER_DOORS = ['#6e7f84', '#a39674', '#667a6a'];
const VENDING = [
  ['#3f5d66', '#8c5a34', '#4a4f58'],
  ['#6b6a3a', '#4a4f58', '#3f5d66'],
];
const UNIT_KINDS = 5; // vending machines, lockers, a wagon, photo booths, massage chairs (a unit's kind is its number % this)
const FOOT_PX = 14; // the skirting at the foot of a unit's picture (px)

// the wall a unit stands against: the mall's wall panels over its dark wood panelling, as in the rest of the concourse
function alcove(g: G, W: number, H: number) {
  const wall = g.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, WALL_TOP);
  wall.addColorStop(0.3, WALL_MID);
  wall.addColorStop(1, WALL_FOOT);
  g.fillStyle = wall;
  g.fillRect(0, 0, W, H);
  g.fillStyle = WAINSCOT;
  g.fillRect(0, 252, W, H - 252);
  g.fillStyle = BRASS;
  g.fillRect(0, 250, W, 4);
  g.fillStyle = SKIRTING;
  g.fillRect(0, H - FOOT_PX + 2, W, FOOT_PX);
}
// three vending machines side by side: a lit-out header, the glass with rows of tins, the buttons, the bin at the foot
function vending(g: G, rand: () => number, _W: number, H: number, n: number) {
  const bodies = VENDING[Math.floor(n / UNIT_KINDS) % VENDING.length]!,
    foot = H - FOOT_PX,
    top = 62;
  bodies.forEach((body, k) => {
    const x = 30 + k * 158,
      w = 142;
    block(g, x, top, w, foot - top, body);
    g.fillStyle = k === 1 ? '#2a2824' : '#cfc7a8';
    g.fillRect(x + 8, top + 8, w - 16, 28);
    g.fillStyle = 'rgba(40,30,20,.5)';
    g.fillRect(x + 20, top + 18, w - 40, 7);
    g.fillStyle = '#1d211f';
    g.fillRect(x + 8, top + 46, w - 54, 160);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 5; c++)
        if (rand() < 0.85) {
          g.fillStyle = pick(rand, GOODS);
          g.fillRect(x + 12 + c * 16, top + 52 + r * 38, 12, 28);
        }
    g.fillStyle = 'rgba(210,214,222,.12)';
    g.fillRect(x + 8, top + 46, (w - 54) * 0.35, 160);
    g.fillStyle = '#2a2824';
    g.fillRect(x + w - 38, top + 46, 30, 100);
    for (let b = 0; b < 6; b++) {
      g.fillStyle = b % 3 ? '#968f82' : BRASS;
      g.fillRect(x + w - 34, top + 52 + b * 14, 22, 8);
    }
    g.fillStyle = '#14130f';
    g.fillRect(x + 10, foot - 48, w - 20, 32);
  });
}
// a block of coin lockers: rows of small doors with a coin slot and a number plate, one or two ajar, a plate over them
function lockers(g: G, rand: () => number, W: number, H: number, n: number) {
  const cols = 8,
    rows = 4,
    cw = 58,
    ch = 64,
    x0 = (W - cols * cw) / 2,
    y0 = H - FOOT_PX - rows * ch,
    tone = LOCKER_DOORS[n % LOCKER_DOORS.length]!;
  g.fillStyle = '#3a3d3e';
  g.fillRect(x0 - 5, y0 - 5, cols * cw + 10, rows * ch + 10);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * cw,
        y = y0 + r * ch;
      if (rand() < 0.07) {
        g.fillStyle = '#161513';
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
      g.fillStyle = '#26221b';
      g.fillRect(x + cw / 2 - 3, y + 14, 6, 14);
      g.fillStyle = PAPER;
      g.fillRect(x + cw / 2 - 9, y + ch - 24, 18, 9);
    }
  g.fillStyle = WAINSCOT;
  g.fillRect(x0 + 90, y0 - 52, 190, 34);
  g.strokeStyle = BRASS;
  g.lineWidth = 2;
  g.strokeRect(x0 + 93, y0 - 49, 184, 28);
  g.fillStyle = SIGN_WORDS;
  g.font = `700 20px ${SIGN_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(MALL_LOCKERS, x0 + 185, y0 - 34, 170);
}
// a sales wagon, shut up: a wooden counter, the shutter let down over its front under a striped awning, a card on it
function wagon(g: G, rand: () => number, _W: number, H: number) {
  const x = 70,
    w = 372,
    foot = H - FOOT_PX;
  for (let k = 0; k < 3; k++) block(g, 14 + k * 4, foot - 52 - k * 44, 54, 44, pick(rand, CARTON));
  g.fillStyle = WAINSCOT;
  for (const px of [x, x + w - 10]) g.fillRect(px, 110, 10, foot - 110);
  const steel = g.createLinearGradient(0, 150, 0, foot - 160);
  steel.addColorStop(0, '#9b978b');
  steel.addColorStop(1, '#7c786d');
  g.fillStyle = steel;
  g.fillRect(x + 10, 150, w - 20, foot - 310);
  g.fillStyle = 'rgba(0,0,0,.22)';
  for (let y = 152; y < foot - 162; y += 5) g.fillRect(x + 10, y, w - 20, 1.5);
  block(g, x - 6, foot - 156, w + 12, 156, '#694a31');
  g.fillStyle = 'rgba(0,0,0,.28)';
  for (let px = x + 40; px < x + w - 20; px += 90) g.fillRect(px, foot - 140, 2, 124);
  g.fillStyle = BRASS;
  g.fillRect(x - 8, foot - 164, w + 16, 9);
  for (let k = 0; k * 31 < w + 12; k++) {
    g.fillStyle = k % 2 ? '#c8c0a4' : '#4f6f6a';
    g.fillRect(x - 6 + k * 31, 100, 31, 46);
    g.beginPath();
    g.moveTo(x - 6 + k * 31, 146);
    g.lineTo(x - 6 + k * 31 + 31, 146);
    g.lineTo(x - 6 + k * 31 + 15.5, 162);
    g.fill();
  }
  g.fillStyle = PAPER;
  g.fillRect(x + w / 2 - 55, 192, 110, 40);
  g.fillStyle = '#5a3a2a';
  g.font = `700 26px ${SIGN_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(MALL_WAGON, x + w / 2, 213, 96);
}
// two photo booths, their curtains drawn, the lit header off
function booths(g: G, rand: () => number, _W: number, H: number) {
  const foot = H - FOOT_PX;
  for (let k = 0; k < 2; k++) {
    const x = 36 + k * 236,
      w = 204;
    block(g, x, 60, w, foot - 60, '#6b5560');
    g.fillStyle = '#a58fa0';
    g.fillRect(x + 10, 70, w - 20, 50);
    g.fillStyle = '#3a2b34';
    g.font = `700 22px ${SIGN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(MALL_PHOTO, x + w / 2 - 16, 96, w - 60);
    g.fillStyle = '#2f3d3a';
    g.fillRect(x + 14, 140, w - 78, foot - 180);
    g.fillStyle = 'rgba(0,0,0,.3)';
    for (let fx = x + 24; fx < x + w - 70; fx += 14) g.fillRect(fx, 140, 3, foot - 180);
    g.fillStyle = '#14130f';
    g.fillRect(x + 14, foot - 40, w - 78, 26);
    g.fillStyle = '#2a2124';
    g.fillRect(x + w - 54, 140, 40, 130);
    g.fillStyle = '#7a6a52';
    g.fillRect(x + w - 46, 152, 24, 8);
    g.fillRect(x + w - 46, 250, 24, 12);
    if (rand() < 0.5) {
      g.fillStyle = PAPER;
      g.fillRect(x + w - 50, 180 + rand() * 30, 30, 20);
    }
  }
}
// a row of massage chairs seen from the front: leather backs, headrests, arms, foot rests; a board over them
function chairs(g: G, rand: () => number, _W: number, H: number) {
  const foot = H - FOOT_PX;
  g.fillStyle = WAINSCOT;
  g.fillRect(150, 30, 212, 34);
  g.strokeStyle = BRASS;
  g.lineWidth = 2;
  g.strokeRect(153, 33, 206, 28);
  g.fillStyle = SIGN_WORDS;
  g.font = `700 20px ${SIGN_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(MALL_MASSAGE, 256, 48, 180);
  for (let k = 0; k < 3; k++) {
    const cx = 100 + k * 156,
      leather = LEATHER[Math.floor(rand() * LEATHER.length)]!;
    g.fillStyle = 'rgba(0,0,0,.35)';
    oval(g, cx + 4, foot, 74, 8);
    block(g, cx - 46, foot - 250, 92, 190, leather);
    g.fillStyle = leather;
    oval(g, cx, foot - 262, 36, 24);
    g.fillStyle = 'rgba(255,255,255,.1)';
    oval(g, cx - 8, foot - 268, 18, 10);
    block(g, cx - 76, foot - 150, 30, 110, leather);
    block(g, cx + 46, foot - 150, 30, 110, leather);
    block(g, cx - 46, foot - 64, 92, 30, leather);
    block(g, cx - 40, foot - 34, 80, 24, '#1f1b18');
    g.fillStyle = 'rgba(255,240,210,.14)';
    for (let sx = cx - 28; sx < cx + 30; sx += 28) g.fillRect(sx, foot - 240, 2, 168);
    g.fillStyle = '#7a6a52';
    g.fillRect(cx + 52, foot - 138, 18, 8);
  }
}
const UNIT_PAINTERS = [vending, lockers, wagon, booths, chairs];
// What is let into a wall of the concourse, about 3.7 m by 2.8 m, by the number: the kind is `n % UNIT_KINDS` and a
// second round of vending machines is in other colours
export function mallUnitTex(n: number): THREE.CanvasTexture {
  const rand = seeded(1200 + n * 31),
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

const EDGE_KINDS = 3; // a vending machine, a block of coin lockers, a bank of capsule toys (an edge unit's kind is its number % this)
const EDGE_W = 192,
  EDGE_H = 320; // px: 1.2 m by 2 m
const EDGE_BODIES = ['#3f5d66', '#8c5a34', '#4a4f58', '#6b6a3a']; // vending machines in dull colours
const GACHA_BODIES = ['#3f5d66', '#8a7a3a', '#5a5f78', '#6a5a4c']; // capsule machines (nothing bright red at the foot)
const CAPSULES = ['#c9c4b0', '#7f9aa6', '#b39a52', '#8aa07a', '#9a86a0', '#d1c9b5'];
// one vending machine, seen from the front, filling the picture
function vendingOne(g: G, rand: () => number, v: number) {
  g.fillStyle = EDGE_BODIES[v % EDGE_BODIES.length]!;
  g.fillRect(0, 0, EDGE_W, EDGE_H);
  g.fillStyle = v % 2 ? '#2a2824' : '#cfc7a8';
  g.fillRect(10, 10, EDGE_W - 20, 34);
  g.fillStyle = 'rgba(40,30,20,.5)';
  g.fillRect(26, 22, EDGE_W - 52, 9);
  g.fillStyle = '#1d211f';
  g.fillRect(10, 56, 122, 178);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 5; c++)
      if (rand() < 0.85) {
        g.fillStyle = pick(rand, GOODS);
        g.fillRect(15 + c * 23, 62 + r * 43, 17, 32);
      }
  g.fillStyle = 'rgba(210,214,222,.12)';
  g.fillRect(10, 56, 44, 178);
  g.fillStyle = '#2a2824';
  g.fillRect(142, 56, 40, 120);
  for (let b = 0; b < 7; b++) {
    g.fillStyle = b % 3 ? '#968f82' : BRASS;
    g.fillRect(147, 62 + b * 15, 30, 9);
  }
  g.fillStyle = '#14130f';
  g.fillRect(142, 186, 40, 14);
  g.fillRect(14, 250, EDGE_W - 28, 50);
}
// a block of coin lockers three across and six down, one or two ajar, the plate over them
function lockersOne(g: G, rand: () => number, v: number) {
  const cols = 3,
    rows = 6,
    cw = EDGE_W / cols,
    ch = 46,
    y0 = EDGE_H - rows * ch,
    tone = LOCKER_DOORS[v % LOCKER_DOORS.length]!;
  g.fillStyle = '#3a3d3e';
  g.fillRect(0, 0, EDGE_W, EDGE_H);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = c * cw,
        y = y0 + r * ch;
      if (rand() < 0.08) {
        g.fillStyle = '#161513';
        g.fillRect(x + 2, y + 2, cw - 4, ch - 4);
        g.fillStyle = tone;
        g.beginPath();
        g.moveTo(x + 2, y + 2);
        g.lineTo(x + 16, y + 7);
        g.lineTo(x + 16, y + ch - 8);
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
      g.fillStyle = '#26221b';
      g.fillRect(x + cw / 2 - 3, y + 10, 6, 11);
      g.fillStyle = PAPER;
      g.fillRect(x + cw / 2 - 8, y + ch - 17, 16, 8);
    }
  g.fillStyle = WAINSCOT;
  g.fillRect(8, 8, EDGE_W - 16, y0 - 16);
  g.strokeStyle = BRASS;
  g.lineWidth = 2;
  g.strokeRect(11, 11, EDGE_W - 22, y0 - 22);
  g.fillStyle = SIGN_WORDS;
  g.font = `700 17px ${SIGN_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(MALL_LOCKERS, EDGE_W / 2, y0 / 2 + 1, EDGE_W - 34);
}
// a bank of capsule-toy machines, two across and two high: a globe of capsules on each, a body with a knob, a slot and a flap
function gachaOne(g: G, rand: () => number, v: number) {
  g.fillStyle = '#2b2926';
  g.fillRect(0, 0, EDGE_W, EDGE_H);
  g.fillStyle = WAINSCOT;
  g.fillRect(6, 5, EDGE_W - 12, 28);
  g.strokeStyle = BRASS;
  g.lineWidth = 2;
  g.strokeRect(9, 8, EDGE_W - 18, 22);
  g.fillStyle = SIGN_WORDS;
  g.font = `700 17px ${SIGN_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(MALL_GACHA, EDGE_W / 2, 20, EDGE_W - 30);
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 2; c++) {
      const x0 = 4 + c * 94,
        y0 = 38 + r * 140,
        cx = x0 + 45,
        tone = GACHA_BODIES[(v * 2 + r + c) % GACHA_BODIES.length]!;
      g.fillStyle = 'rgba(190,200,210,.16)';
      oval(g, cx, y0 + 40, 38, 38);
      for (let k = 0; k < 16; k++) {
        const a = rand() * Math.PI * 2,
          d = Math.sqrt(rand()) * 28;
        g.fillStyle = pick(rand, CAPSULES);
        oval(g, cx + Math.cos(a) * d, y0 + 42 + Math.sin(a) * d, 8, 8);
      }
      g.fillStyle = 'rgba(255,255,255,.2)';
      oval(g, cx - 14, y0 + 22, 7, 12);
      g.fillStyle = '#26241f';
      g.fillRect(cx - 24, y0 + 76, 48, 6);
      block(g, x0 + 8, y0 + 82, 74, 52, tone);
      g.fillStyle = '#26241f';
      oval(g, cx - 12, y0 + 100, 11, 11);
      g.fillStyle = '#968f82';
      g.fillRect(cx - 17, y0 + 99, 10, 3);
      g.fillStyle = '#14130f';
      g.fillRect(cx + 8, y0 + 94, 5, 14);
      g.fillRect(cx - 14, y0 + 116, 34, 12);
    }
}
const EDGE_PAINTERS = [vendingOne, lockersOne, gachaOne];
// What stands at the end of a shop front, 1.2 m by 2 m, by the number: the kind is `n % EDGE_KINDS` and the next round is
// in other colours. The whole picture is the face of the unit (it is put on the front of a box)
export function mallEdgeTex(n: number): THREE.CanvasTexture {
  const rand = seeded(1250 + n * 29);
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

// a carton, taped, a label on it; some open
export function carton(g: G, rand: () => number, x: number, y: number, w: number, h: number) {
  block(g, x, y, w, h, pick(rand, CARTON));
  g.fillStyle = 'rgba(60,40,20,.35)';
  g.fillRect(x + w * 0.45, y, w * 0.1, h);
  if (rand() < 0.5) {
    g.fillStyle = 'rgba(245,240,225,.8)';
    g.fillRect(x + 4, y + h * 0.5, w * 0.34, h * 0.28);
  }
  if (rand() < 0.25) {
    g.fillStyle = 'rgba(40,28,16,.55)';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + w * 0.3, y - 9);
    g.lineTo(x + w * 0.45, y);
    g.fill();
  }
}
// a stacked chair seen from the side: a seat, a back, two legs
export function chairSide(g: G, x: number, foot: number, color: string) {
  g.fillStyle = color;
  g.fillRect(x, foot - 38, 6, 38);
  g.fillRect(x + 36, foot - 38, 5, 38);
  g.fillRect(x - 1, foot - 40, 44, 7);
  g.fillRect(x - 1, foot - 92, 6, 54);
  g.fillStyle = 'rgba(255,240,210,.14)';
  g.fillRect(x - 1, foot - 40, 44, 2);
}
// a bag of rubbish tied at the neck, with a highlight
function bag(g: G, x: number, foot: number, r: number, color: string) {
  g.fillStyle = color;
  oval(g, x, foot - r * 0.85, r, r * 0.85);
  g.beginPath();
  g.moveTo(x - r * 0.22, foot - r * 1.5);
  g.lineTo(x + r * 0.3, foot - r * 1.5);
  g.lineTo(x + r * 0.12, foot - r * 1.95);
  g.lineTo(x - r * 0.12, foot - r * 1.95);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.14)';
  oval(g, x - r * 0.35, foot - r * 1.05, r * 0.28, r * 0.4);
}
// a carpet rolled up and lying, its end showing the turns
function rollLying(g: G, x: number, foot: number, len: number, h: number, color: string) {
  block(g, x, foot - h, len, h, color);
  g.fillStyle = 'rgba(0,0,0,.28)';
  oval(g, x, foot - h / 2, h * 0.2, h / 2);
  g.strokeStyle = 'rgba(255,240,210,.3)';
  g.lineWidth = 2;
  for (const f of [0.78, 0.5, 0.25]) {
    g.beginPath();
    g.ellipse(x, foot - h / 2, h * 0.2 * f, (h / 2) * f, 0, 0, Math.PI * 2);
    g.stroke();
  }
}
export const SHELF_WOOD = '#8f7a58'; // the frame of a shelving unit, and its shelves
export const SHELF_BACK = '#4a3a28'; // ... the back of it
export const MANNEQUIN = '#d3c1ad'; // a mannequin's pale plastic
// a shelving unit `w` by `h` px standing on `foot` at `x`, tipped over to lean by `tilt` (rad, to the right when
// positive): its frame, `shelves` shelves, and on each a row of goods in `goods`' colours (some missing)
export function shelfLeaning(
  g: G,
  rand: () => number,
  x: number,
  foot: number,
  w: number,
  h: number,
  tilt: number,
  shelves: number,
  goods: readonly string[],
) {
  const step = (h - 10) / shelves;
  g.save();
  g.translate(x, foot);
  g.rotate(tilt);
  g.fillStyle = 'rgba(30,22,12,.4)';
  g.fillRect(4, -h + 3, w, h);
  g.fillStyle = SHELF_WOOD;
  g.fillRect(0, -h, w, h);
  g.fillStyle = SHELF_BACK;
  g.fillRect(6, -h + 6, w - 12, h - 10);
  for (let s = 0; s < shelves; s++) {
    const y = -h + 6 + step * (s + 1);
    g.fillStyle = SHELF_WOOD;
    g.fillRect(4, y - 3, w - 8, 4);
    for (let gx = 10; gx < w - 18; gx += 12 + rand() * 10)
      if (rand() < 0.65) {
        const gh = step * (0.35 + rand() * 0.4);
        g.fillStyle = pick(rand, goods);
        g.fillRect(gx, y - 3 - gh, 9 + rand() * 8, gh);
      }
  }
  g.restore();
}
const HEAP_KINDS = 6;
// A heap along the foot of a wall, about 3.5 m by 1.75 m, by its number, piled up to the chest (the picture is
// hung 0.9 of its height, so a pile 200 px high stands about 1.3 m): cartons in columns and flattened boxes leaning on
// them; a toppled display rack and what spilled from it; stacked chairs; rolls of carpet and a bundle of noren; a mound
// of rubbish bags; a stand sign fallen over and a box with a dismantled mannequin
export function mallHeapTex(n: number): THREE.CanvasTexture {
  const rand = seeded(1300 + n * 17),
    W = 512,
    H = 256,
    foot = H - 6,
    kind = n % HEAP_KINDS;
  return canvasTex(W, H, g => {
    if (kind === 0) {
      // flattened boxes leaning at each end, then the columns of cartons, the tallest in the middle
      for (const [x, lean] of [
        [34 + rand() * 20, -0.22],
        [440 + rand() * 20, 0.22],
      ] as const) {
        g.save();
        g.translate(x, foot);
        g.rotate(lean);
        g.fillStyle = 'rgba(40,28,16,.4)';
        g.fillRect(3, -158, 66, 158);
        g.fillStyle = pick(rand, CARTON);
        g.fillRect(0, -158, 64, 158);
        g.fillStyle = 'rgba(60,40,20,.3)';
        g.fillRect(28, -158, 8, 158);
        g.restore();
      }
      [2, 3, 5, 4, 3, 2].forEach((m, c) => {
        const w = 62 + rand() * 24,
          x = 10 + c * 82 + rand() * 6;
        let y = foot;
        for (let k = 0; k < m; k++) {
          const h = 38 + rand() * 12;
          y -= h;
          carton(g, rand, x + rand() * 6 - 3, y, w * (0.85 + rand() * 0.15), h - 2);
        }
      });
    } else if (kind === 1) {
      // a rack tipping over onto a tower of cartons, a smaller one leaning the other way, and what fell from them
      for (let k = 0; k < 3; k++) carton(g, rand, 270 + rand() * 8, foot - (k + 1) * 44, 92 - k * 6, 42);
      shelfLeaning(g, rand, 40 + rand() * 30, foot - 6, 170, 232, 0.3, 5, GOODS);
      shelfLeaning(g, rand, 400, foot - 6, 100, 172, -0.22, 4, GOODS);
      for (let k = 0; k < 26; k++) {
        g.fillStyle = pick(rand, GOODS);
        if (rand() < 0.3) oval(g, 20 + rand() * (W - 40), foot - 6 - rand() * 8, 5 + rand() * 5, 5 + rand() * 5);
        else g.fillRect(20 + rand() * (W - 60), foot - 6 - rand() * 14, 8 + rand() * 14, 6 + rand() * 10);
      }
    } else if (kind === 2) {
      const colors = ['#5a3d28', '#cfc6ac', '#4a4f58'];
      // stacks of ten and more, and two chairs lying on their backs
      [
        [30, 11],
        [104, 9],
        [178, 6],
        [430, 8],
      ].forEach(([x, count], s) => {
        for (let k = 0; k < count!; k++) chairSide(g, x! + k * 3, foot - k * 12, colors[(s + k) % colors.length]!);
      });
      for (const [x, lean, c] of [
        [300, 0.2, 1],
        [372, 0.5, 0],
      ] as const) {
        g.save();
        g.translate(x, foot);
        g.rotate(-Math.PI / 2 + lean);
        chairSide(g, 0, 0, colors[c]!);
        g.restore();
      }
    } else if (kind === 3) {
      // three rolls lying one on another, a bundle of rolls stood up and leaning, and a folded noren on a crate
      rollLying(g, 20, foot, 210, 46, '#6b4a3c');
      rollLying(g, 34, foot - 46, 170, 40, '#4f5a52');
      rollLying(g, 50, foot - 86, 130, 36, '#5a4a6a');
      for (const [x, c, tilt, tall] of [
        [286, '#6a5f48', 0.05, 226],
        [322, '#5a4a6a', 0.09, 206],
        [358, '#4f5a52', 0.13, 232],
        [394, '#6b4a3c', 0.17, 196],
      ] as [number, string, number, number][]) {
        g.save();
        g.translate(x, foot);
        g.rotate(tilt);
        block(g, -14, -tall, 28, tall, c);
        g.fillStyle = 'rgba(0,0,0,.3)';
        oval(g, 0, -tall, 14, 6);
        g.restore();
      }
      block(g, 424, foot - 34, 78, 34, '#2e3a52');
      g.fillStyle = 'rgba(235,235,225,.55)';
      for (let x = 432; x < 496; x += 24) g.fillRect(x, foot - 34, 7, 34);
      block(g, 436, foot - 58, 54, 26, '#2e3a52');
    } else if (kind === 4) {
      const colors = ['#26282b', '#3a4146', '#2b3a3a', '#c9c7b8'];
      // a mound five bags high: nine at the foot, then seven, five, three and one
      for (let row = 0; row < 5; row++) {
        const count = 9 - row * 2;
        for (let c = 0; c < count; c++)
          bag(
            g,
            W / 2 + (c - (count - 1) / 2) * 54 + rand() * 8 - 4,
            foot - row * 42,
            29 + rand() * 6,
            pick(rand, colors),
          );
      }
      for (let k = 0; k < 18; k++) {
        g.fillStyle = pick(rand, GOODS);
        g.fillRect(20 + rand() * (W - 50), foot - 5 - rand() * 8, 6 + rand() * 12, 5 + rand() * 6);
      }
    } else {
      g.save();
      g.translate(60, foot);
      g.rotate(-0.16);
      g.fillStyle = WAINSCOT;
      g.fillRect(0, -212, 110, 212);
      g.fillStyle = PAPER;
      g.fillRect(8, -204, 94, 196);
      g.fillStyle = '#6e2b24';
      g.font = `700 36px ${SIGN_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(MALL_STAND_SALE, 55, -108, 84);
      g.restore();
      // two boxes stacked, a mannequin's head on them, an arm sticking up and a leg propped against them
      block(g, 250, foot - 96, 96, 96, '#cdbca8');
      block(g, 254, foot - 188, 88, 92, '#c4b39f');
      g.fillStyle = MANNEQUIN;
      oval(g, 300, foot - 214, 22, 28);
      g.save();
      g.translate(346, foot - 130);
      g.rotate(0.5);
      g.fillRect(-7, -110, 15, 110);
      g.restore();
      g.save();
      g.translate(388, foot);
      g.rotate(0.35);
      g.fillRect(-8, -150, 16, 150);
      g.restore();
      block(g, 232, foot - 72, 150, 72, pick(rand, CARTON));
      g.fillStyle = 'rgba(40,28,16,.55)';
      g.fillRect(232, foot - 72, 150, 8);
      g.fillStyle = '#cdbca8';
      for (let k = 0; k < 4; k++) g.fillRect(420 + k * 3, foot - 14 - k * 14, 72 - k * 6, 12);
    }
    soil(g, rand, W, H, H * 0.45);
  });
}

// The face of a carton, a plastic crate or a wooden crate, the whole picture: the solid things the heaps are made of
export function mallBoxTex(n: number): THREE.CanvasTexture {
  const rand = seeded(1400 + n * 13),
    S = 128;
  return canvasTex(S, S, g => {
    if (n % 4 === 2) {
      g.fillStyle = '#4f6a6a';
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(0,0,0,.4)';
      for (let k = 0; k < 4; k++) g.fillRect(14, 14 + k * 28, S - 28, 12);
    } else if (n % 4 === 3) {
      g.fillStyle = '#79593a';
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(20,12,6,.4)';
      for (let k = 0; k < 4; k++) g.fillRect(0, k * 32 + 30, S, 3);
      g.fillRect(10, 0, 8, S);
      g.fillRect(S - 18, 0, 8, S);
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

// A ceiling tile come down on one side, its hanger wires and a bent corner (about 2.4 m by 1.8 m, seen against the
// ceiling)
export function mallTileTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 256,
    H = 192;
  return canvasTex(W, H, g => {
    g.strokeStyle = '#1c1b19';
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
    g.fillStyle = PAPER;
    g.fillRect(-92, -9, 184, 18);
    g.fillStyle = 'rgba(60,50,36,.3)';
    for (let x = -80; x < 90; x += 18) g.fillRect(x, -6, 2, 12);
    g.fillStyle = '#2a2824';
    g.beginPath();
    g.moveTo(60, -9);
    g.lineTo(92, -9);
    g.lineTo(92, 9);
    g.fill();
    g.restore();
    soil(g, rand, W, H, 0);
  });
}
// Paper pops torn from the ceiling: cards of dull colours on strings of different lengths, one with its words, one
// torn in half (about 1.8 m by 1.6 m)
export function mallPopTex(n: number): THREE.CanvasTexture {
  const rand = seeded(1500 + n * 19),
    W = 224,
    H = 200;
  return canvasTex(W, H, g => {
    const papers = ['#d6c06a', PAPER, '#cfa7a0', '#8fb0a8'];
    [30, 80, 134, 188].forEach((x, k) => {
      const drop = 60 + rand() * 70,
        w = 44 + rand() * 24,
        h = 46 + rand() * 30,
        tilt = (rand() - 0.5) * 0.5;
      g.strokeStyle = '#3a3630';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + tilt * 20, drop);
      g.stroke();
      g.save();
      g.translate(x + tilt * 20, drop);
      g.rotate(tilt);
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fillRect(-w / 2 + 2, 2, w, h);
      g.fillStyle = papers[(k + n) % papers.length]!;
      if (k === 2) {
        g.beginPath();
        g.moveTo(-w / 2, 0);
        g.lineTo(w / 2, 0);
        g.lineTo(w / 2, h * 0.5);
        g.lineTo(0, h * 0.35);
        g.lineTo(-w / 2, h);
        g.fill();
      } else {
        g.fillRect(-w / 2, 0, w, h);
        if (k === 0) {
          g.fillStyle = '#6e2b24';
          g.font = `700 15px ${SIGN_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(MALL_POPS[n % MALL_POPS.length]!, 0, h / 2, w - 6);
        } else {
          g.fillStyle = 'rgba(60,50,36,.4)';
          for (let ly = 10; ly < h - 6; ly += 8) g.fillRect(-w / 2 + 6, ly, (w - 12) * (0.5 + rand() * 0.5), 2);
        }
      }
      g.restore();
    });
    soil(g, rand, W, H, 0);
  });
}
