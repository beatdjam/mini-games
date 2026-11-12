import type { GameState, StateDef } from './types.ts';

// One definition per state. The Record makes TypeScript name any state left out of the table.
export const STATES: Record<GameState, StateDef> = {
  title: { playing: false },
  briefing: { playing: false },
  play: { playing: true },
  paused: { playing: false },
  result: { playing: false },
};
