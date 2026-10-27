// A fixed set of generated drills after the written course. The 48 builders repeat, so the drills cover every
// kind (delete, change, search, marks, dot, numbers, colon commands, visual, H/M/L) several times.
import type { Level } from '../../data/types.ts';
import { generateLevel } from './generate/index.ts';

const DRILL_COUNT = 84;

export const DRILLS: Level[] = Array.from({ length: DRILL_COUNT }, (_, index) =>
  generateLevel(index + 1, `d${String(index + 1).padStart(2, '0')}`, 10),
);
