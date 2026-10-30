// The internal state of the Vim editor: buffer, cursor, mode, pending key, registers, undo stacks and `.`
// recording. The role modules receive this as an `EditorHost`; `Editor` keeps it hidden from callers.
import type { Pos } from '../../data/types.ts';
import { before } from './text.ts';
import { Registers } from './registers.ts';
import type { Find, Mode, Motion, Operator, Pending, Search, Snapshot } from './types.ts';
import type { EditorHost } from './context.ts';
import {
  MOTION_KINDS,
  operatorMotionKind as operatorMotionKindIn,
  resolveGMotion as resolveGMotionIn,
  resolveMotion as resolveMotionIn,
} from './motion.ts';
import { motionKey as motionKeyIn, normalKey as normalKeyIn } from './normal.ts';
import { pendingKey as pendingKeyIn } from './pending.ts';
import { commandKey as commandKeyIn } from './command.ts';
import { insertKey as insertKeyIn, startInsertCommand as startInsertCommandIn } from './insert.ts';
import { replaceVisual as replaceVisualIn, visualKey as visualKeyIn } from './visual.ts';
import {
  applyLineOp as applyLineOpIn,
  applyOperator as applyOperatorIn,
  charwiseOp as charwiseOpIn,
  linewiseOp as linewiseOpIn,
  operatorMotion as operatorMotionIn,
  yankLines as yankLinesIn,
} from './operator.ts';
import {
  adjustNumber as adjustNumberIn,
  indentLines as indentLinesIn,
  insertText as insertTextIn,
  joinLines as joinLinesIn,
  joinSelected as joinSelectedIn,
  put as putIn,
  putVisual as putVisualIn,
  removeRange as removeRangeIn,
  replaceChars as replaceCharsIn,
  replaceRange as replaceRangeIn,
  simpleEdit as simpleEditIn,
  toggleCase as toggleCaseIn,
  toggleRange as toggleRangeIn,
} from './editing.ts';
import { pushUndo as pushUndoIn, redo as redoIn, undo as undoIn } from './undo.ts';
import {
  repeatSearchTarget as repeatSearchTargetIn,
  search as searchIn,
  searchKey as searchKeyIn,
  searchWordTarget as searchWordTargetIn,
} from './search.ts';
import { handleTracked, replayLastChange as replayLastChangeIn } from './replay.ts';

export class EditorCore implements EditorHost {
  lines: string[];
  cursor: Pos;
  mode: Mode = 'normal';
  anchor: Pos | null = null;
  readonly registers = new Registers();
  // the text typed after / or ?, shown by the status line while mode is 'search'
  searchText = '';
  searchDirection: 1 | -1 = 1;
  commandText = '';
  marks: Record<string, Pos> = {};
  lastJump: Pos | null = null;

  pending: Pending | null = null;
  count = 0;
  lastFind: Find | null = null;
  lastSearch: Search | null = null;
  // the mode to go back to after a search, so / in visual keeps the selection
  searchReturn: Mode = 'normal';
  // the operator waiting for the pattern after / or ?
  operatorSearch: { op: Operator; count: number } | null = null;
  undoStack: Snapshot[] = [];
  redoStack: Snapshot[] = [];
  // the keys of the change being recorded, and the keys of the last finished change (for `.`)
  record: string[] | null = null;
  recordText = '';
  lastChange: string[] | null = null;
  replaying = false;
  undoPushedForReplay = false;
  // how many times the text typed in the current insert is repeated (3i#)
  insertRepeat = 1;
  insertStartLine = 0;
  insertStartOffset = 0;
  insertOpensLine = false;

  constructor(lines: string[], cursor: Pos, marks: Record<string, Pos> = {}) {
    this.lines = lines.length ? [...lines] : [''];
    this.cursor = this.normalizeNormal(cursor);
    for (const [name, pos] of Object.entries(marks)) this.marks[name] = this.normalizeNormal(pos);
  }

  get text(): string {
    return this.lines.join('\n');
  }

