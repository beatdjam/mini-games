import type * as THREE from 'three';
import { canvasTex, oval } from '../paint.ts';
import { block, pick, seeded, soil } from '../cutoutTools.ts';
import type { G } from '../cutoutTools.ts';
import {
  HOSP_KINDS,
  KIND_EXAM,
  KIND_LAB,
  KIND_LINEN,
  KIND_PHARMACY,
  KIND_WAITING,
  KIND_WARD,
  LINEN_BLUE,
  LINEN_WHITE,
  PLATE_WHITE,
  STEEL,
  STEEL_DARK,
} from './shared.ts';
import { bed, ivStand, tipped, trolley, wheelchair } from './objects.ts';
// What was left on the floor of the hospital's rooms, a kind of room at a time (dress.ts WallKit `heaps.shops`): the same
// size as the heaps of the corridors (3.5 m by 1.75 m, piled up to the chest), but the room's own things: in a ward a bed
// with a drip stand and a bedside table on its side; in a consulting room a stool, paper rolls and boxes of files; in an
// examination room lead aprons, a rack fallen and equipment cases; in the pharmacy a shelf fallen with its boxes spilled; in
// the linen room carts of sheets and stacked tubs; in the waiting hall chairs tipped over and a rack of magazines. Two
// pictures to a kind. Nothing at the foot of a wall is a bright red (it would be taken for a hazard floor).
const W = 512,
  H = 256,
  FOOT = H - 6; // the floor in the picture (px)
const PRODUCT = ['#d8d6c9', '#b4c6cd', '#c8d3b9', '#d0cab5', '#aebfb6', '#c9a98a'];
const SEAT_VINYL = ['#4f7a78', '#5b6f86', '#7a6a58'];
const MAGAZINES = ['#b86a4a', '#5f8aa6', '#c8b25a', '#7a9a6a', '#a07aa0'];
const TUB = '#56788e';
const APRON = ['#6e8a89', '#7a8f9b', '#6c7d6e'];
const CASE = '#2f3a39';

// a waiting chair seen from the side: a seat, a back, two steel legs
function chair(g: G, x: number, foot: number, color: string) {
  g.fillStyle = STEEL_DARK;
  g.fillRect(x + 4, foot - 40, 4, 40);
  g.fillRect(x + 36, foot - 40, 4, 40);
  block(g, x, foot - 46, 46, 8, color);
  block(g, x - 2, foot - 100, 8, 56, color);
}
// boxes of medicine in a spill: white and pale blue and green boxes at all angles
function spill(g: G, rand: () => number, count: number, from: number, to: number) {
  for (let k = 0; k < count; k++) {
    g.save();
    g.translate(from + rand() * (to - from), FOOT - 4 - rand() * 8);
    g.rotate((rand() - 0.5) * 0.9);
    g.fillStyle = pick(rand, PRODUCT);
    g.fillRect(0, -8, 12 + rand() * 12, 8 + rand() * 6);
    g.fillStyle = 'rgba(40,50,44,.3)';
    g.fillRect(2, -5, 8, 1.4);
    g.restore();
  }
}
// a steel shelf `w` by `h` standing at `x`, tipped to lean by `tilt`: the frame, the boards, boxes on them
function shelf(g: G, rand: () => number, x: number, w: number, h: number, tilt: number, boards: number) {
  tipped(g, x, FOOT, tilt, () => {
    g.fillStyle = 'rgba(14,18,14,.4)';
    g.fillRect(x + 4, FOOT - h + 3, w, h);
    g.fillStyle = STEEL_DARK;
    g.fillRect(x, FOOT - h, w, h);
    g.fillStyle = '#2b3430';
    g.fillRect(x + 5, FOOT - h + 5, w - 10, h - 8);
    const step = (h - 10) / boards;
    for (let s = 0; s < boards; s++) {
      const y = FOOT - h + 6 + step * (s + 1);
      g.fillStyle = STEEL;
      g.fillRect(x + 3, y - 3, w - 6, 4);
      for (let bx = x + 10; bx < x + w - 18; bx += 12 + rand() * 8)
        if (rand() < 0.7) {
          g.fillStyle = pick(rand, PRODUCT);
          g.fillRect(bx, y - 4 - step * 0.45, 9 + rand() * 6, step * 0.45);
        }
    }
  });
}

