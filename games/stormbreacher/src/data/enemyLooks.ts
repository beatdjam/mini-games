// The enemies' shapes (SB-1480): the boxes each kind is built from, so the role reads at a distance from the silhouette
// alone. The body colour is the enemy side's own (data/colors.ts), and a mark and a weapon give the small differences
// between the roles. Every value here is provisional.
import type { SoldierKind } from './enemies.ts';

export type EnemyPartColor = 'body' | 'mark' | 'gun';

export interface EnemyBox {
  // x and z as shares of the hit radius (a grunt's 0.75m), y as a share of the height, so the shape follows the size the
  // game hits without another table to keep in step
  size: [number, number, number];
  at: [number, number, number]; // the box's centre, in the same shares
  color: EnemyPartColor;
  rotX?: number; // radians about the box's own centre
  rotZ?: number;
  mirror?: 'x'; // the same box again on the other side of the middle line
}

export interface EnemyLookTune {
  width: number; // multiplies every box's x: the silhouette's width
  lean: number; // tips the upper body forward (rad) about the hip; negative leans toward the front (-z)
  reach: number; // multiplies how far a gun's box reaches
  hip: number; // the height the body turns about, as a share of the height; boxes above it lean
}

// The knobs the dev view puts on its panel. The shapes below are read with these, so a change shows on the next build.
export const ENEMY_LOOK_TUNE: Record<SoldierKind, EnemyLookTune> = {
  grunt: { width: 1, lean: 0, reach: 1, hip: 0.46 },
  assault: { width: 1, lean: -0.22, reach: 1, hip: 0.42 },
  heavy: { width: 1, lean: 0, reach: 1, hip: 0.47 },
};

export const ENEMY_LOOKS: Record<SoldierKind, readonly EnemyBox[]> = {
  // the rifle: upright, wide shoulders and one long barrel forward, so a distant shape is a standing figure with a line
  // reaching out of it
  grunt: [
    { size: [0.5, 0.46, 0.5], at: [0.46, 0.23, 0], color: 'body', mirror: 'x' }, // leg
    { size: [0.58, 0.1, 0.78], at: [0.46, 0.05, -0.06], color: 'gun', mirror: 'x' }, // boot
    { size: [1.15, 0.16, 0.6], at: [0, 0.49, 0], color: 'body' }, // hips
    { size: [1.3, 0.34, 0.78], at: [0, 0.68, 0], color: 'body' }, // torso
    { size: [0.38, 0.12, 0.08], at: [0, 0.7, -0.42], color: 'mark' }, // chest plate
    { size: [0.55, 0.14, 0.66], at: [0.78, 0.82, 0], color: 'mark', mirror: 'x' }, // shoulder mark
    { size: [0.36, 0.3, 0.38], at: [0.74, 0.64, 0], color: 'body', mirror: 'x' }, // arm
    { size: [0.44, 0.16, 0.46], at: [0, 0.9, 0], color: 'body' }, // head
    { size: [0.18, 0.18, 0.45], at: [0.55, 0.59, 0.18], color: 'gun' }, // stock
    { size: [0.16, 0.16, 1.6], at: [0.55, 0.59, -0.7], color: 'gun' }, // rifle's long barrel
  ],
  // the assault: low and leaning, thin legs and a short gun on each arm, so the distant shape is a crouched, wide one
  // with no long line out of it
  assault: [
    { size: [0.34, 0.42, 0.36], at: [0.44, 0.21, 0.04], color: 'body', mirror: 'x' }, // thin leg
    { size: [0.42, 0.08, 0.62], at: [0.44, 0.04, -0.04], color: 'gun', mirror: 'x' }, // foot
    { size: [0.95, 0.14, 0.5], at: [0, 0.44, 0], color: 'body' }, // hips
    { size: [1.08, 0.32, 0.62], at: [0, 0.61, -0.02], color: 'body' }, // torso
    { size: [0.7, 0.24, 0.24], at: [0, 0.66, 0.4], color: 'body' }, // pack, so the lean reads from behind too
    { size: [0.44, 0.12, 0.54], at: [0.62, 0.74, 0], color: 'mark', mirror: 'x' }, // shoulder mark
    { size: [0.28, 0.28, 0.3], at: [0.62, 0.6, 0], color: 'body', mirror: 'x' }, // arm
    { size: [0.36, 0.13, 0.32], at: [0, 0.79, -0.08], color: 'body' }, // head
    { size: [0.16, 0.16, 0.6], at: [0.62, 0.56, -0.36], color: 'gun', mirror: 'x' }, // short gun on each arm
  ],
  // the heavy: broad shoulders, a shield on one side, thick legs and one big cannon, so the distant shape is a wide,
  // tall block with a slab on one side and a heavy line on the other
  heavy: [
    { size: [0.78, 0.42, 0.8], at: [0.52, 0.21, 0], color: 'body', mirror: 'x' }, // thick leg
    { size: [0.88, 0.12, 0.98], at: [0.52, 0.06, -0.04], color: 'gun', mirror: 'x' }, // foot
    { size: [1.5, 0.18, 0.9], at: [0, 0.47, 0], color: 'body' }, // hips
    { size: [1.6, 0.36, 1], at: [0, 0.66, 0], color: 'body' }, // torso
    { size: [0.72, 0.24, 0.88], at: [1.02, 0.84, 0], color: 'body', mirror: 'x' }, // wide shoulder
    { size: [0.2, 0.62, 1.05], at: [-1.22, 0.58, -0.02], color: 'body' }, // shield slab
    { size: [0.06, 0.16, 0.72], at: [-1.34, 0.66, -0.02], color: 'mark' }, // shield's mark
    { size: [0.54, 0.18, 0.54], at: [0, 0.9, 0], color: 'body' }, // head
    { size: [0.4, 0.07, 0.06], at: [0, 0.91, -0.28], color: 'mark' }, // visor
    { size: [0.62, 0.46, 0.72], at: [1, 0.66, -0.02], color: 'gun' }, // cannon's body
    { size: [0.34, 0.34, 1.1], at: [1, 0.68, -0.82], color: 'gun' }, // cannon's barrel
    { size: [0.46, 0.46, 0.22], at: [1, 0.68, -1.42], color: 'gun' }, // muzzle
  ],
};
