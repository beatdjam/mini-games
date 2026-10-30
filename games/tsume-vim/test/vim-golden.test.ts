// Compares the engine with the real Vim 9.1 results in vim-golden/cases.json (made by vim-golden/generate.mjs).
import { describe, expect, test } from 'vitest';
import raw from './vim-golden/cases.json?raw';
import { Editor } from '../src/core/vim/editor.ts';

type GoldenCase = {
  group: string;
  lines: string[];
  start: [number, number];
  keys: string;
  lines_after: string[];
  cursor: [number, number];
};

const SPECIAL: Record<string, string> = { Esc: 'Escape', CR: 'Enter' };
const keysOf = (keys: string): string[] =>
  keys
    .split(/(<[A-Za-z-]+>)/)
    .flatMap(part => (/^<[A-Za-z-]+>$/.test(part) ? [SPECIAL[part.slice(1, -1)] ?? part.slice(1, -1)] : [...part]));

// cases.json is written by generate.mjs in exactly this shape
const cases = JSON.parse(raw) as GoldenCase[];
const groups = [...new Set(cases.map(c => c.group))];

describe('vim golden', () => {
  for (const group of groups) {
    const groupCases = cases.filter(c => c.group === group);
    test(group, () => {
      const failures: string[] = [];
      for (const c of groupCases) {
        const editor = new Editor(c.lines, { line: c.start[0], col: c.start[1] }, { m: { line: 3, col: 6 } });
        let unhandled: string | null = null;
        for (const key of keysOf(c.keys)) {
          if (!editor.feed(key)) {
            unhandled = key;
            break;
          }
        }
        const linesOk = JSON.stringify(editor.lines) === JSON.stringify(c.lines_after);
        const cursorOk = editor.cursor.line === c.cursor[0] && editor.cursor.col === c.cursor[1];
        if (!unhandled && linesOk && cursorOk) continue;
        const actual = unhandled
          ? `unhandled ${JSON.stringify(unhandled)}`
          : `${JSON.stringify(editor.lines)} @${editor.cursor.line},${editor.cursor.col}`;
        failures.push(
          `@${c.start[0]},${c.start[1]} ${c.keys}\n  engine ${actual}\n  vim    ${JSON.stringify(c.lines_after)} @${c.cursor[0]},${c.cursor[1]}`,
        );
      }
      expect(failures, `${group}: ${failures.length} of ${groupCases.length} cases differ`).toEqual([]);
    });
  }
});
