import type * as THREE from 'three';
import {
  grain as engineGrain,
  grime as engineGrime,
  paintTex,
  smudge as engineSmudge,
  words as engineWords,
} from '@engine/render/paint.ts';
import type { Paint } from '@engine/render/paint.ts';
import { T } from '@engine/world/tiles.ts';
import { WALL_H } from '../../data/level.ts';
// The painters' tools for this game's pictures: the engine's (engine/src/render/paint.ts: a seeded painter, dirt,
// grain, a soft patch, warning stripes, words ...) on pictures TEX a side, and the sizes of the pictures on a wall.
// The models' pictures (guns, enemies, pickups, gates) are painted with them too.
export const TEX = 256; // side of a painted picture (px)
// a wall picture is stretched over a face this wide for its height: round things are painted this flat
export const WALL_ASPECT = T / WALL_H;
export const DOOR_ASPECT = T / 2 / WALL_H; // ... and a door leaf's picture
// the signs and plates written in Japanese are drawn with whatever face the device has (the words: src/i18n/signs.ts)
export const SIGN_FONT = '"Hiragino Sans","Noto Sans JP","Noto Sans CJK JP","Yu Gothic","Meiryo",sans-serif';

export type { Paint } from '@engine/render/paint.ts';
export { block, canvasTex, oval, poolTex, soil, stripes } from '@engine/render/paint.ts';
// the engine's painter and strokes on this game's pictures, TEX a side (engine/src/render/paint.ts)
export const paint = (seed: number, fn: Paint, repeat = false): THREE.CanvasTexture => paintTex(seed, fn, TEX, repeat);
export const grime = (g: CanvasRenderingContext2D, rand: () => number, n: number, light: string, dark: string) =>
  engineGrime(g, rand, n, light, dark, TEX, TEX);
export const grain = (g: CanvasRenderingContext2D, rand: () => number, amount: number) =>
  engineGrain(g, rand, amount, TEX, TEX);
export const smudge = (
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rgb: string,
  a: number,
) => engineSmudge(g, x, y, rx, ry, rgb, a, TEX, TEX);
// words painted on a wall or a door (`aspect`: WALL_ASPECT or DOOR_ASPECT), in the face the signs are written in
export const words = (
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  px: number,
  aspect: number,
  font = SIGN_FONT,
  maxW?: number,
) => engineWords(g, text, x, y, px, aspect, font, maxW);

// ---- where things are on a picture ----
// the picture row of a height on a wall or a door (m above the floor)
export const rowOf = (m: number) => TEX * (1 - m / WALL_H);
// the view out of the windows (Look.outside): a band this many pixels round and high, wrapped round the player on a
// cylinder BACKDROP_R from the eye and BACKDROP_TALL high, its middle row (BACKDROP_EYE) at the eye's height
export const BACKDROP_W = 2048,
  BACKDROP_H = 512,
  BACKDROP_EYE = BACKDROP_H / 2;
export const BACKDROP_R = 110, // m (inside the camera's far plane, 140 m, even at the band's top and bottom)
  BACKDROP_TALL = 120; // m
