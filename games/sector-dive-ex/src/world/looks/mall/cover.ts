import * as THREE from 'three';
import { tileCenter } from '@engine/world/tiles.ts';
import type { FloorPlan } from '../../building.ts';
import { roomKindOf } from '../common.ts';
import { KIND_FOOD } from './rooms.ts';
// The mall's waist-high cover, drawn as the things that stand in a mall (Look.cover): a lounge of two sofas round a low
// table, benches back to back with a planter between, a big tiled planter with a dead plant, a pair of sales wagons,
// a stand of capsule toys. Each fills about the tile it stands on, and its top is the height of the cover (a back, a
// twig or a dome may stand a little over it); it is only what one sees: the tile world's cover (its shape for bullets
// and for walking, its height) is as it was.
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
// a piece being made: parts placed about the tile's middle, the whole piece turned a quarter or not
function piece(parts: Parts, cx: number, cz: number, quarter: boolean) {
  const at = new THREE.Matrix4(),
    turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), quarter ? Math.PI / 2 : 0);
  const place = (x: number, z: number): [number, number] => (quarter ? [z, -x] : [x, z]);
  return {
    // a box: its middle at (x, z), its foot at y0, w across and d along (before the piece is turned)
    box(color: number, x: number, z: number, y0: number, w: number, h: number, d: number) {
      const [px, pz] = place(x, z);
      at.compose(new THREE.Vector3(cx + px, y0 + h / 2, cz + pz), turn, new THREE.Vector3(w, h, d));
      (parts.boxes.get(color) ?? parts.boxes.set(color, []).get(color)!).push(at.clone());
    },
    dome(color: number, x: number, z: number, y: number, r: number) {
      const [px, pz] = place(x, z);
      at.compose(new THREE.Vector3(cx + px, y, cz + pz), turn, new THREE.Vector3(r, r, r));
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
// draws the cover tiles `tiles` (indexes into the floor's map) into `group`
export function mallCover(tiles: number[], plan: FloorPlan, group: THREE.Group) {
  if (!tiles.length) return;
  const W = plan.gen.W,
    parts: Parts = { boxes: new Map(), domes: new Map() };
  for (const k of tiles) {
    // (the same piece on a tile every time: by the tile's number)
    const h = Math.imul(k + 1, 2654435761) >>> 0,
      p = piece(parts, tileCenter(k % W), tileCenter((k / W) | 0), (h >>> 8) % 2 === 1);
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
