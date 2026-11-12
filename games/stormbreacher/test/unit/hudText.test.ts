import { expect, test } from 'vitest';
import { LANG } from '@engine/core/index.ts';
import { ENEMY_KINDS } from '../../src/data/enemies.ts';
import { HUD_TUNE } from '../../src/data/tune.ts';
import { TARGET_KINDS } from '../../src/data/types.ts';
import '../../src/i18n/ja.ts';
import '../../src/i18n/en.ts';

// The HUD holds language keys, not words. logic/ and view/ cannot read the language files, so this test checks that
// every key the HUD names has text in both languages.
test('every HUD key has text in ja and en', () => {
  const keys = new Set<string>([
    'hud.armor',
    'hud.boost',
    'hud.main',
    'hud.sub',
    'hud.objective',
    HUD_TUNE.objectiveKey,
  ]);
  for (const kind of TARGET_KINDS) keys.add(`target.${kind}`);
  for (const kind of ENEMY_KINDS) keys.add(`target.${kind}`);

  expect(keys.size).toBe(6 + TARGET_KINDS.length + ENEMY_KINDS.length);
  for (const code of ['ja', 'en']) {
    const ui = LANG[code].ui;
    for (const key of keys) expect(ui[key], `${code} is missing "${key}"`).toBeTruthy();
  }
});
