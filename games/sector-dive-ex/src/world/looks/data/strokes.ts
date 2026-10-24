import { PAINT } from '../../../data/colors.ts';
import { WALL_ASPECT, oval } from '../paint.ts';
// The strokes the discarded data layer's pictures share (pictures.ts: the layer; hall.ts: its server hall): the
// patch cables, the lamps of a rack and the joint between two panels.
// patch cables, dulled by dust: grey, blue, yellow, red, black (the pictures and the props use the same ones)
export const CABLES = [0x7b838a, 0x3f587a, 0x8a7a3c, 0x633a36, PAINT.soot9];
// the colours the server hall's pictures and its props (their pictures and parts) share
export const HALL_LAMPS = [0x7af0a8, 0x7af0a8, 0x7af0a8, 0xffc15a, 0xff5a48, 0x6fd0ff]; // a lit lamp: mostly green
export const HALL_HOUSING = 0x1a2229; // the dark steel of a frame, the sides of a unit, the back of a board
export const HALL_METAL = 0x6d7a84; // ladders, trays, the bars of a grating
export const HALL_WELL = 0x05080b; // the dark behind glass and grilles
export const DISPLAY_DARK = 0x0b2418; // a display's glass ...
export const DISPLAY_LIT = 0x58d08a; // ... and its segments
export const HALL_BUTTON = 0x7b8791;
export const HALL_HAZARD = 0xc9a227; // the yellow of a hazard band
export const HALL_HEAD = 0xd9d2c4; // a sprinkler head
export const LEDS = ['#63c98a', '#63c98a', '#d7a23f', '#c9503f']; // the lamps of a rack: mostly green

// a thin joint between two panels (across the picture, or down it): a dark line with a light one beside it
export function joint(g: CanvasRenderingContext2D, x: number, y: number, len: number, down: boolean, dark = 0.4) {
  g.fillStyle = `rgba(16,24,32,${dark})`;
  g.fillRect(x, y, down ? 1.5 : len, down ? len : 1.5);
  g.fillStyle = `rgba(255,255,255,${dark * 0.3})`;
  g.fillRect(down ? x + 1.5 : x, down ? y : y + 1.5, down ? 1 : len, down ? len : 1);
}
// a small lamp behind a rack's door: a dot and a faint halo
export function led(g: CanvasRenderingContext2D, x: number, y: number, color: string) {
  g.globalAlpha = 0.22;
  g.fillStyle = color;
  oval(g, x, y, 4, 4 * WALL_ASPECT);
  g.globalAlpha = 1;
  g.fillRect(x - 1.1, y - 0.8, 2.2, 1.6);
}
