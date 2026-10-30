// Buffer edits that are not tied to one operator: x/X/D/C/s/S, put, J, ~, r, >/< and the line/range helpers.
import type { Pos } from '../../data/types.ts';
import {
  adjustNumber as adjustNumberInLine,
  before,
  firstNonBlank,
  joinLinesAt,
  offsetOf,
  posAt,
  samePos,
} from './text.ts';
import type { EditorHost } from './context.ts';

const INDENT = '  ';

export function adjustNumber(host: EditorHost, delta: number, count: number): void {
  const result = adjustNumberInLine(host.line, host.cursor.col, delta, count);
  if (!result) return;
  host.pushUndo();
  host.lines[host.cursor.line] = result.line;
  host.cursor = host.normalizeNormal({ line: host.cursor.line, col: result.col });
}

export function simpleEdit(host: EditorHost, key: string): void {
  const count = host.takeCount() || 1;
  if (key === 'x' || key === 'X') {
    deleteChars(host, key === 'x' ? count : -count);
    return;
  }
  if (key === 'D') {
    deleteToEnd(host, false, count);
    return;
  }
  if (key === 'C') {
    deleteToEnd(host, true, count);
    return;
  }
  if (key === 's') {
    host.pushUndo();
    deleteChars(host, count, false);
    host.mode = 'insert';
    return;
  }
  if (key === 'S') {
    replaceLines(host, count);
    return;
  }
  if (key === 'Y') {
    host.yankLines(host.cursor.line, Math.min(host.lines.length - 1, host.cursor.line + count - 1));
  }
}

export function deleteChars(host: EditorHost, count: number, record = true): void {
  if (count === 0) return;
  const dir = count > 0 ? 1 : -1;
  const n = Math.min(Math.abs(count), dir > 0 ? host.line.length - host.cursor.col : host.cursor.col);
  if (n <= 0) return;
  const line = host.line;
  const start = dir > 0 ? host.cursor.col : host.cursor.col - n;
  if (record) host.pushUndo();
  host.registers.store(line.slice(start, start + n), false);
  host.lines[host.cursor.line] = line.slice(0, start) + line.slice(start + n);
  host.cursor = host.normalizeNormal({ line: host.cursor.line, col: start });
}

export function deleteToEnd(host: EditorHost, insert: boolean, count = 1): void {
  if (!host.line.length) {
    if (insert) host.mode = 'insert';
    return;
  }
  host.pushUndo();
  const start = host.cursor.col;
  const n = Math.max(1, count);
  const endLine = Math.min(host.lines.length - 1, host.cursor.line + n - 1);
  const removed =
    host.line.slice(start) +
    (endLine > host.cursor.line ? '\n' + host.lines.slice(host.cursor.line + 1, endLine + 1).join('\n') : '');
  host.registers.store(removed, false);
  const head = host.line.slice(0, start);
  if (n > 1 && !head) {
    host.lines.splice(host.cursor.line, endLine - host.cursor.line + 1);
    if (!host.lines.length) host.lines = [''];
  } else {
    host.lines.splice(host.cursor.line, endLine - host.cursor.line + 1, head);
  }
  const line = Math.min(host.cursor.line, host.lines.length - 1);
  host.cursor = insert
    ? { line, col: Math.min(start, host.lines[line].length) }
    : host.normalizeNormal({ line, col: Math.max(0, start - 1) });
  if (insert) host.mode = 'insert';
}

export function replaceLines(host: EditorHost, count: number): void {
  host.pushUndo();
  const from = host.cursor.line;
  const to = Math.min(host.lines.length - 1, from + Math.max(1, count) - 1);
  const removed = host.lines.slice(from, to + 1);
  host.registers.store(removed.join('\n'), true);
  host.lines.splice(from, to - from + 1, '');
  host.cursor = { line: from, col: 0 };
  host.mode = 'insert';
}

export function replaceChars(host: EditorHost, char: string, count: number): void {
  const n = Math.min(Math.max(1, count), host.line.length - host.cursor.col);
  if (n <= 0) return;
  const from = { ...host.cursor };
  const to = { line: host.cursor.line, col: host.cursor.col + n - 1 };
  replaceRange(host, from, to, char);
  host.cursor = { line: host.cursor.line, col: host.cursor.col + n - 1 };
}

// Replaces every character in the range with `char`, keeping newlines.
export function replaceRange(host: EditorHost, from: Pos, to: Pos, char: string): void {
  host.pushUndo();
  const start = offsetOf(host.lines, from);
  const end = offsetOf(host.lines, to) + 1;
  const text = host.text;
  host.lines = (text.slice(0, start) + text.slice(start, end).replace(/[^\n]/g, char) + text.slice(end)).split('\n');
}

export function toggleCase(host: EditorHost, count: number): void {
  const n = Math.min(Math.max(1, count), host.line.length - host.cursor.col);
  if (n <= 0) return;
  const from = { ...host.cursor };
  const to = { line: host.cursor.line, col: host.cursor.col + n - 1 };
  toggleRange(host, from, to);
  host.cursor = host.normalizeNormal({ line: from.line, col: from.col + n });
}

// Swaps the case of every character in the range, keeping newlines.
export function toggleRange(host: EditorHost, from: Pos, to: Pos): void {
  host.pushUndo();
  const start = offsetOf(host.lines, from);
  const end = offsetOf(host.lines, to) + 1;
  const text = host.text;
  const swapped = text
    .slice(start, end)
    .replace(/[^\n]/g, c => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));
  host.lines = (text.slice(0, start) + swapped + text.slice(end)).split('\n');
}

