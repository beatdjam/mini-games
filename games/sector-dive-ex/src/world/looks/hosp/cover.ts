import * as THREE from 'three';
import { T, tileCenter } from '@engine/world/tiles.ts';
import { groundOf } from '../../meshParts.ts';
import type { FloorPlan } from '../../building.ts';
import { roomKindOf } from '../common.ts';
import { drawParts, piece } from '../mall/cover.ts';
import type { Parts } from '../mall/cover.ts';
import type { Island } from '../mall/islands.ts';
import { KIND_EXAM, KIND_LAB, KIND_LINEN, KIND_PHARMACY, KIND_WAITING, KIND_WARD } from './shared.ts';
// The hospital's waist-high cover, drawn as the things that stand in a hospital (Look.cover): beds with a blanket on them,
// a stretcher and wheelchairs, service wagons, benches for the waiting, and for each kind of room its own (a couch and a
// stool in a consulting room, a scanner's casing and a table in an examination room, a counter of medicine boxes in the
// pharmacy, carts of sheets in the linen room). Each fills about the tile it stands on, and its top is the height of the
// cover (a headboard, a drip stand or a back may stand a little over it); it is only what one sees: the tile world's cover
// (its shape for bullets and for walking, its height) is as it was. The big rooms' islands (islands.ts) are one piece of
// the room's kind over their whole 1 x 2 or 2 x 2 tiles.
// ---- tuning numbers used only here ----
const ISLAND_PAD = 0.3; // an island's piece stops this far short of the edge of its tiles on every side (m)
const FRAME = 0x6c7871; // a bed's or a stretcher's steel
const FRAME_DARK = 0x3a4440;
const MATTRESS = [0x5f8388, 0x6c7f9a, 0x7d8d6e]; // vinyl
const BLANKET = [0x9db8a3, 0xa9bfd0, 0xcfd2bc, 0x9cb4a9];
const PILLOW = 0xdedfd2;
const WOOD = [0xa89472, 0x9a8766];
const WOOD_DEEP = 0x7a6a50;
const VINYL_SEAT = [0x547f7c, 0x5f7388, 0x82705c];
const LAMINATE = 0xcbcdbd; // a trolley's top, a counter's front
const TOP_PALE = 0xe0ddc9; // a counter's top, a scanner's casing
const SCANNER = 0xd2d6c8;
const BORE = 0x1c2825;
const MEDICINE = [0xd8d6c8, 0xb4c6cc, 0xc8d3b8, 0xd0cab4];
const SHEET = [0xdcdccf, 0x9cb7c7, 0xa9c4a8];
const TUB = 0x56788c;
const TILE_GREEN = 0x7e9c8c; // a planter's tiles
const SOIL = 0x2b221a;
const TWIG = 0x5f4c35;
const WHEEL = 0x23282a;
const CHART = 0xd8d6c4;
const CASE_BOX = 0x2f3a38; // an equipment case

