import { COVER_H } from '@engine/world/tiles.ts';
import type { Court, FloorPlan } from '../../building.ts';
import type { piece } from './cover.ts';
// The ground of a mall's atrium: a drained fountain on the tile in the middle of its open middle and, in a long one
// (a galleria), planters along it. They are cover tiles like any other (one walks round them, a bullet flies over
// them, nothing is put down on them), drawn as a fountain and as planters by the mall's cover (cover.ts mallCover).
// Laid out after the islands, with no random numbers, so the building is otherwise as it was. Called by the building
// (world/building.ts) for a mall's atrium.
// ---- tuning numbers used only here ----
// the planters of a galleria: tiles along it from its middle tile and to the side of its middle line (-1 or 1). The
// last only in a long one (GALLERIA_LENGTHS 9); its open middle is three tiles wide, so the middle line stays open
// from end to end but at the fountain, and the gallery round the hole is never touched
const PLANTER_TILES: [along: number, side: number][] = [
  [-3, 1],
  [3, -1],
  [1, 1],
];
const LONG_GALLERIA = 9; // tiles: a galleria this long has room for every planter
// the fountain (m): a stone rim of blocks under a paler coping, the dry basin with the mark the water left, and a
// spout in the middle (a pedestal and two dishes). The rim stands near the height of the cover, which is what stops a
// bullet or a walker, so the stone is where one bumps
const FOUNTAIN = {
  r: 1.62, // the rim's outer radius (the tile is 4 m: it stays inside it)
  rimW: 0.34, // how thick the rim is
  rimH: 0.95, // how high it stands
  blocks: 14, // blocks round the rim
  cap: 0.08, // the coping on top of it
  mark: 0.6, // the dried mark of the water, a share of the basin's radius
  stem: [0.32, 1.1], // the pedestal: radius and height
  dishes: [
    [0.85, 0.75], // the lower dish: radius, height of its rim
    [0.45, 1.5], // the upper one
  ],
  dishH: 0.12,
  spout: [0.08, 1.85], // the spout on top: radius, height of its tip
};
const TONES = { block: 0x7a7468, cap: 0xb8b2a3, basin: 0x5f5b51, mark: 0x4f4c44, stone: 0x948e80 };

export type AtriumPiece = 'fountain' | 'planter';

// the tiles of the atrium's ground (floor court.lower) that the fountain and the planters stand on, made cover
export function placeAtriumPieces(plan: FloorPlan, court: Court) {
  if (court.open) return;
  const { W, maps } = plan.gen,
    is = court.tiles.map(k => k % W),
    js = court.tiles.map(k => (k / W) | 0),
    i0 = Math.min(...is),
    j0 = Math.min(...js),
    ci = i0 + ((court.w - 1) >> 1),
    cj = j0 + ((court.h - 1) >> 1),
    alongZ = court.h > court.w,
    long = Math.max(court.w, court.h),
    pieces = new Map<number, AtriumPiece>(),
    put = (k: number, kind: AtriumPiece) => {
      // (only on the plain floor of the open middle)
      if (!court.tiles.includes(k) || maps.grid[k] !== 1 || maps.cover[k] || maps.hgt[k] !== 0) return;
      maps.cover[k] = 1;
      maps.hgt[k] = COVER_H;
      pieces.set(k, kind);
    };
  put(cj * W + ci, 'fountain');
  if (court.w !== court.h)
    for (const [along, side] of PLANTER_TILES.slice(0, long >= LONG_GALLERIA ? 3 : 2)) {
      const [i, j] = alongZ ? [ci + side, cj + along] : [ci + along, cj + side];
      put(j * W + i, 'planter');
    }
  plan.pieces = pieces;
}

// the fountain, about the middle of its tile (p: cover.ts piece)
export function fountainPiece(p: ReturnType<typeof piece>) {
  const f = FOUNTAIN,
    mid = f.r - f.rimW / 2,
    len = (2 * Math.PI * mid) / f.blocks + 0.05; // (a little over the arc: no gaps between the blocks)
  for (let n = 0; n < f.blocks; n++) {
    const a = (n / f.blocks) * Math.PI * 2,
      x = Math.cos(a) * mid,
      z = Math.sin(a) * mid;
    p.turned(TONES.block, x, z, 0, f.rimW, f.rimH, len, -a);
    p.turned(TONES.cap, x, z, f.rimH, f.rimW + 0.06, f.cap, len, -a);
  }
  const inner = f.r - f.rimW;
  p.disc(TONES.basin, 0, 0, 0, inner, 0.03);
  p.disc(TONES.mark, 0, 0, 0.03, inner * f.mark, 0.03);
  p.disc(TONES.stone, 0, 0, 0, f.stem[0]!, f.stem[1]!);
  for (const [r, y] of f.dishes) p.disc(TONES.cap, 0, 0, y! - f.dishH, r!, f.dishH);
  p.disc(TONES.stone, 0, 0, 0, f.spout[0]!, f.spout[1]!);
}
