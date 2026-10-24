import { TEX, oval } from '../paint.ts';
// The strokes the smelter block's pictures share (pictures.ts: the works; hall.ts: its casting hall): rivets and plate
// joints, soot, the light of the furnaces on a wall, the raised pattern of chequer plate, and the colours of its
// warnings.
export const SAFETY_YELLOW = '#d6a419';
export const STRIPE_BLACK = '#1b1714';
export const VALVE_RED = 0xa8351f; // a valve wheel, a lever, a warning in red

// a rivet head: round on the wall, so painted flat by `aspect`
export function rivet(g: CanvasRenderingContext2D, x: number, y: number, aspect: number, r = 2.6) {
  g.fillStyle = 'rgba(0,0,0,.55)';
  oval(g, x + 0.9, y + 0.9 * aspect, r, r * aspect);
  g.fillStyle = 'rgba(150,136,124,.9)';
  oval(g, x, y, r * 0.82, r * 0.82 * aspect);
  g.fillStyle = 'rgba(255,236,214,.5)';
  oval(g, x - 0.7, y - 0.7 * aspect, r * 0.36, r * 0.36 * aspect);
}
// a joint between two plates, with its row of rivets (across the picture, or down it)
export function seam(g: CanvasRenderingContext2D, x: number, y: number, len: number, down: boolean, aspect: number) {
  g.fillStyle = 'rgba(0,0,0,.5)';
  g.fillRect(x, y, down ? 2 : len, down ? len : 2);
  g.fillStyle = 'rgba(255,230,205,.13)';
  g.fillRect(down ? x + 2 : x, down ? y : y + 2, down ? 1.5 : len, down ? len : 1.5);
  const step = down ? 16 * aspect : 16;
  for (let p = step / 2; p < len; p += step) {
    if (down) rivet(g, x - 6, y + p, aspect);
    else rivet(g, x + p, y - 6 * aspect, aspect);
  }
}
// soot: black running down from the top, and a dark cloud over the upper part
export function soot(g: CanvasRenderingContext2D, rand: () => number, n: number, x0 = 0, w = TEX) {
  const cloud = g.createLinearGradient(0, 0, 0, TEX * 0.5);
  cloud.addColorStop(0, 'rgba(12,9,7,.5)');
  cloud.addColorStop(1, 'rgba(12,9,7,0)');
  g.fillStyle = cloud;
  g.fillRect(x0, 0, w, TEX * 0.5);
  for (let k = 0; k < n; k++) {
    const len = 40 + rand() * 150,
      st = g.createLinearGradient(0, 0, 0, len);
    st.addColorStop(0, 'rgba(12,9,7,.5)');
    st.addColorStop(1, 'rgba(12,9,7,0)');
    g.fillStyle = st;
    g.fillRect(x0 + rand() * (w - 12), 0, 3 + rand() * 12, len);
  }
}
// the light of the furnaces thrown back by the foot of a wall or a door
export function heat(g: CanvasRenderingContext2D, from = 0.55, strength = 0.3) {
  const glow = g.createLinearGradient(0, TEX * from, 0, TEX);
  glow.addColorStop(0, 'rgba(255,112,36,0)');
  glow.addColorStop(1, `rgba(255,112,36,${strength})`);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = glow;
  g.fillRect(0, TEX * from, TEX, TEX * (1 - from));
  g.globalCompositeOperation = 'source-over';
}
// the raised pattern of chequer plate, inside a rectangle
export function tread(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
  g.save();
  g.beginPath();
  g.rect(x0, y0, w, h);
  g.clip();
  for (let y = y0, row = 0; y < y0 + h + 12; y += 12, row++)
    for (let x = x0 + (row % 2 ? 9 : 0), col = 0; x < x0 + w + 18; x += 18, col++) {
      g.save();
      g.translate(x, y);
      g.rotate((row + col) % 2 ? 0.75 : -0.75);
      g.fillStyle = 'rgba(0,0,0,.4)';
      g.fillRect(-5.5, -0.5, 12, 3);
      g.fillStyle = 'rgba(214,204,192,.34)';
      g.fillRect(-6, -1.5, 12, 3);
      g.restore();
    }
  g.restore();
}
