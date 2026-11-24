// The tools the fortress's models are built with (SB-2052): a vertex-coloured triangle soup with a few solids (a prism, a
// lofted shape with bevels, a box, a turned box, a rod, a lumpy bag) and flat decals laid on a face. A model made with
// them is one BufferGeometry, so a wall, the nest or a plate is still one draw. The same hands as view/pillboxModel.ts,
// kept in one place for the models that follow it.
import * as THREE from 'three';

export type V = [number, number, number];

// A small deterministic random sequence, so a model is the same every time it is built.
export function sequence(seed: number): () => number {
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

// A face of a body that decals and panels are laid on: u runs along it (to the viewer's right), v is the height, `out`
// is the distance off the face along its normal. `at` turns the three into a point of the model.
export interface Face {
  at: (u: number, v: number, out?: number) => V;
  normal: V;
}

export interface Kit {
  rand: () => number;
  range: (a: number, b: number) => number;
  pick: <T>(items: readonly T[]) => T;
  hex: (color: number, f?: number) => THREE.Color;
  shade: (color: number, spread: number) => THREE.Color;
  sheet: (points: V[], facing: V, color: THREE.Color) => void;
  prism: (bottom: V[], top: V[], color: THREE.Color) => void;
  loft: (rings: V[][], color: THREE.Color) => void;
  box: (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: THREE.Color) => void;
  bevelBox: (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    bevel: number,
    color: THREE.Color,
  ) => void;
  turned: (c: V, size: V, turnY: number, turnZ: number, color: THREE.Color) => void;
  tilted: (c: V, size: V, rx: number, ry: number, rz: number, color: THREE.Color) => void;
  rod: (a: V, b: V, r0: number, r1: number, seg: number, color: THREE.Color) => void;
  bag: (c: V, size: V, turnY: number, tilt: number, color: THREE.Color) => void;
  face: (origin: V, along: V, normal: V) => Face;
  decal: (f: Face, corners: [number, number][], out: number, color: THREE.Color) => void;
  slab: (f: Face, u0: number, u1: number, v0: number, v1: number, depth: number, color: THREE.Color) => void;
  ring: (xz: [number, number][], y: number) => V[];
  count: () => number;
  darken: (below: number, until: number, floor: number) => void;
  geometry: () => THREE.BufferGeometry;
}

// `uvMetres`: how many metres of the model one repeat of the concrete picture covers (the pictures are 6 m on a prop).
export function createKit(seed: number, uvMetres = 6): Kit {
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const col: number[] = [];
  const rand = sequence(seed);
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
      if (ax >= ay && ax >= az) uvs.push(p[2] / uvMetres, p[1] / uvMetres);
      else if (ay >= az) uvs.push(p[0] / uvMetres, p[2] / uvMetres);
      else uvs.push(p[0] / uvMetres, p[1] / uvMetres);
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

  // a convex solid through rings of the same count: the sides between each pair, a fan on each end
  const loft = (rings: V[][], color: THREE.Color) => {
    const middle = mean(rings.flat());
    const n = rings[0].length;
    for (let r = 0; r + 1 < rings.length; r++) {
      const lower = rings[r];
      const upper = rings[r + 1];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        solidTri(lower[i], lower[j], upper[j], middle, color);
        solidTri(lower[i], upper[j], upper[i], middle, color);
      }
    }
    const first = rings[0];
    const last = rings[rings.length - 1];
    for (let i = 1; i < n - 1; i++) {
      solidTri(first[0], first[i], first[i + 1], middle, color);
      solidTri(last[0], last[i], last[i + 1], middle, color);
    }
  };
  const prism = (bottom: V[], top: V[], color: THREE.Color) => loft([bottom, top], color);
  const rect = (x0: number, x1: number, y: number, z0: number, z1: number): V[] => [
    [x0, y, z0],
    [x1, y, z0],
    [x1, y, z1],
    [x0, y, z1],
  ];
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: THREE.Color) =>
    prism(rect(x0, x1, y0, z0, z1), rect(x0, x1, y1, z0, z1), color);
  // a box whose top and bottom edges are cut at 45 degrees by `bevel`
  const bevelBox = (
    xa: number,
    xb: number,
    ya: number,
    yb: number,
    za: number,
    zb: number,
    bevel: number,
    color: THREE.Color,
  ) => {
    const [x0, x1, y0, y1, z0, z1] = [
      Math.min(xa, xb),
      Math.max(xa, xb),
      Math.min(ya, yb),
      Math.max(ya, yb),
      Math.min(za, zb),
      Math.max(za, zb),
    ];
    const b = Math.min(bevel, (y1 - y0) / 2 - 0.001, (x1 - x0) / 2 - 0.001, (z1 - z0) / 2 - 0.001);
    loft(
      [
        rect(x0 + b, x1 - b, y0, z0 + b, z1 - b),
        rect(x0, x1, y0 + b, z0, z1),
        rect(x0, x1, y1 - b, z0, z1),
        rect(x0 + b, x1 - b, y1, z0 + b, z1 - b),
      ],
      color,
    );
  };
  const tilted = (c: V, size: V, rx: number, ry: number, rz: number, color: THREE.Color) => {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
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
  // a box turned about y (and tipped about z), for bags of rubble, rungs, panels at a slant
  const turned = (c: V, size: V, turnY: number, turnZ: number, color: THREE.Color) =>
    tilted(c, size, 0, turnY, turnZ, color);
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

  const face = (origin: V, along: V, normal: V): Face => ({
    normal,
    at: (u, v, out = 0) => [origin[0] + along[0] * u + normal[0] * out, v, origin[2] + along[2] * u + normal[2] * out],
  });
  const decal = (f: Face, corners: [number, number][], out: number, color: THREE.Color) =>
    sheet(
      corners.map(([u, v]) => f.at(u, v, out)),
      f.normal,
      color,
    );
  const slab = (f: Face, u0: number, u1: number, v0: number, v1: number, depth: number, color: THREE.Color) => {
    const a = f.at(u0, v0, 0);
    const b = f.at(u1, v1, depth);
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
  const ring = (xz: [number, number][], y: number): V[] => xz.map(([x, z]) => [x, y, z]);

  // the foot is dirtier than the top: splash from the ground, from `floor` at the ground to none at `until`
  const darken = (below: number, until: number, floor: number) => {
    for (let i = 0; i < pos.length / 3; i++) {
      const y = pos[i * 3 + 1];
      if (y > until) continue;
      const k = floor + ((1 - floor) * Math.max(0, y - below)) / (until - below);
      col[i * 3] *= Math.min(1, k);
      col[i * 3 + 1] *= Math.min(1, k);
      col[i * 3 + 2] *= Math.min(1, k);
    }
  };

  const geometry = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  };

  return {
    rand,
    range,
    pick,
    hex,
    shade,
    sheet,
    prism,
    loft,
    box,
    bevelBox,
    turned,
    tilted,
    rod,
    bag,
    face,
    decal,
    slab,
    ring,
    count: () => pos.length / 9,
    darken,
    geometry,
  };
}
