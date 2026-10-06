import * as THREE from 'three';
import { renderer } from '@engine/render/render.ts';
import { T } from '@engine/world/tiles.ts';
import { WALL_H } from '../../data/level.ts';
// The painters' tools: pictures painted on canvases from a seed (so a picture is the same every time), and the
// strokes more than one sector's pictures are made of (dirt, grain, a soft patch, warning stripes, words). The
// models' pictures (guns, enemies, pickups, gates) are painted with them too.
export const TEX = 256; // side of a painted picture (px)
// a wall picture is stretched over a face this wide for its height: round things are painted this flat
export const WALL_ASPECT = T / WALL_H;
export const DOOR_ASPECT = T / 2 / WALL_H; // ... and a door leaf's picture
// the signs and plates written in Japanese are drawn with whatever face the device has (the words: src/i18n/signs.ts)
export const SIGN_FONT = '"Hiragino Sans","Noto Sans JP","Noto Sans CJK JP","Yu Gothic","Meiryo",sans-serif';

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
// a soft round patch of light, for the pools under the lamps, the signs, the enemies and the things on the floor
// (one picture for all of them; each material gives it its colour)
let pool: THREE.CanvasTexture | null = null;
export const poolTex = (): THREE.CanvasTexture =>
  (pool ??= paint(0, g => {
    const r = g.createRadialGradient(TEX / 2, TEX / 2, 4, TEX / 2, TEX / 2, TEX / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,.45)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, TEX, TEX);
  }));

// ---- strokes ----
// the picture row of a height on a wall or a door (m above the floor)
export const rowOf = (m: number) => TEX * (1 - m / WALL_H);
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
export function oval(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}
// a soft patch (rgb = "r,g,b", a = how strong in its middle), drawn again one picture over on every side so that it
// runs on into the next tile
export function smudge(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rgb: string,
  a: number,
) {
  for (const ox of [-TEX, 0, TEX])
    for (const oy of [-TEX, 0, TEX]) {
      g.save();
      g.translate(x + ox, y + oy);
      g.scale(1, ry / rx);
      const s = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      s.addColorStop(0, `rgba(${rgb},${a})`);
      s.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = s;
      g.fillRect(-rx, -rx, rx * 2, rx * 2);
      g.restore();
    }
}
// slanted warning stripes of two colours in a band; worn = a colour laid over its lower part (dirt, wear)
export function stripes(
  g: CanvasRenderingContext2D,
  [x, y, w, h]: [number, number, number, number],
  pitch: number,
  light: string,
  dark: string,
  worn?: string,
) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = light;
  g.fillRect(x, y, w, h);
  g.fillStyle = dark;
  for (let sx = x - h - pitch; sx < x + w + pitch; sx += pitch) {
    g.beginPath();
    g.moveTo(sx, y + h);
    g.lineTo(sx + pitch * 0.9, y);
    g.lineTo(sx + pitch * 1.4, y);
    g.lineTo(sx + pitch * 0.5, y + h);
    g.fill();
  }
  if (worn) {
    g.fillStyle = worn;
    g.fillRect(x, y + h * 0.6, w, h * 0.4);
  }
  g.restore();
}
// words painted on a wall or a door, drawn as wide as they are high there (`aspect`: how flat the picture is painted,
// WALL_ASPECT or DOOR_ASPECT); maxW = squeezed to this width (px)
export function words(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  px: number,
  aspect: number,
  font = SIGN_FONT,
  maxW?: number,
) {
  g.save();
  g.translate(x, y);
  g.scale(1, aspect);
  g.font = `900 ${px}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 0, maxW);
  g.restore();
}
