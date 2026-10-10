import * as THREE from 'three';
import { renderer } from './render.ts';
// The painters' tools: pictures painted on canvases from a seed (so a picture is the same every time) and made into
// textures, and the strokes pictures are made of (dirt, grain, a soft patch that runs on into the next tile, warning
// stripes, words, a lit block, soil). No game's pictures here: a game paints its own with these.
// The strokes that cover the whole picture take its size from the canvas unless told
export type Paint = (g: CanvasRenderingContext2D, rand: () => number) => void;
export const PAINT_SIZE = 256; // side of a painted picture unless told (px)

// a small seeded generator for the painters (0..1, the same row every time)
export function paintRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// a square picture `size` px a side painted by `fn` with random numbers from `seed`; `repeat`: it tiles
export function paintTex(seed: number, fn: Paint, size = PAINT_SIZE, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  fn(c.getContext('2d')!, paintRand(seed));
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}
// a picture of its own size (a sign is wide or tall, a backdrop goes all round)
export function canvasTex(w: number, h: number, fn: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  fn(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return t;
}
// a soft round patch of white light, for pools of light on the ground (one picture for all of them; each material
// gives it its colour)
let pool: THREE.CanvasTexture | null = null;
export const poolTex = (): THREE.CanvasTexture =>
  (pool ??= paintTex(0, g => {
    const s = g.canvas.width,
      r = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,.45)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  }));

// ---- strokes ----
// speckles and blotches over the picture (w by h): dirt
export function grime(
  g: CanvasRenderingContext2D,
  rand: () => number,
  n: number,
  light: string,
  dark: string,
  w = g.canvas.width,
  h = g.canvas.height,
) {
  for (let k = 0; k < n; k++) {
    g.globalAlpha = 0.04 + rand() * 0.1;
    g.fillStyle = rand() < 0.5 ? light : dark;
    const bw = 4 + rand() * 46,
      bh = 3 + rand() * 30;
    g.fillRect(rand() * w - bw / 2, rand() * h - bh / 2, bw, bh);
  }
  g.globalAlpha = 1;
}
// fine grain over the picture (w by h), pixel by pixel: what makes flat paint look like a surface
export function grain(
  g: CanvasRenderingContext2D,
  rand: () => number,
  amount: number,
  w = g.canvas.width,
  h = g.canvas.height,
) {
  const img = g.getImageData(0, 0, w, h),
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
// a soft patch (rgb = "r,g,b", a = how strong in its middle), drawn again one picture (w by h) over on every side so
// that it runs on into the next tile
export function smudge(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rgb: string,
  a: number,
  w = g.canvas.width,
  h = g.canvas.height,
) {
  for (const ox of [-w, 0, w])
    for (const oy of [-h, 0, h]) {
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
// words painted on a surface whose picture is stretched (`aspect`: its width over its height in the world for a
// square picture), drawn as wide as they are high there; maxW = squeezed to this width (px)
export function words(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  px: number,
  aspect: number,
  font = 'sans-serif',
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
// a block lit from the upper left: its colour, a lighter top edge, a shadow down its right side and under it
export function block(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(x + 3, y + 4, w, h);
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
  const shade = g.createLinearGradient(x, y, x + w, y + h);
  shade.addColorStop(0, 'rgba(255,255,255,0.14)');
  shade.addColorStop(0.5, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = shade;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(x, y, w, 2);
}
// dirt over the lower part (from the row `from` down) of what is already painted, and specks
export function soil(g: CanvasRenderingContext2D, rand: () => number, w: number, h: number, from: number) {
  g.globalCompositeOperation = 'source-atop';
  const dirt = g.createLinearGradient(0, from, 0, h);
  dirt.addColorStop(0, 'rgba(20,14,10,0)');
  dirt.addColorStop(1, 'rgba(20,14,10,0.55)');
  g.fillStyle = dirt;
  g.fillRect(0, 0, w, h);
  for (let k = 0; k < 500; k++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.22)' : 'rgba(255,240,210,0.07)';
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
  g.globalCompositeOperation = 'source-over';
}
