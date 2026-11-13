// Checks a map against M1's script and against the mech's size (SB-055): the names line up, everything stands inside
// the bounds, the targets stand apart, and a mech with a 1 m radius can walk from the front edge to the back one (with a
// seawall: in two stretches, see checkMapPath). A map under construction is checked after every edit, so the problems
// come back as a list, not as an exception.
import { distXZ } from '@engine/core/index.ts';
import { PROP_SIZE, TARGET_SIZE } from '../data/props.ts';
import { MECH_TUNE } from '../data/tune.ts';
import type { MapDef, MissionDef } from '../data/types.ts';
import { blastPropIndexes } from './blasts.ts';
import { rectDistance } from './collide.ts';
import { mapBlockers } from './mapShapes.ts';

const CELL = 2; // the side of one cell of the walking check (m)
const TARGET_GAP = 12; // how close two targets may stand (m)
const TARGET_REACH = 4; // how near a target behind the seawall the walk must come: the mech's middle to its edge (m)

export type MapViolationKind =
  | 'target-missing' // the mission destroys a target the map does not have
  | 'target-extra' // the map has a target the mission does not know
  | 'wave-missing' // the mission sends a wave the map has no spawn for
  | 'out-of-bounds' // a prop or target stands outside the map
  | 'target-duplicate' // the same target id is on the map more than once
  | 'targets-close' // two targets stand less than TARGET_GAP apart
  | 'no-path'; // the mech cannot walk from the front edge to the back edge (with a seawall: to its foot, and from its back to the targets behind it)

export interface MapViolation {
  kind: MapViolationKind;
  message: string;
}

// The names the mission has outside this map's range: a map that stops short of M1's guns and magazine, or of the
// waves that come in on the beach and the battery, leaves them out of the name checks.
export interface MapCheckSkip {
  waves?: readonly string[];
  targets?: readonly string[];
}

interface Grid {
  cols: number;
  rows: number;
  cells: Uint8Array; // 0 free, 1 blocked; row 0 is minZ
}

const range = (min: number, max: number): string => `${min}..${max}`;

function checkBounds(map: MapDef, out: MapViolation[]) {
  const { minX, maxX, minZ, maxZ } = map.bounds;
  map.props.forEach((prop, index) => {
    if (prop.x >= minX && prop.x <= maxX && prop.z >= minZ && prop.z <= maxZ) return;
    out.push({
      kind: 'out-of-bounds',
      message: `prop ${index} (${prop.kind}) at (${prop.x}, ${prop.z}) is outside x ${range(minX, maxX)}, z ${range(minZ, maxZ)}`,
    });
  });
  for (const target of map.targets) {
    if (target.x >= minX && target.x <= maxX && target.z >= minZ && target.z <= maxZ) continue;
    out.push({
      kind: 'out-of-bounds',
      message: `target ${target.id} at (${target.x}, ${target.z}) is outside x ${range(minX, maxX)}, z ${range(minZ, maxZ)}`,
    });
  }
}

function checkTargets(map: MapDef, mission: MissionDef, skip: MapCheckSkip, out: MapViolation[]) {
  const skipped = new Set(skip.targets ?? []);
  const onMap = new Set(map.targets.map(target => target.id));
  for (const id of mission.targets) {
    if (skipped.has(id) || onMap.has(id)) continue;
    out.push({ kind: 'target-missing', message: `the mission's target ${id} is not on the map` });
  }
  for (const target of map.targets) {
    if (mission.targets.includes(target.id)) continue;
    out.push({ kind: 'target-extra', message: `the map's target ${target.id} is not in the mission` });
  }
  const seen = new Set<string>();
  for (const target of map.targets) {
    if (seen.has(target.id)) {
      out.push({ kind: 'target-duplicate', message: `the map has more than one target called ${target.id}` });
      continue;
    }
    seen.add(target.id);
  }
  for (let i = 0; i < map.targets.length; i++) {
    for (let j = i + 1; j < map.targets.length; j++) {
      const a = map.targets[i];
      const b = map.targets[j];
      const gap = distXZ(a, b);
      if (gap >= TARGET_GAP) continue;
      out.push({
        kind: 'targets-close',
        message: `targets ${a.id} and ${b.id} stand ${gap.toFixed(1)} m apart (under ${TARGET_GAP} m)`,
      });
    }
  }
}

