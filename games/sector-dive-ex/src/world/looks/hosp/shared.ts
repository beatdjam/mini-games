import { TEX, boxPainter, grime, rowOf, smudge } from '../paint.ts';
// What the hospital's wall pictures (pictures.ts, rooms.ts, surgery.ts) and its props share: the colours, the kinds of
// room, and the wall under every picture. A wall picture is 4 m wide and 6 m high (TEX px a side), so a metre is
// 64 px across and rowOf(1) px down.
// ---- colours shared with the other files ----
export const MINT_TOP = '#96b9a4'; // the wall in the ceiling's shade
export const MINT_MID = '#a9cbb5';
export const MINT_DADO = '#86ab95'; // the darker paint under the handrail
export const CREAM = '#d8d2b4';
export const CREAM_DARK = '#b5ad8c';
export const RAIL = '#cdbf98'; // the handrail's wood-coloured plastic
export const SKIRTING = '#4a5249';
export const STEEL = '#9aa39f'; // stainless steel and painted metal, gone dull
export const STEEL_DARK = '#59635f';
export const PLATE_WHITE = '#e3e0d0'; // enamel plates and paper
export const SIGN_GREEN = '#2c7d5b'; // the green of an emergency exit sign
export const HAZARD_YELLOW = '#d1b237';
export const HAZARD_BLACK = '#232510';
export const WARM = 'rgba(255,184,102,'; // the evening light through a window (add the opacity and ")")
export const AMBER = '#f1a64e'; // a lit bulb, an emergency lamp
export const TEAL_TILE = '#a7cbc6'; // the operating theatre's wall tiles
export const TEAL_DARK = '#6f9b98';
export const LINEN_WHITE = '#dcdcc1';
export const LINEN_BLUE = '#9cb7cb';

// The kinds of room (the order of HOSP_DEPARTMENTS in i18n/signs.ts)
export const KIND_WARD = 0,
  KIND_EXAM = 1,
  KIND_LAB = 2,
  KIND_PHARMACY = 3,
  KIND_LINEN = 4,
  KIND_WAITING = 5;
export const HOSP_KINDS = 6;
// the colour of a kind's band along the wall (and of its department board)
export const KIND_BAND = ['#6da593', '#c4a05e', '#6b97b3', '#86ad66', '#9b8bb5', '#cf9564'];

// a box with a soft shadow under and beside it, lit from above
export const box = boxPainter('rgba(14,16,12,.35)', 'rgba(255,250,232,.2)');
// the evening sun's glow on a surface: a warm wash over a part of the picture
export function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, strength: number) {
  const wash = g.createRadialGradient(x, y, r * 0.1, x, y, r);
  wash.addColorStop(0, `${WARM}${strength})`);
  wash.addColorStop(1, `${WARM}0)`);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = wash;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.globalCompositeOperation = 'source-over';
}
// a sheet of paper, a few lines of writing on it (drawn about its middle)
export function paper(g: CanvasRenderingContext2D, rand: () => number, w: number, h: number, color: string) {
  g.fillStyle = 'rgba(14,16,12,.3)';
  g.fillRect(-w / 2 + 1.2, -h / 2 + 1.2, w, h);
  g.fillStyle = color;
  g.fillRect(-w / 2, -h / 2, w, h);
  g.fillStyle = 'rgba(40,44,44,.45)';
  for (let ly = -h / 2 + 2.5; ly < h / 2 - 1.5; ly += 2.2)
    g.fillRect(-w / 2 + 2, ly, (w - 4) * (0.5 + rand() * 0.5), 0.8);
}
// a patch of paint that has come away: the plaster under it, its ragged edge, a dark rim where the damp has been
export function peeled(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, w: number, h: number) {
  g.fillStyle = 'rgba(62,56,44,.35)';
  g.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
  g.fillStyle = '#b9b3a2';
  g.beginPath();
  g.moveTo(x, y + h * 0.3);
  for (let n = 0; n <= 8; n++) g.lineTo(x + (w * n) / 8, y + (n % 2) * h * 0.25 + rand() * h * 0.12);
  for (let n = 8; n >= 0; n--) g.lineTo(x + (w * n) / 8, y + h * (0.78 + (n % 2) * 0.22) - rand() * h * 0.1);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(80,66,44,.28)';
  g.fillRect(x + w * 0.1, y + h * 0.3, w * 0.8, h * 0.35);
  // curls of paint hanging at the edge
  g.fillStyle = MINT_MID;
  for (let n = 0; n < 4; n++) g.fillRect(x + rand() * w, y + h * (0.75 + rand() * 0.2), 4 + rand() * 5, 2);
}

