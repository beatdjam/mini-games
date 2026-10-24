import { HOSP_CALLING, HOSP_RECEPTION } from '../../../i18n/signs.ts';
import { oval, rowOf, smudge } from '../paint.ts';
import type { Paint } from '../paint.ts';
import {
  HAZARD_BLACK,
  HAZARD_YELLOW,
  KIND_LINEN,
  KIND_WAITING,
  LINEN_BLUE,
  LINEN_WHITE,
  PLATE_WHITE,
  STEEL,
  STEEL_DARK,
  box,
} from './shared.ts';
import { FRONT_TOP, WOOD, WOOD_DARK, doorLeaf, dot, inKind, pane, plateWords, shelving } from './kit.ts';
import type { G } from './kit.ts';
// The linen room's and the waiting hall's pictures (roomPics.ts puts them in the order of the kinds). Linen room: shelves
// of folded sheets and towels, a steel rack of boxes and tubs. Waiting hall: the reception counter under its sign, the
// board of called numbers over a row of chair backs, a television on its bracket over a magazine rack. And the fronts of
// both: the linen room's double door and its strip curtain, the waiting hall's glass doors and the shade drawn over its
// window.
const SHEETS = [LINEN_WHITE, LINEN_BLUE, '#a9c4ad', '#e8e4cd'];
const CARTON = '#b09970';
const TUB = '#6a8fa8';
const SEATS = ['#4f7a79', '#5b6f87', '#7a6a59']; // vinyl, three colours
const MAGAZINES = ['#b86a4b', '#5f8aa7', '#c8b25b', '#7a9a6b', '#a07aa1'];

// a stack of folded linen standing on a board at `base`: layers of one colour, each a little off from the last
function stack(g: G, rand: () => number, x: number, w: number, base: number, layers: number, color: string) {
  for (let l = 0; l < layers; l++) {
    const h = 3 + rand() * 1.5,
      off = (rand() - 0.5) * 3;
    g.fillStyle = color;
    g.fillRect(x + off, base - (l + 1) * 4.2, w, h);
    g.fillStyle = 'rgba(40,50,44,.25)';
    g.fillRect(x + off, base - (l + 1) * 4.2 + h - 1, w, 1);
  }
}

// ---- the linen room ----
// shelves of folded sheets and towels: stacks in white and pale blue and green, some tipping over, bare patches of board
const linenShelves: Paint = inKind(KIND_LINEN, (g, rand) => {
  shelving(g, 16, 224, 3.3, 0.2, 5, (board, level) => {
    for (let x = 22; x < 214;) {
      const w = 22 + rand() * 12;
      if (rand() < 0.15) {
        x += w; // bare board
        continue;
      }
      stack(g, rand, x, w, board - 1, 4 + Math.floor(rand() * 4), SHEETS[(level + Math.floor(rand() * 4)) % 4]!);
      x += w + 3;
    }
  });
});
// a steel rack of cartons and blue tubs with their lids, a laundry cart standing in front of it
const linenRack: Paint = inKind(KIND_LINEN, (g, rand) => {
  shelving(g, 20, 150, 3.2, 0.2, 4, board => {
    for (let x = 26; x < 160;) {
      const w = 22 + rand() * 14,
        h = 16 + rand() * 12,
        tub = rand() < 0.4;
      box(g, x, board - 1 - h, w, h, tub ? TUB : CARTON);
      g.fillStyle = tub ? 'rgba(226,236,240,.5)' : 'rgba(60,40,20,.3)';
      g.fillRect(x, board - 1 - h, w, tub ? 3 : h * 0.18);
      if (!tub && rand() < 0.5) {
        g.fillStyle = 'rgba(245,240,225,.8)';
        g.fillRect(x + 3, board - 1 - h * 0.6, w * 0.4, h * 0.3);
      }
      x += w + 3;
    }
  });
  // the cart: a wire basket on four small wheels, a bag of linen over its rim
  box(g, 180, rowOf(1.25), 60, rowOf(0.35) - rowOf(1.25), '#a4aea7');
  g.strokeStyle = 'rgba(40,50,44,.5)';
  g.lineWidth = 0.9;
  for (let cx = 184; cx < 238; cx += 6) {
    g.beginPath();
    g.moveTo(cx, rowOf(1.25));
    g.lineTo(cx, rowOf(0.35));
    g.stroke();
  }
  for (let cy = rowOf(1.25) + 6; cy < rowOf(0.35); cy += 6) {
    g.beginPath();
    g.moveTo(180, cy);
    g.lineTo(240, cy);
    g.stroke();
  }
  g.fillStyle = LINEN_WHITE;
  oval(g, 210, rowOf(1.3), 26, 10);
  g.fillStyle = STEEL_DARK;
  for (const wx of [186, 232]) dot(g, wx, rowOf(0.25), 3.5);
  smudge(g, 100 + rand() * 80, rowOf(0.5), 40, 8, '20,20,14', 0.18);
});