function checkWaves(map: MapDef, mission: MissionDef, skip: MapCheckSkip, out: MapViolation[]) {
  const skipped = new Set(skip.waves ?? []);
  const sent = new Set<string>();
  for (const cue of mission.cues) {
    for (const action of cue.actions) if (action.kind === 'spawn') sent.add(action.wave);
  }
  for (const wave of sent) {
    if (skipped.has(wave)) continue;
    const spawns = map.spawns[wave];
    if (spawns && spawns.length > 0) continue;
    out.push({
      kind: 'wave-missing',
      message: `the mission sends wave ${wave}, but the map has no spawn point for it`,
    });
  }
}

// A target or a blocking prop stops the mech's middle from coming within MECH_TUNE.radius of its rect. The rects come
// from mapBlockers, the same ones the mech's collision uses. A blast point is walked as an open hole: the mech can blow it
// open, so the check reads the line with those hedgehogs gone. The closed line is checked by walking a copy with
// `blasts: []`. The line's hedgehogs block: a shot does not break them. Stairs and ramps are walked up from their lowest
// edge, so they count as open ground here: one set behind a breakthrough does not close it (the climb itself is checked
// by walking it in the tests).
function blockedCells(map: MapDef): Grid {
  const { minX, minZ, maxX, maxZ } = map.bounds;
  const cols = Math.max(1, Math.floor((maxX - minX) / CELL));
  const rows = Math.max(1, Math.floor((maxZ - minZ) / CELL));
  const cells = new Uint8Array(cols * rows); // 0 free, 1 blocked
  // Each blocker looks only at the cells within its reach (its corner's distance from the middle plus the radius), so
  // the check does not go over every cell for every blocker; a cell outside that square cannot be within the radius.
  const opened = new Set<number>();
  for (const blast of map.blasts ?? []) {
    for (const index of blastPropIndexes(map, blast)) opened.add(index);
  }
  const walls = {
    ...map,
    props: map.props.filter((prop, index) => prop.kind !== 'stairs' && prop.kind !== 'ramp' && !opened.has(index)),
  };
  for (const blocker of mapBlockers(walls)) {
    const reach = Math.hypot(blocker.halfW, blocker.halfD) + MECH_TUNE.radius;
    const i0 = Math.max(0, Math.floor((blocker.x - reach - minX) / CELL));
    const i1 = Math.min(cols - 1, Math.floor((blocker.x + reach - minX) / CELL));
    const j0 = Math.max(0, Math.floor((blocker.z - reach - minZ) / CELL));
    const j1 = Math.min(rows - 1, Math.floor((blocker.z + reach - minZ) / CELL));
    for (let j = j0; j <= j1; j++) {
      const z = minZ + (j + 0.5) * CELL;
      for (let i = i0; i <= i1; i++) {
        if (cells[j * cols + i]) continue;
        const x = minX + (i + 0.5) * CELL;
        if (rectDistance(blocker, x, z) < MECH_TUNE.radius) cells[j * cols + i] = 1;
      }
    }
  }
  return { cols, rows, cells };
}

// The two faces of the seawall (z, m): the one nearest the sea and the one nearest the land. Null when the map has none.
function seawallFaces(map: MapDef): { foot: number; back: number } | null {
  let foot = -Infinity;
  let back = Infinity;
  for (const prop of map.props) {
    if (prop.kind !== 'seawall') continue;
    const size = PROP_SIZE.seawall;
    const half = (Math.abs(Math.cos(prop.yaw)) * size.d + Math.abs(Math.sin(prop.yaw)) * size.w) * prop.scale * 0.5;
    foot = Math.max(foot, prop.z + half);
    back = Math.min(back, prop.z - half);
  }
  return foot === -Infinity ? null : { foot, back };
}

// The row the first stretch has to reach. Without a seawall it is the back edge (row 0). With one it is the row just
// landward of the clearance in front of the seawall's seaward face: the seawall is climbed by its stairs or ramp, which
// this check does not walk, so the check asks for a way from the front edge to the seawall's foot.
function goalRow(map: MapDef): number {
  const faces = seawallFaces(map);
  if (faces === null) return 0;
  return Math.max(0, Math.floor((faces.foot + MECH_TUNE.radius + CELL - map.bounds.minZ) / CELL - 0.5));
}