  get line(): string {
    return this.lines[this.cursor.line] ?? '';
  }

  feed(key: string): boolean {
    return handleTracked(this, key);
  }

  get pendingText(): string {
    const pending = this.pending;
    if (!pending) return '';
    if (pending.kind === 'register') return '"';
    if (pending.kind === 'op') return pending.op;
    if (pending.kind === 'opFind' || pending.kind === 'opG' || pending.kind === 'opMark') return pending.op;
    if (pending.kind === 'opText') return `${pending.op}${pending.around ? 'a' : 'i'}`;
    if (pending.kind === 'g') return 'g';
    if (pending.kind === 'find') return pending.till ? (pending.dir > 0 ? 't' : 'T') : pending.dir > 0 ? 'f' : 'F';
    if (pending.kind === 'replace') return 'r';
    if (pending.kind === 'mark') return 'm';
    if (pending.kind === 'jumpMark') return pending.linewise ? "'" : '`';
    return '';
  }

  isSelected(line: number, col: number): boolean {
    if (this.mode !== 'visual' && this.mode !== 'visual-line') return false;
    const a = this.anchor ?? this.cursor;
    const b = this.cursor;
    if (this.mode === 'visual-line') return line >= Math.min(a.line, b.line) && line <= Math.max(a.line, b.line);
    const from = before(a, b) ? a : b;
    const to = before(a, b) ? b : a;
    if (line < from.line || line > to.line) return false;
    if (line === from.line && col < from.col) return false;
    if (line === to.line && col > to.col) return false;
    return true;
  }

  handle(key: string): boolean {
    if (key === 'C-r') {
      if (this.mode === 'normal') {
        const count = this.takeCount() || 1;
        for (let i = 0; i < count; i++) this.redo();
        return true;
      }
      return false;
    }
    if (this.mode === 'insert') return this.insertKey(key);
    if (this.mode === 'search') return this.searchKey(key);
    if (this.mode === 'command') return this.commandKey(key);
    if (this.mode === 'visual' || this.mode === 'visual-line') return this.visualKey(key);
    return this.normalKey(key);
  }

  moveTo(pos: Pos): void {
    const visual = this.mode === 'visual' || this.mode === 'visual-line';
    this.cursor = visual ? this.normalizeVisual(pos) : this.normalizeNormal(pos);
  }

  moveToMotion(motion: Motion | null, jump: boolean): void {
    if (!motion) return;
    if (jump) this.lastJump = { ...this.cursor };
    this.moveTo(motion.to);
  }

  takeCount(): number {
    const count = this.count;
    this.count = 0;
    return count;
  }

  normalizeNormal(pos: Pos): Pos {
    const line = Math.max(0, Math.min(this.lines.length - 1, pos.line));
    const col = Math.max(0, Math.min(Math.max(0, this.lines[line].length - 1), pos.col));
    return { line, col };
  }

  // Visual mode can sit on the newline after the last character.
  normalizeVisual(pos: Pos): Pos {
    const line = Math.max(0, Math.min(this.lines.length - 1, pos.line));
    const col = Math.max(0, Math.min(this.lines[line].length, pos.col));
    return { line, col };
  }

  normalizeInsert(pos: Pos): Pos {
    const line = Math.max(0, Math.min(this.lines.length - 1, pos.line));
    const col = Math.max(0, Math.min(this.lines[line].length, pos.col));
    return { line, col };
  }

  normalizeCursor(): void {
    this.cursor =
      this.mode === 'insert'
        ? this.normalizeInsert(this.cursor)
        : this.normalizeNormal({ line: Math.min(this.cursor.line, this.lines.length - 1), col: this.cursor.col });
  }

  private normalKey(key: string): boolean {
    return normalKeyIn(this, key);
  }

  private insertKey(key: string): boolean {
    return insertKeyIn(this, key);
  }

  private searchKey(key: string): boolean {
    return searchKeyIn(this, key);
  }

