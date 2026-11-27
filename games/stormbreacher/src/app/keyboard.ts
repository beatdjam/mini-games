// Keyboard and mouse input for the mech (SB-030 keyboard): the engine's key actions and mouse look become the same
// MechInput that the touch screen fills. The right mouse button on the canvas is the sub shot.
import { el } from '@engine/core/index.ts';
import { actionDown, actionOf, defineActions } from '@engine/ui/index.ts';
import { KEY_DEFAULTS, KEY_TUNE, type KeyAction } from '../data/keys.ts';
import type { MechInput } from '../logic/mech.ts';

export interface KeyboardRead {
  input: MechInput;
  lock: boolean; // the lock display, shared with the touch screen's lock button
  sub: boolean; // the sub shot: its key, or the right mouse button on the canvas
  use: boolean; // the use key (planting a charge)
  melee: boolean; // the fist's key
}

// The action table defineActions takes, built from the defaults (the object's keys are the action ids).
const ACTION_DEFS = Object.entries(KEY_DEFAULTS).map(([id, keys]) => ({ id, keys }));

// A key went down since the last read; a held key repeats keydown but that is not a new press.
let jumpPressed = false;
let jumpEnabled = true; // the main body and the arena take no jump (D-50); the dev views keep it
let lockOn = false;
let mainMouse = false; // the left mouse button is down on the canvas
let subMouse = false; // the right mouse button is down on the canvas
let mouseHeldOff = false; // a press that skipped a cutscene is not fire until it is let go (ticket 2137)
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
  if (action === 'jump') {
    if (jumpEnabled) jumpPressed = true;
  } else if (action === 'lock') toggleLock();
}

function initMouse() {
  const canvas = el('#gl');
  // the left button is the main shot and the right the sub, both with the cursor on the screen
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) mainMouse = true;
    else if (e.button === 2) subMouse = true;
  });
  // the right button's menu would cover the game
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  // let go at the document, so a button released off the canvas stops too
  document.addEventListener('mouseup', e => {
    if (e.button === 0) mainMouse = false;
    if (e.button === 2) subMouse = false;
    if (!mainMouse && !subMouse) mouseHeldOff = false;
  });
  window.addEventListener('blur', () => {
    mainMouse = false;
    subMouse = false;
    mouseHeldOff = false;
    jumpPressed = false;
  });
}

// A mouse press that skipped a cutscene must not start firing when the controls come back: hold its fire until it is let
// go. A press of a key (or a tap) leaves the mouse alone.
export function holdMouseFireUntilRelease(): void {
  if (mainMouse || subMouse) mouseHeldOff = true;
}

export function initKeyboard(options: { jump?: boolean } = {}) {
  if (ready) return;
  ready = true;
  jumpEnabled = options.jump !== false;
  defineActions(ACTION_DEFS);
  initMouse();
}

// Throws away a jump pressed before the pause menu was up: nothing reads it while paused, so without this the mech jumps
// on the first frame after the resume. The touch buttons' jump and use go the same way (clearPendingTouch in touch.ts, called
// with this one).
export function clearPendingJump(): void {
  jumpPressed = false;
}

const actionAxis = (plus: KeyAction, minus: KeyAction): number =>
  (actionDown(plus) ? 1 : 0) - (actionDown(minus) ? 1 : 0);

// This frame's keyboard input. A jump is true for one read only; the turn already has the frame time in.
export function readKeyboard(dt: number): KeyboardRead {
  const input: MechInput = {
    moveX: actionAxis('right', 'left'),
    moveZ: actionAxis('forward', 'back'),
    turn: actionAxis('lookLeft', 'lookRight') * KEY_TUNE.lookRate * dt,
    jump: jumpEnabled && jumpPressed,
    jumpHeld: jumpEnabled && actionDown('jump'),
    boost: actionDown('boost'),
    fire: actionDown('main') || (mainMouse && !mouseHeldOff),
  };
  jumpPressed = false;
  return {
    input,
    lock: lockState(),
    sub: actionDown('sub') || (subMouse && !mouseHeldOff),
    use: actionDown('use'),
    melee: actionDown('melee'),
  };
}
