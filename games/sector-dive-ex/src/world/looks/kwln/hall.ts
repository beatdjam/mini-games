import { COLOR, css } from '../../../data/colors.ts';
import { KWLN_HALL_FORTUNE, KWLN_HALL_KAIFONG, KWLN_HALL_TEMPLE, KWLN_NEON_WORDS } from '../../../i18n/signs.ts';
import { TEX, WALL_ASPECT, grain, grime, oval, rowOf, smudge, words } from '../paint.ts';
import type { Paint } from '../paint.ts';
import {
  HALL_BRONZE,
  HALL_CANDLE,
  HALL_FLAME,
  HALL_GOLD,
  HALL_ORANGE,
  HALL_PLATE,
  HALL_STICK,
  HALL_WAX,
  KWLN_FONT,
  column,
  neonWord,
} from './strokes.ts';
// The pictures of the walled city's boss room: the square deep inside the city where a small old temple (a miao) stands,
// the one open space in it. The temple's front with its red columns, a gilded lintel and a dark doorway with candlelight;
// a wall altar with offerings and a big coil of incense; red lacquered columns against stained concrete; the flats of the
// city rising all round (windows, air conditioners, washing, cages, a few lit windows); old shuttered shops; a wall of
// neon signs, some dead; mailboxes and notices; bare stained concrete (two kinds); and two plates high up. The concrete
// is the alleys' own, kept dark, with the temple's red and gold and the neon of the flats looking down on it. Its walls
// go on up into more flats and a patch of dim sky under a mesh, and so does its ceiling. The floor is the worn stone of
// the square, with nothing red or glowing on it (the hazard floor of the sector glows). The walls are numbered after the
// sector's own (pictures.ts KWLN_WALL_PICS; they come last): they are drawn whole.
// ---- tuning numbers used only here ----
const PLATE_TOP = 5.8; // the plates high on the wall, from ... (m)
const PLATE_FOOT = 4.6; // ... to
const WINDOW_COLS = [14, 76, 138, 200]; // the windows of the flats, from the left edge of the picture (px)
const WINDOW_W = 42;
const LIT_SHARE = 0.2; // windows with a light on
const SEAM = TEX / 2; // the joints of the floor: half a tile in from the picture's edge, so none is on a tile's edge
const SHOP_BOARDS = ['#cab99b', '#ba463b', '#3d6b57']; // the faded boards of the shops

const gold = css(HALL_GOLD);
const candle = css(HALL_CANDLE);
const NEONS = [COLOR.neonPink, COLOR.neonMint, COLOR.neonGold, COLOR.neonSky];

// the wall every picture is painted on: dirty concrete (the alleys' own, a little redder with the smoke of incense),
// joints between the cast slabs, stains running down from the top
function hallWall(g: CanvasRenderingContext2D, rand: () => number) {
  const bg = g.createLinearGradient(0, 0, 0, TEX);
  bg.addColorStop(0, '#5a5047');
  bg.addColorStop(0.7, '#483f38');
  bg.addColorStop(1, '#2d2823');
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 160, '#7e7060', '#15130f');
  g.fillStyle = 'rgba(15,12,10,.35)';
  g.fillRect(0, TEX * 0.36, TEX, 2);
  g.fillRect(0, TEX * 0.7, TEX, 2);
  for (let k = 0; k < 9; k++) {
    const len = 50 + rand() * 170,
      st = g.createLinearGradient(0, 0, 0, len);
    st.addColorStop(0, 'rgba(10,8,6,.5)');
    st.addColorStop(1, 'rgba(10,8,6,0)');
    g.save();
    g.translate(rand() * TEX, 0);
    g.fillStyle = st;
    g.fillRect(0, 0, 2 + rand() * 9, len);
    g.restore();
  }
}
// the dirt at the foot, the shade at the top, and the grain
function hallShade(g: CanvasRenderingContext2D, rand: () => number) {
  const foot = g.createLinearGradient(0, TEX * 0.8, 0, TEX);
  foot.addColorStop(0, 'rgba(8,6,5,0)');
  foot.addColorStop(1, 'rgba(8,6,5,.6)');
  g.fillStyle = foot;
  g.fillRect(0, TEX * 0.8, TEX, TEX * 0.2);
  const top = g.createLinearGradient(0, 0, 0, TEX * 0.2);
  top.addColorStop(0, 'rgba(6,4,4,.4)');
  top.addColorStop(1, 'rgba(6,4,4,0)');
  g.fillStyle = top;
  g.fillRect(0, 0, TEX, TEX * 0.2);
  grain(g, rand, 18);
}
// a soft glow of `color` (an rgb triple) over a spot, laid on the light
function halo(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.translate(x, y);
  g.scale(1, WALL_ASPECT);
  const fade = g.createRadialGradient(0, 0, 0, 0, 0, r);
  fade.addColorStop(0, `rgba(${color},${a})`);
  fade.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = fade;
  g.fillRect(-r, -r, r * 2, r * 2);
  g.restore();
}
// a candle: a red stick with its flame and a little light round it
function candleAt(g: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = css(HALL_WAX);
  g.fillRect(x - 1.5, y, 3, 9);
  g.fillStyle = css(HALL_FLAME);
  g.fillRect(x - 1, y - 4, 2, 4);
  halo(g, x, y - 3, 14, '255,170,80', 0.35);
}
// a stick of incense stuck in a holder: the stick and its glowing tip
function stick(g: CanvasRenderingContext2D, x: number, y: number, len: number) {
  g.strokeStyle = css(HALL_STICK);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - len);
  g.stroke();
  g.fillStyle = candle;
  g.fillRect(x - 1, y - len - 1, 2, 2);
}