  private commandKey(key: string): boolean {
    return commandKeyIn(this, key);
  }

  private visualKey(key: string): boolean {
    return visualKeyIn(this, key);
  }

  pendingKey(key: string): boolean {
    return pendingKeyIn(this, key);
  }

  motionKey(key: string): boolean {
    return motionKeyIn(this, key);
  }

  resolveMotion(key: string, count: number, explicit = count > 0): Motion | null {
    return resolveMotionIn(this.lines, this.cursor, this.mode, this.lastFind, key, count, explicit);
  }

  resolveGMotion(key: string, count: number): Motion | null {
    return resolveGMotionIn(this.lines, this.cursor, key, count);
  }

  operatorMotionKind(key: string, motion: Motion) {
    return operatorMotionKindIn(this.lastFind, key, motion);
  }

  hasMotionKind(key: string): boolean {
    return MOTION_KINDS[key] !== undefined;
  }

  operatorMotion(op: Operator, key: string, count: number, explicit: boolean): Motion | null {
    return operatorMotionIn(this, op, key, count, explicit);
  }

  applyOperator(op: Operator, motion: Motion): void {
    applyOperatorIn(this, op, motion);
  }

  applyLineOp(op: Operator, count: number): void {
    applyLineOpIn(this, op, count);
  }

  linewiseOp(op: Operator, from: number, to: number, yankToFirstNonBlank = false): void {
    linewiseOpIn(this, op, from, to, yankToFirstNonBlank);
  }

  charwiseOp(op: Operator, from: Pos, to: Pos, inclusive: boolean): void {
    charwiseOpIn(this, op, from, to, inclusive);
  }

  yankLines(from: number, to: number): void {
    yankLinesIn(this, from, to);
  }

  simpleEdit(key: string): void {
    simpleEditIn(this, key);
  }

  adjustNumber(delta: number, count: number): void {
    adjustNumberIn(this, delta, count);
  }

  replaceChars(char: string, count: number): void {
    replaceCharsIn(this, char, count);
  }

  replaceRange(from: Pos, to: Pos, char: string): void {
    replaceRangeIn(this, from, to, char);
  }

  toggleCase(count: number): void {
    toggleCaseIn(this, count);
  }

  toggleRange(from: Pos, to: Pos): void {
    toggleRangeIn(this, from, to);
  }

  joinLines(count: number): void {
    joinLinesIn(this, count);
  }

  joinSelected(from: number, to: number): void {
    joinSelectedIn(this, from, to);
  }

  put(beforeCursor: boolean, count: number): void {
    putIn(this, beforeCursor, count);
  }

  putVisual(from: Pos, to: Pos, linewise: boolean, keepUnnamed: boolean): void {
    putVisualIn(this, from, to, linewise, keepUnnamed);
  }

  insertText(text: string, pos: Pos): void {
    insertTextIn(this, text, pos);
  }

  removeRange(from: Pos, to: Pos, inclusive: boolean): string {
    return removeRangeIn(this, from, to, inclusive);
  }

  indentLines(from: number, to: number, dir: 1 | -1): void {
    indentLinesIn(this, from, to, dir);
  }

  startInsertCommand(key: string, count = 1): void {
    startInsertCommandIn(this, key, count);
  }

  replaceVisual(char: string): void {
    replaceVisualIn(this, char);
  }

  pushUndo(cursor: Pos = this.cursor): void {
    pushUndoIn(this, cursor);
  }

  undo(): void {
    undoIn(this);
  }

  redo(): void {
    redoIn(this);
  }

  search(pattern: string, dir: 1 | -1): boolean {
    return searchIn(this, pattern, dir);
  }

  repeatSearchTarget(key: 'n' | 'N', count: number): Pos | null {
    return repeatSearchTargetIn(this, key, count);
  }

  searchWordTarget(dir: 1 | -1, count: number): Pos | null {
    return searchWordTargetIn(this, dir, count);
  }

  replayLastChange(count: number): void {
    replayLastChangeIn(this, count);
  }
}
