// INSERT mode: the commands that enter it, the keys typed inside it, and the count repeat on Escape.
import { firstNonBlank, offsetOf, posAt } from './text.ts';
import type { EditorHost } from './context.ts';
import type { Pos } from '../../data/types.ts';

export function startInsertCommand(host: EditorHost, key: string, count = 1): void {
  host.pushUndo();
  host.insertRepeat = count;
  host.insertOpensLine = key === 'o' || key === 'O';
  let pos: Pos;
  if (key === 'i') {
    pos = host.normalizeInsert(host.cursor);
  } else if (key === 'a') {
    pos = host.normalizeInsert({ line: host.cursor.line, col: host.cursor.col + 1 });
  } else if (key === 'I') {
    pos = { line: host.cursor.line, col: firstNonBlank(host.lines, host.cursor.line) };
  } else if (key === 'A') {
    pos = { line: host.cursor.line, col: host.line.length };
  } else {
    const line = key === 'o' ? host.cursor.line + 1 : host.cursor.line;
    host.lines.splice(line, 0, '');
    pos = { line, col: 0 };
  }
  host.cursor = pos;
  host.insertStartLine = pos.line;
  host.insertStartOffset = offsetOf(host.lines, pos);
  host.mode = 'insert';
}

export function insertKey(host: EditorHost, key: string): boolean {
  if (key === 'Escape') {
    finishInsert(host);
    return true;
  }
  if (key === 'Enter') {
    const line = host.line;
    const head = line.slice(0, host.cursor.col);
    const tail = line.slice(host.cursor.col);
    host.lines.splice(host.cursor.line, 1, head, tail);
    host.cursor = { line: host.cursor.line + 1, col: 0 };
    return true;
  }
  if (key === 'Backspace') {
    if (host.cursor.col > 0) {
      const line = host.line;
      host.lines[host.cursor.line] = line.slice(0, host.cursor.col - 1) + line.slice(host.cursor.col);
      host.cursor = { line: host.cursor.line, col: host.cursor.col - 1 };
    } else if (host.cursor.line > 0) {
      const prev = host.lines[host.cursor.line - 1];
      const line = host.lines[host.cursor.line];
      host.lines.splice(host.cursor.line - 1, 2, prev + line);
      host.cursor = { line: host.cursor.line - 1, col: prev.length };
    }
    return true;
  }
  if (key === 'Delete') {
    const line = host.line;
    if (host.cursor.col < line.length) {
      host.lines[host.cursor.line] = line.slice(0, host.cursor.col) + line.slice(host.cursor.col + 1);
    } else if (host.cursor.line < host.lines.length - 1) {
      host.lines.splice(host.cursor.line, 2, line + host.lines[host.cursor.line + 1]);
    }
    return true;
  }
  if (key === 'ArrowLeft') {
    host.cursor = { line: host.cursor.line, col: Math.max(0, host.cursor.col - 1) };
    return true;
  }
  if (key === 'ArrowRight') {
    host.cursor = { line: host.cursor.line, col: Math.min(host.line.length, host.cursor.col + 1) };
    return true;
  }
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const line = Math.max(0, Math.min(host.lines.length - 1, host.cursor.line + (key === 'ArrowUp' ? -1 : 1)));
    host.cursor = { line, col: Math.min(host.cursor.col, host.lines[line].length) };
    return true;
  }
  if (key === 'Home') {
    host.cursor = { line: host.cursor.line, col: 0 };
    return true;
  }
  if (key === 'End') {
    host.cursor = { line: host.cursor.line, col: host.line.length };
    return true;
  }
  if (key.length === 1) {
    const line = host.line;
    host.lines[host.cursor.line] = line.slice(0, host.cursor.col) + key + line.slice(host.cursor.col);
    host.cursor = { line: host.cursor.line, col: host.cursor.col + 1 };
    return true;
  }
  return false;
}

// Escape repeats the typed text when the insert had a count, as Vim does.
function finishInsert(host: EditorHost): void {
  const repeat = host.insertRepeat;
  const endLine = host.cursor.line;
  const endCol = host.cursor.col;
  if (repeat > 1 && host.insertOpensLine) {
    const block = host.lines.slice(host.insertStartLine, endLine + 1);
    const added = Array.from({ length: repeat - 1 }, () => block).flat();
    host.lines.splice(endLine + 1, 0, ...added);
    host.cursor = host.normalizeNormal({
      line: endLine + (repeat - 1) * block.length,
      col: Math.max(0, endCol - 1),
    });
  } else if (repeat > 1) {
    const endOffset = offsetOf(host.lines, { line: endLine, col: endCol });
    const typed = host.text.slice(host.insertStartOffset, endOffset);
    if (!typed) {
      host.cursor = host.normalizeNormal({ line: endLine, col: Math.max(0, endCol - 1) });
    } else {
      const extra = typed.repeat(repeat - 1);
      host.insertText(extra, posAt(host.lines, endOffset));
      host.cursor = host.normalizeNormal(posAt(host.lines, endOffset + extra.length - 1));
    }
  } else {
    host.cursor = host.normalizeNormal({ line: endLine, col: Math.max(0, endCol - 1) });
  }
  host.mode = 'normal';
  host.anchor = null;
  host.insertRepeat = 1;
  host.insertOpensLine = false;
}
