// Makes a map's props from a seed and a set of rules (SB-055). The targets and the spawn points are part of the story,
// so they come in as anchors and the generator only lays the ground's obstacles around them: defence lines of one kind
// across the map, bands of cover between them, a cliff along the right edge, the targets' clear ground and the lanes
// that must stay walkable.
import { createRng, distXZ, type Rng } from '@engine/core/index.ts';
import { PROP_SIZE, TARGET_SIZE } from '../data/props.ts';
import type { MapDef, MapLine, MapRules, Prop, PropKind, SpawnPoint, TargetKind, TargetPlace } from '../data/types.ts';
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
const CRACK = 3.9; // the widest crack inside a row that still stops a mech with a 2 m radius (m)
const SCALE_MIN = 0.9; // the smallest size a line's props may take
const SCALE_MAX = 1.1; // the largest size a line's props may take

function inLane(rules: MapRules, x: number): boolean {
  return rules.lanes.some(lane => Math.abs(x - lane.x) < lane.width / 2);
}

// The radius of the circle around a footprint: two such circles that stay apart prove the rectangles do not overlap.
function propRadius(kind: PropKind, scale: number): number {
  const size = PROP_SIZE[kind];
  return Math.hypot(size.w * scale, size.d * scale) / 2;
}

function targetRadius(kind: TargetKind): number {
  const size = TARGET_SIZE[kind];
  return Math.hypot(size.w, size.d) / 2;
}

function inClear(anchors: MapAnchors, x: number, z: number, clear: number, kind: PropKind, scale: number): boolean {
  const radius = propRadius(kind, scale);
  return anchors.targets.some(target => distXZ(target, { x, z }) < clear + targetRadius(target.kind) + radius);
}

function within(values: Prop[], x: number, z: number, gap: number, kind: PropKind, scale: number): boolean {
  const radius = propRadius(kind, scale);
  return values.some(prop => distXZ(prop, { x, z }) < gap + propRadius(prop.kind, prop.scale) + radius);
}

// The half-width along x of a prop's rectangle once turned, so a gap can be kept as clear rectangles.
function halfWidthOnX(kind: PropKind, scale: number, yaw: number): number {
  const size = PROP_SIZE[kind];
  return (size.w * scale * Math.abs(Math.cos(yaw))) / 2 + (size.d * scale * Math.abs(Math.sin(yaw))) / 2;
}

function inGap(line: MapLine, x: number, halfX: number): boolean {
  return line.gaps.some(gap => Math.abs(x - gap.x) < gap.width / 2 + halfX);
}

function inBreakable(line: MapLine, x: number): boolean {
  return line.breakable.some(zone => Math.abs(x - zone.x) <= zone.width / 2);
}

// Whether z falls inside any defence line: the cover bands stay out of the lines, so the two never overlap.
function insideLine(rules: MapRules, z: number): boolean {
  return rules.lines.some(line => z >= line.z - line.depth / 2 && z <= line.z + line.depth / 2);
}

// The x a defence line may reach before it runs into the cliff along the right edge.
function lineMaxX(rules: MapRules, kind: PropKind): number {
  return Math.min(rules.bounds.maxX, rules.cliff.x - PROP_SIZE.cliff.w / 2 - PROP_SIZE[kind].w / 2);
}

// One defence line: rows of props across x, odd rows shifted by half a spacing. Every prop wobbles within 1 m, turns
// and takes a size between 0.9 and 1.1; the gaps stay empty of rectangles and the breakable stretches are marked. A
// row is also kept closed away from its gaps, so the only ways through are the breakthroughs.
function layLine(rng: Rng, rules: MapRules, line: MapLine): Prop[] {
  const out: Prop[] = [];
  const rowStep = line.depth / line.rows;
  const maxX = lineMaxX(rules, line.kind);
  for (let row = 0; row < line.rows; row++) {
    const rowZ = line.z - line.depth / 2 + rowStep * (row + 0.5);
    const offset = row % 2 === 1 ? line.spacing / 2 : 0;
    let previous: Prop | null = null;
    for (let base = rules.bounds.minX + line.spacing / 2 + offset; base < maxX; base += line.spacing) {
      const x0 = base + rng.rand(-1, 1);
      const z = rowZ + rng.rand(-1, 1);
      const yaw = rng.rand(0, FULL_TURN);
      const scale = rng.rand(SCALE_MIN, SCALE_MAX);
      const halfX = halfWidthOnX(line.kind, scale, yaw);
      if (inGap(line, x0, halfX)) {
        previous = null; // the gap starts a new stretch
        continue;
      }
      let x = x0;
      if (previous !== null) {
        const maxCentre = halfWidthOnX(previous.kind, previous.scale, previous.yaw) + halfX + CRACK;
        if (x - previous.x > maxCentre) x = previous.x + maxCentre;
      }
      if (inGap(line, x, halfX)) continue;
      const prop: Prop = { kind: line.kind, x, z, yaw, scale };
      if (inBreakable(line, x)) prop.breakable = true;
      out.push(prop);
      previous = prop;
    }
  }
  return out;
}

// One try: put every defence line down, then every band's count, then the cliff. A band prop is kept out of the lines,
// the lanes, the targets' clear ground and at least the band's minGap from the band's other props.
function layOut(rng: Rng, rules: MapRules, anchors: MapAnchors): MapDef {
  const clear = rules.clear ?? DEFAULT_CLEAR;
  const props: Prop[] = [];
  for (const line of rules.lines) props.push(...layLine(rng, rules, line));
  for (const band of rules.bands) {
    const placed: Prop[] = [];
    const tries = Math.max(band.count, band.count * TRIES_PER_PROP);
    for (let i = 0; i < band.count; i++) {
      let found: Prop | null = null;
      for (let t = 0; t < tries; t++) {
        const x = rng.rand(rules.bounds.minX, rules.bounds.maxX);
        const z = rng.rand(band.minZ, band.maxZ);
        const scale = rng.rand(0.8, 1.2);
        if (inLane(rules, x) || insideLine(rules, z) || inClear(anchors, x, z, clear, band.kind, scale)) continue;
        if (within(placed, x, z, band.minGap, band.kind, scale)) continue;
        if (within(props, x, z, OTHER_GAP, band.kind, scale)) continue;
        found = { kind: band.kind, x, z, yaw: rng.rand(0, FULL_TURN), scale };
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
