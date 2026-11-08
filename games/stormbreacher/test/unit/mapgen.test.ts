// The map generator: one seed makes one map, the M1 B rules make a map that passes the check, the targets' clear
// ground and the lanes stay empty, and every band puts down the count the rules ask for.
import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { PROP_SIZE } from '../../src/data/props.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1B_RULES } from '../../src/data/maps/m1b-rules.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import type { Prop } from '../../src/data/types.ts';
import { validateMapForMission } from '../../src/logic/mapCheck.ts';
import { generateMap } from '../../src/logic/mapgen.ts';

const ANCHORS = { targets: M1B_HAND.targets, spawns: M1B_HAND.spawns };
const SKIP = {
  targets: ['main-gun-1', 'main-gun-2', 'magazine'],
  waves: ['beach-mortar', 'battery'],
};

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

test('the same seed makes the same map', () => {
  const first = generateMap(createRng(7), M1B_RULES, ANCHORS);
  const second = generateMap(createRng(7), M1B_RULES, ANCHORS);
  expect(second).toEqual(first);
});

test('M1 B rules make a map with no violations', () => {
  expect(validateMapForMission(generateMap(createRng(1), M1B_RULES, ANCHORS), M1, SKIP)).toEqual([]);
});

test('nothing stands in a target’s clear ground or in a lane', () => {
  const map = generateMap(createRng(1), M1B_RULES, ANCHORS);
  const clear = M1B_RULES.clear ?? 10;
  for (const prop of map.props) {
    for (const target of map.targets) {
      expect(Math.hypot(prop.x - target.x, prop.z - target.z)).toBeGreaterThanOrEqual(clear);
    }
    for (const lane of M1B_RULES.lanes) expect(Math.abs(prop.x - lane.x)).toBeGreaterThanOrEqual(lane.width / 2);
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
