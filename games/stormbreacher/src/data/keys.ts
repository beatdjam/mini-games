// The keyboard's actions and their starting keys (SB-030 keyboard). An action is what the game asks for ('jump',
// 'boost'); engine's defineActions keeps the player's bindings, so a later binding screen can change these without the
// rest of the game changing. Keys are KeyboardEvent.code values.

export type KeyAction =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'boost'
  | 'main'
  | 'sub'
  | 'lock'
  | 'lookLeft'
  | 'lookRight'
  | 'lookUp'
  | 'lookDown';

// The keys each action starts with. The engine stores the right-hand Shift as ShiftLeft, so one binding covers both.
export const KEY_DEFAULTS: Record<KeyAction, string[]> = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  jump: ['Space'],
  boost: ['ShiftLeft'],
  main: ['KeyJ'],
  sub: ['KeyK'],
  lock: ['KeyE'],
  lookLeft: ['ArrowLeft'],
  lookRight: ['ArrowRight'],
  lookUp: ['ArrowUp'],
  lookDown: ['ArrowDown'],
};

// How fast the arrow keys turn the view (SB-030 keyboard).
export const KEY_TUNE = {
  lookRate: 2.4, // the yaw the left / right arrows add while held (rad/s)
  pitchRate: 1.2, // the pitch the up / down arrows add while held (rad/s)
};
