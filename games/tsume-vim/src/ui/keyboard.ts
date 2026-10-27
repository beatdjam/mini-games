// Turns a browser key event into the key name the editor understands. Mode matters: arrows move in NORMAL/VISUAL,
// but are handled by the editor itself in INSERT/SEARCH/COMMAND.
export const SPECIAL_KEYS = new Set([
  'Escape',
  'Enter',
  'Backspace',
  'Delete',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'C-r',
  'C-a',
  'C-x',
]);

export function keyOf(event: KeyboardEvent, mode: string): string {
  if (event.ctrlKey) {
    const lower = event.key.toLowerCase();
    if (event.key === '[') return 'Escape';
    if (lower === 'r') return 'C-r';
    if (mode !== 'normal') return '';
    if (lower === 'a') return 'C-a';
    if (lower === 'x') return 'C-x';
    return '';
  }
  if (mode === 'insert' || mode === 'search' || mode === 'command') return event.key;
  if (event.key === 'ArrowLeft') return 'h';
  if (event.key === 'ArrowRight') return 'l';
  if (event.key === 'ArrowUp') return 'k';
  if (event.key === 'ArrowDown') return 'j';
  if (event.key === 'Home') return '0';
  if (event.key === 'End') return '$';
  if (event.key === 'Backspace') return 'h';
  return event.key;
}

export function keyLabel(key: string): string {
  if (key === ' ') return '␣';
  if (key === 'Escape') return 'Esc';
  if (key === 'Backspace') return 'BS';
  return key;
}
