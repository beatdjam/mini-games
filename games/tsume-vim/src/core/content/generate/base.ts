// Builds endless and drill puzzles from a seed. A seed always makes the same puzzle, so the tests can type the
// sample keys and the page can replay a drill. The written words for each `kind` live in src/i18n/ja.ts.
import type { Pos } from '../../../data/types.ts';

export type Rng = () => number;

export interface Extra {
  targetCursor?: Pos;
  marks?: Record<string, Pos>;
}

export interface Generated extends Extra {
  kind: string;
  lines: string[];
  cursor: Pos;
  target: string[];
  solution: string[];
}

export const WORDS = [
  'alpha',
  'bravo',
  'charlie',
  'delta',
  'echo',
  'foxtrot',
  'golf',
  'hotel',
  'india',
  'juliet',
  'kilo',
  'lima',
  'mike',
  'november',
  'oscar',
  'papa',
  'quebec',
  'romeo',
  'sierra',
  'tango',
  'uniform',
  'victor',
  'whiskey',
  'xray',
  'yankee',
  'zulu',
];

export const ZERO: Pos = { line: 0, col: 0 };

export const puzzle = (
  kind: string,
  lines: string[],
  target: string[],
  solution: string[],
  cursor: Pos = ZERO,
  extra: Extra = {},
): Generated => ({ kind, lines, cursor, target, solution, ...extra });

// Movement puzzles keep the text and only ask for a cursor position.
export const move = (
  kind: string,
  lines: string[],
  cursor: Pos,
  targetCursor: Pos,
  solution: string[],
  extra: Omit<Extra, 'targetCursor'> = {},
): Generated => puzzle(kind, lines, lines, solution, cursor, { targetCursor, ...extra });

export const mulberry32 = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const pickInt = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
export const pick = <T>(rng: Rng, values: T[]): T => values[Math.floor(rng() * values.length)];

export function pickWords(rng: Rng, count: number): string[] {
  const pool = [...WORDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export const startOfWord = (words: string[], index: number): number => {
  let col = 0;
  for (let i = 0; i < index; i++) col += words[i].length + 1;
  return col;
};

export const differentWord = (rng: Rng, used: string[]): string =>
  pick(
    rng,
    WORDS.filter(word => !used.includes(word)),
  );
