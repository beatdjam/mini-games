// Pure text calculations shared by the editor: positions, word/paragraph motions, bracket matching, text objects.
// Everything takes `lines` and a position, so none of it depends on the editor's mode or registers.
import type { Pos } from '../../data/types.ts';

interface TextRange {
  from: Pos;
  to: Pos;
  inclusive: boolean;
}

export const isBlank = (ch: string): boolean => ch === '' || /\s/.test(ch);

export const isDigit = (key: string): boolean => key.length === 1 && key >= '0' && key <= '9';

// 0 = blank, 1 = word (letters, digits, _), 2 = punctuation
export const charClass = (ch: string, big: boolean): 0 | 1 | 2 => {
  if (isBlank(ch)) return 0;
  if (big) return 1;
  return /[A-Za-z0-9_]/.test(ch) ? 1 : 2;
};

export const before = (a: Pos, b: Pos): boolean => a.line < b.line || (a.line === b.line && a.col < b.col);

export const samePos = (a: Pos, b: Pos): boolean => a.line === b.line && a.col === b.col;

export function offsetOf(lines: string[], pos: Pos): number {
  let at = 0;
  for (let line = 0; line < pos.line; line++) at += lines[line].length + 1;
  return at + pos.col;
}

export function posAt(lines: string[], offset: number): Pos {
  let left = offset;
  for (let line = 0; line < lines.length; line++) {
    const length = lines[line].length;
    if (left <= length) return { line, col: left };
    left -= length + 1;
  }
  const line = lines.length - 1;
  return { line, col: lines[line].length };
}

export function firstNonBlank(lines: string[], line: number): number {
  const text = lines[line] ?? '';
  const at = text.search(/\S/);
  return at < 0 ? 0 : at;
}

export function lastNonBlank(lines: string[], line: number): number {
  const text = lines[line] ?? '';
  let col = text.length - 1;
  while (col >= 0 && /\s/.test(text[col])) col--;
  return Math.max(0, col);
}

export const charAt = (lines: string[], pos: Pos): string => lines[pos.line]?.[pos.col] ?? '';

export function nextChar(lines: string[], pos: Pos): Pos | null {
  const line = lines[pos.line] ?? '';
  if (pos.col + 1 < line.length) return { line: pos.line, col: pos.col + 1 };
  if (pos.line + 1 < lines.length) return { line: pos.line + 1, col: 0 };
  return null;
}

export function prevChar(lines: string[], pos: Pos): Pos | null {
  if (pos.col > 0) return { line: pos.line, col: pos.col - 1 };
  for (let line = pos.line - 1; line >= 0; line--) {
    if (lines[line].length > 0) return { line, col: lines[line].length - 1 };
  }
  return null;
}

export function wordForward(lines: string[], from: Pos, count: number, big: boolean): Pos {
  let line = from.line;
  let col = from.col;
  for (let i = 0; i < count; i++) {
    const text = lines[line] ?? '';
    if (col < text.length) {
      const cls = charClass(text[col], big);
      while (col < text.length && charClass(text[col], big) === cls) col++;
      while (col < text.length && charClass(text[col], big) === 0) col++;
    }
    if (col >= text.length) {
      if (line < lines.length - 1) {
        line++;
        while (line < lines.length - 1 && lines[line].length === 0) line++;
        col = firstNonBlank(lines, line);
      } else {
        col = text.length;
      }
    }
  }
  return { line, col };
}

export function wordBackward(lines: string[], from: Pos, count: number, big: boolean): Pos {
  // Unlike prevChar, this stops at an empty line: Vim counts it as a word.
  const step = (pos: Pos): Pos | null => {
    if (pos.col > 0) return { line: pos.line, col: pos.col - 1 };
    if (pos.line > 0) return { line: pos.line - 1, col: Math.max(0, lines[pos.line - 1].length - 1) };
    return null;
  };
  const blankLine = (pos: Pos): boolean => (lines[pos.line] ?? '').length === 0;
  let pos: Pos = { ...from };
  for (let i = 0; i < count; i++) {
    const prev = step(pos);
    if (!prev) break;
    pos = prev;
    if (blankLine(pos)) continue;
    while (charClass(charAt(lines, pos), big) === 0) {
      const next = step(pos);
      if (!next) break;
      pos = next;
      if (blankLine(pos)) break;
    }
    if (blankLine(pos)) continue;
    const cls = charClass(charAt(lines, pos), big);
    if (cls !== 0) {
      while (true) {
        const next = step(pos);
        if (!next || next.line !== pos.line || charClass(charAt(lines, next), big) !== cls) break;
        pos = next;
      }
    }
  }
  return pos;
}

