// Keyboard and mouse input for the mech (SB-030 keyboard): the engine's key actions and mouse look become the same
// MechInput that the touch screen fills. The right mouse button is the sub shot while the pointer is locked, or on the
// canvas with the free cursor the main body and the arena use.
import { el } from '@engine/core/index.ts';
import { actionDown, actionOf, defineActions, locked, mouseFire } from '@engine/ui/index.ts';
import { KEY_DEFAULTS, KEY_TUNE, type KeyAction } from '../data/keys.ts';
import type { MechInput } from '../logic/mech.ts';

export interface KeyboardRead {
  input: MechInput;
  lock: boolean; // the lock display, shared with the touch screen's lock button
  sub: boolean; // the sub shot: its key, or the right mouse button (while locked, or on the canvas with the free cursor)
  use: boolean; // the use key (planting a charge)
  melee: boolean; // the fist's key
}

// The action table defineActions takes, built from the defaults (the object's keys are the action ids).
const ACTION_DEFS = Object.entries(KEY_DEFAULTS).map(([id, keys]) => ({ id, keys }));

// A key went down since the last read; a held key repeats keydown but that is not a new press.
let jumpPressed = false;
let jumpEnabled = true; // the main body and the arena take no jump (D-50); the dev views keep it
let lockOn = false;
let mainMouse = false; // the left mouse button is down on the canvas with the free cursor
let subMouse = false; // the right mouse button is down (while the pointer is locked, or on the canvas with the free cursor)
let mouseHeldOff = false; // a press that skipped a cutscene is not fire until it is let go (ticket 2137)
let cursorMode = false; // the free cursor is in use, so the canvas's buttons are read without the pointer lock
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
  if (cursorMode) {
    const canvas = el('#gl');
    // the free cursor: the left button is the main shot and the right the sub, both without the pointer lock
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) mainMouse = true;
      else if (e.button === 2) subMouse = true;
    });
    // the right button's menu would cover the game
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  } else {
    document.addEventListener('mousedown', e => {
      if (e.button === 2 && locked) subMouse = true;
    });
  }
  // let go at the document, so a button released off the canvas stops too
  document.addEventListener('mouseup', e => {
    if (e.button === 0) mainMouse = false;
    if (e.button === 2) subMouse = false;
    if (!mainMouse && !subMouse) mouseHeldOff = false;
  });
  // A lock lost while the button is held would leave the shot on for the next lock.
  document.addEventListener('pointerlockchange', () => {
    if (!locked) subMouse = false;
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

export function initKeyboard(options: { cursor?: boolean; jump?: boolean } = {}) {
  if (ready) return;
  ready = true;
  cursorMode = options.cursor === true;
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
    fire: actionDown('main') || mouseFire || (mainMouse && !mouseHeldOff),
  };
  jumpPressed = false;
  return {
    input,
    lock: lockState(),
    sub: actionDown('sub') || (cursorMode ? subMouse && !mouseHeldOff : locked && subMouse),
    use: actionDown('use'),
    melee: actionDown('melee'),
  };
}
