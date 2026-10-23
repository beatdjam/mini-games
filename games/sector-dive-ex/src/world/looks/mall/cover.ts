import * as THREE from 'three';
import { T, tileCenter } from '@engine/world/tiles.ts';
import { groundOf } from '../../meshParts.ts';
import type { FloorPlan } from '../../building.ts';
import type { Island } from './islands.ts';
import { roomKindOf } from '../common.ts';
import { KIND_FOOD } from './rooms.ts';
// The mall's waist-high cover, drawn as the things that stand in a mall (Look.cover): a lounge of two sofas round a low
// table, benches back to back with a planter between, a big tiled planter with a dead plant, a pair of sales wagons,
// a stand of capsule toys. Each fills about the tile it stands on, and its top is the height of the cover (a back, a
// twig or a dome may stand a little over it); it is only what one sees: the tile world's cover (its shape for bullets
// and for walking, its height) is as it was. In the sunk food court the pieces stand on the floor there.
// ---- tuning numbers used only here ----
const HALF = 1.7; // the pieces fill a tile to this far from its middle (m)
const SIDE_SHADE = 0.78; // the sides of a part are this much of the colour of its top (nothing lights them)
const FABRICS = [0x6f4c43, 0x56664f, 0x5d5a73, 0x7a6342];
const WOODS = [0x6a4b30, 0x7a5b3b];
const GOODS = [0xa4553c, 0x4f7a8c, 0xc2a346, 0x5f8f5d, 0x8b5f92, 0xcfc8b4, 0x6c6ea0];
const TILE_GREEN = 0x5a6a56;
const BRASS_RIM = 0xa88f50;
const SOIL = 0x2b2219;
const TWIG = 0x5f4c34;

