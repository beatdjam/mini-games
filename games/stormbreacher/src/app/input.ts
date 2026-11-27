// The play input: the touch screen and the keyboard / mouse read together into one MechInput (SB-030 keyboard). The
// game and the dev views use this instead of either device's reader.
import { el, isTouch } from '@engine/core/index.ts';
import { cursorAimInput, mergeInput } from '../logic/input.ts';
import type { MechInput } from '../logic/mech.ts';
import { holdMouseFireUntilRelease, initKeyboard, readKeyboard } from './keyboard.ts';
import { initTouch, readTouch } from './touch.ts';

export { cursorAimInput, holdMouseFireUntilRelease };

export interface PlayRead {
  input: MechInput;
  lock: boolean; // the lock display, shared by the touch lock button and the lock key
  sub: boolean; // the touch sub button, the sub key, or the right mouse button
  use: boolean; // the touch use button or the use key
  melee: boolean; // the touch melee button or the melee key
  cursor: { x: number; y: number } | null; // the cursor on the canvas in normalized coordinates (-1 to 1, + up); null until it moves
  drag: { x: number; y: number } | null; // the right touch finger's move from where it went down (px); null without a touch drag
}

let ready = false; // initPlayInput has run (a second call does nothing)
let cursorAt: { x: number; y: number } | null = null; // the cursor's last place on the canvas, normalized; null until it moves

// Starts both readers. On a PC the touch screen stays hidden and the cursor stays on the screen: a mousemove gives the
// canvas's normalized point, even over a button above it.
export function initPlayInput() {
  if (ready) return;
  ready = true;
  initKeyboard();
  initTouch({ show: isTouch });
  const canvas = el('#gl');
  if (isTouch) return;
  // The window, not the canvas: the pause and fullscreen buttons take the events, and the point must keep following there.
  window.addEventListener('mousemove', event => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    cursorAt = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    };
  });
}

// This frame's input: both readers are read (each clears what it keeps for one read) and then merged.
export function readInput(dt: number): PlayRead {
  const touch = readTouch();
  const keyboard = readKeyboard(dt);
  const merged = mergeInput(touch.input, keyboard.input);
  return {
    input: merged,
    lock: keyboard.lock,
    sub: touch.sub || keyboard.sub,
    use: touch.use || keyboard.use,
    melee: touch.melee || keyboard.melee,
    cursor: cursorAt,
    drag: isTouch ? touch.drag : null,
  };
}