// ---- the temple's front ----
// a roof's edge in dark glazed tile, the ends of the tiles in a row along it
function eave(g: CanvasRenderingContext2D, y0: number, y1: number) {
  g.fillStyle = 'rgba(4,3,3,.5)';
  g.fillRect(0, y1, TEX, 5);
  g.fillStyle = '#2f4b46';
  g.fillRect(0, y0, TEX, y1 - y0);
  g.fillStyle = '#3f6a60';
  for (let x = 0; x < TEX; x += 9) oval(g, x + 4.5, y1, 4.5, 3.4);
  g.fillStyle = 'rgba(0,0,0,.28)';
  for (let x = 0; x < TEX; x += 9) g.fillRect(x, y0, 1, y1 - y0);
  g.fillStyle = gold;
  g.fillRect(0, y0, TEX, 2.4);
}
const temple: Paint = (g, rand) => {
  hallWall(g, rand);
  eave(g, rowOf(6), rowOf(5.35));
  // the plaque over the door: black lacquer, a gold rim, three gold characters
  const px0 = 62,
    pw = 132,
    py = rowOf(5.15),
    ph = rowOf(4.35) - py;
  g.fillStyle = 'rgba(4,3,3,.5)';
  g.fillRect(px0 + 2, py + 3, pw, ph);
  g.fillStyle = '#17110f';
  g.fillRect(px0, py, pw, ph);
  g.strokeStyle = gold;
  g.lineWidth = 2;
  g.strokeRect(px0 + 3, py + 3, pw - 6, ph - 6);
  g.fillStyle = gold;
  words(g, KWLN_HALL_TEMPLE, TEX / 2, py + ph / 2 + 1, 34, WALL_ASPECT, KWLN_FONT, pw - 14);
  // the lintel: a carved beam in dark red, gilded, a row of scrolls along it
  const ly = rowOf(4.2),
    lh = rowOf(3.6) - ly;
  g.fillStyle = 'rgba(4,3,3,.5)';
  g.fillRect(2, ly + 4, TEX - 4, lh);
  g.fillStyle = '#5f1a15';
  g.fillRect(0, ly, TEX, lh);
  g.fillStyle = gold;
  g.fillRect(0, ly, TEX, 3);
  g.fillRect(0, ly + lh - 3, TEX, 3);
  for (let x = 6; x < TEX - 8; x += 14) {
    g.fillRect(x, ly + 7, 8, 2);
    g.fillRect(x, ly + 7, 2, lh - 14);
    g.fillRect(x, ly + lh - 9, 8, 2);
    g.fillRect(x + 4, ly + 12, 3, 3);
  }
  // the doorway: dark, a threshold, the candlelight of the altar inside
  const dx = 48,
    dw = TEX - 2 * dx,
    top = ly + lh;
  g.fillStyle = '#100b09';
  g.fillRect(dx, top, dw, TEX - top);
  const within = g.createRadialGradient(TEX / 2, rowOf(1.3), 4, TEX / 2, rowOf(1.3), 90);
  within.addColorStop(0, 'rgba(255,160,70,.55)');
  within.addColorStop(1, 'rgba(255,160,70,0)');
  g.fillStyle = within;
  g.fillRect(dx, top, dw, TEX - top);
  g.fillStyle = '#7a1f19'; // the cloth of the altar table
  g.fillRect(TEX / 2 - 46, rowOf(1.05), 92, rowOf(0.35) - rowOf(1.05));
  g.fillStyle = gold;
  g.fillRect(TEX / 2 - 46, rowOf(1.05), 92, 2);
  g.fillStyle = '#c8962e'; // the seated figure behind it: a head in a crown and a wide robe, in gilt
  oval(g, TEX / 2, rowOf(1.95), 7, 7 * WALL_ASPECT);
  g.fillRect(TEX / 2 - 11, rowOf(2.2), 22, 3);
  g.beginPath();
  g.moveTo(TEX / 2 - 30, rowOf(1.1));
  g.lineTo(TEX / 2 - 9, rowOf(1.8));
  g.lineTo(TEX / 2 + 9, rowOf(1.8));
  g.lineTo(TEX / 2 + 30, rowOf(1.1));
  g.fill();
  for (const x of [-34, -18, 18, 34]) candleAt(g, TEX / 2 + x, rowOf(1.2));
  g.fillStyle = '#6a655b'; // the step
  g.fillRect(dx - 6, TEX - 12, dw + 12, 12);
  g.fillStyle = 'rgba(255,250,240,.18)';
  g.fillRect(dx - 6, TEX - 12, dw + 12, 2);
  // two door leaves folded back against the jambs, studded
  for (const lx of [dx, TEX - dx - 20]) {
    g.fillStyle = '#7a1f19';
    g.fillRect(lx, top, 20, TEX - top - 12);
    g.fillStyle = gold;
    for (let sy = top + 10; sy < TEX - 24; sy += 18) {
      oval(g, lx + 6, sy, 1.6, 1.6);
      oval(g, lx + 14, sy, 1.6, 1.6);
    }
  }
  column(g, rand, 8, 30, ly, TEX);
  column(g, rand, TEX - 38, 30, ly, TEX);
  hallShade(g, rand);
};

