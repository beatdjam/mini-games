// Pure motion calculations: where a motion goes and how it extends an operator. They read the buffer and
// cursor but never change them.
import type { Pos } from '../../data/types.ts';
import {
  findCharOnLine,
  firstNonBlank,
  lastNonBlank,
  matchBracket,
  paragraphBackward,
  paragraphForward,
  wordBackward,
  wordEnd,
  wordEndBackward,
  wordForward,
} from './text.ts';
import type { Find, Motion, MotionKind, Mode } from './types.ts';

// How each motion extends an operator. `;` and `,` depend on the direction of the last find.
export const MOTION_KINDS: Record<string, MotionKind> = {
  j: 'linewise',
  k: 'linewise',
  '+': 'linewise',
  '-': 'linewise',
  _: 'linewise',
  G: 'linewise',
  gg: 'linewise',
  Enter: 'linewise',
  H: 'linewise',
  M: 'linewise',
  L: 'linewise',
  "'": 'linewise',
  e: 'inclusive',
  E: 'inclusive',
  ge: 'inclusive',
  gE: 'inclusive',
  $: 'inclusive',
  g_: 'inclusive',
  f: 'inclusive',
  t: 'inclusive',
  '%': 'inclusive',
  h: 'exclusive',
  l: 'exclusive',
  w: 'exclusive',
  b: 'exclusive',
  W: 'exclusive',
  B: 'exclusive',
  '0': 'exclusive',
  '^': 'exclusive',
  '|': 'exclusive',
  '{': 'exclusive',
  '}': 'exclusive',
  F: 'exclusive',
  T: 'exclusive',
  ';': 'exclusive',
  ',': 'exclusive',
  '/': 'exclusive',
  '?': 'exclusive',
  n: 'exclusive',
  N: 'exclusive',
  '*': 'exclusive',
  '#': 'exclusive',
  '`': 'exclusive',
};

export const motionFlags = (kind: MotionKind): Pick<Motion, 'inclusive' | 'linewise'> => ({
  inclusive: kind === 'inclusive',
  linewise: kind === 'linewise',
});

export function operatorMotionKind(lastFind: Find | null, key: string, motion: Motion): MotionKind {
  if (motion.linewise) return 'linewise';
  if (key === ';' || key === ',') {
    if (!lastFind) return 'exclusive';
    const forward = key === ';' ? lastFind.dir === 1 : lastFind.dir === -1;
    return forward ? 'inclusive' : 'exclusive';
  }
  // `}` includes the last character when it reaches the end of the file.
  if (key === '}' && motion.inclusive) return 'inclusive';
  return MOTION_KINDS[key] ?? (motion.inclusive ? 'inclusive' : 'exclusive');
}

// The motions that start with g. `gg` with a count goes to that line, as Vim does.
export function resolveGMotion(lines: string[], cursor: Pos, key: string, count: number): Motion | null {
  const n = count > 0 ? count : 1;
  if (key === 'g') {
    const line = count > 0 ? Math.min(count - 1, lines.length - 1) : 0;
    return { to: { line, col: firstNonBlank(lines, line) }, inclusive: false, linewise: true };
  }
  if (key === 'e' || key === 'E') {
    return { to: wordEndBackward(lines, cursor, n, key === 'E'), inclusive: true, linewise: false };
  }
  if (key === '_') {
    const line = Math.min(lines.length - 1, cursor.line + n - 1);
    return { to: { line, col: lastNonBlank(lines, line) }, inclusive: true, linewise: false };
  }
  return null;
}

