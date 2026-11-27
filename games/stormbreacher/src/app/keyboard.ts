// Keyboard and mouse input for the mech (SB-030 keyboard): the engine's key actions and mouse look become the same
// MechInput that the touch screen fills. The right mouse button on the canvas is the sub shot.
import { el, isTouch } from '@engine/core/index.ts';
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

let lockOn = false;
let mainMouse = false; // the left mouse button is down on the canvas
let subMouse = false; // the right mouse button is down on the canvas
let mouseHeldOff = false; // a press that skipped a cutscene is not fire until it is let go (ticket 2137)
let ready = false; // initKeyboard has run (a second call does nothing)

export const lockState = (): boolean => lockOn;

export function toggleLock() {
  lockOn = !lockOn;
}

// The engine calls INPUT.key on every keydown, after keys[] is updated. Only the instant matters here: the lock toggle
// happens once per press, not on the repeats of a held key.
export function handleKey(e: KeyboardEvent) {
  if (e.repeat) return;
  if (actionOf(e.code) === 'lock') toggleLock();
}

function initMouse() {
  // a touch screen has its own buttons: the mouse events a tap on the canvas leaves behind must not shoot
  if (!isTouch) {
    const canvas = el('#gl');
    // the left button is the main shot and the right the sub, both with the cursor on the screen
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) mainMouse = true;
      else if (e.button === 2) subMouse = true;
    });
    // the right button's menu would cover the game
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
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
  });
}

// A mouse press that skipped a cutscene must not start firing when the controls come back: hold its fire until it is let
// go. A press of a key (or a tap) leaves the mouse alone.
export function holdMouseFireUntilRelease(): void {
  if (mainMouse || subMouse) mouseHeldOff = true;
}

export function initKeyboard() {
  if (ready) return;
  ready = true;
  defineActions(ACTION_DEFS);
  initMouse();
}

const actionAxis = (plus: KeyAction, minus: KeyAction): number =>
  (actionDown(plus) ? 1 : 0) - (actionDown(minus) ? 1 : 0);

// This frame's keyboard input. The turn already has the frame time in. No input reads a jump (D-50).
export function readKeyboard(dt: number): KeyboardRead {
  const input: MechInput = {
    moveX: actionAxis('right', 'left'),
    moveZ: actionAxis('forward', 'back'),
    turn: actionAxis('lookLeft', 'lookRight') * KEY_TUNE.lookRate * dt,
    jump: false,
    jumpHeld: false,
    boost: actionDown('boost'),
    fire: actionDown('main') || (mainMouse && !mouseHeldOff),
  };
  return {
    input,
    lock: lockState(),
    sub: actionDown('sub') || (subMouse && !mouseHeldOff),
    use: actionDown('use'),
    melee: actionDown('melee'),
  };
}
