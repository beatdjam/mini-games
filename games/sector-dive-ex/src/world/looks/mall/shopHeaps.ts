import type * as THREE from 'three';
import { canvasTex, oval } from '../paint.ts';
import { block, pick, seeded, soil } from '../cutoutTools.ts';
import type { G } from '../cutoutTools.ts';
import { LEATHER, MANNEQUIN, SHELF_BACK, SHELF_WOOD, carton, chairSide, shelfLeaning } from './cutouts.ts';
import { BRASS, PAPER, SHOP_KINDS } from './shared.ts';
import {
  GARMENTS,
  SHOP_BOOKS,
  SHOP_CAFE,
  SHOP_CLOTHES,
  SHOP_DRUGSTORE,
  SHOP_ELECTRONICS,
  SHOP_GLASSES,
  SPINES,
  STEEL,
  screen,
} from './shops.ts';
// What was left on the floor of the mall's shop rooms, a kind of shop at a time (dress.ts WallKit `heaps.shops`): the
// same size as the heaps of the concourse (3.5 m by 1.75 m, piled up to the chest), but the shop's own goods and
// fittings: a clothes rail and a mannequin, books fallen from their shelves, stacked chairs, cases of glasses, empty
// boxes of televisions, baskets and a fallen gondola. Two pictures to a kind. The food court's room has none: it keeps
// the heaps of the concourse. Nothing at the foot of a wall is a bright red (it would be taken for a hazard floor).

const W = 512,
  H = 256,
  FOOT = H - 6; // the floor in the picture (px)
const PRODUCT = ['#b9b3a0', '#5f8a8c', '#8a9a6a', '#a89868', '#6a7a9a', '#c8c2b0', '#8a6a7a']; // tubs, tins and boxes
const BASKET = ['#3f6a6a', '#5a6a7a', '#6a7048'];
const CASE_WOOD = '#4b3b2b'; // the frame of a display case and of a mirror
const TV_BODY = '#b2ac9a';
const BOX_WHITE = '#cdc8ba';
const BOX_GREY = ['#cdc8ba', '#b2b6b8', '#383b3d'];
const SACK = ['#a58b62', '#957a54', '#b09a70'];
const LEGS = '#464b54'; // steel stools
const TABLE_WOOD = '#6a4a2a';
const CAFE_CHAIRS = ['#6a4a2a', '#8a7a58', '#3f4a42'];
const CASES = ['#2d2b28', LEATHER[0]!, '#26303a', LEATHER[2]!]; // cases for glasses

