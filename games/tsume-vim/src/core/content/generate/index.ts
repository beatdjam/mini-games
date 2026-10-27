// Builds endless and drill puzzles from a seed. A seed always makes the same puzzle, so tests can type the sample
// keys and the page can replay a drill. The written words for each kind live in src/i18n/ja.ts.
import type { Level } from '../../../data/types.ts';
import { mulberry32 } from './base.ts';
import { BUILDERS } from './builders.ts';

export function generateLevel(seed: number, id: string, chapter: number): Level {
  const index = Math.abs(Math.trunc(seed)) % BUILDERS.length;
  return { id, chapter, ...BUILDERS[index](mulberry32(seed)) };
}
