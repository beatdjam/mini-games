import { PAINT, css } from '../../../data/colors.ts';
import { WALL_ASPECT, oval } from '../paint.ts';
// The strokes the deep noise's pictures share (pictures.ts: the sector; hall.ts: its big studio), and the colours that
// the studio's pictures and its props (hallProps.ts) share.
// ---- the studio's colours ----
export const HALL_VALVE = 0xffa24a; // the glow of a transmitter's valves
export const HALL_ON_AIR = 0xff4a3a; // an "ON AIR" lamp
export const HALL_STUDIO_LIGHT = 0xfff0d4; // the white of a studio lamp's lens
export const HALL_HOUSING = 0x2a2533; // the dark steel of a lamp, a stand, a camera
export const HALL_METAL = 0x8d879c; // truss tubes, stands, the rims of a reel
export const HALL_WELL = 0x0d0b12; // the dark behind glass
export const HALL_STEEL = 0x6a6380; // the grey steel of a cabinet, a plate, a lens's rim
export const HALL_ON_AIR_DARK = 0x3a1210; // the dark red behind the letters of a lit "ON AIR" lamp
export const CABLE_TONES = [0x2c2734, 0x4d4759, 0x89826f]; // the cables that run about the sector

// a flat box with a shadow under it and a light top edge: a panel, a plate, a unit of gear
export function slab(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  g.fillStyle = 'rgba(8,6,12,.45)';
  g.fillRect(x + 1.5, y + 1.5, w, h);
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,250,255,.16)';
  g.fillRect(x, y, w, 1.2);
}
// a round dial knob with its pointer
export function knob(g: CanvasRenderingContext2D, x: number, y: number, r: number, turn: number) {
  g.fillStyle = 'rgba(8,6,12,.6)';
  oval(g, x + 0.7, y + 0.5, r, r * WALL_ASPECT);
  g.fillStyle = '#2a2632';
  oval(g, x, y, r * 0.9, r * 0.9 * WALL_ASPECT);
  g.strokeStyle = '#d6d0de';
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + Math.cos(turn) * r * 0.9, y + Math.sin(turn) * r * 0.9 * WALL_ASPECT);
  g.stroke();
}
// a meter: a cream face, a scale and a needle
export function meter(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lean: number) {
  g.fillStyle = '#1e1b25';
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = '#cfc8b0';
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(150,60,40,.8)'; // the red end of the scale
  g.fillRect(x + w * 0.68, y + h * 0.25, w * 0.22, 1);
  g.fillStyle = 'rgba(40,34,30,.8)';
  g.fillRect(x + w * 0.1, y + h * 0.25, w * 0.58, 1);
  g.strokeStyle = css(PAINT.soot3);
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(x + w / 2, y + h);
  g.lineTo(x + w / 2 + lean * w * 0.4, y + h * 0.3);
  g.stroke();
}
// static: grey specks, bright and dark, inside a rectangle
export function snow(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, w: number, h: number) {
  for (let py = y; py < y + h; py += 1)
    for (let px = x; px < x + w; px += 1.5) {
      const v = Math.floor(70 + rand() * 150);
      g.fillStyle = `rgb(${v - 8},${v - 6},${v + 10})`;
      g.fillRect(px, py, 1.5, 1);
    }
}
// a monitor: a deep box, a dark bezel, glass that bulges (lit: showing static)
export function crt(
  g: CanvasRenderingContext2D,
  rand: () => number,
  x: number,
  y: number,
  w: number,
  h: number,
  lit: boolean,
) {
  slab(g, x, y, w, h, '#4b4657');
  const sx = x + w * 0.1,
    sy = y + h * 0.12,
    sw = w * 0.8,
    sh = h * 0.68;
  g.fillStyle = '#17141d';
  g.fillRect(sx - 2, sy - 1.4, sw + 4, sh + 2.8);
  if (lit) snow(g, rand, sx, sy, sw, sh);
  else {
    g.fillStyle = '#2b2a35';
    g.fillRect(sx, sy, sw, sh);
    g.fillStyle = 'rgba(190,186,214,.12)'; // the room in the glass
    g.fillRect(sx + sw * 0.1, sy + sh * 0.12, sw * 0.3, sh * 0.2);
  }
  const bulge = g.createRadialGradient(sx + sw / 2, sy + sh / 2, 2, sx + sw / 2, sy + sh / 2, sw * 0.7);
  bulge.addColorStop(0, 'rgba(10,8,16,0)');
  bulge.addColorStop(1, 'rgba(10,8,16,.5)');
  g.fillStyle = bulge;
  g.fillRect(sx, sy, sw, sh);
  // two knobs under the glass
  g.fillStyle = '#1c1922';
  oval(g, x + w * 0.78, y + h * 0.9, 1.6, 1.6 * WALL_ASPECT);
  oval(g, x + w * 0.88, y + h * 0.9, 1.6, 1.6 * WALL_ASPECT);
}
