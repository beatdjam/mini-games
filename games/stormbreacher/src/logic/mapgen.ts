// Makes a map's props from a seed and a set of rules (SB-055). The targets and the spawn points are part of the story,
// so they come in as anchors and the generator only lays the ground's obstacles around them: a band of one kind at a
// time, a cliff along the right edge, the targets' clear ground and the lanes that must stay walkable.
import { createRng, distXZ, type Rng } from '@engine/core/index.ts';
import type { MapDef, MapRules, Prop, SpawnPoint, TargetPlace } from '../data/types.ts';
import { checkMapPath } from './mapCheck.ts';

export interface MapAnchors {
  targets: TargetPlace[]; // the mission's targets, placed by hand
  spawns: Record<string, SpawnPoint[]>; // each wave's places, placed by hand
}

const FULL_TURN = Math.PI * 2; // a yaw's full circle (rad)
const DEFAULT_CLEAR = 10; // the clear ground around a target when the rules leave it out (m)
const OTHER_GAP = 3; // the least distance between props of different bands (m)
const TRIES_PER_PROP = 400; // how many places a band may try for one prop
const MAX_TRIES = 10; // how many seeds to try before giving up on a walkable map

function inLane(rules: MapRules, x: number): boolean {
  return rules.lanes.some(lane => Math.abs(x - lane.x) < lane.width / 2);
}

function inClear(anchors: MapAnchors, x: number, z: number, clear: number): boolean {
  return anchors.targets.some(target => distXZ(target, { x, z }) < clear);
}

function within(values: Prop[], x: number, z: number, gap: number): boolean {
  return values.some(prop => distXZ(prop, { x, z }) < gap);
}

// One try: put every band's count down, then the cliff. A prop is kept out of the lanes, out of the targets' clear
// ground and at least the band's minGap from the band's other props.
function layOut(rng: Rng, rules: MapRules, anchors: MapAnchors): MapDef {
  const clear = rules.clear ?? DEFAULT_CLEAR;
  const props: Prop[] = [];
  for (const band of rules.bands) {
    const placed: Prop[] = [];
    const tries = Math.max(band.count, band.count * TRIES_PER_PROP);
    for (let i = 0; i < band.count; i++) {
      let found: Prop | null = null;
      for (let t = 0; t < tries; t++) {
        const x = rng.rand(rules.bounds.minX, rules.bounds.maxX);
        const z = rng.rand(band.minZ, band.maxZ);
        if (inLane(rules, x) || inClear(anchors, x, z, clear)) continue;
        if (within(placed, x, z, band.minGap)) continue;
        if (within(props, x, z, OTHER_GAP)) continue;
        found = { kind: band.kind, x, z, yaw: rng.rand(0, FULL_TURN), scale: rng.rand(0.8, 1.2) };
        break;
      }
      if (found === null) {
        throw new Error(`cannot place ${band.count} ${band.kind} in z ${band.minZ}..${band.maxZ} under the rules`);
      }
      placed.push(found);
      props.push(found);
    }
  }

  // The cliff runs down the right edge in even steps with a little jitter, so it reads as one line.
  const step = (rules.cliff.maxZ - rules.cliff.minZ) / rules.cliff.count;
  for (let i = 0; i < rules.cliff.count; i++) {
    props.push({
      kind: 'cliff',
      x: rules.cliff.x,
      z: rules.cliff.minZ + (i + 0.5) * step + rng.rand(-0.8, 0.8),
      yaw: rng.rand(-0.3, 0.3),
      scale: rng.rand(0.9, 1.1),
    });
  }

  return {
    id: rules.id,
    bounds: { ...rules.bounds },
    props,
    targets: [...anchors.targets],
    spawns: Object.fromEntries(Object.entries(anchors.spawns).map(([wave, spawns]) => [wave, [...spawns]])),
  };
}

// The map the seed makes. If the walk from front to back is blocked, one more seed is drawn from the stream and the map
// is built again; ten blocked tries in a row are a rules mistake, so they throw.
export function generateMap(rng: Rng, rules: MapRules, anchors: MapAnchors): MapDef {
  let source = rng;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const map = layOut(source, rules, anchors);
    if (checkMapPath(map).length === 0) return map;
    source = createRng(Math.floor(source.next() * 0x1_0000_0000) >>> 0);
  }
  throw new Error(`no walkable map for ${rules.id} after ${MAX_TRIES} seeds`);
}
