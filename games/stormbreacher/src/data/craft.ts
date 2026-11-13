// The player's landing craft (SB-120): its sizes and where its body begins, shared by the drawing (view/shore.ts) and the
// boxes the mech walks on (logic/craft.ts), so the mech walks on what is drawn. The craft is drawn at the middle of the
// map's front edge; its body begins `gap` m past that edge and its ramp reaches back over the sand.
import type { MapBounds } from './types.ts';

export const CRAFT_TUNE = {
  gap: 5, // how far past the map's front edge the craft's body begins (m)
  width: 7, // the hull's width (m)
  length: 12, // the body's length along z (m)
  hullTop: 1.7, // the hull's upper face, where the ramp's hinge sits (m)
  deckTop: 1.8, // the deck's walking surface (m)
  deckWidth: 5.8, // the deck's width (m)
  wallHeight: 1.6, // the side walls above the hull (m)
  wallThickness: 0.5, // the side and stern walls' thickness (m)
  sternHeightExtra: 1.4, // the stern wall above the side walls (m)
  wheelhouse: { w: 3, h: 2.6, d: 3, fromStern: 3 }, // its size, and how far in front of the stern it stands (m)
  rampLength: 5, // the ramp plate's length (m)
  rampTilt: 0.35, // how far the ramp's tip is lowered from the hinge (rad)
} as const;

// The z the player's craft's body begins at, for a map with these bounds.
export const craftZ = (bounds: MapBounds): number => bounds.maxZ + CRAFT_TUNE.gap;
