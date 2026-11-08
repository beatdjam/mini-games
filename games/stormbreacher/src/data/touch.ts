// The touch screen's buttons (SB-030): which ones there are, where they start and how fast the view turns. The names
// come from the language files (btn.*), and the player's edits are kept apart in app/storage.ts.

export type TouchButton = 'main' | 'sub' | 'jump' | 'boost' | 'lock';

// The order the buttons are listed in the result's JSON.
export const TOUCH_BUTTONS: readonly TouchButton[] = ['main', 'sub', 'jump', 'boost', 'lock'];

export interface TouchPlace {
  x: number; // the button's centre across the screen (0-1)
  y: number; // the button's centre down the screen (0-1)
  s: number; // the size multiplier on b
}

export interface TouchDefault extends TouchPlace {
  b: number; // the button's size at s = 1 (px)
}

// The starting places: a fan of the right thumb, with the main shot the biggest. s is 1 and b is the size in px.
export const TOUCH_DEFAULTS: Record<TouchButton, TouchDefault> = {
  main: { x: 0.86, y: 0.72, s: 1, b: 84 },
  sub: { x: 0.72, y: 0.84, s: 1, b: 64 },
  jump: { x: 0.93, y: 0.48, s: 1, b: 64 },
  boost: { x: 0.75, y: 0.58, s: 1, b: 64 },
  lock: { x: 0.62, y: 0.66, s: 1, b: 64 },
};

// The touch view's starting values (SB-030). Both are multipliers on the engine's look drag (unitless).
export const TOUCH_TUNE = {
  lookX: 1, // horizontal: how far one px of drag turns the view
  lookY: 1, // vertical: how far one px of drag changes the pitch
};
