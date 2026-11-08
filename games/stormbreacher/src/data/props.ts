// The sizes of the map's props and targets (m). The mech is 8 m tall with a 2 m hit radius: cover is tall enough for
// it to hide behind, and obstacles are a jump's height.
import type { PropKind, TargetKind } from './types.ts';

export interface PropSize {
  w: number; // the width along x (m)
  h: number; // the height (m); 0 leaves the shape's own height
  d: number; // the depth along z (m)
  blocks: boolean; // whether it blocks the mech's path
}

export const PROP_SIZE: Record<PropKind, PropSize> = {
  tile: { w: 4, h: 0, d: 4, blocks: false },
  hedgehog: { w: 3, h: 3, d: 3, blocks: true },
  block: { w: 6, h: 4, d: 4, blocks: true },
  bunker: { w: 12, h: 6, d: 8, blocks: true },
  seawall: { w: 8, h: 6, d: 4, blocks: true },
  cliff: { w: 20, h: 30, d: 16, blocks: true },
  crater: { w: 12, h: 0, d: 12, blocks: false },
  wreck: { w: 12, h: 5, d: 6, blocks: true },
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
