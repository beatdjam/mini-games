// The state and operations the split Vim modules share. Editor implements this interface and hands itself to
// each module, so the modules never need to import one another.
import type { Pos } from '../../data/types.ts';
import type { Registers } from './registers.ts';
import type { Find, Mode, Motion, MotionKind, Operator, Pending, Search, Snapshot } from './types.ts';

// The largest count a key sequence can build (3 digits, as in Vim).
export const MAX_COUNT = 9999;

export interface EditorHost {
  lines: string[];
  cursor: Pos;
  mode: Mode;
  anchor: Pos | null;
  marks: Record<string, Pos>;
  lastJump: Pos | null;
  searchText: string;
  searchDirection: 1 | -1;
  commandText: string;
  pending: Pending | null;
  count: number;
  lastFind: Find | null;
  lastSearch: Search | null;
  searchReturn: Mode;
  operatorSearch: { op: Operator; count: number } | null;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  record: string[] | null;
  recordText: string;
  lastChange: string[] | null;
  replaying: boolean;
  undoPushedForReplay: boolean;
  insertRepeat: number;
  insertStartLine: number;
  insertStartOffset: number;
  insertOpensLine: boolean;
  readonly registers: Registers;
  readonly text: string;
  readonly line: string;

  takeCount(): number;
  moveTo(pos: Pos): void;
  moveToMotion(motion: Motion | null, jump: boolean): void;
  normalizeNormal(pos: Pos): Pos;
  normalizeInsert(pos: Pos): Pos;
  normalizeCursor(): void;

  handle(key: string): boolean;
  pendingKey(key: string): boolean;
  motionKey(key: string): boolean;

  resolveMotion(key: string, count: number, explicit?: boolean): Motion | null;
  resolveGMotion(key: string, count: number): Motion | null;
  operatorMotionKind(key: string, motion: Motion): MotionKind;
  hasMotionKind(key: string): boolean;
  operatorMotion(op: Operator, key: string, count: number, explicit: boolean): Motion | null;

  applyOperator(op: Operator, motion: Motion): void;
  applyLineOp(op: Operator, count: number): void;
  linewiseOp(op: Operator, from: number, to: number, yankToFirstNonBlank?: boolean): void;
  charwiseOp(op: Operator, from: Pos, to: Pos, inclusive: boolean): void;
  yankLines(from: number, to: number): void;

  simpleEdit(key: string): void;
  adjustNumber(delta: number, count: number): void;
  replaceChars(char: string, count: number): void;
  replaceRange(from: Pos, to: Pos, char: string): void;
  toggleCase(count: number): void;
  toggleRange(from: Pos, to: Pos): void;
  joinLines(count: number): void;
  joinSelected(from: number, to: number): void;
  put(beforeCursor: boolean, count: number): void;
  putVisual(from: Pos, to: Pos, linewise: boolean, keepUnnamed: boolean): void;
  insertText(text: string, pos: Pos): void;
  removeRange(from: Pos, to: Pos, inclusive: boolean): string;
  indentLines(from: number, to: number, dir: 1 | -1): void;

  startInsertCommand(key: string, count?: number): void;
  replaceVisual(char: string): void;

  pushUndo(cursor?: Pos): void;
  undo(): void;
  redo(): void;

  search(pattern: string, dir: 1 | -1): boolean;
  repeatSearchTarget(key: 'n' | 'N', count: number): Pos | null;
  searchWordTarget(dir: 1 | -1, count: number): Pos | null;
  replayLastChange(count: number): void;
}
