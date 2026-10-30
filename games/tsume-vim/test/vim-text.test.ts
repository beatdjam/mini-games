import { describe, expect, test } from 'vitest';
import {
  adjustNumber,
  findCharOnLine,
  joinLinesText,
  matchBracket,
  paragraphBackward,
  paragraphForward,
  replaceAll,
  replaceFirst,
  textObject,
  wordBackward,
  wordEnd,
  wordEndBackward,
  wordForward,
} from '../src/core/vim/text.ts';

describe('vim-text', () => {
  test('word motions', () => {
    const lines = ['one two three'];
    expect(wordForward(lines, { line: 0, col: 0 }, 2, false)).toEqual({ line: 0, col: 8 });
    expect(wordBackward(lines, { line: 0, col: 8 }, 2, false)).toEqual({ line: 0, col: 0 });
    expect(wordEnd(lines, { line: 0, col: 0 }, 1, false)).toEqual({ line: 0, col: 2 });
    expect(wordEndBackward(lines, { line: 0, col: 8 }, 1, false)).toEqual({ line: 0, col: 6 });
  });

  test('paragraph motions', () => {
    const lines = ['a', 'b', '', 'c', 'd'];
    expect(paragraphForward(lines, { line: 0, col: 0 }, 1)).toEqual({ line: 2, col: 0 });
    expect(paragraphBackward(lines, { line: 4, col: 0 }, 1)).toEqual({ line: 2, col: 0 });
  });

  test('find a character with a count and till', () => {
    const lines = ['a,b,c'];
    expect(findCharOnLine(lines, { line: 0, col: 0 }, ',', 1, false, 1)).toEqual({ line: 0, col: 1 });
    expect(findCharOnLine(lines, { line: 0, col: 0 }, ',', 1, false, 2)).toEqual({ line: 0, col: 3 });
    expect(findCharOnLine(lines, { line: 0, col: 0 }, ',', 1, true, 2)).toEqual({ line: 0, col: 2 });
    expect(findCharOnLine(lines, { line: 0, col: 4 }, ',', -1, false, 1)).toEqual({ line: 0, col: 3 });
  });

  test('matching brackets', () => {
    const lines = ['if (a) {', '}'];
    expect(matchBracket(lines, { line: 0, col: 3 })).toEqual({ line: 0, col: 5 });
    expect(matchBracket(lines, { line: 0, col: 7 })).toEqual({ line: 1, col: 0 });
  });

  test('text objects find words, quotes and brackets from before them', () => {
    expect(textObject(['name = "vim"'], { line: 0, col: 0 }, '"', false)).toEqual({
      from: { line: 0, col: 8 },
      to: { line: 0, col: 10 },
      inclusive: true,
    });
    expect(textObject(['if (ready) {'], { line: 0, col: 0 }, '(', false)).toEqual({
      from: { line: 0, col: 4 },
      to: { line: 0, col: 8 },
      inclusive: true,
    });
    expect(textObject(['hello world'], { line: 0, col: 5 }, 'w', false)).toEqual({
      from: { line: 0, col: 6 },
      to: { line: 0, col: 10 },
      inclusive: true,
    });
  });

  test('a bracket object outside every block fails without looking back', () => {
    expect(textObject(['foo (bar) baz', '  qux'], { line: 1, col: 4 }, '(', false)).toBeNull();
    expect(textObject(['foo (bar) baz', '  qux'], { line: 1, col: 4 }, '(', true)).toBeNull();
  });

  test('a quote object takes the trailing space, or the leading one when none follows', () => {
    expect(textObject(['  qux "x y" end'], { line: 0, col: 4 }, '"', true)).toEqual({
      from: { line: 0, col: 6 },
      to: { line: 0, col: 11 },
      inclusive: true,
    });
    expect(textObject(['x "a"'], { line: 0, col: 2 }, '"', true)).toEqual({
      from: { line: 0, col: 1 },
      to: { line: 0, col: 4 },
      inclusive: true,
    });
  });

  test('number adjustment and joining lines', () => {
    expect(adjustNumber('value = 007;', 8, 1, 1)).toEqual({ line: 'value = 008;', col: 10 });
    expect(adjustNumber('value = 7;', 9, 1, 1)).toBeNull();
    expect(adjustNumber('const x = 10;', 10, 1, 5)).toEqual({ line: 'const x = 15;', col: 11 });
    expect(adjustNumber('x 0x1f -5', 2, 1, 1)).toEqual({ line: 'x 0x20 -5', col: 5 });
    expect(adjustNumber('x 0x0A y', 0, 1, 1)).toEqual({ line: 'x 0x0B y', col: 5 });
    expect(joinLinesText(['if (', ')'], 0, 1)).toBe('if ()');
    expect(joinLinesText(['one', 'two', 'three'], 0, 2)).toBe('one two three');
  });

  test('literal replace helpers', () => {
    expect(replaceFirst('old old', 'old', 'new')).toBe('new old');
    expect(replaceAll('old old', 'old', 'new')).toBe('new new');
  });
});
