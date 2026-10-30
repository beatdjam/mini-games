// Operator ranges and actions: how a motion becomes the range for d/c/y/>/<, and how that range is changed.
import type { Pos } from '../../data/types.ts';
import { before, charAt, charClass, firstNonBlank, isBlank, offsetOf, wordEnd } from './text.ts';
import type { EditorHost } from './context.ts';
import type { Motion, Operator } from './types.ts';

export function operatorMotion(
  host: EditorHost,
  op: Operator,
  key: string,
  count: number,
  explicit: boolean,
): Motion | null {
  // dw on an empty line deletes that line, as Vim does.
  if (op === 'd' && (key === 'w' || key === 'W') && !host.line.length) {
    if (host.cursor.line >= host.lines.length - 1) return null;
    return { to: { line: host.cursor.line, col: 0 }, inclusive: false, linewise: true };
  }
  if (op === 'c' && (key === 'w' || key === 'W')) return changeWordMotion(host, key, count);
  const motion = host.resolveMotion(key, count, explicit);
  if (!motion) return null;
  const adjusted = key === 'w' || key === 'W' ? stopWordAtLineEnd(host, motion) : motion;
  const kind = host.operatorMotionKind(key, adjusted);
  return { ...adjusted, inclusive: kind === 'inclusive', linewise: kind === 'linewise' };
}

// `cw` changes to the end of the word, but only the current character when it is the last one.
function changeWordMotion(host: EditorHost, key: 'w' | 'W', count: number): Motion {
  const big = key === 'W';
  const ch = charAt(host.lines, host.cursor);
  if (isBlank(ch)) {
    const motion = host.resolveMotion(key, count, true);
    return motion ?? { to: { ...host.cursor }, inclusive: false, linewise: false };
  }
  const line = host.lines[host.cursor.line] ?? '';
  const atEnd = host.cursor.col >= line.length - 1 || charClass(line[host.cursor.col + 1], big) !== charClass(ch, big);
  if (atEnd) {
    if (count <= 1) return { to: { ...host.cursor }, inclusive: true, linewise: false };
    return { to: wordEnd(host.lines, host.cursor, count - 1, big), inclusive: true, linewise: false };
  }
  return { to: wordEnd(host.lines, host.cursor, count, big), inclusive: true, linewise: false };
}

// `dw` and `yw` stop at the end of the line when the last word they cross ends there.
function stopWordAtLineEnd(host: EditorHost, motion: Motion): Motion {
  const to = motion.to;
  if (to.line <= host.cursor.line || to.col !== firstNonBlank(host.lines, to.line)) return motion;
  let line = to.line - 1;
  while (line > host.cursor.line && host.lines[line].trim() === '') line--;
  return { to: { line, col: host.lines[line].length }, inclusive: false, linewise: false };
}

export function applyLineOp(host: EditorHost, op: Operator, count: number): void {
  const from = host.cursor.line;
  const to = Math.min(host.lines.length - 1, from + Math.max(1, count) - 1);
  linewiseOp(host, op, from, to, op === 'y');
}

export function yankLines(host: EditorHost, from: number, to: number): void {
  host.registers.store(host.lines.slice(from, to + 1).join('\n'), true);
}

export function applyOperator(host: EditorHost, op: Operator, motion: Motion): void {
  if (motion.linewise || op === '>' || op === '<') {
    const start = motion.from ?? host.cursor;
    const from = Math.min(start.line, motion.to.line);
    const to = Math.max(start.line, motion.to.line);
    linewiseOp(host, op, from, to, op === 'y');
    return;
  }
  const start = motion.from ?? host.cursor;
  const a = before(start, motion.to) ? start : motion.to;
  let b = before(start, motion.to) ? motion.to : start;
  let inclusive = motion.inclusive;
  // An exclusive motion that ends in column 0 of a later line stops at the end of the previous
  // line, and becomes linewise when the start is at or before the first non-blank.
  if (!inclusive && b.col === 0 && b.line > a.line) {
    b = { line: b.line - 1, col: Math.max(0, host.lines[b.line - 1].length - 1) };
    inclusive = true;
    if (a.col <= firstNonBlank(host.lines, a.line)) {
      linewiseOp(host, op, a.line, b.line, op === 'y');
      return;
    }
  }
  charwiseOp(host, op, a, b, inclusive);
}

export function linewiseOp(
  host: EditorHost,
  op: Operator,
  from: number,
  to: number,
  yankToFirstNonBlank = false,
): void {
  if (op === 'y') {
    host.yankLines(from, to);
    host.cursor = { line: from, col: yankToFirstNonBlank ? firstNonBlank(host.lines, from) : 0 };
    return;
  }
  if (op === '>' || op === '<') {
    host.indentLines(from, to, op === '>' ? 1 : -1);
    return;
  }
  host.pushUndo(op === 'd' ? { line: from, col: firstNonBlank(host.lines, from) } : undefined);
  const removed = host.lines.slice(from, to + 1);
  host.registers.store(removed.join('\n'), true);
  host.lines.splice(from, to - from + 1);
  if (!host.lines.length) host.lines = [''];
  if (op === 'c') {
    // when every line was replaced the one empty line already stands in for them
    if (!(from === 0 && host.lines.length === 1 && host.lines[0] === '')) {
      const at = Math.min(from, host.lines.length);
      host.lines.splice(at, 0, '');
      host.cursor = { line: at, col: 0 };
    } else {
      host.cursor = { line: 0, col: 0 };
    }
    host.mode = 'insert';
    return;
  }
  host.cursor = host.normalizeNormal({
    line: Math.min(from, host.lines.length - 1),
    col: firstNonBlank(host.lines, Math.min(from, host.lines.length - 1)),
  });
}

export function charwiseOp(host: EditorHost, op: Operator, from: Pos, to: Pos, inclusive: boolean): void {
  if (op === 'y') {
    host.registers.store(yankRange(host, from, to, inclusive), false);
    host.cursor = host.normalizeNormal(from);
    return;
  }
  host.pushUndo();
  const removed = host.removeRange(from, to, inclusive);
  host.registers.store(removed, false);
  if (op === 'c') {
    host.cursor = host.normalizeInsert(from);
    host.mode = 'insert';
    return;
  }
  host.cursor = host.normalizeNormal(from);
}

function yankRange(host: EditorHost, from: Pos, to: Pos, inclusive: boolean): string {
  const start = offsetOf(host.lines, from);
  let end = offsetOf(host.lines, to) + (inclusive ? 1 : 0);
  if (!inclusive && to.col === 0 && to.line > from.line)
    end = offsetOf(host.lines, { line: to.line - 1, col: host.lines[to.line - 1].length });
  return host.text.slice(start, end);
}
