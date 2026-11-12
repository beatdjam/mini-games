// SB-120: the defence lines of the hand map and of generated maps are closed to the 4 m mech; its 2 m width fits
// through no crack between the hedgehogs of a row.
import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1B_RULES } from '../../src/data/maps/m1b-rules.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { PROP_SIZE } from '../../src/data/props.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import type { MapDef, MapLine, Prop } from '../../src/data/types.ts';
import { rectGap, type GroundRect } from '../../src/logic/collide.ts';
import { validateMapForMission } from '../../src/logic/mapCheck.ts';
import { generateMap } from '../../src/logic/mapgen.ts';

const ANCHORS = { targets: M1B_HAND.targets, spawns: M1B_HAND.spawns };
const SKIP = {
  targets: ['main-gun-1', 'main-gun-2', 'magazine'],
  waves: ['beach-mortar', 'battery'],
};

const WIDTH = MECH_TUNE.radius * 2; // the width of the mech (m)
const JITTER = 2; // the generated props wobble 1 m either way, so a row is 2 m wide about its middle

function footprintOf(prop: Prop): GroundRect {
  const size = PROP_SIZE[prop.kind];
  return { x: prop.x, z: prop.z, halfW: (size.w * prop.scale) / 2, halfD: (size.d * prop.scale) / 2, yaw: prop.yaw };
}

// For every row of the line, the gap between each pair of neighbouring props; the pairs that straddle a breakthrough
// are left out.
function crackWidths(map: MapDef, line: MapLine): number[] {
  const narrowestGap = Math.min(...line.gaps.map(gap => gap.width));
  const widths: number[] = [];
  for (let row = 0; row < line.rows; row++) {
    const rowZ = line.z - line.depth / 2 + (line.depth / line.rows) * (row + 0.5);
    const props = map.props
      .filter(prop => prop.kind === line.kind && Math.abs(prop.z - rowZ) <= JITTER)
      .sort((a, b) => a.x - b.x);
    for (let i = 1; i < props.length; i++) {
      if (Math.abs(props[i].x - props[i - 1].x) >= narrowestGap) continue;
      widths.push(rectGap(footprintOf(props[i - 1]), footprintOf(props[i])));
    }
  }
  return widths;
}

// Fills each breakthrough of the line with hedgehogs every 3 m (7 of them, so the fill reaches past the gap's
// neighbours on both sides) on every row of the line.
function withGapsBlocked(map: MapDef, line: MapLine): MapDef {
  const blocked = structuredClone(map);
  for (const gap of line.gaps) {
    for (let row = 0; row < line.rows; row++) {
      const z = line.z - line.depth / 2 + (line.depth / line.rows) * (row + 0.5);
      for (let k = -3; k <= 3; k++) {
        blocked.props.push({ kind: 'hedgehog', x: gap.x + k * 3, z, yaw: 0, scale: 1 });
      }
    }
  }
  return blocked;
}

test('the hand map’s rows have no crack the mech fits through', () => {
  for (const line of M1B_RULES.lines) {
    const widths = crackWidths(M1B_HAND, line);
    expect(widths.length, `line at z ${line.z}`).toBeGreaterThan(40);
    const widest = Math.max(...widths);
    expect(widest, `line at z ${line.z}`).toBeLessThan(WIDTH);
  }
});

test('a generated map’s rows have no crack the mech fits through, for seeds 0 to 19', () => {
  for (let seed = 0; seed < 20; seed++) {
    const map = generateMap(createRng(seed), M1B_RULES, ANCHORS);
    for (const line of M1B_RULES.lines) {
      const widest = Math.max(...crackWidths(map, line));
      expect(widest, `seed ${seed}, line at z ${line.z}`).toBeLessThan(WIDTH);
    }
  }
}, 30000);

test('blocking a generated line’s breakthroughs leaves no path, for seeds 0 to 19', () => {
  for (let seed = 0; seed < 20; seed++) {
    const map = generateMap(createRng(seed), M1B_RULES, ANCHORS);
    for (const line of M1B_RULES.lines) {
      const violations = validateMapForMission(withGapsBlocked(map, line), M1, SKIP);
      expect(
        violations.some(violation => violation.kind === 'no-path'),
        `seed ${seed}, line at z ${line.z}`,
      ).toBe(true);
    }
  }
}, 30000);
