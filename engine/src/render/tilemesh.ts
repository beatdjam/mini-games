import * as THREE from 'three';
import { H, RISE, T, W, cover, grid, hgt, inBounds, ramp, tileCenter } from '../world/tiles.ts';
// engine: The meshes of a level built of tiles (engine/src/world/tiles.ts: the tile world being built): the floor, the
// walls that can be seen, the raised decks and the ramps, a flat ceiling, and flat squares on chosen tiles. What they
// look like (the pictures, the height of the walls, the ceiling's colour) comes from the game

// A wedge rising RISE toward +x across one tile, for a ramp (turned per ramp direction: RAMP_ROT). Two material
// groups: 0 the slope, 1 the end and the two sides. slices 0: each side is one triangle, the picture stretched over it.
// slices n: each side is cut into n slices across, each with the picture's full height, the top of the picture along
// the slope (the way a deck's side takes it, so where a ramp meets the deck it climbs to, the two sides match)
export function wedgeGeo(slices = 0) {
  type P3 = [number, number, number];
  const a = T / 2,
    r = RISE,
    pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const quad = (p0: P3, p1: P3, p2: P3, p3: P3, u0 = 0, u1 = 1) => {
    const b = pos.length / 3;
    pos.push(...p0, ...p1, ...p2, ...p3);
    uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
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
  if (!slices) {
    tri([-a, 0, -a], [a, 0, -a], [a, r, -a]);
    tri([-a, 0, a], [a, r, a], [a, 0, a]);
  }
  // the two sides, slice by slice (the first slice's quad is a triangle: its low edge has no height)
  for (let n = 0; n < slices; n++) {
    const f0 = n / slices,
      f1 = (n + 1) / slices,
      x0 = -a + f0 * T,
      x1 = -a + f1 * T;
    // (each side read from outside: the picture's left edge on the left)
    quad([x1, 0, -a], [x0, 0, -a], [x0, r * f0, -a], [x1, r * f1, -a], 1 - f1, 1 - f0);
    quad([x0, 0, a], [x1, 0, a], [x1, r * f1, a], [x0, r * f0, a], f0, f1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, 6, 0);
  g.addGroup(6, idx.length - 6, 1);
  return g;
}
// the turn about y of a ramp per its direction (tiles.ts ramp: 0..3)
export const RAMP_ROT = [0, Math.PI, -Math.PI / 2, Math.PI / 2];

// does a floor tile (grid 1) lie within the 8 tiles around (i, j), or on it
export function touchesFloor(i: number, j: number): boolean {
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const ni = i + di,
        nj = j + dj;
      if (inBounds(ni, nj) && grid[nj * W + ni] === 1) return true;
    }
  return false;
}

// the solid tiles that touch a floor tile: the only walls that can be seen
export function wallTiles(): [number, number][] {
  const tiles: [number, number][] = [];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (grid[j * W + i] === 1) continue;
      if (touchesFloor(i, j)) tiles.push([i, j]);
    }
  return tiles;
}

// the whole floor as one plane, the picture once per tile
export function addFloor(tex: THREE.Texture, group: THREE.Group) {
  tex.repeat.set(W, H);
  const geo = new THREE.PlaneGeometry(W * T, H * T);
  geo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
  floor.position.set((W * T) / 2, 0, (H * T) / 2);
  group.add(floor);
}

// one box `height` tall on each of the tiles (wallTiles: the walls that can be seen)
export function addWalls(tex: THREE.Texture, tiles: [number, number][], height: number, group: THREE.Group) {
  if (!tiles.length) return;
  const matrix = new THREE.Matrix4();
  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(T, height, T),
    new THREE.MeshBasicMaterial({ map: tex }),
    tiles.length,
  );
  tiles.forEach(([i, j], n) => {
    matrix.makeTranslation(tileCenter(i), height / 2, tileCenter(j));
    walls.setMatrixAt(n, matrix);
  });
  walls.instanceMatrix.needsUpdate = true;
  group.add(walls);
}

// what the raised tiles look like: the top, the sides, and the sides of cover (a cover tile: tiles.ts cover), which
// are `cover` tinted by `coverTint`
export interface DeckLook {
  top: THREE.Texture;
  side: THREE.Texture;
  cover: THREE.Texture;
  coverTint: number;
  skipCover?: boolean; // the cover tiles are not drawn here (the game draws them its own way)
}
// raised decks, walkways and cover (not ramps): one box per tile, scaled to the tile's height
export function addDecks(look: DeckLook, group: THREE.Group) {
  const matrix = new THREE.Matrix4();
  const raised: number[] = [];
  for (let k = 0; k < W * H; k++) if (grid[k] === 1 && ramp[k] < 0 && hgt[k] > 0) raised.push(k);
  const sideMat = new THREE.MeshBasicMaterial({ map: look.side }),
    topMat = new THREE.MeshBasicMaterial({ map: look.top });
  const coverSideMat = new THREE.MeshBasicMaterial({ map: look.cover, color: look.coverTint });
  (
    [
      [raised.filter(k => !cover[k]), sideMat],
      [look.skipCover ? [] : raised.filter(k => cover[k]), coverSideMat],
    ] as [number[], THREE.Material][]
  ).forEach(([tiles, mat]) => {
    if (!tiles.length) return;
    const geo = new THREE.BoxGeometry(T, 1, T);
    geo.translate(0, 0.5, 0);
    const decks = new THREE.InstancedMesh(geo, [mat, mat, topMat, mat, mat, mat], tiles.length);
    tiles.forEach((k, n) => {
      matrix.makeScale(1, hgt[k], 1);
      matrix.setPosition(tileCenter(k % W), 0, tileCenter((k / W) | 0));
      decks.setMatrixAt(n, matrix);
    });
    decks.instanceMatrix.needsUpdate = true;
    group.add(decks);
  });
}

// the ramps: a wedge (wedgeGeo, cut into `slices`) on each ramp tile, its slope in `top` and its sides in `side`
export function addRamps(top: THREE.Texture, side: THREE.Texture, slices: number, group: THREE.Group) {
  const topMat = new THREE.MeshBasicMaterial({ map: top, side: THREE.DoubleSide }),
    sideMat = new THREE.MeshBasicMaterial({ map: side, side: THREE.DoubleSide });
  const geo = wedgeGeo(slices);
  for (let k = 0; k < W * H; k++) {
    if (grid[k] !== 1 || ramp[k] < 0) continue;
    const mesh = new THREE.Mesh(geo, [topMat, sideMat]);
    mesh.position.set(tileCenter(k % W), hgt[k], tileCenter((k / W) | 0));
    mesh.rotation.y = RAMP_ROT[ramp[k]];
    group.add(mesh);
  }
}

// a flat ceiling over the whole level, `height` up
export function addCeiling(color: THREE.Color, height: number, group: THREE.Group) {
  const geo = new THREE.PlaneGeometry(W * T, H * T);
  geo.rotateX(Math.PI / 2);
  const ceiling = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  ceiling.position.set((W * T) / 2, height, (H * T) / 2);
  group.add(ceiling);
}

// one flat square per tile at height y, facing up or down
export function addTilePlanes(tiles: number[], y: number, up: boolean, mat: THREE.Material, group: THREE.Group) {
  if (!tiles.length) return;
  const geo = new THREE.PlaneGeometry(T, T);
  geo.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, mat, tiles.length),
    matrix = new THREE.Matrix4();
  tiles.forEach((k, n) => {
    matrix.makeTranslation(tileCenter(k % W), y, tileCenter((k / W) | 0));
    mesh.setMatrixAt(n, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}