// a clothes rail: two poles, a bar across, feet, and the garments hung from it (none when `hung` is false)
function rail(g: G, rand: () => number, x: number, w: number, top: number, foot: number, hung: boolean) {
  g.fillStyle = STEEL;
  g.fillRect(x, top, 4, foot - top);
  g.fillRect(x + w - 4, top, 4, foot - top);
  g.fillRect(x, top, w, 4);
  g.fillRect(x - 10, foot - 5, 24, 5);
  g.fillRect(x + w - 14, foot - 5, 24, 5);
  if (!hung) return;
  for (let gx = x + 8; gx < x + w - 14; gx += 7 + rand() * 4) {
    const h = 60 + rand() * 40;
    g.fillStyle = pick(rand, GARMENTS);
    g.fillRect(gx, top + 5, 8, h);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.fillRect(gx + 5, top + 5, 3, h);
  }
}
// a mannequin standing on its plate, `h` px high, tipped by `tilt`: pole, torso, head
function mannequin(g: G, x: number, foot: number, h: number, tilt: number) {
  g.save();
  g.translate(x, foot);
  g.rotate(tilt);
  g.fillStyle = MANNEQUIN;
  g.fillRect(-24, -4, 48, 4);
  g.fillRect(-2, -h * 0.62, 4, h * 0.62);
  g.beginPath();
  g.moveTo(-19, -h * 0.86);
  g.lineTo(19, -h * 0.86);
  g.lineTo(11, -h * 0.6);
  g.lineTo(-11, -h * 0.6);
  g.fill();
  oval(g, 0, -h * 0.93, 7, 9);
  g.restore();
}
// a stack of books laid flat, their spines to us, each a little out of line
function bookTower(g: G, rand: () => number, x: number, foot: number, count: number, w: number) {
  let y = foot,
    off = 0;
  for (let k = 0; k < count; k++) {
    const h = 11 + rand() * 7,
      bw = w * (0.75 + rand() * 0.35);
    off += (rand() - 0.5) * 8;
    y -= h;
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(x + off + 2, y + 2, bw, h);
    g.fillStyle = pick(rand, SPINES);
    g.fillRect(x + off, y, bw, h);
    g.fillStyle = 'rgba(230,220,190,.45)';
    g.fillRect(x + off + bw * 0.15, y + h * 0.35, bw * 0.3, 2);
  }
}
// a display case with a glass top, a dark frame and a few pairs of glasses inside
function glassCase(g: G, rand: () => number, x: number, foot: number, w: number, h: number) {
  block(g, x, foot - h, w, h, CASE_WOOD);
  g.fillStyle = '#1f2a2d';
  g.fillRect(x + 6, foot - h + 6, w - 12, h - 12);
  g.strokeStyle = 'rgba(190,200,210,.5)';
  g.lineWidth = 1.2;
  for (let gx = x + 14; gx < x + w - 22; gx += 26 + rand() * 8) {
    g.beginPath();
    g.ellipse(gx, foot - h / 2, 5, 4, 0, 0, Math.PI * 2);
    g.ellipse(gx + 11, foot - h / 2, 5, 4, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = 'rgba(190,210,230,.1)';
  g.fillRect(x + 6, foot - h + 6, (w - 12) * 0.4, h - 12);
}
// an old television, a boxy one: a pale body, a dark screen with a glare
function oldTv(g: G, x: number, foot: number, w: number, h: number) {
  block(g, x, foot - h, w, h, TV_BODY);
  g.fillStyle = '#15191a';
  g.fillRect(x + 6, foot - h + 6, w * 0.7, h - 12);
  g.fillStyle = 'rgba(190,200,220,.12)';
  g.fillRect(x + 6, foot - h + 6, w * 0.3, h - 12);
  g.fillStyle = '#6a665a';
  g.fillRect(x + w * 0.8, foot - h + 10, w * 0.14, 6);
  g.fillRect(x + w * 0.8, foot - h + 22, w * 0.14, 6);
}
// a shopping basket of plastic seen from the side, with a grid of slots; stacked ones nest into each other
function basket(g: G, x: number, y: number, w: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w * 0.9, y + 22);
  g.lineTo(x + w * 0.1, y + 22);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,.3)';
  for (let sx = x + 8; sx < x + w - 8; sx += 9) g.fillRect(sx, y + 6, 4, 10);
  g.fillStyle = 'rgba(255,255,255,.16)';
  g.fillRect(x, y, w, 2);
}
// goods that fell on the floor: small boxes and bottles scattered along the foot
function spilled(g: G, rand: () => number, count: number, from: number, to: number, palette: readonly string[]) {
  for (let k = 0; k < count; k++) {
    g.fillStyle = pick(rand, palette);
    const x = from + rand() * (to - from);
    if (rand() < 0.35) oval(g, x, FOOT - 5 - rand() * 4, 4 + rand() * 4, 5 + rand() * 4);
    else g.fillRect(x, FOOT - 6 - rand() * 12, 8 + rand() * 12, 6 + rand() * 10);
  }
}

