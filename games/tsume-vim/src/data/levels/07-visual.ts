// 第7章 ビジュアル。
import type { Level } from '../types.ts';

export const VISUAL_LEVELS: Level[] = [
  {
    id: 'v01',
    chapter: 7,
    lines: ['hello world'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['world'],
    solution: ['v', 'e', 'l', 'd'],
  },
  {
    id: 'v02',
    chapter: 7,
    lines: ['one', 'two', 'three', 'four'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['three', 'four'],
    solution: ['V', 'j', 'd'],
  },
  {
    id: 'v03',
    chapter: 7,
    lines: ['vim'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['vimvim'],
    solution: ['v', '$', 'y', '$', 'p'],
  },
  {
    id: 'v04',
    chapter: 7,
    lines: ['if (ok) {', 'run();', '}'],
    cursor: {
      line: 1,
      col: 0,
    },
    target: ['if (ok) {', '  run();', '}'],
    solution: ['V', '>'],
  },
  {
    id: 'v05',
    chapter: 7,
    lines: ['hello world'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['good world'],
    solution: ['v', 'e', 'c', 'g', 'o', 'o', 'd', 'Escape'],
  },
  {
    id: 'v06',
    chapter: 7,
    lines: ['if (ok) {', 'run();', 'stop();', '}'],
    cursor: {
      line: 1,
      col: 0,
    },
    target: ['if (ok) {', '  run();', '  stop();', '}'],
    solution: ['V', 'j', '>'],
  },
];
