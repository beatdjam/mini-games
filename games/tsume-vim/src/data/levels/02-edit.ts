// 第2章 入力と削除。
import type { Level } from '../types.ts';

export const EDIT_LEVELS: Level[] = [
  {
    id: 'e01',
    chapter: 2,
    lines: ['hellox'],
    cursor: {
      line: 0,
      col: 5,
    },
    target: ['hello'],
    solution: ['x'],
  },
  {
    id: 'e02',
    chapter: 2,
    lines: ['hhello'],
    cursor: {
      line: 0,
      col: 1,
    },
    target: ['hello'],
    solution: ['X'],
  },
  {
    id: 'e03',
    chapter: 2,
    lines: ['helloooo'],
    cursor: {
      line: 0,
      col: 5,
    },
    target: ['hello'],
    solution: ['4', 'x'],
  },
  {
    id: 'e04',
    chapter: 2,
    lines: ['helo'],
    cursor: {
      line: 0,
      col: 3,
    },
    target: ['hello'],
    solution: ['i', 'l', 'Escape'],
  },
  {
    id: 'e05',
    chapter: 2,
    lines: ['hllo'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['hello'],
    solution: ['a', 'e', 'Escape'],
  },
  {
    id: 'e06',
    chapter: 2,
    lines: ['hello'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['hello!'],
    solution: ['A', '!', 'Escape'],
  },
  {
    id: 'e07',
    chapter: 2,
    lines: ['value = 1;'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['let value = 1;'],
    solution: ['I', 'l', 'e', 't', ' ', 'Escape'],
  },
  {
    id: 'e08',
    chapter: 2,
    lines: ['one'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['one', 'two'],
    solution: ['o', 't', 'w', 'o', 'Escape'],
  },
  {
    id: 'e09',
    chapter: 2,
    lines: ['two'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['one', 'two'],
    solution: ['O', 'o', 'n', 'e', 'Escape'],
  },
  {
    id: 'e10',
    chapter: 2,
    lines: ['const a = 1;'],
    cursor: {
      line: 0,
      col: 10,
    },
    target: ['const a = 2;'],
    solution: ['r', '2'],
  },
  {
    id: 'e11',
    chapter: 2,
    lines: ['const a = 9;'],
    cursor: {
      line: 0,
      col: 10,
    },
    target: ['const a = 1;'],
    solution: ['x', 'u', 'r', '1'],
  },
  {
    id: 'e12',
    chapter: 2,
    lines: ['const port = 3000;'],
    cursor: {
      line: 0,
      col: 13,
    },
    target: ['const port = 8080;'],
    solution: ['r', '8', '2', 'l', 'r', '8'],
  },
];
