// The rules that make M1's B line from a seed (SB-055): the same bands and density as the hand map, three lanes kept
// open from the sea to the seawall, and the cliff along the right edge. The targets and spawns come from the hand map,
// so the two ways of making the map put the story's things in the same places.
import type { MapRules } from '../types.ts';

export const M1B_RULES: MapRules = {
  id: 'm1b-gen',
  bounds: { minX: -100, maxX: 100, minZ: -60, maxZ: 170 },
  bands: [
    { minZ: 120, maxZ: 130, kind: 'hedgehog', count: 16, minGap: 6 },
    { minZ: 132, maxZ: 142, kind: 'hedgehog', count: 16, minGap: 6 },
    { minZ: 20, maxZ: 110, kind: 'block', count: 8, minGap: 12 },
    { minZ: 20, maxZ: 110, kind: 'wreck', count: 8, minGap: 14 },
    { minZ: 20, maxZ: 110, kind: 'crater', count: 9, minGap: 10 },
    { minZ: -50, maxZ: -40, kind: 'hedgehog', count: 16, minGap: 6 },
  ],
  cliff: { x: 94, minZ: -50, maxZ: 165, count: 12 },
  clear: 10,
  lanes: [
    { x: -50, width: 20 },
    { x: 0, width: 20 },
    { x: 50, width: 20 },
  ],
};