// ---- the wall altar ----
// a coil of incense hung from a hook: rings round a rising centre, burning at its lowest turn, a red slip hanging
function coil(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.strokeStyle = '#2b2621';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, 0);
  g.lineTo(x, y - r * WALL_ASPECT * 1.4);
  g.stroke();
  for (let k = 0; k < 6; k++) {
    g.strokeStyle = k % 2 ? '#8a7a66' : '#a8977f';
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(x, y + k * 3.2, r * (1 - k * 0.15), r * (1 - k * 0.15) * WALL_ASPECT, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = candle;
  oval(g, x, y + 20, 2.4, 2);
  halo(g, x, y + 20, 16, '255,140,60', 0.4);
  g.fillStyle = css(HALL_WAX);
  g.fillRect(x + r * 0.7, y + 6, 6, 18);
}
const altar: Paint = (g, rand) => {
  hallWall(g, rand);
  // the red board behind, gilt rim, a dark niche with a little gilt figure in it
  const bx = 26,
    bw = TEX - 52,
    by = rowOf(4.3),
    bh = rowOf(1.3) - by;
  g.fillStyle = 'rgba(4,3,3,.5)';
  g.fillRect(bx + 3, by + 4, bw, bh);
  g.fillStyle = '#7e221b';
  g.fillRect(bx, by, bw, bh);
  g.strokeStyle = gold;
  g.lineWidth = 3;
  g.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);
  g.fillStyle = 'rgba(0,0,0,.18)';
  for (let sx = bx + 14; sx < bx + bw - 8; sx += 16) g.fillRect(sx, by + 8, 1.5, bh - 16);
  const nx = TEX / 2 - 36,
    ny = rowOf(3.8),
    nh = rowOf(2.1) - ny;
  g.fillStyle = '#130d0b';
  g.fillRect(nx, ny, 72, nh);
  halo(g, TEX / 2, ny + nh * 0.6, 50, '255,170,80', 0.35);
  g.fillStyle = '#c8962e';
  oval(g, TEX / 2, ny + nh * 0.32, 7, 7 * WALL_ASPECT);
  g.fillRect(TEX / 2 - 12, ny + nh * 0.17, 24, 3);
  g.beginPath();
  g.moveTo(TEX / 2 - 8, ny + nh * 0.45);
  g.lineTo(TEX / 2 + 8, ny + nh * 0.45);
  g.lineTo(TEX / 2 + 30, ny + nh - 3);
  g.lineTo(TEX / 2 - 30, ny + nh - 3);
  g.fill();
  g.strokeStyle = gold;
  g.lineWidth = 2;
  g.strokeRect(nx, ny, 72, nh);
  // red slips with gilt dashes down both sides of the niche
  for (const sx of [bx + 14, bx + bw - 30]) {
    g.fillStyle = '#5f1a15';
    g.fillRect(sx, by + 14, 16, bh - 30);
    g.fillStyle = gold;
    for (let sy = by + 22; sy < by + bh - 24; sy += 12) g.fillRect(sx + 4, sy, 8, 3);
  }
  // the shelf, with what is offered on it
  const sy = rowOf(1.3);
  g.fillStyle = 'rgba(4,3,3,.5)';
  g.fillRect(14, sy + 3, TEX - 24, 9);
  g.fillStyle = '#3b2c1d';
  g.fillRect(12, sy, TEX - 24, 8);
  g.fillStyle = gold;
  g.fillRect(12, sy, TEX - 24, 2);
  const orange = [css(HALL_ORANGE), '#d97a22'];
  [
    [52, 0],
    [66, 0],
    [59, -9],
  ].forEach(([ox, oy], n) => {
    g.fillStyle = orange[n % 2]!;
    oval(g, ox!, sy - 7 + oy!, 7, 7 * WALL_ASPECT * 1.1);
    g.fillStyle = 'rgba(255,240,200,.35)';
    oval(g, ox! - 2, sy - 9 + oy!, 2, 1.4);
  });
  g.fillStyle = '#e8b3a0'; // red-tipped buns on a plate
  for (const ox of [186, 198, 210]) oval(g, ox, sy - 5, 6, 5 * WALL_ASPECT * 1.2);
  g.fillStyle = css(HALL_PLATE);
  g.fillRect(180, sy - 1, 36, 2);
  g.fillStyle = css(HALL_BRONZE); // the holder with its sticks, between the candles
  g.fillRect(TEX / 2 - 9, sy - 9, 18, 9);
  for (const dx of [-5, 0, 5]) stick(g, TEX / 2 + dx, sy - 9, 14 + rand() * 4);
  candleAt(g, 100, sy - 9);
  candleAt(g, 156, sy - 9);
  coil(g, 40, rowOf(5.1), 22);
  hallShade(g, rand);
};

