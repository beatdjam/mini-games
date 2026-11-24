// The pillbox's model (SB-2050, second pass): a heavy concrete position, 12 x 6 x 8 m, its front (the muzzle's side) at +z.
// It is built as one vertex-coloured shape, so a pillbox is still one mesh and one draw. The target's own material
// colour is a neutral concrete grey; the red of the target mark lives in vertex colours (the striped roof lip and the
// band over the embrasure), so the concrete, the earth of the sandbags and the black metal read as what they are.
//
// What is on it: a bevelled plinth; walls with their back corners clipped, sloped skirts on the sides and the back, and
// a roof slab that flares out on a corbel with a bevelled edge and a pitch; an embrasure that is really cut through the
// front wall (a steel frame, a visor with rivets, a gun inside, soot over it); a doorway cut into the left wall with its
// door standing open; four courses of sandbags that step down at the ends; a camouflage net over the roof, holed and
// ragged and hanging over the front-left edge; a roof cupola with a slit, vents and a mast; formwork panels, pour lines
// and tie holes on every wall; cracks, rain streaks, wet stains and chipped spots with rebar left sticking out; rubble.
// The muzzle (half the pillbox's height, past the front face) and the hit box do not move.
import * as THREE from 'three';
import { DEFENSE_COLOR } from '../data/colors.ts';

type V = [number, number, number];
type Rect = [number, number, number, number]; // u0, u1, v0, v1 on a face

// A small deterministic random sequence, so a pillbox is the same every time it is built.
function sequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V): V => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};
const mean = (points: V[]): V => {
  const sum: V = [0, 0, 0];
  for (const p of points) {
    sum[0] += p[0];
    sum[1] += p[1];
    sum[2] += p[2];
  }
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
};

// A face of the body that things are laid on: its origin, the way u runs (along the wall), the way it faces, and the
// part of it that is open for decals and panels. `skip` are the openings and fittings to keep clear.
interface Face {
  O: V;
  U: V;
  N: V;
  u: [number, number];
  v: [number, number];
  skip: Rect[];
}