type Piece = ReturnType<typeof piece>;
// a bed along z (head toward -z) at x: the frame on its casters, the mattress, the blanket over the lower part, the pillow,
// a headboard and a lower footboard, steel side rails
function hospitalBed(p: Piece, x: number, h: number, blanket: number, z = 0) {
  p.box(FRAME_DARK, x, z, 0.08, 0.9, 0.2, 2.0);
  for (const cz of [-0.8, 0.8]) for (const cx of [-0.38, 0.38]) p.box(WHEEL, x + cx, z + cz, 0, 0.1, 0.1, 0.1);
  p.box(MATTRESS[h % MATTRESS.length]!, x, z, 0.28, 0.96, 0.26, 2.04);
  p.box(BLANKET[blanket % BLANKET.length]!, x, z + 0.3, 0.54, 0.98, 0.1, 1.3);
  p.box(PILLOW, x, z - 0.72, 0.54, 0.6, 0.12, 0.36);
  p.box(WOOD[h % WOOD.length]!, x, z - 1.05, 0.12, 1.0, 1.08, 0.07);
  p.box(WOOD[h % WOOD.length]!, x, z + 1.05, 0.12, 1.0, 0.7, 0.07);
  for (const sx of [-0.5, 0.5]) p.box(FRAME, x + sx, z, 0.54, 0.04, 0.5, 1.2);
}
// a bedside cabinet: a pale box with a drawer line and a handle
function cabinet(p: Piece, x: number, z: number) {
  p.box(LAMINATE, x, z, 0, 0.5, 0.78, 0.5);
  p.box(FRAME_DARK, x, z + 0.26, 0.4, 0.2, 0.03, 0.03);
  p.box(TOP_PALE, x, z, 0.78, 0.54, 0.04, 0.54);
}
// a stretcher along x at depth z: casters, a chassis, the mattress, a sheet crumpled on it, the raised backrest, a rail
function stretcherPiece(p: Piece, z: number, h: number) {
  p.box(FRAME_DARK, 0, z, 0.1, 2.0, 0.12, 0.5);
  for (const cx of [-0.85, 0.85]) for (const cz of [-0.2, 0.2]) p.box(WHEEL, cx, z + cz, 0, 0.12, 0.12, 0.12);
  p.box(FRAME, 0, z, 0.22, 2.1, 0.08, 0.62);
  p.box(MATTRESS[h % MATTRESS.length]!, 0, z, 0.3, 2.1, 0.2, 0.7);
  p.box(SHEET[0]!, 0.2, z, 0.5, 1.5, 0.1, 0.68);
  p.box(MATTRESS[h % MATTRESS.length]!, -0.75, z, 0.5, 0.6, 0.45, 0.7);
  p.box(FRAME, 0, z + 0.36, 0.5, 2.0, 0.04, 0.03);
  p.box(FRAME, 0.95, z + 0.2, 0.5, 0.04, 0.75, 0.04);
}
// a wheelchair facing +x at (x, z): the seat, the back, the arm, two big wheels, the foot rest
function wheelchairPiece(p: Piece, x: number, z: number, seat: number) {
  p.box(seat, x, z, 0.45, 0.46, 0.08, 0.46);
  p.box(seat, x - 0.22, z, 0.5, 0.06, 0.55, 0.46);
  p.box(FRAME, x, z - 0.26, 0.55, 0.4, 0.04, 0.04);
  p.box(FRAME, x, z + 0.26, 0.55, 0.4, 0.04, 0.04);
  for (const cz of [-0.29, 0.29]) p.box(WHEEL, x - 0.08, z + cz, 0.05, 0.52, 0.52, 0.05);
  p.box(FRAME, x + 0.34, z, 0.12, 0.2, 0.04, 0.4);
  p.box(FRAME, x - 0.28, z, 1.0, 0.04, 0.04, 0.5);
}
// a service wagon along x at depth z, d deep: two shelves on posts, casters, a tray of things on the top
function wagonPiece(p: Piece, h: number, L: number, z: number, d: number) {
  p.box(FRAME, 0, z, 0.12, L, 0.05, d);
  p.box(LAMINATE, 0, z, 0.6, L, 0.06, d);
  for (const sx of [-L / 2 + 0.06, L / 2 - 0.06])
    for (const sz of [-d / 2 + 0.06, d / 2 - 0.06]) p.box(FRAME, sx, z + sz, 0.05, 0.05, 0.9, 0.05);
  const n = Math.floor((L - 0.4) / 0.5);
  for (let k = 0; k < n; k++)
    p.box(
      MEDICINE[(h + k) % MEDICINE.length]!,
      (k - (n - 1) / 2) * 0.5,
      z + (k % 2 ? 0.12 : -0.12),
      0.66,
      0.3,
      0.14 + (k % 3) * 0.06,
      0.26,
    );
}
// a bench along x at depth z (its back toward -z when `back` is -1): a vinyl seat on steel legs, a back, arms at the ends
function bench(p: Piece, color: number, L: number, z: number, back: 1 | -1) {
  p.box(color, 0, z, 0.4, L, 0.1, 0.55);
  p.box(color, 0, z - back * 0.25, 0.5, L, 0.55, 0.08);
  for (const x of [-L / 2 + 0.1, 0, L / 2 - 0.1]) p.box(FRAME_DARK, x, z, 0, 0.06, 0.4, 0.5);
  for (const x of [-L / 2 + 0.03, L / 2 - 0.03]) p.box(FRAME, x, z, 0.5, 0.06, 0.18, 0.5);
}
// a counter along x at depth z: a pale front, a top that sticks out, medicine boxes in rows on it
function counter(p: Piece, h: number, L: number, z: number, d: number) {
  p.box(LAMINATE, 0, z, 0, L, 0.9, d);
  p.box(TOP_PALE, 0, z, 0.9, L + 0.1, 0.06, d + 0.1);
  const n = Math.floor((L - 0.4) / 0.4);
  for (let k = 0; k < n; k++)
    p.box(MEDICINE[(h + k) % MEDICINE.length]!, (k - (n - 1) / 2) * 0.4, z, 0.96, 0.26, 0.12 + (k % 3) * 0.06, d - 0.2);
}
// a linen cart along x at depth z: a wire basket on casters, heaped with sheets
function linenCart(p: Piece, h: number, x: number, z: number) {
  p.box(FRAME, x, z, 0.1, 1.3, 0.55, 0.85);
  p.box(WHEEL, x - 0.5, z - 0.3, 0, 0.1, 0.1, 0.1);
  p.box(WHEEL, x + 0.5, z + 0.3, 0, 0.1, 0.1, 0.1);
  for (let k = 0; k < 3; k++)
    p.box(SHEET[(h + k) % SHEET.length]!, x + (k - 1) * 0.38, z, 0.65, 0.34, 0.32 + (k % 2) * 0.1, 0.7);
}

