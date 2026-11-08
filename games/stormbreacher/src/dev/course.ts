// The scale course: a corridor, a door wall, a hall, steps and reference walls, laid out far enough apart to look at
// each on its own. It only builds boxes; SB-020 will use the wall boxes (THREE.Box3) as the third-person camera's
// colliders.
import * as THREE from 'three';

export type CourseKind = 'wall' | 'ceiling' | 'cover' | 'step' | 'ref';

export interface CourseBox {
  kind: CourseKind;
  x: number; // the box's centre on x (m)
  z: number; // the box's centre on z (m)
  w: number; // width along x (m)
  d: number; // depth along z (m)
  h: number; // height (m)
  y?: number; // the box's bottom (m); left out means 0
}

export interface CourseOpts {
  ceil: number; // the hall's ceiling height, from the floor (m)
}

export type StationName = 'corridor' | 'door' | 'hall' | 'step' | 'ref';

export const COURSE_COLOR: Record<CourseKind, number> = {
  wall: 0x7d848c,
  ceiling: 0x59616b,
  cover: 0xa68154,
  step: 0x6f8d61,
  ref: 0xb08a5a,
};

// All wall sizes are inner sizes, and every wall is WALL_T thick (m).
const WALL_T = 1;

// corridor: three lanes along z, with a wall between them
export const CORRIDOR_WIDTHS = [6, 8, 12] as const;
const CORRIDOR_LEN = 40;
const CORRIDOR_H = 12;

// door: a wall along x with three openings (the x is from the wall's centre)
const DOOR_X = 55;
const DOOR_Z = 0;
const DOOR_W = 40;
const DOOR_H = 20;
export const DOOR_OPENINGS = [
  { x: -12, w: 6, h: 8 },
  { x: 0, w: 8, h: 10 },
  { x: 12, w: 10, h: 12 },
] as const;

// hall: a 40 x 40 m room with one entrance and a ceiling on top
const HALL_X = 0;
const HALL_Z = -80;
const HALL_INNER = 40;
const HALL_ENTRY_W = 10;
const HALL_ENTRY_H = 12;

// step: four platforms (m tall), each STEP_SIZE square
export const STEP_SIZES = [0.7, 1.5, 2, 4] as const;
const STEP_SIZE = 8;
const STEP_X = 60;
const STEP_Z = -60;

// ref: two Extended walls, one per height (m), REF_W wide
export const REF_WALLS = [6, 12] as const;
const REF_W = 8;
const REF_X = 107;
const REF_Z = 0;
const REF_GAP = 2;

// how far in front of an entrance the models stand (m); 20 m or more is left between the places
const STATION_GAP = 6;

const GRID_STEP = 4; // the floor grid's spacing (m), the engine's tile

// The centre of each lane, left to right, for a set of inner widths separated by WALL_T walls.
function corridorLanes(widths: readonly number[]): number[] {
  const total = widths.reduce((sum, w) => sum + w, 0) + WALL_T * (widths.length + 1);
  let x = -total / 2;
  const lanes: number[] = [];
  for (const width of widths) {
    x += WALL_T;
    lanes.push(x + width / 2);
    x += width;
  }
  return lanes;
}

const CORRIDOR_LANES = corridorLanes(CORRIDOR_WIDTHS);

// Where the models stand for each place: in front of its entrance, also the cameras' base.
export const STATIONS: Record<StationName, { x: number; z: number }> = {
  corridor: { x: CORRIDOR_LANES[1], z: CORRIDOR_LEN / 2 + STATION_GAP },
  door: { x: DOOR_X, z: DOOR_Z + WALL_T / 2 + STATION_GAP },
  hall: { x: HALL_X, z: HALL_Z + HALL_INNER / 2 + WALL_T + STATION_GAP },
  step: { x: STEP_X, z: STEP_Z + STEP_SIZE / 2 + STATION_GAP },
  ref: { x: REF_X, z: REF_Z + WALL_T / 2 + STATION_GAP },
};

function box(kind: CourseKind, x: number, z: number, w: number, d: number, h: number, y = 0): CourseBox {
  return { kind, x, z, w, d, h, y };
}

// A wall along x, split into boxes around openings that reach the floor: a pier between them and a lintel above each.
function wallWithOpenings(
  kind: CourseKind,
  cx: number,
  cz: number,
  w: number,
  d: number,
  h: number,
  openings: readonly { x: number; w: number; h: number }[],
): CourseBox[] {
  const out: CourseBox[] = [];
  let cursor = -w / 2;
  for (const opening of [...openings].sort((a, b) => a.x - b.x)) {
    const left = opening.x - opening.w / 2;
    const right = opening.x + opening.w / 2;
    if (left > cursor) out.push(box(kind, cx + (cursor + left) / 2, cz, left - cursor, d, h));
    if (opening.h < h) out.push(box(kind, cx + opening.x, cz, opening.w, d, h - opening.h, opening.h));
    cursor = right;
  }
  if (cursor < w / 2) out.push(box(kind, cx + (cursor + w / 2) / 2, cz, w / 2 - cursor, d, h));
  return out;
}

