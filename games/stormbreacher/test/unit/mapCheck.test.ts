// The map check: the hand map fits M1's names and the mech's size, a missing target or a prop outside the bounds is
// named, and a wall of blocks stops the walk until a gap is opened.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
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
  const obstacles = ['block', 'wreck', 'crater'] as const;
  expect(obstacles.reduce((total, kind) => total + count(kind), 0)).toBeGreaterThanOrEqual(50);
  expect(count('hedgehog')).toBeGreaterThanOrEqual(60);
});

test('a target the mission destroys and the map lacks is a violation', () => {
  const violations = validateMapForMission(withoutTargets(['depot']), M1, SKIP);
  expect(violations.some(violation => violation.kind === 'target-missing')).toBe(true);
  expect(violations.some(violation => violation.message.includes('depot'))).toBe(true);
});

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

test('a 12 m wreck across the path with 3 m gaps leaves no path', () => {
  const map = withGapWall(50);
  map.props.push({ kind: 'wreck', x: 0, z: 50, yaw: 0, scale: 1 });
  const violations = validateMapForMission(map, M1, SKIP);
  expect(violations.some(violation => violation.kind === 'no-path')).toBe(true);
});

test('turning the wreck 90 degrees opens the path again', () => {
  const map = withGapWall(50);
  map.props.push({ kind: 'wreck', x: 0, z: 50, yaw: Math.PI / 2, scale: 1 });
  expect(validateMapForMission(map, M1, SKIP)).toEqual([]);
});

test('a block at scale 2 blocks a wider gap than at scale 1', () => {
  const small = withGapWall(50);
  small.props.push({ kind: 'block', x: 0, z: 50, yaw: 0, scale: 1 });
  expect(validateMapForMission(small, M1, SKIP)).toEqual([]);
  const large = withGapWall(50);
  large.props.push({ kind: 'block', x: 0, z: 50, yaw: 0, scale: 2 });
  expect(validateMapForMission(large, M1, SKIP).some(violation => violation.kind === 'no-path')).toBe(true);
});
