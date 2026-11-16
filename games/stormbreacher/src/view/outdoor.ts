// Turns the beach's layout (layout.ts) into what the screen draws: one instanced mesh per kind of thing, merged shapes
// so a hedgehog or a bunker costs one draw, and the chunks chunkInstances makes of the heavy kinds.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chunkInstances, type Chunk } from '@engine/render/index.ts';
import { BURNT_COLOR, DEFENSE_COLOR, DRY_SAND_COLOR, RUST_COLOR, WET_SAND_COLOR } from '../data/colors.ts';
import { DEFENSE_DETAIL } from '../data/defenses.ts';
import { PROP_SIZE, TARGET_SIZE, TILE_SIZE, type PropSize, type TargetSize } from '../data/props.ts';
import { SAND_SURFACE } from '../data/surfaces.ts';
import type { Prop, PropKind, TargetKind, TargetPlace } from '../data/types.ts';
import { groundMaterial, surfaceMaterial, targetMaterial, type SurfaceName } from './surfaces.ts';

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

// Each kind's colour. The tile has none: its ground plane takes its colour from the look (view/look.ts). The concrete
// kinds sit around a grey 0x8a8780 so the overcast light does not turn them into glowing white boxes.
const KIND_COLOR: Record<Exclude<PropKind, 'tile'>, number> = {
  hedgehog: RUST_COLOR,
  block: 0x8a8780,
  bunker: 0x74716a,
  seawall: 0x7f7c76,
  cliff: 0x6e6759,
  crater: 0x8f7a58,
  wreck: BURNT_COLOR,
  lowWall: 0x827f78,
  stairs: 0x88857e,
  ramp: 0x88857e,
};

// The kinds that wear a surface picture (view/surfaces.ts). The cliff and the crater keep their colour alone.
const KIND_SURFACE: Partial<Record<PropKind, SurfaceName>> = {
  block: 'concrete',
  bunker: 'concrete',
  seawall: 'concrete',
  lowWall: 'concrete',
  stairs: 'concrete',
  ramp: 'concrete',
  hedgehog: 'rust',
  wreck: 'burnt',
};

