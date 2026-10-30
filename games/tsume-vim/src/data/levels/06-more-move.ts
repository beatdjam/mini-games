// 第6章 もっと移動。
import type { Level } from '../types.ts';

export const MORE_MOVE_LEVELS: Level[] = [
  {
    id: 'r01',
    chapter: 6,
    lines: ['one', '  two', 'three'],
    cursor: {
      line: 0,
      col: 2,
    },
    target: ['one', '  two', 'three'],
    targetCursor: {
      line: 1,
      col: 2,
    },
    solution: ['+'],
  },
  {
    id: 'r02',
    chapter: 6,
    lines: ['one', '  two', 'three'],
    cursor: {
      line: 2,
      col: 0,
    },
    target: ['one', '  two', 'three'],
    targetCursor: {
      line: 1,
      col: 2,
    },
    solution: ['-'],
  },
  {
    id: 'r03',
    chapter: 6,
    lines: ['if (ok) {', '    run();', '}'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['if (ok) {', '    run();', '}'],
    targetCursor: {
      line: 1,
      col: 4,
    },
    solution: ['2', '_'],
  },
  {
    id: 'r04',
    chapter: 6,
    lines: ['one,two three'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['one,two three'],
    targetCursor: {
      line: 0,
      col: 8,
    },
    solution: ['W'],
  },
  {
    id: 'r05',
    chapter: 6,
    lines: ['one,two three'],
    cursor: {
      line: 0,
      col: 8,
    },
    target: ['one,two three'],
    targetCursor: {
      line: 0,
      col: 0,
    },
    solution: ['B'],
  },
  {
    id: 'r06',
    chapter: 6,
    lines: ['one,two three'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['one,two three'],
    targetCursor: {
      line: 0,
      col: 6,
    },
    solution: ['E'],
  },
  {
    id: 'r07',
    chapter: 6,
    lines: ['one two three'],
    cursor: {
      line: 0,
      col: 8,
    },
    target: ['one two three'],
    targetCursor: {
      line: 0,
      col: 6,
    },
    solution: ['g', 'e'],
  },
  {
    id: 'r08',
    chapter: 6,
    lines: ['one,two three'],
    cursor: {
      line: 0,
      col: 8,
    },
    target: ['one,two three'],
    targetCursor: {
      line: 0,
      col: 6,
    },
    solution: ['g', 'E'],
  },
  {
    id: 'r09',
    chapter: 6,
    lines: ['alpha', 'beta', '', 'gamma', 'delta'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['alpha', 'beta', '', 'gamma', 'delta'],
    targetCursor: {
      line: 2,
      col: 0,
    },
    solution: ['}'],
  },
  {
    id: 'r10',
    chapter: 6,
    lines: ['alpha', 'beta', '', 'gamma', 'delta'],
    cursor: {
      line: 4,
      col: 0,
    },
    target: ['alpha', 'beta', '', 'gamma', 'delta'],
    targetCursor: {
      line: 2,
      col: 0,
    },
    solution: ['{'],
  },
  {
    id: 'r11',
    chapter: 6,
    lines: ['if (ready) {', '  run();', '}'],
    cursor: {
      line: 0,
      col: 11,
    },
    target: ['if (ready) {', '  run();', '}'],
    targetCursor: {
      line: 2,
      col: 0,
    },
    solution: ['%'],
  },
  {
    id: 'r12',
    chapter: 6,
    lines: ['total = (a + b) * 2;'],
    cursor: {
      line: 0,
      col: 8,
    },
    target: ['total = (a + b) * 2;'],
    targetCursor: {
      line: 0,
      col: 14,
    },
    solution: ['%'],
  },
  {
    id: 'r13',
    chapter: 6,
    lines: ['let answer = 42;'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['let answer = 42;'],
    targetCursor: {
      line: 0,
      col: 9,
    },
    solution: ['1', '0', '|'],
  },
  {
    id: 'r14',
    chapter: 6,
    lines: ['  return value  '],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['  return value  '],
    targetCursor: {
      line: 0,
      col: 13,
    },
    solution: ['g', '_'],
  },
  {
    id: 'r15',
    chapter: 6,
    lines: ['first target here', 'second target here', 'third'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['first target here', 'second target here', 'third'],
    targetCursor: {
      line: 0,
      col: 6,
    },
    solution: ['/', 't', 'a', 'r', 'g', 'e', 't', 'Enter'],
  },
  {
    id: 'r16',
    chapter: 6,
    lines: ['first target here', 'second target here', 'third'],
    cursor: {
      line: 2,
      col: 0,
    },
    target: ['first target here', 'second target here', 'third'],
    targetCursor: {
      line: 1,
      col: 7,
    },
    solution: ['?', 't', 'a', 'r', 'g', 'e', 't', 'Enter'],
  },
  {
    id: 'r17',
    chapter: 6,
    lines: ['todo', 'todo list', 'done todo'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['todo', 'todo list', 'done todo'],
    targetCursor: {
      line: 2,
      col: 5,
    },
    solution: ['/', 't', 'o', 'd', 'o', 'Enter', 'n'],
  },
  {
    id: 'r18',
    chapter: 6,
    lines: ['count = 0', 'print(count)', 'count += 1'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['count = 0', 'print(count)', 'count += 1'],
    targetCursor: {
      line: 1,
      col: 6,
    },
    solution: ['*'],
  },
  {
    id: 'r19',
    chapter: 6,
    lines: ['alpha', 'bravo', 'charlie'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['alpha', 'bravo', 'charlie'],
    targetCursor: {
      line: 2,
      col: 2,
    },
    marks: {
      a: {
        line: 2,
        col: 2,
      },
    },
    solution: ['`', 'a'],
  },
  {
    id: 'r20',
    chapter: 6,
    lines: ['alpha', 'bravo', 'charlie'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['alpha', 'bravo', 'charlie'],
    targetCursor: {
      line: 2,
      col: 0,
    },
    marks: {
      b: {
        line: 2,
        col: 2,
      },
    },
    solution: ["'", 'b'],
  },
  {
    id: 'r21',
    chapter: 6,
    lines: ['alpha', 'bravo', 'gamma'],
    cursor: {
      line: 2,
      col: 2,
    },
    target: ['alpha', 'bravo', 'gamma'],
    targetCursor: {
      line: 2,
      col: 0,
    },
    solution: ['m', 'a', 'g', 'g', "'", 'a'],
  },
  {
    id: 'r22',
    chapter: 6,
    lines: ['alpha beta', 'gamma', 'delta'],
    cursor: {
      line: 0,
      col: 2,
    },
    target: ['alpha beta', 'gamma', 'delta'],
    targetCursor: {
      line: 0,
      col: 0,
    },
    solution: ['/', 'd', 'e', 'l', 't', 'a', 'Enter', "'", "'"],
  },
  {
    id: 'h01',
    chapter: 6,
    lines: ['  alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'],
    cursor: {
      line: 4,
      col: 0,
    },
    target: ['  alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'],
    targetCursor: {
      line: 0,
      col: 2,
    },
    solution: ['H'],
  },
  {
    id: 'h02',
    chapter: 6,
    lines: ['  alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['  alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'],
    targetCursor: {
      line: 4,
      col: 0,
    },
    solution: ['M'],
  },
  {
    id: 'h03',
    chapter: 6,
    lines: ['  alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['  alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'],
    targetCursor: {
      line: 8,
      col: 0,
    },
    solution: ['L'],
  },
  {
    id: 'h04',
    chapter: 6,
    lines: ['  alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'],
    cursor: {
      line: 8,
      col: 0,
    },
    target: ['  alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'],
    targetCursor: {
      line: 2,
      col: 0,
    },
    solution: ['3', 'H'],
  },
  {
    id: 'h05',
    chapter: 6,
    lines: ['  alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'],
    cursor: {
      line: 0,
      col: 0,
    },
    target: ['  alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'],
    targetCursor: {
      line: 6,
      col: 0,
    },
    solution: ['3', 'L'],
  },
];
