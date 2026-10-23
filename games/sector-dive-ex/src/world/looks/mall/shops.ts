import {
  MALL_FITTING,
  MALL_MENU,
  MALL_PHARMACY,
  MALL_STALLS,
  MALL_TRAY_RETURN,
  MALL_WATER,
} from '../../../i18n/signs.ts';
import { SIGN_FONT, TEX, WALL_ASPECT, oval, rowOf, words } from '../paint.ts';
import type { Paint } from '../paint.ts';
import { BRASS, SHOP_KINDS, SIGN_RED, box, frieze, panels } from './shared.ts';
// The pictures on the walls of the mall's shop rooms (Look.roomWalls): seven kinds of shop, two pictures each. Every
// one has a plain frieze in the kind's colour over it (shared.ts frieze), and the shop's goods below.
type G = CanvasRenderingContext2D;
// the kinds of shop, by number (the order of MALL_SHOP_NAMES)
export const SHOP_CLOTHES = 0,
  SHOP_CAFE = 1,
  SHOP_BOOKS = 2,
  SHOP_GLASSES = 3,
  SHOP_ELECTRONICS = 4,
  SHOP_DRUGSTORE = 5,
  SHOP_FOOD = 6;
const GARMENTS = ['#7a4a52', '#4d6672', '#8a7a52', '#5a6e52', '#6a5a7a', '#8a5a3a', '#55555c', '#a09078'];
const SPINES = ['#7a3a32', '#4a5a42', '#6a5230', '#3f4a62', '#8a7448', '#5a3a4a', '#3a5a58', '#8a6a52'];
const SPINES_COOL = ['#3f5670', '#4e6a6a', '#5e5a72', '#7a8a8a', '#445260', '#6a7a60', '#8a8272', '#35404e'];
const GOODS = ['#a8503c', '#4a7a8a', '#c0a040', '#5a8a5a', '#8a5a8a', '#c0c0b0', '#6a6a9a'];
const COUNTER = '#5b3f28';
const COUNTER_TOP = '#8d6a46';
const CHALK = '#c9c8b8';
const STEEL = '#8d9293';

// a shop's picture: the wall of its kind, the frieze in its colour (no name: that is on the shop front), then what `body` paints
const shop =
  (kind: number, body: (g: G, rand: () => number) => void): Paint =>
  (g, rand) => {
    panels(g, rand, kind);
    frieze(g, kind);
    body(g, rand);
  };
