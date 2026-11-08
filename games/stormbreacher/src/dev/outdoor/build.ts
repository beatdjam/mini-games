// Turns the beach's layout (layout.ts) into what the screen draws: one instanced mesh per kind of thing, merged shapes
// so a hedgehog or a bunker costs one draw, and the chunks chunkInstances makes of the heavy kinds.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chunkInstances, type Chunk } from '@engine/render/index.ts';
import { TILE_SIZE, type OutdoorItem, type OutdoorKind } from './layout.ts';

export interface OutdoorBuildOpts {
  chunk: number; // the chunk side (m); 0 leaves everything in one instanced mesh per kind
  chunkMin: number; // only kinds with at least this many triangles in all are split into chunks
}

export interface OutdoorBuild {
  group: THREE.Group; // everything built, at the origin
  chunks: Chunk[]; // the chunks chunkInstances split out; empty when chunk is 0
  build: number; // how long the build took (ms)
}

// The order the kinds are built in (and drawn, until the chunks reorder them).
const KINDS: OutdoorKind[] = ['tile', 'hedgehog', 'block', 'bunker', 'seawall', 'cliff'];

const TILE_COLOR = 0xc2a878; // the sand a tile is drawn in at scale 1

// Each kind's colour; the tile's material stays white and its colour comes from instanceColor instead.
const KIND_COLOR: Record<OutdoorKind, number> = {
  tile: 0xffffff,
  hedgehog: 0x666b6e,
  block: 0x9c978d,
  bunker: 0x7e7a72,
  seawall: 0x8b8880,
  cliff: 0x6e6759,
};

// A box with its place baked in (the base sits on y = 0 when y is half its height).
function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  turnY = 0,
  turnZ = 0,
): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  if (turnZ) geometry.rotateZ(turnZ);
  if (turnY) geometry.rotateY(turnY);
  geometry.translate(x, y, z);
  return geometry;
}

// Joins parts into one shape, so one copy of the thing is one draw.
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return BufferGeometryUtils.mergeBufferGeometries(parts);
}

function tileGeometry(): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE).rotateX(-Math.PI / 2);
}

// Three thin beams crossed at the middle, the anti-tank hedgehog's shape.
function hedgehogGeometry(): THREE.BufferGeometry {
  const beam = 0.35; // the beam's thickness (m)
  const length = 3; // the beam's length (m)
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const geometry = new THREE.BoxGeometry(beam, length, beam);
    geometry.rotateZ(0.7);
    geometry.rotateY((i * Math.PI) / 3);
    geometry.translate(0, length / 2, 0);
    parts.push(geometry);
  }
  return merge(parts);
}

function blockGeometry(): THREE.BufferGeometry {
  return box(3, 2, 4, 0, 1, 0);
}

// A concrete bunker: a low body, a roof slab, a slit with two posts and a back parapet.
function bunkerGeometry(): THREE.BufferGeometry {
  return merge([
    box(9, 2.4, 7, 0, 1.2, 0),
    box(10, 0.8, 8, 0, 2.8, 0),
    box(2.2, 1.6, 1, -2.6, 2.4, 3.4),
    box(2.2, 1.6, 1, 2.6, 2.4, 3.4),
    box(4, 0.5, 1, 0, 3.1, 3.4),
    box(9, 1.2, 1, 0, 2.6, -3.6),
  ]);
}

function seawallGeometry(): THREE.BufferGeometry {
  return merge([box(8, 5, 4, 0, 2.5, 0), box(8.4, 0.6, 4.4, 0, 5.3, 0)]);
}

function cliffGeometry(): THREE.BufferGeometry {
  return merge([box(20, 24, 16, 0, 12, 0), box(8, 30, 10, 6, 15, 2)]);
}

const SHAPES: Record<OutdoorKind, () => THREE.BufferGeometry> = {
  tile: tileGeometry,
  hedgehog: hedgehogGeometry,
  block: blockGeometry,
  bunker: bunkerGeometry,
  seawall: seawallGeometry,
  cliff: cliffGeometry,
};

const UP = new THREE.Vector3(0, 1, 0);

// One instanced mesh per kind, with each copy's place, turn and size in its matrix.
function addKind(group: THREE.Group, kind: OutdoorKind, items: OutdoorItem[]) {
  const mesh = new THREE.InstancedMesh(
    SHAPES[kind](),
    new THREE.MeshLambertMaterial({ color: KIND_COLOR[kind] }),
    items.length,
  );
  mesh.name = kind;
  const matrix = new THREE.Matrix4(),
    at = new THREE.Vector3(),
    turn = new THREE.Quaternion(),
    size = new THREE.Vector3(),
    color = new THREE.Color();
  items.forEach((item, i) => {
    at.set(item.x, 0, item.z);
    turn.setFromAxisAngle(UP, item.yaw);
    // the tile is always 4 m; its scale only darkens or lightens the sand
    const s = kind === 'tile' ? 1 : item.scale;
    size.set(s, s, s);
    matrix.compose(at, turn, size);
    mesh.setMatrixAt(i, matrix);
    if (kind === 'tile') mesh.setColorAt(i, color.setHex(TILE_COLOR).multiplyScalar(item.scale));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);
}

// The whole beach: the items grouped by kind, built, and split into chunks when asked.
export function buildOutdoor(items: OutdoorItem[], opts: OutdoorBuildOpts): OutdoorBuild {
  const start = performance.now();
  const group = new THREE.Group();
  group.name = 'outdoor';

  const byKind = new Map<OutdoorKind, OutdoorItem[]>();
  for (const item of items) {
    const list = byKind.get(item.kind);
    if (list) list.push(item);
    else byKind.set(item.kind, [item]);
  }
  for (const kind of KINDS) {
    const list = byKind.get(kind);
    if (list) addKind(group, kind, list);
  }

  const chunks = opts.chunk > 0 ? chunkInstances(group, opts.chunk, opts.chunkMin) : [];
  return { group, chunks, build: performance.now() - start };
}
