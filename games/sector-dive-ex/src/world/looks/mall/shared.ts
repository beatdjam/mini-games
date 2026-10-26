import { TEX, boxPainter, grime, rowOf } from '../paint.ts';
// What the mall's wall pictures (pictures.ts, shops.ts) and its props share: the colours, the wall under every picture
// and the frieze of the shops.
// colours shared with props.ts
export const BRASS = '#a78d4e';
export const SIGN_WORDS = '#e7d5a6'; // the pale lettering of the mall's signs
export const HAZARD_YELLOW = '#b99a2c';
export const HAZARD_BLACK = '#262421';
export const SIGN_RED = '#a3322a';
export const PAPER = '#cfc9b6';
export const PAPERS = [PAPER, '#d4cdad', '#b6c0c2', '#cbb7ae', '#c1c8af'];
export const WALL_TOP = '#7d7663'; // in the ceiling's shade
export const WALL_MID = '#9a8f76';
export const WALL_FOOT = '#8c8470';
export const WAINSCOT = '#4d3622'; // the dark wood panelling along the foot of every wall
const WAINSCOT_TOP = 1.05; // m
export const SKIRTING = '#33241a';
// The kinds of shop (the order of MALL_SHOP_NAMES in i18n/signs.ts): the colour of the board over its front
export const SHOP_SIGNS = ['#6b3a52', '#5b3f2c', '#2f5440', '#2f4b6a', '#46484f', '#2f6b5b', '#7b5022'];
export const SHOP_KINDS = SHOP_SIGNS.length;

