import { keys, normalizeCode } from './input.ts';
// engine: Key bindings. The game names its actions ('jump', 'reload', ...) and gives each its default keys; the
// engine knows nothing about what an action does. Keys are KeyboardEvent.code values ('KeyW', 'ArrowUp', 'Space').
// - defineActions(defs) registers the actions once at start-up (a later call replaces the whole set).
// - actionDown(action): is any key of the action held right now (reads keys[] of input.ts).
//   actionOf(code): which action a key is bound to (null if none), for INPUT.key(e).
// - An action has at most KEYS_PER_ACTION keys, kept in order with no gaps: bindKey(action, slot, code) puts the key
//   in that slot (replacing the key there, or adding when the slot is past the end). A key belongs to one action only:
//   binding a key that another action has takes it away from that action (which can end up with no keys), and
//   bindKey returns that action's name so the game can say so. Binding a key to another slot of the same action
//   swaps the two.
// - exportBindings() / importBindings(saved) move the bindings in and out of the game's save (action -> keys).
//   Import is forgiving: unknown actions and bad values are ignored, a missing action gets its default keys (minus
//   keys the saved actions already use), a key used by two saved actions stays with the first one defined.
// - keyLabel(code) is the short name of a key for screens ('KeyW' -> 'W', 'ArrowUp' -> '↑', 'ShiftLeft' -> 'Shift').
export const KEYS_PER_ACTION = 2;
export interface ActionDef {
  id: string;
  keys: string[]; // default keys, up to KEYS_PER_ACTION
}
// action id -> its keys (the form kept in a save)
export type KeyBindings = Record<string, string[]>;

let order: string[] = []; // the action ids, in the order they were defined
let defaults: KeyBindings = {};
let current: KeyBindings = {};

const copyBindings = (b: KeyBindings): KeyBindings => Object.fromEntries(order.map(id => [id, [...(b[id] ?? [])]]));
function listOf(action: string): string[] {
  const list = current[action];
  if (!list) throw new Error('keymap: unknown action ' + action);
  return list;
}

export function defineActions(defs: ActionDef[]) {
  const nextOrder: string[] = [],
    nextDefaults: KeyBindings = {},
    used = new Map<string, string>(); // key -> the action that has it by default
  for (const d of defs) {
    if (nextDefaults[d.id]) throw new Error('keymap: action defined twice: ' + d.id);
    if (d.keys.length > KEYS_PER_ACTION) throw new Error(`keymap: ${d.id} has more than ${KEYS_PER_ACTION} keys`);
    const list = d.keys.map(normalizeCode);
    for (const c of list) {
      const owner = used.get(c);
      if (owner !== undefined) throw new Error(`keymap: ${c} is the default of both ${owner} and ${d.id}`);
      used.set(c, d.id);
    }
    nextOrder.push(d.id);
    nextDefaults[d.id] = list;
  }
  order = nextOrder;
  defaults = nextDefaults;
  current = copyBindings(defaults);
}
export const actionDown = (action: string): boolean => listOf(action).some(c => keys[c]);
export function actionOf(code: string): string | null {
  const c = normalizeCode(code);
  return order.find(id => current[id].includes(c)) ?? null;
}
export const keysOf = (action: string): string[] => [...listOf(action)];
// puts `code` on the action's slot (0 .. KEYS_PER_ACTION - 1). Returns the other action that lost the key, or null
export function bindKey(action: string, slot: number, code: string): string | null {
  const list = listOf(action),
    c = normalizeCode(code),
    at = list.indexOf(c),
    s = Math.max(0, Math.min(Math.floor(slot), list.length, KEYS_PER_ACTION - 1));
  if (at >= 0) {
    if (at !== s && s < list.length) [list[at], list[s]] = [list[s], list[at]];
    return null;
  }
  const from = actionOf(c);
  if (from !== null) current[from] = current[from].filter(k => k !== c);
  if (s < list.length) list[s] = c;
  else list.push(c);
  return from;
}
export const resetBindings = () => {
  current = copyBindings(defaults);
};
export const exportBindings = (): KeyBindings => copyBindings(current);
export function importBindings(saved: unknown) {
  // a plain object was checked just above; its values are checked one by one below
  const src = (saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}) as Record<string, unknown>,
    next: KeyBindings = {},
    taken = new Set<string>();
  const place = (id: string, list: string[]) => {
    const own = [...new Set(list.map(normalizeCode))].filter(c => !taken.has(c)).slice(0, KEYS_PER_ACTION);
    own.forEach(c => taken.add(c));
    next[id] = own;
  };
  for (const id of order) {
    const v = src[id];
    if (Array.isArray(v))
      place(
        id,
        v.filter((c): c is string => typeof c === 'string' && c !== ''),
      );
  }
  for (const id of order) if (!next[id]) place(id, defaults[id]);
  current = next;
}

const LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ShiftLeft: 'Shift',
  ControlLeft: 'Ctrl',
  AltLeft: 'Alt',
  MetaLeft: 'Meta',
  Escape: 'Esc',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  CapsLock: 'Caps',
  ContextMenu: 'Menu',
  NumpadEnter: 'Enter',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  IntlYen: '¥',
};
export function keyLabel(code: string): string {
  const c = normalizeCode(code);
  const known = LABELS[c];
  if (known !== undefined) return known;
  const m = c.match(/^(?:Key|Digit)(\w)$/) ?? c.match(/^Numpad(\d)$/);
  if (m) return c.startsWith('Numpad') ? 'Num ' + m[1] : m[1];
  return c; // Space, Tab, Enter, Backspace, F5, Home ... read fine as they are
}