interface Parts {
  boxes: Map<number, THREE.Matrix4[]>;
  domes: Map<number, THREE.Matrix4[]>;
}
// a piece being made: parts placed about the tile's middle (its floor at height cy), the whole piece turned a quarter or not
function piece(parts: Parts, cx: number, cy: number, cz: number, quarter: boolean) {
  const at = new THREE.Matrix4(),
    turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), quarter ? Math.PI / 2 : 0);
  const place = (x: number, z: number): [number, number] => (quarter ? [z, -x] : [x, z]);
  return {
    // a box: its middle at (x, z), its foot at y0, w across and d along (before the piece is turned)
    box(color: number, x: number, z: number, y0: number, w: number, h: number, d: number) {
      const [px, pz] = place(x, z);
      at.compose(new THREE.Vector3(cx + px, cy + y0 + h / 2, cz + pz), turn, new THREE.Vector3(w, h, d));
      (parts.boxes.get(color) ?? parts.boxes.set(color, []).get(color)!).push(at.clone());
    },
    dome(color: number, x: number, z: number, y: number, r: number) {
      const [px, pz] = place(x, z);
      at.compose(new THREE.Vector3(cx + px, cy + y, cz + pz), turn, new THREE.Vector3(r, r, r));
      (parts.domes.get(color) ?? parts.domes.set(color, []).get(color)!).push(at.clone());
    },
  };
}
// a sofa along x at depth z (its back toward -z, or toward +z when `back` is 1): seat, back, two arms
function sofa(p: ReturnType<typeof piece>, color: number, z: number, back: 1 | -1) {
  p.box(color, 0, z, 0, 3.2, 0.5, 0.95);
  p.box(color, 0, z - back * 0.45, 0.5, 3.2, 0.5, 0.25);
  for (const x of [-1.45, 1.45]) p.box(color, x, z, 0.5, 0.3, 0.22, 0.95);
}
const PIECE_MAKERS: ((p: ReturnType<typeof piece>, h: number) => void)[] = [
  // two sofas facing each other, a low table between
  (p, h) => {
    const fabric = FABRICS[h % FABRICS.length]!;
    sofa(p, fabric, -1.15, -1);
    sofa(p, FABRICS[(h + 1) % FABRICS.length]!, 1.15, 1);
    p.box(WOODS[0]!, 0, 0, 0, 1.6, 0.4, 0.8);
  },
  // two benches back to back, a planter between them with a dry twig or two
  (p, h) => {
    p.box(TILE_GREEN, 0, 0, 0, 3.4, 0.85, 0.9);
    p.box(SOIL, 0, 0, 0.85, 3.2, 0.04, 0.7);
    for (const z of [-1.1, 1.1]) {
      p.box(WOODS[h % WOODS.length]!, 0, z, 0.38, 3.4, 0.08, 0.6);
      for (const x of [-1.5, 0, 1.5]) p.box(0x3d3b38, x, z, 0, 0.1, 0.38, 0.5);
    }
    for (const x of [-0.8, 0.3, 1.1]) p.box(TWIG, x, 0, 0.88, 0.04, 0.6, 0.04);
  },
  // a big tiled planter with a brass rim and a dead bush
  (p, h) => {
    p.box(TILE_GREEN, 0, 0, 0, 2 * HALF, 0.85, 2 * HALF);
    p.box(BRASS_RIM, 0, 0, 0.85, 2 * HALF + 0.1, 0.06, 2 * HALF + 0.1);
    p.box(SOIL, 0, 0, 0.9, 2 * HALF - 0.4, 0.04, 2 * HALF - 0.4);
    for (let n = 0; n < 7; n++) {
      const a = (n + (h % 3) / 3) * 0.9;
      p.box(
        TWIG,
        Math.cos(a) * (0.2 + n * 0.12),
        Math.sin(a) * (0.2 + n * 0.12),
        0.92,
        0.05,
        0.3 + (n % 3) * 0.1,
        0.05,
      );
    }
  },
  // two sales wagons side by side, goods heaped on them
  (p, h) => {
    for (const z of [-1.0, 1.0]) {
      p.box(WOODS[(h + (z > 0 ? 1 : 0)) % WOODS.length]!, 0, z, 0.12, 3.4, 0.68, 1.3);
      p.box(0x3d3b38, 0, z, 0, 3.0, 0.12, 1.0);
      for (let n = 0; n < 8; n++)
        p.box(
          GOODS[(h + n + (z > 0 ? 3 : 0)) % GOODS.length]!,
          -1.4 + n * 0.4,
          z + (n % 2 ? 0.2 : -0.2),
          0.8,
          0.34,
          0.2 + (n % 3) * 0.1,
          0.34,
        );
    }
  },
  // a stand of capsule-toy machines in two rows, back to back
  (p, h) => {
    p.box(0x3d3b38, 0, 0, 0, 2 * HALF, 0.25, 2.6);
    for (const z of [-0.55, 0.55])
      for (let n = 0; n < 6; n++) {
        const x = -1.375 + n * 0.55,
          c = GOODS[(h + n + (z > 0 ? 2 : 0)) % GOODS.length]!;
        p.box(c, x, z, 0.25, 0.5, 0.55, 0.5);
        p.dome(0xd2d4d0, x, z, 0.98, 0.23);
        p.box(0x3d3b38, x, z, 0.8, 0.26, 0.1, 0.26);
      }
  },
];
// ---- the food court: tables and chairs ----
const CHAIRS = [0xb4693c, 0x4f8a8c, 0xc2a346];
const TABLE_TOP = 0xa68a62;
// a chair at (x, z) with its back toward `back` (0: +x, 1: -x, 2: +z, 3: -z)
function chair(p: ReturnType<typeof piece>, color: number, x: number, z: number, back: number) {
  const out = [
    [0.2, 0],
    [-0.2, 0],
    [0, 0.2],
    [0, -0.2],
  ][back]!;
  p.box(0x3d3c39, x, z, 0, 0.1, 0.42, 0.1);
  p.box(color, x, z, 0.42, 0.46, 0.08, 0.46);
  p.box(color, x + out[0]!, z + out[1]!, 0.5, out[0] ? 0.06 : 0.46, 0.5, out[1] ? 0.06 : 0.46);
}
const FOOD_MAKERS: ((p: ReturnType<typeof piece>, h: number) => void)[] = [
  // a table for four, a chair on each side
  (p, h) => {
    p.box(0x3d3c39, 0, 0, 0, 0.22, 0.7, 0.22);
    p.box(TABLE_TOP, 0, 0, 0.7, 1.9, 0.08, 1.9);
    chair(p, CHAIRS[h % 3]!, 1.35, 0, 0);
    chair(p, CHAIRS[(h + 1) % 3]!, -1.35, 0, 1);
    chair(p, CHAIRS[(h + 2) % 3]!, 0, 1.35, 2);
    chair(p, CHAIRS[h % 3]!, 0, -1.35, 3);
  },
  // two tables for two, side by side
  (p, h) => {
    for (const z of [-1.0, 1.0]) {
      p.box(0x3d3c39, 0, z, 0, 0.2, 0.7, 0.2);
      p.box(TABLE_TOP, 0, z, 0.7, 1.5, 0.08, 0.95);
      chair(p, CHAIRS[(h + (z > 0 ? 1 : 0)) % 3]!, -1.05, z, 1);
      chair(p, CHAIRS[(h + (z > 0 ? 2 : 1)) % 3]!, 1.05, z, 0);
    }
  },
];
// ---- the islands (islands.ts): one piece for the shop's kind, over the whole 1 x 2 or 2 x 2 tiles ----
const ISLAND_PAD = 0.3; // the piece stops this far short of the edge of its tiles on every side (m)
const DARK = 0x3d3b38;
const DEEP_WOOD = 0x4a3624;
const MARBLE = 0xcfc8b4;
const SHOWCASE = 0x2f4a4c;
const STEEL = 0x8b9091;
const CARTON = 0xb08a58;
const SCREENS = [0x4f7a9c, 0x4f8a8c];
const GONDOLA = 0xa7a8a2;
const BOOKS = [0xa4553c, 0x4f7a8c, 0x5f8f5d, 0x8b5f92, 0xc2a346, 0x6c6ea0, 0xcfc8b4, 0x7b4b3b];
// A piece of an island: `p` has the island's middle as its middle, its long side along x; the piece is L long and D deep
// (before it is turned) and nothing of it stands higher than the cover (a little over for an edge or a tip)
type IslandPiece = ReturnType<typeof piece>;
type IslandMaker = (p: IslandPiece, h: number, L: number, D: number) => void;
// a sales wagon along x at depth z, goods heaped on it
function wagon(p: IslandPiece, h: number, L: number, z: number, d: number) {
  p.box(WOODS[h % WOODS.length]!, 0, z, 0.12, L, 0.68, d);
  p.box(DARK, 0, z, 0, L - 0.4, 0.12, d - 0.3);
  const n = Math.floor((L - 0.4) / 0.45);
  for (let k = 0; k < n; k++)
    p.box(
      GOODS[(h + k) % GOODS.length]!,
      (k - (n - 1) / 2) * 0.45,
      z + (k % 2 ? 0.2 : -0.2),
      0.8,
      0.34,
      0.2 + (k % 3) * 0.1,
      0.34,
    );
}
// a gondola (a low shelf with goods on both sides) along x at depth z, d deep
function gondola(p: IslandPiece, h: number, L: number, z: number, d: number) {
  const side = (d - 0.2) / 2;
  p.box(GONDOLA, 0, z, 0, L, 0.2, d);
  p.box(GONDOLA, 0, z, 0.2, L, 1.0, 0.1);
  const n = Math.floor((L - 0.2) / 0.5);
  for (const s of [-1, 1])
    for (const [lv, y] of [0.2, 0.55, 0.9].entries()) {
      p.box(STEEL, 0, z + (s * side) / 2, y, L, 0.05, side);
      for (let k = 0; k < n; k++)
        p.box(
          GOODS[(h + k + lv * 2 + (s > 0 ? 3 : 0)) % GOODS.length]!,
          (k - (n - 1) / 2) * 0.5,
          z + (s * side) / 2,
          y + 0.05,
          0.34,
          0.2 + ((k + s + h) % 3) * 0.04,
          side - 0.3,
        );
    }
}
const ISLAND_MAKERS: Record<number, IslandMaker> = {
  // clothes: a table of folded stacks; or racks of hanging clothes on a low plinth
  0: (p, h, L, D) => {
    if (D < 5) {
      p.box(DARK, 0, 0, 0, L - 0.8, 0.55, D - 0.6);
      p.box(WOODS[h % WOODS.length]!, 0, 0, 0.55, L, 0.1, D);
      const n = 9;
      for (const z of [-0.75, 0.75])
        for (let k = 0; k < n; k++)
          p.box(
            GOODS[(h + k + (z > 0 ? 2 : 0)) % GOODS.length]!,
            (k - (n - 1) / 2) * ((L - 0.8) / n),
            z,
            0.65,
            0.6,
            0.08 * (2 + ((k + (z > 0 ? 1 : 0)) % 4)),
            0.7,
          );
      return;
    }
    p.box(DARK, 0, 0, 0, L, 0.25, D);
    for (const z of [-D / 3, 0, D / 3]) {
      for (const x of [-L / 2 + 0.25, L / 2 - 0.25]) p.box(STEEL, x, z, 0.25, 0.08, 0.9, 0.08);
      p.box(STEEL, 0, z, 1.12, L - 0.4, 0.06, 0.06);
      const n = Math.floor((L - 0.8) / 0.5);
      for (let k = 0; k < n; k++)
        p.box(
          [...FABRICS, ...GOODS][(h + k + (z > 0 ? 3 : z < 0 ? 5 : 0)) % (FABRICS.length + GOODS.length)]!,
          (k - (n - 1) / 2) * 0.5,
          z,
          0.4,
          0.4,
          0.7,
          0.22,
        );
    }
  },
  // a cafe: a counter with a marble top, cups and a cake case on it; a square one has a well inside
  1: (p, h, L, D) => {
    const slab = (x: number, z: number, w: number, d: number) => {
      p.box(DEEP_WOOD, x, z, 0, w, 1.0, d);
      p.box(MARBLE, x, z, 1.0, w + 0.1, 0.08, d + 0.1);
    };
    if (D < 5) slab(0, 0, L, D);
    else {
      slab(0, -D / 2 + 0.65, L, 1.3);
      slab(0, D / 2 - 0.65, L, 1.3);
      for (const x of [-L / 2 + 0.65, L / 2 - 0.65]) slab(x, 0, 1.3, D - 2.6);
      p.box(DEEP_WOOD, 0, 0, 0, L - 2.6, 0.5, D - 2.6);
      p.box(STEEL, 0, 0, 0.5, L - 3, 0.06, D - 3);
    }
    const z0 = D < 5 ? 0 : -D / 2 + 0.65;
    p.box(0xd8d4c6, -L / 4, z0, 1.08, 1.4, 0.1, 0.6);
    for (let k = 0; k < 5; k++)
      p.box(CHAIRS[(h + k) % 3]!, 0.3 + k * 0.5, z0 + (k % 2 ? 0.15 : -0.15), 1.08, 0.2, 0.1, 0.2);
  },
  // a bookstore: a low table with stacks of books laid flat, higher in the middle
  2: (p, h, L, D) => {
    const rows = D < 5 ? 2 : 4,
      cols = 8;
    p.box(DARK, 0, 0, 0, L - 0.8, 0.45, D - 0.6);
    p.box(WOODS[h % WOODS.length]!, 0, 0, 0.45, L, 0.1, D);
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < cols; k++) {
        const mid = 1 - Math.abs(k - (cols - 1) / 2) / (cols / 2);
        p.box(
          BOOKS[(h + k * 3 + r) % BOOKS.length]!,
          (k - (cols - 1) / 2) * ((L - 0.7) / cols),
          (r - (rows - 1) / 2) * ((D - 0.9) / rows),
          0.55,
          0.7,
          0.15 + mid * 0.3 + ((k + r) % 2) * 0.1,
          0.62,
        );
      }
  },
  // glasses: a showcase, the frames laid inside, a glass lid drawn as posts and rails
  3: (p, h, L, D) => {
    p.box(SHOWCASE, 0, 0, 0, L - 0.2, 0.8, D - 0.2);
    p.box(MARBLE, 0, 0, 0.8, L, 0.06, D);
    for (const x of [-L / 2 + 0.06, L / 2 - 0.06])
      for (const z of [-D / 2 + 0.06, D / 2 - 0.06]) p.box(STEEL, x, z, 0.86, 0.1, 0.34, 0.1);
    for (const z of [-D / 2 + 0.06, D / 2 - 0.06]) p.box(STEEL, 0, z, 1.16, L, 0.04, 0.08);
    for (const x of [-L / 2 + 0.06, L / 2 - 0.06]) p.box(STEEL, x, 0, 1.16, 0.08, 0.04, D);
    const rows = D < 5 ? 2 : 4;
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < 6; k++)
        p.box(
          (h + k + r) % 3 ? DARK : DEEP_WOOD,
          (k - 2.5) * ((L - 1) / 6),
          (r - (rows - 1) / 2) * ((D - 1.2) / rows),
          0.86,
          0.5,
          0.08,
          0.2,
        );
  },
  // electronics: screens back to back on a black plinth, cartons between the rows
  4: (p, h, L, D) => {
    p.box(DARK, 0, 0, 0, L, 0.45, D);
    const rows = D < 5 ? [0] : [-D / 4 - 0.2, D / 4 + 0.2],
      n = Math.floor((L - 0.4) / 1.5);
    rows.forEach((z, r) => {
      for (let k = 0; k < n; k++) {
        const x = (k - (n - 1) / 2) * 1.5;
        p.box(DARK, x, z, 0.45, 1.3, 0.7, 0.2);
        p.box(SCREENS[(h + k + r) % 2]!, x, z, 0.52, 1.15, 0.56, 0.24);
      }
    });
    if (D >= 5) for (let k = 0; k < 5; k++) p.box(CARTON, (k - 2) * 1.3, 0, 0.45, 1.0, 0.5 + ((k + h) % 2) * 0.35, 0.8);
  },
  // a drugstore: a gondola with goods on both sides (a square island: two of them)
  5: (p, h, L, D) => {
    if (D < 5) gondola(p, h, L, 0, D);
    else for (const z of [-D / 2 + 1.7, D / 2 - 1.7]) gondola(p, h + (z > 0 ? 1 : 0), L, z, 3.4);
  },
};
// (a room that is no shop: a sales wagon, or two)
const ISLAND_WAGON: IslandMaker = (p, h, L, D) => {
  if (D < 5) wagon(p, h, L, 0, D);
  else for (const z of [-D / 2 + 1.7, D / 2 - 1.7]) wagon(p, h + (z > 0 ? 1 : 0), L, z, 3.4 - 0.4);
};
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
  (ISLAND_MAKERS[kind] ?? ISLAND_WAGON)(p, (hash >>> 12) % 7, side(Math.max(w, h)), side(Math.min(w, h)));
}
// draws the cover tiles `tiles` (indexes into the floor's map) into `group`
export function mallCover(tiles: number[], plan: FloorPlan, group: THREE.Group) {
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
    // (the same piece on a tile every time: by the tile's number)
    const h = Math.imul(k + 1, 2654435761) >>> 0,
      p = piece(parts, tileCenter(k % W), ground(k), tileCenter((k / W) | 0), (h >>> 8) % 2 === 1);
    // (in the food court: tables and chairs)
    const makers = roomKindOf(plan.gen.maps.grid, plan.gen.maps.roomOf[k]!) === KIND_FOOD ? FOOD_MAKERS : PIECE_MAKERS;
    makers[(h >>> 12) % makers.length]!(p, (h >>> 20) % 7);
  }
  const box = new THREE.BoxGeometry(1, 1, 1),
    sphere = new THREE.SphereGeometry(1, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2),
    mats = (color: number) => {
      const side = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(SIDE_SHADE) });
      return [side, side, new THREE.MeshBasicMaterial({ color }), side, side, side];
    };
  const make = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], where: THREE.Matrix4[]) => {
    const mesh = new THREE.InstancedMesh(geo, mat, where.length);
    where.forEach((m, n) => mesh.setMatrixAt(n, m));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  };
  for (const [color, where] of parts.boxes) make(box, mats(color), where);
  for (const [color, where] of parts.domes) make(sphere, new THREE.MeshBasicMaterial({ color }), where);
}
