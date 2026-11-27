// The touch screen's buttons (SB-030): which ones there are, where they start and how fast the view turns. The names
// come from the language files (btn.*), and the player's edits are kept apart in app/storage.ts.

export type TouchButton = 'main' | 'sub' | 'melee' | 'jump' | 'boost' | 'lock' | 'use';

// The order the buttons are listed in the result's JSON.
export const TOUCH_BUTTONS: readonly TouchButton[] = ['main', 'sub', 'melee', 'jump', 'boost', 'lock', 'use'];

export interface TouchPlace {
  x: number; // the button's centre across the screen (0-1)
  y: number; // the button's centre down the screen (0-1)
  s: number; // the size multiplier on b
}

export interface TouchDefault extends TouchPlace {
  b: number; // the button's size at s = 1 (px)
}

// The starting places: the right thumb's buttons, with the main shot the biggest. s is the size multiplier and b is
// the size in px.
export const TOUCH_DEFAULTS: Record<TouchButton, TouchDefault> = {
  main: { x: 0.83, y: 0.56, s: 1.1, b: 84 },
  sub: { x: 0.77, y: 0.82, s: 1, b: 64 },
  melee: { x: 0.73, y: 0.45, s: 1, b: 64 }, // by the main shot: the fist is the fallback when the guns are empty
  jump: { x: 0.87, y: 0.84, s: 1, b: 64 },
  boost: { x: 0.95, y: 0.57, s: 1, b: 64 },
  lock: { x: 0.9, y: 0.34, s: 1, b: 64 },
  use: { x: 0.68, y: 0.68, s: 1, b: 64 },
};

// The touch view's starting values (SB-030). lookX is a multiplier on the engine's look drag (unitless).
export const TOUCH_TUNE = {
  lookX: 1, // horizontal: how far one px of drag turns the view
  // The right drag aims on the top-down view (SB-2180): the point is `aimReach` m from the mech along the drag's screen
  // direction, and a drag no longer than `aimDeadzone` px is ignored. Provisional; only a phone can settle them. Keep
  // aimReach inside FCS_QUARTER.range (45) and outside FCS_QUARTER.nearRange (12).
  aimReach: 20, // m, from the mech's feet along the drag's direction
  aimDeadzone: 16, // px, a shorter drag counts as no touch of the right side
};
