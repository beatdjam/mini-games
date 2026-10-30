// 第9章 テキストオブジェクト。
import type { Level } from '../types.ts';

export const TEXT_OBJECT_LEVELS: Level[] = [
  {
    id: 't01',
    chapter: 9,
    lines: ['one two three'],
    cursor: {
      line: 0,
      col: 4,
    },
    target: ['one three'],
    solution: ['d', 'a', 'w'],
  },
  {
    id: 't02',
    chapter: 9,
    lines: ['hello world'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['good world'],
    solution: ['c', 'i', 'w', 'g', 'o', 'o', 'd', 'Escape'],
  },
  {
    id: 't03',
    chapter: 9,
    lines: ['name = "vim"'],
    cursor: {
      line: 0,
      col: 8,
    },
    target: ['name = ""'],
    solution: ['d', 'i', '"'],
  },
  {
    id: 't04',
    chapter: 9,
    lines: ['name = "old"'],
    cursor: {
      line: 0,
      col: 8,
    },
    target: ['name = "new"'],
    solution: ['c', 'i', '"', 'n', 'e', 'w', 'Escape'],
  },
  {
    id: 't05',
    chapter: 9,
    lines: ['if (ready) {'],
    cursor: {
      line: 0,
      col: 4,
    },
    target: ['if (done) {'],
    solution: ['c', 'i', '(', 'd', 'o', 'n', 'e', 'Escape'],
  },
  {
    id: 't06',
    chapter: 9,
    lines: ['print(value)'],
    cursor: {
      line: 0,
      col: 6,
    },
    target: ['print'],
    solution: ['c', 'a', '(', 'Escape'],
  },
  {
    id: 't07',
    chapter: 9,
    lines: ['map = {a: 1};'],
    cursor: {
      line: 0,
      col: 8,
    },
    target: ['map = {};'],
    solution: ['d', 'i', '{'],
  },
  {
    id: 't08',
    chapter: 9,
    lines: ['call(alpha)'],
    cursor: {
      line: 0,
      col: 6,
    },
    target: ['call()'],
    solution: ['v', 'i', '(', 'd'],
  },
];