// ---- the waiting hall ----
// the reception counter: a wooden counter, the glass over it in a frame with a sliding pane, the sign hung over it, a tray
// of forms and a box of tissues on the counter
const waitingCounter: Paint = inKind(KIND_WAITING, (g, rand) => {
  box(g, 10, rowOf(1.1), 236, 8, WOOD);
  box(g, 14, rowOf(1.1) + 8, 228, rowOf(0.15) - rowOf(1.1) - 8, '#9fb7a6');
  g.fillStyle = 'rgba(30,40,32,.25)';
  for (let x = 14; x < 242; x += 38) g.fillRect(x, rowOf(1.1) + 8, 1.4, rowOf(0.15) - rowOf(1.1) - 8);
  pane(g, 14, rowOf(3.1), 228, rowOf(1.1) - rowOf(3.1), '#22302b');
  g.fillStyle = STEEL_DARK;
  for (const x of [90, 166]) g.fillRect(x, rowOf(3.1), 3, rowOf(1.1) - rowOf(3.1));
  g.fillStyle = 'rgba(20,26,22,.8)'; // the office behind the glass: a monitor and the edge of a shelf
  g.fillRect(36, rowOf(2.4), 30, rowOf(1.8) - rowOf(2.4));
  g.fillRect(180, rowOf(2.9), 50, 2);
  box(g, 84, rowOf(3.7), 88, rowOf(3.3) - rowOf(3.7), '#2c3a37');
  g.fillStyle = '#c9d3c0';
  plateWords(g, HOSP_RECEPTION, 128, rowOf(3.5), 17, 70);
  box(g, 30, rowOf(1.1) - 7, 30, 7, STEEL);
  g.fillStyle = PLATE_WHITE;
  g.fillRect(34, rowOf(1.1) - 11, 22, 5);
  box(g, 196, rowOf(1.1) - 12, 16, 12, '#c8c4a8');
  smudge(g, 60 + rand() * 120, rowOf(0.5), 40, 8, '20,20,14', 0.16);
});
// the board of called numbers, dark: the heading, the digits as dim ghosts of a seven-segment display; under it a row of
// waiting chairs seen from behind
const waitingBoard: Paint = inKind(KIND_WAITING, (g, rand) => {
  box(g, 44, rowOf(3.4), 168, rowOf(2.2) - rowOf(3.4), '#1c2422');
  g.fillStyle = '#6f5a34';
  plateWords(g, HOSP_CALLING, 128, rowOf(3.2), 12, 100);
  for (let d = 0; d < 6; d++) {
    const x = 58 + d * 25,
      top = rowOf(3.0);
    g.fillStyle = 'rgba(100,44,34,.35)';
    g.fillRect(x, top, 14, 2.6);
    g.fillRect(x, top + 9, 14, 2.6);
    g.fillRect(x, top + 18, 14, 2.6);
    g.fillRect(x, top, 2.6, 20);
    g.fillRect(x + 11.4, top, 2.6, 20);
    if (d === 2) {
      g.fillStyle = 'rgba(180,70,46,.7)'; // one digit still lit
      g.fillRect(x, top, 14, 2.6);
      g.fillRect(x + 11.4, top, 2.6, 11);
    }
  }
  SEATS.forEach((c, n) => {
    for (let k = 0; k < 2; k++) {
      const x = 22 + (n * 2 + k) * 38;
      box(g, x, rowOf(1.15), 32, rowOf(0.6) - rowOf(1.15), c);
      g.fillStyle = 'rgba(255,252,236,.14)';
      g.fillRect(x + 3, rowOf(1.15) + 3, 26, 3);
      g.fillStyle = STEEL_DARK;
      g.fillRect(x + 4, rowOf(0.6), 3, rowOf(0.12) - rowOf(0.6));
      g.fillRect(x + 25, rowOf(0.6), 3, rowOf(0.12) - rowOf(0.6));
    }
  });
  smudge(g, 60 + rand() * 120, rowOf(0.4), 40, 8, '20,20,14', 0.16);
});
// a television on a bracket high on the wall, the glass cracked, over a magazine rack: a wire rack with magazines in it
const waitingTv: Paint = inKind(KIND_WAITING, (g, rand) => {
  box(g, 76, rowOf(3.5), 104, rowOf(2.3) - rowOf(3.5), '#1c2422');
  g.fillStyle = '#0d1312';
  g.fillRect(80, rowOf(3.45), 96, rowOf(2.35) - rowOf(3.45));
  g.strokeStyle = 'rgba(190,206,200,.4)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(110, rowOf(3.45));
  g.lineTo(122, rowOf(3.0));
  g.lineTo(112, rowOf(2.7));
  g.lineTo(130, rowOf(2.35));
  g.moveTo(122, rowOf(3.0));
  g.lineTo(150, rowOf(2.8));
  g.stroke();
  g.fillStyle = STEEL_DARK;
  g.fillRect(124, rowOf(2.3), 8, rowOf(2.0) - rowOf(2.3));
  g.fillRect(100, rowOf(2.0), 56, 3);
  // the rack
  box(g, 28, rowOf(1.5), 70, rowOf(0.2) - rowOf(1.5), '#7a8a83');
  for (let r = 0; r < 3; r++) {
    for (let m = 0; m < 6; m++) {
      g.fillStyle = MAGAZINES[(r + m) % MAGAZINES.length]!;
      g.fillRect(32 + m * 11, rowOf(1.4) + r * 22, 9, 16);
      g.fillStyle = 'rgba(255,252,236,.4)';
      g.fillRect(34 + m * 11, rowOf(1.4) + r * 22 + 3, 5, 3);
    }
    g.fillStyle = STEEL;
    g.fillRect(28, rowOf(1.4) + r * 22 + 17, 70, 2);
  }
  // a plant that has died, in its pot
  g.fillStyle = WOOD_DARK;
  g.fillRect(170, rowOf(0.62), 26, rowOf(0.12) - rowOf(0.62));
  g.strokeStyle = '#6a5a3b';
  g.lineWidth = 2;
  for (const lean of [-0.4, 0, 0.35]) {
    g.beginPath();
    g.moveTo(183, rowOf(0.62));
    g.lineTo(183 + lean * 40, rowOf(1.9));
    g.stroke();
  }
  smudge(g, 60 + rand() * 120, rowOf(0.4), 40, 8, '20,20,14', 0.16);
});

