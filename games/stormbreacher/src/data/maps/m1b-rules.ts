// The rules that make M1's B section from a seed (SB-055, SB-2020): two defence lines and C's front row, the cover
// between them, and the cliff along the right edge. The targets and spawns come from the hand map, so the two ways of
// making the map put the story's things in the same places. The lines stand 4.4 m apart in a row, which keeps the 3 m
// hedgehogs (2.7 m at scale 0.9) under 2 m apart (SB-120).
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
      spacing: 4.4,
      gaps: [
        { x: -55, width: 9 },
        { x: 40, width: 9 },
      ],
      breakable: [],
    },
    // line 2, 69 m in from line 1 (SB-2020): one breakthrough near x -10 and a breakable stretch on the right
    {
      z: 68,
      depth: 12,
      rows: 3,
      kind: 'hedgehog',
      spacing: 4.4,
      gaps: [{ x: -10, width: 9 }],
      breakable: [{ x: 50, width: 15 }],
    },
    // C's two rows before the seawall: breakthroughs near x -50 and 35
    {
      z: -45,
      depth: 20,
      rows: 2,
      kind: 'hedgehog',
      spacing: 4.4,
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
    // cover between line 2 and the pillbox line (line 2's span is z 62..74)
    { minZ: 6, maxZ: 56, kind: 'block', count: 6, minGap: 5 },
    { minZ: 6, maxZ: 56, kind: 'wreck', count: 2, minGap: 6 },
    { minZ: 6, maxZ: 56, kind: 'crater', count: 3, minGap: 4 },
    // cover before the pillbox line
    { minZ: -32, maxZ: 4, kind: 'block', count: 2, minGap: 5 },
    { minZ: -32, maxZ: 4, kind: 'wreck', count: 2, minGap: 6 },
    { minZ: -32, maxZ: 4, kind: 'crater', count: 2, minGap: 4 },
  ],
  cliff: { x: 100, minZ: -50, maxZ: 165, count: 12 },
  clear: 10,
  lanes: [],
};
