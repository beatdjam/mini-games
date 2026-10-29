// A small Vim for the puzzles. It covers the keys the levels teach: motions, counts, operators, insert mode,
// visual mode, one register and undo/redo. It is not a full Vim; anything it does not know is left unhandled
// so the page can ignore the key.
import {
  adjustNumber as adjustNumberInLine,
  before,
  charAt,
  charClass,
  findCharOnLine,
  firstNonBlank,
  isBlank,
  joinLinesText,
  lastNonBlank,
  matchBracket,
  offsetOf,
  paragraphBackward,
  paragraphForward,
  posAt,
  replaceAll,
  replaceFirst,
  samePos,
  textObject as resolveTextObject,
  wordAt,
  wordBackward,
  wordEnd,
  wordEndBackward,
  wordForward,
} from './text.ts';
import type { Pos } from '../../data/types.ts';

import { Registers } from './registers.ts';
import type { Find, Mode, Motion, Operator, Pending, Snapshot } from './types.ts';

const UNDO_LIMIT = 200;
const INDENT = '  ';
const MAX_COUNT = 9999;

const MOTION_KEYS = new Set(['h', 'j', 'k', 'l', '0', '^', '$', 'w', 'b', 'e', 'W', 'B', 'E', 'G', 'H', 'M', 'L']);
const JUMP_KEYS = new Set(['G', 'H', 'M', 'L', '{', '}', '%']);
const LINE_MOTION_KEYS = new Set(['+', '-', '_', '|', '{', '}', '%']);
const SIMPLE_EDIT_KEYS = new Set(['x', 'X', 'D', 'C', 's', 'S', 'Y']);
const INSERT_KEYS = new Set(['i', 'a', 'I', 'A', 'o', 'O']);
const VISUAL_OPS = new Set(['d', 'x', 'y', 'c', '>', '<', 'J']);
const CHANGE_STARTERS = new Set([
  '"',
  'x',
  'X',
  'D',
  'C',
  's',
  'S',
  'p',
  'P',
  'J',
  '~',
  'r',
  'i',
  'a',
  'I',
  'A',
  'o',
  'O',
  'd',
  'c',
  '>',
  '<',
  'C-a',
  'C-x',
]);

const isDigit = (key: string) => key.length === 1 && key >= '0' && key <= '9';

export class Editor {
  lines: string[];
  cursor: Pos;
  mode: Mode = 'normal';
  anchor: Pos | null = null;
  keyCount = 0;
  private registers = new Registers();
  // the text typed after / or ?, shown by the status line while mode is 'search'
  searchText = '';
  searchDirection: 1 | -1 = 1;
  commandText = '';
  marks: Record<string, Pos> = {};
  lastJump: Pos | null = null;

