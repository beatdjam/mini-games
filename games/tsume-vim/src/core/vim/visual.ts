// VISUAL and VISUAL LINE: extending the selection, text objects, and the keys that act on the selection.
import type { Pos } from '../../data/types.ts';
import { before, textObject as resolveTextObject } from './text.ts';
import type { EditorHost } from './context.ts';
import type { Operator } from './types.ts';

type VisualOp = 'd' | 'x' | 'y' | 'c' | 's' | '>' | '<' | 'J' | 'p' | 'P' | '~' | 'D' | 'X' | 'Y' | 'C' | 'S';
const VISUAL_OPS = new Set<string>(['d', 'x', 'y', 'c', 's', '>', '<', 'J', 'p', 'P', '~', 'D', 'X', 'Y', 'C', 'S']);
const isVisualOp = (key: string): key is VisualOp => VISUAL_OPS.has(key);

export function visualKey(host: EditorHost, key: string): boolean {
  if (host.pending?.kind === 'visualText') {
    const around = host.pending.around;
    host.pending = null;
    if (key === 'Escape') {
      host.mode = 'normal';
      host.anchor = null;
      return true;
    }
    const range = resolveTextObject(host.lines, host.cursor, key, around);
    if (range) {
      host.anchor = range.from;
      host.cursor = range.to;
      host.mode = 'visual';
    }
    return true;
  }
  if (host.pending) return host.pendingKey(key);
  if (key === 'i' || key === 'a') {
    host.pending = { kind: 'visualText', around: key === 'a' };
    return true;
  }
  if (key === '"') {
    host.pending = { kind: 'register' };
    return true;
  }
  if (key === 'r') {
    host.pending = { kind: 'visualReplace' };
    return true;
  }
  if (key === 'Escape' || (key === 'v' && host.mode === 'visual') || (key === 'V' && host.mode === 'visual-line')) {
    host.mode = 'normal';
    host.anchor = null;
    return true;
  }
  if (key === 'v') {
    host.mode = 'visual';
    return true;
  }
  if (key === 'V') {
    host.mode = 'visual-line';
    return true;
  }
  if (key === 'o') {
    if (host.anchor) {
      const anchor = host.anchor;
      host.anchor = { ...host.cursor };
      host.cursor = anchor;
    }
    return true;
  }
  if (isVisualOp(key)) {
    applyVisual(host, key);
    return true;
  }
  return host.motionKey(key);
}

// The selected characters. A linewise selection covers each line to its end.
function selectionRange(host: EditorHost): { from: Pos; to: Pos; first: number; last: number; linewise: boolean } {
  const anchor = host.anchor ?? host.cursor;
  const linewise = host.mode === 'visual-line';
  const first = Math.min(anchor.line, host.cursor.line);
  const last = Math.max(anchor.line, host.cursor.line);
  if (linewise) {
    return { from: { line: first, col: 0 }, to: { line: last, col: host.lines[last].length }, first, last, linewise };
  }
  const forward = before(anchor, host.cursor);
  return {
    from: forward ? anchor : host.cursor,
    to: forward ? host.cursor : anchor,
    first,
    last,
    linewise,
  };
}

function applyVisual(host: EditorHost, op: VisualOp): void {
  const { from, to, first, last, linewise } = selectionRange(host);
  host.mode = 'normal';
  host.anchor = null;
  if (op === '>' || op === '<') {
    host.indentLines(first, last, op === '>' ? 1 : -1);
    return;
  }
  if (op === 'J') {
    host.joinSelected(first, last);
    return;
  }
  if (op === 'p' || op === 'P') {
    host.putVisual(from, to, linewise, op === 'P');
    return;
  }
  if (op === 'D' || op === 'X') {
    host.linewiseOp('d', first, last);
    return;
  }
  if (op === 'Y') {
    host.linewiseOp('y', first, last);
    return;
  }
  if (op === 'C' || op === 'S') {
    host.linewiseOp('c', first, last);
    return;
  }
  if (op === '~') {
    host.toggleRange(from, to);
    host.cursor = host.normalizeNormal(from);
    return;
  }
  const action: Operator = op === 'x' ? 'd' : op === 's' ? 'c' : op;
  if (linewise) host.linewiseOp(action, first, last);
  else host.charwiseOp(action, from, to, true);
}

export function replaceVisual(host: EditorHost, char: string): void {
  const { from, to } = selectionRange(host);
  host.mode = 'normal';
  host.anchor = null;
  host.replaceRange(from, to, char);
  host.cursor = host.normalizeNormal(from);
}
