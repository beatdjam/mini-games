import type { Biome } from '../data/types.ts';
import type { Look } from './looks/common.ts';
import { cityPictures } from './looks/city/pictures.ts';
import { cityProps } from './looks/city/props.ts';
import { officeDeckTex } from './looks/city/cutouts.ts';
import { plantDeckTex } from './looks/forge/cutouts.ts';
import { shopDeckTex } from './looks/kwln/cutouts.ts';
import { floorDeckTex } from './looks/data/cutouts.ts';
import { stageDeckTex } from './looks/noise/cutouts.ts';
import { slabDeckTex } from './looks/ruin/cutouts.ts';
import { dataPictures } from './looks/data/pictures.ts';
import { dataProps } from './looks/data/props.ts';
import { forgePictures } from './looks/forge/pictures.ts';
import { forgeProps } from './looks/forge/props.ts';
import { kwlnPictures } from './looks/kwln/pictures.ts';
import { kwlnProps } from './looks/kwln/props.ts';
import { noisePictures } from './looks/noise/pictures.ts';
import { noiseProps } from './looks/noise/props.ts';
import { ruinPictures } from './looks/ruin/pictures.ts';
import { ruinProps } from './looks/ruin/props.ts';
// A sector's own look: its wall, floor, deck and ceiling pictures (painted on canvases, a few variants each so the
// same picture is not on every tile) and the things fixed to its walls and ceilings (props; none of them is in the
// way, so the tile world is not touched). A sector without a look is drawn with the plain line pattern in its colours
// (world/render.ts). The pictures and the props are drawn from a seed, so a floor looks the same every time.
// Each look is in a folder of its own in world/looks/, in two files: its pictures (pictures.ts) and its props
// (props.ts). What they share is in world/looks/ itself: the shape of a look and which picture a tile gets
// (common.ts), the painters' tools (paint.ts), the tools for the props (props.ts). To add one: make its folder and
// write the two files, add its line to MAKERS here, put its words in i18n/signs.ts and describe it in SPEC.md.
export type { Look } from './looks/common.ts';
export { FLOOR_PLAIN_SHARE, WALL_PLAIN_SHARE, variantOf, wallPic } from './looks/common.ts';

// dev only (?plain): every sector drawn the plain way, to compare a look with what was there before
let plain = false;
export function devPlainLooks(on: boolean) {
  plain = on;
}
// are the plain looks on (dev): the enemies are drawn the plain way too (world/models.ts)
export const plainLooks = (): boolean => plain;

// the looks, made the first time a sector is drawn (the pictures stay for the life of the page)
const MAKERS: Record<string, () => Look> = {
  DATA: () => ({ ...dataPictures(), deckSide: floorDeckTex(), props: dataProps }),
  KWLN: () => soot({ ...kwlnPictures(), deckSide: shopDeckTex(), props: kwlnProps }),
  FORGE: () => ({ ...forgePictures(), deckSide: plantDeckTex(), props: forgeProps }),
  NOISE: () => ({ ...noisePictures(), deckSide: stageDeckTex(), props: noiseProps }),
  RUIN: () => ({ ...ruinPictures(), deckSide: slabDeckTex(), props: ruinProps }),
  CITY: () => ({ ...cityPictures(), deckSide: officeDeckTex(), props: cityProps }),
};
// The walled city is a canyon: bright where people walk, black overhead. Its walls are darkened toward their tops
// and its ceiling nearly put out, once, when the look is made; the signs, lamps and cables stand out against that
function soot(look: Look): Look {
  const over = (t: { image: unknown; needsUpdate: boolean }, top: number, foot: number) => {
    const c = t.image as HTMLCanvasElement,
      g = c.getContext('2d')!,
      dark = g.createLinearGradient(0, 0, 0, c.height);
    dark.addColorStop(0, `rgba(6,5,8,${top})`);
    dark.addColorStop(0.55, `rgba(6,5,8,${foot})`);
    dark.addColorStop(1, `rgba(6,5,8,${foot})`);
    g.fillStyle = dark;
    g.fillRect(0, 0, c.width, c.height);
    t.needsUpdate = true;
  };
  for (const t of [...look.walls, look.door, look.bossDoor]) over(t, 0.72, 0.08);
  over(look.ceiling, 0.7, 0.7);
  return look;
}
const made: Record<string, Look> = {};
// the sector's look, or null when it has none (or ?plain is on): it is drawn the plain way then
export function lookOf(b: Biome): Look | null {
  if (plain || !MAKERS[b.code]) return null;
  return (made[b.code] ??= MAKERS[b.code]!());
}
