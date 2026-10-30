// `.` recording and replay: remember the keys of a change and feed them back when `.` is pressed.
import { isDigit } from './text.ts';
import type { EditorHost } from './context.ts';

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

export function handleTracked(host: EditorHost, key: string): boolean {
  if (!host.replaying && !host.record && host.mode === 'normal' && CHANGE_STARTERS.has(key)) {
    host.record = host.count > 0 ? [...String(host.count), key] : [key];
    host.recordText = host.text;
  } else if (host.record && !host.replaying) {
    host.record.push(key);
  }
  const handled = host.handle(key);
  if (host.record && !host.replaying) {
    if (!handled) {
      host.record = null;
    } else if (host.pending === null && host.mode === 'normal') {
      if (host.text !== host.recordText) {
        host.lastChange = host.record;
      }
      host.record = null;
    }
  }
  host.registers.finishKey(host.pending === null && host.mode === 'normal');
  return handled;
}

export function replayLastChange(host: EditorHost, count: number): void {
  if (!host.lastChange) return;
  let keys = [...host.lastChange];
  if (count > 0) {
    // A count on `.` replaces the count the change was recorded with.
    let at = 0;
    while (at < keys.length && isDigit(keys[at])) at++;
    keys = keys.slice(at);
    host.count = count;
  }
  host.replaying = true;
  host.record = null;
  host.undoPushedForReplay = false;
  for (const key of keys) host.handle(key);
  // the count given to `.` is kept for the next `.`, as Vim does
  if (count > 0) host.lastChange = [...String(count), ...keys];
  host.replaying = false;
  host.undoPushedForReplay = false;
  host.pending = null;
  host.count = 0;
}
