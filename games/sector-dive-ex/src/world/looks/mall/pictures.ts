import {
  MALL_ATM,
  MALL_CLOSED,
  MALL_EXIT,
  MALL_GUIDE,
  MALL_HYDRANT,
  MALL_NOTICE,
  MALL_PUSH,
  MALL_SALE,
  MALL_STAFF_ONLY,
  MALL_VACANT,
  MALL_TOILET,
} from '../../../i18n/signs.ts';
import type { Pictures, RoomFloors, RoomWalls, WallSides } from '../common.ts';
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
import {
  BRASS,
  HAZARD_BLACK,
  HAZARD_YELLOW,
  PAPERS,
  SHOP_KINDS,
  SIGN_RED,
  box,
  frieze,
  moon,
  panels,
  sheet,
} from './shared.ts';
import { ROOM_FLOOR_PICS } from './floors.ts';
import { mallRoomKinds } from './rooms.ts';
import { GROUND_PICS, SHOP_PICS } from './shops.ts';
// The shopping mall (MALL): a closed suburban mall at night. Ivory wall panels and cream floor tiles, shutters pulled
// down over the shops, and what light there is comes from the emergency lamps and the moon through the glass roof.
// Like the old downtown it is seen from far away, so the walls are mostly plain and the lights are kept soft: the
// enemies, their shots and the pick-ups must stand out from the background.
// ---- tuning numbers used only here ----
const MALL_FLOORS = 6; // 0 polished tile, 1 dust and receipts, 2 a leak's stain, 3 a cracked tile, 4 the skylight's reflection, 5 a basket
const FLOOR_TILES = 7; // tiles across one floor picture: a tile is about 60 cm (a tile of the floor is 4 m)
const SHUTTER_SLAT = 4; // height of a shutter's slat (px)
const BOSS_PLATE_LINES = 2; // the boss door's plate is written in two lines
const BOSS_PLATE_W = 152; // its width in the leaf's picture (px)
const BOSS_PLATE_PAD = 22; // room between the plate's edge and the words (px)
// the wall pictures by number (MALL_WALL_PICS)
const FRAME = '#4a3b2d'; // bronze frames, gone dull
const EXIT_GREEN = '#1c8a58';

// a shop's rolling shutter, pulled down: ribbed steel in two guide rails, a bar with a lock at its foot, the sign above
function shutterBody(g: CanvasRenderingContext2D, rand: () => number) {
  const x = 14,
    w = TEX - 28,
    y = rowOf(3.7),
    foot = rowOf(0.12);
  g.fillStyle = '#3b2c20'; // the rails: a dark wood surround

  g.fillRect(x - 4, y - 4, w + 8, foot - y + 4);
  const steel = g.createLinearGradient(x, 0, x + w, 0);
  steel.addColorStop(0, '#68645e');
  steel.addColorStop(0.5, '#7b766f');
  steel.addColorStop(1, '#5f5b55');
  g.fillStyle = steel;
  g.fillRect(x, y, w, foot - y);
  for (let sy = y; sy < foot - 8; sy += SHUTTER_SLAT) {
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.fillRect(x, sy + SHUTTER_SLAT - 1.2, w, 1.2);
    g.fillStyle = 'rgba(255,250,236,.08)';
    g.fillRect(x, sy, w, 1);
  }
  g.fillStyle = '#3d4044'; // the bar at the foot, and its lock
  g.fillRect(x, foot - 9, w, 9);
  g.fillStyle = '#7d7a6e';
  g.fillRect(x + w * 0.5 - 4, foot - 7, 8, 5);
  grime(g, rand, 40, '#8a8f93', '#25272a');
  for (let k = 0; k < 4; k++) {
    // dust gathered along the slats, and a dent
    g.fillStyle = 'rgba(190,184,164,.1)';
    g.fillRect(x + rand() * w * 0.8, y + rand() * (foot - y - 20), 20 + rand() * 50, 3);
  }
  moon(g, TEX * 0.35, y + 40, 90, 0.06);
}
const shutter =
  (kind: number): Paint =>
  (g, rand) => {
    frieze(g, kind);
    shutterBody(g, rand);
  };
// the glass of a shop window in its frame: `shade` darkest to lightest down it, with the reflections of the roof
function showWindow(g: CanvasRenderingContext2D, shades: [string, string]) {
  const x = 18,
    w = TEX - 36,
    y = rowOf(3.6),
    foot = rowOf(0.35),
    h = foot - y;
  g.fillStyle = FRAME;
  g.fillRect(x - 5, y - 4, w + 10, h + 9);
  const glass = g.createLinearGradient(0, y, 0, y + h);
  glass.addColorStop(0, shades[0]);
  glass.addColorStop(1, shades[1]);
  g.fillStyle = glass;
  g.fillRect(x, y, w, h);
  box(g, x - 8, foot + 4, w + 16, rowOf(0.15) - foot - 4, '#4a4741');
  return { x, y, w, h, foot };
}
// the reflections on the glass: slanting bands of the moon's light, over everything behind it
function glassShine(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = 'rgba(190,210,240,.1)';
  for (const [at, wide] of [
    [0.12, 26],
    [0.48, 14],
    [0.7, 34],
  ] as const) {
    g.beginPath();
    g.moveTo(x + w * at, y);
    g.lineTo(x + w * at + wide, y);
    g.lineTo(x + w * at + wide - h * 0.5, y + h);
    g.lineTo(x + w * at - h * 0.5, y + h);
    g.fill();
  }
  g.restore();
}
// a shop window with its shop dark behind the glass: mannequins left standing, only their shapes
const darkWindow =
  (kind: number): Paint =>
  (g, rand) => {
    frieze(g, kind);
    const { x, y, w, h, foot } = showWindow(g, ['#1f2427', '#111416']);
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    const men = 3 + Math.floor(rand() * 2);
    for (let m = 0; m < men; m++) {
      const cx = x + (w / men) * (m + 0.5) + (rand() - 0.5) * 10,
        top = foot - 66 - rand() * 8;
      g.fillStyle = 'rgba(46,58,66,.9)';
      oval(g, cx, top + 5, 5.5, 5.5 * WALL_ASPECT * 1.4); // the head
      g.fillRect(cx - 1.6, top + 9, 3.2, 4); // neck
      g.beginPath(); // shoulders to waist
      g.moveTo(cx - 14, top + 14);
      g.lineTo(cx + 14, top + 14);
      g.lineTo(cx + 8, top + 38);
      g.lineTo(cx - 8, top + 38);
      g.fill();
      g.fillRect(cx - 9, top + 38, 7, foot - top - 40); // legs
      g.fillRect(cx + 2, top + 38, 7, foot - top - 40);
      g.fillStyle = 'rgba(160,184,214,.16)'; // a rim of light on one side
      g.fillRect(cx - 14, top + 14, 2.2, 22);
      g.fillStyle = 'rgba(46,58,66,.9)';
      g.fillRect(cx - 12, foot - 3, 24, 3); // the base plate
      if (rand() < 0.5) g.fillRect(cx + 12, top + 15, 3, 24); // an arm held out
    }
    g.restore();
    glassShine(g, x, y, w, h);
  };
