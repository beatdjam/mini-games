// The pillboxes of M1's B line: the machine gun each one fires at the mech, and the armour its front turns shots with.
// Every value here is provisional. The state and the one-frame step are in logic/pillbox.ts; the bullets they fire are
// flown by logic/game.ts.

export const PILLBOX_TUNE = {
  range: 110, // the mech this near the pillbox's middle, on the ground (m), is in reach; also the bullet's range
  firstWait: 0.8, // the seconds from the moment a pillbox first sees the mech to its first warning
  warn: 0.8, // the seconds a warning lasts before the first shot
  burst: 3, // the shots in one attack
  shotInterval: 0.2, // the seconds between one shot of a burst and the next
  interval: 3.2, // the seconds from the end of a burst to the next warning
  damage: 4, // what one shot takes off the mech's armour
  bulletSpeed: 180, // m/s
  spread: 3, // the shot's drift from its aim (deg)
  muzzle: 0.5, // the height a shot leaves at, as a share of the pillbox's height
  muzzleGap: 0.5, // how far past the pillbox's box a shot starts (m)
};

// A pillbox's armour (仮): its front shrugs off shots, its sides and back take them whole. The angle is measured on the
// ground from the direction the shot came from, so a shot from within `frontArc` of the front is a front hit.
export const PILLBOX_ARMOR = {
  frontMul: 0.25, // the share of a front shot's damage
  sideMul: 1, // the share of a side or back shot's damage
  frontArc: 45, // deg; half the arc that counts as the front
};
