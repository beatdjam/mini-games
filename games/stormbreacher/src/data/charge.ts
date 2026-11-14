// The charge planted on a defence line (SB-1500). The values are 仮 and are settled at #view-breach by playing them. The
// lengths are in seconds and the distances in metres; holeHalfWidth and holeHalfDepth are for the hole a blast opens
// (SB-1500's next card) and are shown in this card's panel already.
export const CHARGE_TUNE = {
  holdSec: 1.5, // how long the player holds use to plant the charge (s)
  reach: 5, // how near the mech's centre must be to a blast point (m)
  fuse: 3, // from planting to the blast (s)
  blastRadius: 9, // the mech inside this of the blast takes damage (m)
  damage: 60, // the armour the blast takes (仮)
  holeHalfWidth: 4, // the hole's half width from the point's x (m)
  holeHalfDepth: 10, // the hole's half depth from the line's centre z (m)
};
