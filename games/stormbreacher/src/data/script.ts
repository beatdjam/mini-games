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

// The objectives that show a count on the HUD: the objective's id and the ids of the targets it counts. The HUD writes
// "done/total" for these; an objective that is not here shows no count. A target the map does not have is not counted.
export const OBJECTIVE_COUNT: Record<string, readonly string[]> = {
  'break-pillboxes': ['pillbox-1', 'pillbox-2'],
  'silence-battery': ['main-gun-1', 'main-gun-2'],
};
