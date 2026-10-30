import type { Pos } from '../../data/types.ts';

export type Mode = 'normal' | 'insert' | 'visual' | 'visual-line' | 'search' | 'command';

export type Operator = 'd' | 'c' | 'y' | '>' | '<';

export interface Snapshot {
  lines: string[];
  cursor: Pos;
}

export interface Register {
  text: string;
  linewise: boolean;
}

export type Pending =
  | { kind: 'op'; op: Operator; count: number; count2: number }
  | { kind: 'opFind'; op: Operator; count: number; dir: 1 | -1; till: boolean }
  | { kind: 'opG'; op: Operator; count: number }
  | { kind: 'opMark'; op: Operator; linewise: boolean }
  | { kind: 'opText'; op: Operator; around: boolean }
  | { kind: 'visualText'; around: boolean }
  | { kind: 'visualReplace' }
  | { kind: 'register' }
  | { kind: 'g'; count: number }
  | { kind: 'mark' }
  | { kind: 'jumpMark'; linewise: boolean }
  | { kind: 'find'; dir: 1 | -1; till: boolean; count: number }
  | { kind: 'replace'; count: number };

export type MotionKind = 'linewise' | 'inclusive' | 'exclusive';

export interface Motion {
  // text objects name both ends; ordinary motions start at the cursor
  from?: Pos;
  to: Pos;
  inclusive: boolean;
  linewise: boolean;
}

export interface Search {
  pattern: string;
  dir: 1 | -1;
  wholeWord: boolean;
}

export interface Find {
  char: string;
  dir: 1 | -1;
  till: boolean;
}
