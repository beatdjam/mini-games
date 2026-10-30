// The course levels (hand written) plus the generated drills. Endless puzzles are generated separately at play time.
import type { Level } from '../../data/types.ts';
import { LEVELS as COURSE } from '../../data/levels/index.ts';
import { DRILLS } from './drills.ts';

export const LEVELS: Level[] = [...COURSE, ...DRILLS];
