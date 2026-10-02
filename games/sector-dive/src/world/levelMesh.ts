import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { UP } from '@engine/render/render.ts';
import { H, RISE, T, W, cover, grid, hgt, isSolid, ramp } from '@engine/world/tiles.ts';
import { WALL_H } from '../data/level.ts';
import type { Biome } from '../data/types.ts';
import { COLOR } from '../data/colors.ts';
import { biomeTex } from './render.ts';
import { buildHazardMesh } from './hazards.ts';
import type { GeneratedLevel } from './levelGen.ts';
const NEON_COUNT = 90; // neon signs per level

// wedge rising toward +x across one tile; rotated per ramp direction
export function wedgeGeo() {
  type P3 = [number, number, number];
  const a = T / 2,
    r = RISE,
    pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const quad = (p0: P3, p1: P3, p2: P3, p3: P3) => {
    const b = pos.length / 3;
    pos.push(...p0, ...p1, ...p2, ...p3);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const tri = (p0: P3, p1: P3, p2: P3) => {
    const b = pos.length / 3;
    pos.push(...p0, ...p1, ...p2);
    uv.push(0, 0, 1, 0, 1, 1);
    idx.push(b, b + 1, b + 2);
  };
  quad([-a, 0, -a], [a, r, -a], [a, r, a], [-a, 0, a]);
  quad([a, 0, -a], [a, 0, a], [a, r, a], [a, r, -a]);
  tri([-a, 0, -a], [a, 0, -a], [a, r, -a]);
  tri([-a, 0, a], [a, r, a], [a, 0, a]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, 6, 0);
  g.addGroup(6, 12, 1);
  return g;
}
export const RAMP_ROT = [0, Math.PI, -Math.PI / 2, Math.PI / 2];

// The three.js part of a level: floor, walls, decks, ramps, cover, hazard floor, ceiling and neon signs. Reads the
// tile world (set from gen first). rng only places the signs, so the same seed gives the same look.
export function buildLevelMeshes(biome: Biome, isArena: boolean, gen: GeneratedLevel, group: THREE.Group, rng: Rng) {
  const lg = group;
  const tex = biomeTex(biome);
  tex.floor.repeat.set(W, H);
  const fgeo = new THREE.PlaneGeometry(W * T, H * T);
  fgeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(fgeo, new THREE.MeshBasicMaterial({ map: tex.floor }));
  floor.position.set((W * T) / 2, 0, (H * T) / 2);
  lg.add(floor);
  const m = new THREE.Matrix4();
  // walls
  const list: [number, number][] = [];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (grid[j * W + i] === 1) continue;
      let near = false;
      for (let dj = -1; dj <= 1 && !near; dj++)
        for (let di = -1; di <= 1; di++) {
          const a = i + di,
            b = j + dj;
          if (a >= 0 && b >= 0 && a < W && b < H && grid[b * W + a] === 1) {
            near = true;
            break;
          }
        }
      if (near) list.push([i, j]);
    }
  const inst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(T, WALL_H, T),
    new THREE.MeshBasicMaterial({ map: tex.wall }),
    list.length,
  );
  list.forEach(([i, j], k) => {
    m.makeTranslation((i + 0.5) * T, WALL_H / 2, (j + 0.5) * T);
    inst.setMatrixAt(k, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  lg.add(inst);
  // raised decks, walkways and cover
  const raised: number[] = [];
  for (let k = 0; k < W * H; k++) if (grid[k] === 1 && ramp[k] < 0 && hgt[k] > 0) raised.push(k);
  const side = new THREE.MeshBasicMaterial({ map: tex.wall }),
    top = new THREE.MeshBasicMaterial({ map: tex.tile });
  const coverSide = new THREE.MeshBasicMaterial({ map: tex.wall, color: 0x9a9a9a });
  (
    [
      [raised.filter(k => !cover[k]), side],
      [raised.filter(k => cover[k]), coverSide],
    ] as [number[], THREE.Material][]
  ).forEach(([ks, sm]) => {
    if (!ks.length) return;
    const bg = new THREE.BoxGeometry(T, 1, T);
    bg.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(bg, [sm, sm, top, sm, sm, sm], ks.length);
    ks.forEach((k, n) => {
      m.makeScale(1, hgt[k], 1);
      m.setPosition(((k % W) + 0.5) * T, 0, (((k / W) | 0) + 0.5) * T);
      im.setMatrixAt(n, m);
    });
    im.instanceMatrix.needsUpdate = true;
    lg.add(im);
  });
  const rampTop = new THREE.MeshBasicMaterial({ map: tex.tile, side: THREE.DoubleSide }),
    rampSide = new THREE.MeshBasicMaterial({ map: tex.wall, side: THREE.DoubleSide });
  const wg = wedgeGeo();
  for (let k = 0; k < W * H; k++) {
    if (grid[k] !== 1 || ramp[k] < 0) continue;
    const rm = new THREE.Mesh(wg, [rampTop, rampSide]);
    rm.position.set(((k % W) + 0.5) * T, hgt[k], (((k / W) | 0) + 0.5) * T);
    rm.rotation.y = RAMP_ROT[ramp[k]];
    lg.add(rm);
  }
  buildHazardMesh(biome, gen.hazard, lg);
  // ceiling and neon signs (sectors with gen.ceiling / gen.neon)
  if (biome.gen.ceiling && !isArena) {
    const cg = new THREE.PlaneGeometry(W * T, H * T);
    cg.rotateX(Math.PI / 2);
    const ceil = new THREE.Mesh(
      cg,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(biome.wall).multiplyScalar(0.7) }),
    );
    ceil.position.set((W * T) / 2, WALL_H, (H * T) / 2);
    lg.add(ceil);
  }
  if (biome.gen.neon && !isArena) {
    const spots: [number, number, number, number][] = [];
    list.forEach(([i, j]) =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].forEach(([a, b]) => {
        if (!isSolid(i + a, j + b)) spots.push([i, j, a, b]);
      }),
    );
    const pickSpots = rng.shuffle(spots).slice(0, NEON_COUNT),
      colors = [0xff3d8a, 0x3dffb4, 0xffd23d, 0x4dc3ff, COLOR.violet];
    const im = new THREE.InstancedMesh(
      new THREE.BoxGeometry(T * 0.55, 0.45, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      pickSpots.length,
    );
    const q = new THREE.Quaternion(),
      s1 = new THREE.Vector3(1, 1, 1),
      c = new THREE.Color();
    pickSpots.forEach(([i, j, a, b], n) => {
      q.setFromAxisAngle(UP, a !== 0 ? Math.PI / 2 : 0);
      m.compose(
        new THREE.Vector3((i + 0.5 + a * 0.52) * T, rng.rand(2.4, 4.8), (j + 0.5 + b * 0.52) * T),
        q,
        s1.set(rng.rand(0.5, 1.2), rng.rand(0.7, 1.6), 1),
      );
      im.setMatrixAt(n, m);
      im.setColorAt(n, c.setHex(rng.pick(colors)));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    lg.add(im);
  }
}