// ---- red columns on stained concrete ----
const columns: Paint = (g, rand) => {
  hallWall(g, rand);
  for (let k = 0; k < 5; k++) {
    // the damp coming up from the foot between them
    smudge(g, rand() * TEX, TEX * (0.8 + rand() * 0.2), 30 + rand() * 30, 40 + rand() * 30, '20,14,10', 0.2);
  }
  for (const x of [4, 108, 212]) column(g, rand, x, 40, 0, TEX);
  hallShade(g, rand);
};

// ---- the flats ----
// one window of the flats: dark, or lit warm, mint or pink; bars over it, a unit under it, washing across it
function flat(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, w: number, h: number, dim = 1) {
  const kind = rand(),
    litTone = ['#e8c26e', '#a8e6cc', '#d0508a'][Math.floor(rand() * 3)]!;
  g.fillStyle = 'rgba(4,3,3,.5)';
  g.fillRect(x - 3, y - 3, w + 6, h + 7);
  g.fillStyle = '#26221e';
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  const lit = kind < LIT_SHARE;
  if (lit) {
    const glass = g.createLinearGradient(0, y, 0, y + h);
    glass.addColorStop(0, litTone);
    glass.addColorStop(1, 'rgba(120,80,40,1)');
    g.fillStyle = glass;
    g.globalAlpha = 0.9 * dim;
  } else g.fillStyle = '#15171a';
  g.fillRect(x, y, w, h);
  g.globalAlpha = 1;
  if (!lit) {
    g.fillStyle = 'rgba(160,170,190,.1)'; // the sky in the glass
    g.fillRect(x + 3, y + 3, w * 0.35, h * 0.3);
  }
  if (kind > 0.55 && kind < 0.8) {
    // a cage of bars built out round it
    g.strokeStyle = '#8a8478';
    g.lineWidth = 1.2;
    for (let bx = x + 5; bx < x + w; bx += 6) {
      g.beginPath();
      g.moveTo(bx, y);
      g.lineTo(bx, y + h);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(x, y + h / 2);
    g.lineTo(x + w, y + h / 2);
    g.stroke();
  } else if (kind >= 0.8) {
    // washing on a pole across it
    g.fillStyle = '#2b2621';
    g.fillRect(x - 4, y + 4, w + 8, 1.6);
    ['#3b5e89', '#d9d1c1', '#7d302d', '#b69e49'].forEach((c, n) => {
      g.fillStyle = c;
      g.fillRect(x + 2 + n * (w / 4), y + 6, w / 4 - 3, h * (0.35 + rand() * 0.35));
    });
  }
  if (kind > 0.3 && kind < 0.55) {
    // an air conditioner under it
    g.fillStyle = '#6c6c67';
    g.fillRect(x + 4, y + h + 3, w - 8, 16);
    g.fillStyle = '#1d1d1b';
    oval(g, x + w * 0.35, y + h + 11, 5, 5 * WALL_ASPECT * 1.2);
    g.fillRect(x + w * 0.62, y + h + 6, w * 0.25, 2);
    g.fillRect(x + w * 0.62, y + h + 11, w * 0.25, 2);
    g.fillStyle = 'rgba(110,60,30,.4)';
    g.fillRect(x + 4, y + h + 14, w - 8, 5);
  }
  g.fillStyle = '#5a5248'; // the slab under the sill
  g.fillRect(x - 6, y + h + 2, w + 12, 3);
}
const flats: Paint = (g, rand) => {
  hallWall(g, rand);
  g.fillStyle = 'rgba(20,16,13,.3)';
  g.fillRect(0, 0, TEX, TEX);
  for (const m of [1.5, 3.2, 4.9]) {
    const y = rowOf(m + 1);
    WINDOW_COLS.forEach(x => flat(g, rand, x + rand() * 6, y, WINDOW_W, rowOf(m) - y - 14));
  }
  g.strokeStyle = '#3a3733'; // a drain pipe down the front
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(TEX - 4, 0);
  g.lineTo(TEX - 4, TEX);
  g.stroke();
  hallShade(g, rand);
};

// ---- old shops, shuttered ----
const shops: Paint = (g, rand) => {
  hallWall(g, rand);
  [6, 134].forEach((x, n) => {
    const w = 116,
      sy = rowOf(2.7);
    g.fillStyle = 'rgba(4,3,3,.45)';
    g.fillRect(x + 3, rowOf(4.1) + 3, w, TEX);
    // the faded board over the shop, bars of old paint where the words were
    g.fillStyle = SHOP_BOARDS[n % SHOP_BOARDS.length]!;
    g.globalAlpha = 0.8;
    g.fillRect(x, rowOf(4.1), w, rowOf(3.1) - rowOf(4.1));
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(30,20,16,.55)';
    for (let k = 0; k < 6; k++) g.fillRect(x + 10 + k * 17, rowOf(3.9), 10 + rand() * 4, rowOf(3.3) - rowOf(3.9));
    g.fillStyle = '#1d1b17';
    g.fillRect(x, rowOf(3.1), w, TEX - rowOf(3.1));
    // the shutter, one of them rolled half up on a dark inside with a bulb
    const up = n === 1 ? 70 : 0,
      steel = g.createLinearGradient(0, sy, 0, TEX);
    if (up) {
      g.fillStyle = '#0e0d0b';
      g.fillRect(x + 6, sy, w - 12, up);
      halo(g, x + w / 2, sy + 22, 40, '255,200,120', 0.4);
      g.fillStyle = '#fff2d0';
      oval(g, x + w / 2, sy + 10, 3, 2.4);
    }
    steel.addColorStop(0, '#506c5d');
    steel.addColorStop(1, '#32483d');
    g.fillStyle = steel;
    g.fillRect(x + 6, sy + up, w - 12, TEX - sy - up);
    for (let ry = sy + up; ry < TEX; ry += 9) {
      g.fillStyle = 'rgba(0,0,0,.4)';
      g.fillRect(x + 6, ry, w - 12, 2);
      g.fillStyle = 'rgba(190,220,200,.14)';
      g.fillRect(x + 6, ry + 2, w - 12, 1.5);
    }
    g.fillStyle = '#ba463b'; // a red paper pasted on it
    g.globalAlpha = 0.75;
    g.fillRect(x + 20 + rand() * 40, sy + up + 14, 18, 26);
    g.globalAlpha = 1;
  });
  hallShade(g, rand);
};

// ---- neon ----
// a sign of tubes: a box of mounting rail with its words read down, lit or dead
function neonSign(g: CanvasRenderingContext2D, x: number, y: number, text: string, color: number, lit: boolean) {
  const h = text.length * 30 * WALL_ASPECT + 12;
  g.fillStyle = 'rgba(4,3,3,.5)';
  g.fillRect(x - 17, y - 6, 38, h);
  g.fillStyle = '#16130f';
  g.fillRect(x - 19, y - 8, 38, h);
  if (lit) halo(g, x, y + h / 2, 50, `${(color >> 16) & 255},${(color >> 8) & 255},${color & 255}`, 0.28);
  neonWord(g, text, x, y + 10, 30, color, lit);
}
const neon: Paint = (g, rand) => {
  hallWall(g, rand);
  g.fillStyle = 'rgba(16,12,10,.4)';
  g.fillRect(0, 0, TEX, TEX);
  const signs: [number, number, number, boolean][] = [
    [30, rowOf(5.4), 0, true],
    [86, rowOf(4.6), 1, false],
    [146, rowOf(5.2), 2, true],
    [214, rowOf(4.4), 3, true],
  ];
  for (const [x, y, n, lit] of signs) neonSign(g, x, y, KWLN_NEON_WORDS[n * 2]!, NEONS[n]!, lit);
  // a round sign and a bar of tube lit mint, and the wires from them to a box
  g.strokeStyle = css(NEONS[1]!);
  g.shadowColor = css(NEONS[1]!);
  g.shadowBlur = 8;
  g.lineWidth = 2.4;
  g.beginPath();
  g.ellipse(120, rowOf(2.6), 24, 24 * WALL_ASPECT, 0, 0, Math.PI * 2);
  g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = '#4a443d';
  g.lineWidth = 1.4;
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    g.moveTo(40 + k * 60, rowOf(3.5));
    g.quadraticCurveTo(60 + k * 40, rowOf(2.0) + rand() * 20, 20 + k * 80, rowOf(1.4));
    g.stroke();
  }
  g.fillStyle = '#4a4a46';
  g.fillRect(14, rowOf(1.8), 34, 26);
  g.fillStyle = '#1d1d1b';
  g.fillRect(18, rowOf(1.8) + 5, 26, 3);
  hallShade(g, rand);
};

