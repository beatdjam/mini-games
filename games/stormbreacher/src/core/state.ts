import type { GameState } from '../data/types.ts';
import { STATES } from '../data/states.ts';

// The screen the game is in. Written only through setState (read: isPlaying, loopMode).
export let state: GameState = 'title';

export function setState(s: GameState) {
  state = s;
}

// Whether the game is being played: the state's definition says so, not a test against a state's name.
export const isPlaying = (): boolean => STATES[state].playing;

// The mode for the engine's loop (LOOP.mode): the loop asks which systems run.
export const loopMode = (): string => state;