export function pillboxGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const col: number[] = [];
  const rand = sequence(2050);
  const range = (a: number, b: number) => a + (b - a) * rand();
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length) % items.length];
  const hex = (color: number, f = 1) => new THREE.Color(color).multiplyScalar(f);
  const shade = (color: number, spread: number) => hex(color, 1 - spread + rand() * spread * 2);

  const push = (a: V, b: V, c: V, n: V, color: THREE.Color) => {
    const ax = Math.abs(n[0]),
      ay = Math.abs(n[1]),
      az = Math.abs(n[2]);
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
      if (ax >= ay && ax >= az) uvs.push(p[2] / 6, p[1] / 6);
      else if (ay >= az) uvs.push(p[0] / 6, p[2] / 6);
      else uvs.push(p[0] / 6, p[1] / 6);
      col.push(color.r, color.g, color.b);
    }
  };
  // a triangle of a closed convex solid: wound so it faces away from the solid's middle
  const solidTri = (a: V, b: V, c: V, middle: V, color: THREE.Color) => {
    const n = unit(cross(sub(b, a), sub(c, a)));
    if (dot(n, sub(mean([a, b, c]), middle)) < 0) push(a, c, b, [-n[0], -n[1], -n[2]], color);
    else push(a, b, c, n, color);
  };
  // a triangle of a flat sheet: wound so it faces the way asked
  const sheetTri = (a: V, b: V, c: V, facing: V, color: THREE.Color) => {
    const n = unit(cross(sub(b, a), sub(c, a)));
    if (dot(n, facing) < 0) push(a, c, b, [-n[0], -n[1], -n[2]], color);
    else push(a, b, c, n, color);
  };
  const sheet = (points: V[], facing: V, color: THREE.Color) => {
    for (let i = 1; i < points.length - 1; i++) sheetTri(points[0], points[i], points[i + 1], facing, color);
  };

  // a convex solid between two rings of the same count (sides, and a fan on each cap)
  const prism = (bottom: V[], top: V[], color: THREE.Color) => {
    const middle = mean([...bottom, ...top]);
    const n = bottom.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      solidTri(bottom[i], bottom[j], top[j], middle, color);
      solidTri(bottom[i], top[j], top[i], middle, color);
    }
    for (let i = 1; i < n - 1; i++) {
      solidTri(bottom[0], bottom[i], bottom[i + 1], middle, color);
      solidTri(top[0], top[i], top[i + 1], middle, color);
    }
  };
  const ring = (xz: [number, number][], y: number | ((x: number, z: number) => number)): V[] =>
    xz.map(([x, z]) => [x, typeof y === 'number' ? y : y(x, z), z]);
  const scaled = (xz: [number, number][], about: [number, number], k: number): [number, number][] =>
    xz.map(([x, z]) => [about[0] + (x - about[0]) * k, about[1] + (z - about[1]) * k]);

  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: THREE.Color) =>
    prism(
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
      ],
      [
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      color,
    );
  // a box turned about y (and tipped about z), for bags of rubble, rungs, panels at a slant
  const turned = (c: V, size: V, turnY: number, turnZ: number, color: THREE.Color) => {
    const m = new THREE.Matrix4().makeRotationY(turnY).multiply(new THREE.Matrix4().makeRotationZ(turnZ));
    const corner = (sx: number, sy: number, sz: number): V => {
      const p = new THREE.Vector3((sx * size[0]) / 2, (sy * size[1]) / 2, (sz * size[2]) / 2).applyMatrix4(m);
      return [c[0] + p.x, c[1] + p.y, c[2] + p.z];
    };
    prism(
      [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1)],
      [corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1)],
      color,
    );
  };
  const rod = (a: V, b: V, r0: number, r1: number, seg: number, color: THREE.Color) => {
    const d = unit(sub(b, a));
    const helper: V = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const e1 = unit(cross(d, helper));
    const e2 = cross(d, e1);
    const around = (center: V, r: number): V[] =>
      Array.from({ length: seg }, (_, i) => {
        const angle = (i / seg) * Math.PI * 2;
        const cs = Math.cos(angle) * r,
          sn = Math.sin(angle) * r;
        return [
          center[0] + e1[0] * cs + e2[0] * sn,
          center[1] + e1[1] * cs + e2[1] * sn,
          center[2] + e1[2] * cs + e2[2] * sn,
        ];
      });
    prism(around(a, r0), around(b, r1), color);
  };
  // a lumpy sandbag: a flattened ball, turned and tipped a little
  const bagShape = new THREE.SphereGeometry(0.5, 8, 4);
  const bag = (c: V, size: V, turnY: number, tilt: number, color: THREE.Color) => {
    const g = bagShape.clone();
    g.scale(size[0], size[1], size[2]);
    g.rotateZ(tilt);
    g.rotateY(turnY);
    g.translate(c[0], c[1], c[2]);
    const at = g.getAttribute('position');
    const normal = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const index = g.getIndex();
    if (!index) return;
    for (let i = 0; i < index.count; i++) {
      const k = index.getX(i);
      pos.push(at.getX(k), at.getY(k), at.getZ(k));
      nor.push(normal.getX(k), normal.getY(k), normal.getZ(k));
      uvs.push(uv.getX(k), uv.getY(k));
      col.push(color.r, color.g, color.b);
    }
    g.dispose();
  };

  // ---- places on the body ----
  const Y0 = 0.5; // the plinth's top
  const TOP = 4.7; // the walls' top
  const FRONT = 2.5; // the front wall's face
  const BACK = -3.4; // the back wall's face
  const SIDE = 5.2; // the side walls' faces
  const HOLE_X = 2.5;
  const HOLE_Y0 = 2.65;
  const HOLE_Y1 = 3.55; // the embrasure's middle is 3.1: half of 6 m is the muzzle's height

  const front: Face = {
    O: [0, 0, FRONT],
    U: [1, 0, 0],
    N: [0, 0, 1],
    u: [-4.1, 4.1],
    v: [2.4, 4.6],
    skip: [[-3.1, 3.1, 2.3, 4.3]],
  };
  const back: Face = {
    O: [0, 0, BACK],
    U: [1, 0, 0],
    N: [0, 0, -1],
    u: [-4.2, 4.2],
    v: [2.1, 4.6],
    skip: [[-1.2, 1.2, 2.7, 4.1]],
  };
  const left: Face = {
    O: [-SIDE, 0, 0],
    U: [0, 0, 1],
    N: [-1, 0, 0],
    u: [-2.5, 1.3],
    v: [2.1, 4.6],
    skip: [[-2.3, 0.7, 0.3, 3.2]],
  };
  const right: Face = {
    O: [SIDE, 0, 0],
    U: [0, 0, 1],
    N: [1, 0, 0],
    u: [-2.5, 0.9],
    v: [2.1, 4.6],
    skip: [[-2.0, -1.0, 0.3, 5.4]],
  };
  const faces = [front, back, left, right];
  const at = (f: Face, u: number, v: number, out = 0): V => [
    f.O[0] + f.U[0] * u + f.N[0] * out,
    v,
    f.O[2] + f.U[2] * u + f.N[2] * out,
  ];
  const free = (f: Face, u: number, v: number, pad = 0): boolean => {
    if (u < f.u[0] || u > f.u[1] || v < f.v[0] || v > f.v[1]) return false;
    return !f.skip.some(([u0, u1, v0, v1]) => u > u0 - pad && u < u1 + pad && v > v0 - pad && v < v1 + pad);
  };
  const decal = (f: Face, corners: [number, number][], out: number, color: THREE.Color) =>
    sheet(
      corners.map(([u, v]) => at(f, u, v, out)),
      f.N,
      color,
    );
  const slab = (f: Face, u0: number, u1: number, v0: number, v1: number, depth: number, color: THREE.Color) => {
    const a = at(f, u0, v0, 0);
    const b = at(f, u1, v1, depth);
    box(
      Math.min(a[0], b[0]),
      Math.max(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.max(a[1], b[1]),
      Math.min(a[2], b[2]),
      Math.max(a[2], b[2]),
      color,
    );
  };

  const concrete = 1;
  const dirt = (f: number) => hex(0xffffff, f);

  // ---- the plinth ----
  prism(
    ring(
      [
        [-6, -4],
        [6, -4],
        [6, 4],
        [-6, 4],
      ],
      0,
    ),
    ring(
      [
        [-5.72, -3.72],
        [5.72, -3.72],
        [5.72, 3.72],
        [-5.72, 3.72],
      ],
      Y0,
    ),
    hex(DEFENSE_COLOR.pillboxPlinth),
  );

  // ---- the walls ----
  const wall = (xz: [number, number][], color = dirt(concrete)) => prism(ring(xz, Y0), ring(xz, TOP), color);
  // the back mass, its back-right corner clipped (the back-left one is clipped by the left wall's own piece)
  wall([
    [-4.5, 1],
    [-4.5, -3.3],
    [-4.4, -3.4],
    [4.4, -3.4],
    [5.2, -2.6],
    [5.2, 1],
  ]);
  // the front: a pier at each side, the sill, the lintel, and a corner cut at 45 degrees
  wall([
    [-4.2, 1],
    [-4.2, FRONT],
    [-HOLE_X, FRONT],
    [-HOLE_X, 1],
  ]);
  wall([
    [4.2, 1],
    [4.2, FRONT],
    [HOLE_X, FRONT],
    [HOLE_X, 1],
  ]);
  wall([
    [-5.2, 1],
    [-5.2, 1.5],
    [-4.2, FRONT],
    [-4.2, 1],
  ]);
  wall([
    [5.2, 1],
    [5.2, 1.5],
    [4.2, FRONT],
    [4.2, 1],
  ]);
  box(-HOLE_X, HOLE_X, Y0, HOLE_Y0, 1, FRONT, dirt(concrete));
  box(-HOLE_X, HOLE_X, HOLE_Y1, TOP, 1, FRONT, dirt(concrete));
  // the left wall around its doorway (z -1.8 .. 0.4, up to 2.7)
  wall([
    [-5.2, -1.8],
    [-5.2, -2.6],
    [-4.5, -3.3],
    [-4.5, -1.8],
  ]);
  wall([
    [-5.2, 0.4],
    [-5.2, 1],
    [-4.5, 1],
    [-4.5, 0.4],
  ]);
  box(-SIDE, -4.5, 2.7, TOP, -1.8, 0.4, dirt(concrete));

  // sloped skirts, so the sides and the back stand on a wider foot
  const skirt = (a: V, b: V, run: V) => {
    // a triangular prism along a -> b whose section runs out `run` at the foot
    const foot = (p: V): V => [p[0] + run[0], Y0, p[2] + run[2]];
    const top = (p: V): V => [p[0], 2, p[2]];
    const base = (p: V): V => [p[0], Y0, p[2]];
    prism([base(a), base(b), foot(b), foot(a)], [top(a), top(b), top(b), top(a)], dirt(0.93));
  };
  skirt([SIDE, 0, -2.5], [SIDE, 0, 1], [0.5, 0, 0]);
  skirt([-4.4, 0, BACK], [4.4, 0, BACK], [0, 0, -0.5]);

  // ---- the embrasure, cut through the front wall ----
  const dark = hex(0x161513);
  const murk = hex(0x2c2a27);
  const gloom = hex(0x45423d);
  // the back of the opening, the floor, the ceiling and the two sides, getting darker inwards
  sheet(
    [
      [-HOLE_X, HOLE_Y0, 1.01],
      [HOLE_X, HOLE_Y0, 1.01],
      [HOLE_X, HOLE_Y1, 1.01],
      [-HOLE_X, HOLE_Y1, 1.01],
    ],
    [0, 0, 1],
    dark,
  );
  for (const [z0, z1, color] of [
    [1, 1.75, murk],
    [1.75, FRONT, gloom],
  ] as const) {
    sheet(
      [
        [-HOLE_X, HOLE_Y0 + 0.01, z0],
        [HOLE_X, HOLE_Y0 + 0.01, z0],
        [HOLE_X, HOLE_Y0 + 0.01, z1],
        [-HOLE_X, HOLE_Y0 + 0.01, z1],
      ],
      [0, 1, 0],
      color,
    );
    sheet(
      [
        [-HOLE_X, HOLE_Y1 - 0.01, z0],
        [HOLE_X, HOLE_Y1 - 0.01, z0],
        [HOLE_X, HOLE_Y1 - 0.01, z1],
        [-HOLE_X, HOLE_Y1 - 0.01, z1],
      ],
      [0, -1, 0],
      color,
    );
    for (const sx of [-1, 1]) {
      sheet(
        [
          [sx * (HOLE_X - 0.01), HOLE_Y0, z0],
          [sx * (HOLE_X - 0.01), HOLE_Y1, z0],
          [sx * (HOLE_X - 0.01), HOLE_Y1, z1],
          [sx * (HOLE_X - 0.01), HOLE_Y0, z1],
        ],
        [-sx, 0, 0],
        color,
      );
    }
  }
  // the steel frame round the opening, a visor over it with rivets, and the gun inside
  const steel = hex(DEFENSE_COLOR.pillboxSteel);
  const steelLight = hex(DEFENSE_COLOR.pillboxSteel, 1.5);
  box(-HOLE_X - 0.3, HOLE_X + 0.3, HOLE_Y1, HOLE_Y1 + 0.26, FRONT, FRONT + 0.14, steel);
  box(-HOLE_X - 0.3, HOLE_X + 0.3, HOLE_Y0 - 0.26, HOLE_Y0, FRONT, FRONT + 0.14, steel);
  box(-HOLE_X - 0.3, -HOLE_X, HOLE_Y0, HOLE_Y1, FRONT, FRONT + 0.14, steel);
  box(HOLE_X, HOLE_X + 0.3, HOLE_Y0, HOLE_Y1, FRONT, FRONT + 0.14, steel);
  prism(
    [
      [-2.95, 3.9, FRONT],
      [2.95, 3.9, FRONT],
      [2.95, 3.58, 3.3],
      [-2.95, 3.58, 3.3],
    ],
    [
      [-2.95, 4.18, FRONT],
      [2.95, 4.18, FRONT],
      [2.95, 3.86, 3.3],
      [-2.95, 3.86, 3.3],
    ],
    steel,
  );
  for (let i = 0; i < 9; i++) {
    const x = -2.6 + i * 0.65;
    rod([x, 3.72, 3.3], [x, 3.72, 3.36], 0.06, 0.05, 6, steelLight);
  }
  rod([0.5, 3.0, 1.2], [0.5, 3.0, 1.95], 0.24, 0.22, 8, steel);
  rod([0.5, 3.0, 1.95], [0.5, 3.0, 2.38], 0.12, 0.11, 8, hex(0x1f2022));
  rod([0.5, 3.0, 2.3], [0.5, 3.0, 2.4], 0.17, 0.17, 8, steel);
  box(-1.3, -0.3, 2.66, 3.0, 1.3, 2.0, hex(0x2f3a2f)); // an ammunition box on the sill

  // soot over the embrasure, in three steps
  decal(
    front,
    [
      [-2.9, 3.95],
      [2.9, 3.95],
      [2.4, 4.3],
      [-2.4, 4.3],
    ],
    0.02,
    hex(DEFENSE_COLOR.pillboxSoot, 1.3),
  );
  decal(
    front,
    [
      [-2.3, 4.3],
      [2.3, 4.3],
      [1.5, 4.6],
      [-1.6, 4.6],
    ],
    0.02,
    hex(DEFENSE_COLOR.pillboxSoot, 1.7),
  );

  // the red mark: a band over the embrasure (the target's own colour; the concrete around it stays grey)
  decal(
    front,
    [
      [-4.1, 4.28],
      [4.1, 4.28],
      [4.1, 4.58],
      [-4.1, 4.58],
    ],
    0.035,
    hex(DEFENSE_COLOR.pillboxMark),
  );
  decal(
    front,
    [
      [-4.1, 4.22],
      [4.1, 4.22],
      [4.1, 4.28],
      [-4.1, 4.28],
    ],
    0.035,
    hex(DEFENSE_COLOR.pillboxMarkWhite),
  );

  // ---- the doorway in the left wall ----
  const doorBack: V[] = [
    [-4.49, Y0, -1.8],
    [-4.49, Y0, 0.4],
    [-4.49, 2.7, 0.4],
    [-4.49, 2.7, -1.8],
  ];
  sheet(doorBack, [1, 0, 0], dark);
  sheet(
    [
      [-SIDE, Y0 + 0.01, -1.8],
      [-4.5, Y0 + 0.01, -1.8],
      [-4.5, Y0 + 0.01, 0.4],
      [-SIDE, Y0 + 0.01, 0.4],
    ],
    [0, 1, 0],
    murk,
  );
  sheet(
    [
      [-SIDE, 2.69, -1.8],
      [-4.5, 2.69, -1.8],
      [-4.5, 2.69, 0.4],
      [-SIDE, 2.69, 0.4],
    ],
    [0, -1, 0],
    murk,
  );
  for (const [z, facing] of [
    [-1.79, 1],
    [0.39, -1],
  ] as const) {
    sheet(
      [
        [-SIDE, Y0, z],
        [-4.5, Y0, z],
        [-4.5, 2.7, z],
        [-SIDE, 2.7, z],
      ],
      [0, 0, facing],
      gloom,
    );
  }
  // the lintel's step and the doorstep
  box(-SIDE - 0.12, -SIDE, 2.5, 2.8, -2.0, 0.6, dirt(0.9));
  box(-SIDE - 0.35, -SIDE, Y0, Y0 + 0.14, -1.9, 0.5, dirt(0.88));
  // the door: a steel leaf one metre wide, hinged at the doorway's front edge and swung out 50 degrees off the wall
  const open = 0.87;
  turned(
    [-SIDE - 0.03 - Math.sin(open) * 0.5, 1.56, 0.35 - Math.cos(open) * 0.5],
    [1, 2.1, 0.1],
    Math.atan2(Math.cos(open), -Math.sin(open)),
    0,
    hex(DEFENSE_COLOR.pillboxSteel, 1.25),
  );

  // ---- the roof ----
  const roofXZ: [number, number][] = [
    [-4.7, 2.9],
    [4.7, 2.9],
    [5.6, 2],
    [5.6, -3],
    [4.7, -3.95],
    [-4.7, -3.95],
    [-5.6, -3],
    [-5.6, 2],
  ];
  const centre: [number, number] = [0, -0.5];
  const roofY = (z: number) => 5.3 + 0.025 * (2.9 - z); // the roof pitches up towards the back
  prism(ring(scaled(roofXZ, centre, 0.94), TOP), ring(roofXZ, 5.0), hex(DEFENSE_COLOR.pillboxRoof, 0.82)); // the corbel
  prism(
    ring(roofXZ, 5.0),
    ring(scaled(roofXZ, centre, 0.965), (_x, z) => roofY(z)),
    hex(DEFENSE_COLOR.pillboxRoof),
  );
  // the target mark: red and white blocks along the front lip and the right lip; plain blocks along the back
  const lip = (x0: number, x1: number, z0: number, z1: number, color: THREE.Color) => {
    const y = roofY((z0 + z1) / 2) - 0.02;
    box(x0, x1, y, y + 0.45, z0, z1, color);
  };
  const red = hex(DEFENSE_COLOR.pillboxMark);
  const white = hex(DEFENSE_COLOR.pillboxMarkWhite);
  for (let i = 0; i < 10; i++) lip(-4.5 + i * 0.9, -4.5 + (i + 1) * 0.9, 2.4, 2.8, i % 2 === 0 ? red : white);
  for (let i = 0; i < 8; i++) lip(4.95, 5.35, -3.5 + i * 0.7, -3.5 + (i + 1) * 0.7, i % 2 === 0 ? red : white);
  for (let i = 0; i < 4; i++) lip(-4.5 + i * 2.25, -4.5 + (i + 1) * 2.25, -3.65, -3.4, dirt(0.88));
  for (let i = 0; i < 8; i++) lip(-5.3, -5.0, -3.5 + i * 0.7, -3.5 + (i + 1) * 0.7, dirt(0.9));

  // a cupola on the back right of the roof, with its slit, and a mast
  const cupola: [number, number][] = [
    [1.9, -1.3],
    [4.5, -1.3],
    [4.5, -3.2],
    [1.9, -3.2],
  ];
  prism(ring(cupola, 5.4), ring(scaled(cupola, [3.2, -2.25], 0.82), 5.82), dirt(0.95));
  box(2.5, 3.9, 5.56, 5.7, -1.45, -1.18, dark);
  box(2.4, 4.0, 5.5, 5.56, -1.45, -1.2, steel);
  rod([4.1, 5.8, -2.8], [4.1, 6.0, -2.8], 0.03, 0.02, 5, steel);
  // two vent pipes with hats, and a squat chimney
  for (const [x, z] of [
    [-4.2, 1.1],
    [-3.5, 0.2],
  ] as const) {
    rod([x, 5.35, z], [x, 5.8, z], 0.13, 0.13, 8, steel);
    rod([x, 5.8, z], [x, 5.9, z], 0.24, 0.05, 8, steelLight);
  }
  box(-2.2, -1.6, 5.36, 5.75, -1.8, -1.2, dirt(0.85));

  // the camouflage net: a ragged sheet over the roof, held up on posts, hanging over the front-left edge
  const netBase = (x: number, z: number) =>
    5.78 + 0.05 * Math.sin(x * 1.3 + z * 0.7) + 0.04 * Math.sin(z * 2.1 - x * 0.5);
  const netColors = [DEFENSE_COLOR.pillboxNet, DEFENSE_COLOR.pillboxNetDark, DEFENSE_COLOR.pillboxNetBrown];
  const NX = 22;
  const NZ = 15;
  const x0 = -4.9;
  const x1 = 4.9;
  const z0 = -3.7;
  const z1 = 1.9;
  const patch = (i: number, j: number) =>
    netColors[Math.floor(Math.abs(Math.sin(i * 0.9 + j * 1.7) * 3.4 + Math.cos(i * 0.3 - j * 0.8) * 2)) % 3];
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const xa = x0 + ((x1 - x0) * i) / NX,
        xb = x0 + ((x1 - x0) * (i + 1)) / NX;
      const za = z0 + ((z1 - z0) * j) / NZ,
        zb = z0 + ((z1 - z0) * (j + 1)) / NZ;
      const centreX = (xa + xb) / 2;
      const centreZ = (za + zb) / 2;
      if (centreX > 1.6 && centreX < 4.8 && centreZ < -1.1) continue; // the cupola stands through the net
      const edge = i === 0 || j === 0 || i === NX - 1 || j === NZ - 1;
      if (rand() < (edge ? 0.35 : 0.07)) continue; // a hole, or a ragged edge
      const colour = shade(patch(i, j), 0.12);
      const P = (x: number, z: number): V => [x, netBase(x, z), z];
      sheetTri(P(xa, za), P(xb, za), P(xb, zb), [0, 1, 0], colour);
      sheetTri(P(xa, za), P(xb, zb), P(xa, zb), [0, 1, 0], colour);
    }
  }
  for (let i = 0; i < 11; i++) {
    const xa = -4.9 + i * 0.9;
    const drop = range(0.2, 0.55);
    const colour = shade(pick(netColors), 0.1);
    sheetTri(
      [xa, netBase(xa, 1.9), 1.9],
      [xa + 0.9, netBase(xa + 0.9, 1.9), 1.9],
      [xa + 0.9, 5.45 - drop * 0.5, 2.2],
      [0, 0.5, 1],
      colour,
    );
    sheetTri(
      [xa, netBase(xa, 1.9), 1.9],
      [xa + 0.9, 5.45 - drop * 0.5, 2.2],
      [xa, 5.45 - drop, 2.2],
      [0, 0.5, 1],
      colour,
    );
  }
  for (let j = 0; j < 8; j++) {
    const za = -3.7 + j * 0.7;
    const drop = range(0.15, 0.6);
    const colour = shade(pick(netColors), 0.1);
    sheetTri(
      [x0, netBase(x0, za), za],
      [x0, netBase(x0, za + 0.7), za + 0.7],
      [-5.15, 5.4 - drop * 0.6, za + 0.7],
      [-1, 0.5, 0],
      colour,
    );
    sheetTri(
      [x0, netBase(x0, za), za],
      [-5.15, 5.4 - drop * 0.6, za + 0.7],
      [-5.15, 5.4 - drop, za],
      [-1, 0.5, 0],
      colour,
    );
  }
  for (const [x, z] of [
    [-4.5, -3.2],
    [-2, -3.2],
    [-4.6, 0],
    [-1, 1.2],
    [1.6, 1.2],
    [0.4, -0.8],
    [3.4, 1.2],
  ] as const) {
    rod([x, roofY(z), z], [x, netBase(x, z) - 0.01, z], 0.04, 0.04, 5, hex(0x4a3d2c));
  }

  // ---- the faces: formwork panels, pour lines, tie holes ----
  const weights = faces.map(f => (f.u[1] - f.u[0]) * (f.v[1] - f.v[0]));
  const total = weights.reduce((a, b) => a + b, 0);
  for (let n = 0; n < 70; n++) {
    let roll = rand() * total;
    let face = faces[0];
    for (let k = 0; k < faces.length; k++) {
      roll -= weights[k];
      if (roll <= 0) {
        face = faces[k];
        break;
      }
    }
    const w = range(0.7, 1.8);
    const h = range(0.4, 0.85);
    const u = range(face.u[0] + w / 2, face.u[1] - w / 2);
    const v = range(face.v[0] + h / 2, face.v[1] - h / 2);
    if (
      ![
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].every(([a, b]) => free(face, u + (a * w) / 2, v + (b * h) / 2, 0.05))
    )
      continue;
    slab(face, u - w / 2, u + w / 2, v - h / 2, v + h / 2, range(0.025, 0.07), dirt(range(0.8, 1)));
  }
  const groove = hex(0x4e4c47);
  for (const face of faces) {
    for (const v of [2.4, 3.1, 3.8, 4.45]) {
      for (let u = face.u[0]; u < face.u[1] - 0.3; u += 0.65) {
        if (rand() < 0.15) continue;
        if (!free(face, u + 0.3, v, 0.06) || !free(face, u, v, 0.06)) continue;
        decal(
          face,
          [
            [u, v - 0.015],
            [u + 0.65, v - 0.015],
            [u + 0.65, v + 0.015],
            [u, v + 0.015],
          ],
          0.085,
          groove,
        );
      }
    }
    for (let u = face.u[0] + 0.5; u < face.u[1]; u += 1.2) {
      for (const v of [2.75, 3.45, 4.15]) {
        if (!free(face, u, v, 0.1)) continue;
        decal(
          face,
          [
            [u - 0.045, v - 0.045],
            [u + 0.045, v - 0.045],
            [u + 0.045, v + 0.045],
            [u - 0.045, v + 0.045],
          ],
          0.09,
          groove,
        );
      }
    }
  }

  // cracks: a walk down a face with a branch or two, each segment a thin strip
  const crack = hex(DEFENSE_COLOR.crack);
  const walk = (
    face: Face,
    startU: number,
    startV: number,
    steps: number,
    lean: number,
    width: number,
    branch: boolean,
  ) => {
    let u = startU;
    let v = startV;
    let angle = Math.PI / 2 + lean;
    for (let s = 0; s < steps; s++) {
      angle += range(-0.5, 0.5);
      const length = range(0.25, 0.6);
      const nu = u + Math.cos(angle) * length;
      const nv = v - Math.sin(angle) * length;
      if (!free(face, nu, nv, 0.08)) return;
      const w = width * (1 - s / (steps + 2));
      decal(
        face,
        [
          [u - w, v],
          [u + w, v],
          [nu + w * 0.6, nv],
          [nu - w * 0.6, nv],
        ],
        0.1,
        crack,
      );
      if (branch && s > 0 && rand() < 0.35)
        walk(face, u, v, 2 + Math.floor(rand() * 2), lean + range(-1, 1), width * 0.6, false);
      u = nu;
      v = nv;
    }
  };
  for (let n = 0; n < 30; n++) {
    const face = pick(faces);
    walk(
      face,
      range(face.u[0], face.u[1]),
      range(3.4, face.v[1]),
      3 + Math.floor(rand() * 5),
      range(-0.5, 0.5),
      range(0.03, 0.06),
      true,
    );
  }

  // rain streaks under the roof, and the dark stain along the foot of the walls
  for (let n = 0; n < 34; n++) {
    const face = pick(faces);
    const u = range(face.u[0], face.u[1]);
    const length = range(0.7, 2.2);
    const w = range(0.05, 0.16);
    const top = face.v[1] - 0.02;
    if (!free(face, u, top - length / 2, 0.1) || !free(face, u, top - length, 0.1)) continue;
    const light = rand() < 0.35;
    decal(
      face,
      [
        [u - w, top],
        [u + w, top],
        [u + w * 0.5, top - length],
        [u - w * 0.5, top - length],
      ],
      0.075,
      light ? hex(0xe8e4dc) : hex(DEFENSE_COLOR.pillboxStain, 0.8),
    );
  }
  for (const face of [front, back, left, right]) {
    const lowV = face === front ? 2.3 : 2.1;
    decal(
      face,
      [
        [face.u[0], lowV],
        [face.u[1], lowV],
        [face.u[1], lowV - 0.5],
        [face.u[0], lowV - 0.5],
      ],
      0.05,
      hex(0x77736c),
    );
  }

  // chipped spots: a dark ragged patch with bars of rebar left standing out of it
  const rebar = hex(DEFENSE_COLOR.rebar, 0.85);
  const chips: [Face, number, number][] = [
    [right, -2.2, 4.3],
    [right, 0.5, 3.9],
    [front, 3.7, 4.3],
    [front, -3.9, 3.0],
    [back, -3.6, 4.2],
    [left, 1.0, 4.2],
  ];
  for (const [face, u, v] of chips) {
    const r = range(0.3, 0.5);
    const patchPoints: [number, number][] = Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2;
      const k = range(0.6, 1.2);
      return [u + Math.cos(angle) * r * k, v + Math.sin(angle) * r * k * 0.8] as [number, number];
    });
    decal(face, patchPoints, 0.07, hex(0x4a4742));
    decal(
      face,
      patchPoints.map(([pu, pv]) => [u + (pu - u) * 0.55, v + (pv - v) * 0.55] as [number, number]),
      0.095,
      hex(0x2b2926),
    );
    for (let b = 0; b < 4; b++) {
      const bu = u + range(-r * 0.6, r * 0.6);
      const bv = v + range(-r * 0.4, r * 0.4);
      const a = at(face, bu, bv, 0.07);
      const out = range(0.35, 0.7);
      const bend = range(-0.18, 0.18);
      const mid: V = [
        a[0] + face.N[0] * out * 0.6,
        a[1] + range(0.05, 0.15),
        a[2] + face.N[2] * out * 0.6 + face.U[2] * bend,
      ];
      const end: V = [
        mid[0] + face.N[0] * out * 0.4 + face.U[0] * bend,
        mid[1] - range(0.05, 0.25),
        mid[2] + face.N[2] * out * 0.4 + face.U[2] * bend,
      ];
      rod(a, mid, 0.03, 0.03, 5, rebar);
      rod(mid, end, 0.03, 0.025, 5, rebar);
    }
  }

  // a grille on the back wall, a ladder up the right wall, a conduit along it
  box(-1.0, 1.0, 2.9, 3.9, BACK - 0.1, BACK, steel);
  for (let i = 0; i < 6; i++) box(-0.9, 0.9, 3.0 + i * 0.15, 3.05 + i * 0.15, BACK - 0.14, BACK - 0.04, dark);
  rod([SIDE + 0.12, Y0, -1.8], [SIDE + 0.12, 5.2, -1.8], 0.035, 0.035, 5, steelLight);
  rod([SIDE + 0.12, Y0, -1.3], [SIDE + 0.12, 5.2, -1.3], 0.035, 0.035, 5, steelLight);
  for (let i = 0; i < 11; i++)
    rod([SIDE + 0.12, 1.0 + i * 0.4, -1.8], [SIDE + 0.12, 1.0 + i * 0.4, -1.3], 0.03, 0.03, 5, steelLight);
  rod([SIDE + 0.15, 4.2, -2.5], [SIDE + 0.15, 4.2, 0.9], 0.09, 0.09, 6, hex(0x4c4a45));
  for (const z of [-2.2, -0.2, 0.7]) box(SIDE, SIDE + 0.2, 4.12, 4.28, z - 0.06, z + 0.06, steel);

  // ---- sandbags ----
  const earth = (f = 1) => shade(DEFENSE_COLOR.pillboxEarth, 0.1).multiplyScalar(f);
  const courseEdge = [5.7, 5.2, 4.6, 3.8]; // the stack steps in at the ends as it rises
  for (let course = 0; course < 4; course++) {
    const y = Y0 + 0.19 + course * 0.37;
    const edge = courseEdge[course];
    const n = Math.floor((edge * 2) / 1.05);
    for (let i = 0; i < n; i++) {
      const x = -edge + 0.55 + i * ((edge * 2 - 1.1) / (n - 1)) + (course % 2 === 0 ? 0 : 0.28) + range(-0.04, 0.04);
      if (Math.abs(x) > edge - 0.3) continue;
      const zFront = 3.18 + range(-0.07, 0.07) + (course % 2 === 0 ? 0.05 : -0.05);
      bag(
        [x, y + range(-0.02, 0.03), zFront],
        [range(1.0, 1.2), range(0.36, 0.44), range(0.62, 0.78)],
        range(-0.14, 0.14),
        range(-0.07, 0.07),
        earth(),
      );
      // a second row behind the first, hidden but for the top
      if (course >= 2 && Math.abs(x) < edge - 0.5) {
        bag(
          [x + 0.1, y + 0.2, zFront - 0.55],
          [range(1.0, 1.15), range(0.34, 0.4), range(0.6, 0.72)],
          range(-0.2, 0.2),
          range(-0.06, 0.06),
          earth(0.96),
        );
      }
    }
  }
  // bags in front of the left doorway: an L of three courses
  for (let course = 0; course < 3; course++) {
    for (let i = 0; i < 3; i++) {
      bag(
        [-5.62 + range(-0.05, 0.05), Y0 + 0.19 + course * 0.37, 0.95 + i * 0.75 + (course % 2) * 0.3],
        [range(0.62, 0.74), range(0.36, 0.42), range(0.95, 1.1)],
        range(-0.1, 0.1),
        range(-0.05, 0.05),
        earth(),
      );
    }
  }
  for (let i = 0; i < 2; i++) {
    bag([-5.55, Y0 + 0.19, -2.4 - i * 0.2], [0.65, 0.4, 1.0], range(-0.2, 0.2), 0, earth());
  }
  // a few loose bags on the ground, one slumped and split
  for (const [x, z, flat] of [
    [-5.0, 3.5, 1],
    [4.9, 3.5, 1],
    [4.1, 3.65, 0.55],
    [-3.6, 3.65, 0.7],
    [1.2, 3.65, 0.6],
    [5.3, 2.4, 0.8],
  ] as const) {
    bag(
      [x, Y0 + 0.1 * flat, z],
      [range(0.9, 1.1), 0.3 * flat, range(0.6, 0.7)],
      range(0, Math.PI),
      range(-0.1, 0.1),
      earth(0.9),
    );
  }

  // ---- rubble on the plinth, where the chips fell ----
  for (let n = 0; n < 20; n++) {
    const onSide = rand() < 0.5;
    const x = onSide ? pick([-5.5, 5.6]) + range(-0.1, 0.1) : range(-4.5, 4.5);
    const z = onSide ? range(-3.2, 0.6) : pick([-3.65, -3.7]);
    const size = range(0.14, 0.3);
    turned(
      [x, Y0 + size * 0.35, z],
      [size * range(0.8, 1.4), size * range(0.5, 0.9), size * range(0.8, 1.3)],
      range(0, Math.PI),
      range(-0.4, 0.4),
      dirt(range(0.6, 0.9)),
    );
  }
  for (const [x, z] of [
    [-5.5, 2.6],
    [5.4, 2.2],
    [-2.2, 3.0],
  ] as const) {
    for (let n = 0; n < 3; n++) {
      const size = range(0.12, 0.3);
      turned(
        [x + range(-0.4, 0.4), Y0 + size * 0.3, z + range(-0.3, 0.3)],
        [size * 1.2, size * 0.7, size],
        range(0, Math.PI),
        range(-0.4, 0.4),
        dirt(range(0.6, 0.85)),
      );
    }
  }

  // ---- the foot is dirtier than the top: splash from the ground ----
  for (let i = 0; i < pos.length / 3; i++) {
    const y = pos[i * 3 + 1];
    if (y > 1.4) continue;
    const k = 0.78 + (0.22 * Math.max(0, y - Y0)) / 0.9;
    col[i * 3] *= Math.min(1, k);
    col[i * 3 + 1] *= Math.min(1, k);
    col[i * 3 + 2] *= Math.min(1, k);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geometry;
}