// ---- mailboxes and notices ----
const mailboxes: Paint = (g, rand) => {
  hallWall(g, rand);
  // the notice board: a wooden frame, papers pasted over each other
  const nx = 32,
    ny = rowOf(4.4),
    nw = TEX - 64,
    nh = rowOf(2.6) - ny;
  g.fillStyle = 'rgba(4,3,3,.5)';
  g.fillRect(nx + 3, ny + 3, nw, nh);
  g.fillStyle = '#3b2c1d';
  g.fillRect(nx, ny, nw, nh);
  g.fillStyle = '#7c6c4d';
  g.fillRect(nx + 4, ny + 4, nw - 8, nh - 8);
  const paper = ['#d8d2c0', '#c9b46a', '#a33a30', '#8fa59a', '#d8d2c0'];
  for (let k = 0; k < 14; k++) {
    const x = nx + 8 + rand() * (nw - 40),
      y = ny + 8 + rand() * (nh - 34);
    g.fillStyle = paper[k % paper.length]!;
    g.fillRect(x, y, 14 + rand() * 12, 14 + rand() * 12);
    g.fillStyle = 'rgba(30,24,20,.6)';
    for (let l = 0; l < 3; l++) g.fillRect(x + 2, y + 3 + l * 4, 8 + rand() * 6, 1.2);
  }
  // the mailboxes, two rows of eight, a few doors hanging open
  for (let row = 0; row < 2; row++)
    for (let c = 0; c < 8; c++) {
      const x = 8 + c * 30,
        y = rowOf(2.45 - row * 0.8),
        open = rand() < 0.12;
      g.fillStyle = 'rgba(4,3,3,.45)';
      g.fillRect(x + 2, y + 2, 27, rowOf(1.7 - row * 0.8) - y - 3);
      g.fillStyle = '#5d6a62';
      g.fillRect(x, y, 27, rowOf(1.7 - row * 0.8) - y - 3);
      g.fillStyle = open ? '#0d0d0c' : '#47544b';
      g.fillRect(x + 3, y + 3, 21, 9);
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.fillRect(x + 8, y + 15, 11, 1.5);
      g.fillStyle = 'rgba(255,255,255,.12)';
      g.fillRect(x, y, 27, 1.6);
    }
  hallShade(g, rand);
};

