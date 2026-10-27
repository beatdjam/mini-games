// 第5章 行内の移動。
import type { Level } from '../types.ts';

export const FIND_LEVELS: Level[] = [
  {
    id: 'f01',
    chapter: 5,
    lines: ['hello world'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['hello world'],
    targetCursor: {
      line: 0,
      col: 6,
    },
    solution: ['f', 'w'],
  },
  {
    id: 'f02',
    chapter: 5,
    lines: ['hello, world'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['hello, world'],
    targetCursor: {
      line: 0,
      col: 4,
    },
    solution: ['t', ','],
  },
  {
    id: 'f03',
    chapter: 5,
    lines: ['hello'],
    cursor: {
      line: 0,
      col: 4,
    },
    target: ['hello'],
    targetCursor: {
      line: 0,
      col: 0,
    },
    solution: ['F', 'h'],
  },
  {
    id: 'f04',
    chapter: 5,
    lines: ['hello world'],
    cursor: {
      line: 0,
      col: 10,
    },
    target: ['hello world'],
    targetCursor: {
      line: 0,
      col: 7,
    },
    solution: ['T', 'w'],
  },
  {
    id: 'f05',
    chapter: 5,
    lines: ['a,b,c,d'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['a,b,c,d'],
    targetCursor: {
      line: 0,
      col: 3,
    },
    solution: ['f', ',', ';'],
  },
  {
    id: 'f06',
    chapter: 5,
    lines: ['one,two,three'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['two,three'],
    solution: ['d', 'f', ','],
  },
  {
    id: 'f07',
    chapter: 5,
    lines: ['one,two,three'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: [',two,three'],
    solution: ['d', 't', ','],
  },
  {
    id: 'f08',
    chapter: 5,
    lines: ['GET /old/path HTTP/1.1'],
    cursor: {
      line: 0,
      col: 5,
    },
    target: ['GET /new/path HTTP/1.1'],
    solution: ['c', 't', '/', 'n', 'e', 'w', 'Escape'],
  },
];