// The first stretch: breadth-first from every free cell on the front edge (maxZ) to the back edge (minZ), or to the
// seawall's foot when the map has a seawall (goalRow).
function checkFront(map: MapDef, grid: Grid): MapViolation[] {
  const { cols, rows, cells } = grid;
  const visited = new Uint8Array(cols * rows);
  const queue: number[] = [];
  for (let i = 0; i < cols; i++) {
    const index = (rows - 1) * cols + i;
    if (cells[index]) continue;
    visited[index] = 1;
    queue.push(index);
  }
  if (queue.length === 0) {
    return [{ kind: 'no-path', message: 'no free cell on the front edge: the mech cannot start' }];
  }
  const goal = Math.min(goalRow(map), rows - 1);
  if (flood(grid, visited, queue, j => j <= goal)) return [];
  return [
    {
      kind: 'no-path',
      message: `the mech cannot walk from z ${map.bounds.maxZ} to ${goal === 0 ? `z ${map.bounds.minZ}` : "the seawall's foot"}: ${MECH_TUNE.radius} m of clearance does not fit`,
    },
  ];
}

// Fills `visited` outward from the queued cells over the free ones; true as soon as a cell in a row `stop` accepts is
// reached (the queue then holds the cells found so far).
function flood(grid: Grid, visited: Uint8Array, queue: number[], stop: (row: number) => boolean): boolean {
  const { cols, cells } = grid;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const j = Math.floor(index / cols);
    const i = index % cols;
    if (stop(j)) return true;
    const around = [i > 0 ? index - 1 : -1, i + 1 < cols ? index + 1 : -1, index - cols, index + cols];
    for (const next of around) {
      if (next < 0 || next >= visited.length || visited[next] || cells[next]) continue;
      visited[next] = 1;
      queue.push(next);
    }
  }
  return false;
}

// The second stretch, only for a map with a seawall and targets behind it: from the free cells just landward of the
// seawall's back face, the mech must be able to come within TARGET_REACH of every target behind the seawall. The
// stretch starts where the mech drops off the seawall, so it does not depend on the first one (nor on how it climbed:
// stairs or ramp).
function checkBehind(map: MapDef, grid: Grid): MapViolation[] {
  const faces = seawallFaces(map);
  if (faces === null) return [];
  const behind = map.targets.filter(target => target.z < faces.back);
  if (behind.length === 0) return [];
  const { cols, rows, cells } = grid;
  const { minX, minZ } = map.bounds;
  const startRow = Math.floor((faces.back - MECH_TUNE.radius - minZ) / CELL - 0.5);
  const visited = new Uint8Array(cols * rows);
  const queue: number[] = [];
  if (startRow >= 0 && startRow < rows) {
    for (let i = 0; i < cols; i++) {
      const index = startRow * cols + i;
      if (cells[index]) continue;
      visited[index] = 1;
      queue.push(index);
    }
  }
  flood(grid, visited, queue, () => false);
  const out: MapViolation[] = [];
  for (const target of behind) {
    const size = TARGET_SIZE[target.kind];
    const rect = { x: target.x, z: target.z, halfW: size.w / 2, halfD: size.d / 2, yaw: target.yaw };
    const reached = queue.some(index => {
      const x = minX + ((index % cols) + 0.5) * CELL;
      const z = minZ + (Math.floor(index / cols) + 0.5) * CELL;
      return rectDistance(rect, x, z) <= TARGET_REACH;
    });
    if (reached) continue;
    out.push({
      kind: 'no-path',
      message: `the mech cannot walk from behind the seawall to within ${TARGET_REACH} m of ${target.id}`,
    });
  }
  return out;
}

// The walking check on its own. A map with a seawall is walked in two stretches, because the seawall is climbed by its
// stairs or ramp and dropped off at its back, which this check does not walk: from the front edge to the seawall's foot,
// and from the seawall's back face to the targets behind it. A map without one is walked from the front edge to the back
// edge. generateMap runs this after each try, so the two views and the tests see the same answer.
export function checkMapPath(map: MapDef): MapViolation[] {
  const grid = blockedCells(map);
  return [...checkFront(map, grid), ...checkBehind(map, grid)];
}

// Every problem with `map` seen against `mission`, in a fixed order: names, bounds, target gaps, then the walk.
export function validateMapForMission(map: MapDef, mission: MissionDef, skip: MapCheckSkip = {}): MapViolation[] {
  const out: MapViolation[] = [];
  checkTargets(map, mission, skip, out);
  checkWaves(map, mission, skip, out);
  checkBounds(map, out);
  out.push(...checkMapPath(map));
  return out;
}