// ---- clothes ----
// a rail tipped over against another with a mannequin lying in front of them and a heap of clothes
const clothesA = (g: G, rand: () => number) => {
  rail(g, rand, 300, 150, 40, FOOT, true);
  g.save();
  g.translate(60, FOOT);
  g.rotate(0.3);
  rail(g, rand, 0, 150, -215, 0, true);
  g.restore();
  for (let k = 0; k < 14; k++) {
    g.fillStyle = pick(rand, GARMENTS);
    oval(g, 180 + rand() * 150, FOOT - 8 - rand() * 14, 16 + rand() * 14, 7 + rand() * 7);
  }
  // the mannequin on its back: trunk, head, two legs, an arm
  g.fillStyle = MANNEQUIN;
  g.fillRect(340, FOOT - 24, 70, 20);
  oval(g, 330, FOOT - 14, 9, 11);
  g.fillRect(410, FOOT - 22, 80, 8);
  g.fillRect(410, FOOT - 11, 74, 8);
  g.fillRect(350, FOOT - 44, 42, 6);
};
// a bare rail, a stack of boxes of folded clothes, a mannequin tipped on its plate
const clothesB = (g: G, rand: () => number) => {
  rail(g, rand, 24, 170, 30, FOOT, false);
  for (let x = 40; x < 190; x += 24 + rand() * 6) {
    g.fillStyle = pick(rand, GARMENTS);
    g.fillRect(x, 40, 8, 60 + rand() * 40);
  }
  [4, 5, 3].forEach((m, c) => {
    let y = FOOT;
    for (let k = 0; k < m; k++) {
      const h = 36 + rand() * 10;
      y -= h;
      carton(g, rand, 230 + c * 74 + rand() * 4, y, 68, h - 2);
    }
  });
  mannequin(g, 470, FOOT, 210, 0.16);
  mannequin(g, 120, FOOT, 190, -0.1);
};

// ---- cafe ----
// stacks of ten chairs, a table upside down
const cafeA = (g: G) => {
  const colors = CAFE_CHAIRS;
  [
    [34, 11],
    [108, 9],
    [182, 7],
  ].forEach(([x, count], s) => {
    for (let k = 0; k < count!; k++) chairSide(g, x! + k * 3, FOOT - k * 12, colors[(s + k) % colors.length]!);
  });
  g.fillStyle = TABLE_WOOD;
  g.fillRect(300, FOOT - 12, 120, 12);
  g.fillRect(358, FOOT - 70, 6, 60);
  for (const [dx, tilt] of [
    [304, -0.2],
    [410, 0.2],
  ] as const) {
    g.save();
    g.translate(dx, FOOT - 10);
    g.rotate(tilt);
    g.fillRect(-3, -90, 6, 90);
    g.restore();
  }
  chairSide(g, 440, FOOT, colors[1]!);
};
// sacks of beans in a pyramid, bar stools stacked beside them
const cafeB = (g: G, rand: () => number) => {
  for (let row = 0; row < 4; row++)
    for (let c = 0; c < 5 - row; c++) {
      const x = 30 + row * 40 + c * 80 + rand() * 6,
        y = FOOT - (row + 1) * 46;
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.fillRect(x + 3, y + 3, 78, 46);
      g.fillStyle = pick(rand, SACK);
      g.fillRect(x, y + 4, 78, 42);
      oval(g, x + 8, y + 6, 14, 6);
      oval(g, x + 70, y + 6, 14, 6);
      g.fillStyle = 'rgba(60,40,20,.5)';
      g.fillRect(x + 22, y + 18, 34, 10);
    }
  for (const [x, tilt] of [
    [400, 0.08],
    [440, -0.06],
    [478, 0.14],
  ] as const) {
    g.save();
    g.translate(x, FOOT);
    g.rotate(tilt);
    g.fillStyle = LEGS;
    g.fillRect(-10, -150, 3, 150);
    g.fillRect(8, -150, 3, 150);
    g.fillRect(-14, -78, 28, 3);
    g.fillStyle = TABLE_WOOD;
    oval(g, 0, -154, 19, 5);
    g.restore();
  }
};

// ---- books ----
// towers of books, some leaning, and the books spilled between
const booksA = (g: G, rand: () => number) => {
  [
    [24, 14],
    [118, 10],
    [210, 15],
    [310, 9],
    [400, 12],
  ].forEach(([x, count]) => bookTower(g, rand, x!, FOOT, count!, 70 + rand() * 20));
  for (let k = 0; k < 16; k++) {
    g.save();
    g.translate(20 + rand() * (W - 60), FOOT - 6);
    g.rotate((rand() - 0.5) * 0.8);
    g.fillStyle = pick(rand, SPINES);
    g.fillRect(0, -12, 22 + rand() * 12, 12);
    g.fillStyle = PAPER;
    g.fillRect(2, -4, 18, 3);
    g.restore();
  }
};
// a bookcase tipping over onto crates of books, with the books out of it
const booksB = (g: G, rand: () => number) => {
  for (let k = 0; k < 3; k++) {
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(280 + 3, FOOT - (k + 1) * 50 + 3, 120, 50);
    g.fillStyle = SHELF_WOOD;
    g.fillRect(280, FOOT - (k + 1) * 50, 120, 50);
    g.fillStyle = SHELF_BACK;
    g.fillRect(286, FOOT - (k + 1) * 50 + 6, 108, 38);
    for (let bx = 290; bx < 390; bx += 8) {
      g.fillStyle = pick(rand, SPINES);
      g.fillRect(bx, FOOT - (k + 1) * 50 + 8, 6, 34);
    }
  }
  shelfLeaning(g, rand, 30, FOOT - 6, 200, 236, 0.28, 5, SPINES);
  bookTower(g, rand, 420, FOOT, 8, 70);
  for (let k = 0; k < 14; k++) {
    g.fillStyle = pick(rand, SPINES);
    g.fillRect(20 + rand() * (W - 60), FOOT - 5 - rand() * 8, 12 + rand() * 12, 6 + rand() * 6);
  }
};