function corridorBoxes(): CourseBox[] {
  const out: CourseBox[] = [];
  const total = CORRIDOR_WIDTHS.reduce((sum, w) => sum + w, 0) + WALL_T * (CORRIDOR_WIDTHS.length + 1);
  let x = -total / 2;
  for (const width of CORRIDOR_WIDTHS) {
    out.push(box('wall', x + WALL_T / 2, 0, WALL_T, CORRIDOR_LEN, CORRIDOR_H));
    x += WALL_T + width;
  }
  out.push(box('wall', x + WALL_T / 2, 0, WALL_T, CORRIDOR_LEN, CORRIDOR_H));
  return out;
}

function doorBoxes(): CourseBox[] {
  return wallWithOpenings('wall', DOOR_X, DOOR_Z, DOOR_W, WALL_T, DOOR_H, DOOR_OPENINGS);
}

function hallBoxes(ceil: number): CourseBox[] {
  const half = HALL_INNER / 2;
  const outer = HALL_INNER + 2 * WALL_T;
  const out: CourseBox[] = [
    // the west and east walls run past the corners, so the corners are filled
    box('wall', HALL_X - half - WALL_T / 2, HALL_Z, WALL_T, outer, ceil),
    box('wall', HALL_X + half + WALL_T / 2, HALL_Z, WALL_T, outer, ceil),
    // the far wall is solid; the near one has the entrance
    box('wall', HALL_X, HALL_Z - half - WALL_T / 2, HALL_INNER, WALL_T, ceil),
    ...wallWithOpenings('wall', HALL_X, HALL_Z + half + WALL_T / 2, HALL_INNER, WALL_T, ceil, [
      { x: 0, w: HALL_ENTRY_W, h: HALL_ENTRY_H },
    ]),
    // the ceiling sits on the walls
    box('ceiling', HALL_X, HALL_Z, outer, outer, WALL_T, ceil),
  ];
  return out;
}

function stepBoxes(): CourseBox[] {
  return STEP_SIZES.map((h, i) =>
    box('step', STEP_X + (i - (STEP_SIZES.length - 1) / 2) * STEP_SIZE, STEP_Z, STEP_SIZE, STEP_SIZE, h),
  );
}

function refBoxes(): CourseBox[] {
  const total = REF_WALLS.length * REF_W + (REF_WALLS.length - 1) * REF_GAP;
  let x = REF_X - total / 2;
  return REF_WALLS.map(h => {
    const made = box('ref', x + REF_W / 2, REF_Z, REF_W, WALL_T, h);
    x += REF_W + REF_GAP;
    return made;
  });
}

// Every box of the course, without touching three (so the unit test can run it in node).
export function courseBoxes(opts: CourseOpts): CourseBox[] {
  return [...corridorBoxes(), ...doorBoxes(), ...hallBoxes(opts.ceil), ...stepBoxes(), ...refBoxes()];
}

// The course as a scene group, plus the wall boxes for the camera (SB-020). One material per kind is shared.
export function buildCourse(opts: CourseOpts): { group: THREE.Group; boxes: THREE.Box3[] } {
  const group = new THREE.Group();
  const materials: Record<CourseKind, THREE.MeshLambertMaterial> = {
    wall: new THREE.MeshLambertMaterial({ color: COURSE_COLOR.wall }),
    ceiling: new THREE.MeshLambertMaterial({ color: COURSE_COLOR.ceiling }),
    cover: new THREE.MeshLambertMaterial({ color: COURSE_COLOR.cover }),
    step: new THREE.MeshLambertMaterial({ color: COURSE_COLOR.step }),
    ref: new THREE.MeshLambertMaterial({ color: COURSE_COLOR.ref }),
  };
  const list = courseBoxes(opts);
  const boxes: THREE.Box3[] = [];
  for (const b of list) {
    const bottom = b.y ?? 0;
    const size = new THREE.Vector3(b.w, b.h, b.d);
    const centre = new THREE.Vector3(b.x, bottom + b.h / 2, b.z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), materials[b.kind]);
    mesh.position.copy(centre);
    group.add(mesh);
    boxes.push(new THREE.Box3().setFromCenterAndSize(centre, size));
  }

  // a 4 m grid over just the course's footprint
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of list) {
    minX = Math.min(minX, b.x - b.w / 2);
    maxX = Math.max(maxX, b.x + b.w / 2);
    minZ = Math.min(minZ, b.z - b.d / 2);
    maxZ = Math.max(maxZ, b.z + b.d / 2);
  }
  const side = Math.ceil(Math.max(maxX - minX, maxZ - minZ) / GRID_STEP) * GRID_STEP;
  const grid = new THREE.GridHelper(side, side / GRID_STEP, 0x6d737a, 0x4c5258);
  grid.position.set((minX + maxX) / 2, 0.01, (minZ + maxZ) / 2);
  group.add(grid);
  return { group, boxes };
}