  private pending: Pending | null = null;
  private count = 0;
  private lastFind: Find | null = null;
  private lastSearch: { pattern: string; dir: 1 | -1; wholeWord: boolean } | null = null;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  // the keys of the change being recorded, and the keys of the last finished change (for `.`)
  private record: string[] | null = null;
  private recordText = '';
  private lastChange: string[] | null = null;
  private replaying = false;

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
    const handled = this.handleTracked(key);
    if (handled) this.keyCount++;
    return handled;
  }

  private handleTracked(key: string): boolean {
    if (!this.replaying && !this.record && this.mode === 'normal' && this.startsChange(key)) {
      this.record = this.count > 0 ? [...String(this.count), key] : [key];
      this.recordText = this.text;
    } else if (this.record && !this.replaying) {
      this.record.push(key);
    }
    const handled = this.handle(key);
    if (this.record && !this.replaying) {
      if (!handled) {
        this.record = null;
      } else if (this.pending === null && this.mode === 'normal') {
        if (this.text !== this.recordText) this.lastChange = this.record;
        this.record = null;
      }
    }
    this.registers.finishKey(this.pending === null && this.mode === 'normal');
    return handled;
  }

  private startsChange(key: string): boolean {
    return CHANGE_STARTERS.has(key);
  }

  get pendingText(): string {
    const pending = this.pending;
    if (!pending) return '';
    if (pending.kind === 'register') return '"';
    if (pending.kind === 'op') return pending.op;
    if (pending.kind === 'opFind' || pending.kind === 'opG') return pending.op;
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

  private handle(key: string): boolean {
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

  private normalKey(key: string): boolean {
    if (key === 'Escape') {
      this.pending = null;
      this.count = 0;
      return true;
    }
    if (this.pending) return this.pendingKey(key);
    if (isDigit(key) && (key !== '0' || this.count > 0)) {
      this.count = Math.min(MAX_COUNT, this.count * 10 + Number(key));
      return true;
    }
    if (key === 'd' || key === 'c' || key === 'y' || key === '>' || key === '<') {
      this.pending = { kind: 'op', op: key, count: this.count, count2: 0 };
      this.count = 0;
      return true;
    }
    if (key === 'g') {
      this.pending = { kind: 'g', count: this.count };
      this.count = 0;
      return true;
    }
    if (key === 'f' || key === 'F' || key === 't' || key === 'T') {
      this.pending = {
        kind: 'find',
        dir: key === 'f' || key === 't' ? 1 : -1,
        till: key === 't' || key === 'T',
        count: this.count,
      };
      this.count = 0;
      return true;
    }
    if (key === 'r') {
      this.pending = { kind: 'replace', count: this.count || 1 };
      this.count = 0;
      return true;
    }
    if (key === ';' || key === ',') {
      const count = this.takeCount();
      if (!this.lastFind) return false;
      const dir: 1 | -1 = key === ';' ? this.lastFind.dir : this.lastFind.dir === 1 ? -1 : 1;
      const to = findCharOnLine(this.lines, this.cursor, this.lastFind.char, dir, this.lastFind.till, count);
      if (to) this.cursor = to;
      return true;
    }
    if (key === 'Enter') {
      this.cursor = this.normalizeNormal({ line: this.cursor.line + 1, col: 0 });
      this.cursor = { line: this.cursor.line, col: firstNonBlank(this.lines, this.cursor.line) };
      return true;
    }
    if (key === '/' || key === '?') {
      this.mode = 'search';
      this.searchText = '';
      this.searchDirection = key === '/' ? 1 : -1;
      return true;
    }
    if (key === ':') {
      this.mode = 'command';
      this.commandText = '';
      return true;
    }
    if (key === '"') {
      this.pending = { kind: 'register' };
      return true;
    }
    if (key === 'm') {
      this.pending = { kind: 'mark' };
      return true;
    }
    if (key === '`' || key === "'") {
      this.pending = { kind: 'jumpMark', linewise: key === "'" };
      return true;
    }
    if (key === '.') {
      const count = this.takeCount();
      if (!this.lastChange) return false;
      this.replayLastChange(count > 0 ? count : 1);
      return true;
    }
    if (key === 'C-a' || key === 'C-x') {
      this.adjustNumber(key === 'C-a' ? 1 : -1, this.takeCount() || 1);
      return true;
    }
    if (key === 'n' || key === 'N') {
      if (!this.lastSearch) return false;
      const count = this.takeCount() || 1;
      const dir: 1 | -1 = key === 'n' ? this.lastSearch.dir : this.lastSearch.dir === 1 ? -1 : 1;
      this.lastJump = { ...this.cursor };
      for (let i = 0; i < count; i++) {
        const to = this.findPattern(this.lastSearch.pattern, dir, this.lastSearch.wholeWord);
        if (!to) break;
        this.cursor = this.normalizeNormal(to);
      }
      return true;
    }
    if (key === '*' || key === '#') {
      return this.searchWordUnderCursor(key === '*' ? 1 : -1, this.takeCount() || 1);
    }
    if (LINE_MOTION_KEYS.has(key)) {
      const motion = this.resolveMotion(key, this.takeCount());
      if (motion) {
        if (JUMP_KEYS.has(key)) this.lastJump = { ...this.cursor };
        this.cursor = this.normalizeNormal(motion.to);
      }
      return true;
    }
    if (INSERT_KEYS.has(key)) {
      this.startInsertCommand(key);
      return true;
    }
    if (SIMPLE_EDIT_KEYS.has(key)) {
      this.simpleEdit(key);
      return true;
    }
    if (key === 'p' || key === 'P') {
      this.put(key === 'P', this.takeCount() || 1);
      return true;
    }
    if (key === 'J') {
      this.joinLines(this.count || 2);
      this.count = 0;
      return true;
    }
    if (key === '~') {
      this.toggleCase(this.takeCount());
      return true;
    }
    if (key === 'u') {
      const count = this.takeCount() || 1;
      for (let i = 0; i < count; i++) this.undo();
      return true;
    }
    if (key === 'v' || key === 'V') {
      this.anchor = { ...this.cursor };
      this.mode = key === 'v' ? 'visual' : 'visual-line';
      return true;
    }
    if (MOTION_KEYS.has(key)) {
      const count = this.takeCount();
      const motion = this.resolveMotion(key, count);
      if (motion) {
        if (JUMP_KEYS.has(key)) this.lastJump = { ...this.cursor };
        this.cursor = this.normalizeNormal(motion.to);
      }
      return true;
    }
    return false;
  }

  private pendingKey(key: string): boolean {
    const pending = this.pending;
    if (!pending) return false;
    if (key === 'Escape') {
      this.pending = null;
      this.count = 0;
      return true;
    }
    if (pending.kind === 'op') {
      if (isDigit(key) && !(key === '0' && pending.count2 === 0)) {
        pending.count2 = Math.min(MAX_COUNT, pending.count2 * 10 + Number(key));
        return true;
      }
      if (key === pending.op) {
        this.applyLineOp(pending.op, (pending.count || 1) * (pending.count2 || 1));
        this.pending = null;
        return true;
      }
      if (key === 'f' || key === 'F' || key === 't' || key === 'T') {
        this.pending = {
          kind: 'opFind',
          op: pending.op,
          count: (pending.count || 1) * (pending.count2 || 1),
          dir: key === 'f' || key === 't' ? 1 : -1,
          till: key === 't' || key === 'T',
        };
        return true;
      }
      if (key === 'i' || key === 'a') {
        this.pending = { kind: 'opText', op: pending.op, around: key === 'a' };
        return true;
      }
      if (key === 'g') {
        this.pending = {
          kind: 'opG',
          op: pending.op,
          count: (pending.count || 1) * (pending.count2 || 1),
        };
        return true;
      }
      const total = (pending.count || 1) * (pending.count2 || 1);
      const motionKey = this.changeMotionKey(pending.op, key);
      const motion = this.resolveMotion(motionKey, total);
      if (!motion) return false;
      this.applyOperator(pending.op, motion);
      this.pending = null;
      return true;
    }
    if (pending.kind === 'opFind') {
      if (key.length !== 1) {
        this.pending = null;
        return false;
      }
      const to = findCharOnLine(this.lines, this.cursor, key, pending.dir, pending.till, pending.count);
      this.pending = null;
      if (!to) return true;
      this.lastFind = { char: key, dir: pending.dir, till: pending.till };
      this.applyOperator(pending.op, { to, inclusive: true, linewise: false });
      return true;
    }
    if (pending.kind === 'opG') {
      this.pending = null;
      if (key === 'g') {
        this.applyOperator(pending.op, { to: { line: 0, col: 0 }, inclusive: false, linewise: true });
        return true;
      }
      if (key === 'e' || key === 'E') {
        const to = wordEndBackward(this.lines, this.cursor, pending.count, key === 'E');
        this.applyOperator(pending.op, { to, inclusive: true, linewise: false });
        return true;
      }
      if (key === '_') {
        const line = Math.min(this.lines.length - 1, this.cursor.line + pending.count - 1);
        const to = { line, col: lastNonBlank(this.lines, line) };
        this.applyOperator(pending.op, { to, inclusive: true, linewise: false });
        return true;
      }
      return true;
    }
    if (pending.kind === 'opText') {
      this.pending = null;
      const range = resolveTextObject(this.lines, this.cursor, key, pending.around);
      if (!range) return true;
      this.applyOperator(pending.op, { ...range, linewise: false });
      return true;
    }
    if (pending.kind === 'g') {
      this.pending = null;
      const count = pending.count > 0 ? pending.count : 1;
      if (key === 'g') {
        const line = pending.count > 0 ? Math.min(pending.count - 1, this.lines.length - 1) : 0;
        this.lastJump = { ...this.cursor };
        this.cursor = this.normalizeNormal({ line, col: firstNonBlank(this.lines, line) });
        return true;
      }
      if (key === 'e' || key === 'E') {
        this.cursor = this.normalizeNormal(wordEndBackward(this.lines, this.cursor, count, key === 'E'));
        return true;
      }
      if (key === '_') {
        const line = Math.min(this.lines.length - 1, this.cursor.line + count - 1);
        this.cursor = this.normalizeNormal({ line, col: lastNonBlank(this.lines, line) });
        return true;
      }
      return true;
    }
    if (pending.kind === 'register') {
      this.pending = null;
      if (!/^[a-zA-Z"]$/.test(key)) return true;
      this.registers.select(key);
      return true;
    }
    if (pending.kind === 'mark') {
      this.pending = null;
      if (!/^[a-z]$/.test(key)) return true;
      this.marks[key] = { ...this.cursor };
      return true;
    }
    if (pending.kind === 'jumpMark') {
      this.pending = null;
      if (key === '`') {
        if (!this.lastJump) return true;
        const target = { ...this.lastJump };
        this.lastJump = { ...this.cursor };
        this.cursor = this.normalizeNormal(target);
        return true;
      }
      if (key === "'") {
        if (!this.lastJump) return true;
        const target = { line: this.lastJump.line, col: firstNonBlank(this.lines, this.lastJump.line) };
        this.lastJump = { ...this.cursor };
        this.cursor = this.normalizeNormal(target);
        return true;
      }
      if (!/^[a-z]$/.test(key) || !this.marks[key]) return true;
      const target = this.marks[key];
      const to = pending.linewise ? { line: target.line, col: firstNonBlank(this.lines, target.line) } : { ...target };
      this.lastJump = { ...this.cursor };
      this.cursor = this.normalizeNormal(to);
      return true;
    }
    if (pending.kind === 'find') {
      this.pending = null;
      if (key.length !== 1) return false;
      const to = findCharOnLine(this.lines, this.cursor, key, pending.dir, pending.till, pending.count);
      if (!to) return true;
      this.lastFind = { char: key, dir: pending.dir, till: pending.till };
      this.cursor = this.normalizeNormal(to);
      return true;
    }
    if (pending.kind === 'visualText') {
      this.pending = null;
      return true;
    }
    // replace
    this.pending = null;
    if (key.length !== 1) return false;
    this.replaceChars(key, pending.count);
    return true;
  }

  private searchKey(key: string): boolean {
    if (key === 'Escape') {
      this.mode = 'normal';
      this.searchText = '';
      return true;
    }
    if (key === 'Enter') {
      if (this.searchText) this.search(this.searchText, this.searchDirection);
      this.mode = 'normal';
      this.searchText = '';
      return true;
    }
    if (key === 'Backspace') {
      this.searchText = this.searchText.slice(0, -1);
      return true;
    }
    if (key.length === 1) {
      this.searchText += key;
      return true;
    }
    return false;
  }

  // Moves to the first match after (or before) the cursor, wrapping at the ends. The pattern is a plain string.
  search(pattern: string, dir: 1 | -1): boolean {
    const to = this.findPattern(pattern, dir);
    if (!to) return false;
    this.lastJump = { ...this.cursor };
    this.lastSearch = { pattern, dir, wholeWord: false };
    this.cursor = this.normalizeNormal(to);
    return true;
  }

  private searchWordUnderCursor(dir: 1 | -1, count: number): boolean {
    const word = wordAt(this.lines, this.cursor);
    if (!word) return false;
    this.lastSearch = { pattern: word, dir, wholeWord: true };
    this.lastJump = { ...this.cursor };
    for (let i = 0; i < count; i++) {
      const to = this.findPattern(word, dir, true);
      if (!to) break;
      this.cursor = this.normalizeNormal(to);
    }
    return true;
  }

  // Finds a literal string. wholeWord keeps `*` and `#` on word boundaries, as Vim does (g* would not).
  private findPattern(pattern: string, dir: 1 | -1, wholeWord = false): Pos | null {
    if (!pattern) return null;
    const text = this.text;
    const start = offsetOf(this.lines, this.cursor);
    const wordChar = (at: number) => at >= 0 && at < text.length && /[A-Za-z0-9_]/.test(text[at]);
    const boundary = (at: number) => !wholeWord || (!wordChar(at - 1) && !wordChar(at + pattern.length));
    let at = -1;
    if (dir > 0) {
      at = text.indexOf(pattern, Math.min(start + 1, text.length));
      while (at >= 0 && !boundary(at)) at = text.indexOf(pattern, at + 1);
      if (at < 0) {
        at = text.indexOf(pattern);
        while (at >= 0 && !boundary(at)) at = text.indexOf(pattern, at + 1);
      }
    } else {
      at = start > 0 ? text.lastIndexOf(pattern, start - 1) : -1;
      while (at >= 0 && !boundary(at)) at = at > 0 ? text.lastIndexOf(pattern, at - 1) : -1;
      if (at < 0) {
        at = text.lastIndexOf(pattern);
        while (at >= 0 && !boundary(at)) at = at > 0 ? text.lastIndexOf(pattern, at - 1) : -1;
      }
    }
    if (at < 0) return null;
    return posAt(this.lines, at);
  }

  private commandKey(key: string): boolean {
    if (key === 'Escape') {
      this.mode = 'normal';
      this.commandText = '';
      return true;
    }
    if (key === 'Enter') {
      this.runCommand();
      this.mode = 'normal';
      this.commandText = '';
      return true;
    }
    if (key === 'Backspace') {
      this.commandText = this.commandText.slice(0, -1);
      return true;
    }
    if (key.length === 1) {
      this.commandText += key;
      return true;
    }
    return false;
  }

  // :N and :$ jump to a line; :s/old/new/[g] and :%s/old/new/g replace literal text.
  private runCommand(): void {
    const command = this.commandText.trim();
    if (!command) return;
    if (/^\d+$/.test(command)) {
      const line = Math.min(Number(command) - 1, this.lines.length - 1);
      this.lastJump = { ...this.cursor };
      this.cursor = this.normalizeNormal({ line, col: firstNonBlank(this.lines, line) });
      return;
    }
    if (command === '$') {
      const line = this.lines.length - 1;
      this.lastJump = { ...this.cursor };
      this.cursor = this.normalizeNormal({ line, col: firstNonBlank(this.lines, line) });
      return;
    }
    const sub = /^(%?)s\/(.*?)\/(.*?)\/(g?)$/.exec(command);
    if (!sub) return;
    const whole = sub[1] === '%';
    const old = sub[2];
    const replacement = sub[3];
    const global = sub[4] === 'g';
    if (!old) return;
    const from = whole ? 0 : this.cursor.line;
    const to = whole ? this.lines.length - 1 : this.cursor.line;
    const changed: Array<{ line: number; text: string }> = [];
    for (let line = from; line <= to; line++) {
      const text = this.lines[line];
      const next = global ? replaceAll(text, old, replacement) : replaceFirst(text, old, replacement);
      if (next !== text) changed.push({ line, text: next });
    }
    if (!changed.length) return;
    this.pushUndo();
    for (const change of changed) this.lines[change.line] = change.text;
    this.cursor = this.normalizeNormal({ line: changed[0].line, col: 0 });
  }

  private adjustNumber(delta: number, count: number): void {
    const result = adjustNumberInLine(this.line, this.cursor.col, delta, count);
    if (!result) return;
    this.pushUndo();
    this.lines[this.cursor.line] = result.line;
    this.cursor = this.normalizeNormal({ line: this.cursor.line, col: result.col });
  }

  private replayLastChange(count: number): void {
    if (!this.lastChange) return;
    const keys = [...this.lastChange];
    this.replaying = true;
    this.record = null;
    for (let i = 0; i < count; i++) {
      for (const key of keys) this.handle(key);
    }
    this.replaying = false;
    this.lastChange = keys;
    this.pending = null;
    this.count = 0;
  }

  // `cw` behaves like `ce` (Vim's rule): change the word, not the space after it.
  private changeMotionKey(op: Operator, key: string): string {
    if (op !== 'c') return key;
    const ch = charAt(this.lines, this.cursor);
    if (key === 'w' && !isBlank(ch) && charClass(ch, false) !== 0) return 'e';
    if (key === 'W' && !isBlank(ch)) return 'E';
    return key;
  }

  private insertKey(key: string): boolean {
    if (key === 'Escape') {
      this.mode = 'normal';
      this.anchor = null;
      this.cursor = this.normalizeNormal({ line: this.cursor.line, col: Math.max(0, this.cursor.col - 1) });
      return true;
    }
    if (key === 'Enter') {
      const line = this.line;
      const head = line.slice(0, this.cursor.col);
      const tail = line.slice(this.cursor.col);
      this.lines.splice(this.cursor.line, 1, head, tail);
      this.cursor = { line: this.cursor.line + 1, col: 0 };
      return true;
    }
    if (key === 'Backspace') {
      if (this.cursor.col > 0) {
        const line = this.line;
        this.lines[this.cursor.line] = line.slice(0, this.cursor.col - 1) + line.slice(this.cursor.col);
        this.cursor = { line: this.cursor.line, col: this.cursor.col - 1 };
      } else if (this.cursor.line > 0) {
        const prev = this.lines[this.cursor.line - 1];
        const line = this.lines[this.cursor.line];
        this.lines.splice(this.cursor.line - 1, 2, prev + line);
        this.cursor = { line: this.cursor.line - 1, col: prev.length };
      }
      return true;
    }
    if (key === 'Delete') {
      const line = this.line;
      if (this.cursor.col < line.length) {
        this.lines[this.cursor.line] = line.slice(0, this.cursor.col) + line.slice(this.cursor.col + 1);
      } else if (this.cursor.line < this.lines.length - 1) {
        this.lines.splice(this.cursor.line, 2, line + this.lines[this.cursor.line + 1]);
      }
      return true;
    }
    if (key === 'ArrowLeft') {
      this.cursor = { line: this.cursor.line, col: Math.max(0, this.cursor.col - 1) };
      return true;
    }
    if (key === 'ArrowRight') {
      this.cursor = { line: this.cursor.line, col: Math.min(this.line.length, this.cursor.col + 1) };
      return true;
    }
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const line = Math.max(0, Math.min(this.lines.length - 1, this.cursor.line + (key === 'ArrowUp' ? -1 : 1)));
      this.cursor = { line, col: Math.min(this.cursor.col, this.lines[line].length) };
      return true;
    }
    if (key === 'Home') {
      this.cursor = { line: this.cursor.line, col: 0 };
      return true;
    }
    if (key === 'End') {
      this.cursor = { line: this.cursor.line, col: this.line.length };
      return true;
    }
    if (key.length === 1) {
      const line = this.line;
      this.lines[this.cursor.line] = line.slice(0, this.cursor.col) + key + line.slice(this.cursor.col);
      this.cursor = { line: this.cursor.line, col: this.cursor.col + 1 };
      return true;
    }
    return false;
  }

  private visualKey(key: string): boolean {
    if (this.pending?.kind === 'visualText') {
      const around = this.pending.around;
      this.pending = null;
      if (key === 'Escape') {
        this.mode = 'normal';
        this.anchor = null;
        return true;
      }
      const range = resolveTextObject(this.lines, this.cursor, key, around);
      if (range) {
        this.anchor = range.from;
        this.cursor = range.to;
        this.mode = 'visual';
      }
      return true;
    }
    if (key === 'i' || key === 'a') {
      this.pending = { kind: 'visualText', around: key === 'a' };
      return true;
    }
    if (key === 'Escape' || (key === 'v' && this.mode === 'visual') || (key === 'V' && this.mode === 'visual-line')) {
      this.mode = 'normal';
      this.anchor = null;
      return true;
    }
    if (key === 'v') {
      this.mode = 'visual';
      return true;
    }
    if (key === 'V') {
      this.mode = 'visual-line';
      return true;
    }
    if (key === 'o') {
      if (this.anchor) {
        const anchor = this.anchor;
        this.anchor = { ...this.cursor };
        this.cursor = anchor;
      }
      return true;
    }
    if (isDigit(key) && (key !== '0' || this.count > 0)) {
      this.count = Math.min(MAX_COUNT, this.count * 10 + Number(key));
      return true;
    }
    if (VISUAL_OPS.has(key)) {
      this.applyVisual(key);
      return true;
    }
    if (MOTION_KEYS.has(key)) {
      const motion = this.resolveMotion(key, this.takeCount());
      if (motion) this.cursor = this.normalizeNormal(motion.to);
      return true;
    }
    if (key === 'g') {
      this.cursor = this.normalizeNormal({ line: 0, col: firstNonBlank(this.lines, 0) });
      return true;
    }
    return false;
  }

  private applyVisual(op: string): void {
    const anchor = this.anchor ?? this.cursor;
    const linewise = this.mode === 'visual-line';
    const from = linewise
      ? { line: Math.min(anchor.line, this.cursor.line), col: 0 }
      : before(anchor, this.cursor)
        ? anchor
        : this.cursor;
    const to = linewise
      ? {
          line: Math.max(anchor.line, this.cursor.line),
          col: this.lines[Math.max(anchor.line, this.cursor.line)].length,
        }
      : before(anchor, this.cursor)
        ? this.cursor
        : anchor;
    this.mode = 'normal';
    this.anchor = null;
    if (op === '>' || op === '<') {
      this.indentLines(from.line, to.line, op === '>' ? 1 : -1);
      return;
    }
    if (op === 'J') {
      this.joinSelected(from.line, to.line);
      return;
    }
    const action: Operator = op === 'x' ? 'd' : (op as Operator);
    if (linewise) this.linewiseOp(action, from.line, to.line);
    else this.charwiseOp(action, from, to, true);
  }

  private simpleEdit(key: string): void {
    const count = this.takeCount() || 1;
    if (key === 'x' || key === 'X') {
      this.deleteChars(key === 'x' ? count : -count);
      return;
    }
    if (key === 'D') {
      this.deleteToEnd(false);
      return;
    }
    if (key === 'C') {
      this.deleteToEnd(true);
      return;
    }
    if (key === 's') {
      this.pushUndo();
      this.deleteChars(count, false);
      this.mode = 'insert';
      return;
    }
    if (key === 'S') {
      this.replaceLines(count);
      return;
    }
    if (key === 'Y') {
      this.yankLines(this.cursor.line, Math.min(this.lines.length - 1, this.cursor.line + count - 1));
    }
  }

  private deleteChars(count: number, record = true): void {
    if (count === 0) return;
    const dir = count > 0 ? 1 : -1;
    const n = Math.min(Math.abs(count), dir > 0 ? this.line.length - this.cursor.col : this.cursor.col);
    if (n <= 0) return;
    const line = this.line;
    const start = dir > 0 ? this.cursor.col : this.cursor.col - n;
    if (record) this.pushUndo();
    this.registers.store(line.slice(start, start + n), false);
    this.lines[this.cursor.line] = line.slice(0, start) + line.slice(start + n);
    this.cursor = this.normalizeNormal({ line: this.cursor.line, col: start });
  }

  private deleteToEnd(insert: boolean): void {
    if (!this.line.length) {
      if (insert) this.mode = 'insert';
      return;
    }
    this.pushUndo();
    const start = this.cursor.col;
    this.registers.store(this.line.slice(start), false);
    this.lines[this.cursor.line] = this.line.slice(0, start);
    this.cursor = insert
      ? { line: this.cursor.line, col: Math.min(start, this.line.length) }
      : this.normalizeNormal({ line: this.cursor.line, col: Math.max(0, start - 1) });
    if (insert) this.mode = 'insert';
  }

  private replaceLines(count: number): void {
    this.pushUndo();
    const from = this.cursor.line;
    const to = Math.min(this.lines.length - 1, from + Math.max(1, count) - 1);
    const removed = this.lines.slice(from, to + 1);
    this.registers.store(removed.join('\n'), true);
    this.lines.splice(from, to - from + 1, '');
    this.cursor = { line: from, col: 0 };
    this.mode = 'insert';
  }

  private startInsertCommand(key: string): void {
    this.pushUndo();
    if (key === 'i') {
      this.mode = 'insert';
      this.cursor = this.normalizeInsert(this.cursor);
      return;
    }
    if (key === 'a') {
      this.mode = 'insert';
      this.cursor = this.normalizeInsert({ line: this.cursor.line, col: this.cursor.col + 1 });
      return;
    }
    if (key === 'I') {
      this.mode = 'insert';
      this.cursor = { line: this.cursor.line, col: firstNonBlank(this.lines, this.cursor.line) };
      return;
    }
    if (key === 'A') {
      this.mode = 'insert';
      this.cursor = { line: this.cursor.line, col: this.line.length };
      return;
    }
    const line = key === 'o' ? this.cursor.line + 1 : this.cursor.line;
    this.lines.splice(line, 0, '');
    this.cursor = { line, col: 0 };
    this.mode = 'insert';
  }

  private replaceChars(char: string, count: number): void {
    const n = Math.min(Math.max(1, count), this.line.length - this.cursor.col);
    if (n <= 0) return;
    this.pushUndo();
    const line = this.line;
    this.lines[this.cursor.line] = line.slice(0, this.cursor.col) + char.repeat(n) + line.slice(this.cursor.col + n);
    this.cursor = { line: this.cursor.line, col: this.cursor.col + n - 1 };
  }

  private toggleCase(count: number): void {
    const n = Math.min(Math.max(1, count), this.line.length - this.cursor.col);
    if (n <= 0) return;
    this.pushUndo();
    const chars = this.line.split('');
    for (let i = 0; i < n; i++) {
      const c = chars[this.cursor.col + i];
      chars[this.cursor.col + i] = c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
    }
    this.lines[this.cursor.line] = chars.join('');
    this.cursor = this.normalizeNormal({ line: this.cursor.line, col: this.cursor.col + n - 1 });
  }

  private joinLines(count: number): void {
    const start = this.cursor.line;
    if (start >= this.lines.length - 1) return;
    this.pushUndo();
    const n = Math.min(Math.max(2, count), this.lines.length - start);
    const end = start + n - 1;
    const joined = joinLinesText(this.lines, start, end);
    this.lines.splice(start, n, joined);
    this.cursor = this.normalizeNormal({ line: start, col: joined.length });
  }

  private joinSelected(from: number, to: number): void {
    if (to <= from) return;
    this.pushUndo();
    const joined = joinLinesText(this.lines, from, to);
    this.lines.splice(from, to - from + 1, joined);
    this.cursor = this.normalizeNormal({ line: from, col: joined.length });
  }

  private put(beforeCursor: boolean, count: number): void {
    const reg = this.registers.read();
    if (!reg || (!reg.text && !reg.linewise)) return;
    this.pushUndo();
    for (let i = 0; i < count; i++) {
      if (reg.linewise) {
        const at = this.cursor.line + (beforeCursor ? 0 : 1);
        this.lines.splice(at, 0, ...reg.text.split('\n'));
        this.cursor = { line: at, col: 0 };
        continue;
      }
      const line = this.line;
      const at = beforeCursor ? this.cursor.col : line.length === 0 ? 0 : this.cursor.col + 1;
      const parts = (line.slice(0, at) + reg.text + line.slice(at)).split('\n');
      this.lines.splice(this.cursor.line, 1, ...parts);
      if (parts.length === 1) {
        this.cursor = { line: this.cursor.line, col: Math.max(0, at + reg.text.length - 1) };
      } else {
        this.cursor = {
          line: this.cursor.line + parts.length - 1,
          col: Math.max(0, parts[parts.length - 1].length - 1),
        };
      }
    }
    this.normalizeCursor();
  }

  private applyLineOp(op: Operator, count: number): void {
    const from = this.cursor.line;
    const to = Math.min(this.lines.length - 1, from + Math.max(1, count) - 1);
    this.linewiseOp(op, from, to);
  }

  private applyOperator(op: Operator, motion: Motion): void {
    if (motion.linewise || op === '>' || op === '<') {
      const start = motion.from ?? this.cursor;
      const from = Math.min(start.line, motion.to.line);
      const to = Math.max(start.line, motion.to.line);
      this.linewiseOp(op, from, to);
      return;
    }
    const start = motion.from ?? this.cursor;
    const from = before(start, motion.to) ? start : motion.to;
    const to = before(start, motion.to) ? motion.to : start;
    this.charwiseOp(op, from, to, motion.inclusive);
  }

  private linewiseOp(op: Operator, from: number, to: number): void {
    if (op === 'y') {
      this.yankLines(from, to);
      this.cursor = { line: from, col: 0 };
      return;
    }
    if (op === '>' || op === '<') {
      this.indentLines(from, to, op === '>' ? 1 : -1);
      return;
    }
    this.pushUndo();
    const removed = this.lines.slice(from, to + 1);
    this.registers.store(removed.join('\n'), true);
    this.lines.splice(from, to - from + 1);
    if (!this.lines.length) this.lines = [''];
    if (op === 'c') {
      const at = Math.min(from, this.lines.length);
      this.lines.splice(at, 0, '');
      this.cursor = { line: at, col: 0 };
      this.mode = 'insert';
      return;
    }
    this.cursor = { line: Math.min(from, this.lines.length - 1), col: 0 };
  }

  private charwiseOp(op: Operator, from: Pos, to: Pos, inclusive: boolean): void {
    if (op === 'y') {
      this.yankRange(from, to, inclusive);
      this.cursor = this.normalizeNormal(from);
      return;
    }
    this.pushUndo();
    const removed = this.removeRange(from, to, inclusive);
    this.registers.store(removed, false);
    if (op === 'c') {
      this.cursor = this.normalizeInsert(from);
      this.mode = 'insert';
      return;
    }
    this.cursor = this.normalizeNormal(from);
  }

  private yankLines(from: number, to: number): void {
    this.registers.store(this.lines.slice(from, to + 1).join('\n'), true);
  }

  private yankRange(from: Pos, to: Pos, inclusive: boolean): void {
    const start = offsetOf(this.lines, from);
    const end = offsetOf(this.lines, to) + (inclusive ? 1 : 0);
    this.registers.store(this.text.slice(start, end), false);
  }

  // Removes a characterwise range and returns the removed text.
  private removeRange(from: Pos, to: Pos, inclusive: boolean): string {
    const a = before(from, to) || samePos(from, to) ? from : to;
    const b = before(from, to) || samePos(from, to) ? to : from;
    const start = offsetOf(this.lines, a);
    let end = offsetOf(this.lines, b) + (inclusive ? 1 : 0);
    // an exclusive motion that lands at the start of the next line stops at the end of this one
    if (!inclusive && b.col === 0 && b.line > a.line)
      end = offsetOf(this.lines, { line: b.line - 1, col: this.lines[b.line - 1].length });
    const text = this.text.slice(start, end);
    const rest = this.text.slice(0, start) + this.text.slice(end);
    this.lines = rest.length ? rest.split('\n') : [''];
    this.cursor = this.normalizeNormal(posAt(this.lines, Math.min(start, rest.length)));
    return text;
  }

  private indentLines(from: number, to: number, dir: 1 | -1): void {
    this.pushUndo();
    for (let line = from; line <= to; line++) {
      const text = this.lines[line];
      if (dir > 0) this.lines[line] = INDENT + text;
      else this.lines[line] = text.startsWith(INDENT) ? text.slice(INDENT.length) : text.replace(/^ {1,2}/, '');
    }
    this.cursor = this.normalizeNormal({ line: from, col: firstNonBlank(this.lines, from) });
  }

  private undo(): void {
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.redoStack.push({ lines: [...this.lines], cursor: { ...this.cursor } });
    this.lines = [...snap.lines];
    this.cursor = this.normalizeNormal(snap.cursor);
    this.mode = 'normal';
    this.anchor = null;
    this.pending = null;
  }

  private redo(): void {
    const snap = this.redoStack.pop();
    if (!snap) return;
    this.undoStack.push({ lines: [...this.lines], cursor: { ...this.cursor } });
    this.lines = [...snap.lines];
    this.cursor = this.normalizeNormal(snap.cursor);
    this.mode = 'normal';
    this.anchor = null;
    this.pending = null;
  }

  private pushUndo(): void {
    this.undoStack.push({ lines: [...this.lines], cursor: { ...this.cursor } });
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  private resolveMotion(key: string, count: number): Motion | null {
    const n = count > 0 ? count : 1;
    const line = this.cursor.line;
    const col = this.cursor.col;
    if (key === 'h') return { to: { line, col: Math.max(0, col - n) }, inclusive: false, linewise: false };
    if (key === 'l') {
      return {
        to: { line, col: Math.min(Math.max(0, this.line.length - 1), col + n) },
        inclusive: false,
        linewise: false,
      };
    }
    if (key === 'j' || key === 'k') {
      const toLine = Math.max(0, Math.min(this.lines.length - 1, line + (key === 'j' ? n : -n)));
      return {
        to: { line: toLine, col: Math.min(col, Math.max(0, this.lines[toLine].length - 1)) },
        inclusive: false,
        linewise: true,
      };
    }
    if (key === '0') return { to: { line, col: 0 }, inclusive: false, linewise: false };
    if (key === '^') return { to: { line, col: firstNonBlank(this.lines, line) }, inclusive: false, linewise: false };
    if (key === '+' || key === '-') {
      const toLine = Math.max(0, Math.min(this.lines.length - 1, line + (key === '+' ? n : -n)));
      return { to: { line: toLine, col: firstNonBlank(this.lines, toLine) }, inclusive: false, linewise: true };
    }
    if (key === '_') {
      const toLine = Math.min(this.lines.length - 1, line + n - 1);
      return { to: { line: toLine, col: firstNonBlank(this.lines, toLine) }, inclusive: false, linewise: false };
    }
    if (key === '|') {
      return { to: { line, col: Math.max(0, (count > 0 ? count : 1) - 1) }, inclusive: false, linewise: false };
    }
    if (key === '{' || key === '}') {
      const to =
        key === '}' ? paragraphForward(this.lines, this.cursor, n) : paragraphBackward(this.lines, this.cursor, n);
      return { to, inclusive: false, linewise: true };
    }
    if (key === '%') {
      if (count > 0) {
        const toLine = Math.max(0, Math.min(this.lines.length - 1, Math.ceil((count / 100) * this.lines.length) - 1));
        return { to: { line: toLine, col: firstNonBlank(this.lines, toLine) }, inclusive: false, linewise: true };
      }
      const to = matchBracket(this.lines, this.cursor);
      return to ? { to, inclusive: true, linewise: false } : null;
    }
    if (key === '$') {
      const toLine = Math.min(this.lines.length - 1, line + n - 1);
      return {
        to: { line: toLine, col: Math.max(0, this.lines[toLine].length - 1) },
        inclusive: true,
        linewise: false,
      };
    }
    if (key === 'w' || key === 'b' || key === 'e' || key === 'W' || key === 'B' || key === 'E') {
      const big = key === key.toUpperCase();
      const lower = key.toLowerCase();
      let to: Pos;
      if (lower === 'w') to = wordForward(this.lines, this.cursor, n, big);
      else if (lower === 'b') to = wordBackward(this.lines, this.cursor, n, big);
      else to = wordEnd(this.lines, this.cursor, n, big);
      return { to, inclusive: lower === 'e', linewise: false };
    }
    if (key === 'G' || key === 'gg') {
      const toLine = count > 0 ? Math.min(count - 1, this.lines.length - 1) : key === 'G' ? this.lines.length - 1 : 0;
      return { to: { line: toLine, col: firstNonBlank(this.lines, toLine) }, inclusive: false, linewise: true };
    }
    if (key === 'H' || key === 'M' || key === 'L') {
      const last = this.lines.length - 1;
      const offset = Math.max(0, n - 1);
      const toLine =
        key === 'H' ? Math.min(last, offset) : key === 'L' ? Math.max(0, last - offset) : Math.floor(last / 2);
      return { to: { line: toLine, col: firstNonBlank(this.lines, toLine) }, inclusive: false, linewise: true };
    }
    if (key === ';' || key === ',') {
      if (!this.lastFind) return null;
      const dir: 1 | -1 = key === ';' ? this.lastFind.dir : this.lastFind.dir === 1 ? -1 : 1;
      const to = findCharOnLine(this.lines, this.cursor, this.lastFind.char, dir, this.lastFind.till, n);
      if (!to) return null;
      return { to, inclusive: true, linewise: false };
    }
    return null;
  }

  private takeCount(): number {
    const count = this.count;
    this.count = 0;
    return count;
  }

  private normalizeNormal(pos: Pos): Pos {
    const line = Math.max(0, Math.min(this.lines.length - 1, pos.line));
    const col = Math.max(0, Math.min(Math.max(0, this.lines[line].length - 1), pos.col));
    return { line, col };
  }

  private normalizeInsert(pos: Pos): Pos {
    const line = Math.max(0, Math.min(this.lines.length - 1, pos.line));
    const col = Math.max(0, Math.min(this.lines[line].length, pos.col));
    return { line, col };
  }

  private normalizeCursor(): void {
    this.cursor =
      this.mode === 'insert'
        ? this.normalizeInsert(this.cursor)
        : this.normalizeNormal({ line: Math.min(this.cursor.line, this.lines.length - 1), col: this.cursor.col });
  }
}
