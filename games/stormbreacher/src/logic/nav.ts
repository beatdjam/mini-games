// The way the enemies find round a wall (SB-190): the map's ground cut into 2 m cells like the walking check
// (mapCheck.ts), the cells an enemy cannot stand in marked, and a breadth-first count of the steps from each free cell to
// the mech. An enemy reads the count to pick where to walk next, so a line of hedgehogs is walked round through its
// breakthrough, not pushed against. Nothing here reads three or the DOM. game.ts keeps the NavState and rebuilds what is
// out of date; the cells and the counts are made again from the rects, so a checkpoint and a suspend do not keep them.
import type { MapBounds } from '../data/types.ts';
import { rectDistance, type GroundRect } from './collide.ts';

const CELL = 2; // the side of one cell (m), the walking check's
const NAV_MARGIN = 0.25; // added to the enemy's radius when a cell is blocked, so a walk clips no corner (m)
const NAV_LOOKAHEAD = 6; // how many cells along the way an enemy looks for a point it can walk straight to
const NAV_SAMPLE = CELL / 2; // how far apart the points of a straight-line check are (m)
const NAV_GOAL_REACH = 5; // how many cells away from a blocked cell the mech stands in the goal is looked for
export const NAV_REBUILD_GAP = 0.25; // the least seconds between two rebuilds of the counts while the mech moves from cell to cell
const FAR = 0xffff; // the count of a cell the mech cannot be reached from

export interface NavGrid {
  minX: number; // the map's edge, where column 0 starts (m)
  minZ: number; // row 0 starts here (m)
  cols: number;
  rows: number;
  blocked: Uint8Array; // 0 free, 1 blocked; row 0 is minZ
  rectCount: number; // how many rects it was made from: a prop that breaks leaves game.rects, and this tells
}

export interface NavField {
  grid: NavGrid;
  steps: Uint16Array; // the steps to the goal cell for each cell along the 4 sides, FAR where there is no way
  mechCell: number; // the cell the mech stood in when it was made, to tell when the mech has moved on
  goal: number; // the free cell the steps count towards; -1 when none is near the mech
}

// What game.ts keeps between frames. Empty at the start, and made lazily on the first step with a living enemy.
export interface NavState {
  grid: NavGrid | null;
  field: NavField | null;
  since: number; // the seconds since the field was made
}

export const newNav = (): NavState => ({ grid: null, field: null, since: 0 });

const cellOf = (grid: NavGrid, x: number, z: number): number => {
  const i = Math.min(grid.cols - 1, Math.max(0, Math.floor((x - grid.minX) / CELL)));
  const j = Math.min(grid.rows - 1, Math.max(0, Math.floor((z - grid.minZ) / CELL)));
  return j * grid.cols + i;
};

const centreOf = (grid: NavGrid, cell: number): { x: number; z: number } => ({
  x: grid.minX + ((cell % grid.cols) + 0.5) * CELL,
  z: grid.minZ + (Math.floor(cell / grid.cols) + 0.5) * CELL,
});

// The cells a circle of `radius` cannot stand in: those whose middle is within the radius (and the margin) of a rect.
// Each rect looks only at the cells within its reach, so the cost goes with the rects' size and not with the map's.
export function buildNavGrid(rects: readonly GroundRect[], bounds: MapBounds, radius: number): NavGrid {
  const { minX, minZ, maxX, maxZ } = bounds;
  const cols = Math.max(1, Math.floor((maxX - minX) / CELL));
  const rows = Math.max(1, Math.floor((maxZ - minZ) / CELL));
  const blocked = new Uint8Array(cols * rows);
  const clear = radius + NAV_MARGIN;
  for (const rect of rects) {
    const reach = Math.hypot(rect.halfW, rect.halfD) + clear;
    const i0 = Math.max(0, Math.floor((rect.x - reach - minX) / CELL));
    const i1 = Math.min(cols - 1, Math.floor((rect.x + reach - minX) / CELL));
    const j0 = Math.max(0, Math.floor((rect.z - reach - minZ) / CELL));
    const j1 = Math.min(rows - 1, Math.floor((rect.z + reach - minZ) / CELL));
    for (let j = j0; j <= j1; j++) {
      const z = minZ + (j + 0.5) * CELL;
      for (let i = i0; i <= i1; i++) {
        if (blocked[j * cols + i]) continue;
        if (rectDistance(rect, minX + (i + 0.5) * CELL, z) < clear) blocked[j * cols + i] = 1;
      }
    }
  }
  return { minX, minZ, cols, rows, blocked, rectCount: rects.length };
}

// The free cell nearest to (x, z) within NAV_GOAL_REACH cells of it; -1 when there is none.
function nearestFree(grid: NavGrid, x: number, z: number): number {
  const home = cellOf(grid, x, z);
  const hi = home % grid.cols;
  const hj = Math.floor(home / grid.cols);
  let best = -1;
  let bestGap = Infinity;
  for (let j = Math.max(0, hj - NAV_GOAL_REACH); j <= Math.min(grid.rows - 1, hj + NAV_GOAL_REACH); j++) {
    for (let i = Math.max(0, hi - NAV_GOAL_REACH); i <= Math.min(grid.cols - 1, hi + NAV_GOAL_REACH); i++) {
      const cell = j * grid.cols + i;
      if (grid.blocked[cell]) continue;
      const c = centreOf(grid, cell);
      const gap = Math.hypot(c.x - x, c.z - z);
      if (gap >= bestGap) continue;
      best = cell;
      bestGap = gap;
    }
  }
  return best;
}

