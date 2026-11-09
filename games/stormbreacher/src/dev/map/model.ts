// The editor's map and the edits it makes (SB-055), without three or the DOM: placing, moving, turning and deleting one
// prop or target, and the map the three start buttons make. The views call these and then draw the result.
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { M1B_RULES } from '../../data/maps/m1b-rules.ts';
import { M1 } from '../../data/missions/m1.ts';
import { stream, seed } from '../../logic/rng.ts';
import { generateMap } from '../../logic/mapgen.ts';
import { validateMapForMission, type MapViolation } from '../../logic/mapCheck.ts';
import type { MapBounds, MapDef, PropKind, TargetKind } from '../../data/types.ts';

// The mission's names outside this map's range, left out of the editor's check like #view-map's.
export const MAP_SKIP = {
  targets: ['main-gun-1', 'main-gun-2', 'magazine'],
  waves: ['beach-mortar', 'battery'],
} as const;

// The ids a target may take: the names M1's script uses. The editor asks which one when a target is placed.
export const TARGET_IDS: readonly string[] = M1.targets;

export type MapTool = { type: 'prop'; kind: PropKind } | { type: 'target'; kind: TargetKind };

export type MapSelection = { type: 'prop'; index: number } | { type: 'target'; index: number } | null;

export const TURN = Math.PI / 12; // one turn of the rotate button (15 degrees, rad)

export function emptyMap(bounds: MapBounds): MapDef {
  return { id: 'empty', bounds: { ...bounds }, props: [], targets: [], spawns: {} };
}

// A copy the editor may change: the hand map and the generated map are shared, so they are never edited in place.
export function cloneMap(map: MapDef): MapDef {
  return {
    id: map.id,
    bounds: { ...map.bounds },
    props: map.props.map(prop => ({ ...prop })),
    targets: map.targets.map(target => ({ ...target })),
    spawns: Object.fromEntries(Object.entries(map.spawns).map(([wave, places]) => [wave, places.map(p => ({ ...p }))])),
  };
}

export function startFromHand(): MapDef {
  return cloneMap(M1B_HAND);
}

// The generated map starts from the editor's seed box: seed() puts the map stream at that seed and the hand map's
// anchors keep the targets and spawns in the same places as the other two ways.
export function startFromGenerated(seedValue: number): MapDef {
  seed(seedValue);
  return generateMap(stream('map'), M1B_RULES, { targets: M1B_HAND.targets, spawns: M1B_HAND.spawns });
}

export function validate(map: MapDef): MapViolation[] {
  return validateMapForMission(map, M1, MAP_SKIP);
}

// What placing something did: the new selection, or the reason nothing was placed. A target with an id the map already
// has is moved rather than added, so the same id never stands twice.
export type PlaceResult = { ok: true; selection: MapSelection } | { ok: false; message: string };

export function place(map: MapDef, tool: MapTool, targetId: string, x: number, z: number): PlaceResult {
  if (tool.type === 'prop') {
    map.props.push({ kind: tool.kind, x, z, yaw: 0, scale: 1 });
    return { ok: true, selection: { type: 'prop', index: map.props.length - 1 } };
  }
  const id = targetId.trim();
  if (id === '') return { ok: false, message: 'id を選んで' };
  const existing = map.targets.findIndex(target => target.id === id);
  if (existing >= 0) {
    const target = map.targets[existing];
    target.x = x;
    target.z = z;
    return { ok: true, selection: { type: 'target', index: existing } };
  }
  map.targets.push({ id, kind: tool.kind, x, z, yaw: 0 });
  return { ok: true, selection: { type: 'target', index: map.targets.length - 1 } };
}

// Flips the selected prop's breakable mark; false when a target or nothing is selected.
export function toggleBreakable(map: MapDef, selection: MapSelection): boolean {
  if (selection === null || selection.type !== 'prop') return false;
  const prop = map.props[selection.index];
  if (!prop) return false;
  if (prop.breakable === true) delete prop.breakable;
  else prop.breakable = true;
  return true;
}

export function move(map: MapDef, selection: MapSelection, x: number, z: number) {
  if (selection === null) return;
  const item = selection.type === 'prop' ? map.props[selection.index] : map.targets[selection.index];
  item.x = x;
  item.z = z;
}

export function rotate(map: MapDef, selection: MapSelection, turn: number) {
  if (selection === null) return;
  const item = selection.type === 'prop' ? map.props[selection.index] : map.targets[selection.index];
  item.yaw += turn;
}

export function remove(map: MapDef, selection: MapSelection) {
  if (selection === null) return;
  if (selection.type === 'prop') map.props.splice(selection.index, 1);
  else map.targets.splice(selection.index, 1);
}

// Where the selected prop or target stands, or null when there is none (or the list changed under it).
export function selectionAt(map: MapDef, selection: MapSelection): { x: number; z: number } | null {
  if (selection === null) return null;
  const item = selection.type === 'prop' ? map.props[selection.index] : map.targets[selection.index];
  return item ? { x: item.x, z: item.z } : null;
}

// The nearest prop or target to a point on the ground, within `reach` metres; what a pointer-down grabs.
export function pick(map: MapDef, x: number, z: number, reach: number): MapSelection {
  let best: MapSelection = null;
  let bestDist = reach;
  map.props.forEach((prop, index) => {
    const dist = Math.hypot(prop.x - x, prop.z - z);
    if (dist > bestDist) return;
    bestDist = dist;
    best = { type: 'prop', index };
  });
  map.targets.forEach((target, index) => {
    const dist = Math.hypot(target.x - x, target.z - z);
    if (dist > bestDist) return;
    bestDist = dist;
    best = { type: 'target', index };
  });
  return best;
}
