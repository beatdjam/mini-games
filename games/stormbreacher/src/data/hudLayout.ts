// The HUD's three placements (SB-2150). A is the D plan the game has used: the aim circle in the middle with the armour
// and boost arcs round it and the ammo under it. B puts what the eye needs on the cursor and the gauges at the mech's
// feet. C puts the gauges and the ammo in a row along the bottom edge. The game's default stays A; which one to keep is
// settled by playing, so the arena offers all three.

export type HudLayout = 'a' | 'b' | 'c';

// The layouts in the order the arena's buttons show them.
export const HUD_LAYOUTS: readonly HudLayout[] = ['a', 'b', 'c'];

export const DEFAULT_HUD_LAYOUT: HudLayout = 'a';

// The layout a search string asks for (?hud=a|b|c; a capital letter is the same letter). Anything else, and no value,
// is the default.
export function hudLayoutFrom(search: string): HudLayout {
  const raw = new URLSearchParams(search).get('hud')?.toLowerCase();
  return raw === 'a' || raw === 'b' || raw === 'c' ? raw : DEFAULT_HUD_LAYOUT;
}
