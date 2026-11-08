// The lengths the mission script needs (SB-050). The cutscene table is a starting point: the staging ticket (SB-045)
// may change the seconds. RADIO_MIN_SEC is the screen's rule, not the script's: one radio line stays up at least this
// long, and lines that arrive together wait their turn.
import type { CutsceneId } from './types.ts';

export const CUTSCENE_SEC: Record<CutsceneId, number> = {
  landing: 10,
  'wave2-sinks': 6,
  'beach-held': 8,
};

export const RADIO_MIN_SEC = 3; // seconds one radio line stays on screen