// The steps from every free cell to the free cell nearest to the mech, counted breadth-first along the 4 sides.
export function buildNavField(grid: NavGrid, mechX: number, mechZ: number): NavField {
  const { cols, rows, blocked } = grid;
  const steps = new Uint16Array(cols * rows).fill(FAR);
  const goal = nearestFree(grid, mechX, mechZ);
  const field: NavField = { grid, steps, mechCell: cellOf(grid, mechX, mechZ), goal };
  if (goal < 0) return field;
  const queue = new Int32Array(cols * rows);
  let tail = 0;
  steps[goal] = 0;
  queue[tail++] = goal;
  for (let head = 0; head < tail; head++) {
    const cell = queue[head];
    const i = cell % cols;
    const next = steps[cell] + 1;
    const around = [i > 0 ? cell - 1 : -1, i + 1 < cols ? cell + 1 : -1, cell - cols, cell + cols];
    for (const to of around) {
      if (to < 0 || to >= steps.length || blocked[to] || steps[to] !== FAR) continue;
      steps[to] = next;
      queue[tail++] = to;
    }
  }
  return field;
}

// Whether the straight line from (x0, z0) to (x1, z1) crosses no blocked cell. The cell the line starts in is let off,
// for an enemy sliding along a wall stands in a blocked cell.
function lineClear(grid: NavGrid, x0: number, z0: number, x1: number, z1: number): boolean {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const start = cellOf(grid, x0, z0);
  const count = Math.ceil(len / NAV_SAMPLE);
  for (let k = 1; k <= count; k++) {
    const t = k / count;
    const cell = cellOf(grid, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
    if (cell !== start && grid.blocked[cell]) return false;
  }
  return true;
}

// The neighbour of `cell` (the 8 around it; a diagonal only when both sides of it are free) with the fewest steps to the
// goal, fewer than `limit`; -1 when no neighbour has fewer. Ties go to the one nearer (tx, tz).
function lowerNeighbour(field: NavField, cell: number, limit: number, tx: number, tz: number): number {
  const { grid, steps } = field;
  const { cols, rows, blocked } = grid;
  const i = cell % cols;
  const j = Math.floor(cell / cols);
  let best = -1;
  let bestSteps = limit;
  let bestGap = Infinity;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      if ((di === 0 && dj === 0) || i + di < 0 || i + di >= cols || j + dj < 0 || j + dj >= rows) continue;
      const to = (j + dj) * cols + i + di;
      if (blocked[to] || steps[to] >= limit) continue;
      if (di !== 0 && dj !== 0 && (blocked[j * cols + i + di] || blocked[(j + dj) * cols + i])) continue;
      const c = centreOf(grid, to);
      const gap = Math.hypot(c.x - tx, c.z - tz);
      if (best >= 0 && (steps[to] > bestSteps || (steps[to] === bestSteps && gap >= bestGap))) continue;
      best = to;
      bestSteps = steps[to];
      bestGap = gap;
    }
  }
  return best;
}

// The point an enemy at (x, z) walks to on its way to the mech at (tx, tz). The mech itself when the line to it is clear;
// otherwise the farthest point within NAV_LOOKAHEAD cells down the counts that the enemy can walk to in a straight line
// (so the path is cut short at each corner, not stepped from cell to cell). Null when there is no way to know (the enemy
// is shut in, or the mech is), and the enemy then walks straight as it would with no nav.
export function navTarget(
  field: NavField,
  x: number,
  z: number,
  tx: number,
  tz: number,
): { x: number; z: number } | null {
  const { grid } = field;
  if (lineClear(grid, x, z, tx, tz)) return { x: tx, z: tz };
  if (field.goal < 0) return null;
  let cell = cellOf(grid, x, z);
  // an enemy pressed against a wall stands in a blocked cell: it starts from the best cell round it
  if (grid.blocked[cell]) {
    cell = lowerNeighbour(field, cell, FAR, tx, tz);
    if (cell < 0) return null;
  } else if (field.steps[cell] === FAR) {
    return null;
  }
  let target = centreOf(grid, cell);
  for (let k = 0; k < NAV_LOOKAHEAD; k++) {
    const next = lowerNeighbour(field, cell, field.steps[cell], tx, tz);
    if (next < 0) break;
    cell = next;
    const c = centreOf(grid, cell);
    if (!lineClear(grid, x, z, c.x, c.z)) break;
    target = c;
  }
  return target;
}

// Keeps `nav` up to date for this frame and gives the field the enemies read. The cells are made again when a rect has left
// `rects`; the counts when the cells were, or when the mech has moved into another cell (at most once per
// NAV_REBUILD_GAP, so a mech that runs does not make them every frame).
export function stepNav(
  nav: NavState,
  rects: readonly GroundRect[],
  bounds: MapBounds,
  radius: number,
  mech: { x: number; z: number },
  dt: number,
): NavField {
  nav.since += dt;
  let rebuilt = false;
  if (nav.grid === null || nav.grid.rectCount !== rects.length) {
    nav.grid = buildNavGrid(rects, bounds, radius);
    rebuilt = true;
  }
  const moved = nav.field !== null && nav.field.mechCell !== cellOf(nav.grid, mech.x, mech.z);
  if (rebuilt || nav.field === null || (moved && nav.since >= NAV_REBUILD_GAP)) {
    nav.field = buildNavField(nav.grid, mech.x, mech.z);
    nav.since = 0;
  }
  return nav.field;
}