// The wall of a kind of room under its pictures: the colours of the wall from the ceiling down, the darker paint
// under the handrail and the stripe over it
interface Ground {
  top: string;
  mid: string;
  dado: string;
}
const GROUNDS: Ground[] = [
  { top: '#98bda8', mid: '#aad0ba', dado: '#86b09b' }, // ward: mint
  { top: '#c6c2a2', mid: '#d6d2b4', dado: '#8eb39d' }, // consulting room: cream over mint
  { top: '#97b7b3', mid: '#a8c8c3', dado: '#6e9a97' }, // examination room: blue-green
  { top: '#bcc7a2', mid: '#ccd6b2', dado: '#8cac8a' }, // pharmacy: pale sage
  { top: '#8ea99a', mid: '#9db8a8', dado: '#76867c' }, // linen room and stores: dull mint over concrete grey
  { top: '#c8c2a2', mid: '#d8d2b4', dado: '#88b09a' }, // waiting hall: cream over mint
];
const DEFAULT_GROUND: Ground = { top: MINT_TOP, mid: MINT_MID, dado: MINT_DADO };
const RAIL_TOP = 1.05; // m: the top of the handrail
const STRIPE_AT = 1.3; // m: the stripe of the department's colour over it
// The wall under every picture: painted plaster in mint green (or the kind's own), the darker paint under a wooden
// handrail on its brackets with a stripe in the department's colour over it, a rubber skirting, the dirt of years, a
// water stain or two and, now and then, a patch where the paint has come away
export function panels(g: CanvasRenderingContext2D, rand: () => number, kind = -1, bare = false) {
  const ground = GROUNDS[kind] ?? DEFAULT_GROUND,
    rail = rowOf(RAIL_TOP),
    foot = rowOf(0.12),
    bg = g.createLinearGradient(0, 0, 0, TEX);
  bg.addColorStop(0, ground.top);
  bg.addColorStop(0.22, ground.mid);
  bg.addColorStop(0.8, ground.mid);
  bg.addColorStop(1, ground.dado);
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 70, '#cdd6c0', '#46503f');
  // the darker paint under the rail
  g.fillStyle = ground.dado;
  g.fillRect(0, rail, TEX, foot - rail);
  g.fillStyle = 'rgba(255,252,236,.1)';
  g.fillRect(0, rail, TEX, 2);
  for (let x = 0; x < TEX; x += 16) {
    g.fillStyle = 'rgba(20,28,22,.16)';
    g.fillRect(x, rail, 1, foot - rail);
  }
  // scuffs from trolleys and wheelchairs
  for (let k = 0; k < 10; k++) {
    g.fillStyle = `rgba(30,34,30,${0.12 + rand() * 0.16})`;
    g.fillRect(rand() * TEX, rail + 4 + rand() * (foot - rail - 8), 8 + rand() * 26, 1 + rand() * 1.6);
  }
  // the stripe of the department's colour
  if (kind >= 0) {
    g.fillStyle = KIND_BAND[kind]!;
    g.fillRect(0, rowOf(STRIPE_AT), TEX, 5);
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.fillRect(0, rowOf(STRIPE_AT) + 5, TEX, 1.4);
  }
  // water running down the wall from above
  for (let k = 0; k < 3; k++) {
    const len = 30 + rand() * 90,
      st = g.createLinearGradient(0, 0, 0, len);
    st.addColorStop(0, 'rgba(98,86,52,.3)');
    st.addColorStop(1, 'rgba(98,86,52,0)');
    g.fillStyle = st;
    g.fillRect(rand() * TEX, 0, 3 + rand() * 10, len);
  }
  if (!bare) {
    // a stain with a tide mark, low on the wall
    if (rand() < 0.55) {
      const sx = 30 + rand() * 190,
        sy = rowOf(1.8 + rand() * 1.4);
      smudge(g, sx, sy, 22 + rand() * 20, 14 + rand() * 12, '104,92,56', 0.3);
      g.strokeStyle = 'rgba(96,80,44,.3)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(sx, sy, 26 + rand() * 10, 16 + rand() * 6, 0, 0, Math.PI * 2);
      g.stroke();
    }
    if (rand() < 0.35)
      peeled(g, rand, 20 + rand() * 170, rowOf(4.4 + rand() * 0.8), 28 + rand() * 30, 18 + rand() * 12);
  }
  glow(g, TEX * 0.5, rowOf(4.8), 140, 0.05);
  // the handrail on its brackets
  g.fillStyle = 'rgba(20,22,16,.34)';
  g.fillRect(0, rail + 2, TEX, 5);
  g.fillStyle = RAIL;
  g.fillRect(0, rail - 4, TEX, 8);
  g.fillStyle = 'rgba(255,250,224,.45)';
  g.fillRect(0, rail - 4, TEX, 2);
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.fillRect(0, rail + 2, TEX, 2);
  g.fillStyle = STEEL_DARK;
  for (let x = 32; x < TEX; x += 64) g.fillRect(x - 2, rail + 4, 4, 10);
  // the skirting
  g.fillStyle = SKIRTING;
  g.fillRect(0, foot, TEX, TEX - foot);
  g.fillStyle = 'rgba(255,250,232,.12)';
  g.fillRect(0, foot, TEX, 1);
}
