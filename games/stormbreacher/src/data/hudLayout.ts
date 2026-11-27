// The HUD's six placements (SB-2150; D in SB-2155; E and F in SB-2159). A is the D plan the game has used: the aim circle
// in the middle with the armour and boost arcs round it and the ammo under it. B puts what the eye needs on the cursor and
// the gauges at the mech's feet. C puts the gauges and the ammo in a row along the bottom edge. D, E and F keep B's other
// parts but put the gauges at the cursor: D has the armour and boost as arcs at its sides, the main ammo as a bar over it
// and the sub ammo as cells under it; E has the ammo as the arcs and the armour and boost as the bars; F has D's arcs but
// both ammo bars under the mark. The game's default stays A; which one to keep is settled by playing, so the arena offers
// all six.

export type HudLayout = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';

// The layouts in the order the arena's buttons show them.
export const HUD_LAYOUTS: readonly HudLayout[] = ['a', 'b', 'c', 'd', 'e', 'f'];

export const DEFAULT_HUD_LAYOUT: HudLayout = 'a';

// The layout a search string asks for (?hud=a|b|c|d|e|f; a capital letter is the same letter). Anything else, and no
// value, is the default.
export function hudLayoutFrom(search: string): HudLayout {
  const raw = new URLSearchParams(search).get('hud')?.toLowerCase();
  return raw === 'a' || raw === 'b' || raw === 'c' || raw === 'd' || raw === 'e' || raw === 'f'
    ? raw
    : DEFAULT_HUD_LAYOUT;
}