export function wordEnd(lines: string[], from: Pos, count: number, big: boolean): Pos {
  let pos: Pos = { ...from };
  for (let i = 0; i < count; i++) {
    const next = nextChar(lines, pos);
    if (!next) break;
    pos = next;
    while (charClass(charAt(lines, pos), big) === 0) {
      const more = nextChar(lines, pos);
      if (!more) break;
      pos = more;
    }
    const cls = charClass(charAt(lines, pos), big);
    if (cls !== 0) {
      while (true) {
        const more = nextChar(lines, pos);
        if (!more || more.line !== pos.line || charClass(charAt(lines, more), big) !== cls) break;
        pos = more;
      }
    }
  }
  return pos;
}

export function wordEndBackward(lines: string[], from: Pos, count: number, big: boolean): Pos {
  // Unlike prevChar, this stops at an empty line: Vim counts it as a word.
  const step = (pos: Pos): Pos | null => {
    if (pos.col > 0) return { line: pos.line, col: pos.col - 1 };
    if (pos.line > 0) return { line: pos.line - 1, col: Math.max(0, lines[pos.line - 1].length - 1) };
    return null;
  };
  const blankLine = (pos: Pos): boolean => (lines[pos.line] ?? '').length === 0;
  let pos: Pos = { ...from };
  for (let i = 0; i < count; i++) {
    let prev = step(pos);
    if (!prev) return { line: 0, col: 0 };
    // starting inside a word: step back past that word first
    const fromClass = charClass(charAt(lines, pos), big);
    if (prev.line === pos.line && fromClass !== 0 && charClass(charAt(lines, prev), big) === fromClass) {
      while (true) {
        const more = step(prev);
        if (!more || more.line !== prev.line || charClass(charAt(lines, more), big) !== fromClass) break;
        prev = more;
      }
      const beforePrev = step(prev);
      if (beforePrev) prev = beforePrev;
    }
    pos = prev;
    if (blankLine(pos)) continue;
    while (charClass(charAt(lines, pos), big) === 0) {
      const more = step(pos);
      if (!more) break;
      pos = more;
      if (blankLine(pos)) break;
    }
    if (blankLine(pos)) continue;
    const cls = charClass(charAt(lines, pos), big);
    if (cls !== 0) {
      while (true) {
        const more = nextChar(lines, pos);
        if (!more || more.line !== pos.line || charClass(charAt(lines, more), big) !== cls) break;
        pos = more;
      }
    }
  }
  return pos;
}

export function paragraphForward(lines: string[], from: Pos, count: number): Pos {
  let line = from.line;
  for (let i = 0; i < count; i++) {
    let next = line + 1;
    while (next < lines.length && lines[next].trim() !== '') next++;
    // no blank line left: Vim stops on the last character of the file
    if (next >= lines.length) {
      const last = lines.length - 1;
      return { line: last, col: lastNonBlank(lines, last) };
    }
    line = next;
  }
  return { line, col: firstNonBlank(lines, line) };
}

export function paragraphBackward(lines: string[], from: Pos, count: number): Pos {
  let line = from.line;
  for (let i = 0; i < count; i++) {
    let next = line - 1;
    while (next > 0 && lines[next].trim() !== '') next--;
    line = next < 0 ? 0 : next;
  }
  return { line, col: firstNonBlank(lines, line) };
}

export function findCharOnLine(
  lines: string[],
  from: Pos,
  char: string,
  dir: 1 | -1,
  till: boolean,
  count: number,
): Pos | null {
  const line = lines[from.line] ?? '';
  let col = from.col;
  const n = Math.max(1, count);
  for (let i = 0; i < n; i++) {
    let found = -1;
    if (dir > 0) {
      for (let c = col + 1; c < line.length; c++) {
        if (line[c] === char) {
          found = c;
          break;
        }
      }
    } else {
      for (let c = col - 1; c >= 0; c--) {
        if (line[c] === char) {
          found = c;
          break;
        }
      }
    }
    if (found < 0) return null;
    col = found;
  }
  if (till) col -= dir;
  if (col < 0 || col >= line.length) return null;
  if (till && col === from.col) return null;
  return { line: from.line, col };
}

