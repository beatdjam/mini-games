// 第1章 移動。
import type { Level } from '../types.ts';

export const MOVE_LEVELS: Level[] = [
  {
    id: 'm01',
    chapter: 1,
    lines: ['vim'],
    cursor: {
      line: 0,
      col: 2,
    },
    target: ['vim'],
    targetCursor: {
      line: 0,
      col: 1,
    },
    solution: ['h'],
  },
  {
    id: 'm02',
    chapter: 1,
    lines: ['one', 'two', 'three'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['one', 'two', 'three'],
    targetCursor: {
      line: 2,
      col: 0,
    },
    solution: ['j', 'j'],
  },
  {
    id: 'm03',
    chapter: 1,
    lines: ['one', 'two', 'three'],
    cursor: {
      line: 2,
      col: 0,
    },
    target: ['one', 'two', 'three'],
    targetCursor: {
      line: 0,
      col: 0,
    },
    solution: ['k', 'k'],
  },
  {
    id: 'm04',
    chapter: 1,
    lines: ['cat'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['cat'],
    targetCursor: {
      line: 0,
      col: 2,
    },
    solution: ['l', 'l'],
  },
  {
    id: 'm05',
    chapter: 1,
    lines: ['a b c', 'd e f', 'g h i'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['a b c', 'd e f', 'g h i'],
    targetCursor: {
      line: 2,
      col: 4,
    },
    solution: ['j', 'j', 'l', 'l', 'l', 'l'],
  },
  {
    id: 'm06',
    chapter: 1,
    lines: ['    mind the gap'],
    cursor: {
      line: 0,
      col: 8,
    },
    target: ['    mind the gap'],
    targetCursor: {
      line: 0,
      col: 0,
    },
    solution: ['0'],
  },
  {
    id: 'm07',
    chapter: 1,
    lines: ['let total = 42'],
    cursor: {
      line: 0,
      col: 2,
    },
    target: ['let total = 42'],
    targetCursor: {
      line: 0,
      col: 13,
    },
    solution: ['$'],
  },
  {
    id: 'm08',
    chapter: 1,
    lines: ['one two three'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['one two three'],
    targetCursor: {
      line: 0,
      col: 8,
    },
    solution: ['w', 'w'],
  },
  {
    id: 'm09',
    chapter: 1,
    lines: ['one two three'],
    cursor: {
      line: 0,
      col: 8,
    },
    target: ['one two three'],
    targetCursor: {
      line: 0,
      col: 0,
    },
    solution: ['b', 'b'],
  },
  {
    id: 'm10',
    chapter: 1,
    lines: ['one two three'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['one two three'],
    targetCursor: {
      line: 0,
      col: 6,
    },
    solution: ['w', 'e'],
  },
  {
    id: 'm11',
    chapter: 1,
    lines: ['first', 'second', 'third', 'fourth'],
    cursor: {
      line: 3,
      col: 0,
    },
    target: ['first', 'second', 'third', 'fourth'],
    targetCursor: {
      line: 0,
      col: 0,
    },
    solution: ['g', 'g'],
  },
  {
    id: 'm12',
    chapter: 1,
    lines: ['first', 'second', 'third', 'fourth'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['first', 'second', 'third', 'fourth'],
    targetCursor: {
      line: 3,
      col: 0,
    },
    solution: ['G'],
  },
  {
    id: 'm13',
    chapter: 1,
    lines: ['a b c d e f'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['a b c d e f'],
    targetCursor: {
      line: 0,
      col: 10,
    },
    solution: ['5', 'w'],
  },
  {
    id: 'm14',
    chapter: 1,
    lines: ['function main() {', '  const total = 0;', '  return total;', '}'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['function main() {', '  const total = 0;', '  return total;', '}'],
    targetCursor: {
      line: 2,
      col: 9,
    },
    solution: ['2', 'j', 'w', 'w'],
  },
];