const MAKERS_DEFAULT: ((p: Piece, h: number) => void)[] = [
  // two beds side by side
  (p, h) => {
    hospitalBed(p, -0.95, h, h);
    hospitalBed(p, 0.95, h + 1, h + 1);
    cabinet(p, 0, -1.2);
  },
  // a stretcher and two wheelchairs
  (p, h) => {
    stretcherPiece(p, -0.9, h);
    wheelchairPiece(p, -0.4, 0.9, VINYL_SEAT[h % 3]!);
    wheelchairPiece(p, 0.7, 0.9, VINYL_SEAT[(h + 1) % 3]!);
  },
  // two wagons, trays of things on them
  (p, h) => {
    for (const z of [-1.0, 1.0]) wagonPiece(p, h + (z > 0 ? 3 : 0), 3.2, z, 1.2);
  },
  // a bed in the middle of the tile, a drip stand on each side of it
  (p, h) => {
    hospitalBed(p, 0, h, h + 2);
    for (const x of [-1.5, 1.5]) {
      p.box(FRAME, x, 0.4, 0, 0.05, 1.5, 0.05);
      p.box(FRAME_DARK, x, 0.4, 0, 0.4, 0.04, 0.4);
      p.box(0xb8ced6, x + 0.1, 0.4, 1.2, 0.12, 0.28, 0.06);
    }
  },
  // two benches back to back with a low table between, magazines on it
  (p, h) => {
    for (const z of [-1.1, 1.1]) bench(p, VINYL_SEAT[(h + (z > 0 ? 1 : 0)) % 3]!, 3.2, z, z > 0 ? 1 : -1);
    p.box(WOOD_DEEP, 0, 0, 0, 1.4, 0.4, 0.7);
    p.box(CHART, 0, 0, 0.4, 0.6, 0.04, 0.4);
  },
];
const MAKERS_BY_KIND: Record<number, ((p: Piece, h: number) => void)[]> = {
  [KIND_WARD]: [
    // beds in a pair, a cabinet between them
    (p, h) => {
      hospitalBed(p, -1.0, h, h);
      hospitalBed(p, 1.0, h + 1, h + 2);
      cabinet(p, 0, -1.3);
    },
    // one bed and its cabinet, a drip stand and a screen on its far side
    (p, h) => {
      hospitalBed(p, -0.5, h, h + 3);
      cabinet(p, 0.4, -1.2);
      p.box(FRAME, 1.3, 0.2, 0, 0.05, 1.5, 0.05);
      p.box(0xb8ced6, 1.4, 0.2, 1.2, 0.12, 0.28, 0.06);
      p.box(BLANKET[h % BLANKET.length]!, 1.5, -0.5, 0, 0.06, 1.2, 1.6);
    },
    // a bed with the blanket thrown back, a wheelchair beside it
    (p, h) => {
      hospitalBed(p, -0.8, h, h + 1);
      wheelchairPiece(p, 1.0, 0.4, VINYL_SEAT[h % 3]!);
    },
  ],
  [KIND_EXAM]: [
    // a couch with a paper sheet and a stool at its side
    (p, h) => {
      p.box(LAMINATE, 0, 0, 0, 2.0, 0.55, 0.75);
      p.box(MATTRESS[h % 3]!, 0, 0, 0.55, 2.0, 0.14, 0.75);
      p.box(PILLOW, 0, 0, 0.69, 1.9, 0.02, 0.7);
      p.box(VINYL_SEAT[(h + 1) % 3]!, 1.4, 1.2, 0.4, 0.4, 0.08, 0.4);
      p.box(FRAME, 1.4, 1.2, 0, 0.08, 0.4, 0.08);
    },
    // a desk with a chair pushed back and a stack of charts on it
    (p, h) => {
      p.box(WOOD[h % WOOD.length]!, 0, -0.4, 0.0, 2.2, 0.8, 0.8);
      p.box(TOP_PALE, 0, -0.4, 0.8, 2.3, 0.05, 0.9);
      p.box(CHART, -0.6, -0.4, 0.85, 0.5, 0.18, 0.4);
      p.box(BORE, 0.5, -0.5, 0.85, 0.5, 0.35, 0.05);
      p.box(VINYL_SEAT[h % 3]!, 0.4, 0.9, 0.42, 0.5, 0.08, 0.5);
      p.box(VINYL_SEAT[h % 3]!, 0.4, 1.12, 0.5, 0.5, 0.5, 0.08);
    },
  ],
  [KIND_LAB]: [
    // a scanner's casing, low, with its table running out of it
    (p, h) => {
      p.box(SCANNER, -0.5, 0, 0, 1.2, 1.15, 2.2);
      p.box(BORE, -0.5, 0, 0.35, 1.25, 0.6, 1.0);
      p.box(FRAME, 1.1, 0, 0.6, 1.8, 0.1, 0.6);
      p.box(MATTRESS[h % 3]!, 1.1, 0, 0.7, 1.7, 0.06, 0.5);
      p.box(FRAME_DARK, 1.1, 0, 0, 0.6, 0.6, 0.3);
    },
    // an equipment cart with a monitor and a lead apron over its rail
    (p, h) => {
      wagonPiece(p, h, 2.4, -0.6, 1.2);
      p.box(BORE, 0.2, -0.6, 0.66, 0.6, 0.5, 0.08);
      p.box(0x6e8a88, -0.8, -0.1, 0.62, 0.5, 0.5, 0.06);
      p.box(CASE_BOX, 1.0, 1.1, 0, 0.9, 0.5, 0.6);
    },
  ],
  [KIND_PHARMACY]: [
    // a counter with rows of medicine boxes on it
    (p, h) => {
      counter(p, h, 3.2, -0.9, 0.9);
      counter(p, h + 2, 2.4, 1.0, 0.8);
    },
    // two low cabinets back to back, boxes on top
    (p, h) => {
      for (const z of [-0.6, 0.6]) {
        p.box(LAMINATE, 0, z, 0, 3.2, 1.0, 0.7);
        for (let k = 0; k < 7; k++)
          p.box(MEDICINE[(h + k) % MEDICINE.length]!, -1.4 + k * 0.45, z, 1.0, 0.3, 0.14, 0.4);
      }
    },
  ],
  [KIND_LINEN]: [
    // two carts of sheets side by side
    (p, h) => {
      linenCart(p, h, -0.9, -0.8);
      linenCart(p, h + 1, 0.9, 0.8);
    },
    // a stack of tubs, a pallet of folded sheets
    (p, h) => {
      for (let k = 0; k < 6; k++)
        p.box(TUB, -1.2 + (k % 3) * 0.8, -0.8 + Math.floor(k / 3) * 0.7, 0, 0.7, 0.55 + (k % 2) * 0.2, 0.6);
      for (let k = 0; k < 5; k++) p.box(SHEET[(h + k) % SHEET.length]!, 1.0, 0.9, 0.12 + k * 0.17, 1.1, 0.15, 0.9);
      p.box(WOOD_DEEP, 1.0, 0.9, 0, 1.2, 0.12, 1.0);
    },
  ],
  [KIND_WAITING]: [
    // a row of three benches
    (p, h) => {
      for (const z of [-1.1, 1.1]) bench(p, VINYL_SEAT[(h + (z > 0 ? 1 : 0)) % 3]!, 3.2, z, z > 0 ? 1 : -1);
    },
    // a planter with a dead plant between two benches
    (p, h) => {
      p.box(TILE_GREEN, 0, 0, 0, 1.4, 0.7, 1.4);
      p.box(SOIL, 0, 0, 0.7, 1.2, 0.04, 1.2);
      for (let n = 0; n < 5; n++)
        p.box(TWIG, -0.4 + n * 0.2, (n % 2) * 0.2 - 0.1, 0.74, 0.04, 0.5 + (n % 3) * 0.1, 0.04);
      bench(p, VINYL_SEAT[h % 3]!, 3.2, -1.15, -1);
      bench(p, VINYL_SEAT[(h + 1) % 3]!, 3.2, 1.15, 1);
    },
  ],
};