export function joinLines(host: EditorHost, count: number): void {
  const start = host.cursor.line;
  if (start >= host.lines.length - 1) return;
  const n = Math.min(Math.max(2, count), host.lines.length - start);
  joinRange(host, start, start + n - 1);
}

// Visual J always joins down: a one-line selection joins the next line too.
export function joinSelected(host: EditorHost, from: number, to: number): void {
  if (from >= host.lines.length - 1) return;
  joinRange(host, from, Math.max(to, from + 1));
}

function joinRange(host: EditorHost, from: number, to: number): void {
  host.pushUndo();
  const end = Math.min(to, host.lines.length - 1);
  const { text, col } = joinLinesAt(host.lines, from, end);
  host.lines.splice(from, end - from + 1, text);
  host.cursor = host.normalizeNormal({ line: from, col });
}

export function put(host: EditorHost, beforeCursor: boolean, count: number): void {
  const reg = host.registers.read();
  if (!reg || (!reg.text && !reg.linewise)) return;
  host.pushUndo();
  if (reg.linewise) {
    const at = host.cursor.line + (beforeCursor ? 0 : 1);
    const block = Array.from({ length: count }, () => reg.text).join('\n');
    insertLines(host, block, at);
    host.cursor = { line: at, col: firstNonBlank(host.lines, at) };
    host.normalizeCursor();
    return;
  }
  const at = beforeCursor ? host.cursor.col : host.line.length === 0 ? 0 : host.cursor.col + 1;
  const text = reg.text.repeat(count);
  const pos = { line: host.cursor.line, col: at };
  insertText(host, text, pos);
  if (!text.includes('\n')) {
    host.cursor = { line: pos.line, col: Math.max(0, at + text.length - 1) };
  } else {
    // a put that spans lines leaves the cursor on its first inserted character
    host.cursor = { line: pos.line, col: at };
  }
  host.normalizeCursor();
}

// Inserts text at pos, splitting the line where the text has newlines.
export function insertText(host: EditorHost, text: string, pos: Pos): void {
  const line = host.lines[pos.line];
  const parts = (line.slice(0, pos.col) + text + line.slice(pos.col)).split('\n');
  host.lines.splice(pos.line, 1, ...parts);
}

// Inserts text as whole lines above `line`.
export function insertLines(host: EditorHost, text: string, line: number): void {
  host.lines.splice(line, 0, ...text.split('\n'));
}

// Visual p/P: delete the selection, then put the register in its place.
export function putVisual(host: EditorHost, from: Pos, to: Pos, linewise: boolean, keepUnnamed: boolean): void {
  const reg = host.registers.read();
  host.pushUndo();
  let start: Pos;
  if (linewise) {
    const removed = host.lines.slice(from.line, to.line + 1);
    if (!keepUnnamed) host.registers.store(removed.join('\n'), true);
    host.lines.splice(from.line, to.line - from.line + 1);
    start = { line: Math.min(from.line, host.lines.length), col: 0 };
  } else {
    const removed = removeRange(host, from, to, true);
    if (!keepUnnamed) host.registers.store(removed, false);
    start = { ...from };
  }
  if (!reg || (!reg.text && !reg.linewise)) {
    if (!host.lines.length) host.lines = [''];
    host.cursor = host.normalizeNormal(start);
    return;
  }
  if (linewise) {
    insertLines(host, reg.text, start.line);
    const col = reg.linewise ? firstNonBlank(host.lines, start.line) : 0;
    host.cursor = host.normalizeNormal({ line: start.line, col });
    return;
  }
  if (reg.linewise) {
    insertText(host, `\n${reg.text}\n`, start);
    const col = firstNonBlank(host.lines, start.line + 1);
    host.cursor = host.normalizeNormal({ line: start.line + 1, col });
    return;
  }
  insertText(host, reg.text, start);
  host.cursor = host.normalizeNormal(
    reg.text.includes('\n') ? start : { line: start.line, col: start.col + reg.text.length - 1 },
  );
}

// Removes a characterwise range and returns the removed text.
export function removeRange(host: EditorHost, from: Pos, to: Pos, inclusive: boolean): string {
  const a = before(from, to) || samePos(from, to) ? from : to;
  const b = before(from, to) || samePos(from, to) ? to : from;
  const start = offsetOf(host.lines, a);
  let end = offsetOf(host.lines, b) + (inclusive ? 1 : 0);
  // an exclusive motion that lands at the start of the next line stops at the end of this one
  if (!inclusive && b.col === 0 && b.line > a.line)
    end = offsetOf(host.lines, { line: b.line - 1, col: host.lines[b.line - 1].length });
  const text = host.text.slice(start, end);
  const rest = host.text.slice(0, start) + host.text.slice(end);
  host.lines = rest.length ? rest.split('\n') : [''];
  host.cursor = host.normalizeNormal(posAt(host.lines, Math.min(start, rest.length)));
  return text;
}

export function indentLines(host: EditorHost, from: number, to: number, dir: 1 | -1): void {
  host.pushUndo();
  for (let line = from; line <= to; line++) {
    const text = host.lines[line];
    if (text === '') continue; // empty lines get no indent
    if (dir > 0) host.lines[line] = INDENT + text;
    else host.lines[line] = text.startsWith(INDENT) ? text.slice(INDENT.length) : text.replace(/^ {1,2}/, '');
  }
  host.cursor = host.normalizeNormal({ line: from, col: firstNonBlank(host.lines, from) });
}
