// The maps and M1's script agree: every target the script destroys and the map covers is on the map, the waves
// that come in on this range have places, and the pillboxes do not stand inside the b-line place the script enters.
import { expect, test } from 'vitest';
import { createRng, distXZ } from '@engine/core/index.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1B_RULES } from '../../src/data/maps/m1b-rules.ts';
import { PROP_SIZE } from '../../src/data/props.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import type { MapDef, MapLine } from '../../src/data/types.ts';
import { targetBox } from '../../src/logic/game.ts';
import { checkMapPath } from '../../src/logic/mapCheck.ts';
import { generateMap } from '../../src/logic/mapgen.ts';

const OUT_OF_RANGE = new Set(['main-gun-1', 'main-gun-2', 'magazine']);

const MAPS: { name: string; map: MapDef }[] = [
  { name: 'hand', map: M1B_HAND },
  {
    name: 'gen',
    map: generateMap(createRng(1), M1B_RULES, { targets: M1B_HAND.targets, spawns: M1B_HAND.spawns }),
  },
];

// The targets the script destroys, from the triggers.
function destroyedTargets(): Set<string> {
  const names = new Set<string>();
  for (const cue of M1.cues) {
    if (cue.trigger.kind === 'destroyed') for (const target of cue.trigger.targets) names.add(target);
  }
  return names;
}

// The hand map around one defence line, with some open ground on either side, so checkMapPath can say whether the mech
// can cross that line. The battery's parts are left off: they stand far outside the cropped range.
function acrossLine(line: MapLine): MapDef {
  const margin = 6;
  return {
    ...M1B_HAND,
    targets: M1B_HAND.targets.filter(target => target.kind !== 'gun' && target.kind !== 'magazine'),
    bounds: {
      ...M1B_HAND.bounds,
      minZ: line.z - line.depth / 2 - margin,
      maxZ: line.z + line.depth / 2 + margin,
    },
  };
}

test('each of the three lines is closed, and one blast point of each opens it', () => {
  const points = M1B_HAND.blasts ?? [];
  for (const line of M1B_RULES.lines.slice(0, 3)) {
    const onLine = points.filter(point => point.line === line.z);
    const others = points.filter(point => point.line !== line.z);
    expect(onLine.length, `line at z ${line.z}`).toBe(2);
    for (const point of onLine) {
      const map = { ...acrossLine(line), blasts: [point, ...others] };
      expect(checkMapPath(map), `line at z ${line.z} opened by ${point.id}`).toEqual([]);
    }
    const closed = { ...acrossLine(line), blasts: [] };
    expect(
      checkMapPath(closed).some(violation => violation.kind === 'no-path'),
      `line at z ${line.z} closed`,
    ).toBe(true);
  }
});

test('the hand map keeps at least 120 hedgehogs', () => {
  expect(M1B_HAND.props.filter(prop => prop.kind === 'hedgehog').length).toBeGreaterThanOrEqual(120);
});

test('the hand map has two blast points on each of the three lines and none on C', () => {
  // the pillboxes' points name a target and belong to no line; the line tests count only the line's points (SB-1540)
  const blasts = (M1B_HAND.blasts ?? []).filter(blast => blast.target === undefined);
  expect(blasts).toHaveLength(6);
  for (const line of M1B_RULES.lines.slice(0, 3)) {
    const onLine = blasts.filter(blast => blast.line === line.z);
    expect(onLine, `line at z ${line.z}`).toHaveLength(2);
    for (const blast of onLine) expect(blast.z, blast.id).toBeGreaterThan(line.z);
  }
  for (const line of M1B_RULES.lines.slice(3)) {
    expect(
      blasts.filter(blast => blast.line === line.z),
      `line at z ${line.z}`,
    ).toEqual([]);
  }
});

test('the two pillboxes have a side and a back blast point outside their boxes', () => {
  const points = (M1B_HAND.blasts ?? []).filter(blast => blast.target !== undefined);
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const place = M1B_HAND.targets.find(target => target.id === id);
    if (!place) throw new Error(`the hand map has no ${id}`);
    const box = targetBox(place);
    const ofTarget = points.filter(point => point.target === id);
    expect(ofTarget, id).toHaveLength(2);
    for (const point of ofTarget) {
      expect(point.line, point.id).toBeNull();
      // clear of the box the shot meets, so a charge can be planted beside it without standing in the wall
      expect(point.x < box.minX || point.x > box.maxX || point.z < box.minZ || point.z > box.maxZ, point.id).toBe(true);
      // near enough to reach from the point
      expect(distXZ(point, place), point.id).toBeLessThanOrEqual(12);
      const { minX, maxX, minZ, maxZ } = M1B_HAND.bounds;
      expect(point.x, point.id).toBeGreaterThanOrEqual(minX);
      expect(point.x, point.id).toBeLessThanOrEqual(maxX);
      expect(point.z, point.id).toBeGreaterThanOrEqual(minZ);
      expect(point.z, point.id).toBeLessThanOrEqual(maxZ);
    }
  }
});