// ---- the islands (islands.ts): one piece for the room's kind, over the whole 1 x 2 or 2 x 2 tiles ----
// A piece of an island: `p` has the island's middle as its middle, its long side along x; the piece is L long and D deep
// (before it is turned) and nothing of it stands higher than the cover (a little over for a headboard or a tip)
type IslandMaker = (p: Piece, h: number, L: number, D: number) => void;
// beds in a row across the island, heads to the -z side (a square island: two rows head to head)
function bedRow(p: Piece, h: number, L: number, z: number) {
  const n = Math.max(2, Math.floor(L / 2.5));
  for (let k = 0; k < n; k++) hospitalBed(p, (k - (n - 1) / 2) * 2.5, h + k, h + k + 1, z);
}
const ISLAND_MAKERS: Record<number, IslandMaker> = {
  [KIND_WARD]: (p, h, L, D) => {
    if (D < 5) bedRow(p, h, L, 0);
    else {
      bedRow(p, h, L, -D / 4);
      bedRow(p, h + 2, L, D / 4);
      for (let k = 0; k < 2; k++) cabinet(p, (k - 0.5) * 3.2, 0);
    }
  },
  [KIND_EXAM]: (p, h, _L, D) => {
    const n = D < 5 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * 2.6;
      p.box(LAMINATE, x, 0, 0, 2.0, 0.55, 0.75);
      p.box(MATTRESS[(h + k) % 3]!, x, 0, 0.55, 2.0, 0.14, 0.75);
      p.box(PILLOW, x, 0, 0.69, 1.9, 0.02, 0.7);
      p.box(BLANKET[(h + k) % BLANKET.length]!, x, D / 2 - 0.9, 0, 0.06, 1.15, 1.4);
    }
  },
  [KIND_LAB]: (p, h, L, D) => {
    p.box(SCANNER, -L / 4, 0, 0, Math.min(2.4, L / 2), 1.15, Math.min(D - 0.6, 3.0));
    p.box(BORE, -L / 4, 0, 0.3, Math.min(2.5, L / 2 + 0.05), 0.7, Math.min(D - 1.6, 1.4));
    p.box(FRAME, L / 6, 0, 0.6, L / 2.2, 0.1, 0.7);
    p.box(MATTRESS[h % 3]!, L / 6, 0, 0.7, L / 2.2 - 0.1, 0.06, 0.6);
    p.box(FRAME_DARK, L / 6 + 0.4, 0, 0, 0.7, 0.6, 0.4);
  },
  [KIND_PHARMACY]: (p, h, L, D) => {
    const rows = D < 5 ? [0] : [-D / 4, D / 4];
    for (const z of rows) {
      p.box(LAMINATE, 0, z, 0, L, 1.0, 1.2);
      p.box(TOP_PALE, 0, z, 1.0, L + 0.1, 0.05, 1.3);
      const n = Math.floor((L - 0.4) / 0.5);
      for (let k = 0; k < n; k++)
        p.box(MEDICINE[(h + k) % MEDICINE.length]!, (k - (n - 1) / 2) * 0.5, z, 1.05, 0.32, 0.12 + (k % 3) * 0.06, 0.8);
    }
  },
  [KIND_LINEN]: (p, h, L, D) => {
    const rows = D < 5 ? [0] : [-D / 4, D / 4];
    for (const z of rows) {
      const n = Math.floor(L / 1.6);
      for (let k = 0; k < n; k++) linenCart(p, h + k, (k - (n - 1) / 2) * 1.6, z);
    }
  },
  [KIND_WAITING]: (p, h, L, D) => {
    const rows = D < 5 ? [-1.0, 1.0] : [-D / 2 + 0.9, -0.9, 0.9, D / 2 - 0.9],
      n = Math.max(1, Math.floor(L / 3.4));
    rows.forEach((z, r) => {
      const back = r % 2 ? 1 : -1;
      for (let k = 0; k < n; k++) bench(p, VINYL_SEAT[(h + r + k) % 3]!, 3.2, z, back);
    });
  },
};
// (a room that is none of these kinds: a row of beds)
const ISLAND_BEDS: IslandMaker = (p, h, L, D) => bedRow(p, h, L, D < 5 ? 0 : -D / 4);
// the island's piece: its middle, and turned a quarter when it stands along z
function islandPiece(parts: Parts, plan: FloorPlan, ground: (k: number) => number, island: Island) {
  const W = plan.gen.W,
    { i, j, w, h } = island,
    room = plan.gen.maps.roomOf[j * W + i]!,
    kind = roomKindOf(plan.gen.maps.grid, room),
    side = (n: number) => n * T - 2 * ISLAND_PAD,
    quarter = w < h,
    hash = Math.imul(j * W + i + 1, 2654435761) >>> 0,
    p = piece(
      parts,
      (tileCenter(i) + tileCenter(i + w - 1)) / 2,
      ground(j * W + i),
      (tileCenter(j) + tileCenter(j + h - 1)) / 2,
      quarter,
    );
  (ISLAND_MAKERS[kind] ?? ISLAND_BEDS)(p, (hash >>> 12) % 7, side(Math.max(w, h)), side(Math.min(w, h)));
}
// draws the cover tiles `tiles` (indexes into the floor's map) into `group`
export function hospCover(tiles: number[], plan: FloorPlan, group: THREE.Group) {
  if (!tiles.length) return;
  const W = plan.gen.W,
    ground = groundOf(plan.gen.maps),
    parts: Parts = { boxes: new Map(), domes: new Map() },
    onIsland = new Set<number>();
  for (const s of plan.islands) {
    for (let j = s.j; j < s.j + s.h; j++) for (let i = s.i; i < s.i + s.w; i++) onIsland.add(j * W + i);
    islandPiece(parts, plan, ground, s);
  }
  for (const k of tiles) {
    if (onIsland.has(k)) continue;
    // (the same piece on a tile every time: by the tile's number; a room of a kind has its own pieces)
    const h = Math.imul(k + 1, 2654435761) >>> 0,
      p = piece(parts, tileCenter(k % W), ground(k), tileCenter((k / W) | 0), (h >>> 8) % 2 === 1),
      makers = MAKERS_BY_KIND[roomKindOf(plan.gen.maps.grid, plan.gen.maps.roomOf[k]!)] ?? MAKERS_DEFAULT;
    makers[(h >>> 12) % makers.length]!(p, (h >>> 20) % 7);
  }
  drawParts(parts, group);
}
