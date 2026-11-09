// The map generator: one seed makes one map, the M1 B rules make a map that passes the check, the defence lines keep
// their gaps and breakable stretches, the cover stays out of the lines, and every band puts down the count it asks for.
import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { PROP_SIZE } from '../../src/data/props.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1B_RULES } from '../../src/data/maps/m1b-rules.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import type { MapDef, MapLine, Prop } from '../../src/data/types.ts';
import { validateMapForMission } from '../../src/logic/mapCheck.ts';
import { generateMap } from '../../src/logic/mapgen.ts';

const ANCHORS = { targets: M1B_HAND.targets, spawns: M1B_HAND.spawns };
const SKIP = {
  targets: ['main-gun-1', 'main-gun-2', 'magazine'],
  waves: ['beach-mortar', 'battery'],
};
const JITTER = 2; // the line's props may wobble 1 m either way; the tests allow for it

interface Footprint {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  yaw: number;
}

function footprintOf(prop: Prop): Footprint {
  const size = PROP_SIZE[prop.kind];
  return {
    x: prop.x,
    z: prop.z,
    halfW: (size.w * prop.scale) / 2,
    halfD: (size.d * prop.scale) / 2,
    yaw: prop.yaw,
  };
}

function radiusOnto(footprint: Footprint, nx: number, nz: number): number {
  const cos = Math.cos(footprint.yaw);
  const sin = Math.sin(footprint.yaw);
  return footprint.halfW * Math.abs(nx * cos - nz * sin) + footprint.halfD * Math.abs(nx * sin + nz * cos);
}

// Two rectangles overlap when no axis of either one separates their shadows.
function overlaps(a: Footprint, b: Footprint): boolean {
  const axes = [
    { x: Math.cos(a.yaw), z: -Math.sin(a.yaw) },
    { x: Math.sin(a.yaw), z: Math.cos(a.yaw) },
    { x: Math.cos(b.yaw), z: -Math.sin(b.yaw) },
    { x: Math.sin(b.yaw), z: Math.cos(b.yaw) },
  ];
  for (const axis of axes) {
    const apart = Math.abs((b.x - a.x) * axis.x + (b.z - a.z) * axis.z);
    if (apart > radiusOnto(a, axis.x, axis.z) + radiusOnto(b, axis.x, axis.z)) return false;
  }
  return true;
}

function inLine(line: MapLine, z: number): boolean {
  return z >= line.z - line.depth / 2 && z <= line.z + line.depth / 2;
}

function lineProps(map: MapDef, line: MapLine): Prop[] {
  return map.props.filter(
    prop =>
      prop.kind === line.kind &&
      prop.z >= line.z - line.depth / 2 - JITTER &&
      prop.z <= line.z + line.depth / 2 + JITTER,
  );
}

function rowZ(line: MapLine, row: number): number {
  return line.z - line.depth / 2 + (line.depth / line.rows) * (row + 0.5);
}

test('the same seed makes the same map', () => {
  const first = generateMap(createRng(7), M1B_RULES, ANCHORS);
  const second = generateMap(createRng(7), M1B_RULES, ANCHORS);
  expect(second).toEqual(first);
});

test('M1 B rules make a map with no violations', () => {
  expect(validateMapForMission(generateMap(createRng(1), M1B_RULES, ANCHORS), M1, SKIP)).toEqual([]);
});

test('M1 B rules make a map with no violations for seeds 0 to 19', () => {
  for (let seed = 0; seed < 20; seed++) {
    const map = generateMap(createRng(seed), M1B_RULES, ANCHORS);
    expect(validateMapForMission(map, M1, SKIP), `seed ${seed}`).toEqual([]);
  }
}, 30000);

