import type { Biome } from '../data/types.ts';
import type { Look } from './looks/common.ts';
import { cityLook } from './looks/city.ts';
import { dataLook } from './looks/data.ts';
import { forgeLook } from './looks/forge.ts';
import { kwlnLook } from './looks/kwln.ts';
import { noiseLook } from './looks/noise.ts';
import { ruinLook } from './looks/ruin.ts';
// A sector's own look: its wall, floor, deck and ceiling pictures (painted on canvases, a few variants each so the
// same picture is not on every tile) and the things fixed to its walls and ceilings (props; none of them is in the
// way, so the tile world is not touched). A sector without a look is drawn with the plain line pattern in its colours
// (world/render.ts). The pictures and the props are drawn from a seed, so a floor looks the same every time.
// Each look is in a file of its own in world/looks/. What they share is next to them: the shape of a look and which
// picture a tile gets (common.ts), the painters' tools (paint.ts), the tools for the props (props.ts). To add one:
// write the file, add its line to MAKERS here, put its words in i18n/signs.ts and describe it in SPEC.md.
export type { Look } from './looks/common.ts';
export { FLOOR_PLAIN_SHARE, WALL_PLAIN_SHARE, variantOf } from './looks/common.ts';

// dev only (?plain): every sector drawn the plain way, to compare a look with what was there before
let plain = false;
export function devPlainLooks(on: boolean) {
  plain = on;
}
// are the plain looks on (dev): the enemies are drawn the plain way too (world/models.ts)
export const plainLooks = (): boolean => plain;

// the looks, made the first time a sector is drawn (the pictures stay for the life of the page)
const MAKERS: Record<string, () => Look> = {
  DATA: dataLook,
  KWLN: kwlnLook,
  FORGE: forgeLook,
  NOISE: noiseLook,
  RUIN: ruinLook,
  CITY: cityLook,
};
const made: Record<string, Look> = {};
// the sector's look, or null when it has none (or ?plain is on): it is drawn the plain way then
export function lookOf(b: Biome): Look | null {
  if (plain || !MAKERS[b.code]) return null;
  return (made[b.code] ??= MAKERS[b.code]!());
}
