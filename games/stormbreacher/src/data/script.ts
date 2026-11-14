// The lengths the mission script needs (SB-050). The cutscene table is a starting point: the staging ticket (SB-045)
// may change the seconds. RADIO_TUNE is the screen's rule, not the script's: one radio line stays up at least this
// long, and lines that arrive together wait their turn.
import type { CutsceneId } from './types.ts';

export const CUTSCENE_SEC: Record<CutsceneId, number> = {
  landing: 12,
  'wave2-sinks': 6,
  'beach-held': 8,
};

export const RADIO_TUNE = {
  minSec: 3, // how long one radio line stays on screen (s)
  maxPending: 8, // the most lines that may wait behind the one on screen
};

// The short order near the aim (SB-2028). A radio line that asks the player to act carries a `callout` key; while that
// line is up (and for `sec` s at most) the HUD writes the order above the aim circle, where the eyes are in a fight. The
// radio band keeps the full line. A shell warning takes the place: while one shows, no callout does. The place and the
// size are CALLOUT_LAYOUT in view/hud.ts (provisional).
export const CALLOUT_TUNE = {
  sec: 2.5, // how long the order stays up from the moment its radio line comes up (s); under RADIO_TUNE.minSec
};

// A cutscene takes no skip this soon after it starts: the jump, shot or Enter that starts one (wave2-sinks, beach-held)
// comes in the same frame, and must not pass the cutscene over before it is drawn. Presses before this are thrown away.
export const CUTSCENE_SKIP_GUARD_SEC = 0.4;

// The objectives that show a count on the HUD: the objective's id and the ids of the targets it counts. The HUD writes
// "done/total" for these; an objective that is not here shows no count. A target the map does not have is not counted.
export const OBJECTIVE_COUNT: Record<string, readonly string[]> = {
  'break-pillboxes': ['pillbox-1', 'pillbox-2'],
  'stop-fortress-gun': ['fortress-gun'],
  'silence-battery': ['main-gun-1', 'main-gun-2'],
};
