import { oval } from '../paint.ts';
import { block } from '../cutoutTools.ts';
import type { G } from '../cutoutTools.ts';
import { STEEL, STEEL_DARK } from './shared.ts';
// Things of a hospital seen from the side, for the heaps along the foot of the walls (cutouts.ts, kindHeaps.ts): a
// stretcher, a wheelchair, a drip stand, a trolley, a hospital bed. Each stands on `foot` (the row of the floor) at `x`
// (its left end); `tilt` turns it about its foot (rad, to the right when positive). Sizes are in pixels of a heap's
// picture (146 px to the metre).
const VINYL = ['#5c7f86', '#6b7f95', '#7a8a6a']; // mattress vinyl
const CASTER = '#232830';
const SHEET = '#dcdcc0';

// run `draw` with the picture turned about (x, foot)
export function tipped(g: G, x: number, foot: number, tilt: number, draw: () => void) {
  g.save();
  g.translate(x, foot);
  g.rotate(tilt);
  g.translate(-x, -foot);
  draw();
  g.restore();
}
// a wheel with a hub
function wheel(g: G, x: number, y: number, r: number, hub = true) {
  g.fillStyle = CASTER;
  oval(g, x, y, r, r);
  if (!hub) return;
  g.fillStyle = STEEL;
  oval(g, x, y, r * 0.45, r * 0.45);
  g.fillStyle = 'rgba(255,255,255,.2)';
  oval(g, x - r * 0.15, y - r * 0.15, r * 0.2, r * 0.2);
}
// a drip stand: a pole on a five-legged foot with casters, hooks at the top and a bag hanging from them with its tube
export function ivStand(g: G, x: number, foot: number, h: number, tilt = 0, bag = true) {
  tipped(g, x, foot, tilt, () => {
    g.fillStyle = STEEL;
    g.fillRect(x - 1.6, foot - h, 3.2, h - 8);
    g.fillRect(x - 11, foot - h, 22, 2.6);
    g.fillStyle = STEEL_DARK;
    g.fillRect(x - 16, foot - 10, 32, 3);
    wheel(g, x - 15, foot - 4, 4, false);
    wheel(g, x + 15, foot - 4, 4, false);
    if (!bag) return;
    g.fillStyle = 'rgba(184,206,214,.85)';
    g.fillRect(x + 4, foot - h + 2, 11, 24);
    g.fillStyle = 'rgba(232,240,236,.5)';
    g.fillRect(x + 6, foot - h + 6, 3, 14);
    g.strokeStyle = 'rgba(184,206,214,.7)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x + 9, foot - h + 26);
    g.quadraticCurveTo(x + 18, foot - h * 0.5, x + 6, foot - h * 0.3);
    g.stroke();
  });
}
// a stretcher: a steel chassis on four casters, a vinyl mattress with a sheet crumpled on it, the backrest raised at the
// head end, a side rail, a pole at the foot end
export function stretcher(g: G, x: number, foot: number, len: number, tilt = 0, color = 0) {
  tipped(g, x, foot, tilt, () => {
    const top = foot - 74;
    g.fillStyle = 'rgba(20,24,20,.35)';
    g.fillRect(x + 4, foot - 4, len, 5);
    g.fillStyle = STEEL_DARK;
    g.fillRect(x + 14, foot - 40, len - 28, 7);
    g.fillRect(x + len * 0.3, foot - 33, 5, 24);
    g.fillRect(x + len * 0.7, foot - 33, 5, 24);
    wheel(g, x + 22, foot - 9, 9);
    wheel(g, x + len - 22, foot - 9, 9);
    block(g, x + 6, top + 14, len - 12, 14, VINYL[color % VINYL.length]!);
    g.fillStyle = SHEET;
    g.beginPath();
    g.moveTo(x + 40, top + 14);
    g.quadraticCurveTo(x + len * 0.5, top - 6, x + len - 30, top + 14);
    g.fill();
    g.fillStyle = 'rgba(40,50,44,.2)';
    g.fillRect(x + len * 0.4, top + 4, 2, 10);
    g.fillStyle = VINYL[color % VINYL.length]!;
    g.beginPath(); // the backrest
    g.moveTo(x + 6, top + 14);
    g.lineTo(x + 52, top - 20);
    g.lineTo(x + 66, top - 8);
    g.lineTo(x + 36, top + 14);
    g.fill();
    g.fillStyle = STEEL;
    g.fillRect(x + 10, top + 30, len - 20, 2.6);
    g.fillRect(x + len - 30, top - 28, 3, 42);
  });
}
// a wheelchair standing on its wheels, facing right: the big rear wheel, the small front one, the seat, the back, the
// arm and the foot rest
export function wheelchair(g: G, x: number, foot: number, h: number, tilt = 0, color = '#3d4a46') {
  tipped(g, x, foot, tilt, () => {
    const r = h * 0.34;
    g.strokeStyle = CASTER;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(x + h * 0.32, foot - r, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = STEEL;
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(x + h * 0.32, foot - r, r - 5, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = STEEL;
    oval(g, x + h * 0.32, foot - r, 4, 4);
    wheel(g, x + h * 0.88, foot - 8, 8);
    g.fillStyle = color;
    g.fillRect(x + h * 0.12, foot - h * 0.5, h * 0.55, h * 0.1); // the seat
    g.fillRect(x + h * 0.06, foot - h * 0.95, h * 0.1, h * 0.55); // the back
    g.fillStyle = STEEL;
    g.fillRect(x + h * 0.04, foot - h * 1.0, h * 0.2, 3); // the push handle
    g.fillRect(x + h * 0.14, foot - h * 0.66, h * 0.5, 3); // the arm
    g.fillRect(x + h * 0.64, foot - h * 0.66, 3, h * 0.2);
    g.save();
    g.translate(x + h * 0.66, foot - h * 0.4);
    g.rotate(0.5);
    g.fillRect(0, 0, 3, h * 0.36); // the leg rest
    g.restore();
    g.fillRect(x + h * 0.7, foot - h * 0.1, h * 0.2, 3);
  });
}
// a trolley: two shelves of pale laminate on four posts, casters, a handle at one end
export function trolley(g: G, x: number, foot: number, w: number, h: number, tilt = 0) {
  tipped(g, x, foot, tilt, () => {
    g.fillStyle = STEEL;
    g.fillRect(x + 4, foot - h, 3.4, h - 6);
    g.fillRect(x + w - 8, foot - h, 3.4, h - 6);
    g.fillRect(x - 6, foot - h - 4, 14, 3);
    block(g, x, foot - h * 0.55, w, 5, '#c9cdbd');
    block(g, x, foot - h * 0.2, w, 5, '#c9cdbd');
    wheel(g, x + 8, foot - 4, 4, false);
    wheel(g, x + w - 10, foot - 4, 4, false);
  });
}
// a hospital bed: a frame on four casters, a mattress with the blanket on it, a head board and a foot board, side rails
export function bed(g: G, x: number, foot: number, len: number, tilt = 0, blanket = '#9cb7ca') {
  tipped(g, x, foot, tilt, () => {
    const top = foot - 80;
    g.fillStyle = 'rgba(20,24,20,.35)';
    g.fillRect(x + 4, foot - 4, len, 5);
    g.fillStyle = STEEL_DARK;
    g.fillRect(x + 12, foot - 52, len - 24, 8);
    g.fillRect(x + 20, foot - 46, 6, 36);
    g.fillRect(x + len - 26, foot - 46, 6, 36);
    wheel(g, x + 24, foot - 8, 8);
    wheel(g, x + len - 24, foot - 8, 8);
    block(g, x + 8, top + 8, len - 16, 16, '#d3d3c6');
    block(g, x + 8, top - 6, len - 16, 14, blanket);
    g.fillStyle = SHEET;
    g.fillRect(x + 12, top - 12, 36, 8);
    block(g, x, foot - 108, 8, 76, '#b9a37b');
    block(g, x + len - 8, foot - 94, 8, 62, '#b9a37b');
    g.fillStyle = STEEL;
    g.fillRect(x + 14, top - 26, len - 28, 2.4);
    for (let r = x + 30; r < x + len - 24; r += 36) g.fillRect(r, top - 26, 2.4, 22);
  });
}
