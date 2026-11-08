// Bringing the touch screen and the keyboard into one MechInput (SB-030 keyboard). Pure, with no three and no DOM, so a
// node test can run it.
import type { MechInput } from './mech.ts';

// A stick pushed farther than this from its centre steers; below it the keyboard's move keys decide (unitless, 0-1).
const STICK_MOVE_MIN = 0.05;

// The touch stick wins while it is pushed; otherwise the keyboard moves the mech. The turn adds, and any held action
// from either side is on.
export function mergeInput(touch: MechInput, keyboard: MechInput): MechInput {
  const stickMoved = Math.hypot(touch.moveX, touch.moveZ) > STICK_MOVE_MIN;
  return {
    moveX: stickMoved ? touch.moveX : keyboard.moveX,
    moveZ: stickMoved ? touch.moveZ : keyboard.moveZ,
    turn: touch.turn + keyboard.turn,
    jump: touch.jump || keyboard.jump,
    jumpHeld: touch.jumpHeld || keyboard.jumpHeld,
    boost: touch.boost || keyboard.boost,
    fire: touch.fire || keyboard.fire,
  };
}