test('nothing stands in a defence line’s gaps', () => {
  const map = generateMap(createRng(1), M1B_RULES, ANCHORS);
  for (const line of M1B_RULES.lines) {
    for (const prop of lineProps(map, line)) {
      const room = radiusOnto(footprintOf(prop), 1, 0);
      for (const gap of line.gaps) {
        expect(Math.abs(prop.x - gap.x), `${prop.x} in gap ${gap.x}`).toBeGreaterThanOrEqual(gap.width / 2 + room);
      }
    }
  }
});

test('odd rows are shifted by half the spacing', () => {
  const map = generateMap(createRng(1), M1B_RULES, ANCHORS);
  const line = M1B_RULES.lines[0];
  const first = lineProps(map, line)
    .filter(prop => Math.abs(prop.z - rowZ(line, 0)) < 2)
    .map(prop => prop.x)
    .sort((a, b) => a - b);
  const second = lineProps(map, line)
    .filter(prop => Math.abs(prop.z - rowZ(line, 1)) < 2)
    .map(prop => prop.x)
    .sort((a, b) => a - b);
  const diffs: number[] = [];
  for (const x of first.slice(0, 8)) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const other of second) nearest = Math.min(nearest, Math.abs(other - x));
    diffs.push(nearest);
  }
  const average = diffs.reduce((total, value) => total + value, 0) / diffs.length;
  expect(Math.abs(average - line.spacing / 2)).toBeLessThan(1.5);
});

test('only the props in a breakable stretch are marked breakable', () => {
  const map = generateMap(createRng(1), M1B_RULES, ANCHORS);
  for (const line of M1B_RULES.lines) {
    for (const prop of lineProps(map, line)) {
      const inStretch = line.breakable.some(zone => Math.abs(prop.x - zone.x) <= zone.width / 2);
      expect(prop.breakable === true, `${prop.x} on line ${line.z}`).toBe(inStretch);
    }
  }
});

test('cover bands stay out of the defence lines', () => {
  const map = generateMap(createRng(1), M1B_RULES, ANCHORS);
  for (const band of M1B_RULES.bands) {
    const props = map.props.filter(prop => prop.kind === band.kind && prop.z >= band.minZ && prop.z <= band.maxZ);
    expect(props.length, `${band.kind} in z ${band.minZ}..${band.maxZ}`).toBe(band.count);
    for (const prop of props) expect(M1B_RULES.lines.some(line => inLine(line, prop.z))).toBe(false);
  }
});

test('cover stays out of the targets’ clear ground', () => {
  const map = generateMap(createRng(1), M1B_RULES, ANCHORS);
  const clear = M1B_RULES.clear ?? 10;
  for (const prop of map.props) {
    if (M1B_RULES.lines.some(line => inLine(line, prop.z))) continue;
    for (const target of map.targets) {
      expect(Math.hypot(prop.x - target.x, prop.z - target.z)).toBeGreaterThanOrEqual(clear);
    }
  }
});

test('the props of different bands do not overlap', () => {
  const map = generateMap(createRng(1), M1B_RULES, ANCHORS);
  // The cliff is one line drawn from overlapping pieces, so it is left out.
  const props = map.props.filter(prop => prop.kind !== 'cliff');
  for (let i = 0; i < props.length; i++) {
    for (let j = i + 1; j < props.length; j++) {
      const a = footprintOf(props[i]);
      const b = footprintOf(props[j]);
      expect(overlaps(a, b), `${props[i].kind} and ${props[j].kind}`).toBe(false);
    }
  }
});

test('every band puts down its count', () => {
  const map = generateMap(createRng(1), M1B_RULES, ANCHORS);
  for (const band of M1B_RULES.bands) {
    const count = map.props.filter(
      prop => prop.kind === band.kind && prop.z >= band.minZ && prop.z <= band.maxZ,
    ).length;
    expect(count, `${band.kind} in z ${band.minZ}..${band.maxZ}`).toBe(band.count);
  }
  expect(map.props.filter(prop => prop.kind === 'cliff').length).toBe(M1B_RULES.cliff.count);
});
