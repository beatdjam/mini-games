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

// A cutscene takes no skip this soon after it starts: the jump, shot or Enter that starts one (wave2-sinks, beach-held)
// comes in the same frame, and must not pass the cutscene over before it is drawn. Presses before this are thrown away.
export const CUTSCENE_SKIP_GUARD_SEC = 0.4;

// The objectives that show a count on the HUD: the objective's id and the ids of the targets it counts. The HUD writes
// "done/total" for these; an objective that is not here shows no count. A target the map does not have is not counted.
export const OBJECTIVE_COUNT: Record<string, readonly string[]> = {
  'break-pillboxes': ['pillbox-1', 'pillbox-2'],
  'silence-battery': ['main-gun-1', 'main-gun-2'],
};