test('the hand map’s line hedgehogs are not breakable', () => {
  for (const line of M1B_RULES.lines.slice(0, 3)) {
    const marked = M1B_HAND.props.filter(
      prop =>
        prop.kind === 'hedgehog' &&
        prop.z >= line.z - line.depth / 2 &&
        prop.z <= line.z + line.depth / 2 &&
        prop.breakable === true,
    );
    expect(marked, `line at z ${line.z}`).toEqual([]);
  }
});

test('the two pillboxes of the objective stand landward of z 0', () => {
  const pillboxes = M1B_HAND.targets.filter(target => target.id === 'pillbox-1' || target.id === 'pillbox-2');
  expect(pillboxes.length).toBe(2);
  for (const pillbox of pillboxes) expect(pillbox.z, pillbox.id).toBeLessThan(0);
});

test('the hand map’s seawall runs from x -100 to 100 with no gap along x, inside the bounds', () => {
  const size = PROP_SIZE.seawall;
  const rows = new Map<number, number[]>();
  for (const prop of M1B_HAND.props) {
    if (prop.kind !== 'seawall') continue;
    rows.set(
      prop.z,
      [...(rows.get(prop.z) ?? []), prop.x].sort((a, b) => a - b),
    );
  }
  expect(rows.size).toBeGreaterThan(0);
  const { minX, maxX, minZ } = M1B_HAND.bounds;
  for (const [z, xs] of rows) {
    expect(xs[0] - size.w / 2, `row ${z}`).toBeLessThanOrEqual(minX);
    expect(xs[xs.length - 1] + size.w / 2, `row ${z}`).toBeGreaterThanOrEqual(maxX);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1], `row ${z}`).toBeLessThanOrEqual(size.w);
    expect(z - size.d / 2, `row ${z}`).toBeGreaterThanOrEqual(minZ);
  }
});

test('the hand map’s ramps stand against the seawall’s sea side and climb to its height', () => {
  const ramps = M1B_HAND.props.filter(prop => prop.kind === 'ramp');
  expect(ramps.length).toBe(2);
  const seaSide = Math.max(
    ...M1B_HAND.props.filter(prop => prop.kind === 'seawall').map(prop => prop.z + PROP_SIZE.seawall.d / 2),
  );
  for (const ramp of ramps) {
    expect(ramp.z - PROP_SIZE.ramp.d / 2).toBeCloseTo(seaSide, 6);
    expect(PROP_SIZE.ramp.h).toBe(PROP_SIZE.seawall.h);
  }
});

test('the hand map’s low walls leave room to walk round them', () => {
  const walls = M1B_HAND.props.filter(prop => prop.kind === 'lowWall').sort((a, b) => a.x - b.x);
  expect(walls.length).toBeGreaterThanOrEqual(4);
  expect(walls.length).toBeLessThanOrEqual(6);
  for (let i = 1; i < walls.length; i++) {
    const gap = walls[i].x - walls[i - 1].x - PROP_SIZE.lowWall.w;
    expect(gap).toBeGreaterThan(MECH_TUNE.radius * 2);
  }
});

for (const { name, map } of MAPS) {
  test(`the ${name} map has the targets and spawns M1 uses on this range`, () => {
    const onMap = new Set(map.targets.map(target => target.id));
    for (const target of destroyedTargets()) {
      if (OUT_OF_RANGE.has(target)) continue;
      expect(onMap.has(target), target).toBe(true);
      expect(M1.targets).toContain(target);
    }
    for (const wave of ['b-squad', 'depot-guard', 'seawall-drop', 'c-squad'])
      expect(map.spawns[wave]?.length ?? 0).toBeGreaterThan(0);
  });

  test(`the ${name} map keeps the pillboxes out of the b-line place`, () => {
    const area = M1.areas['b-line'];
    const minZ = area.z - area.d / 2;
    const maxZ = area.z + area.d / 2;
    for (const target of map.targets) {
      if (target.kind !== 'pillbox') continue;
      expect(target.z < minZ || target.z > maxZ, `${target.id} at z ${target.z}`).toBe(true);
    }
  });
}
