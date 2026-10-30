// NORMAL mode keys: counts, the starters that wait for a second key, and the dispatch to motions.
// Visual mode reuses motionKey, so every motion works there too.
import { firstNonBlank, isDigit, wordAt } from './text.ts';
import { MAX_COUNT } from './context.ts';
import type { EditorHost } from './context.ts';

const MOTION_KEYS = new Set(['h', 'j', 'k', 'l', '0', '^', '$', 'w', 'b', 'e', 'W', 'B', 'E', 'G', 'H', 'M', 'L']);
const JUMP_KEYS = new Set(['G', 'H', 'M', 'L', '{', '}', '%']);
const LINE_MOTION_KEYS = new Set(['+', '-', '_', '|', '{', '}', '%']);

const SIMPLE_EDIT_KEYS = new Set(['x', 'X', 'D', 'C', 's', 'S', 'Y']);
const INSERT_KEYS = new Set(['i', 'a', 'I', 'A', 'o', 'O']);

export function normalKey(host: EditorHost, key: string): boolean {
  if (key === 'Escape') {
    host.pending = null;
    host.count = 0;
    return true;
  }
  if (host.pending) return host.pendingKey(key);
  if (key === 'd' || key === 'c' || key === 'y' || key === '>' || key === '<') {
    host.pending = { kind: 'op', op: key, count: host.count, count2: 0 };
    host.count = 0;
    return true;
  }
  if (key === 'r') {
    host.pending = { kind: 'replace', count: host.count || 1 };
    host.count = 0;
    return true;
  }
  if (key === ':') {
    host.mode = 'command';
    host.commandText = '';
    return true;
  }
  if (key === '"') {
    host.pending = { kind: 'register' };
    return true;
  }
  if (key === 'm') {
    host.pending = { kind: 'mark' };
    return true;
  }
  if (key === '.') {
    const count = host.takeCount();
    if (!host.lastChange) return false;
    host.replayLastChange(count);
    return true;
  }
  if (key === 'C-a' || key === 'C-x') {
    host.adjustNumber(key === 'C-a' ? 1 : -1, host.takeCount() || 1);
    return true;
  }
  if (INSERT_KEYS.has(key)) {
    host.startInsertCommand(key, host.takeCount() || 1);
    return true;
  }
  if (SIMPLE_EDIT_KEYS.has(key)) {
    host.simpleEdit(key);
    return true;
  }
  if (key === 'p' || key === 'P') {
    host.put(key === 'P', host.takeCount() || 1);
    return true;
  }
  if (key === 'J') {
    host.joinLines(host.count || 2);
    host.count = 0;
    return true;
  }
  if (key === '~') {
    host.toggleCase(host.takeCount());
    return true;
  }
  if (key === 'u') {
    const count = host.takeCount() || 1;
    for (let i = 0; i < count; i++) host.undo();
    return true;
  }
  if (key === 'v' || key === 'V') {
    host.anchor = { ...host.cursor };
    host.mode = key === 'v' ? 'visual' : 'visual-line';
    return true;
  }
  return motionKey(host, key);
}

// Moves the cursor only. Normal and visual mode both use this, so every motion works in both.
export function motionKey(host: EditorHost, key: string): boolean {
  if (isDigit(key) && (key !== '0' || host.count > 0)) {
    host.count = Math.min(MAX_COUNT, host.count * 10 + Number(key));
    return true;
  }
  if (key === 'g') {
    host.pending = { kind: 'g', count: host.count };
    host.count = 0;
    return true;
  }
  if (key === 'f' || key === 'F' || key === 't' || key === 'T') {
    host.pending = {
      kind: 'find',
      dir: key === 'f' || key === 't' ? 1 : -1,
      till: key === 't' || key === 'T',
      count: host.count,
    };
    host.count = 0;
    return true;
  }
  if (key === '`' || key === "'") {
    host.pending = { kind: 'jumpMark', linewise: key === "'" };
    return true;
  }
  if (key === '/' || key === '?') {
    host.searchReturn = host.mode === 'visual' || host.mode === 'visual-line' ? host.mode : 'normal';
    host.mode = 'search';
    host.searchText = '';
    host.searchDirection = key === '/' ? 1 : -1;
    return true;
  }
  if (key === 'n' || key === 'N') {
    if (!host.lastSearch) return false;
    const count = host.takeCount() || 1;
    const to = host.repeatSearchTarget(key, count);
    host.lastJump = { ...host.cursor };
    if (to) host.moveTo(to);
    return true;
  }
  if (key === '*' || key === '#') {
    if (!wordAt(host.lines, host.cursor)) return false;
    const to = host.searchWordTarget(key === '*' ? 1 : -1, host.takeCount() || 1);
    host.lastJump = { ...host.cursor };
    if (to) host.moveTo(to);
    return true;
  }
  if (key === 'Enter') {
    const count = host.takeCount() || 1;
    const line = host.cursor.line + count;
    if (line < host.lines.length) host.moveTo({ line, col: firstNonBlank(host.lines, line) });
    return true;
  }
  if (key === ';' || key === ',') {
    host.moveToMotion(host.resolveMotion(key, host.takeCount()), false);
    return true;
  }
  if (MOTION_KEYS.has(key) || LINE_MOTION_KEYS.has(key)) {
    host.moveToMotion(host.resolveMotion(key, host.takeCount()), JUMP_KEYS.has(key));
    return true;
  }
  return false;
}
