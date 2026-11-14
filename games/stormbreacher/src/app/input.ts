// The play input: the touch screen and the keyboard / mouse read together into one MechInput (SB-030 keyboard). The
// game and the dev views use this instead of either device's reader.
import { el, isTouch } from '@engine/core/index.ts';
import { requestLock } from '@engine/ui/index.ts';
import { mergeInput } from '../logic/input.ts';
import type { MechInput } from '../logic/mech.ts';
import { initKeyboard, readKeyboard } from './keyboard.ts';
import { initTouch, readTouch } from './touch.ts';

export interface PlayRead {
  input: MechInput;
  pitchDelta: number; // the touch drag and the arrow keys added this frame (rad)
  lock: boolean; // the lock display, shared by the touch lock button and the lock key
  sub: boolean; // the touch sub button, the sub key, or the right mouse button
  use: boolean; // the touch use button or the use key
}

let ready = false; // initPlayInput has run (a second call does nothing)

// Starts both readers. On a PC the touch screen stays hidden and a click on the canvas asks for the pointer lock, so
// the mouse can look and shoot.
export function initPlayInput() {
  if (ready) return;
  ready = true;
  initKeyboard();
  initTouch({ show: isTouch });
  if (!isTouch) el('#gl').addEventListener('click', () => requestLock());
}

// This frame's input: both readers are read (each clears what it keeps for one read) and then merged.
export function readInput(dt: number): PlayRead {
  const touch = readTouch();
  const keyboard = readKeyboard(dt);
  return {
    input: mergeInput(touch.input, keyboard.input),
    pitchDelta: touch.pitchDelta + keyboard.pitchDelta,
    lock: keyboard.lock,
    sub: touch.sub || keyboard.sub,
    use: touch.use || keyboard.use,
  };
}
