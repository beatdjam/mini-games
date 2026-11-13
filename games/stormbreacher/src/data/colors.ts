// The colours the field, the map's ground and the sky share, so the same one is not written in two files.
import type { EnemyKind } from './enemies.ts';
import type { MechColor } from './mech.ts';

export const SAND_COLOR = 0xc2a878; // the ground's sand
export const SKY_COLOR = 0x9db8c6; // the sky and the fog
export const SEA_COLOR = 0x4f6f80; // the sea's surface, a little darker than the fog it fades into (仮)

// The HUD's colours, shared by the mock (#view-hud) and the game's sortie. The values come from the mock as they were;
// the shades are 仮 and will be tuned later.
export const HUD_COLOR = {
  text: '#e8eef2', // the text (仮)
  bar: '#54e8ff', // the gauges' fill (仮)
  amber: '#ffcf6a', // the objective's label and the radar's marks (仮)
  warn: '#ff5a4a', // the radar's enemy marks (仮)
  panel: 'rgba(6, 12, 18, 0.6)', // behind a bar and the radar (仮)
  ring: 'rgba(244, 247, 250, 0.55)', // the aim circle (仮)
  dot: '#f4f7fa', // the aim dot (仮)
  lock: '#ff9d3d', // the lock frame round the target the soft FCS pulls toward (仮)
  track: 'rgba(84, 232, 255, 0.2)', // the empty part of an arc (仮)
};

// The enemies on the field (仮): each kind's body, the body of one that is down and the line of an enemy's shot.
export const ENEMY_COLOR: Record<EnemyKind, number> = {
  grunt: 0x8c3b32,
  assault: 0xc94a3d, // a brighter red than a grunt's, so the fast one reads apart at a distance
  heavy: 0x4a5340, // a dark grey-green, far from the grunt's red
};
export const ENEMY_DOWN_COLOR = 0x2a2522;
export const ENEMY_BULLET_COLOR = 0xff6a4a;

// The hazards on the field (仮): the ring of a coming shell from the moment it is warned to the moment it lands, and a
// mine's disc.
export const SHELL_WARN_COLOR = 0x5a1a14;
export const SHELL_LAND_COLOR = 0xff3a22;
export const MINE_COLOR = 0x3a3d2e;

// The boss (SB-200, 仮): the armour plate before the magazine, the flash of a main gun firing at the sea and the line of
// its shot.
export const SHUTTER_COLOR = 0x5b6168;
export const SEA_FLASH_COLOR = 0xfff1b0;
export const SEA_TRACER_COLOR = 0xffb347;

// The light at a pillbox's muzzle while it warns of a burst (仮).
export const PILLBOX_WARN_COLOR = 0xffd890;

// The blast points on the hedgehog lines and the charges planted on them (SB-1500, 仮): the ring the player stands in,
// and the box that blinks as its fuse burns.
export const BLAST_POINT_COLOR = 0xffb347;
export const CHARGE_COLOR = 0xffe066;

// The sparks of a shot a pillbox's front turns away (仮). A little warmer than SEA_FLASH_COLOR, so the two do not read
// as the same flash.
export const PILLBOX_DEFLECT_COLOR = 0xffe080;

// The allied mech of the script (SB-170, 仮): the colours it wears running and the dark ones of its wreck, one hex per
// colour name of the mech's look.
export const ALLY_PALETTE: Record<MechColor, number> = {
  armor: 0x5c6f7a,
  frame: 0x363b3e,
  accent: 0xd8d2b8,
  sensor: 0x4ab6d8,
  weapon: 0x8c9296,
};
export const ALLY_WRECK_PALETTE: Record<MechColor, number> = {
  armor: 0x2e3234,
  frame: 0x1e2022,
  accent: 0x35332c,
  sensor: 0x1e2022,
  weapon: 0x2a2c2d,
};
// The mech's boost flame (SB-130, 仮): a small bright box behind the back part.
export const MECH_FLAME_COLOR = 0xffd27a;

// An explosion (SB-1340, 仮): the flash of each kind, the smoke that turns from black to grey, the debris, and the sand
// or water a blast lifts from the ground or the sea.
export const BOOM_COLOR = {
  fire: 0xff6d21, // a small blast's flash
  fireLarge: 0xff8f31, // a target's, a mine's or a mortar shell's
  fireCraft: 0xffa646, // a landing craft's
  fireWater: 0x8fd2e6, // a shell falling into the sea
  smoke: 0x191715, // a fresh puff of the column
  smokeFade: 0x6d6a66, // a puff just before it goes
  debris: 0x584635, // the pieces of earth and metal thrown out
  sand: 0xb39262, // the sand a blast lifts from the beach
  water: 0x84bccb, // the water a shell lifts from the sea
  spray: 0xd9edf0, // the drops thrown with it
};

// The briefing's map (SB-310, 仮): the land, the sea, the three kinds of ground props and the marks. The marks that stand
// for a side take the HUD's colours (the radar's enemy and the bars' cyan).
export const BRIEFING_COLOR = {
  land: '#6f6a54', // the sand seen from above
  sea: '#27404f', // the sea
  hedgehog: '#9a9680', // a hedgehog's dot
  wall: '#d8d2b8', // a seawall piece's dot
  cliff: '#4a4538', // a cliff's dot
  enemy: HUD_COLOR.warn, // the battery, the pillboxes, the soldiers
  depot: HUD_COLOR.amber, // the depot
  wave1: HUD_COLOR.bar, // the first wave's arrow
  wave2: '#7fb4d6', // the second wave's arrow, paler than the first
};
