// The colours the field, the map's ground and the sky share, so the same one is not written in two files.
import type { EnemyKind } from './enemies.ts';

export const SAND_COLOR = 0xc2a878; // the ground's sand
export const SKY_COLOR = 0x9db8c6; // the sky and the fog

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
  track: 'rgba(84, 232, 255, 0.2)', // the empty part of an arc (仮)
};

// The enemies on the field (仮): each kind's body, the body of one that is down and the line of an enemy's shot.
export const ENEMY_COLOR: Record<EnemyKind, number> = {
  grunt: 0x8c3b32,
};
export const ENEMY_DOWN_COLOR = 0x2a2522;
export const ENEMY_BULLET_COLOR = 0xff6a4a;

// The hazards on the field (仮): the ring of a coming shell from the moment it is warned to the moment it lands, and a
// mine's disc.
export const SHELL_WARN_COLOR = 0x5a1a14;
export const SHELL_LAND_COLOR = 0xff3a22;
export const MINE_COLOR = 0x3a3d2e;
