// Turns the beach's layout (layout.ts) into what the screen draws: one instanced mesh per kind of thing, merged shapes
// so a hedgehog or a bunker costs one draw, and the chunks chunkInstances makes of the heavy kinds.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chunkInstances, type Chunk } from '@engine/render/index.ts';
import { SAND_COLOR } from '../data/colors.ts';
import { PROP_SIZE, TARGET_SIZE, TILE_SIZE, type PropSize, type TargetSize } from '../data/props.ts';
import type { Prop, PropKind, TargetKind, TargetPlace } from '../data/types.ts';

export interface OutdoorBuildOpts {
  chunk: number; // the chunk side (m); 0 leaves everything in one instanced mesh per kind
  chunkMin: number; // only kinds with at least this many triangles in all are split into chunks
  slotProps?: ReadonlySet<Prop>; // props to find a slot for beside the breakable ones (a blast's hedgehogs)
}

export interface PropSlot {
  mesh: THREE.InstancedMesh; // the mesh the copy stands in after the chunks were made
  index: number; // the copy's place among that mesh's matrices
}

export interface OutdoorBuild {
  group: THREE.Group; // everything built, at the origin
  chunks: Chunk[]; // the chunks chunkInstances split out; empty when chunk is 0
  slots: Map<Prop, PropSlot>; // where each breakable or blast-opened prop is drawn
  build: number; // how long the build took (ms)
}

// The order the kinds are built in (and drawn, until the chunks reorder them).
const KINDS: PropKind[] = [
  'tile',
  'hedgehog',
  'block',
  'bunker',
  'seawall',
  'cliff',
  'crater',
  'wreck',
  'lowWall',
  'stairs',
  'ramp',
];

export const TILE_COLOR = SAND_COLOR; // the sand a tile is drawn in at scale 1