// ---- glasses ----
// towers of display cases, a revolving stand of frames
const glassesA = (g: G, rand: () => number) => {
  for (let k = 0; k < 5; k++) glassCase(g, rand, 24 + (k % 2) * 6, FOOT - k * 38, 150, 38);
  for (let k = 0; k < 3; k++) glassCase(g, rand, 210 - (k % 2) * 4, FOOT - k * 38, 124, 38);
  g.fillStyle = STEEL;
  g.fillRect(398, 36, 5, FOOT - 36);
  g.fillRect(380, FOOT - 5, 42, 5);
  block(g, 372, 30, 60, 80, LEGS);
  g.strokeStyle = 'rgba(190,200,210,.55)';
  g.lineWidth = 1.2;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 2; c++) {
      g.beginPath();
      g.ellipse(386 + c * 28, 48 + r * 22, 5, 4, 0, 0, Math.PI * 2);
      g.ellipse(397 + c * 28, 48 + r * 22, 5, 4, 0, 0, Math.PI * 2);
      g.stroke();
    }
  glassCase(g, rand, 440, FOOT, 60, 36);
};
// small black cases in a mound, and a shop mirror leaning on it
const glassesB = (g: G, rand: () => number) => {
  for (let row = 0; row < 9; row++)
    for (let c = 0; c < 9 - row; c++) {
      const x = 16 + row * 19 + c * 38 + rand() * 3,
        y = FOOT - (row + 1) * 18;
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.fillRect(x + 2, y + 2, 36, 18);
      g.fillStyle = pick(rand, CASES);
      g.fillRect(x, y, 36, 17);
      g.fillStyle = 'rgba(255,240,210,.18)';
      g.fillRect(x, y, 36, 2);
      g.fillStyle = BRASS;
      g.fillRect(x + 15, y + 6, 6, 4);
    }
  g.save();
  g.translate(390, FOOT);
  g.rotate(0.12);
  g.fillStyle = CASE_WOOD;
  g.fillRect(0, -224, 96, 224);
  const glass = g.createLinearGradient(0, -216, 0, -8);
  glass.addColorStop(0, '#6f7f86');
  glass.addColorStop(1, '#3f4d52');
  g.fillStyle = glass;
  g.fillRect(7, -216, 82, 208);
  g.fillStyle = 'rgba(210,225,240,.18)';
  g.beginPath();
  g.moveTo(20, -216);
  g.lineTo(44, -216);
  g.lineTo(12, -8);
  g.lineTo(7, -8);
  g.fill();
  g.restore();
};