// ---- bare concrete, two kinds ----
const stained: Paint = (g, rand) => {
  hallWall(g, rand);
  for (let k = 0; k < 6; k++)
    smudge(g, rand() * TEX, rand() * TEX * 0.6, 20 + rand() * 40, 30 + rand() * 60, '14,10,8', 0.16 + rand() * 0.1);
  g.fillStyle = '#4c4944'; // a drain pipe in its brackets
  g.fillRect(196, 0, 9, TEX);
  g.fillStyle = 'rgba(255,255,255,.14)';
  g.fillRect(197, 0, 2, TEX);
  g.fillStyle = '#2a2724';
  for (const y of [40, 120, 200]) g.fillRect(193, y, 15, 5);
  g.fillStyle = '#55524c'; // a small grey box with its wires
  g.fillRect(52, rowOf(3.2), 36, 32);
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.fillRect(52, rowOf(3.2), 36, 3);
  g.strokeStyle = '#17140f';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(70, rowOf(3.2));
  g.lineTo(70, 0);
  g.moveTo(80, rowOf(3.2) + 32);
  g.quadraticCurveTo(120, rowOf(2.1), 160, rowOf(2.4));
  g.stroke();
  hallShade(g, rand);
};
const patched: Paint = (g, rand) => {
  hallWall(g, rand);
  // the plaster fallen off in one place: the brick under it
  const x = 38 + rand() * 60,
    y = rowOf(3.6),
    w = 96,
    h = 70;
  g.fillStyle = '#6b3d30';
  g.fillRect(x, y, w, h);
  for (let by = y; by < y + h; by += 9) {
    g.fillStyle = 'rgba(20,12,10,.55)';
    g.fillRect(x, by, w, 1.6);
    for (let bx = x + (((by - y) / 9) % 2) * 12; bx < x + w; bx += 24) g.fillRect(bx, by, 1.6, 9);
  }
  g.strokeStyle = '#2b2621';
  g.lineWidth = 2;
  g.strokeRect(x - 1, y - 1, w + 2, h + 2);
  g.strokeStyle = 'rgba(8,6,5,.6)'; // cracks
  g.lineWidth = 1.5;
  for (let k = 0; k < 3; k++) {
    let cx = 20 + rand() * (TEX - 40),
      cy = rowOf(5) + rand() * 40;
    g.beginPath();
    g.moveTo(cx, cy);
    for (let s = 0; s < 6; s++) {
      cx += (rand() - 0.5) * 26;
      cy += 12 + rand() * 16;
      g.lineTo(cx, cy);
    }
    g.stroke();
  }
  g.strokeStyle = 'rgba(225,220,205,.45)'; // chalk: a child's circle and a line of squares
  g.lineWidth = 1.4;
  g.beginPath();
  g.ellipse(190, rowOf(1.4), 14, 14 * WALL_ASPECT, 0, 0, Math.PI * 2);
  for (let k = 0; k < 4; k++) g.rect(20 + k * 16, rowOf(0.9), 16, 11);
  g.stroke();
  hallShade(g, rand);
};

// ---- the plates high up ----
// a red diamond with a gilt character over a base picture
const fortuneWall =
  (base: Paint): Paint =>
  (g, rand) => {
    base(g, rand);
    const cx = 76,
      cy = (rowOf(PLATE_TOP) + rowOf(PLATE_FOOT)) / 2,
      r = 34;
    g.save();
    g.translate(cx, cy);
    g.scale(1, WALL_ASPECT);
    g.rotate(Math.PI / 4);
    g.fillStyle = 'rgba(4,3,3,.5)';
    g.fillRect(-r * 0.7 + 3, -r * 0.7 + 3, r * 1.4, r * 1.4);
    g.fillStyle = '#ba4a36';
    g.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
    g.strokeStyle = gold;
    g.lineWidth = 2.4;
    g.strokeRect(-r * 0.7 + 4, -r * 0.7 + 4, r * 1.4 - 8, r * 1.4 - 8);
    g.restore();
    g.fillStyle = gold;
    words(g, KWLN_HALL_FORTUNE, cx, cy + 1, 38, WALL_ASPECT, KWLN_FONT);
  };
