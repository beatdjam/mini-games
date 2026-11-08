// The dev map in localStorage: the editor saves here and #view-map?src=edit reads it. This is a dev tool, so the key
// lives here rather than in app/storage.ts.
import {
  PROP_KINDS,
  TARGET_KINDS,
  type MapBounds,
  type MapDef,
  type Prop,
  type PropKind,
  type SpawnPoint,
  type TargetKind,
  type TargetPlace,
} from '../../data/types.ts';

export const DEV_MAP_KEY = 'stormbreacher-dev-map';

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${what} is not an object`);
  return value as Record<string, unknown>;
}

function num(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${what} is not a number`);
  return value;
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${what} is not a name`);
  return value;
}

function boundsOf(value: unknown): MapBounds {
  const bounds = record(value, 'bounds');
  return {
    minX: num(bounds.minX, 'bounds.minX'),
    maxX: num(bounds.maxX, 'bounds.maxX'),
    minZ: num(bounds.minZ, 'bounds.minZ'),
    maxZ: num(bounds.maxZ, 'bounds.maxZ'),
  };
}

function propKind(value: unknown, what: string): PropKind {
  const name = text(value, what);
  const found = PROP_KINDS.find(kind => kind === name);
  if (!found) throw new Error(`unknown prop kind ${name}`);
  return found;
}

function targetKind(value: unknown, what: string): TargetKind {
  const name = text(value, what);
  const found = TARGET_KINDS.find(kind => kind === name);
  if (!found) throw new Error(`unknown target kind ${name}`);
  return found;
}

function propOf(value: unknown, index: number): Prop {
  const prop = record(value, `props[${index}]`);
  return {
    kind: propKind(prop.kind, `props[${index}].kind`),
    x: num(prop.x, `props[${index}].x`),
    z: num(prop.z, `props[${index}].z`),
    yaw: num(prop.yaw, `props[${index}].yaw`),
    scale: num(prop.scale, `props[${index}].scale`),
  };
}

function targetOf(value: unknown, index: number): TargetPlace {
  const target = record(value, `targets[${index}]`);
  return {
    id: text(target.id, `targets[${index}].id`),
    kind: targetKind(target.kind, `targets[${index}].kind`),
    x: num(target.x, `targets[${index}].x`),
    z: num(target.z, `targets[${index}].z`),
    yaw: num(target.yaw, `targets[${index}].yaw`),
  };
}

function spawnsOf(value: unknown): Record<string, SpawnPoint[]> {
  const spawns = record(value, 'spawns');
  const out: Record<string, SpawnPoint[]> = {};
  for (const [wave, list] of Object.entries(spawns)) {
    if (!Array.isArray(list)) throw new Error(`spawns.${wave} is not a list`);
    out[wave] = list.map((point, index) => {
      const spawn = record(point, `spawns.${wave}[${index}]`);
      return { x: num(spawn.x, `spawns.${wave}[${index}].x`), z: num(spawn.z, `spawns.${wave}[${index}].z`) };
    });
  }
  return out;
}

// The JSON the editor writes, and the same shape the hand map uses. A broken file or an unknown kind throws, so the
// view can say what is wrong instead of drawing half a map.
export function parseMap(value: unknown): MapDef {
  const map = record(value, 'map');
  if (!Array.isArray(map.props)) throw new Error('map.props is not a list');
  if (!Array.isArray(map.targets)) throw new Error('map.targets is not a list');
  return {
    id: text(map.id, 'map.id'),
    bounds: boundsOf(map.bounds),
    props: map.props.map(propOf),
    targets: map.targets.map(targetOf),
    spawns: spawnsOf(map.spawns),
  };
}

export function saveDevMap(map: MapDef) {
  try {
    localStorage.setItem(DEV_MAP_KEY, JSON.stringify(map));
  } catch {
    // a full or blocked storage leaves the map in memory
  }
}

export function loadDevMap(): MapDef | null {
  try {
    const raw = localStorage.getItem(DEV_MAP_KEY);
    if (raw === null) return null;
    return parseMap(JSON.parse(raw));
  } catch {
    return null;
  }
}