// Puts one colour on every vertex, so a kind with several colours still draws in one instance. The surface materials
// read these colours and multiply them by the kind's own colour and the picture.
function tint<T extends THREE.BufferGeometry>(geometry: T, color: number): T {
  const at = geometry.getAttribute('position');
  const colors = new Float32Array(at.count * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < at.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// A box with its place baked in (the base sits on y = 0 when y is half its height). The colour is white unless a part
// of a detailed shape asks for its own; every shape carries the attribute so the surfaces can read it in one draw.
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
  return tint(geometry, 0xffffff);
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

// One beam as an L: a web and a flange sharing a corner, so the steel reads as angle iron rather than a square bar.
// Two boxes keep the many hedgehogs cheap (the beach can hold hundreds).
function hedgehogBeamGeometry(): THREE.BufferGeometry {
  const { beam, web, length } = DEFENSE_DETAIL.hedgehog;
  const half = beam / 2;
  return merge([box(web, length, beam, -half + web / 2, 0, 0), box(beam, length, web, 0, 0, -half + web / 2)]);
}

// Three L beams crossed at the middle, with a plate welded over the crossing: the anti-tank hedgehog's shape.
function hedgehogGeometry(): THREE.BufferGeometry {
  const { length, tilt, plate, plateThick } = DEFENSE_DETAIL.hedgehog;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const geometry = hedgehogBeamGeometry();
    geometry.rotateZ(tilt);
    geometry.rotateY((i * Math.PI) / 3);
    geometry.translate(0, length / 2, 0);
    parts.push(geometry);
  }
  parts.push(tint(box(plate, plateThick, plate, 0, length / 2, 0), DEFENSE_COLOR.hedgehogPlate));
  return merge(parts);
}

// A box whose twelve edges and eight corners are cut back, the low-poly chamfer of the bunker's concrete. Each face
// keeps its own normal and gets a UV from the plane it lies in, so the concrete picture still runs across it. The cut is
// held to a quarter of each side (as view/mechShapes.ts does), so a thin piece keeps a real side face instead of a wedge.
export function chamferBoxGeometry(w: number, h: number, d: number, cut: number): THREE.BufferGeometry {
  const hx = w / 2,
    hy = h / 2,
    hz = d / 2;
  const bevel = Math.min(cut, w * 0.24, h * 0.24, d * 0.24);
  const cx = Math.max(0.001, hx - bevel),
    cy = Math.max(0.001, hy - bevel),
    cz = Math.max(0.001, hz - bevel);
  const half = [hx, hy, hz],
    inset = [cx, cy, cz];
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [];
  const triangle = (a: number[], b: number[], c: number[], n: number[]) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const second = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] < 0 ? c : b;
    const third = second === b ? c : b;
    for (const p of [a, second, third]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0], n[1], n[2]);
      const ax = Math.abs(n[0]),
        ay = Math.abs(n[1]),
        az = Math.abs(n[2]);
      if (ax >= ay && ax >= az) uvs.push((p[2] + hz) / (2 * hz), (p[1] + hy) / (2 * hy));
      else if (ay >= az) uvs.push((p[0] + hx) / (2 * hx), (p[2] + hz) / (2 * hz));
      else uvs.push((p[0] + hx) / (2 * hx), (p[1] + hy) / (2 * hy));
    }
  };
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[]) => {
    triangle(a, b, c, n);
    triangle(a, c, d, n);
  };

  // the six flat faces, inset along both of their edges
  quad([hx, -cy, -cz], [hx, cy, -cz], [hx, cy, cz], [hx, -cy, cz], [1, 0, 0]);
  quad([-hx, -cy, -cz], [-hx, -cy, cz], [-hx, cy, cz], [-hx, cy, -cz], [-1, 0, 0]);
  quad([-cx, hy, -cz], [cx, hy, -cz], [cx, hy, cz], [-cx, hy, cz], [0, 1, 0]);
  quad([-cx, -hy, -cz], [-cx, -hy, cz], [cx, -hy, cz], [cx, -hy, -cz], [0, -1, 0]);
  quad([-cx, -cy, hz], [cx, -cy, hz], [cx, cy, hz], [-cx, cy, hz], [0, 0, 1]);
  quad([-cx, -cy, -hz], [-cx, cy, -hz], [cx, cy, -hz], [cx, -cy, -hz], [0, 0, -1]);

  // the twelve edge strips between those faces
  for (const [i, j] of [
    [0, 1],
    [0, 2],
    [1, 2],
  ] as const) {
    const k = 3 - i - j;
    for (const si of [1, -1]) {
      for (const sj of [1, -1]) {
        const n = [0, 0, 0];
        n[i] = si;
        n[j] = sj;
        const length = Math.hypot(n[0], n[1], n[2]);
        const normal = (contrib: number) => contrib / length;
        const at = (face: number, sk: number): number[] => {
          const p = [0, 0, 0];
          p[i] = face === i ? si * half[i] : si * inset[i];
          p[j] = face === j ? sj * half[j] : sj * inset[j];
          p[k] = sk * inset[k];
          return p;
        };
        quad(at(i, 1), at(j, 1), at(j, -1), at(i, -1), n.map(normal));
      }
    }
  }

  // the eight corner triangles
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      for (const sz of [1, -1]) {
        const n = [sx, sy, sz];
        const length = Math.hypot(sx, sy, sz);
        triangle(
          [sx * hx, sy * cy, sz * cz],
          [sx * cx, sy * hy, sz * cz],
          [sx * cx, sy * cy, sz * hz],
          n.map(component => component / length),
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // the boxes it merges with are indexed, so this one is too
  geometry.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
  return tint(geometry, 0xffffff);
}

// A concrete block with one top corner broken away, the bars left standing in it and a crack down the face.
function blockGeometry(): THREE.BufferGeometry {
  const D = DEFENSE_DETAIL.block;
  const hx = D.bodyW / 2;
  const lowerH = Math.max(0, D.bodyH - D.chipH);
  return merge([
    box(D.bodyW, lowerH, D.bodyD, 0, lowerH / 2, 0),
    box(D.bodyW - D.chipW, D.chipH, D.bodyD, -D.chipW / 2, lowerH + D.chipH / 2, 0),
    // the bars' angles are shape dimensions, kept here rather than in the table
    tint(
      new THREE.BoxGeometry(D.rebar, D.rebarLength, D.rebar)
        .rotateZ(0.22)
        .translate(hx - D.chipW, D.bodyH, D.bodyD * 0.18),
      DEFENSE_COLOR.rebar,
    ),
    tint(
      new THREE.BoxGeometry(D.rebar, D.rebarLength, D.rebar)
        .rotateZ(-0.34)
        .translate(hx - D.chipW * 0.6, lowerH + D.chipH * 0.4, -D.bodyD * 0.16),
      DEFENSE_COLOR.rebar,
    ),
    tint(
      box(D.crack, D.crackLength, 0.02, D.crackX, D.crackY, D.bodyD / 2 + 0.015, 0, D.crackTurn),
      DEFENSE_COLOR.crack,
    ),
    tint(
      box(D.crack * 0.8, D.crackLength * 0.45, 0.02, D.crack2X, D.crack2Y, D.bodyD / 2 + 0.015, 0, D.crack2Turn),
      DEFENSE_COLOR.crack,
    ),
  ]);
}

// A concrete bunker: a chamfered mass and roof, a dark embrasure framed on the front, sandbags and grass above, and a
// dark entrance on the side. Everything merges into one shape, so the bunker still costs one draw.
function bunkerGeometry(): THREE.BufferGeometry {
  const D = DEFENSE_DETAIL.bunker;
  const roofTop = D.bodyH + D.roofH;
  const slitY = D.bodyH - D.slitHeight / 2 - D.slitBar / 2;
  const frameDepth = D.slitDepth + D.frameProud;
  const frameZ = D.bodyD / 2 + frameDepth / 2;
  const darkZ = D.bodyD / 2 + D.slitDepth / 2 - D.slitInset;
  const parts: THREE.BufferGeometry[] = [
    chamferBoxGeometry(D.bodyW, D.bodyH, D.bodyD, D.bevel).translate(0, D.bodyH / 2, 0),
    chamferBoxGeometry(D.roofW, D.roofH, D.roofD, D.bevel).translate(0, D.bodyH + D.roofH / 2, 0),
    // the dark inside, framed above, below and at both ends so it reads as a slot going in
    tint(box(D.slitWidth, D.slitHeight, D.slitDepth, 0, slitY, darkZ), DEFENSE_COLOR.bunkerSlit),
    box(D.slitWidth + D.slitPost * 2, D.slitBar, frameDepth, 0, slitY - D.slitHeight / 2 - D.slitBar / 2, frameZ),
    box(D.slitWidth + D.slitPost * 2, D.slitBar, frameDepth, 0, slitY + D.slitHeight / 2 + D.slitBar / 2, frameZ),
    box(D.slitPost, D.slitHeight + D.slitBar * 2, frameDepth, -D.slitWidth / 2 - D.slitPost / 2, slitY, frameZ),
    box(D.slitPost, D.slitHeight + D.slitBar * 2, frameDepth, D.slitWidth / 2 + D.slitPost / 2, slitY, frameZ),
    // a back parapet (its 1.2 m height and 1 m depth are shape dimensions, kept here rather than in the table)
    box(D.bodyW * 0.95, 1.2, 1, 0, D.bodyH + 0.6, -D.roofD / 2 + 0.5),
    // the side entrance, a dark plate on the left wall (only its 0.06 m inset lies inside the wall; the 0.1 m and
    // 0.06 m steps of its lintel are shape dimensions)
    tint(
      box(D.doorD, D.doorH, D.doorW, -D.bodyW / 2 - D.doorD / 2 + D.slitInset, D.doorH / 2, -D.bodyD / 4),
      DEFENSE_COLOR.bunkerDoor,
    ),
    box(D.doorD * 1.5, D.slitBar * 0.7, D.doorW + D.slitPost, -D.bodyW / 2 - D.doorD / 4, D.doorH + 0.1, -D.bodyD / 4),
  ];

  // sandbags in two rows, turned a little so they do not read as one long box
  for (let i = 0; i < D.bags; i++) {
    const row = i % 2,
      col = Math.floor(i / 2),
      cols = Math.ceil(D.bags / 2);
    parts.push(
      tint(
        box(
          D.bagW,
          D.bagH,
          D.bagD,
          (col - (cols - 1) / 2) * D.bagW * 1.06,
          roofTop + D.bagH / 2,
          (row - 0.5) * D.bagD,
          (i % 2 === 0 ? 1 : -1) * D.bagTurn,
        ),
        DEFENSE_COLOR.bunkerBag,
      ),
    );
  }
  for (let i = 0; i < D.grass; i++) {
    parts.push(
      tint(
        box(
          D.grassW,
          D.grassH,
          D.grassW,
          (i - (D.grass - 1) / 2) * D.grassW * 3,
          roofTop + D.grassH / 2,
          (i % 2 === 0 ? 1 : -1) * D.roofD * 0.3,
          i * D.grassTurn,
        ),
        DEFENSE_COLOR.bunkerGrass,
      ),
    );
  }
  return merge(parts);
}

function seawallGeometry(): THREE.BufferGeometry {
  return merge([box(8, 5, 4, 0, 2.5, 0), box(8.4, 0.6, 4.4, 0, 5.3, 0)]);
}

function cliffGeometry(): THREE.BufferGeometry {
  return merge([box(20, 24, 16, 0, 12, 0), box(8, 30, 10, 6, 15, 2)]);
}

// A shell crater: a low disc just above the ground, its colour darker than the sand's.
function craterGeometry(): THREE.BufferGeometry {
  return tint(new THREE.CircleGeometry(3, 18).rotateX(-Math.PI / 2).translate(0, 0.03, 0), 0xffffff);
}

// A broken boat or vehicle: a hull, a cabin and a tilted plate.
function wreckGeometry(): THREE.BufferGeometry {
  return merge([
    box(6, 1.4, 2.6, 0, 0.7, 0),
    box(2.4, 1.6, 2.2, -1.2, 2.2, 0, 0.25),
    box(3, 0.4, 1.4, 1.2, 1.7, 0.2, -0.2, 0.35),
  ]);
}

// A low wall with a broken end, a bar left in it and a crack down the face.
function lowWallGeometry(): THREE.BufferGeometry {
  const D = DEFENSE_DETAIL.lowWall;
  const hw = D.bodyW / 2;
  const lowerH = Math.max(0, D.bodyH - D.chipH);
  return merge([
    box(D.bodyW, lowerH, D.bodyD, 0, lowerH / 2, 0),
    box(D.bodyW - D.chipW, D.chipH, D.bodyD, -D.chipW / 2, lowerH + D.chipH / 2, 0),
    // the bar's angle is a shape dimension, kept here rather than in the table
    tint(
      new THREE.BoxGeometry(D.rebarLength, D.rebar, D.rebar)
        .rotateZ(0.18)
        .translate(hw - D.chipW * 0.5, lowerH, D.bodyD * 0.2),
      DEFENSE_COLOR.rebar,
    ),
    tint(
      box(D.crack, D.crackLength, 0.02, D.crackX, D.bodyH * D.crackYShare, D.bodyD / 2 + 0.015, 0, D.crackTurn),
      DEFENSE_COLOR.crack,
    ),
  ]);
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
  return tint(geometry, 0xffffff);
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
  // The concrete picture (view/surfaces.ts) needs UVs: across the width for u, and up the climb (the run plus the
  // height, so the slanted face and the high end both get their share) for v.
  const uvs: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];
    uvs.push((x + hw) / (2 * hw), (hd - z + y) / (2 * hd + h));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return tint(geometry, 0xffffff);
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

// The ground: one plane over all the tiles, so the sand's picture repeats in the world's metres and no tile seam shows.
// Its vertex colour fades from the dry sand inland to the wet sand within reach of the sea.
function addGround(group: THREE.Group, items: Prop[]) {
  if (items.length === 0) return; // no tiles: no plane (the bounds below would stay infinite and give a NaN size)
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const item of items) {
    minX = Math.min(minX, item.x - TILE_SIZE / 2);
    maxX = Math.max(maxX, item.x + TILE_SIZE / 2);
    minZ = Math.min(minZ, item.z - TILE_SIZE / 2);
    maxZ = Math.max(maxZ, item.z + TILE_SIZE / 2);
  }
  const width = maxX - minX,
    depth = maxZ - minZ;
  const geometry = new THREE.PlaneGeometry(width, depth, 1, SAND_SURFACE.wetRows)
    .rotateX(-Math.PI / 2)
    .translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const at = geometry.getAttribute('position'),
    uv = geometry.getAttribute('uv'),
    colors = new Float32Array(at.count * 3);
  const dry = new THREE.Color(DRY_SAND_COLOR),
    wet = new THREE.Color(WET_SAND_COLOR),
    wetR = wet.r / dry.r,
    wetG = wet.g / dry.g,
    wetB = wet.b / dry.b;
  for (let i = 0; i < at.count; i++) {
    const x = at.getX(i),
      z = at.getZ(i);
    uv.setXY(i, x / SAND_SURFACE.repeatM, z / SAND_SURFACE.repeatM);
    const inland = Math.max(0, Math.min(1, (maxZ - z) / SAND_SURFACE.wetBand));
    const wetness = 1 - inland * inland * (3 - 2 * inland); // smooth: wet at the sea's edge, dry inland
    colors[i * 3] = 1 + (wetR - 1) * wetness;
    colors[i * 3 + 1] = 1 + (wetG - 1) * wetness;
    colors[i * 3 + 2] = 1 + (wetB - 1) * wetness;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geometry, groundMaterial());
  mesh.name = 'tile';
  group.add(mesh);
}

