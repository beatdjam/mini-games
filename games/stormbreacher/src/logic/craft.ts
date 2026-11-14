// The boxes of the player's landing craft, shared by the game's walking and the camera (view/world.ts). The craft is
// drawn at the middle of the map's front edge (view/shore.ts); these boxes come from the same sizes, so the mech walks on
// what is drawn.
import { CRAFT_TUNE, craftZ } from '../data/craft.ts';
import { MECH_TUNE } from '../data/tune.ts';
import type { MapBounds } from '../data/types.ts';
import type { GroundRect } from './collide.ts';

// The rects the mech walks on and against on the player's craft: the deck, the two side walls, the stern, the wheelhouse
// and the ramp. The ramp's high end is the hinge at the craft's front; its low end reaches the sand.
export function craftRects(bounds: MapBounds): GroundRect[] {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const z0 = craftZ(bounds);
  const { width, length, hullTop, deckTop, deckWidth, wallHeight, wallThickness, sternHeightExtra, wheelhouse } =
    CRAFT_TUNE;
  const sideX = width / 2 - wallThickness / 2;
  const rampRun = CRAFT_TUNE.rampLength * Math.cos(CRAFT_TUNE.rampTilt);
  const wallTop = hullTop + wallHeight;
  return [
    { x: cx, z: z0 + length / 2, halfW: deckWidth / 2, halfD: (length - 0.6) / 2, yaw: 0, top: deckTop },
    { x: cx - sideX, z: z0 + length / 2, halfW: wallThickness / 2, halfD: length / 2, yaw: 0, top: wallTop },
    { x: cx + sideX, z: z0 + length / 2, halfW: wallThickness / 2, halfD: length / 2, yaw: 0, top: wallTop },
    {
      x: cx,
      z: z0 + length - wallThickness / 2,
      halfW: width / 2,
      halfD: wallThickness / 2,
      yaw: 0,
      top: wallTop + sternHeightExtra,
    },
    {
      x: cx,
      z: z0 + length - wheelhouse.fromStern,
      halfW: wheelhouse.w / 2,
      halfD: wheelhouse.d / 2,
      yaw: 0,
      top: hullTop + wheelhouse.h,
    },
    // yaw PI turns surfaceAt's uphill sense round, so the low end lies at the sand (-z) and the high end at the hinge
    { x: cx, z: z0 - rampRun / 2, halfW: deckWidth / 2, halfD: rampRun / 2, yaw: Math.PI, top: hullTop, ramp: true },
  ];
}

// The z the craft's body ends at (m).
export function craftBack(bounds: MapBounds): number {
  return craftZ(bounds) + CRAFT_TUNE.length;
}

// Whether the mech's middle is in the ramp's lane, the only way past the map's front edge. The lane is the hull's width,
// not the deck's: a mech against the side walls (its middle at x 2.0) must still count as on the craft.
export function inCraftLane(x: number, bounds: MapBounds): boolean {
  const cx = (bounds.minX + bounds.maxX) / 2;
  return Math.abs(x - cx) <= CRAFT_TUNE.width / 2 - MECH_TUNE.radius;
}
