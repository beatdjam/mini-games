import type { KeyActionDef } from './types.ts';
import { withLang } from '@engine/core/langslots.ts';
// Touch button layout, the PC key actions and the controls guide
// touch button layout: x/y are the centre as a fraction of the screen, b is the base size in px
export const LAYOUT_DEF = {
  fire: { x: 0.88, y: 0.74, s: 1, b: 88 },
  dash: { x: 0.955, y: 0.44, s: 1, b: 64 },
  reload: { x: 0.75, y: 0.86, s: 1, b: 50 },
  kit: { x: 0.86, y: 0.3, s: 1, b: 50 },
  fire2: { x: 0.2, y: 0.5, s: 1, b: 58 },
};
// PC key actions in the order of the key settings dialog, with their default keys (up to 2 each).
// ShiftLeft stands for either Shift key (engine normalizeCode)
export const KEY_ACTIONS: KeyActionDef[] = withLang<KeyActionDef, 'name'>(
  [
    { id: 'forward', keys: ['KeyW', 'ArrowUp'] },
    { id: 'back', keys: ['KeyS', 'ArrowDown'] },
    { id: 'left', keys: ['KeyA', 'ArrowLeft'] },
    { id: 'right', keys: ['KeyD', 'ArrowRight'] },
    { id: 'dash', keys: ['Space', 'ShiftLeft'] },
    { id: 'fire', keys: ['KeyF'] },
    { id: 'swap', keys: ['KeyQ'] },
    { id: 'slot1', keys: ['Digit1'] },
    { id: 'slot2', keys: ['Digit2'] },
    { id: 'reload', keys: ['KeyR'] },
    { id: 'stow', keys: ['KeyE'] },
    { id: 'equip', keys: ['KeyG'] },
    { id: 'kit', keys: ['KeyH'] },
    { id: 'map', keys: ['KeyM'] },
    { id: 'map3d', keys: ['KeyN'] },
    { id: 'bag', keys: ['Tab', 'KeyI'] },
    { id: 'pause', keys: ['Escape', 'KeyP'] },
  ],
  { name: '' },
);
// the guide rows are [label, text]; a {action} in the text is replaced by that action's keys ("W / ↑"), {action.0} by
// its first key only (see keyText in src/ui/input.ts)
export const GUIDE_DESK: [string, string][] = []; // filled from the language file
export const GUIDE_TOUCH: [string, string][] = [];