// a counter along the foot of the wall: a wooden front with a top that sticks out, `top` m up
function counter(g: G, x: number, w: number, top: number) {
  const y = rowOf(top);
  box(g, x, y, w, rowOf(0.15) - y, COUNTER);
  g.fillStyle = COUNTER_TOP;
  g.fillRect(x - 3, y - 3, w + 6, 4);
  g.fillStyle = 'rgba(0,0,0,.2)';
  for (let px = x + 12; px < x + w - 6; px += 16) g.fillRect(px, y + 5, 1, rowOf(0.15) - y - 8);
}
// rows of books on shelves: spines in `palette`, some leaning, gaps
function bookcase(g: G, rand: () => number, palette: string[], x: number, w: number, top: number, shelves: number) {
  const foot = rowOf(0.3),
    step = (foot - rowOf(top)) / shelves;
  g.fillStyle = '#35271c';
  g.fillRect(x - 4, rowOf(top) - 3, w + 8, foot - rowOf(top) + 4);
  for (let s = 0; s < shelves; s++) {
    const base = rowOf(top) + step * (s + 1);
    g.fillStyle = '#22180f';
    g.fillRect(x, base - step + 2, w, step - 2);
    for (let bx = x + 2; bx < x + w - 5;) {
      const bw = 3 + rand() * 4,
        bh = step * (0.55 + rand() * 0.38);
      if (rand() < 0.08) {
        bx += 6 + rand() * 8; // a gap
        continue;
      }
      g.fillStyle = palette[Math.floor(rand() * palette.length)]!;
      g.fillRect(bx, base - bh, bw, bh);
      g.fillStyle = 'rgba(230,220,190,.45)';
      g.fillRect(bx, base - bh * 0.7, bw, 1.4);
      bx += bw + 0.4;
    }
    g.fillStyle = '#6a4c30';
    g.fillRect(x, base, w, 2.5);
  }
}
// a flat television (or a screen): a dark glass in a frame with a slanting glare
function screen(g: G, x: number, y: number, w: number, h: number) {
  box(g, x, y, w, h, '#1b1c1e');
  g.fillStyle = '#0d1113';
  g.fillRect(x + 2, y + 2, w - 4, h - 4);
  g.fillStyle = 'rgba(190,200,220,.1)';
  g.beginPath();
  g.moveTo(x + 2, y + 2);
  g.lineTo(x + w * 0.5, y + 2);
  g.lineTo(x + w * 0.2, y + h - 2);
  g.lineTo(x + 2, y + h - 2);
  g.fill();
}
// a pair of glasses seen from the front: two lenses and the bridge
function glasses(g: G, x: number, y: number, s: number, color: string) {
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  for (const dx of [-s * 0.6, s * 0.6]) {
    g.beginPath();
    g.ellipse(x + dx, y, s * 0.5, s * 0.5 * WALL_ASPECT, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(x - s * 0.1, y);
  g.lineTo(x + s * 0.1, y);
  g.stroke();
}

// ---- clothes ----
// a rail of garments on hangers and a low table of folded stacks
const clothesRack: Paint = shop(SHOP_CLOTHES, (g, rand) => {
  g.fillStyle = STEEL;
  g.fillRect(18, rowOf(2.5), TEX - 36, 2.5);
  for (let x = 24; x < TEX - 30; x += 8 + rand() * 4) {
    const h = 30 + rand() * 14;
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.fillRect(x + 1.5, rowOf(2.5) + 2, 1, 5);
    g.fillStyle = GARMENTS[Math.floor(rand() * GARMENTS.length)]!;
    g.fillRect(x - 2, rowOf(2.5) + 6, 8, h);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.fillRect(x + 4, rowOf(2.5) + 6, 2, h);
  }
  box(g, 22, rowOf(0.95), TEX - 44, rowOf(0.15) - rowOf(0.95), '#4a3c2e');
  for (let x = 30; x < TEX - 60; x += 46)
    for (let s = 0; s < 3; s++) {
      g.fillStyle = GARMENTS[Math.floor(rand() * GARMENTS.length)]!;
      g.fillRect(x, rowOf(0.95) - 4 - s * 4, 34, 4);
    }
});
// mannequins standing in a lit alcove, dressed, on a low plinth
const mannequins: Paint = shop(SHOP_CLOTHES, (g, rand) => {
  box(g, 24, rowOf(3.7), TEX - 48, rowOf(0.5) - rowOf(3.7), '#2d2118');
  g.fillStyle = 'rgba(255,214,150,.07)';
  g.fillRect(24, rowOf(3.7), TEX - 48, 20);
  box(g, 24, rowOf(0.5), TEX - 48, rowOf(0.15) - rowOf(0.5), '#4d3723');
  for (let n = 0; n < 3; n++) {
    const cx = 56 + n * 72,
      foot = rowOf(0.5);
    g.fillStyle = '#a89c86';
    oval(g, cx, foot - 66, 5, 5 * WALL_ASPECT * 1.3);
    g.fillStyle = GARMENTS[Math.floor(rand() * GARMENTS.length)]!;
    g.beginPath();
    g.moveTo(cx - 13, foot - 58);
    g.lineTo(cx + 13, foot - 58);
    g.lineTo(cx + 9, foot - 28);
    g.lineTo(cx - 9, foot - 28);
    g.fill();
    g.fillStyle = GARMENTS[Math.floor(rand() * GARMENTS.length)]!;
    g.fillRect(cx - 9, foot - 28, 7.5, 26);
    g.fillRect(cx + 1.5, foot - 28, 7.5, 26);
  }
});
// fitting rooms: a wooden frame, a curtain drawn across each, folds in the cloth
const fittingRooms: Paint = shop(SHOP_CLOTHES, (g, rand) => {
  g.fillStyle = BRASS;
  g.fillRect(26, rowOf(3.4), TEX - 52, 3);
  for (let n = 0; n < 2; n++) {
    const x = 34 + n * 104,
      w = 88;
    g.fillStyle = n ? '#4f3d5c' : '#5c3d46';
    g.fillRect(x, rowOf(3.4) + 3, w, rowOf(0.3) - rowOf(3.4) - 3);
    for (let fx = x + 4; fx < x + w; fx += 7 + rand() * 3) {
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.fillRect(fx, rowOf(3.4) + 3, 2, rowOf(0.3) - rowOf(3.4) - 3);
      g.fillStyle = 'rgba(255,236,220,.08)';
      g.fillRect(fx + 2, rowOf(3.4) + 3, 1.5, rowOf(0.3) - rowOf(3.4) - 3);
    }
  }
  box(g, TEX / 2 - 22, rowOf(3.95), 44, 8, '#cbbf9a');
  g.fillStyle = '#4a3322';
  words(g, MALL_FITTING, TEX / 2, rowOf(3.95) + 4.5, 8, WALL_ASPECT, SIGN_FONT, 40);
});

// ---- cafe ----
// a menu on a blackboard over the counter, with the chalk drawings and the stools
const cafeBoard: Paint = shop(SHOP_CAFE, (g, rand) => {
  box(g, 46, rowOf(3.6), TEX - 92, rowOf(1.9) - rowOf(3.6), '#2a3330');
  g.strokeStyle = '#7b5a38';
  g.lineWidth = 3;
  g.strokeRect(46, rowOf(3.6), TEX - 92, rowOf(1.9) - rowOf(3.6));
  g.fillStyle = CHALK;
  words(g, MALL_MENU, TEX / 2, rowOf(3.3), 16, WALL_ASPECT, SIGN_FONT, 90);
  for (let r = 0; r < 4; r++) {
    g.fillStyle = 'rgba(201,200,184,.7)';
    g.fillRect(64, rowOf(2.95) + r * 7, 60 + rand() * 40, 1.4);
    g.fillRect(180, rowOf(2.95) + r * 7, 14, 1.4);
  }
  g.strokeStyle = 'rgba(201,200,184,.6)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(210, rowOf(2.9), 6, 0, Math.PI * 2);
  g.stroke();
  counter(g, 20, TEX - 40, 1.15);
  g.fillStyle = '#3a2a1e';
  for (const sx of [50, 110, 170]) {
    g.fillRect(sx, rowOf(0.9), 12, 3);
    g.fillRect(sx + 5, rowOf(0.9), 2, rowOf(0.15) - rowOf(0.9));
  }
});
// the back bar: shelves of cups, the espresso machine and the grinder on the counter
const coffeeBar: Paint = shop(SHOP_CAFE, (g, rand) => {
  for (const top of [3.4, 2.7]) {
    g.fillStyle = '#6a4c30';
    g.fillRect(30, rowOf(top), TEX - 60, 2.5);
    for (let x = 36; x < TEX - 50; x += 9) {
      g.fillStyle = rand() < 0.5 ? '#cfc6ae' : '#9a8f78';
      g.fillRect(x, rowOf(top) - 8, 6, 8);
    }
  }
  counter(g, 20, TEX - 40, 1.15);
  box(g, 60, rowOf(1.15) - 30, 78, 30, '#6a4a34');
  g.fillStyle = BRASS;
  g.fillRect(64, rowOf(1.15) - 26, 70, 2);
  for (const gx of [78, 104]) {
    g.fillStyle = '#2a2420';
    g.fillRect(gx, rowOf(1.15) - 12, 6, 12);
  }
  box(g, 160, rowOf(1.15) - 26, 22, 26, '#3b3632');
  g.fillStyle = '#7b6a52';
  g.fillRect(163, rowOf(1.15) - 36, 16, 10);
});

// ---- books ----
const books = (kind: number, palette: string[], face: boolean): Paint =>
  shop(kind, (g, rand) => {
    bookcase(g, rand, palette, 24, TEX - 48, 3.7, 5);
    if (face) {
      // a shelf of books shown with their covers out
      for (let x = 34; x < TEX - 50; x += 30) {
        g.fillStyle = palette[Math.floor(rand() * palette.length)]!;
        g.fillRect(x, rowOf(2.45), 22, 22);
        g.fillStyle = 'rgba(230,220,190,.5)';
        g.fillRect(x + 4, rowOf(2.45) + 5, 14, 3);
      }
    }
  });

// ---- glasses ----
// the wall of frames: rows of glasses on little shelves
const glassesWall: Paint = shop(SHOP_GLASSES, (g, rand) => {
  box(g, 22, rowOf(3.7), TEX - 44, rowOf(0.9) - rowOf(3.7), '#2c2b29');
  for (let r = 0; r < 5; r++) {
    const y = rowOf(3.45) + r * 20;
    g.fillStyle = '#6a4c30';
    g.fillRect(26, y + 9, TEX - 52, 2);
    for (let x = 42; x < TEX - 36; x += 38)
      glasses(g, x, y, 12, ['#b8b0a0', '#7a5c3c', '#2a2a30', '#9a8a60'][Math.floor(rand() * 4)]!);
  }
  counter(g, 20, TEX - 40, 0.9);
});
// the eye chart: a white plate with rows of letters getting smaller, a mirror and a shelf of cases beside it
const eyeChart: Paint = shop(SHOP_GLASSES, (g, rand) => {
  box(g, 78, rowOf(3.6), 100, rowOf(1.3) - rowOf(3.6), '#b4af9e');
  const rows = ['E', 'F P', 'T O Z', 'L P E D', 'P E C F D'];
  rows.forEach((text, n) => {
    g.fillStyle = '#25231f';
    words(g, text, TEX / 2, rowOf(3.35) + n * 16, 18 - n * 3, WALL_ASPECT, '"Arial",sans-serif', 80);
  });
  box(g, 30, rowOf(3.0), 36, rowOf(1.4) - rowOf(3.0), '#4b3a2a');
  g.fillStyle = '#7f8e92';
  g.fillRect(34, rowOf(3.0) + 4, 28, rowOf(1.4) - rowOf(3.0) - 8);
  g.fillStyle = 'rgba(210,220,230,.18)';
  g.fillRect(34, rowOf(3.0) + 4, 10, rowOf(1.4) - rowOf(3.0) - 8);
  counter(g, 192, 44, 1.0);
  for (let n = 0; n < 3; n++) glasses(g, 204 + n * 12, rowOf(1.0) - 8, 5 + rand(), '#3a322c');
});

// ---- electronics ----
// dead screens in a wall of them, big and small, boxes on a shelf under them
const deadScreens: Paint = shop(SHOP_ELECTRONICS, (g, rand) => {
  screen(g, 26, rowOf(3.7), 96, 52);
  screen(g, 130, rowOf(3.7), 100, 52);
  for (let n = 0; n < 4; n++) screen(g, 26 + n * 54, rowOf(2.4), 46, 30);
  box(g, 22, rowOf(0.9), TEX - 44, rowOf(0.15) - rowOf(0.9), '#3a3a3e');
  for (let x = 30; x < TEX - 50; x += 26) {
    g.fillStyle = GOODS[Math.floor(rand() * GOODS.length)]!;
    g.fillRect(x, rowOf(0.9) + 5, 20, 14);
  }
});
// a pegboard of phone cases hung in their packs, in rows, and a small screen on a counter
const phoneCases: Paint = shop(SHOP_ELECTRONICS, (g, rand) => {
  box(g, 24, rowOf(3.7), TEX - 48, rowOf(0.9) - rowOf(3.7), '#44444a');
  g.fillStyle = 'rgba(0,0,0,.3)';
  for (let y = rowOf(3.7) + 4; y < rowOf(0.9); y += 5) for (let x = 28; x < TEX - 28; x += 5) g.fillRect(x, y, 1, 1);
  for (let r = 0; r < 5; r++)
    for (let x = 32; x < TEX - 40; x += 18) {
      g.fillStyle = GOODS[Math.floor(rand() * GOODS.length)]!;
      g.fillRect(x, rowOf(3.55) + r * 17, 12, 14);
      g.fillStyle = 'rgba(255,255,255,.3)';
      g.fillRect(x + 2, rowOf(3.55) + r * 17 + 2, 8, 2);
    }
  counter(g, 20, TEX - 40, 0.9);
});

// ---- drugstore ----
// shelves of boxes with paper pop-ups sticking out, price tags on the edges
const popShelves: Paint = shop(SHOP_DRUGSTORE, (g, rand) => {
  box(g, 22, rowOf(3.7), TEX - 44, rowOf(0.3) - rowOf(3.7), '#46463f');
  for (let s = 0; s < 4; s++) {
    const base = rowOf(3.5) + s * 28 + 24;
    for (let x = 28; x < TEX - 40; x += 12) {
      g.fillStyle = GOODS[Math.floor(rand() * GOODS.length)]!;
      g.fillRect(x, base - 8 - rand() * 8, 10, 16);
    }
    g.fillStyle = '#7a7a70';
    g.fillRect(26, base + 1, TEX - 52, 2.5);
    g.fillStyle = '#bfb48a';
    for (let x = 34; x < TEX - 40; x += 40) g.fillRect(x, base + 3.5, 10, 3);
  }
  for (const px of [60, 150, 206]) {
    g.fillStyle = SIGN_RED;
    g.fillRect(px, rowOf(2.9), 22, 22);
    g.fillStyle = '#c9b45a';
    g.fillRect(px + 3, rowOf(2.9) + 6, 16, 8);
  }
});
// the dispensing counter: a high counter with a glass screen over it, a green cross plate, drawers behind, a ticket box
const pharmacy: Paint = shop(SHOP_DRUGSTORE, (g, rand) => {
  box(g, 26, rowOf(3.6), TEX - 52, rowOf(1.85) - rowOf(3.6), '#4a4a42');
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 8; c++) {
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.fillRect(32 + c * 26, rowOf(3.45) + r * 18, 22, 14);
      g.fillStyle = '#9a9684';
      g.fillRect(40 + c * 26, rowOf(3.45) + r * 18 + 5, 6, 2);
    }
  g.fillStyle = 'rgba(160,190,200,.12)';
  g.fillRect(26, rowOf(2.7), TEX - 52, rowOf(1.2) - rowOf(2.7));
  counter(g, 20, TEX - 40, 1.15);
  box(g, 108, rowOf(2.95), 40, 14, '#d0c8aa');
  g.fillStyle = '#2f6c5c';
  words(g, MALL_PHARMACY, 128, rowOf(2.95) + 8, 9, WALL_ASPECT, SIGN_FONT, 36);
  box(g, 196, rowOf(1.15) - 18, 20, 18, '#6b6a60');
  g.fillStyle = '#ccc';
  g.fillRect(200 + rand(), rowOf(1.15) - 14, 12, 4);
});

// ---- food court ----
// the stalls' counters, two to a picture: over each its menu in a band of lit photographs (dark now) in the stall's own
// colour with its small name, a counter and the hatch where the orders come out
const STALL_COLORS = ['#7b3b2c', '#2f4f6a', '#6a5a22', '#3e5e3a', '#6a3b52', '#4a4a52'];
const foodCounter = (variant: number): Paint =>
  shop(SHOP_FOOD, (g, rand) => {
    for (let n = 0; n < 2; n++) {
      const stall = (variant * 2 + n) % MALL_STALLS.length,
        x = 14 + n * 120,
        w = 108;
      box(g, x, rowOf(3.65), w, rowOf(3.1) - rowOf(3.65), STALL_COLORS[stall]!);
      g.fillStyle = '#d8c9a0';
      words(g, MALL_STALLS[stall]!, x + w / 2, rowOf(3.38), 11, WALL_ASPECT, SIGN_FONT, w - 10);
      for (let p = 0; p < 3; p++) {
        box(g, x + 4 + p * 34, rowOf(3.02), 30, rowOf(2.45) - rowOf(3.02), '#26231f');
        g.fillStyle = ['#8a5030', '#7a6a38', '#6a3a30'][Math.floor(rand() * 3)]!;
        oval(g, x + 19 + p * 34, rowOf(2.74), 9, 9 * WALL_ASPECT);
        g.fillStyle = 'rgba(190,200,220,.08)';
        g.fillRect(x + 4 + p * 34, rowOf(3.02), 12, rowOf(2.45) - rowOf(3.02));
      }
      g.fillStyle = '#44413b'; // the hatch, its shutter half down
      g.fillRect(x + 8, rowOf(2.1), w - 16, rowOf(1.15) - rowOf(2.1));
      for (let y = rowOf(2.1); y < rowOf(1.5); y += 4) {
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.fillRect(x + 8, y, w - 16, 1);
      }
      counter(g, x - 4, w + 8, 1.15);
    }
  });
// a stand with a water server on it: the big bottle, two taps, a stack of cups, a bin beside
const waterServer: Paint = shop(SHOP_FOOD, (g, rand) => {
  counter(g, 70, 116, 1.0);
  box(g, 100, rowOf(2.2), 40, rowOf(1.0) - rowOf(2.2) - 3, '#8a8f90');
  g.fillStyle = '#6a8fa0';
  oval(g, 120, rowOf(2.55), 15, 15 * WALL_ASPECT * 1.4);
  g.fillStyle = '#2a2a2c';
  for (const tx of [110, 130]) g.fillRect(tx, rowOf(1.55), 5, 5);
  for (let n = 0; n < 5; n++) {
    g.fillStyle = rand() < 0.5 ? '#cfc6ae' : '#b9b09a';
    g.fillRect(150, rowOf(1.0) - 4 - n * 3.2, 11, 3);
  }
  box(g, 196, rowOf(0.9), 24, rowOf(0.15) - rowOf(0.9), '#3a3a3c');
  box(g, TEX / 2 - 20, rowOf(3.2), 40, 12, '#cfc6a4');
  g.fillStyle = '#2e5160';
  words(g, MALL_WATER, TEX / 2, rowOf(3.2) + 7, 9, WALL_ASPECT, SIGN_FONT, 34);
});
// the tray return: a steel hatch in the wall with a conveyor shelf, stacks of brown trays, the word on a plate over it
const trayReturn: Paint = shop(SHOP_FOOD, (g, rand) => {
  box(g, 40, rowOf(2.2), TEX - 80, rowOf(0.95) - rowOf(2.2), '#202224');
  g.fillStyle = STEEL;
  g.fillRect(36, rowOf(2.2) - 3, TEX - 72, 3);
  g.fillRect(36, rowOf(0.95), TEX - 72, 4);
  for (let x = 54; x < TEX - 80; x += 52)
    for (let s = 0; s < 3 + Math.floor(rand() * 3); s++) {
      g.fillStyle = s % 2 ? '#6a4b31' : '#7a5c3c';
      g.fillRect(x, rowOf(0.95) - 6 - s * 6, 40, 5);
    }
  box(g, TEX / 2 - 26, rowOf(2.75), 52, 14, '#cfc6a4');
  g.fillStyle = '#4a3322';
  words(g, MALL_TRAY_RETURN, TEX / 2, rowOf(2.75) + 8, 10, WALL_ASPECT, SIGN_FONT, 46);
});

// The pictures of the shop rooms by kind of shop (Look.roomWalls: the kinds in the order of SHOP_*)
export const SHOP_PICS: Paint[][] = [
  [clothesRack, mannequins, fittingRooms],
  [cafeBoard, coffeeBar],
  [books(SHOP_BOOKS, SPINES, false), books(SHOP_BOOKS, SPINES_COOL, true)],
  [glassesWall, eyeChart],
  [deadScreens, phoneCases],
  [popShelves, pharmacy],
  [foodCounter(0), foodCounter(1), foodCounter(2), trayReturn, waterServer],
];
// The bare wall of each kind (the rest of the wall tiles of its room): its own wall and frieze, nothing on it
export const GROUND_PICS: Paint[] = Array.from({ length: SHOP_KINDS }, (_, kind) => shop(kind, () => undefined));