// a white board with blue letters over a base picture
const kaifongWall =
  (base: Paint): Paint =>
  (g, rand) => {
    base(g, rand);
    const w = TEX - 40,
      top = rowOf(PLATE_TOP),
      h = rowOf(PLATE_FOOT) - top;
    g.fillStyle = 'rgba(2,0,6,.5)';
    g.fillRect(22, top + 2, w, h);
    g.fillStyle = '#d9d5c6';
    g.fillRect(20, top, w, h);
    g.strokeStyle = '#27406a';
    g.lineWidth = 3;
    g.strokeRect(24, top + 4, w - 8, h - 8);
    g.fillStyle = '#27406a';
    words(g, KWLN_HALL_KAIFONG, TEX / 2, top + h / 2 + 1, 50, WALL_ASPECT, KWLN_FONT, w - 40);
  };

// the walls by number, after the sector's (pictures.ts)
export const KWLN_HALL_WALLS: Paint[] = [
  temple,
  altar,
  columns,
  flats,
  shops,
  neon,
  mailboxes,
  stained,
  patched,
  fortuneWall(columns),
  kaifongWall(mailboxes),
];
const [TEMPLE, ALTAR, COLUMNS, FLATS, SHOPS, NEON, MAILBOXES, STAINED, PATCHED, SIGN_FORTUNE, SIGN_KAIFONG] =
  KWLN_HALL_WALLS.map((_, n) => n);
// the walls of the hall by the share of it each picture takes: each is in the list as many times as it comes up (the
// temple's front, the columns and the flats take most of it)
export const KWLN_HALL_MAP = [
  TEMPLE,
  TEMPLE,
  TEMPLE,
  ALTAR,
  ALTAR,
  COLUMNS,
  COLUMNS,
  COLUMNS,
  FLATS,
  FLATS,
  FLATS,
  SHOPS,
  SHOPS,
  NEON,
  NEON,
  MAILBOXES,
  STAINED,
  STAINED,
  PATCHED,
  PATCHED,
  SIGN_FORTUNE,
  SIGN_KAIFONG,
].map(n => n!);
// what is set up by the hall's walls (hallProps.ts): where the incense is lit (the temple's front, the altar, the
// columns), where a neon sign stands out on its bracket, where the washing is hung
export const KWLN_HALL_SHRINE = [TEMPLE!, ALTAR!, COLUMNS!, SIGN_FORTUNE!];
export const KWLN_HALL_SIGNED = [NEON!, FLATS!, SHOPS!];
export const KWLN_HALL_HANGING = [FLATS!, SHOPS!, MAILBOXES!, SIGN_KAIFONG!];