// One instanced mesh per kind, with each copy's place, turn and size in its matrix. A kind with a breakable prop gets an
// instance colour for every copy (white material, the kind's colour in the buffer), so the breakable ones can lean red
// without adding a draw. A kind with a surface picture always carries its colour that way, so one shared material can
// serve several kinds.
function addKind(group: THREE.Group, kind: PropKind, items: Prop[]) {
  if (kind === 'tile') {
    addGround(group, items);
    return;
  }
  const surface = KIND_SURFACE[kind];
  const tinted = items.some(item => item.breakable === true);
  const colored = surface !== undefined || tinted;
  const material = surface
    ? surfaceMaterial(surface)
    : new THREE.MeshLambertMaterial({ color: tinted ? 0xffffff : KIND_COLOR[kind] });
  const mesh = new THREE.InstancedMesh(SHAPES[kind](), material, items.length);
  mesh.name = kind;
  const matrix = new THREE.Matrix4(),
    at = new THREE.Vector3(),
    turn = new THREE.Quaternion(),
    size = new THREE.Vector3(),
    baseColor = new THREE.Color(KIND_COLOR[kind]),
    breakColor = baseColor.clone().lerp(new THREE.Color(BREAK_TINT), 0.45);
  items.forEach((item, i) => {
    at.set(item.x, 0, item.z);
    turn.setFromAxisAngle(UP, item.yaw);
    size.set(item.scale, item.scale, item.scale);
    matrix.compose(at, turn, size);
    mesh.setMatrixAt(i, matrix);
    if (colored) mesh.setColorAt(i, item.breakable === true ? breakColor : baseColor);
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

// The surface each target wears; its own colour still tells the four kinds apart from above.
const TARGET_SURFACE: Record<TargetKind, SurfaceName> = {
  pillbox: 'concrete',
  depot: 'wood',
  gun: 'rust',
  magazine: 'concrete',
};

// The mission's targets as one group, each turned the way the map says.
export function buildTargets(targets: readonly TargetPlace[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'targets';
  for (const target of targets) {
    const mesh = new THREE.Mesh(
      TARGET_SHAPES[target.kind](),
      targetMaterial(TARGET_SURFACE[target.kind], TARGET_COLORS[target.kind]),
    );
    mesh.name = target.id;
    mesh.position.set(target.x, 0, target.z);
    mesh.rotation.y = target.yaw;
    group.add(mesh);
  }
  return group;
}
