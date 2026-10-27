// 第3章 オペレータ。
import type { Level } from '../types.ts';

export const OPERATOR_LEVELS: Level[] = [
  {
    id: 'o01',
    chapter: 3,
    lines: ['one two three'],
    cursor: {
      line: 0,
      col: 4,
    },
    target: ['one three'],
    solution: ['d', 'w'],
  },
  {
    id: 'o02',
    chapter: 3,
    lines: ['one two three'],
    cursor: {
      line: 0,
      col: 4,
    },
    target: ['one  three'],
    solution: ['d', 'e'],
  },
  {
    id: 'o03',
    chapter: 3,
    lines: ['one two three'],
    cursor: {
      line: 0,
      col: 8,
    },
    target: ['one three'],
    solution: ['d', 'b'],
  },
  {
    id: 'o04',
    chapter: 3,
    lines: ['keep', 'remove me', 'keep too'],
    cursor: {
      line: 1,
      col: 0,
    },
    target: ['keep', 'keep too'],
    solution: ['d', 'd'],
  },
  {
    id: 'o05',
    chapter: 3,
    lines: ['let x = 1;// note'],
    cursor: {
      line: 0,
      col: 10,
    },
    target: ['let x = 1;'],
    solution: ['D'],
  },
  {
    id: 'o06',
    chapter: 3,
    lines: ['hello world'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['good world'],
    solution: ['c', 'w', 'g', 'o', 'o', 'd', 'Escape'],
  },
  {
    id: 'o07',
    chapter: 3,
    lines: ['first', 'old line', 'last'],
    cursor: {
      line: 1,
      col: 0,
    },
    target: ['first', 'new line', 'last'],
    solution: ['c', 'c', 'n', 'e', 'w', ' ', 'l', 'i', 'n', 'e', 'Escape'],
  },
  {
    id: 'o08',
    chapter: 3,
    lines: ['let x = 1; // old'],
    cursor: {
      line: 0,
      col: 14,
    },
    target: ['let x = 1; // new'],
    solution: ['C', 'n', 'e', 'w', 'Escape'],
  },
  {
    id: 'o09',
    chapter: 3,
    lines: ['cat'],
    cursor: {
      line: 0,
      col: 1,
    },
    target: ['cut'],
    solution: ['s', 'u', 'Escape'],
  },
  {
    id: 'o10',
    chapter: 3,
    lines: ['old'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['new'],
    solution: ['S', 'n', 'e', 'w', 'Escape'],
  },
  {
    id: 'o11',
    chapter: 3,
    lines: ['a', 'b', 'c', 'd'],
    cursor: {
      line: 1,
      col: 0,
    },
    target: ['a', 'd'],
    solution: ['2', 'd', 'd'],
  },
  {
    id: 'o12',
    chapter: 3,
    lines: ['# todo', 'remove this line', 'name = "vim"'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['name = "vim editor"'],
    solution: ['d', 'd', 'd', 'd', '$', 'i', ' ', 'e', 'd', 'i', 't', 'o', 'r', 'Escape'],
  },
];