export function matchBracket(lines: string[], from: Pos): Pos | null {
  const text = lines.join('\n');
  const start = offsetOf(lines, from);
  const lineEnd = offsetOf(lines, { line: from.line, col: lines[from.line].length });
  const brackets = '()[]{}<>';
  let at = start;
  while (at < lineEnd && !brackets.includes(text[at])) at++;
  if (at >= lineEnd) return null;
  const open = text[at];
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };
  const closing = pairs[open];
  if (closing) {
    let depth = 0;
    for (let i = at; i < text.length; i++) {
      if (text[i] === open) depth++;
      else if (text[i] === closing) {
        depth--;
        if (depth === 0) return posAt(lines, i);
      }
    }
    return null;
  }
  const reverse: Record<string, string> = { ')': '(', ']': '[', '}': '{', '>': '<' };
  const opening = reverse[open];
  if (!opening) return null;
  let depth = 0;
  for (let i = at; i >= 0; i--) {
    if (text[i] === open) depth++;
    else if (text[i] === opening) {
      depth--;
      if (depth === 0) return posAt(lines, i);
    }
  }
  return null;
}

function bracketPair(key: string): { open: string; close: string } | null {
  if (key === '(' || key === ')' || key === 'b') return { open: '(', close: ')' };
  if (key === '[' || key === ']') return { open: '[', close: ']' };
  if (key === '{' || key === '}' || key === 'B') return { open: '{', close: '}' };
  if (key === '<' || key === '>') return { open: '<', close: '>' };
  return null;
}

function wordObject(lines: string[], from: Pos, around: boolean, big: boolean): TextRange | null {
  const line = lines[from.line] ?? '';
  let col = from.col;
  let cls = charClass(line[col], big);
  if (cls === 0) {
    while (col < line.length && charClass(line[col], big) === 0) col++;
    if (col >= line.length) {
      col = from.col;
      while (col >= 0 && charClass(line[col], big) === 0) col--;
      if (col < 0) return null;
    }
    cls = charClass(line[col], big);
  }
  let start = col;
  let end = col;
  while (start > 0 && charClass(line[start - 1], big) === cls) start--;
  while (end + 1 < line.length && charClass(line[end + 1], big) === cls) end++;
  if (!around) return { from: { line: from.line, col: start }, to: { line: from.line, col: end }, inclusive: true };
  let left = start;
  let right = end;
  while (right + 1 < line.length && /\s/.test(line[right + 1])) right++;
  if (left === start && right === end) {
    while (left > 0 && /\s/.test(line[left - 1])) left--;
  }
  return { from: { line: from.line, col: left }, to: { line: from.line, col: right }, inclusive: true };
}

function quoteObject(lines: string[], from: Pos, quote: string, around: boolean): TextRange | null {
  const line = lines[from.line] ?? '';
  const quotes: number[] = [];
  for (let col = 0; col < line.length; col++) if (line[col] === quote) quotes.push(col);
  const pairs: Array<[number, number]> = [];
  for (let pair = 0; pair + 1 < quotes.length; pair += 2) pairs.push([quotes[pair], quotes[pair + 1]]);
  // the pair around the cursor, else the next pair on the line
  const chosen =
    pairs.find(([left, right]) => from.col >= left && from.col <= right) ?? pairs.find(([left]) => left > from.col);
  if (!chosen) return null;
  const [left, right] = chosen;
  if (around) {
    let start = left;
    let end = right;
    if (end + 1 < line.length && /\s/.test(line[end + 1])) {
      while (end + 1 < line.length && /\s/.test(line[end + 1])) end++;
    } else {
      while (start > 0 && /\s/.test(line[start - 1])) start--;
    }
    return { from: { line: from.line, col: start }, to: { line: from.line, col: end }, inclusive: true };
  }
  if (right - left <= 1) {
    return { from: { line: from.line, col: left + 1 }, to: { line: from.line, col: left + 1 }, inclusive: false };
  }
  return {
    from: { line: from.line, col: left + 1 },
    to: { line: from.line, col: right - 1 },
    inclusive: true,
  };
}

