import { expect, test } from 'vitest';
import { LANG } from '@engine/core/index.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import '../../src/i18n/ja.ts';
import '../../src/i18n/en.ts';

// The script holds language keys, not words. logic/ cannot read the language files, so this test checks that every
// radio line and every objective the M1 script names has text in both languages.
test('every M1 radio line and objective has text in ja and en', () => {
  const keys = new Set<string>();
  for (const cue of M1.cues) {
    for (const action of cue.actions) {
      if (action.kind === 'radio') keys.add(action.line);
      else if (action.kind === 'objective') keys.add(`obj.${action.id}`);
      else if (action.kind === 'ally' && action.fate?.call) keys.add(action.fate.call);
    }
  }
  expect(keys.size).toBeGreaterThan(0);
  for (const code of ['ja', 'en']) {
    const ui = LANG[code].ui;
    for (const key of keys) expect(ui[key], `${code} is missing "${key}"`).toBeTruthy();
  }
});