// a shop window of a shop that is gone: bare shelves behind the glass, a sheet taped on it saying that it is closed
const closedWindow =
  (kind: number): Paint =>
  (g, rand) => {
    frieze(g, kind);
    const { x, y, w, h, foot } = showWindow(g, ['#2f3436', '#1d2123']);
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    for (const sy of [y + h * 0.22, y + h * 0.46, y + h * 0.7]) {
      g.fillStyle = 'rgba(84,92,94,.7)';
      g.fillRect(x + 4, sy, w - 8, 3);
      for (let k = 0; k < 3; k++) {
        // what was left on the shelves: a box on its side, a hanger
        if (rand() < 0.55) continue;
        g.fillStyle = 'rgba(66,74,78,.8)';
        g.fillRect(x + 12 + rand() * (w - 50), sy - 7 - rand() * 5, 10 + rand() * 12, 8);
      }
    }
    g.fillStyle = 'rgba(84,92,94,.55)';
    g.fillRect(x + 3, y, 3, foot - y);
    g.fillRect(x + w - 6, y, 3, foot - y);
    g.restore();
    // the notice: white paper, a red rule, the words, tape at its corners
    const px = x + w * 0.5,
      py = y + h * 0.4,
      pw = 74,
      ph = 62;
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.fillRect(px - pw / 2 + 2, py - ph / 2 + 2, pw, ph);
    g.fillStyle = '#b3b09f';
    g.fillRect(px - pw / 2, py - ph / 2, pw, ph);
    g.strokeStyle = SIGN_RED;
    g.lineWidth = 1.6;
    g.strokeRect(px - pw / 2 + 4, py - ph / 2 + 4, pw - 8, ph - 8);
    g.fillStyle = '#2b2a28';
    words(g, MALL_CLOSED, px, py - 6, 12, WALL_ASPECT, SIGN_FONT, pw - 14);
    g.fillStyle = 'rgba(40,40,46,.5)';
    for (let ly = py + 6; ly < py + ph / 2 - 6; ly += 3)
      g.fillRect(px - pw / 2 + 9, ly, (pw - 18) * (0.5 + rand() * 0.5), 0.9);
    g.fillStyle = 'rgba(214,204,160,.55)';
    for (const [tx, ty] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      g.fillRect(px + (tx * pw) / 2 - 5, py + (ty * ph) / 2 - 2, 10, 4);
    glassShine(g, x, y, w, h);
  };
// the floor guide: a dark board with its heading, a plan of the floor in the colours of its zones round a dark
// middle (the atrium), and the red dot of "you are here"
const floorGuide: Paint = (g, rand) => {
  const x = 40,
    w = TEX - 80,
    y = rowOf(3.5),
    h = rowOf(1.05) - y;
  box(g, x - 4, y - 3, w + 8, h + 6, '#5b574a');
  g.fillStyle = '#2c4546';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#b6b29c';
  words(g, MALL_GUIDE, x + w / 2, y + 11, 15, WALL_ASPECT, SIGN_FONT, w - 20);
  g.fillRect(x + 10, y + 19, w - 20, 1.4);
  // the plan: eight zones round the middle
  const px = x + 12,
    py = y + 26,
    pw = w - 24,
    ph = h - 54,
    zones = ['#8f4b42', '#4c7589', '#a18c47', '#58845c', '#85598a', '#4c7589', '#a18c47', '#8f4b42'];
  zones.forEach((c, n) => {
    const col = n % 4,
      top = n < 4;
    g.fillStyle = c;
    g.fillRect(px + col * (pw / 4) + 1, top ? py : py + ph * 0.66, pw / 4 - 2, ph * 0.34);
  });
  g.fillStyle = '#16282a';
  g.fillRect(px + 1, py + ph * 0.36, pw - 2, ph * 0.28); // the concourse
  g.fillStyle = '#2c4546';
  g.fillRect(px + pw * 0.34, py + ph * 0.41, pw * 0.32, ph * 0.18); // the atrium
  g.fillStyle = SIGN_RED;
  oval(g, px + pw * 0.2, py + ph * 0.5, 3, 3 * WALL_ASPECT);
  g.fillStyle = 'rgba(182,178,156,.7)'; // the key
  for (let k = 0; k < 4; k++) g.fillRect(x + 10 + k * 36, y + h - 18, 10 + rand() * 14, 2.4);
  g.fillStyle = 'rgba(14,12,10,.2)';
  g.fillRect(x, y, w, h);
};
// the poster of a closing-down sale: yellow and red gone pale, the big words, the corner coming away
const salePoster: Paint = (g, rand) => {
  const x = 66,
    w = 124,
    y = rowOf(3.6),
    h = rowOf(1.2) - y;
  box(g, x, y, w, h, '#a8402f');
  g.fillStyle = '#c3a43f';
  g.fillRect(x + 6, y + 6, w - 12, h * 0.34);
  g.fillStyle = '#7c2a20';
  words(g, MALL_SALE, x + w / 2, y + 6 + (h * 0.34) / 2 + 1, 28, WALL_ASPECT, SIGN_FONT, w - 24);
  g.fillStyle = '#e1d7b4';
  words(g, '50%', x + w / 2, y + h * 0.62, 40, WALL_ASPECT, SIGN_FONT, w - 20);
  g.fillStyle = '#d6c58a';
  for (let k = 0; k < 3; k++) g.fillRect(x + 14, y + h * 0.82 + k * 4, (w - 28) * (0.5 + rand() * 0.5), 1.4);
  // faded where the light fell, and the lower right corner curling off
  g.fillStyle = 'rgba(176,170,146,.3)';
  g.fillRect(x, y, w, h * 0.5);
  g.fillStyle = '#908b79';
  g.beginPath();
  g.moveTo(x + w, y + h - 24);
  g.lineTo(x + w - 26, y + h);
  g.lineTo(x + w, y + h);
  g.fill();
  g.fillStyle = 'rgba(214,204,160,.55)';
  g.fillRect(x + w / 2 - 6, y - 2, 12, 5);
  g.fillRect(x - 3, y + h * 0.5, 6, 10);
};
// the toilets: pale tiles up to the sign, the sign a blue plate with a man and a woman and the word
const restroom: Paint = g => {
  const tileTop = rowOf(2.3),
    foot = rowOf(0.15);
  g.fillStyle = '#76878b';
  g.fillRect(0, tileTop, TEX, foot - tileTop);
  g.fillStyle = 'rgba(20,28,30,.28)';
  for (let ty = tileTop; ty < foot; ty += 7) g.fillRect(0, ty, TEX, 0.8);
  for (let tx = 0; tx < TEX; tx += 10) g.fillRect(tx, tileTop, 0.8, foot - tileTop);
  g.fillStyle = 'rgba(255,255,255,.08)';
  for (let ty = tileTop; ty < foot; ty += 7) g.fillRect(0, ty + 0.8, TEX, 1);
  g.fillStyle = '#273f5c'; // the border along the top of the tiles
  g.fillRect(0, tileTop - 3, TEX, 3);
  const x = 72,
    w = 112,
    y = rowOf(4.0),
    h = rowOf(2.7) - y;
  box(g, x, y, w, h, '#25405f');
  const figure = (cx: number, skirt: boolean, color: string) => {
    g.save();
    g.translate(cx, y + h * 0.4);
    g.scale(1, WALL_ASPECT);
    g.fillStyle = color;
    oval(g, 0, -17, 4, 4);
    if (skirt) {
      g.beginPath();
      g.moveTo(-3, -11);
      g.lineTo(3, -11);
      g.lineTo(8, 6);
      g.lineTo(-8, 6);
      g.fill();
      g.fillRect(-3, 6, 2, 9);
      g.fillRect(1, 6, 2, 9);
    } else {
      g.fillRect(-5, -11, 10, 16);
      g.fillRect(-4, 5, 3, 10);
      g.fillRect(1, 5, 3, 10);
    }
    g.restore();
  };
  figure(x + w * 0.27, false, '#aebdd2');
  figure(x + w * 0.73, true, '#d1a6a6');
  g.fillStyle = '#7e93ae';
  g.fillRect(x + w / 2 - 0.7, y + 5, 1.4, h * 0.58);
  g.fillStyle = '#c0cadb';
  words(g, MALL_TOILET, x + w / 2, y + h - 9, 15, WALL_ASPECT, SIGN_FONT, w - 16);
};
// a fire hydrant box let into the wall: a red door with the word on a plate, a window with the hose coiled behind it
const hydrant: Paint = g => {
  const x = 88,
    w = 80,
    y = rowOf(1.75),
    foot = rowOf(0.3);
  box(g, x - 4, y - 3, w + 8, foot - y + 3, '#6b2923');
  g.fillStyle = '#8c2d25';
  g.fillRect(x, y, w, foot - y);
  g.fillStyle = 'rgba(255,230,220,.14)';
  g.fillRect(x, y, 2, foot - y);
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.fillRect(x + w - 2, y, 2, foot - y);
  g.fillStyle = '#d6ccb8';
  g.fillRect(x + 8, y + 6, w - 16, 15);
  g.fillStyle = '#7d2a22';
  words(g, MALL_HYDRANT, x + w / 2, y + 14, 14, WALL_ASPECT, SIGN_FONT, w - 24);
  g.fillStyle = '#20282b'; // the window and the hose
  g.fillRect(x + 12, y + 28, w - 24, 30);
  g.strokeStyle = '#4a5a4e';
  g.lineWidth = 3;
  for (let r = 0; r < 3; r++) {
    g.beginPath();
    g.ellipse(x + w / 2, y + 43, 10 + r * 4, (10 + r * 4) * WALL_ASPECT, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#b0a58a'; // the handle
  g.fillRect(x + w - 14, y + 66, 5, 14);
  g.fillStyle = '#5a1f1a';
  oval(g, x + w / 2, rowOf(1.95), 5, 5 * WALL_ASPECT); // the lamp over it, out
};
// the casing of a column: slabs of cream marble with their veins, a dark foot, a brass band at head height
const marblePillar: Paint = (g, rand) => {
  const x = 72,
    w = 112,
    foot = rowOf(0.3),
    slab = foot / 4;
  g.fillStyle = 'rgba(14,12,10,.3)';
  g.fillRect(x + w, 0, 7, foot);
  for (let r = 0; r < 4; r++) {
    g.fillStyle = ['#a29b86', '#9b947f', '#a8a18c', '#9d9681'][Math.floor(rand() * 4)]!;
    g.fillRect(x, slab * r, w, slab);
    g.save();
    g.beginPath();
    g.rect(x, slab * r, w, slab);
    g.clip();
    for (let v = 0; v < 5; v++) {
      g.strokeStyle = rand() < 0.5 ? 'rgba(236,230,212,.3)' : 'rgba(90,80,64,.28)';
      g.lineWidth = 0.6 + rand() * 1.4;
      let vx = x + rand() * w,
        vy = slab * r;
      g.beginPath();
      g.moveTo(vx, vy);
      while (vy < slab * (r + 1)) {
        vx += (rand() - 0.5) * 24;
        vy += 4 + rand() * 12;
        g.lineTo(vx, vy);
      }
      g.stroke();
    }
    g.restore();
    g.fillStyle = 'rgba(40,34,26,.4)';
    g.fillRect(x, slab * r, w, 1);
  }
  const face = g.createLinearGradient(x, 0, x + w, 0);
  face.addColorStop(0, 'rgba(190,210,240,.16)');
  face.addColorStop(0.5, 'rgba(190,210,240,.04)');
  face.addColorStop(1, 'rgba(10,10,14,.16)');
  g.fillStyle = face;
  g.fillRect(x, 0, w, foot);
  g.fillStyle = BRASS;
  g.fillRect(x - 2, rowOf(1.5), w + 4, 3);
  box(g, x - 3, foot, w + 6, TEX - foot, '#43392f');
};
// a cash machine in an alcove: the grey body, the dark screen, the keypad, the slot, the sign over it unlit
const atm: Paint = (g, rand) => {
  const ax = 58,
    aw = 140,
    top = rowOf(3.1),
    foot = rowOf(0.15);
  g.fillStyle = '#3b392f'; // the alcove
  g.fillRect(ax, top, aw, foot - top);
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.fillRect(ax, top, aw, 6);
  const x = 88,
    w = 80,
    y = rowOf(2.2);
  box(g, x, rowOf(2.85), w, rowOf(2.4) - rowOf(2.85), '#3e4d54');
  g.fillStyle = '#6b8590';
  words(g, MALL_ATM, x + w / 2, rowOf(2.62), 15, WALL_ASPECT, SIGN_FONT, w - 14);
  box(g, x, y, w, foot - y, '#6a6e72');
  g.fillStyle = '#12181b'; // the screen, off, with a glare
  g.fillRect(x + 8, y + 7, w - 16, 34);
  g.fillStyle = 'rgba(180,200,230,.12)';
  g.beginPath();
  g.moveTo(x + 8, y + 7);
  g.lineTo(x + 34, y + 7);
  g.lineTo(x + 18, y + 41);
  g.lineTo(x + 8, y + 41);
  g.fill();
  g.fillStyle = '#2f3336'; // the keypad
  g.fillRect(x + 10, y + 50, 34, 30);
  g.fillStyle = '#8b8f92';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.fillRect(x + 13 + c * 10, y + 53 + r * 7, 7, 4);
  g.fillStyle = '#0d1012'; // the card slot and the cash slot
  g.fillRect(x + 52, y + 52, 18, 3);
  g.fillRect(x + 12, y + 90, w - 24, 8);
  g.fillStyle = '#9a9082'; // a receipt left hanging out
  g.fillRect(x + 30 + rand() * 10, y + 96, 6, 12);
  grime(g, rand, 20, '#8b9094', '#25282a');
};
// a children's play corner's mural, faded: sky, sun, hills, a tree, balloons and an elephant, flaking off the wall
const mural: Paint = (g, rand) => {
  const x = 22,
    w = TEX - 44,
    y = rowOf(3.7),
    foot = rowOf(0.5),
    h = foot - y;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = '#6f93a6';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#c4a74a'; // the sun
  oval(g, x + w * 0.8, y + h * 0.22, 15, 15 * WALL_ASPECT);
  g.fillStyle = '#c9c8bc'; // clouds
  for (const [cx, cy] of [
    [0.25, 0.18],
    [0.55, 0.3],
  ] as const)
    for (const dx of [-10, 0, 11]) oval(g, x + w * cx + dx, y + h * cy - Math.abs(dx) * 0.2, 11, 7);
  g.fillStyle = '#5d8a55';
  g.beginPath();
  g.moveTo(x, y + h * 0.7);
  g.bezierCurveTo(x + w * 0.25, y + h * 0.5, x + w * 0.5, y + h * 0.8, x + w, y + h * 0.58);
  g.lineTo(x + w, foot);
  g.lineTo(x, foot);
  g.fill();
  g.fillStyle = '#497343';
  g.fillRect(x, y + h * 0.86, w, h * 0.14);
  g.fillStyle = '#6a5037'; // the tree
  g.fillRect(x + w * 0.1 - 2, y + h * 0.5, 5, h * 0.3);
  g.fillStyle = '#3e6a3c';
  oval(g, x + w * 0.1, y + h * 0.42, 16, 14);
  g.fillStyle = '#8e9aa6'; // the elephant
  oval(g, x + w * 0.52, y + h * 0.66, 26, 16);
  oval(g, x + w * 0.52 + 26, y + h * 0.55, 11, 10);
  oval(g, x + w * 0.52 + 20, y + h * 0.58, 8, 11);
  g.strokeStyle = '#8e9aa6';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(x + w * 0.52 + 35, y + h * 0.58);
  g.quadraticCurveTo(x + w * 0.52 + 44, y + h * 0.75, x + w * 0.52 + 36, y + h * 0.82);
  g.stroke();
  g.fillRect(x + w * 0.52 - 18, y + h * 0.72, 7, h * 0.14);
  g.fillRect(x + w * 0.52 + 8, y + h * 0.72, 7, h * 0.14);
  for (const [cx, c] of [
    [0.72, '#a8493d'],
    [0.82, '#c4a74a'],
    [0.9, '#4c7589'],
  ] as const) {
    g.fillStyle = c; // balloons
    oval(g, x + w * cx, y + h * 0.42, 7, 9);
    g.strokeStyle = 'rgba(30,26,20,.5)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x + w * cx, y + h * 0.42 + 9);
    g.lineTo(x + w * 0.82, y + h * 0.72);
    g.stroke();
  }
  // faded, and flaking where the damp got behind it
  g.fillStyle = 'rgba(122,116,100,.32)';
  g.fillRect(x, y, w, h);
  for (let k = 0; k < 7; k++)
    smudge(g, x + rand() * w, y + rand() * h, 8 + rand() * 18, 6 + rand() * 12, '154,150,132', 0.55);
  g.restore();
  g.strokeStyle = '#4e6f87';
  g.lineWidth = 3;
  g.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
};
// a notice board: a frame of dark wood round green felt, a header, sheets pinned to it at all angles
const noticeBoard: Paint = (g, rand) => {
  const x = 40,
    w = TEX - 80,
    y = rowOf(3.2),
    h = rowOf(1.2) - y;
  box(g, x - 4, y - 3, w + 8, h + 6, '#4a3f31');
  g.fillStyle = '#3f5b4a';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#b7b29b';
  words(g, MALL_NOTICE, x + w / 2, y + 9, 13, WALL_ASPECT, SIGN_FONT, w - 20);
  g.save();
  g.beginPath();
  g.rect(x, y + 17, w, h - 17);
  g.clip();
  for (let k = 0; k < 8; k++) {
    g.save();
    g.translate(x + 18 + (k % 4) * 42 + rand() * 8, y + (k < 4 ? 0.4 : 0.76) * h + (rand() - 0.5) * 8);
    g.rotate((rand() - 0.5) * 0.3);
    sheet(g, rand, 24 + rand() * 8, 22 + rand() * 6, PAPERS[Math.floor(rand() * PAPERS.length)]!);
    g.fillStyle = rand() < 0.5 ? '#a63a2d' : '#3e5f8b';
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
  steel.addColorStop(0, '#6e756c');
  steel.addColorStop(0.5, '#7c8479');
  steel.addColorStop(1, '#666d65');
  g.fillStyle = steel;
  g.fillRect(x, y, w, foot - y);
  g.fillStyle = 'rgba(20,18,14,.3)';
  g.fillRect(x, foot - 9, w, 9);
  g.fillStyle = '#383a37';
  g.fillRect(x + 8, rowOf(1.05), w - 16, 3.5);
  g.fillStyle = 'rgba(255,255,240,.3)';
  g.fillRect(x + 8, rowOf(1.05), w - 16, 1);
  const sy = rowOf(2.85),
    sh = rowOf(2.4) - sy,
    sx = 80;
  box(g, sx, sy, 96, sh, '#c3c8b8');
  g.fillStyle = EXIT_GREEN;
  g.fillRect(sx + 2, sy + 2, 26, sh - 4);
  // the running figure, white on green
  g.strokeStyle = '#e4eadb';
  g.fillStyle = '#e4eadb';
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
  words(g, MALL_EXIT, sx + 62, sy + sh / 2 + 0.5, 20, WALL_ASPECT, SIGN_FONT, 60);
};
// ---- the empty tenancies: what the walls that no shop owns are mostly made of ----
// the place where a shop's sign hung: a brighter patch of wall with the bolt holes, a cable hanging from it
function signScar(g: CanvasRenderingContext2D, rand: () => number, cable: boolean) {
  const x = 22,
    w = TEX - 44,
    y = rowOf(4.9),
    h = rowOf(4.1) - y;
  g.fillStyle = 'rgba(236,228,206,.16)';
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(40,32,22,.5)';
  for (const bx of [x + 6, x + w * 0.5, x + w - 6]) for (const by of [y + 5, y + h - 5]) oval(g, bx, by, 1.8, 1.8);
  if (cable) {
    g.strokeStyle = 'rgba(20,18,16,.75)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(x + w * 0.7, y + h - 4);
    g.bezierCurveTo(x + w * 0.7 + 6, y + h + 12, x + w * 0.7 - 10, y + h + 20, x + w * 0.7 + rand() * 8, y + h + 30);
    g.stroke();
  }
}
// the paper taped up on an empty shop: a red head with the words, lines for the rest, a telephone number
function vacantPaper(g: CanvasRenderingContext2D, rand: () => number, cx: number, cy: number) {
  const w = 60,
    h = 78;
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.fillRect(cx - w / 2 + 2, cy - h / 2 + 2, w, h);
  g.fillStyle = '#c2bca8';
  g.fillRect(cx - w / 2, cy - h / 2, w, h);
  g.fillStyle = SIGN_RED;
  g.fillRect(cx - w / 2, cy - h / 2, w, 20);
  g.fillStyle = '#e1d9c0';
  words(g, MALL_VACANT, cx, cy - h / 2 + 11, 11, WALL_ASPECT, SIGN_FONT, w - 6);
  g.fillStyle = 'rgba(40,40,46,.5)';
  for (let ly = cy - h / 2 + 28; ly < cy + h / 2 - 20; ly += 4)
    g.fillRect(cx - w / 2 + 5, ly, (w - 10) * (0.5 + rand() * 0.5), 1);
  g.fillStyle = 'rgba(30,30,36,.7)';
  g.fillRect(cx - w / 2 + 8, cy + h / 2 - 12, w - 16, 5);
  g.fillStyle = 'rgba(214,204,160,.55)';
  g.fillRect(cx - 5, cy - h / 2 - 2, 10, 4);
  g.fillRect(cx - w / 2 - 3, cy + 6, 6, 9);
}
// an empty tenancy behind a shutter, the paper high on the left
const vacantShutter: Paint = (g, rand) => {
  signScar(g, rand, false);
  shutterBody(g, rand);
  vacantPaper(g, rand, 72, rowOf(2.5));
};
// an empty tenancy behind dark glass, the paper on the right, the glass bare behind it
const vacantGlass: Paint = (g, rand) => {
  signScar(g, rand, true);
  const { x, y, w, h } = showWindow(g, ['#222628', '#121415']);
  glassShine(g, x, y, w, h);
  vacantPaper(g, rand, x + w * 0.72, y + h * 0.5);
};
// an empty tenancy behind a shutter, the paper low in the middle, the scar of the sign with its cable
const vacantShutterLow: Paint = (g, rand) => {
  signScar(g, rand, true);
  shutterBody(g, rand);
  vacantPaper(g, rand, TEX / 2, rowOf(1.5));
};
// ---- the inside of a lift's car: brushed steel panels, a handrail; one wall has the panel of buttons ----
const liftFace: Paint = (g, rand) => {
  const foot = rowOf(0.15),
    steel = g.createLinearGradient(0, 0, TEX, 0);
  steel.addColorStop(0, '#8a8780');
  steel.addColorStop(0.5, '#9d9a92');
  steel.addColorStop(1, '#86837c');
  g.fillStyle = steel;
  g.fillRect(0, 0, TEX, foot);
  for (let x = 0; x < TEX; x += TEX / 4) {
    g.fillStyle = 'rgba(20,18,14,.4)';
    g.fillRect(x - 0.7, 0, 1.4, foot);
    g.fillStyle = 'rgba(255,250,236,.14)';
    g.fillRect(x + 0.7, 0, 1, foot);
  }
  for (let k = 0; k < 160; k++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(255,250,236,.07)' : 'rgba(20,18,14,.07)';
    g.fillRect(rand() * TEX, 0, 0.8, foot * (0.3 + rand() * 0.7));
  }
  // the handrail along the wall, on two posts at each panel joint
  g.fillStyle = '#b7aa86';
  g.fillRect(0, rowOf(1.0), TEX, 4);
  g.fillStyle = 'rgba(0,0,0,.3)';
  g.fillRect(0, rowOf(1.0) + 4, TEX, 2);
  g.fillStyle = '#6f6b5d';
  for (let x = TEX / 8; x < TEX; x += TEX / 4) g.fillRect(x - 2, rowOf(1.0), 4, 9);
  // the dark skirting and the light of the ceiling's edge
  g.fillStyle = '#3a342c';
  g.fillRect(0, foot - 8, TEX, 8);
  grime(g, rand, 40, '#aaa294', '#3a342c');
};
const liftButtons: Paint = (g, rand) => {
  liftFace(g, rand);
  const x = 150,
    w = 46,
    y = rowOf(2.2),
    h = rowOf(1.1) - y;
  box(g, x, y, w, h, '#2e2a24');
  g.fillStyle = '#18140f';
  g.fillRect(x + 6, y + 6, w - 12, 12);
  g.fillStyle = '#b46a2a'; // the display, the floor in dim orange
  g.fillRect(x + 12, y + 9, 10, 6);
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 2; c++) {
      g.fillStyle = '#b7aa86';
      oval(g, x + 14 + c * 18, y + 28 + r * 12, 4.2, 4.2 * WALL_ASPECT);
      g.fillStyle = '#4a4338';
      oval(g, x + 14 + c * 18, y + 28 + r * 12, 2.4, 2.4 * WALL_ASPECT);
    }
};
// The wall pictures, by number. First those that stand in any room and on any wall (nothing on the first, which is the
// plainest and comes up most: variantOf), then those only along the concourse (the shop fronts: a shutter, a dark
// window and a window of a closed shop for each kind of shop, and the sale poster), then the shops' own, in the order
// of SHOP_PICS (Look.roomWalls). Variants of one kind are far apart in the list, and the list is long and prime enough
// for variantOf and the lane walls not to give every second tile along a wall the same picture
const COMMON_PICS: (Paint | null)[] = [
  null, // plain panels
  floorGuide,
  restroom,
  hydrant,
  marblePillar,
  atm,
  mural,
  noticeBoard,
  emergencyExit, // WALL_EXIT
  vacantShutter,
  vacantGlass,
  vacantShutterLow,
  liftFace,
  liftButtons,
];
const [
  ,
  GUIDE,
  RESTROOM,
  HYDRANT,
  PILLAR,
  ATM,
  MURAL,
  NOTICE,
  WALL_EXIT,
  VACANT_A,
  VACANT_B,
  VACANT_C,
  LIFT_FACE,
  LIFT_BUTTONS,
] = COMMON_PICS.map((_, n) => n);
const kinds = Array.from({ length: SHOP_KINDS }, (_, n) => n);
const FRONT_PICS: Paint[] = [...kinds.map(shutter), ...kinds.map(darkWindow), ...kinds.map(closedWindow), salePoster];
const SALE = COMMON_PICS.length + FRONT_PICS.length - 1;
export const MALL_WALL_PICS: (Paint | null)[] = [...COMMON_PICS, ...FRONT_PICS, ...SHOP_PICS.flat(), ...GROUND_PICS];
// What the walls that no shop owns (the walls of the start room, the boss room and the atrium, and of a corridor with no
// room behind it) are made of. 40% are the plain wall, the rest are shared out in twentieths, the empty tenancies
// the most; the things that stand out (the toilets, the cash machine, the mural) come up once each, so together
// they are about a tenth of the walls. A picture in the list more than once comes up that many twentieths. A shop's
// front is only on the wall of its own room, where its name board hangs (Look.roomWalls)
const COMMON_MAP = [
  0,
  VACANT_A,
  VACANT_A,
  VACANT_A,
  VACANT_B,
  VACANT_B,
  VACANT_B,
  VACANT_C,
  VACANT_C,
  HYDRANT,
  HYDRANT,
  NOTICE,
  NOTICE,
  PILLAR,
  PILLAR,
  GUIDE,
  SALE,
  RESTROOM,
  ATM,
  MURAL,
  WALL_EXIT,
];
// along a concourse, in the places of the plain wall, on the walls that no shop owns: mostly the empty tenancies and
// the plain wall, now and then the poster
export const MALL_LANE_WALLS = [VACANT_A, 0, VACANT_B, 0, VACANT_C, 0, VACANT_A, 0, VACANT_B, SALE, 0, VACANT_C];
// the pictures of the walls round a lift: the face of a wall and the one with the buttons
export const MALL_LIFT_WALLS = [LIFT_FACE, LIFT_BUTTONS];
// a room's kind of shop and the pictures of its walls (common.ts RoomWalls): the shops' own pictures, then the bare
// walls, numbered from the end of the shop fronts on; the fronts of a kind are its shutter, its dark window and its
// closed window
let next = COMMON_PICS.length + FRONT_PICS.length;
const shopWalls = SHOP_PICS.map(set => set.map(() => next++)),
  groundWalls = GROUND_PICS.map(() => next++);
export const MALL_ROOM_WALLS: RoomWalls = {
  plain: COMMON_PICS.length + FRONT_PICS.length,
  common: COMMON_MAP,
  shops: shopWalls,
  ground: groundWalls,
  fronts: kinds.map(n => [
    COMMON_PICS.length + n,
    COMMON_PICS.length + SHOP_KINDS + n,
    COMMON_PICS.length + 2 * SHOP_KINDS + n,
  ]),
};
// the fire exit only on the building's outside wall (common.ts WallSides). There are no windows to the outside
export const MALL_WALL_SIDES: WallSides = { outer: [WALL_EXIT] };
// the floors of the shop rooms, two to a kind, after the concourse's own (common.ts RoomFloors)
export const MALL_ROOM_FLOORS: RoomFloors = {
  plain: MALL_FLOORS,
  shops: kinds.map(n => [MALL_FLOORS + 2 * n, MALL_FLOORS + 2 * n + 1]),
};
const mallWall =
  (variant: number): Paint =>
  (g, rand) => {
    // (the pictures of the shop rooms paint the wall of their kind themselves)
    if (variant < MALL_ROOM_WALLS.plain) panels(g, rand);
    MALL_WALL_PICS[variant]?.(g, rand);
    grain(g, rand, 12);
  };

// The floor: the same polished warm stone tile under every variant (the painter is given the same seed for all of them).
// The tiles are laid so that their joints are half a tile in from the picture's edge, and they are painted over the
// edge to the other side, so no joint lies on the edge of a floor tile and the floor does not show its squares. The
// stains run on across the edge too
const tileOf = (n: number) => (TEX / FLOOR_TILES) * (n + 0.5);
const mallFloor =
  (variant: number): Paint =>
  (g, rand) => {
    const s = TEX / FLOOR_TILES;
    g.fillStyle = '#887a64';
    g.fillRect(0, 0, TEX, TEX);
    // each tile a shade of its own, with the shine of the polish in its upper left (the one past the edge is the first again)
    const shade = Array.from({ length: FLOOR_TILES * FLOOR_TILES }, () => rand());
    for (let a = 0; a <= FLOOR_TILES; a++)
      for (let b = 0; b <= FLOOR_TILES; b++) {
        const t = shade[(b % FLOOR_TILES) * FLOOR_TILES + (a % FLOOR_TILES)]!,
          x = tileOf(a - 1),
          y = tileOf(b - 1);
        g.fillStyle = t < 0.5 ? `rgba(255,248,226,${t * 0.12})` : `rgba(24,20,14,${(t - 0.5) * 0.14})`;
        g.fillRect(x, y, s, s);
        const gloss = g.createLinearGradient(x, y, x + s, y + s);
        gloss.addColorStop(0, 'rgba(200,216,244,.1)');
        gloss.addColorStop(0.5, 'rgba(200,216,244,0)');
        g.fillStyle = gloss;
        g.fillRect(x, y, s, s);
      }
    for (let k = 0; k < 32; k++) {
      const dark = rand() < 0.55;
      smudge(
        g,
        rand() * TEX,
        rand() * TEX,
        16 + rand() * 50,
        12 + rand() * 34,
        dark ? '40,36,28' : '170,162,140',
        0.05 + rand() * 0.1,
      );
    }
    for (let k = 0; k < 400; k++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(30,26,20,.14)' : 'rgba(190,184,164,.12)';
      g.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 2, 1);
    }
    g.fillStyle = 'rgba(30,26,20,.3)'; // the joints
    for (let n = 0; n < FLOOR_TILES; n++) {
      g.fillRect(tileOf(n) - 0.5, 0, 1, TEX);
      g.fillRect(0, tileOf(n) - 0.5, TEX, 1);
    }
    // everything below stays clear of the picture's edge (the tactile strip runs across it, in line with the next)
    if (variant === 1) {
      // dust that gathered, and receipts that blew in: a pale slip with its lines of print, some crumpled
      for (let k = 0; k < 6; k++)
        smudge(g, 60 + rand() * 136, 60 + rand() * 136, 14 + rand() * 24, 8 + rand() * 12, '170,160,134', 0.22);
      for (let k = 0; k < 7; k++) {
        g.save();
        g.translate(50 + rand() * 156, 50 + rand() * 156);
        g.rotate(rand() * Math.PI);
        if (rand() < 0.7) sheet(g, rand, 5, 16 + rand() * 12, '#b8b4a2');
        else {
          g.fillStyle = '#aaa692';
          oval(g, 0, 0, 3, 3);
        }
        g.restore();
      }
    } else if (variant === 2) {
      // water that leaked long ago and dried: rings of tide marks, the middle darker
      const cx = 100 + rand() * 56,
        cy = 100 + rand() * 56;
      for (let r = 0; r < 4; r++) {
        const rx = 18 + r * 12 + rand() * 6,
          ry = rx * (0.7 + rand() * 0.2);
        g.strokeStyle = `rgba(88,70,42,${0.34 - r * 0.06})`;
        g.lineWidth = 1.2 + rand();
        g.beginPath();
        g.ellipse(cx, cy, rx, ry, rand() * 0.6, 0, Math.PI * 2);
        g.stroke();
      }
      smudge(g, cx, cy, 24, 18, '84,66,40', 0.3);
    } else if (variant === 3) {
      // a cracked tile: a dark crack with its branches through one tile, a corner lifted
      const x = tileOf(2),
        y = tileOf(3);
      g.strokeStyle = 'rgba(14,12,10,.8)';
      g.lineWidth = 1.4;
      for (let k = 0; k < 4; k++) {
        let cx = x + rand() * s,
          cy = y;
        g.beginPath();
        g.moveTo(cx, cy);
        while (cy < y + s) {
          cx += (rand() - 0.5) * 12;
          cy += 4 + rand() * 7;
          g.lineTo(Math.min(x + s, Math.max(x, cx)), Math.min(y + s, cy));
        }
        g.stroke();
      }
      g.fillStyle = 'rgba(20,16,12,.55)';
      g.beginPath();
      g.moveTo(x + s, y + s);
      g.lineTo(x + s - 14, y + s);
      g.lineTo(x + s, y + s - 12);
      g.fill();
    } else if (variant === 4) {
      // the glass roof reflected in the polish: a pale patch with the pane lines of the roof faint in it, well inside
      // the picture
      const cx = TEX / 2,
        cy = TEX / 2,
        shine = g.createRadialGradient(cx, cy, 6, cx, cy, 80);
      shine.addColorStop(0, 'rgba(190,210,240,.16)');
      shine.addColorStop(1, 'rgba(190,210,240,0)');
      g.fillStyle = shine;
      g.fillRect(cx - 80, cy - 80, 160, 160);
      g.fillStyle = 'rgba(30,26,20,.14)';
      for (const d of [-36, 0, 36]) {
        g.fillRect(cx + d - 0.6, cy - 52, 1.2, 104);
        g.fillRect(cx - 52, cy + d - 0.6, 104, 1.2);
      }
    } else if (variant === 5) {
      // a shopping basket that rolled here, seen from above: grey-blue plastic with a grid of holes, the handle up
      // (kept low in contrast, and not red: a red patch on the floor reads as a live hazard tile)
      g.save();
      g.translate(TEX * 0.5, TEX * 0.5);
      g.rotate(0.5 + rand() * 0.5);
      g.fillStyle = 'rgba(10,8,6,.25)';
      g.fillRect(-26, -17, 56, 40);
      g.fillStyle = '#6d7881';
      g.fillRect(-28, -20, 56, 40);
      g.fillStyle = 'rgba(20,24,28,.3)';
      for (let gy = -15; gy < 16; gy += 6) for (let gx = -23; gx < 24; gx += 6) g.fillRect(gx, gy, 3.4, 3.4);
      g.strokeStyle = '#808c94';
      g.lineWidth = 2.4;
      g.strokeRect(-28, -20, 56, 40);
      g.strokeStyle = '#7a8086';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-16, -20);
      g.quadraticCurveTo(0, -42, 16, -20);
      g.stroke();
      g.restore();
    }
    grain(g, rand, 12);
  };
// The top of a deck or a ramp: the boards of an event stage, warm wood laid in rows with the joints staggered, darker
// than the tile below, with a dark nosing and a brass line round the edge, so where a deck ends shows from across the
// room
const mallDeck: Paint = (g, rand) => {
  const rows = 8,
    s = TEX / rows;
  for (let r = 0; r < rows; r++) {
    g.fillStyle = r % 2 ? '#6e5539' : '#765b3d';
    g.fillRect(0, r * s, TEX, s);
    g.fillStyle = 'rgba(14,10,6,.4)';
    g.fillRect(0, r * s, TEX, 1);
    const cut = (r * 83 + 40) % TEX;
    g.fillRect(cut, r * s, 1, s);
    g.fillStyle = 'rgba(0,0,0,.08)';
    g.fillRect(cut + (r % 2 ? 40 : -60), r * s + 1, 70, s - 1);
  }
  grime(g, rand, 60, '#917450', '#2e2216');
  for (let k = 0; k < 40; k++) {
    // the grain of the wood
    g.fillStyle = 'rgba(40,28,16,.2)';
    g.fillRect(rand() * TEX, rand() * TEX, 12 + rand() * 30, 0.8);
  }
  for (let k = 0; k < 10; k++) {
    // scuffs from where the stage was set and struck
    g.strokeStyle = 'rgba(200,180,140,.14)';
    g.lineWidth = 0.9;
    const x = rand() * TEX,
      y = rand() * TEX;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 20);
    g.stroke();
  }
  const band = 8;
  g.fillStyle = '#3c2e22';
  g.fillRect(0, 0, TEX, band);
  g.fillRect(0, TEX - band, TEX, band);
  g.fillRect(0, 0, band, TEX);
  g.fillRect(TEX - band, 0, band, TEX);
  g.strokeStyle = BRASS;
  g.lineWidth = 2;
  g.strokeRect(band + 1.5, band + 1.5, TEX - band * 2 - 3, TEX - band * 2 - 3);
  g.fillStyle = 'rgba(0,0,0,.3)';
  for (const p of [2, 5]) {
    g.fillRect(0, p, TEX, 1);
    g.fillRect(0, TEX - p - 1, TEX, 1);
    g.fillRect(p, 0, 1, TEX);
    g.fillRect(TEX - p - 1, 0, 1, TEX);
  }
  grain(g, rand, 12);
};
// The hung ceiling from below: white panels a third of a tile across (1.33 m) in a grid of faint bars that runs on from
// tile to tile (a bar lies on the picture's edge, half of it on each side), one small dark downlight in the middle
// panel (out; the ones that are lit are props) and a sprinkler head. It is also stuck on the vertical faces of an
// atrium, so it is kept calm: the lights must not read as a row on a wall
const CEILING_PANELS = 3; // panels across one ceiling picture
const mallCeiling: Paint = (g, rand) => {
  const s = TEX / CEILING_PANELS;
  g.fillStyle = '#716a5d';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 30, '#7a7366', '#5c564b');
  g.fillStyle = 'rgba(30,28,24,.12)'; // the little holes of the panels
  for (let k = 0; k < 400; k++) g.fillRect(rand() * TEX, rand() * TEX, 1, 1);
  for (let p = 0; p <= CEILING_PANELS; p++) {
    g.fillStyle = 'rgba(200,198,188,.2)';
    g.fillRect(p * s - 1, 0, 2, TEX);
    g.fillRect(0, p * s - 1, TEX, 2);
  }
  // the downlight: a small dark glass in a trim of the ceiling's own colour, in the middle of the picture
  g.fillStyle = '#5c5a54';
  oval(g, TEX / 2, TEX / 2, 8, 8);
  g.fillStyle = '#2a2c2e';
  oval(g, TEX / 2, TEX / 2, 5.5, 5.5);
  g.fillStyle = '#4a4843'; // a sprinkler head, in the middle of another panel
  oval(g, s * 0.5, s * 2.5, 1.8, 1.8);
  grain(g, rand, 10);
};
// One leaf of a door (a leaf is 2 m wide and a wall high, so its picture is stretched three times as tall). The mall's
// door is dark bronze round glass, a push bar across it with the little "push" sticker above, and glass over it
// up to the ceiling. The boss room's is the loading-bay shutter: dark ribbed steel between two bands of yellow and
// black, a red warning lamp near the top and the words on a red plate, below the height of the door's "BOSS" label
// (world/doors.ts BOSS_LABEL_Y) like the lamp, so the two do not cover each other
const mallDoor =
  (boss: boolean): Paint =>
  (g, rand) => {
    if (boss) {
      const steel = g.createLinearGradient(0, 0, TEX, 0);
      steel.addColorStop(0, '#383a3d');
      steel.addColorStop(0.5, '#494c4f');
      steel.addColorStop(1, '#333537');
      g.fillStyle = steel;
      g.fillRect(0, 0, TEX, TEX);
      grime(g, rand, 90, '#66696d', '#16171a');
      for (let y = 0; y < TEX; y += 5) {
        g.fillStyle = 'rgba(0,0,0,.34)';
        g.fillRect(0, y, TEX, 1.4);
        g.fillStyle = 'rgba(255,248,236,.07)';
        g.fillRect(0, y + 1.4, TEX, 1);
      }
      g.fillStyle = '#24262a';
      g.fillRect(0, 0, 12, TEX);
      g.fillRect(TEX - 12, 0, 12, TEX);
      const stripe = (from: number, to: number) => {
        stripes(
          g,
          [12, rowOf(from), TEX - 24, rowOf(to) - rowOf(from)],
          46,
          HAZARD_YELLOW,
          HAZARD_BLACK,
          'rgba(30,18,12,.2)',
        );
      };
      stripe(5.8, 5.3);
      stripe(0.85, 0.15);
      // the red warning lamp, its light on the slats round it
      const lx = TEX / 2,
        ly = rowOf(4.7);
      g.globalCompositeOperation = 'lighter';
      g.save();
      g.translate(lx, ly);
      g.scale(1, DOOR_ASPECT);
      const halo = g.createRadialGradient(0, 0, 4, 0, 0, 62);
      halo.addColorStop(0, 'rgba(255,60,40,.55)');
      halo.addColorStop(1, 'rgba(255,60,40,0)');
      g.fillStyle = halo;
      g.fillRect(-62, -62, 124, 124);
      g.restore();
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#1d1b1a';
      oval(g, lx, ly, 20, 20 * DOOR_ASPECT);
      g.fillStyle = '#ff5b45';
      oval(g, lx, ly, 15, 15 * DOOR_ASPECT);
      g.fillStyle = 'rgba(255,230,210,.8)';
      oval(g, lx - 3, ly - 1, 5, 5 * DOOR_ASPECT);
      // the red plate with the words, in two lines. Both leaves show it whole: it lies in the middle of the leaf's
      // picture, narrow enough to stay clear of the meeting edge (which a door that is opening already hides) and of
      // the outer edge; the characters are as wide as the plate allows, from the longest line
      const top = rowOf(2.8),
        foot = rowOf(1.15),
        per = Math.ceil(MALL_STAFF_ONLY.length / BOSS_PLATE_LINES),
        px = Math.floor((BOSS_PLATE_W - 2 * BOSS_PLATE_PAD) / per),
        step = (foot - top - 8) / BOSS_PLATE_LINES,
        left = (TEX - BOSS_PLATE_W) / 2;
      g.fillStyle = SIGN_RED;
      g.fillRect(left, top, BOSS_PLATE_W, foot - top);
      g.strokeStyle = '#d9d1bd';
      g.lineWidth = 3;
      g.strokeRect(left + 4, top + 3, BOSS_PLATE_W - 8, foot - top - 6);
      g.fillStyle = '#d9d1bd';
      for (let line = 0; line < BOSS_PLATE_LINES; line++)
        words(
          g,
          MALL_STAFF_ONLY.slice(line * per, (line + 1) * per),
          TEX / 2,
          top + 4 + step * (line + 0.5) + 1,
          px,
          DOOR_ASPECT,
          SIGN_FONT,
          BOSS_PLATE_W - 2 * BOSS_PLATE_PAD,
        );
      const dirt = g.createLinearGradient(0, 0, 0, TEX * 0.25);
      dirt.addColorStop(0, 'rgba(10,8,7,.5)');
      dirt.addColorStop(1, 'rgba(10,8,7,0)');
      g.fillStyle = dirt;
      g.fillRect(0, 0, TEX, TEX * 0.25);
    } else {
      const head = rowOf(2.7); // the top of the door itself; glass over it
      g.fillStyle = FRAME;
      g.fillRect(0, 0, TEX, TEX);
      const glass = g.createLinearGradient(0, 0, 0, TEX);
      glass.addColorStop(0, '#262420');
      glass.addColorStop(0.5, '#34312a');
      glass.addColorStop(1, '#1f1d1a');
      g.fillStyle = glass;
      g.fillRect(14, 8, TEX - 28, head - 8 - 6);
      g.fillRect(14, head + 6, TEX - 28, TEX - head - 6 - 14);
      g.fillStyle = 'rgba(190,210,240,.1)'; // the roof's reflection
      g.beginPath();
      g.moveTo(14, rowOf(2.2));
      g.lineTo(14 + 80, rowOf(2.2));
      g.lineTo(14 + 30, rowOf(0.5));
      g.lineTo(14, rowOf(0.5));
      g.fill();
      g.fillStyle = 'rgba(0,0,0,.4)'; // the door's head and the foot rail
      g.fillRect(0, head - 3, TEX, 6);
      g.fillStyle = 'rgba(255,250,236,.2)';
      g.fillRect(0, head + 3, TEX, 1.2);
      g.fillStyle = '#7d6a45';
      g.fillRect(8, rowOf(0.38), TEX - 16, rowOf(0.06) - rowOf(0.38));
      // the push bar on its two posts
      g.fillStyle = '#a68c53';
      g.fillRect(24, rowOf(1.12), TEX - 48, 4);
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.fillRect(24, rowOf(1.12), TEX - 48, 1.2);
      g.fillStyle = '#7d6a45';
      for (const px of [34, TEX - 40]) g.fillRect(px, rowOf(1.12) - 4, 6, 12);
      // the sticker: a small round white seal with the word on it
      g.fillStyle = '#b8b4a6';
      oval(g, TEX / 2, rowOf(1.55), 18, 18 * DOOR_ASPECT);
      g.fillStyle = '#7b2a22';
      words(g, MALL_PUSH, TEX / 2, rowOf(1.55) + 0.5, 26, DOOR_ASPECT, SIGN_FONT, 26);
      grime(g, rand, 50, '#7c7e80', '#1c1e20');
    }
    grain(g, rand, 14);
  };

// the mall's look (world/looks.ts makes it the first time the sector is drawn)
export function mallPictures(): Pictures {
  return {
    walls: MALL_WALL_PICS.map((_, v) => paint(3100 + v, mallWall(v))),
    laneWalls: MALL_LANE_WALLS,
    wallSides: MALL_WALL_SIDES,
    roomWalls: MALL_ROOM_WALLS,
    liftWalls: MALL_LIFT_WALLS,
    roomFloors: MALL_ROOM_FLOORS,
    roomKinds: mallRoomKinds,
    floors: [
      ...Array.from({ length: MALL_FLOORS }, (_, v) => paint(3200, mallFloor(v))),
      ...ROOM_FLOOR_PICS.map((fn, v) => paint(3210 + (v >> 1), fn)),
    ],
    deck: paint(3300, mallDeck),
    ceiling: paint(3400, mallCeiling),
    door: paint(3500, mallDoor(false)),
    bossDoor: paint(3501, mallDoor(true)),
    fog: 0x2a2623,
  };
}
