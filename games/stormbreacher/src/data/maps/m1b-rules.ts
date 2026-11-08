// The rules that make M1's B line from a seed (SB-055): three defence lines and C's front row, the cover between them,
// and the cliff along the right edge. The targets and spawns come from the hand map, so the two ways of making the map
// put the story's things in the same places.
import type { MapRules } from '../types.ts';

export const M1B_RULES: MapRules = {
  id: 'm1b-gen',
  bounds: { minX: -100, maxX: 100, minZ: -60, maxZ: 170 },
  lines: [
    // line 1, at the water's edge: breakthroughs near x -55 and 40
    {
      z: 137,
      depth: 18,
      rows: 3,
      kind: 'hedgehog',
      spacing: 6.2,
      gaps: [
        { x: -55, width: 9 },
        { x: 40, width: 9 },
      ],
      breakable: [],
    },
    // line 2, the middle of B: one breakthrough near x -10 and a breakable stretch on the right
    {
      z: 88,
      depth: 16,
      rows: 3,
      kind: 'hedgehog',
      spacing: 6.2,
      gaps: [{ x: -10, width: 9 }],
      breakable: [{ x: 50, width: 15 }],
    },
    // line 3, before the pillboxes: one breakthrough far from them, a breakable stretch on the left
    {
      z: 17,
      depth: 18,
      rows: 3,
      kind: 'hedgehog',
      spacing: 6.2,
      gaps: [{ x: 61, width: 9 }],
      breakable: [{ x: -30, width: 15 }],
    },
    // C's two rows before the seawall: breakthroughs near x -50 and 35
    {
      z: -45,
      depth: 20,
      rows: 2,
      kind: 'hedgehog',
      spacing: 6.2,
      gaps: [
        { x: -50, width: 9 },
        { x: 35, width: 9 },
      ],
      breakable: [],
    },
  ],
  bands: [
    // cover between line 1 and line 2
    { minZ: 100, maxZ: 126, kind: 'block', count: 6, minGap: 5 },
    { minZ: 100, maxZ: 126, kind: 'wreck', count: 2, minGap: 6 },
    { minZ: 100, maxZ: 126, kind: 'crater', count: 3, minGap: 4 },
    // cover between line 2 and line 3
    { minZ: 38, maxZ: 76, kind: 'block', count: 6, minGap: 5 },
    { minZ: 38, maxZ: 76, kind: 'wreck', count: 2, minGap: 6 },
    { minZ: 38, maxZ: 76, kind: 'crater', count: 3, minGap: 4 },
    // cover behind line 3
    { minZ: -32, maxZ: 4, kind: 'block', count: 2, minGap: 5 },
    { minZ: -32, maxZ: 4, kind: 'wreck', count: 2, minGap: 6 },
    { minZ: -32, maxZ: 4, kind: 'crater', count: 2, minGap: 4 },
  ],
  cliff: { x: 100, minZ: -50, maxZ: 165, count: 12 },
  clear: 10,
  lanes: [],
};
