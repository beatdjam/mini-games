// The `:` command line: line-number jumps and literal :s / :%s replacement.
import { firstNonBlank, replaceAll, replaceFirst } from './text.ts';
import type { EditorHost } from './context.ts';

export function commandKey(host: EditorHost, key: string): boolean {
  if (key === 'Escape') {
    host.mode = 'normal';
    host.commandText = '';
    return true;
  }
  if (key === 'Enter') {
    runCommand(host);
    host.mode = 'normal';
    host.commandText = '';
    return true;
  }
  if (key === 'Backspace') {
    host.commandText = host.commandText.slice(0, -1);
    return true;
  }
  if (key.length === 1) {
    host.commandText += key;
    return true;
  }
  return false;
}

// :N and :$ jump to a line; :s/old/new/[g] and :%s/old/new/g replace literal text.
function runCommand(host: EditorHost): void {
  const command = host.commandText.trim();
  if (!command) return;
  if (/^\d+$/.test(command)) {
    const line = Math.min(Number(command) - 1, host.lines.length - 1);
    host.lastJump = { ...host.cursor };
    host.cursor = host.normalizeNormal({ line, col: firstNonBlank(host.lines, line) });
    return;
  }
  if (command === '$') {
    const line = host.lines.length - 1;
    host.lastJump = { ...host.cursor };
    host.cursor = host.normalizeNormal({ line, col: firstNonBlank(host.lines, line) });
    return;
  }
  const sub = /^(%?)s\/(.*?)\/(.*?)\/(g?)$/.exec(command);
  if (!sub) return;
  const whole = sub[1] === '%';
  const old = sub[2];
  const replacement = sub[3];
  const global = sub[4] === 'g';
  if (!old) return;
  const from = whole ? 0 : host.cursor.line;
  const to = whole ? host.lines.length - 1 : host.cursor.line;
  const changed: Array<{ line: number; text: string }> = [];
  for (let line = from; line <= to; line++) {
    const text = host.lines[line];
    const next = global ? replaceAll(text, old, replacement) : replaceFirst(text, old, replacement);
    if (next !== text) changed.push({ line, text: next });
  }
  if (!changed.length) return;
  host.pushUndo();
  for (const change of changed) host.lines[change.line] = change.text;
  host.cursor = host.normalizeNormal({ line: changed[0].line, col: 0 });
}
