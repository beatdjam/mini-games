// The maps and M1's script agree: every target the script destroys and the map covers is on the map, the two waves
// that come in on this range have places, and the pillboxes do not stand inside the b-line place the script enters.
import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1B_RULES } from '../../src/data/maps/m1b-rules.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import type { MapDef, MapLine } from '../../src/data/types.ts';
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
// can cross that line.
function acrossLine(line: MapLine): MapDef {
  const margin = 6;
  return {
    ...M1B_HAND,
    bounds: {
      ...M1B_HAND.bounds,
      minZ: line.z - line.depth / 2 - margin,
      maxZ: line.z + line.depth / 2 + margin,
    },
  };
}

test('the hand map leaves a breakthrough in each of the three defence lines', () => {
  for (const line of M1B_RULES.lines.slice(0, 3)) {
    expect(checkMapPath(acrossLine(line)), `line at z ${line.z}`).toEqual([]);
  }
});

test('the hand map keeps at least 120 hedgehogs', () => {
  expect(M1B_HAND.props.filter(prop => prop.kind === 'hedgehog').length).toBeGreaterThanOrEqual(120);
});

test('the hand map marks two breakable stretches, one on line 2 and one on line 3', () => {
  const stretches = M1B_RULES.lines.flatMap(line => line.breakable.map(zone => ({ line, zone })));
  expect(stretches.length).toBe(2);
  for (const { line, zone } of stretches) {
    const marked = M1B_HAND.props.filter(
      prop =>
        prop.breakable === true &&
        prop.z >= line.z - line.depth / 2 &&
        prop.z <= line.z + line.depth / 2 &&
        Math.abs(prop.x - zone.x) <= zone.width / 2,
    );
    expect(marked.length, `breakable near x ${zone.x} on line ${line.z}`).toBeGreaterThan(0);
  }
});

test('the two pillboxes stand landward of z 0', () => {
  const pillboxes = M1B_HAND.targets.filter(target => target.kind === 'pillbox');
  expect(pillboxes.length).toBe(2);
  for (const pillbox of pillboxes) expect(pillbox.z, pillbox.id).toBeLessThan(0);
});

for (const { name, map } of MAPS) {
  test(`the ${name} map has the targets and spawns M1 uses on this range`, () => {
    const onMap = new Set(map.targets.map(target => target.id));
    for (const target of destroyedTargets()) {
      if (OUT_OF_RANGE.has(target)) continue;
      expect(onMap.has(target), target).toBe(true);
      expect(M1.targets).toContain(target);
    }
    for (const wave of ['b-squad', 'seawall-drop']) expect(map.spawns[wave]?.length ?? 0).toBeGreaterThan(0);
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
