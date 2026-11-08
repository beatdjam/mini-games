// The map generator: one seed makes one map, the M1 B rules make a map that passes the check, the targets' clear
// ground and the lanes stay empty, and every band puts down the count the rules ask for.
import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1B_RULES } from '../../src/data/maps/m1b-rules.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { validateMapForMission } from '../../src/logic/mapCheck.ts';
import { generateMap } from '../../src/logic/mapgen.ts';

const ANCHORS = { targets: M1B_HAND.targets, spawns: M1B_HAND.spawns };
const SKIP = {
  targets: ['main-gun-1', 'main-gun-2', 'magazine'],
  waves: ['beach-mortar', 'battery'],
};

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
