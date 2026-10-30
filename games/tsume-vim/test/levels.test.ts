import { describe, expect, test } from 'vitest';
import { LEVELS } from '../src/core/content/catalog.ts';
import { Editor } from '../src/core/vim/editor.ts';
import { generateLevel } from '../src/core/content/generate/index.ts';
import '../src/i18n/ja.ts';
import { endlessText, levelText } from '../src/i18n/text.ts';
import { type } from './helpers.ts';

describe('levels', () => {
  test('ids are unique', () => {
    expect(new Set(LEVELS.map(level => level.id)).size).toBe(LEVELS.length);
  });

  test('every level has a title, brief, hint and explanation', () => {
    for (const level of LEVELS) {
      const words = level.kind ? endlessText(level.kind) : levelText(level.id);
      expect(words.title, level.id).not.toBe(level.id);
      expect(words.brief.length, level.id).toBeGreaterThan(0);
      expect(words.hint.length, level.id).toBeGreaterThan(0);
      expect(words.explanation.length, level.id).toBeGreaterThan(0);
    }
  });

  test('generated puzzles are solvable for many seeds', () => {
    for (let seed = 0; seed < 300; seed++) {
      const level = generateLevel(seed, `g${seed}`, 9);
      const editor = new Editor(level.lines, level.cursor, level.marks);
      if (!level.targetCursor) expect(editor.lines, `seed ${seed} ${level.kind}`).not.toEqual(level.target);
      type(editor, level.solution);
      expect(editor.lines, `seed ${seed} ${level.kind}`).toEqual(level.target);
      if (level.targetCursor) expect(editor.cursor, `seed ${seed} ${level.kind}`).toEqual(level.targetCursor);
    }
  });

  test.each(LEVELS)('$id: the sample keys reach the target', level => {
    const editor = new Editor(level.lines, level.cursor, level.marks);
    if (!level.targetCursor) expect(editor.lines).not.toEqual(level.target);
    type(editor, level.solution);
    expect(editor.lines).toEqual(level.target);
    if (level.targetCursor) expect(editor.cursor).toEqual(level.targetCursor);
  });
});
