// The light that marks a blast point on screen (SB-2022). All values are 仮 and are settled at #view-breach by playing.
// Lengths are in metres. The first set is what SB-2017 drew (for comparison); these are about half of it.
import { CHARGE_TUNE } from './charge.ts';

// How the lights show. `dim`: the dim light at every point that may show one. `map`: no light on screen, only the
// small map's marks. `next`: one light, at the next point to go to. Every mode shows nothing before a pillbox has been
// shot once, and nothing during a cutscene; the ring on the ground is left as it was.
export const MARKER_MODES = ['dim', 'map', 'next'] as const;
export type MarkerMode = (typeof MARKER_MODES)[number];

export const MARKER_TUNE = {
  mode: 2, // index into MARKER_MODES; `next` by default (仮). The URL `?marker=dim|map|next` sets it
  pillarHeight: 3.5, // m (SB-2017: 7)
  pillarBaseRadius: 0.22, // m at its foot; its top is half of that (SB-2017: 0.45)
  diamondSize: 0.8, // m, from its middle to a point (SB-2017: 1.5)
  diamondLift: 6, // m, its middle above the ground (SB-2017: 10)
  brightness: 0.55, // the share of the point's colour the light is drawn at (SB-2017: 1)
  fadeStart: 15, // the mech this near a point starts to thin its light (m); it shrinks away
  // the mech this near a point has its light out; the use prompt's reach, so the ring and the prompt take over
  fadeEnd: CHARGE_TUNE.reach,
};

// The mode now in force.
export function markerMode(): MarkerMode {
  const index = Math.min(MARKER_MODES.length - 1, Math.max(0, Math.round(MARKER_TUNE.mode)));
  return MARKER_MODES[index];
}

// The mode a query string (`?marker=map`) names, or null when it names none.
export function markerModeOfQuery(search: string): MarkerMode | null {
  const value = new URLSearchParams(search).get('marker');
  return MARKER_MODES.find(mode => mode === value) ?? null;
}

// Puts the query's mode into force; a query without one leaves the mode as it is.
export function applyMarkerQuery(search: string): void {
  const mode = markerModeOfQuery(search);
  if (mode !== null) MARKER_TUNE.mode = MARKER_MODES.indexOf(mode);
}