// ---- the floor: the worn stone of the square ----
// Slabs of grey stone, joints running across the picture half a tile in from its edge, so that none is on a tile's edge
// (the slabs of the next row are offset by half a slab), worn in patches; the painter is given the same seed for every
// variant, so the wear runs on across the edge. Variant 0 bare, 1 joss-paper ash and scraps of red paper, 2 a round
// iron cover, 3 old chalk marks
const hallFloor =
  (variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = '#3c3935';
    g.fillRect(0, 0, TEX, TEX);
    for (let k = 0; k < 46; k++)
      smudge(
        g,
        rand() * TEX,
        rand() * TEX,
        14 + rand() * 46,
        10 + rand() * 30,
        rand() < 0.55 ? '14,12,10' : '140,130,116',
        0.06 + rand() * 0.11,
      );
    g.fillStyle = 'rgba(8,7,6,.55)';
    g.fillRect(0, SEAM - 0.75, TEX, 1.5);
    g.fillRect(SEAM - 0.75, 0, 1.5, SEAM);
    for (const x of [TEX / 4, (TEX * 3) / 4]) g.fillRect(x - 0.75, SEAM, 1.5, SEAM);
    g.fillStyle = 'rgba(200,190,170,.1)';
    g.fillRect(0, SEAM + 0.75, TEX, 1);
    g.fillRect(SEAM + 0.75, 0, 1, SEAM);
    if (variant === 1) {
      // ash from the burning of joss paper, and scraps of red and gold paper that have not burnt
      for (let k = 0; k < 7; k++)
        smudge(g, rand() * TEX, rand() * TEX, 12 + rand() * 18, 8 + rand() * 12, '20,18,16', 0.4);
      for (let k = 0; k < 9; k++) {
        g.fillStyle = k % 3 ? 'rgba(150,50,40,.8)' : 'rgba(200,160,70,.75)';
        g.save();
        g.translate(rand() * TEX, rand() * TEX);
        g.rotate(rand() * 3);
        g.fillRect(-4, -2.5, 8, 5);
        g.restore();
      }
    } else if (variant === 2) {
      // a round iron cover with rings and a cross, in a worn frame
      const cx = 128 + (rand() - 0.5) * 20,
        cy = 128;
      g.fillStyle = '#0d0d0b';
      oval(g, cx, cy, 44, 44);
      g.fillStyle = '#4b4942';
      oval(g, cx, cy, 40, 40);
      g.strokeStyle = '#2b2a25';
      g.lineWidth = 2.5;
      for (const r of [32, 22, 12]) {
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(cx - 38, cy);
      g.lineTo(cx + 38, cy);
      g.moveTo(cx, cy - 38);
      g.lineTo(cx, cy + 38);
      g.stroke();
      g.fillStyle = 'rgba(200,190,170,.14)';
      g.fillRect(cx - 38, cy - 40, 76, 2);
    } else if (variant === 3) {
      // chalk: a line of squares for a game, a circle, an arrow
      g.strokeStyle = 'rgba(225,220,205,.5)';
      g.lineWidth = 2;
      g.beginPath();
      for (let k = 0; k < 4; k++) g.rect(40 + k * 34, 70, 34, 30);
      g.rect(74, 100, 34, 30);
      g.rect(108, 100, 34, 30);
      g.stroke();
      g.beginPath();
      g.arc(190, 180, 22, 0, Math.PI * 2);
      g.moveTo(60, 190);
      g.lineTo(120, 190);
      g.lineTo(110, 182);
      g.moveTo(120, 190);
      g.lineTo(110, 198);
      g.stroke();
    }
    grain(g, rand, 18);
  };
export const KWLN_HALL_FLOORS: Paint[] = [0, 1, 2, 3].map(hallFloor);

// ---- the wall above the usual height (a tile wide, as high as the boss room goes above the usual wall) ----
const SKY_SHARE = 0.2; // the share of its height at the top that is a patch of sky under mesh
const MESH_STEP = 16; // the mesh's squares (px)
// the dim sky of a city that never sees the sun, behind a wire mesh with a tarpaulin pinned on it, and the mesh's wires
function skyMesh(g: CanvasRenderingContext2D, rand: () => number, h: number, tarp: boolean) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#242a3f');
  sky.addColorStop(1, '#3a3f56');
  g.fillStyle = sky;
  g.fillRect(0, 0, TEX, h);
  for (let k = 0; k < 6; k++)
    smudge(g, rand() * TEX, rand() * h, 40 + rand() * 40, 8 + rand() * 12, '120,126,160', 0.14);
  if (tarp) {
    g.fillStyle = '#2b4a4c';
    g.fillRect(20 + rand() * 80, 0, 70, h * 0.6);
  }
  g.strokeStyle = 'rgba(8,8,12,.7)';
  g.lineWidth = 1.2;
  g.beginPath();
  for (let x = -h; x < TEX + h; x += MESH_STEP) {
    g.moveTo(x, 0);
    g.lineTo(x + h, h);
    g.moveTo(x + h, 0);
    g.lineTo(x, h);
  }
  g.stroke();
  g.fillStyle = '#1a1a20';
  g.fillRect(0, h, TEX, 5);
}
// cables slung from a flat to the next, sagging
function sag(g: CanvasRenderingContext2D, rand: () => number, n: number) {
  g.strokeStyle = 'rgba(8,6,5,.85)';
  for (let k = 0; k < n; k++) {
    const y = TEX * (0.3 + rand() * 0.6);
    g.lineWidth = 1 + rand() * 1.8;
    g.beginPath();
    g.moveTo(0, y);
    g.quadraticCurveTo(TEX / 2, y + 16 + rand() * 24, TEX, y + (rand() - 0.5) * 20);
    g.stroke();
  }
}
// the flats going on up, darker: rows of windows, a few lit, the pipes up the front, cables across, and the sky above
export const kwlnHallUpper: Paint = (g, rand) => {
  hallWall(g, rand);
  g.fillStyle = 'rgba(14,11,9,.5)';
  g.fillRect(0, 0, TEX, TEX);
  for (const m of [0.3, 0.52, 0.74]) {
    const y = TEX * (SKY_SHARE + m * 0.8 - 0.2);
    WINDOW_COLS.forEach(x => flat(g, rand, x + rand() * 6, y, WINDOW_W, 28, 0.7));
  }
  for (const x of [28, 224]) {
    g.fillStyle = '#3b3833';
    g.fillRect(x, 0, 6, TEX);
    g.fillStyle = 'rgba(255,255,255,.1)';
    g.fillRect(x + 1, 0, 1.5, TEX);
  }
  sag(g, rand, 4);
  skyMesh(g, rand, TEX * SKY_SHARE, true);
  const dim = g.createLinearGradient(0, 0, 0, TEX);
  dim.addColorStop(0, 'rgba(6,4,4,0)');
  dim.addColorStop(1, 'rgba(6,4,4,.45)');
  g.fillStyle = dim;
  g.fillRect(0, 0, TEX, TEX);
  grain(g, rand, 14);
};

// ---- the ceiling: a patch of sky and mesh ----
// from below: the dim sky, a mesh across it both ways, a tarpaulin or two, cables sagging across
export const kwlnHallCeiling: Paint = (g, rand) => {
  skyMesh(g, rand, TEX, false);
  g.fillStyle = 'rgba(40,52,70,.7)';
  g.fillRect(150, 140, 90, 70);
  g.strokeStyle = 'rgba(8,8,12,.5)';
  g.lineWidth = 1;
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    g.moveTo(150 + k * 24, 140);
    g.lineTo(150 + k * 24 + 6, 210);
    g.stroke();
  }
  sag(g, rand, 5);
  halo(g, 40, 220, 60, '255,150,110', 0.08);
  grain(g, rand, 12);
};
