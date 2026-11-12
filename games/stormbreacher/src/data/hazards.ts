// The hazards of the sortie (SB-190): the barrages that fall from the background, and the mines on the beach. Every value
// here is provisional. Adding a barrage kind is a line in BARRAGES (and in BARRAGE_KINDS).
export type BarrageKind = 'mortar';

export const BARRAGE_KINDS: readonly BarrageKind[] = ['mortar'];

export interface BarrageDef {
  interval: number; // the seconds between one shell's warning and the next, counted while the mech is in reach
  warn: number; // the seconds from the warning to the landing
  radius: number; // the blast's radius on the ground (m)
  damage: number; // what a shell that lands on the mech takes off its armour
  aimJitter: number; // the shell is aimed at the mech's place moved by 0 to this far, in a random direction (m)
  minZ: number; // the barrage reaches only the mech at or past this z (m); +z is the sea
}

export const BARRAGES: Record<BarrageKind, BarrageDef> = {
  mortar: { interval: 4, warn: 2.5, radius: 7, damage: 25, aimJitter: 12, minZ: 30 },
};

// The barrage a wave starts, by the wave's name in the mission's script. The mortar emplacements cannot be destroyed, so
// a barrage never stops once it starts. A wave that is not here starts none.
export const M1_WAVE_BARRAGE: Readonly<Partial<Record<string, BarrageKind>>> = {
  'beach-mortar': 'mortar',
};

// The mines on the beach.
export const MINE_TUNE = {
  stepRadius: 1.8, // the mech's feet this near a mine set it off (m)
  blastRadius: 4, // a blast takes armour off a mech this near (m)
  damage: 30, // what a blast takes off the mech's armour
  hp: 10, // the health a mine has against the mech's shots
  size: { w: 1, h: 0.3, d: 1 }, // the box a shot may hit (m)
};
