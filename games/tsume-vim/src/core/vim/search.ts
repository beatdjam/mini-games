// Literal (non-regex) search: the / and ? prompt, n/N, * and #, and the pattern scan they share.
import type { Pos } from '../../data/types.ts';
import { offsetOf, posAt, wordAt } from './text.ts';
import type { EditorHost } from './context.ts';

export function searchKey(host: EditorHost, key: string): boolean {
  if (key === 'Escape') {
    host.operatorSearch = null;
    host.mode = host.searchReturn;
    host.searchText = '';
    return true;
  }
  if (key === 'Enter') {
    const operator = host.operatorSearch;
    host.operatorSearch = null;
    if (operator) {
      if (host.searchText) {
        const pattern = host.searchText;
        host.lastSearch = { pattern, dir: host.searchDirection, wholeWord: false };
        host.lastJump = { ...host.cursor };
        const to = scanPattern(host, pattern, host.searchDirection, false, operator.count);
        if (to) host.applyOperator(operator.op, { to, inclusive: false, linewise: false });
      }
      // `c` starts INSERT; the other operators stay in NORMAL
      if (host.mode === 'search') host.mode = 'normal';
      host.searchText = '';
      return true;
    }
    if (host.searchText) search(host, host.searchText, host.searchDirection);
    host.mode = host.searchReturn;
    host.searchText = '';
    return true;
  }
  if (key === 'Backspace') {
    host.searchText = host.searchText.slice(0, -1);
    return true;
  }
  if (key.length === 1) {
    host.searchText += key;
    return true;
  }
  return false;
}

// Moves to the first match after (or before) the cursor, wrapping at the ends. The pattern is a plain string.
export function search(host: EditorHost, pattern: string, dir: 1 | -1): boolean {
  const to = findPattern(host, pattern, dir);
  if (!to) return false;
  host.lastJump = { ...host.cursor };
  host.lastSearch = { pattern, dir, wholeWord: false };
  host.cursor = host.normalizeNormal(to);
  return true;
}

// The end of a repeated search, without moving the cursor.
export function repeatSearchTarget(host: EditorHost, key: 'n' | 'N', count: number): Pos | null {
  if (!host.lastSearch) return null;
  const dir: 1 | -1 = key === 'n' ? host.lastSearch.dir : host.lastSearch.dir === 1 ? -1 : 1;
  return scanPattern(host, host.lastSearch.pattern, dir, host.lastSearch.wholeWord, count);
}

// The end of a `*` or `#`, without moving the cursor. It becomes the last search.
export function searchWordTarget(host: EditorHost, dir: 1 | -1, count: number): Pos | null {
  const word = wordAt(host.lines, host.cursor);
  if (!word) return null;
  host.lastSearch = { pattern: word, dir, wholeWord: true };
  return scanPattern(host, word, dir, true, count);
}

export function scanPattern(
  host: EditorHost,
  pattern: string,
  dir: 1 | -1,
  wholeWord: boolean,
  count: number,
): Pos | null {
  let from = host.cursor;
  let to: Pos | null = null;
  for (let i = 0; i < count; i++) {
    const found = findPattern(host, pattern, dir, wholeWord, from);
    if (!found) break;
    to = found;
    from = found;
  }
  return to;
}

// Finds a literal string. wholeWord keeps `*` and `#` on word boundaries, as Vim does (g* would not).
export function findPattern(
  host: EditorHost,
  pattern: string,
  dir: 1 | -1,
  wholeWord = false,
  from: Pos = host.cursor,
): Pos | null {
  if (!pattern) return null;
  const text = host.text;
  const start = offsetOf(host.lines, from);
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
  return posAt(host.lines, at);
}
