// The hazards of the sortie (SB-190): the barrages that fall from the background, and the mines on the beach. Every value
// here is provisional. Adding a barrage kind is a line in BARRAGES (and in BARRAGE_KINDS).
export type BarrageKind = 'mortar' | 'battery';

export const BARRAGE_KINDS: readonly BarrageKind[] = ['mortar', 'battery'];

export interface BarrageDef {
  interval: number; // the seconds between one shell's warning and the next, counted while the mech is in reach
  warn: number; // the seconds from the warning to the landing
  radius: number; // the blast's radius on the ground (m)
  damage: number; // what a shell that lands on the mech takes off its armour
  aimJitter: number; // the shell is aimed at the mech's place moved by 0 to this far, in a random direction (m)
  minZ: number; // the barrage reaches only the mech at or past this z (m); +z is the sea; -Infinity for no limit
  maxZ: number; // and at or before this z (m); Infinity for no limit
  slow?: BarrageSlow; // set for a barrage a flag of the script slows
}

// A barrage that comes slower while the script's flag is up.
export interface BarrageSlow {
  flag: string; // the script's flag
  mul: number; // the interval is this many times as long while the flag is up
}

export const BARRAGES: Record<BarrageKind, BarrageDef> = {
  mortar: { interval: 4, warn: 2.5, radius: 7, damage: 25, aimJitter: 12, minZ: 30, maxZ: Infinity },
  // the battery's secondary guns (SB-200): they reach the seawall's top and the ground behind it; the depot's ammunition
  // being gone, they fire less often
  battery: {
    interval: 3,
    warn: 2,
    radius: 6,
    damage: 30,
    aimJitter: 8,
    minZ: -Infinity,
    maxZ: -65,
    slow: { flag: 'depot-down', mul: 1.5 },
  },
};

// The barrage a wave starts, by the wave's name in the mission's script. The mortar emplacements cannot be destroyed, so
// a barrage never stops once it starts (the battery's goes on after its main guns fall; the magazine ends the sortie).
// A wave that is not here starts none.
export const M1_WAVE_BARRAGE: Readonly<Partial<Record<string, BarrageKind>>> = {
  'beach-mortar': 'mortar',
  battery: 'battery',
};

// The aimed mortar: when the mech stands in the same place for `stillSec`, a shell comes down on that place, cover or no
// cover. Every value is provisional.
export const AIMED_MORTAR = {
  stillSec: 5, // the seconds at the same place before a shell is warned of
  stillRadius: 3, // the mech counts as in the same place while its feet stay this near the anchor (m)
  warn: 2.5, // the seconds from the warning to the landing
  radius: 6, // the blast's radius on the ground (m)
  damage: 20, // what a shell that lands on the mech takes off its armour
  minZ: -10, // the mortar reaches only the mech at or past this z (m); +z is the sea; just short of the pillboxes
  maxZ: Infinity, // and at or before this z (m); Infinity for no limit
};

// The waves that start the aimed mortar, by the wave's name in the mission's script. The beach's `spawn` starts it; it
// goes on until the sortie ends.
export const M1_WAVE_AIMED: readonly string[] = ['beach-mortar'];

// The mines on the beach.
export const MINE_TUNE = {
  stepRadius: 1.8, // the mech's feet this near a mine set it off (m)
  blastRadius: 4, // a blast takes armour off a mech this near (m)
  damage: 30, // what a blast takes off the mech's armour
  hp: 10, // the health a mine has against the mech's shots
  size: { w: 1, h: 0.3, d: 1 }, // the box a shot may hit (m)
};
