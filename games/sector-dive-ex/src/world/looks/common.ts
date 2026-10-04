import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { renderer } from '@engine/render/render.ts';
import { SIDE_STEP, T, tileCenter } from '@engine/world/tiles.ts';
import type { FloorPlan } from '../building.ts';
// What every sector's look is made with: the shape of a look, the painters' tools (pictures painted on canvases from
// a seed, so a floor looks the same every time), which picture a tile gets, and where things go on a wall. The looks
// themselves are in the files next to this one, one per sector; world/looks.ts lists them.
// ---- tuning numbers shared by the looks ----
export const TEX = 256; // side of a painted picture (px)
export const LAMP_POOL = 7; // side of the pool of light a ceiling lamp throws on the floor (m)

export interface Look {
  walls: THREE.CanvasTexture[];
  floors: THREE.CanvasTexture[];
  deck: THREE.CanvasTexture; // top of raised decks and ramps
  ceiling: THREE.CanvasTexture;
  door: THREE.CanvasTexture; // one leaf of a door (a leaf is half a tile wide and a wall high)
  bossDoor: THREE.CanvasTexture; // ... of the boss room's door
  fog: number; // the colour things fade to in the distance (the sector's own is for the plain look)
  props: (plan: FloorPlan, group: THREE.Group, rng: Rng) => void;
}
export type Paint = (g: CanvasRenderingContext2D, rand: () => number) => void;

// a small seeded generator for the painters (the same picture every time)
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function paint(seed: number, fn: Paint, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = TEX;
  c.height = TEX;
  fn(c.getContext('2d')!, seeded(seed));
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}
// speckles and blotches over the whole picture: dirt
export function grime(g: CanvasRenderingContext2D, rand: () => number, n: number, light: string, dark: string) {
  for (let k = 0; k < n; k++) {
    g.globalAlpha = 0.04 + rand() * 0.1;
    g.fillStyle = rand() < 0.5 ? light : dark;
    const w = 4 + rand() * 46,
      h = 3 + rand() * 30;
    g.fillRect(rand() * TEX - w / 2, rand() * TEX - h / 2, w, h);
  }
  g.globalAlpha = 1;
}

// fine grain over the whole picture, pixel by pixel: what makes flat paint look like a surface
export function grain(g: CanvasRenderingContext2D, rand: () => number, amount: number) {
  const img = g.getImageData(0, 0, TEX, TEX),
    px = img.data;
  for (let n = 0; n < px.length; n += 4) {
    const d = (rand() - 0.5) * amount;
    px[n] = px[n]! + d;
    px[n + 1] = px[n + 1]! + d;
    px[n + 2] = px[n + 2]! + d;
  }
  g.putImageData(img, 0, 0);
}
// a picture of its own size (the signs are wide or tall, not square)
export function canvasTex(w: number, h: number, fn: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  fn(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return t;
}

// a soft round patch of light, for the pools under the lamps and signs
export const poolPaint: Paint = g => {
  const r = g.createRadialGradient(TEX / 2, TEX / 2, 4, TEX / 2, TEX / 2, TEX / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, TEX, TEX);
};
// which picture a tile gets: the same one every time, scattered so that neighbours differ. The first picture is the
// plainest and comes up most (`plainShare` of the tiles)
export function variantOf(k: number, count: number, plainShare: number): number {
  const h = (Math.imul(k + 1, 2654435761) >>> 0) / 4294967296;
  return h < plainShare ? 0 : 1 + (Math.floor((h - plainShare) * 9973) % (count - 1));
}
export const WALL_PLAIN_SHARE = 0.4; // share of the wall tiles that get the plain picture
export const FLOOR_PLAIN_SHARE = 0.6; // ... of the floor tiles

// ---- things fixed to a wall (a wall slot of placeProps: the floor tile and the side its wall is on) ----
export type WallSlot = { i: number; j: number; side?: number };
// where on a wall face: the tile's middle moved to the wall, `off` along it, `out` away from it, at height y
export function onWall(s: WallSlot, off: number, out: number, y: number): THREE.Vector3 {
  const [di, dj] = SIDE_STEP[s.side ?? 0]!;
  return new THREE.Vector3(
    tileCenter(s.i) + di * (T / 2 - out) + dj * off,
    y,
    tileCenter(s.j) + dj * (T / 2 - out) + di * off,
  );
}
// the turn that makes a thing's +z look away from the wall (its +x then runs along the wall)
export function facing(s: WallSlot): number {
  const [di, dj] = SIDE_STEP[s.side ?? 0]!;
  return Math.atan2(-di, -dj);
}
