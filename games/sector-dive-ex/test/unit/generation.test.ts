// A pin on the level generator, which needs no page: it runs in node. The tests that build a level in the game and walk
// it are in ../sectors.test.ts.
import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { BOSS_ORDER } from '../../src/data/bosses.ts';
import { BIOMES } from '../../src/data/biomes.ts';
import { generateLevel } from '../../src/world/levelGen.ts';
import type { GeneratedLevel } from '../../src/world/levelGen.ts';

// A pin on generation: the same seed must keep giving the same maps, rooms and start. Changing the generator or the
// order it draws random numbers in changes these on purpose, and then the numbers here are updated with it.
function levelHash(gen: GeneratedLevel): string {
  const M = gen.maps;
  const maps = [M.grid, M.hgt, M.ramp, M.cover, gen.hazard, M.roomOf].map(a => Array.from(a).join(','));
  const text = maps.join('|') + JSON.stringify(gen.rooms) + gen.startIdx;
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}
test('generation is pinned: the same seed gives the same level', () => {
  const got: Record<string, string> = {};
  BIOMES.forEach(b => {
    got[b.code] = levelHash(generateLevel(b, false, null, createRng(1234)));
  });
  BOSS_ORDER.forEach(k => {
    got['arena ' + k] = levelHash(generateLevel(BIOMES[0], true, k, createRng(1234)));
  });
  expect(got).toEqual({
    DATA: '31230a44',
    FORGE: 'a37e213e',
    NOISE: 'f514cc1b',
    RUIN: 'ea80ade1',
    KWLN: '9b86bedd',
    CITY: 'd1432964',
    MALL: '2c496622',
    HOSP: 'c933e16e',
    'arena watcher': 'b566d42b',
    'arena crusher': 'b566d42b',
    'arena hoist': 'dc3f981b', // (no pillars, as TRINITY's)
    'arena surgeon': 'dc3f981b',
    'arena core': 'dc3f981b',
    'arena phantom': 'b566d42b',
    'arena trinity': 'dc3f981b',
    'arena bastion': 'dc3f981b',
    'arena titan': 'dc3f981b',
  });
});
