// The play input: the touch screen and the keyboard / mouse read together into one MechInput (SB-030 keyboard). The
// game and the dev views use this instead of either device's reader.
import { el, isTouch } from '@engine/core/index.ts';
import { cursorAimInput, jumpReading, mergeInput, withoutJump } from '../logic/input.ts';
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

export interface PlayInputOptions {
  jump?: boolean; // false on the main body and the arena: they take no jump (D-50)
}

let ready = false; // initPlayInput has run (a second call does nothing)
let jumpMode = true; // the main body and the arena take no jump (D-50); the dev views keep it
let cursorAt: { x: number; y: number } | null = null; // the cursor's last place on the canvas, normalized; null until it moves

// Starts both readers. On a PC the touch screen stays hidden and the cursor stays on the screen: a mousemove gives the
// canvas's normalized point, even over a button above it. With `jump` false, neither reader makes a jump: the main body
// and the arena take none (D-50).
export function initPlayInput(options: PlayInputOptions = {}) {
  if (ready) return;
  ready = true;
  jumpMode = jumpReading(options);
  initKeyboard({ jump: jumpMode });
  initTouch({ show: isTouch, jump: jumpMode });
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
    input: jumpMode ? merged : withoutJump(merged),
    lock: keyboard.lock,
    sub: touch.sub || keyboard.sub,
    use: touch.use || keyboard.use,
    melee: touch.melee || keyboard.melee,
    cursor: cursorAt,
    drag: isTouch ? touch.drag : null,
  };
}
