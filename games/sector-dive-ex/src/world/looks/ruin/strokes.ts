import { PAINT, css } from '../../../data/colors.ts';
import { TEX, grime, slabPainter } from '../paint.ts';
// The strokes the ruined streets' pictures share (pictures.ts: the sector; hall.ts: its collapsed hall, which is the
// boss room; props.ts and hallProps.ts: what stands in them).
// ---- the collapsed hall's colours (the pictures in hall.ts and the props in hallProps.ts share them) ----
export const DAYLIGHT = 0xd3e0c8; // the colour of the light the day throws on the ground
export const HALL_PLASTER = [0x8a8e7c, 0x7a8070, 0x696f60, 0x9a9d8a]; // heaps of fallen mortar and plaster
export const HALL_BEAM = 0x4a3f2d; // a roof beam come down, a table's legs
export const HALL_STEEL = 0x5a5f58; // the tubes of a folding chair
export const HALL_VINYL = [0x4e6a58, 0x38485c, 0x6e403a, 0x4e6a58]; // the seats of the chairs, mostly gone dull green
export const HALL_TABLETOP = 0xa49a7c; // the pale top of a folding table
export const HALL_WOOD = 0x5e4a36; // the lectern
export const HALL_WEED = 0x5f7f47; // a weed that has come up in the light
export const HALL_LAMP_GLASS = 0x9aa392; // the dead glass of a lamp
export const HALL_LAMP_METAL = 0x3b3d35; // its arm and cap
export const LEAVES = [PAINT.leaf2, PAINT.leaf3, PAINT.leaf1, PAINT.leaf4].map(css);
export const RUST = '#7c4a2b';
export const pick = <V>(rand: () => number, list: V[]): V => list[Math.floor(rand() * list.length)]!;
// adds a ragged closed outline to the path being built (a hole, a patch, a stain)
export function ragged(
  g: CanvasRenderingContext2D | Path2D,
  rand: () => number,
  x: number,
  y: number,
  rx: number,
  ry: number,
) {
  const n = 13;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2,
      r = 0.68 + rand() * 0.42;
    if (k) g.lineTo(x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r);
    else g.moveTo(x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r);
  }
  g.closePath();
}
// ... a rounded one (standing water)
export function rounded(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, rx: number, ry: number) {
  const n = 9,
    at = Array.from({ length: n }, (_, k): [number, number] => {
      const a = (k / n) * Math.PI * 2,
        r = 0.74 + rand() * 0.34;
      return [x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r];
    }),
    mid = (k: number): [number, number] => [
      (at[k % n]![0] + at[(k + 1) % n]![0]) / 2,
      (at[k % n]![1] + at[(k + 1) % n]![1]) / 2,
    ];
  g.moveTo(...mid(0));
  for (let k = 1; k <= n; k++) g.quadraticCurveTo(...at[k % n]!, ...mid(k));
  g.closePath();
}
// a crack: a jagged line that wanders on from (x, y), with a branch or two
export function crack(
  g: CanvasRenderingContext2D,
  rand: () => number,
  x: number,
  y: number,
  steps: number,
  dx: number,
  dy: number,
) {
  const branches: [number, number][] = [];
  const line = (sx: number, sy: number, n: number, bx: number, by: number, w: number) => {
    let cx = sx,
      cy = sy;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(cx, cy);
    for (let s = 0; s < n; s++) {
      cx += bx + (rand() - 0.5) * 12;
      cy += by + (rand() - 0.5) * 12;
      g.lineTo(cx, cy);
      if (w > 1 && rand() < 0.3) branches.push([cx, cy]);
    }
    g.stroke();
  };
  g.strokeStyle = 'rgba(28,32,24,.7)';
  line(x, y, steps, dx, dy, 1.6);
  branches.forEach(([bx, by]) => line(bx, by, 3, dy * 0.8 + dx * 0.4, dx * 0.8 + dy * 0.4, 0.9));
}
// one ivy leaf (round things on a wall or a door are painted flat by `aspect`)
export function leaf(
  g: CanvasRenderingContext2D,
  rand: () => number,
  x: number,
  y: number,
  size: number,
  aspect: number,
) {
  g.save();
  g.translate(x, y);
  g.scale(1, aspect);
  g.rotate(rand() * Math.PI * 2);
  for (const [o, c] of [
    [1.4, 'rgba(18,26,14,.45)'],
    [0, pick(rand, LEAVES)],
  ] as [number, string][]) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(o, -size + o);
    g.quadraticCurveTo(size * 1.1 + o, -size * 0.3 + o, o, size + o);
    g.quadraticCurveTo(-size * 1.1 + o, -size * 0.3 + o, o, -size + o);
    g.fill();
  }
  g.strokeStyle = 'rgba(190,210,160,.3)';
  g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(0, -size * 0.8);
  g.lineTo(0, size * 0.8);
  g.stroke();
  g.restore();
}
// a strand of ivy from (x, y), `steps` leaves long, growing by (dx, dy) a step: the stem first, then its leaves
export function creeper(
  g: CanvasRenderingContext2D,
  rand: () => number,
  [x, y]: [number, number],
  steps: number,
  [dx, dy]: [number, number],
  size: number,
  aspect: number,
) {
  const at: [number, number][] = [[x, y]];
  for (let s = 0; s < steps; s++) {
    const [px, py] = at[at.length - 1]!;
    at.push([px + dx + (rand() - 0.5) * size * 1.6, py + dy + (rand() - 0.5) * size * 0.6 * aspect]);
  }
  g.strokeStyle = 'rgba(52,44,30,.8)';
  g.lineWidth = 1.3;
  g.beginPath();
  at.forEach(([px, py], n) => (n ? g.lineTo(px, py) : g.moveTo(px, py)));
  g.stroke();
  at.forEach(([px, py], n) => {
    const s = size * (1 - (n / at.length) * 0.35);
    leaf(g, rand, px + (rand() - 0.5) * size * 1.7, py + (rand() - 0.5) * size * aspect, s, aspect);
    if (rand() < 0.55)
      leaf(g, rand, px + (rand() - 0.5) * size * 2.4, py + (rand() - 0.5) * size * aspect, s * 0.8, aspect);
  });
}
// damp running down a wall or a door from the top
export function damp(g: CanvasRenderingContext2D, rand: () => number, n: number) {
  for (let k = 0; k < n; k++) {
    const len = 50 + rand() * 170,
      st = g.createLinearGradient(0, 0, 0, len);
    st.addColorStop(0, 'rgba(38,48,34,.42)');
    st.addColorStop(1, 'rgba(38,48,34,0)');
    g.fillStyle = st;
    g.fillRect(rand() * TEX, 0, 3 + rand() * 12, len);
  }
}
// moss and dirt at the foot of a wall or a door
export function moss(g: CanvasRenderingContext2D, rand: () => number, from: number, strength: number) {
  const band = g.createLinearGradient(0, TEX * from, 0, TEX);
  band.addColorStop(0, 'rgba(58,78,44,0)');
  band.addColorStop(0.7, `rgba(58,78,44,${strength})`);
  band.addColorStop(1, `rgba(30,38,24,${strength + 0.2})`);
  g.fillStyle = band;
  g.fillRect(0, TEX * from, TEX, TEX * (1 - from));
  for (let k = 0; k < 90; k++) {
    g.fillStyle = rand() < 0.6 ? 'rgba(84,110,60,.5)' : 'rgba(34,46,28,.5)';
    const y = TEX - rand() * rand() * TEX * (1 - from);
    g.fillRect(rand() * TEX, y, 2 + rand() * 7, 1 + rand() * 2.5);
  }
}
// pale cracked mortar over the whole picture
export function mortar(g: CanvasRenderingContext2D, rand: () => number) {
  const bg = g.createLinearGradient(0, 0, 0, TEX);
  bg.addColorStop(0, '#858c7b');
  bg.addColorStop(0.7, '#7b8272');
  bg.addColorStop(1, '#666d5d');
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 150, '#9da492', '#3d4337');
}
// the cracks of a pane of glass: lines out from a point
export function crackLines(
  g: CanvasRenderingContext2D,
  rand: () => number,
  x: number,
  y: number,
  n: number,
  len: number,
) {
  for (let k = 0; k < n; k++) {
    const a = rand() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.4);
    g.lineTo(x + Math.cos(a + 0.2) * len, y + Math.sin(a + 0.2) * len * 0.7);
    g.stroke();
  }
}
// a tuft of grass seen from above: blades out from a point
export function tuft(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, size: number) {
  g.lineCap = 'round';
  for (let k = 0; k < 11; k++) {
    const a = rand() * Math.PI * 2,
      len = size * (0.5 + rand() * 0.6);
    g.strokeStyle = pick(rand, LEAVES);
    g.lineWidth = 1.2 + rand() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      x + Math.cos(a) * len * 0.6,
      y + Math.sin(a) * len * 0.6 - 2,
      x + Math.cos(a + 0.4) * len,
      y + Math.sin(a + 0.4) * len,
    );
    g.stroke();
  }
  g.lineCap = 'butt';
}
// a broken bit of concrete lying on the ground, with its shadow
export function chunk(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, r: number) {
  const v = 104 + Math.floor(rand() * 44);
  g.fillStyle = 'rgba(20,22,18,.5)';
  g.beginPath();
  ragged(g, rand, x + r * 0.25, y + r * 0.3, r, r * 0.8);
  g.fill();
  g.fillStyle = `rgb(${v},${v + 2},${v - 10})`;
  g.beginPath();
  ragged(g, rand, x, y, r, r * 0.8);
  g.fill();
  g.fillStyle = 'rgba(232,236,214,.2)';
  g.beginPath();
  ragged(g, rand, x - r * 0.2, y - r * 0.2, r * 0.5, r * 0.4);
  g.fill();
}
// a patch of rust, and what has run down from it
export function rustPatch(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, r: number) {
  g.fillStyle = `rgba(112,72,46,${0.3 + rand() * 0.3})`;
  g.beginPath();
  ragged(g, rand, x, y, r, r * (0.2 + rand() * 0.5));
  g.fill();
  const len = 14 + rand() * 30,
    st = g.createLinearGradient(0, y, 0, y + len);
  st.addColorStop(0, 'rgba(124,74,43,.5)');
  st.addColorStop(1, 'rgba(124,74,43,0)');
  g.fillStyle = st;
  g.fillRect(x - r * 0.5, y, r, len);
}
// a flat box with a shadow under it and a light top edge: a board, a plate, a shelf
export const slab = slabPainter('rgba(14,18,12,.45)', 'rgba(236,240,220,.16)');
