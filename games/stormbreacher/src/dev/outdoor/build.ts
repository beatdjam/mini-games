// Turns the beach's layout (layout.ts) into what the screen draws: one instanced mesh per kind of thing, merged shapes
// so a hedgehog or a bunker costs one draw, and the chunks chunkInstances makes of the heavy kinds.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chunkInstances, type Chunk } from '@engine/render/index.ts';
import { PROP_SIZE, TARGET_SIZE, type PropSize, type TargetSize } from '../../data/props.ts';
import type { TargetKind, TargetPlace } from '../../data/types.ts';
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
const KINDS: OutdoorKind[] = ['tile', 'hedgehog', 'block', 'bunker', 'seawall', 'cliff', 'crater', 'wreck'];

export const TILE_COLOR = 0xc2a878; // the sand a tile is drawn in at scale 1

// Each kind's colour; the tile's material stays white and its colour comes from instanceColor instead.
const KIND_COLOR: Record<OutdoorKind, number> = {
  tile: 0xffffff,
  hedgehog: 0x666b6e,
  block: 0x9c978d,
  bunker: 0x7e7a72,
  seawall: 0x8b8880,
  cliff: 0x6e6759,
  crater: 0x8f7a58,
  wreck: 0x5a5148,
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

// Stretches a shape's bounding box to the size the table gives and puts its footprint over the item's place. A height
// of 0 leaves the shape's own height: the ground tiles and the craters are flat.
function fitBox(geometry: THREE.BufferGeometry, size: PropSize | TargetSize): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (bounds === null) return geometry;
  const center = bounds.getCenter(new THREE.Vector3());
  const own = bounds.getSize(new THREE.Vector3());
  geometry.translate(-center.x, -bounds.min.y, -center.z);
  const sx = own.x > 0 ? size.w / own.x : 1;
  const sy = size.h > 0 && own.y > 0 ? size.h / own.y : 1;
  const sz = own.z > 0 ? size.d / own.z : 1;
  return geometry.scale(sx, sy, sz);
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

// A shell crater: a low disc just above the ground, its colour darker than the sand's.
function craterGeometry(): THREE.BufferGeometry {
  return new THREE.CircleGeometry(3, 18).rotateX(-Math.PI / 2).translate(0, 0.03, 0);
}

// A broken boat or vehicle: a hull, a cabin and a tilted plate.
function wreckGeometry(): THREE.BufferGeometry {
  return merge([
    box(6, 1.4, 2.6, 0, 0.7, 0),
    box(2.4, 1.6, 2.2, -1.2, 2.2, 0, 0.25),
    box(3, 0.4, 1.4, 1.2, 1.7, 0.2, -0.2, 0.35),
  ]);
}

const SHAPES: Record<OutdoorKind, () => THREE.BufferGeometry> = {
  tile: () => fitBox(tileGeometry(), PROP_SIZE.tile),
  hedgehog: () => fitBox(hedgehogGeometry(), PROP_SIZE.hedgehog),
  block: () => fitBox(blockGeometry(), PROP_SIZE.block),
  bunker: () => fitBox(bunkerGeometry(), PROP_SIZE.bunker),
  seawall: () => fitBox(seawallGeometry(), PROP_SIZE.seawall),
  cliff: () => fitBox(cliffGeometry(), PROP_SIZE.cliff),
  crater: () => fitBox(craterGeometry(), PROP_SIZE.crater),
  wreck: () => fitBox(wreckGeometry(), PROP_SIZE.wreck),
};

const UP = new THREE.Vector3(0, 1, 0);

const BREAK_TINT = 0xd2402e; // the red a breakable prop leans towards

// One instanced mesh per kind, with each copy's place, turn and size in its matrix. A kind with a breakable prop gets an
// instance colour for every copy (white material, the kind's colour in the buffer), so the breakable ones can lean red
// without adding a draw.
function addKind(group: THREE.Group, kind: OutdoorKind, items: OutdoorItem[]) {
  const tinted = kind !== 'tile' && items.some(item => item.breakable === true);
  const mesh = new THREE.InstancedMesh(
    SHAPES[kind](),
    new THREE.MeshLambertMaterial({ color: tinted ? 0xffffff : KIND_COLOR[kind] }),
    items.length,
  );
  mesh.name = kind;
  const matrix = new THREE.Matrix4(),
    at = new THREE.Vector3(),
    turn = new THREE.Quaternion(),
    size = new THREE.Vector3(),
    color = new THREE.Color(),
    baseColor = new THREE.Color(KIND_COLOR[kind]),
    breakColor = baseColor.clone().lerp(new THREE.Color(BREAK_TINT), 0.45);
  items.forEach((item, i) => {
    at.set(item.x, 0, item.z);
    turn.setFromAxisAngle(UP, item.yaw);
    // the tile is always 4 m; its scale only darkens or lightens the sand
    const s = kind === 'tile' ? 1 : item.scale;
    size.set(s, s, s);
    matrix.compose(at, turn, size);
    mesh.setMatrixAt(i, matrix);
    if (kind === 'tile') mesh.setColorAt(i, color.setHex(TILE_COLOR).multiplyScalar(item.scale));
    else if (tinted) mesh.setColorAt(i, item.breakable === true ? breakColor : baseColor);
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

// The mission's targets, each a shape with its own colour so the four kinds are told apart from above: a low wide
// pillbox, a pile of crates for the depot, a base and barrel for the gun, and a square magazine.
function pillboxTargetGeometry(): THREE.BufferGeometry {
  return merge([box(10, 2.2, 6, 0, 1.1, 0), box(10.6, 0.6, 6.6, 0, 2.5, 0), box(3, 1, 1, 0, 1.8, 3.2)]);
}

function depotTargetGeometry(): THREE.BufferGeometry {
  return merge([box(4, 2, 4, -2, 1, 0), box(4, 2, 4, 2, 1, 0.5), box(4, 2, 4, 0, 3, 0.2), box(2, 1.4, 2, -2, 2.7, -1)]);
}

function gunTargetGeometry(): THREE.BufferGeometry {
  return merge([box(4, 1.4, 4, 0, 0.7, 0), box(1.2, 1.2, 5, 0, 1.7, 1.5)]);
}

function magazineTargetGeometry(): THREE.BufferGeometry {
  return merge([box(7, 4, 7, 0, 2, 0), box(8, 0.7, 8, 0, 4.3, 0), box(2, 2, 1, 0, 1, 4)]);
}

const TARGET_SHAPES: Record<TargetKind, () => THREE.BufferGeometry> = {
  pillbox: () => fitBox(pillboxTargetGeometry(), TARGET_SIZE.pillbox),
  depot: () => fitBox(depotTargetGeometry(), TARGET_SIZE.depot),
  gun: () => fitBox(gunTargetGeometry(), TARGET_SIZE.gun),
  magazine: () => fitBox(magazineTargetGeometry(), TARGET_SIZE.magazine),
};

const TARGET_COLORS: Record<TargetKind, number> = {
  pillbox: 0xb03a2e,
  depot: 0xd4a017,
  gun: 0x3f6f8f,
  magazine: 0x7a4fa0,
};

// The mission's targets as one group, each turned the way the map says.
export function buildTargets(targets: readonly TargetPlace[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'targets';
  for (const target of targets) {
    const mesh = new THREE.Mesh(
      TARGET_SHAPES[target.kind](),
      new THREE.MeshLambertMaterial({ color: TARGET_COLORS[target.kind] }),
    );
    mesh.name = target.id;
    mesh.position.set(target.x, 0, target.z);
    mesh.rotation.y = target.yaw;
    group.add(mesh);
  }
  return group;
}