// a box with a soft shadow under and beside it, lit from above
export const box = boxPainter('rgba(14,12,10,.35)', 'rgba(255,248,230,.2)');
// a sheet of paper, a few lines of writing on it (drawn about its middle)
export function sheet(g: CanvasRenderingContext2D, rand: () => number, w: number, h: number, color: string) {
  g.fillStyle = 'rgba(14,12,10,.3)';
  g.fillRect(-w / 2 + 1.2, -h / 2 + 1.2, w, h);
  g.fillStyle = color;
  g.fillRect(-w / 2, -h / 2, w, h);
  g.fillStyle = 'rgba(40,40,46,.45)';
  for (let ly = -h / 2 + 2.5; ly < h / 2 - 1.5; ly += 2.2)
    g.fillRect(-w / 2 + 2, ly, (w - 4) * (0.5 + rand() * 0.5), 0.8);
}
// moonlight from the glass roof, a cool wash over a part of the picture
export function moon(g: CanvasRenderingContext2D, x: number, y: number, r: number, strength: number) {
  const glow = g.createRadialGradient(x, y, r * 0.1, x, y, r);
  glow.addColorStop(0, `rgba(170,196,236,${strength})`);
  glow.addColorStop(1, 'rgba(170,196,236,0)');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = glow;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.globalCompositeOperation = 'source-over';
}
// The wall of a kind of shop under its pictures (the kinds in the order of MALL_SHOP_NAMES): the colours of the wall
// from the ceiling down, the colour of the panelling at its foot, and how the wall above it is laid
interface Ground {
  top: string;
  mid: string;
  foot: string;
  wood: string;
  laid: 'plain' | 'brick' | 'boards' | 'tile';
}
const GROUNDS: Ground[] = [
  { top: '#a39c8e', mid: '#b5aea0', foot: '#a69f90', wood: '#a98d68', laid: 'plain' }, // clothes: white, light wood
  { top: '#7a4b3b', mid: '#855441', foot: '#774a3a', wood: '#5c3e26', laid: 'brick' }, // cafe: brick and wood
  { top: '#2e4535', mid: '#37513f', foot: '#304a38', wood: '#3a2616', laid: 'plain' }, // books: deep green, dark wood
  { top: '#96989a', mid: '#a5a7a4', foot: '#9a9c9a', wood: '#b9b8b0', laid: 'plain' }, // glasses: light grey and white
  { top: '#4a4c50', mid: '#56585c', foot: '#4e5054', wood: '#202022', laid: 'boards' }, // electronics: grey boards, black
  { top: '#aeada2', mid: '#bdbcb0', foot: '#b2b1a5', wood: '#aaa89c', laid: 'plain' }, // drugstore: white, bright
  { top: '#8c6038', mid: '#a06f44', foot: '#936438', wood: '#7a4c2c', laid: 'tile' }, // food court: warm tiles
];
const DEFAULT_GROUND: Ground = { top: WALL_TOP, mid: WALL_MID, foot: WALL_FOOT, wood: WAINSCOT, laid: 'plain' };
// The wall under every picture: painted panels a metre wide with a fine joint between them (or, for a shop room, the
// kind's own wall), panelling along the foot with a brass rail on top of it, the dirt of years and a water mark or two
export function panels(g: CanvasRenderingContext2D, rand: () => number, kind = -1) {
  const ground = GROUNDS[kind] ?? DEFAULT_GROUND,
    bg = g.createLinearGradient(0, 0, 0, TEX);
  bg.addColorStop(0, ground.top);
  bg.addColorStop(0.22, ground.mid);
  bg.addColorStop(0.8, ground.mid);
  bg.addColorStop(1, ground.foot);
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 70, '#aa9f86', '#4f4636');
  const foot = rowOf(0.15),
    rail = rowOf(WAINSCOT_TOP);
  if (ground.laid === 'plain')
    for (let x = 0; x < TEX; x += TEX / 4) {
      g.fillStyle = 'rgba(30,26,20,.3)';
      g.fillRect(x - 0.6, 0, 1.2, rail);
      g.fillStyle = 'rgba(255,250,236,.14)';
      g.fillRect(x + 0.6, 0, 0.8, rail);
    }
  else if (ground.laid === 'brick') {
    // courses of bricks, each course shifted half a brick
    for (let row = 0, y = 0; y < rail; row++, y += 3.4) {
      g.fillStyle = 'rgba(214,196,176,.26)';
      g.fillRect(0, y, TEX, 0.9);
      for (let x = (row % 2) * 7; x < TEX; x += 14) g.fillRect(x, y, 0.9, 3.4);
      if (rand() < 0.2) {
        g.fillStyle = 'rgba(0,0,0,.14)';
        g.fillRect(rand() * TEX, y, 14, 3.4);
      }
    }
  } else if (ground.laid === 'boards') {
    // boards of a metre by half, the joints dark
    for (let y = 0; y < rail; y += 21.3) {
      g.fillStyle = 'rgba(0,0,0,.34)';
      g.fillRect(0, y, TEX, 1);
      for (let x = (((y / 21.3) | 0) % 2) * 32; x < TEX; x += 64) g.fillRect(x, y, 1, 21.3);
    }
  } else {
    // wall tiles
    g.fillStyle = 'rgba(40,24,10,.3)';
    for (let y = 0; y < rail; y += 8) g.fillRect(0, y, TEX, 0.8);
    for (let x = 0; x < TEX; x += 12) g.fillRect(x, 0, 0.8, rail);
    g.fillStyle = 'rgba(255,230,190,.08)';
    for (let y = 0; y < rail; y += 8) g.fillRect(0, y + 0.8, TEX, 1);
  }
  for (let k = 0; k < 3; k++) {
    const len = 20 + rand() * 50,
      st = g.createLinearGradient(0, 0, 0, len);
    st.addColorStop(0, 'rgba(76,62,40,.28)');
    st.addColorStop(1, 'rgba(76,62,40,0)');
    g.fillStyle = st;
    g.fillRect(rand() * TEX, 0, 3 + rand() * 9, len);
  }
  moon(g, TEX * 0.5, rowOf(5.4), 150, 0.05);
  // the panelling: boards a quarter metre wide, a lighter edge on each, scuffed
  g.fillStyle = ground.wood;
  g.fillRect(0, rail, TEX, foot - rail);
  for (let x = 0; x < TEX; x += 16) {
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.fillRect(x, rail, 1.2, foot - rail);
    g.fillStyle = 'rgba(214,170,120,.1)';
    g.fillRect(x + 1.2, rail, 1.4, foot - rail);
  }
  for (let k = 0; k < 9; k++) {
    g.fillStyle = `rgba(20,12,6,${0.1 + rand() * 0.14})`; // scuffs from trolleys and bags
    g.fillRect(rand() * TEX, rail + 3 + rand() * (foot - rail - 6), 8 + rand() * 30, 1 + rand() * 1.5);
  }
  g.fillStyle = BRASS;
  g.fillRect(0, rail - 1.5, TEX, 3);
  g.fillStyle = 'rgba(255,244,200,.35)';
  g.fillRect(0, rail - 1.5, TEX, 1);
  g.fillStyle = SKIRTING;
  g.fillRect(0, foot, TEX, TEX - foot);
  g.fillStyle = 'rgba(255,246,226,.12)';
  g.fillRect(0, foot, TEX, 1);
}
// The band along the top of a shop room's wall: the kind's colour with a brass rim and no words (the shop's name is
// only on its front, on the concourse), a plain frieze over the goods
export function frieze(g: CanvasRenderingContext2D, kind: number) {
  const x = 0,
    y = rowOf(4.5),
    h = rowOf(4.0) - y;
  box(g, x, y, TEX, h, SHOP_SIGNS[kind]!);
  g.fillStyle = BRASS;
  g.fillRect(x, y + 2, TEX, 1.6);
  g.fillRect(x, y + h - 3.6, TEX, 1.6);
  g.fillStyle = 'rgba(0,0,0,.18)';
  for (let px = 8; px < TEX; px += 16) g.fillRect(px, y + 5, 1, h - 10);
}