// Each kind's colour; the tile's material stays white and its colour comes from instanceColor instead.
const KIND_COLOR: Record<PropKind, number> = {
  tile: 0xffffff,
  hedgehog: 0x666b6e,
  block: 0x9c978d,
  bunker: 0x7e7a72,
  seawall: 0x8b8880,
  cliff: 0x6e6759,
  crater: 0x8f7a58,
  wreck: 0x5a5148,
  lowWall: 0x8f8a80,
  stairs: 0x9a968c,
  ramp: 0x9a968c,
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

function lowWallGeometry(): THREE.BufferGeometry {
  return box(6, 0.85, 1, 0, 0.425, 0);
}

// A flight of stairs drawn as a slope (its rects are steps, but a slope reads better from afar): a box whose near top
// edge is lowered to the ground, so the top climbs towards -z and meets each step's far edge.
function stairsGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(8, 6, 13.5);
  geometry.translate(0, 3, 0);
  const at = geometry.getAttribute('position');
  for (let i = 0; i < at.count; i++) {
    if (at.getZ(i) > 0 && at.getY(i) > 0) at.setY(i, 0);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// A wedge for a ramp: the low edge on the ground at +z, the high edge at -z, a slanted top and two triangular sides.
// Its corners are laid out by hand so every face keeps its own normal; the slanted face then points up and towards +z
// instead of taking the near-horizontal normal a box's face would leave.
function rampGeometry(): THREE.BufferGeometry {
  const hw = PROP_SIZE.ramp.w / 2;
  const h = PROP_SIZE.ramp.h;
  const hd = PROP_SIZE.ramp.d / 2;
  // a: the low edge (+z, y 0); b: the high edge's foot (-z, y 0); c: the high edge's top (-z, y h)
  const a0 = [-hw, 0, hd];
  const a1 = [hw, 0, hd];
  const b0 = [-hw, 0, -hd];
  const b1 = [hw, 0, -hd];
  const c0 = [-hw, h, -hd];
  const c1 = [hw, h, -hd];
  const positions = [
    // the slanted top (up and towards +z)
    ...a0,
    ...a1,
    ...c1,
    ...a0,
    ...c1,
    ...c0,
    // the two triangular sides
    ...a0,
    ...c0,
    ...b0,
    ...a1,
    ...b1,
    ...c1,
    // the high end and the bottom
    ...b0,
    ...c1,
    ...b1,
    ...b0,
    ...c0,
    ...c1,
    ...a0,
    ...b0,
    ...b1,
    ...a0,
    ...b1,
    ...a1,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const SHAPES: Record<PropKind, () => THREE.BufferGeometry> = {
  tile: () => fitBox(tileGeometry(), PROP_SIZE.tile),
  hedgehog: () => fitBox(hedgehogGeometry(), PROP_SIZE.hedgehog),
  block: () => fitBox(blockGeometry(), PROP_SIZE.block),
  bunker: () => fitBox(bunkerGeometry(), PROP_SIZE.bunker),
  seawall: () => fitBox(seawallGeometry(), PROP_SIZE.seawall),
  cliff: () => fitBox(cliffGeometry(), PROP_SIZE.cliff),
  crater: () => fitBox(craterGeometry(), PROP_SIZE.crater),
  wreck: () => fitBox(wreckGeometry(), PROP_SIZE.wreck),
  lowWall: () => fitBox(lowWallGeometry(), PROP_SIZE.lowWall),
  stairs: () => fitBox(stairsGeometry(), PROP_SIZE.stairs),
  ramp: () => fitBox(rampGeometry(), PROP_SIZE.ramp),
};

const UP = new THREE.Vector3(0, 1, 0);

const BREAK_TINT = 0xd2402e; // the red a breakable prop leans towards
export const BROKEN_SCALE_Y = 0.2; // how tall a broken prop's copy is drawn (its height scale; 0 would hide it)
export const BROKEN_COLOR = 0x2a2622; // the dark colour a broken prop's copy keeps

// How close a copy's place must be to a prop's own x and z for it to be that prop's copy (m).
const SLOT_TOLERANCE = 0.01;

// One instanced mesh per kind, with each copy's place, turn and size in its matrix. A kind with a breakable prop gets an
// instance colour for every copy (white material, the kind's colour in the buffer), so the breakable ones can lean red
// without adding a draw.
function addKind(group: THREE.Group, kind: PropKind, items: Prop[]) {
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
export function buildOutdoor(items: Prop[], opts: OutdoorBuildOpts): OutdoorBuild {
  const start = performance.now();
  const group = new THREE.Group();
  group.name = 'outdoor';

  const byKind = new Map<PropKind, Prop[]>();
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
  // The chunks remake the matrices, so a prop is found by its kind and its place, not by an index.
  const slots = new Map<Prop, PropSlot>();
  for (const item of items) {
    if (item.breakable !== true && opts.slotProps?.has(item) !== true) continue;
    const slot = findSlot(group, item);
    if (slot) slots.set(item, slot);
  }
  return { group, chunks, slots, build: performance.now() - start };
}

// The copy of `prop` under `group` (inside the chunk roots too), or null when none is that close to its place.
function findSlot(group: THREE.Group, prop: Prop): PropSlot | null {
  const matrix = new THREE.Matrix4(),
    at = new THREE.Vector3();
  let found: PropSlot | null = null;
  group.traverse(child => {
    if (found || !(child instanceof THREE.InstancedMesh) || child.name !== prop.kind) return;
    for (let i = 0; i < child.count; i++) {
      child.getMatrixAt(i, matrix);
      at.setFromMatrixPosition(matrix);
      if (Math.abs(at.x - prop.x) > SLOT_TOLERANCE || Math.abs(at.z - prop.z) > SLOT_TOLERANCE) continue;
      found = { mesh: child, index: i };
      return;
    }
  });
  return found;
}

// Lowers and darkens one copy of a prop where it stands: the same mesh, so the number of draws does not grow.
export function breakPropSlot(slot: PropSlot): void {
  const matrix = new THREE.Matrix4(),
    at = new THREE.Vector3(),
    turn = new THREE.Quaternion(),
    size = new THREE.Vector3();
  slot.mesh.getMatrixAt(slot.index, matrix);
  matrix.decompose(at, turn, size);
  size.y *= BROKEN_SCALE_Y;
  matrix.compose(at, turn, size);
  slot.mesh.setMatrixAt(slot.index, matrix);
  slot.mesh.instanceMatrix.needsUpdate = true;
  if (slot.mesh.instanceColor) {
    slot.mesh.setColorAt(slot.index, new THREE.Color(BROKEN_COLOR));
    slot.mesh.instanceColor.needsUpdate = true;
  }
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