const wardA = (g: G) => {
  bed(g, 24, FOOT, 330, 0, '#a9c4aa');
  ivStand(g, 380, FOOT, 200, 0.08);
  block(g, 430, FOOT - 70, 56, 70, '#c2b99a');
  g.fillStyle = 'rgba(40,36,24,.4)';
  g.fillRect(430, FOOT - 36, 56, 2);
};
const wardB = (g: G, rand: () => number) => {
  tipped(g, 60, FOOT, -1.5, () => block(g, 60, FOOT - 70, 56, 70, '#c2b99a'));
  g.fillStyle = LINEN_BLUE;
  g.beginPath();
  g.moveTo(130, FOOT);
  g.quadraticCurveTo(190, FOOT - 70, 270, FOOT - 24);
  g.lineTo(330, FOOT - 6);
  g.lineTo(330, FOOT);
  g.fill();
  g.fillStyle = LINEN_WHITE;
  oval(g, 200, FOOT - 22, 40, 14);
  oval(g, 250, FOOT - 14, 26, 9);
  ivStand(g, 360, FOOT, 190, -0.95);
  ivStand(g, 420, FOOT, 205, 0.05);
  spill(g, rand, 5, 120, 460);
};
const examA = (g: G, rand: () => number) => {
  for (let k = 0; k < 3; k++) {
    block(g, 30 + k * 4, FOOT - 46 * (k + 1), 100 - k * 6, 44, '#a98a50');
    g.fillStyle = 'rgba(60,40,20,.3)';
    g.fillRect(70 + k * 4, FOOT - 46 * (k + 1), 8, 44);
  }
  g.fillStyle = STEEL_DARK; // a stool tipped on its side
  tipped(g, 190, FOOT, -1.4, () => {
    block(g, 170, FOOT - 70, 44, 8, '#4c5a55');
    g.fillRect(190, FOOT - 62, 5, 62);
  });
  for (let k = 0; k < 4; k++) {
    g.fillStyle = k % 2 ? PLATE_WHITE : '#e6e3d2';
    g.fillRect(300 + k * 30, FOOT - 36, 26, 36);
    g.fillStyle = 'rgba(0,0,0,.18)';
    oval(g, 313 + k * 30, FOOT - 18, 5, 5);
  }
  spill(g, rand, 6, 220, 480);
};
const examB = (g: G, rand: () => number) => {
  g.fillStyle = '#3a4a47'; // a desk chair on its back
  tipped(g, 120, FOOT, 1.45, () => {
    block(g, 100, FOOT - 70, 56, 10, '#3a4a47');
    block(g, 94, FOOT - 140, 10, 76, '#3a4a47');
    g.fillStyle = STEEL_DARK;
    g.fillRect(124, FOOT - 60, 5, 40);
    g.fillRect(104, FOOT - 22, 46, 4);
  });
  block(g, 250, FOOT - 22, 120, 22, '#1c2421'); // a monitor face down on the floor
  g.fillStyle = 'rgba(190,210,204,.12)';
  g.fillRect(256, FOOT - 18, 40, 12);
  for (let k = 0; k < 14; k++) {
    g.save();
    g.translate(30 + rand() * 440, FOOT - 3 - rand() * 6);
    g.rotate(rand() * 0.6 - 0.3);
    g.fillStyle = pick(rand, PRODUCT);
    g.fillRect(0, 0, 20 + rand() * 10, 3 + rand() * 3);
    g.restore();
  }
};
const labA = (g: G, rand: () => number) => {
  APRON.forEach((c, k) => {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(50 + k * 50, FOOT);
    g.quadraticCurveTo(60 + k * 50, FOOT - 36 - k * 10, 100 + k * 50, FOOT - 6);
    g.lineTo(110 + k * 50, FOOT);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.fillRect(60 + k * 50, FOOT - 22, 24, 3);
  });
  tipped(g, 260, FOOT, 1.2, () => {
    g.fillStyle = STEEL;
    g.fillRect(220, FOOT - 150, 4, 150);
    g.fillRect(280, FOOT - 150, 4, 150);
    g.fillRect(220, FOOT - 150, 64, 4);
  });
  block(g, 380, FOOT - 54, 90, 54, CASE);
  g.fillStyle = STEEL;
  g.fillRect(414, FOOT - 54, 24, 6);
  block(g, 396, FOOT - 94, 70, 40, CASE);
  spill(g, rand, 3, 300, 400);
};
const labB = (g: G) => {
  for (let k = 0; k < 3; k++) {
    block(g, 30 + k * 80, FOOT - 50 - (k % 2) * 20, 76, 50 + (k % 2) * 20, CASE);
    g.fillStyle = STEEL;
    g.fillRect(58 + k * 80, FOOT - 50 - (k % 2) * 20, 20, 5);
    g.fillStyle = PLATE_WHITE;
    g.fillRect(40 + k * 80, FOOT - 30, 22, 12);
  }
  trolley(g, 300, FOOT, 150, 130, 0.0);
  block(g, 310, FOOT - 100, 60, 36, '#1c2421');
  g.fillStyle = '#d6a14f';
  g.fillRect(318, FOOT - 92, 20, 6);
};
const pharmacyA = (g: G, rand: () => number) => {
  shelf(g, rand, 40, 170, 220, 0.34, 5);
  shelf(g, rand, 380, 100, 170, -0.2, 4);
  spill(g, rand, 24, 20, 480);
};
const pharmacyB = (g: G, rand: () => number) => {
  [2, 4, 5, 3, 2].forEach((m, c) => {
    for (let k = 0; k < m; k++) {
      block(g, 20 + c * 92, FOOT - (k + 1) * 36, 84, 34, pick(rand, PRODUCT));
      g.fillStyle = 'rgba(40,50,44,.3)';
      g.fillRect(28 + c * 92, FOOT - (k + 1) * 36 + 12, 40, 1.6);
      g.fillStyle = 'rgba(70,100,150,.45)';
      g.fillRect(28 + c * 92, FOOT - (k + 1) * 36 + 4, 24, 5);
    }
  });
  trolley(g, 8, FOOT, 70, 60, 0);
  spill(g, rand, 8, 120, 480);
};
const linenA = (g: G, rand: () => number) => {
  block(g, 40, FOOT - 100, 150, 100, '#a4aea6');
  g.strokeStyle = 'rgba(40,50,44,.5)';
  g.lineWidth = 1;
  for (let x = 46; x < 190; x += 8) {
    g.beginPath();
    g.moveTo(x, FOOT - 100);
    g.lineTo(x, FOOT);
    g.stroke();
  }
  [LINEN_WHITE, LINEN_BLUE, '#a9c4aa', LINEN_WHITE].forEach((color, k) => {
    g.fillStyle = color;
    oval(g, 70 + k * 36, FOOT - 112 - (k % 2) * 8, 32, 18);
  });
  g.fillStyle = STEEL_DARK;
  for (const wx of [56, 174]) oval(g, wx, FOOT - 5, 6, 6);
  for (let k = 0; k < 14; k++) {
    g.fillStyle = pick(rand, [LINEN_WHITE, LINEN_BLUE]);
    g.fillRect(230 + rand() * 250, FOOT - 5 - rand() * 12, 16 + rand() * 14, 5 + rand() * 4);
  }
};
const linenB = (g: G) => {
  for (let c = 0; c < 4; c++)
    for (let k = 0; k <= (c % 3) + 1; k++) {
      block(g, 20 + c * 118, FOOT - (k + 1) * 44, 108, 42, TUB);
      g.fillStyle = 'rgba(226,236,240,.45)';
      g.fillRect(20 + c * 118, FOOT - (k + 1) * 44, 108, 6);
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.fillRect(30 + c * 118, FOOT - (k + 1) * 44 + 16, 88, 3);
    }
};
const waitingA = (g: G, rand: () => number) => {
  for (let k = 0; k < 4; k++) chair(g, 30 + k * 6, FOOT - k * 18 - 2, pick(rand, SEAT_VINYL));
  tipped(g, 250, FOOT, -1.5, () => chair(g, 250, FOOT, SEAT_VINYL[0]!));
  tipped(g, 350, FOOT, 1.35, () => chair(g, 350, FOOT, SEAT_VINYL[1]!));
  chair(g, 430, FOOT, SEAT_VINYL[2]!);
};
const waitingB = (g: G, rand: () => number) => {
  tipped(g, 60, FOOT, 1.3, () => {
    block(g, 40, FOOT - 150, 70, 150, '#7a8a82');
  });
  for (let k = 0; k < 28; k++) {
    g.save();
    g.translate(60 + rand() * 400, FOOT - 3 - rand() * 8);
    g.rotate(rand() * 0.9 - 0.45);
    g.fillStyle = pick(rand, MAGAZINES);
    g.fillRect(0, 0, 22 + rand() * 8, 4 + rand() * 3);
    g.restore();
  }
  g.fillStyle = '#8b7550'; // a pot, the plant dead in it
  g.fillRect(380, FOOT - 46, 44, 46);
  g.strokeStyle = '#6a5a3a';
  g.lineWidth = 3;
  for (const lean of [-0.5, 0, 0.45]) {
    g.beginPath();
    g.moveTo(402, FOOT - 46);
    g.lineTo(402 + lean * 90, FOOT - 150);
    g.stroke();
  }
  wheelchair(g, 150, FOOT, 150, 0.0);
};

const KIND_HEAPS: Record<number, ((g: G, rand: () => number) => void)[]> = {
  [KIND_WARD]: [wardA, wardB],
  [KIND_EXAM]: [examA, examB],
  [KIND_LAB]: [labA, labB],
  [KIND_PHARMACY]: [pharmacyA, pharmacyB],
  [KIND_LINEN]: [linenA, linenB],
  [KIND_WAITING]: [waitingA, waitingB],
};
// The heaps of each kind of room, by the kind (the order of HOSP_DEPARTMENTS)
export function hospKindHeaps(): THREE.CanvasTexture[][] {
  return Array.from({ length: HOSP_KINDS }, (_, kind) =>
    (KIND_HEAPS[kind] ?? []).map((paint, variant) => {
      const rand = seeded(2700 + kind * 37 + variant * 11);
      return canvasTex(W, H, g => {
        paint(g, rand);
        soil(g, rand, W, H, H * 0.45);
      });
    }),
  );
}
