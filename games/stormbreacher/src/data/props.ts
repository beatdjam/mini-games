// The sizes of the map's props and targets (m), decided when the mech was 8 m tall with a 2 m hit radius. The mech is
// now 4 m tall with a 1 m radius (MECH_TUNE), and a jump peaks at about 2.2 m, so a hedgehog (3 m) is not jumped over.
import type { PropKind, TargetKind } from './types.ts';

export interface PropSize {
  w: number; // the width along x (m)
  h: number; // the height (m); 0 leaves the shape's own height
  d: number; // the depth along z (m)
  blocks: boolean; // whether it blocks the mech's path
}

export const TILE_SIZE = 4; // the ground tile's side (m)

const SEAWALL_HEIGHT = 6; // the seawall's height (m), also the height a flight of stairs climbs

// A flight of stairs up the seawall: one prop, one rect per step (mapBlockers). The rise follows from the seawall's
// height, so the mech can walk up every step (MOVE_TUNE.stepHeight is 0.75 m).
export const STAIRS_TUNE = {
  steps: 9, // how many steps the flight has
  run: 1.5, // each step's depth along the climb (m)
};
export const STAIR_RISE = SEAWALL_HEIGHT / STAIRS_TUNE.steps; // how much each step rises above the one before (m)

export const PROP_SIZE: Record<PropKind, PropSize> = {
  tile: { w: 4, h: 0, d: 4, blocks: false },
  hedgehog: { w: 3, h: 3, d: 3, blocks: true },
  block: { w: 6, h: 4, d: 4, blocks: true },
  bunker: { w: 12, h: 6, d: 8, blocks: true },
  seawall: { w: 8, h: SEAWALL_HEIGHT, d: 4, blocks: true },
  cliff: { w: 20, h: 30, d: 16, blocks: true },
  crater: { w: 12, h: 0, d: 12, blocks: false },
  wreck: { w: 12, h: 5, d: 6, blocks: true },
  lowWall: { w: 6, h: 0.85, d: 1, blocks: true }, // above the 0.75 m step, below a jump's peak of about 2.2 m
  stairs: { w: 8, h: SEAWALL_HEIGHT, d: STAIRS_TUNE.steps * STAIRS_TUNE.run, blocks: true },
};

// A prop's health (provisional). Only a `breakable: true` prop uses it. The autocannon (WEAPONS.autocannon.damage 10)
// and the heavy gun (WEAPONS.heavyGun.damage 60) take this many shots: a hedgehog 3 and 1, a block 6 and 1, a bunker 15
// and 3, a seawall 12 and 2, a wreck 8 and 2, a low wall 4 and 1, and a cliff 30 and 5. The tile and the crater do not
// block, so they are never shot down. The stairs are not broken either (their health is 0).
export const PROP_HP: Record<PropKind, number> = {
  tile: 0,
  hedgehog: 30,
  block: 60,
  bunker: 150,
  seawall: 120,
  cliff: 300,
  crater: 0,
  wreck: 80,
  lowWall: 40,
  stairs: 0,
};

export interface TargetSize {
  w: number; // the width along x (m)
  h: number; // the height (m)
  d: number; // the depth along z (m)
}

export const TARGET_SIZE: Record<TargetKind, TargetSize> = {
  pillbox: { w: 12, h: 6, d: 8 },
  depot: { w: 10, h: 6, d: 10 },
  gun: { w: 14, h: 8, d: 14 },
  magazine: { w: 10, h: 8, d: 10 },
};

// The targets' health (provisional; SB-190 decides it again). One autocannon shot does WEAPONS.autocannon.damage 10,
// so a depot (60) breaks in 6 shots, a gun (200) in 20 and a magazine (80) in 8. A pillbox (100) breaks in 10 autocannon
// shots or 2 heavy-gun shots (WEAPONS.heavyGun.damage 60) from its side or back, and in 40 or 7 from its front
// (PILLBOX_ARMOR in src/data/pillbox.ts).
export const TARGET_HP: Record<TargetKind, number> = {
  pillbox: 100,
  depot: 60,
  gun: 200,
  magazine: 80,
};
