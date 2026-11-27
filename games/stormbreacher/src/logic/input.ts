// Bringing the touch screen and the keyboard into one MechInput (SB-030 keyboard). Pure, with no three and no DOM, so a
// node test can run it.
import type { GameInput } from './game.ts';
import type { MechInput } from './mech.ts';

// A stick pushed farther than this from its centre steers; below it the keyboard's move keys decide (unitless, 0-1).
// The touch aim uses the same threshold, so a stick too still to move the mech also holds the facing.
export const STICK_MOVE_MIN = 0.05;

// The touch stick wins while it is pushed; otherwise the keyboard moves the mech. The turn adds, and any held action
// from either side is on. No input reads a jump (D-50): the jump's logic stays, but both of its fields are always false.
export function mergeInput(touch: MechInput, keyboard: MechInput): MechInput {
  const stickMoved = Math.hypot(touch.moveX, touch.moveZ) > STICK_MOVE_MIN;
  return {
    moveX: stickMoved ? touch.moveX : keyboard.moveX,
    moveZ: stickMoved ? touch.moveZ : keyboard.moveZ,
    turn: touch.turn + keyboard.turn,
    jump: false,
    jumpHeld: false,
    boost: touch.boost || keyboard.boost,
    fire: touch.fire || keyboard.fire,
  };
}

// The aim the cursor gives: with a ground point the mech turns toward it and its shot flies there; with none (the first
// frame, or the top edge above the horizon) the yaw is held, so the turn keys do not take the aim over.
export function cursorAimInput(at: { x: number; z: number } | null, yaw: number): Pick<GameInput, 'aimAt' | 'face'> {
  return at === null ? { face: yaw } : { aimAt: at };
}
