// Keyboard and mouse input for the mech (SB-030 keyboard): the engine's key actions and mouse look become the same
// MechInput that the touch screen fills. The right mouse button is the sub shot while the pointer is locked.
import { actionDown, actionOf, defineActions, locked, mouseFire } from '@engine/ui/index.ts';
import { KEY_DEFAULTS, KEY_TUNE, type KeyAction } from '../data/keys.ts';
import type { MechInput } from '../logic/mech.ts';

export interface KeyboardRead {
  input: MechInput;
  pitchDelta: number; // the pitch the arrow keys add this frame (rad)
  lock: boolean; // the lock display, shared with the touch screen's lock button
  sub: boolean; // the sub shot: its key, or the right mouse button while locked
  use: boolean; // the use key (planting a charge)
}

// The action table defineActions takes, built from the defaults (the object's keys are the action ids).
const ACTION_DEFS = Object.entries(KEY_DEFAULTS).map(([id, keys]) => ({ id, keys }));

// A key went down since the last read; a held key repeats keydown but that is not a new press.
let jumpPressed = false;
let lockOn = false;
let subMouse = false; // the right mouse button is down while the pointer is locked
let ready = false; // initKeyboard has run (a second call does nothing)

export const lockState = (): boolean => lockOn;

export function toggleLock() {
  lockOn = !lockOn;
}

// The engine calls INPUT.key on every keydown, after keys[] is updated. Only the instant matters here: a jump and the
// lock toggle happen once per press, not on the repeats of a held key.
export function handleKey(e: KeyboardEvent) {
  if (e.repeat) return;
  const action = actionOf(e.code);
  if (action === 'jump') jumpPressed = true;
  else if (action === 'lock') toggleLock();
}

function initMouse() {
  document.addEventListener('mousedown', e => {
    if (e.button === 2 && locked) subMouse = true;
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 2) subMouse = false;
  });
  // A lock lost while the button is held would leave the shot on for the next lock.
  document.addEventListener('pointerlockchange', () => {
    if (!locked) subMouse = false;
  });
  window.addEventListener('blur', () => {
    subMouse = false;
    jumpPressed = false;
  });
}

export function initKeyboard() {
  if (ready) return;
  ready = true;
  defineActions(ACTION_DEFS);
  initMouse();
}

const actionAxis = (plus: KeyAction, minus: KeyAction): number =>
  (actionDown(plus) ? 1 : 0) - (actionDown(minus) ? 1 : 0);

// This frame's keyboard input. A jump is true for one read only; the turn and pitch already have the frame time in.
export function readKeyboard(dt: number): KeyboardRead {
  const input: MechInput = {
    moveX: actionAxis('right', 'left'),
    moveZ: actionAxis('forward', 'back'),
    turn: actionAxis('lookLeft', 'lookRight') * KEY_TUNE.lookRate * dt,
    jump: jumpPressed,
    jumpHeld: actionDown('jump'),
    boost: actionDown('boost'),
    fire: actionDown('main') || mouseFire,
  };
  jumpPressed = false;
  return {
    input,
    pitchDelta: actionAxis('lookUp', 'lookDown') * KEY_TUNE.pitchRate * dt,
    lock: lockState(),
    sub: actionDown('sub') || (locked && subMouse),
    use: actionDown('use'),
  };
}
