// The HUD's four placements (SB-2150, D in SB-2155). A is the D plan the game has used: the aim circle in the middle
// with the armour and boost arcs round it and the ammo under it. B puts what the eye needs on the cursor and the gauges
// at the mech's feet. C puts the gauges and the ammo in a row along the bottom edge. D keeps B's other parts but moves
// the ammo to a ring round the cursor and puts the armour and boost on a ring on the ground under the mech. The game's
// default stays A; which one to keep is settled by playing, so the arena offers all four.

export type HudLayout = 'a' | 'b' | 'c' | 'd';

// The layouts in the order the arena's buttons show them.
export const HUD_LAYOUTS: readonly HudLayout[] = ['a', 'b', 'c', 'd'];

export const DEFAULT_HUD_LAYOUT: HudLayout = 'a';

// The layout a search string asks for (?hud=a|b|c|d; a capital letter is the same letter). Anything else, and no value,
// is the default.
export function hudLayoutFrom(search: string): HudLayout {
  const raw = new URLSearchParams(search).get('hud')?.toLowerCase();
  return raw === 'a' || raw === 'b' || raw === 'c' || raw === 'd' ? raw : DEFAULT_HUD_LAYOUT;
}
