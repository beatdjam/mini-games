// Level dimensions in metres (a tile is T = 4 wide, engine/world/tiles.js): wall height, the player's eye height,
// raised platform height, and the height of waist-high cover (bullets fly over it, you can't climb it)
export const WALL_H = 6, EYE = 1.6, PLAT_H = 2, COVER_H = 1.2;
// gates (exit / forward / extract): a gate works only once it is armed, armTime seconds after it appears and after
// the player has been at least clearR away from it once, so a gate that opens underfoot (a boss dying next to the
// player) doesn't warp them before they notice it or pick up the drops. enterR: how close counts as walking in
// centerY: height of the gate's centre above the floor; the player's body centre must be within reachY of it to step in
export const PORTAL = { armTime: 1.0, enterR: 1.5, clearR: 2.2, centerY: 1.7, reachY: 1.6 };