// ---- electronics ----
// empty boxes: a tall television's box leaning on towers of smaller ones
const electronicsA = (g: G, rand: () => number) => {
  g.save();
  g.translate(30, FOOT);
  g.rotate(0.1);
  block(g, 0, -226, 150, 226, BOX_WHITE);
  g.fillStyle = '#26303a';
  g.fillRect(12, -210, 126, 78);
  g.fillStyle = 'rgba(190,210,230,.2)';
  g.fillRect(12, -210, 40, 78);
  g.fillStyle = '#485868';
  g.fillRect(12, -110, 126, 14);
  g.fillStyle = LEGS;
  g.fillRect(12, -88, 70, 6);
  g.restore();
  [4, 5, 3, 4].forEach((m, c) => {
    let y = FOOT;
    for (let k = 0; k < m; k++) {
      const h = 36 + rand() * 10;
      y -= h;
      block(g, 214 + c * 72 + rand() * 4, y, 66, h - 2, pick(rand, BOX_GREY));
      g.fillStyle = pick(rand, ['#4a6a8a', '#8b7b3b', '#5a7a5a']);
      g.fillRect(222 + c * 72, y + 8, 30, 6);
    }
  });
};
// a stack of old televisions, a flat panel with a cracked screen leaning on it, and a tangle of cable
const electronicsB = (g: G, rand: () => number) => {
  oldTv(g, 20, FOOT, 150, 70);
  oldTv(g, 30, FOOT - 70, 130, 64);
  oldTv(g, 36, FOOT - 134, 112, 58);
  oldTv(g, 44, FOOT - 192, 90, 46);
  oldTv(g, 200, FOOT, 110, 62);
  oldTv(g, 208, FOOT - 62, 94, 54);
  g.save();
  g.translate(340, FOOT);
  g.rotate(0.14);
  screen(g, 0, -214, 150, 214);
  g.strokeStyle = 'rgba(200,210,225,.5)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(90, -208);
  g.lineTo(70, -150);
  g.lineTo(100, -110);
  g.lineTo(60, -40);
  g.moveTo(70, -150);
  g.lineTo(30, -130);
  g.stroke();
  g.restore();
  g.strokeStyle = '#1b1b1c';
  g.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    const y = FOOT - 4 - k * 3;
    g.moveTo(20 + rand() * 60, y);
    g.bezierCurveTo(140, y - 26, 260, y + 8, 330 + rand() * 120, y - 10);
    g.stroke();
  }
};

// ---- drugstore ----
// towers of baskets nested one in another, the last of the goods on the floor
const drugstoreA = (g: G, rand: () => number) => {
  [
    [24, 21, 92],
    [150, 17, 86],
    [262, 13, 82],
  ].forEach(([x, count, w], t) => {
    for (let k = 0; k < count!; k++)
      basket(g, x! + k * 0.6, FOOT - 22 - k * 9, w!, BASKET[(t + (k % 2)) % BASKET.length]!);
  });
  shelfLeaning(g, rand, 380, FOOT - 6, 100, 180, -0.2, 4, PRODUCT);
  spilled(g, rand, 20, 20, W - 40, PRODUCT);
};
// a shelving gondola fallen over its goods, cartons of stock beside it
const drugstoreB = (g: G, rand: () => number) => {
  shelfLeaning(g, rand, 150, FOOT - 6, 210, 230, 0.26, 5, PRODUCT);
  [3, 4].forEach((m, c) => {
    let y = FOOT;
    for (let k = 0; k < m; k++) {
      const h = 40 + rand() * 8;
      y -= h;
      carton(g, rand, 20 + c * 76 + rand() * 4, y, 70, h - 2);
    }
  });
  block(g, 430, FOOT - 70, 66, 70, BOX_WHITE);
  g.fillStyle = '#5f8a8c';
  g.fillRect(430, FOOT - 46, 66, 10);
  spilled(g, rand, 26, 20, W - 40, PRODUCT);
};

// the pictures by kind of shop and number (two each)
const SHOP_HEAPS: Record<number, ((g: G, rand: () => number) => void)[]> = {
  [SHOP_CLOTHES]: [clothesA, clothesB],
  [SHOP_CAFE]: [cafeA, cafeB],
  [SHOP_BOOKS]: [booksA, booksB],
  [SHOP_GLASSES]: [glassesA, glassesB],
  [SHOP_ELECTRONICS]: [electronicsA, electronicsB],
  [SHOP_DRUGSTORE]: [drugstoreA, drugstoreB],
};
// The heaps of each kind of shop's room, by the kind (the order of MALL_SHOP_NAMES; none for the food court)
export function mallShopHeaps(): THREE.CanvasTexture[][] {
  return Array.from({ length: SHOP_KINDS }, (_, kind) =>
    (SHOP_HEAPS[kind] ?? []).map((paint, variant) => {
      const rand = seeded(1500 + kind * 37 + variant * 11);
      return canvasTex(W, H, g => {
        paint(g, rand);
        soil(g, rand, W, H, H * 0.45);
      });
    }),
  );
}