function bracketObject(lines: string[], from: Pos, open: string, close: string, around: boolean): TextRange | null {
  const text = lines.join('\n');
  const start = offsetOf(lines, from);
  let openAt = -1;
  if (text[start] === open) openAt = start;
  else {
    let depth = 0;
    for (let i = start - 1; i >= 0; i--) {
      if (text[i] === close) depth++;
      else if (text[i] === open) {
        if (depth === 0) {
          openAt = i;
          break;
        }
        depth--;
      }
    }
  }
  // Only the enclosing block counts; otherwise Vim looks forward for the next opening bracket.
  if (openAt < 0) openAt = text.indexOf(open, start);
  if (openAt < 0) return null;
  let depth = 0;
  let closeAt = -1;
  for (let i = openAt; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) {
        closeAt = i;
        break;
      }
    }
  }
  if (closeAt < 0) return null;
  if (around) return { from: posAt(lines, openAt), to: posAt(lines, closeAt), inclusive: true };
  if (closeAt - openAt <= 1) {
    return { from: posAt(lines, openAt + 1), to: posAt(lines, openAt + 1), inclusive: false };
  }
  return { from: posAt(lines, openAt + 1), to: posAt(lines, closeAt - 1), inclusive: true };
}

export function textObject(lines: string[], from: Pos, key: string, around: boolean): TextRange | null {
  if (key === 'w' || key === 'W') return wordObject(lines, from, around, key === 'W');
  if (key === '"' || key === "'") return quoteObject(lines, from, key, around);
  const pair = bracketPair(key);
  return pair ? bracketObject(lines, from, pair.open, pair.close, around) : null;
}

export function wordAt(lines: string[], from: Pos): string {
  const line = lines[from.line] ?? '';
  if (!line.length) return '';
  const cls = charClass(line[from.col], false);
  if (cls === 0) return '';
  let start = from.col;
  let end = from.col;
  while (start > 0 && charClass(line[start - 1], false) === cls) start--;
  while (end + 1 < line.length && charClass(line[end + 1], false) === cls) end++;
  return line.slice(start, end + 1);
}

export function replaceFirst(text: string, old: string, next: string): string {
  const at = text.indexOf(old);
  return at < 0 ? text : text.slice(0, at) + next + text.slice(at + old.length);
}

export function replaceAll(text: string, old: string, next: string): string {
  return text.split(old).join(next);
}

interface NumberMatch {
  index: number;
  length: number;
  value: number;
  raw: string;
  hex: boolean;
}

// Ctrl-a / Ctrl-x: the number under the cursor, else the next one on the line.
export function adjustNumber(
  line: string,
  col: number,
  delta: number,
  count: number,
): { line: string; col: number } | null {
  let onNumber: NumberMatch | null = null;
  let after: NumberMatch | null = null;
  for (const match of line.matchAll(/0[xX][0-9a-fA-F]+|-?\d+/g)) {
    const raw = match[0];
    const hex = raw.startsWith('0x') || raw.startsWith('0X');
    const found = {
      index: match.index,
      length: raw.length,
      value: hex ? Number.parseInt(raw.slice(2), 16) : Number(raw),
      raw,
      hex,
    };
    if (col >= found.index && col < found.index + found.length) {
      onNumber = found;
      break;
    }
    if (found.index >= col && !after) after = found;
  }
  const target = onNumber ?? after;
  if (!target) return null;
  const value = target.value + delta * count;
  let next: string;
  if (target.hex) {
    const prefix = target.raw.slice(0, 2);
    const width = target.raw.length - 2;
    const digits = Math.max(0, value).toString(16).padStart(width, '0');
    // Vim keeps the case of the letters the number was written with
    next = prefix + (/[A-F]/.test(target.raw.slice(2)) ? digits.toUpperCase() : digits);
  } else {
    next = String(value);
    if (target.raw.replace('-', '').startsWith('0') && target.raw.length > 1) {
      const width = target.raw.replace('-', '').length;
      const sign = next.startsWith('-') ? '-' : '';
      next = sign + next.replace('-', '').padStart(width, '0');
    }
  }
  const colAfter = target.index + next.length - 1;
  return { line: line.slice(0, target.index) + next + line.slice(target.index + target.length), col: colAfter };
}

// Joins lines and returns the column where the last piece was added, for the cursor after J.
export function joinLinesAt(lines: string[], from: number, to: number): { text: string; col: number } {
  let out = lines[from];
  let col = out.length;
  for (let line = from + 1; line <= to; line++) {
    const next = lines[line].replace(/^\s+/, '');
    col = out.length;
    if (!next) continue;
    if (!out || /\s$/.test(out) || next.startsWith(')')) out += next;
    else out += ` ${next}`;
  }
  return { text: out, col };
}

export function joinLinesText(lines: string[], from: number, to: number): string {
  return joinLinesAt(lines, from, to).text;
}
