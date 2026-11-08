// Checks a map against M1's script and against the mech's size (SB-055): the names line up, everything stands inside
// the bounds, the targets stand apart, and a mech with a 2 m radius can walk from the front edge to the back one. A
// map under construction is checked after every edit, so the problems come back as a list, not as an exception.
import { distXZ } from '@engine/core/index.ts';
import { PROP_SIZE, TARGET_SIZE } from '../data/props.ts';
import type { MapDef, MissionDef, Prop, TargetPlace } from '../data/types.ts';

const MECH_RADIUS = 2; // the mech's hit radius (m)
const CELL = 2; // the side of one cell of the walking check (m)
const TARGET_GAP = 12; // how close two targets may stand (m)

export type MapViolationKind =
  | 'target-missing' // the mission destroys a target the map does not have
  | 'target-extra' // the map has a target the mission does not know
  | 'wave-missing' // the mission sends a wave the map has no spawn for
  | 'out-of-bounds' // a prop or target stands outside the map
  | 'targets-close' // two targets stand less than TARGET_GAP apart
  | 'no-path'; // the mech cannot walk from the front edge to the back edge

export interface MapViolation {
  kind: MapViolationKind;
  message: string;
}

// The names the mission has outside this map's range. The hand map covers only the B line and the front of C, so M1's
// guns and magazine (past the seawall) and the beach's waves are left out of the name checks.
export interface MapCheckSkip {
  waves?: readonly string[];
  targets?: readonly string[];
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

// A thing's footprint on the ground: its middle, half its width and depth, and how far it is turned.
interface Footprint {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  yaw: number;
}

function propFootprint(prop: Prop): Footprint {
  const size = PROP_SIZE[prop.kind];
  return {
    x: prop.x,
    z: prop.z,
    halfW: (size.w * prop.scale) / 2,
    halfD: (size.d * prop.scale) / 2,
    yaw: prop.yaw,
  };
}

function targetFootprint(target: TargetPlace): Footprint {
  const size = TARGET_SIZE[target.kind];
  return { x: target.x, z: target.z, halfW: size.w / 2, halfD: size.d / 2, yaw: target.yaw };
}

// The distance from a point to a footprint's rectangle on the ground; 0 inside it.
function footprintDistance(footprint: Footprint, x: number, z: number): number {
  const dx = x - footprint.x;
  const dz = z - footprint.z;
  const cos = Math.cos(footprint.yaw);
  const sin = Math.sin(footprint.yaw);
  const localX = cos * dx - sin * dz;
  const localZ = sin * dx + cos * dz;
  const outX = Math.max(Math.abs(localX) - footprint.halfW, 0);
  const outZ = Math.max(Math.abs(localZ) - footprint.halfD, 0);
  return Math.hypot(outX, outZ);
}

// A target or a blocking prop stops the mech's middle from coming within MECH_RADIUS of its footprint.
function blockedCells(map: MapDef): { cols: number; rows: number; cells: Uint8Array } {
  const { minX, minZ, maxX, maxZ } = map.bounds;
  const cols = Math.max(1, Math.floor((maxX - minX) / CELL));
  const rows = Math.max(1, Math.floor((maxZ - minZ) / CELL));
  const cells = new Uint8Array(cols * rows); // 0 free, 1 blocked
  const blockers: Footprint[] = [];
  for (const prop of map.props) if (PROP_SIZE[prop.kind].blocks) blockers.push(propFootprint(prop));
  for (const target of map.targets) blockers.push(targetFootprint(target));
  for (let j = 0; j < rows; j++) {
    const z = minZ + (j + 0.5) * CELL;
    for (let i = 0; i < cols; i++) {
      const x = minX + (i + 0.5) * CELL;
      for (const blocker of blockers) {
        if (footprintDistance(blocker, x, z) >= MECH_RADIUS) continue;
        cells[j * cols + i] = 1;
        break;
      }
    }
  }
  return { cols, rows, cells };
}

// The walking check on its own: breadth-first from every free cell on the front edge (maxZ) to the back edge (minZ).
// generateMap runs this after each try, so the two views and the tests see the same answer.
export function checkMapPath(map: MapDef): MapViolation[] {
  const { cols, rows, cells } = blockedCells(map);
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
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const j = Math.floor(index / cols);
    const i = index % cols;
    if (j === 0) return [];
    const around = [i > 0 ? index - 1 : -1, i + 1 < cols ? index + 1 : -1, index - cols, index + cols];
    for (const next of around) {
      if (next < 0 || next >= visited.length || visited[next] || cells[next]) continue;
      visited[next] = 1;
      queue.push(next);
    }
  }
  return [
    {
      kind: 'no-path',
      message: `the mech cannot walk from z ${map.bounds.maxZ} to z ${map.bounds.minZ}: ${MECH_RADIUS} m of clearance does not fit`,
    },
  ];
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
