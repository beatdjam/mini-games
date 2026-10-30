// Smoke test for Sector Dive Extended, the trailer script. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real loop by hand.
// Each test makes the state it needs; the file passes on its own and in any order (the dice are seeded where a test depends on them).
import { beforeAll, expect, test } from 'vitest';
import { parseScript } from '@engine/trailer/script.ts';
import { trailerGame } from '../src/dev/trailer.ts';
import sampleTrailer from '../trailers/2026-10-05.txt?raw';
import { bootGame } from './helpers.ts';

beforeAll(bootGame);

test('trailer: the sample script reads with the game words; a word the game does not have is named by its line', () => {
  const { script, errors } = parseScript(sampleTrailer);
  expect([...errors, ...trailerGame.check(script)]).toEqual([]);
  expect(script.total, 'the trailer of 2026-10-05, with the boss beaten').toBeCloseTo(36.2);
  const bad = parseScript(
    [
      'music NOPE',
      'guns shotgun laser',
      'scene 1',
      '  at KWLN start',
      '  enemies crawler dragon',
      '  do jump',
      'scene 1',
      '  at stairs',
      '  do ride',
      'scene 1',
      '  looks shiny',
      '  wave hello',
    ].join('\n'),
  ).script;
  expect(
    trailerGame
      .check(bad)
      .map(e => e.split(':')[0])
      .sort(),
  ).toEqual(['line 1', 'line 11', 'line 12', 'line 2', 'line 5', 'line 6', 'line 8', 'line 9'].sort());
});