export function resolveMotion(
  lines: string[],
  cursor: Pos,
  mode: Mode,
  lastFind: Find | null,
  key: string,
  count: number,
  explicit = count > 0,
): Motion | null {
  const n = count > 0 ? count : 1;
  const line = cursor.line;
  const col = cursor.col;
  if (key === 'h') return { to: { line, col: Math.max(0, col - n) }, inclusive: false, linewise: false };
  if (key === 'l') {
    return {
      to: { line, col: Math.min(Math.max(0, (lines[line] ?? '').length - 1), col + n) },
      inclusive: false,
      linewise: false,
    };
  }
  if (key === 'j' || key === 'k') {
    const toLine = Math.max(0, Math.min(lines.length - 1, line + (key === 'j' ? n : -n)));
    // a motion that does not move fails, so an operator does nothing (dk on the first line)
    if (toLine === line) return null;
    return {
      to: { line: toLine, col: Math.min(col, Math.max(0, lines[toLine].length - 1)) },
      inclusive: false,
      linewise: true,
    };
  }
  if (key === '0') return { to: { line, col: 0 }, inclusive: false, linewise: false };
  if (key === '^') return { to: { line, col: firstNonBlank(lines, line) }, inclusive: false, linewise: false };
  if (key === '+' || key === '-') {
    const toLine = line + (key === '+' ? n : -n);
    // Vim fails, and does not move, past the first or last line
    if (toLine < 0 || toLine >= lines.length) return null;
    return { to: { line: toLine, col: firstNonBlank(lines, toLine) }, inclusive: false, linewise: true };
  }
  if (key === '_') {
    const toLine = Math.min(lines.length - 1, line + n - 1);
    return { to: { line: toLine, col: firstNonBlank(lines, toLine) }, inclusive: false, linewise: true };
  }
  if (key === '|') {
    const toCol = Math.max(0, Math.min(Math.max(0, (lines[line] ?? '').length - 1), (count > 0 ? count : 1) - 1));
    return { to: { line, col: toCol }, inclusive: false, linewise: false };
  }
  if (key === '{' || key === '}') {
    const to = key === '}' ? paragraphForward(lines, cursor, n) : paragraphBackward(lines, cursor, n);
    // `}` includes the last character when no paragraph is left, so d} reaches the end of the file
    const atEnd =
      key === '}' &&
      to.line === lines.length - 1 &&
      lines[to.line].trim() !== '' &&
      to.col === lastNonBlank(lines, to.line);
    return { to, inclusive: atEnd, linewise: false };
  }
  if (key === '%') {
    if (explicit) {
      const toLine = Math.max(0, Math.min(lines.length - 1, Math.ceil((count / 100) * lines.length) - 1));
      return { to: { line: toLine, col: firstNonBlank(lines, toLine) }, inclusive: false, linewise: true };
    }
    const to = matchBracket(lines, cursor);
    return to ? { to, inclusive: true, linewise: false } : null;
  }
  if (key === '$') {
    const toLine = Math.min(lines.length - 1, line + n - 1);
    const length = lines[toLine].length;
    // In visual mode the last character is not the end: the newline is selected too.
    const atNewline = mode === 'visual' && toLine < lines.length - 1;
    return {
      to: { line: toLine, col: atNewline ? length : Math.max(0, length - 1) },
      inclusive: true,
      linewise: false,
    };
  }
  if (key === 'w' || key === 'b' || key === 'e' || key === 'W' || key === 'B' || key === 'E') {
    const big = key === key.toUpperCase();
    const lower = key.toLowerCase();
    let to: Pos;
    if (lower === 'w') to = wordForward(lines, cursor, n, big);
    else if (lower === 'b') to = wordBackward(lines, cursor, n, big);
    else to = wordEnd(lines, cursor, n, big);
    return { to, inclusive: lower === 'e', linewise: false };
  }
  if (key === 'G' || key === 'gg') {
    const toLine = explicit ? Math.min(count - 1, lines.length - 1) : key === 'G' ? lines.length - 1 : 0;
    return { to: { line: toLine, col: firstNonBlank(lines, toLine) }, inclusive: false, linewise: true };
  }
  if (key === 'Enter') {
    const toLine = line + n;
    if (toLine >= lines.length) return null;
    return { to: { line: toLine, col: firstNonBlank(lines, toLine) }, inclusive: false, linewise: true };
  }
  if (key === 'H' || key === 'M' || key === 'L') {
    const last = lines.length - 1;
    const offset = Math.max(0, n - 1);
    const toLine =
      key === 'H' ? Math.min(last, offset) : key === 'L' ? Math.max(0, last - offset) : Math.floor(last / 2);
    return { to: { line: toLine, col: firstNonBlank(lines, toLine) }, inclusive: false, linewise: true };
  }
  if (key === ';' || key === ',') {
    if (!lastFind) return null;
    const dir: 1 | -1 = key === ';' ? lastFind.dir : lastFind.dir === 1 ? -1 : 1;
    const to = findCharOnLine(lines, cursor, lastFind.char, dir, lastFind.till, n);
    if (!to) return null;
    return { to, inclusive: true, linewise: false };
  }
  return null;
}
