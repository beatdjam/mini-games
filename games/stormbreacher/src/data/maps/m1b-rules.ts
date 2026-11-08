// The rules that make M1's B line from a seed (SB-055): the same bands and density as the hand map, three lanes kept
// open from the sea to the seawall, and the cliff along the right edge. The targets and spawns come from the hand map,
// so the two ways of making the map put the story's things in the same places.
import type { MapRules } from '../types.ts';

export const M1B_RULES: MapRules = {
  id: 'm1b-gen',
  bounds: { minX: -100, maxX: 100, minZ: -60, maxZ: 170 },
  bands: [
    { minZ: 115, maxZ: 129, kind: 'hedgehog', count: 12, minGap: 7 },
    { minZ: 130, maxZ: 143, kind: 'hedgehog', count: 12, minGap: 7 },
    { minZ: 144, maxZ: 157, kind: 'hedgehog', count: 12, minGap: 7 },
    { minZ: -30, maxZ: 20, kind: 'block', count: 14, minGap: 5 },
    { minZ: 20, maxZ: 112, kind: 'block', count: 14, minGap: 5 },
    { minZ: -30, maxZ: 112, kind: 'wreck', count: 12, minGap: 6 },
    { minZ: -30, maxZ: 112, kind: 'crater', count: 14, minGap: 4 },
    { minZ: -56, maxZ: -45, kind: 'hedgehog', count: 10, minGap: 7 },
    { minZ: -44, maxZ: -33, kind: 'hedgehog', count: 10, minGap: 7 },
  ],
  cliff: { x: 100, minZ: -50, maxZ: 165, count: 12 },
  clear: 10,
  lanes: [
    { x: -50, width: 20 },
    { x: 0, width: 20 },
    { x: 50, width: 20 },
  ],
};
