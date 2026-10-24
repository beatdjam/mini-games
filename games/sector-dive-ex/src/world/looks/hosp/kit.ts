import { SIGN_FONT, TEX, WALL_ASPECT, oval, rowOf, words } from '../paint.ts';
import type { Paint } from '../paint.ts';
import { PLATE_WHITE, STEEL, STEEL_DARK, box, panels } from './shared.ts';
// The small parts the hospital's wall pictures are put together from: a picture of a kind of room, a round thing, a
// door in its frame, a window, a plate with a number, a shelf of boxes. They are painted on the 256 px picture of a
// wall (4 m across, 6 m high: M px a metre across, rowOf(m) the row of a height).
export type G = CanvasRenderingContext2D;
export const M = TEX / 4; // px across one metre of wall
export const FRONT_TOP = 3.6; // m: nothing is painted on a front above this, where the department board hangs
export const PLASTER = '#b9b3a1';
export const WOOD = '#b9a37a'; // light laminate
export const WOOD_DARK = '#8b7551';
export const GLASS_DARK = '#1c2724';
export const BLANKETS = ['#9cb7c9', '#c9cdb9', '#a9c4ab'];
export const BOX_COLORS = ['#d8d6ca', '#b4c6ce', '#c8d3ba', '#d0cab6', '#aebfb7'];
export const PILL_COLORS = ['#c9835c', '#e0dccd', '#7ea0b9', '#9bb27c', '#d3b45b'];

// a picture of a kind of room: the wall of that kind, then what `body` paints
export const inKind =
  (kind: number, body: (g: G, rand: () => number) => void): Paint =>
  (g, rand) => {
    panels(g, rand, kind);
    body(g, rand);
  };
// a round thing on a wall, painted flatter (WALL_ASPECT) so that it is round there
export const dot = (g: G, x: number, y: number, r: number) => oval(g, x, y, r, r * WALL_ASPECT);
// words on a plate: centred at (x, y), `px` high, squeezed into `w`
export function plateWords(g: G, text: string, x: number, y: number, px: number, w: number) {
  words(g, text, x, y, px, WALL_ASPECT, SIGN_FONT, w);
}
// a door leaf in a frame: `x` and `w` across (px), its top at `top` m, the colour of the leaf; a kick plate, a long handle
export function doorLeaf(g: G, rand: () => number, x: number, w: number, top: number, color: string) {
  const y = rowOf(top),
    foot = rowOf(0.12);
  box(g, x - 4, y - 3, w + 8, foot - y + 3, STEEL_DARK);
  g.fillStyle = color;
  g.fillRect(x, y, w, foot - y);
  g.fillStyle = 'rgba(255,252,236,.12)';
  g.fillRect(x, y, 3, foot - y);
  g.fillStyle = 'rgba(0,0,0,.18)';
  g.fillRect(x + w - 3, y, 3, foot - y);
  g.fillStyle = STEEL;
  g.fillRect(x, rowOf(0.55), w, rowOf(0.12) - rowOf(0.55));
  g.fillStyle = 'rgba(255,255,255,.25)';
  g.fillRect(x, rowOf(0.55), w, 1.2);
  g.fillStyle = STEEL_DARK;
  g.fillRect(x + w - 11, rowOf(1.5), 4, rowOf(0.8) - rowOf(1.5));
  for (let k = 0; k < 5; k++) {
    // scrapes of trolley corners along the leaf
    g.fillStyle = `rgba(30,34,30,${0.1 + rand() * 0.14})`;
    g.fillRect(x + 3 + rand() * (w - 20), rowOf(0.55) - 3 - rand() * 90, 6 + rand() * 12, 1.2);
  }
}
// a window in a door or a wall: glass in a frame (dark by default), a glare across it
export function pane(g: G, x: number, y: number, w: number, h: number, tint = GLASS_DARK) {
  box(g, x - 3, y - 3, w + 6, h + 6, STEEL_DARK);
  g.fillStyle = tint;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(210,226,222,.12)';
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w * 0.5, y);
  g.lineTo(x + w * 0.15, y + h);
  g.lineTo(x, y + h);
  g.fill();
}
// a plate with a number or a word, beside a door
export function numberPlate(g: G, x: number, y: number, text: string, w = 30) {
  box(g, x, y, w, 14, PLATE_WHITE);
  g.fillStyle = '#2c3a35';
  plateWords(g, text, x + w / 2, y + 7.5, 11, w - 4);
}
// a rack of boxes on a shelf board: boxes of `colors` standing side by side from x over w px, up to `h` px high
export function boxesOnShelf(
  g: G,
  rand: () => number,
  x: number,
  w: number,
  base: number,
  h: number,
  colors: readonly string[],
) {
  for (let bx = x; bx < x + w - 6;) {
    const bw = 8 + rand() * 9,
      bh = h * (0.55 + rand() * 0.45);
    if (rand() < 0.1) {
      bx += 8 + rand() * 10; // a gap
      continue;
    }
    g.fillStyle = colors[Math.floor(rand() * colors.length)]!;
    g.fillRect(bx, base - bh, bw, bh);
    g.fillStyle = 'rgba(255,252,236,.4)';
    g.fillRect(bx + 1.5, base - bh * 0.7, bw - 3, bh * 0.22);
    g.fillStyle = 'rgba(0,0,0,.2)';
    g.fillRect(bx + bw - 1.5, base - bh, 1.5, bh);
    bx += bw + 0.6;
  }
}
// shelving: a steel frame `w` by the heights `top`..`foot` m, `levels` boards, each with something on it (`fill`)
export function shelving(
  g: G,
  x: number,
  w: number,
  top: number,
  foot: number,
  levels: number,
  fill: (board: number, level: number) => void,
) {
  const y0 = rowOf(top),
    y1 = rowOf(foot);
  g.fillStyle = 'rgba(14,18,14,.4)';
  g.fillRect(x - 2, y0 - 2, w + 6, y1 - y0 + 4);
  g.fillStyle = STEEL_DARK;
  g.fillRect(x - 3, y0 - 3, w + 6, y1 - y0 + 3);
  g.fillStyle = '#2b3431';
  g.fillRect(x, y0, w, y1 - y0);
  const step = (y1 - y0) / levels;
  for (let l = 0; l < levels; l++) {
    const board = y0 + step * (l + 1);
    fill(board, l);
    g.fillStyle = STEEL;
    g.fillRect(x, board - 1.5, w, 3);
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.fillRect(x, board - 1.5, w, 1);
  }
}
