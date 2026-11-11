// The map check: the hand map fits M1's names and the mech's size, a missing or doubled target or a prop outside the
// bounds is named, and a wall of blocks stops the walk until a gap is opened.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1B_RULES } from '../../src/data/maps/m1b-rules.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { validateMapForMission } from '../../src/logic/mapCheck.ts';
import type { MapDef, Prop } from '../../src/data/types.ts';

// The mission's things past this map's range: the guns and the magazine behind the seawall, the beach's mortar and
// the battery on the other side.
const SKIP = {
  targets: ['main-gun-1', 'main-gun-2', 'magazine'],
  waves: ['beach-mortar', 'battery'],
};

function withoutTargets(ids: readonly string[]): MapDef {
  const map = structuredClone(M1B_HAND);
  map.targets = map.targets.filter(target => !ids.includes(target.id));
  return map;
}

function withWall(): MapDef {
  const map = structuredClone(M1B_HAND);
  map.props = [];
  for (let x = -99; x <= 99; x += 2) map.props.push({ kind: 'block', x, z: 100, yaw: 0, scale: 1 });
  return map;
}

// A wall of blocks across the map at z with an 18 m gap over x -9..9, so a blocker in the middle leaves 6 m on each
// side.
function withGapWall(z: number): MapDef {
  const map = structuredClone(M1B_HAND);
  const props: Prop[] = [];
  const add = (x: number) => props.push({ kind: 'block', x, z, yaw: 0, scale: 1 });
  for (let x = -96; x <= -12; x += 6) add(x);
  for (let x = 12; x <= 96; x += 6) add(x);
  add(-99);
  add(99);
  map.props = props;
  return map;
}

test('the hand map has no violations against M1 once the out-of-range names are left out', () => {
  expect(validateMapForMission(M1B_HAND, M1, SKIP)).toEqual([]);
});

test('the hand map keeps the B line dense', () => {
  const count = (kind: Prop['kind']) => M1B_HAND.props.filter(prop => prop.kind === kind).length;
  const cover = ['block', 'wreck', 'crater'] as const;
  expect(cover.reduce((total, kind) => total + count(kind), 0)).toBeGreaterThanOrEqual(20);
  expect(count('hedgehog')).toBeGreaterThanOrEqual(120);
});

test('a target the mission destroys and the map lacks is a violation', () => {
  const violations = validateMapForMission(withoutTargets(['depot']), M1, SKIP);
  expect(violations.some(violation => violation.kind === 'target-missing')).toBe(true);
  expect(violations.some(violation => violation.message.includes('depot'))).toBe(true);
});

test('two targets with the same id are a violation', () => {
  const map = structuredClone(M1B_HAND);
  map.targets.push({ id: 'pillbox-1', kind: 'gun', x: 80, z: -20, yaw: 0 });
  const violations = validateMapForMission(map, M1, SKIP);
  expect(violations.some(violation => violation.kind === 'target-duplicate')).toBe(true);
  expect(violations.some(violation => violation.message.includes('pillbox-1'))).toBe(true);
});

// A 1 m mech gets through the 3.2 m cracks between a defence line's hedgehogs, so blocking only the breakthroughs no
// longer closes the line (mapgen's CRACK). Fill every row solid to check the walk.
test('a defence line filled solid across the map leaves no path', () => {
  const line = M1B_RULES.lines[0];
  const map = structuredClone(M1B_HAND);
  for (let row = 0; row < line.rows; row++) {
    const z = line.z - line.depth / 2 + (line.depth / line.rows) * (row + 0.5);
    for (let x = map.bounds.minX + 1; x <= map.bounds.maxX - 1; x += 2) {
      map.props.push({ kind: 'hedgehog', x, z, yaw: 0, scale: 1 });
    }
  }
  const violations = validateMapForMission(map, M1, SKIP);
  expect(violations.some(violation => violation.kind === 'no-path')).toBe(true);
});

// SB-120 closes the lines to the 4 m mech; until then the cracks between the hedgehogs are open.
test.todo('blocking a defence line’s breakthroughs leaves no path');

test('a prop outside the bounds is a violation', () => {
  const map = structuredClone(M1B_HAND);
  map.props.push({ kind: 'block', x: 120, z: 0, yaw: 0, scale: 1 });
  const violations = validateMapForMission(map, M1, SKIP);
  expect(violations.some(violation => violation.kind === 'out-of-bounds')).toBe(true);
});

test('a map target the mission does not know is a violation', () => {
  const map = structuredClone(M1B_HAND);
  map.targets.push({ id: 'ghost', kind: 'gun', x: -70, z: 20, yaw: 0 });
  const violations = validateMapForMission(map, M1, SKIP);
  expect(violations.some(violation => violation.kind === 'target-extra')).toBe(true);
});

test('a wall of blocks across the whole map leaves no path', () => {
  const violations = validateMapForMission(withWall(), M1, SKIP);
  expect(violations.some(violation => violation.kind === 'no-path')).toBe(true);
});

test('a gap wider than the mech in the wall opens the path again', () => {
  const map = withWall();
  map.props = map.props.filter(prop => Math.abs(prop.x) > 6);
  expect(validateMapForMission(map, M1, SKIP)).toEqual([]);
});

test('a 12 m wreck across the path with 3 m gaps leaves a path for a 1 m mech', () => {
  const map = withGapWall(50);
  map.props.push({ kind: 'wreck', x: 0, z: 50, yaw: 0, scale: 1 });
  expect(validateMapForMission(map, M1, SKIP)).toEqual([]);
});

test('a 16.8 m wreck across the path with 0.6 m gaps leaves no path', () => {
  const map = withGapWall(50);
  map.props.push({ kind: 'wreck', x: 0, z: 50, yaw: 0, scale: 1.4 });
  const violations = validateMapForMission(map, M1, SKIP);
  expect(violations.some(violation => violation.kind === 'no-path')).toBe(true);
});

test('turning the wreck 90 degrees opens the path again', () => {
  const map = withGapWall(50);
  map.props.push({ kind: 'wreck', x: 0, z: 50, yaw: Math.PI / 2, scale: 1.4 });
  expect(validateMapForMission(map, M1, SKIP)).toEqual([]);
});

test('a block at scale 2.8 blocks a wider gap than at scale 1', () => {
  const small = withGapWall(50);
  small.props.push({ kind: 'block', x: 0, z: 50, yaw: 0, scale: 1 });
  expect(validateMapForMission(small, M1, SKIP)).toEqual([]);
  const large = withGapWall(50);
  large.props.push({ kind: 'block', x: 0, z: 50, yaw: 0, scale: 2.8 });
  expect(validateMapForMission(large, M1, SKIP).some(violation => violation.kind === 'no-path')).toBe(true);
});
