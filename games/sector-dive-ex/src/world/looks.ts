import type { Biome } from '../data/types.ts';
import type { Look } from './looks/common.ts';
import { cityPictures } from './looks/city.ts';
import { cityProps } from './looks/cityProps.ts';
import { dataPictures } from './looks/data.ts';
import { dataProps } from './looks/dataProps.ts';
import { forgePictures } from './looks/forge.ts';
import { forgeProps } from './looks/forgeProps.ts';
import { kwlnPictures } from './looks/kwln.ts';
import { kwlnProps } from './looks/kwlnProps.ts';
import { noisePictures } from './looks/noise.ts';
import { noiseProps } from './looks/noiseProps.ts';
import { ruinPictures } from './looks/ruin.ts';
import { ruinProps } from './looks/ruinProps.ts';
// A sector's own look: its wall, floor, deck and ceiling pictures (painted on canvases, a few variants each so the
// same picture is not on every tile) and the things fixed to its walls and ceilings (props; none of them is in the
// way, so the tile world is not touched). A sector without a look is drawn with the plain line pattern in its colours
// (world/render.ts). The pictures and the props are drawn from a seed, so a floor looks the same every time.
// Each look is in two files in world/looks/: its pictures (<sector>.ts) and its props (<sector>Props.ts). What they
// share is next to them: the shape of a look and which picture a tile gets (common.ts), the painters' tools
// (paint.ts), the tools for the props (props.ts). To add one: write the two files, add its line to MAKERS here, put
// its words in i18n/signs.ts and describe it in SPEC.md.
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
  DATA: () => ({ ...dataPictures(), props: dataProps }),
  KWLN: () => ({ ...kwlnPictures(), props: kwlnProps }),
  FORGE: () => ({ ...forgePictures(), props: forgeProps }),
  NOISE: () => ({ ...noisePictures(), props: noiseProps }),
  RUIN: () => ({ ...ruinPictures(), props: ruinProps }),
  CITY: () => ({ ...cityPictures(), props: cityProps }),
};
const made: Record<string, Look> = {};
// the sector's look, or null when it has none (or ?plain is on): it is drawn the plain way then
export function lookOf(b: Biome): Look | null {
  if (plain || !MAKERS[b.code]) return null;
  return (made[b.code] ??= MAKERS[b.code]!());
}
