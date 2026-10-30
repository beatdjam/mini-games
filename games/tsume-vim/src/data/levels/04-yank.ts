// 第4章 コピーと貼り付け。
import type { Level } from '../types.ts';

export const YANK_LEVELS: Level[] = [
  {
    id: 'y01',
    chapter: 4,
    lines: ['hello'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['hello', 'hello'],
    solution: ['y', 'y', 'p'],
  },
  {
    id: 'y02',
    chapter: 4,
    lines: ['one', 'two'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['two', 'one'],
    solution: ['d', 'd', 'p'],
  },
  {
    id: 'y03',
    chapter: 4,
    lines: ['hello world', ''],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['hello world', 'hello world'],
    solution: ['y', '$', 'j', 'p'],
  },
  {
    id: 'y04',
    chapter: 4,
    lines: ['ab'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['ba'],
    solution: ['x', 'p'],
  },
  {
    id: 'y05',
    chapter: 4,
    lines: ['const a = 1;'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['const a = 1;', 'const a = 2;'],
    solution: ['y', 'y', 'p', '$', 'h', 'r', '2'],
  },
  {
    id: 'y06',
    chapter: 4,
    lines: ['1', '2', '3'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['2', '3', '1'],
    solution: ['d', 'd', 'G', 'p'],
  },
  {
    id: 'y07',
    chapter: 4,
    lines: ['alpha'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['alpha', 'alpha beta'],
    solution: ['y', 'y', 'p', 'A', ' ', 'b', 'e', 't', 'a', 'Escape'],
  },
  {
    id: 'y08',
    chapter: 4,
    lines: ['item 1'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['item 1', 'item 2', 'item 3'],
    solution: ['y', 'y', 'p', '$', 'r', '2', 'y', 'y', 'p', '$', 'r', '3'],
  },
];