// ---- the fronts ----
// the linen room's steel double door: two grey-green leaves with a wheel guard along their foot, a band of yellow and
// black at the floor, a bumper rail
const linenDoor: Paint = inKind(KIND_LINEN, (g, rand) => {
  for (const x of [64, 130]) {
    doorLeaf(g, rand, x, 62, FRONT_TOP - 0.2, '#8f9b94');
    g.fillStyle = 'rgba(30,40,34,.3)';
    g.fillRect(x + 6, rowOf(3.1), 50, 1.4);
    g.fillRect(x + 6, rowOf(1.9), 50, 1.4);
    g.fillStyle = STEEL;
    g.fillRect(x + 4, rowOf(1.0), 54, 5);
  }
  g.fillStyle = HAZARD_BLACK;
  g.fillRect(56, rowOf(0.12) - 4, 146, 4);
  g.fillStyle = HAZARD_YELLOW;
  for (let sx = 56; sx < 202; sx += 10) g.fillRect(sx, rowOf(0.12) - 4, 5, 4);
});
// the strip curtain of a store: plastic strips hanging from a rail over the way in, pale and a little yellowed, the dark
// of the room behind them, a yellow line on the floor
const linenStrips: Paint = inKind(KIND_LINEN, (g, rand) => {
  const x = 60,
    w = 136,
    top = rowOf(3.2),
    foot = rowOf(0.12);
  box(g, x - 6, top - 6, w + 12, foot - top + 6, STEEL_DARK);
  g.fillStyle = '#0f1816';
  g.fillRect(x, top, w, foot - top);
  for (let sx = x; sx < x + w; sx += 12) {
    const gone = rand() < 0.1;
    g.fillStyle = gone ? 'rgba(0,0,0,0)' : 'rgba(206,214,196,.5)';
    g.fillRect(sx + 0.5, top, 10.5, gone ? 0 : foot - top - 6 - rand() * 10);
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.fillRect(sx + 0.5, top, 2, gone ? 0 : foot - top - 14);
  }
  g.fillStyle = STEEL;
  g.fillRect(x - 6, top - 12, w + 12, 6);
  g.fillStyle = HAZARD_YELLOW;
  g.fillRect(x - 10, foot - 3, w + 20, 3);
});
// the waiting hall's glass doors: a pair of sliding leaves and a fixed pane at each side in a steel frame, a frosted band
// at the height of the eyes, the track along the floor
const waitingGlass: Paint = inKind(KIND_WAITING, (g, rand) => {
  const x = 36,
    w = 184,
    top = rowOf(3.4),
    foot = rowOf(0.12);
  box(g, x - 6, top - 6, w + 12, foot - top + 6, STEEL_DARK);
  g.fillStyle = '#1f2b29';
  g.fillRect(x, top, w, foot - top);
  g.fillStyle = 'rgba(210,226,222,.1)';
  g.beginPath();
  g.moveTo(x, top);
  g.lineTo(x + 60, top);
  g.lineTo(x + 18, foot);
  g.lineTo(x, foot);
  g.fill();
  g.fillStyle = 'rgba(214,220,206,.3)';
  g.fillRect(x, rowOf(1.55), w, rowOf(1.1) - rowOf(1.55));
  g.fillStyle = STEEL;
  for (const gx of [x + 38, x + w / 2 - 1.5, x + w - 38]) g.fillRect(gx, top, 3, foot - top);
  g.fillStyle = HAZARD_YELLOW;
  g.fillRect(x + w / 2 - 12, rowOf(1.3), 24, 3);
  smudge(g, 100 + rand() * 60, rowOf(0.4), 50, 8, '20,20,14', 0.18);
});
// a window onto the hall with the roller shade drawn down nearly to the sill: a cream shade with a bar along its foot, a
// handwritten sheet taped to the glass, a counter ledge under it
const waitingShade: Paint = inKind(KIND_WAITING, (g, rand) => {
  const x = 38,
    w = 180,
    top = rowOf(3.3),
    sill = rowOf(1.3);
  box(g, x - 6, top - 6, w + 12, sill - top + 6, STEEL_DARK);
  g.fillStyle = '#26332f';
  g.fillRect(x, top, w, sill - top);
  g.fillStyle = '#d2cba8';
  g.fillRect(x, top, w, (sill - top) * 0.86);
  for (let sx = x + 10; sx < x + w; sx += 24) {
    g.fillStyle = 'rgba(80,70,40,.12)';
    g.fillRect(sx, top, 1.4, (sill - top) * 0.86);
  }
  g.fillStyle = WOOD_DARK;
  g.fillRect(x, top + (sill - top) * 0.86 - 4, w, 5);
  g.fillStyle = STEEL;
  dot(g, x + w / 2, top + (sill - top) * 0.86 + 4, 3);
  g.save();
  g.translate(x + w * 0.7, top + 30);
  g.rotate(-0.04);
  g.fillStyle = PLATE_WHITE;
  g.fillRect(-20, -14, 40, 34);
  g.fillStyle = 'rgba(60,40,30,.55)';
  for (let ly = -9; ly < 14; ly += 5) g.fillRect(-15, ly, 24 + rand() * 8, 1.4);
  g.restore();
  box(g, x - 10, sill, w + 20, 7, WOOD);
  smudge(g, 100 + rand() * 60, rowOf(0.5), 50, 8, '20,20,14', 0.16);
});

export const LINEN_PICS: Paint[] = [linenShelves, linenRack];
export const LINEN_FRONTS: Paint[] = [linenDoor, linenStrips];
export const WAITING_PICS: Paint[] = [waitingCounter, waitingBoard, waitingTv];
export const WAITING_FRONTS: Paint[] = [waitingGlass, waitingShade];
