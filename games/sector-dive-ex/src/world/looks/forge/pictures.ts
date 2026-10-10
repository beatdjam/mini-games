import { PAINT, css } from '../../../data/colors.ts';
import { FORGE_DANGER, FORGE_PLATE_HEAT, FORGE_PLATE_SAFETY } from '../../../i18n/signs.ts';
import type { Pictures } from '../common.ts';
import {
  DOOR_ASPECT,
  SIGN_FONT,
  TEX,
  WALL_ASPECT,
  grain,
  grime,
  oval,
  paint,
  rowOf,
  smudge,
  stripes,
} from '../paint.ts';
import type { Paint } from '../paint.ts';
// The smelter block (FORGE): a steelworks. Sooty riveted iron and firebrick, girders overhead, thick pipes on the
// walls, and the orange of the furnaces thrown back by everything.
// ---- tuning numbers used only here ----
const FORGE_FLOORS = 4; // 0 bare concrete, 1 a chequer-plate cover, 2 oil and soot, 3 a grating
const SAFETY_YELLOW = '#d6a419';
const STRIPE_BLACK = '#1b1714';
// black and yellow warning stripes in a band, worn
const warning = (g: CanvasRenderingContext2D, band: [number, number, number, number], pitch: number) =>
  stripes(g, band, pitch, SAFETY_YELLOW, STRIPE_BLACK, 'rgba(20,14,10,.25)');

// a rivet head: round on the wall, so painted flat by `aspect`
function rivet(g: CanvasRenderingContext2D, x: number, y: number, aspect: number, r = 2.6) {
  g.fillStyle = 'rgba(0,0,0,.55)';
  oval(g, x + 0.9, y + 0.9 * aspect, r, r * aspect);
  g.fillStyle = 'rgba(150,136,124,.9)';
  oval(g, x, y, r * 0.82, r * 0.82 * aspect);
  g.fillStyle = 'rgba(255,236,214,.5)';
  oval(g, x - 0.7, y - 0.7 * aspect, r * 0.36, r * 0.36 * aspect);
}
// a joint between two plates, with its row of rivets (across the picture, or down it)
function seam(g: CanvasRenderingContext2D, x: number, y: number, len: number, down: boolean, aspect: number) {
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
function soot(g: CanvasRenderingContext2D, rand: () => number, n: number, x0 = 0, w = TEX) {
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
function heat(g: CanvasRenderingContext2D, from = 0.55, strength = 0.3) {
  const glow = g.createLinearGradient(0, TEX * from, 0, TEX);
  glow.addColorStop(0, 'rgba(255,112,36,0)');
  glow.addColorStop(1, `rgba(255,112,36,${strength})`);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = glow;
  g.fillRect(0, TEX * from, TEX, TEX * (1 - from));
  g.globalCompositeOperation = 'source-over';
}
// sooty iron plate over the whole picture
function iron(g: CanvasRenderingContext2D, rand: () => number) {
  const bg = g.createLinearGradient(0, 0, 0, TEX);
  bg.addColorStop(0, '#514a45');
  bg.addColorStop(0.7, '#49423d');
  bg.addColorStop(1, '#3b3430');
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 150, '#766b62', '#1d1815');
  // rust blooming here and there
  for (let k = 0; k < 14; k++) {
    g.globalAlpha = 0.1 + rand() * 0.14;
    g.fillStyle = '#8f4a26';
    oval(g, rand() * TEX, rand() * TEX, 6 + rand() * 22, 4 + rand() * 12);
  }
  g.globalAlpha = 1;
}
// three courses of plates, their upright joints staggered
function plating(g: CanvasRenderingContext2D) {
  const course = TEX / 3;
  for (let c = 0; c < 3; c++) {
    if (c) seam(g, 0, c * course, TEX, false, WALL_ASPECT);
    seam(g, c % 2 ? TEX * 0.75 : TEX * 0.25, c * course + 2, course - 2, true, WALL_ASPECT);
  }
}
// firebrick: ochre courses blackened by the heat, held between iron uprights at the picture's two edges
const BRICKS = ['#8b6247', '#7a5540', '#977158', '#6c4b3a', '#85583d', '#a07a5c'];
function firebrick(g: CanvasRenderingContext2D, rand: () => number) {
  const bw = 32,
    bh = 9;
  g.fillStyle = css(PAINT.soot5);
  g.fillRect(0, 0, TEX, TEX);
  for (let row = 0, y = 0; y < TEX; row++, y += bh)
    for (let x = row % 2 ? -bw / 2 : 0; x < TEX; x += bw) {
      g.fillStyle = BRICKS[Math.floor(rand() * BRICKS.length)]!;
      g.fillRect(x, y, bw - 1.5, bh - 1.5);
      g.fillStyle = `rgba(20,12,8,${rand() * 0.4})`; // some are burnt darker
      g.fillRect(x, y, bw - 1.5, bh - 1.5);
      g.fillStyle = 'rgba(255,225,190,.12)';
      g.fillRect(x, y, bw - 1.5, 1.5);
    }
  grime(g, rand, 90, '#a88a70', '#1a120e');
  // the uprights that hold the brickwork, and a strap across it
  for (const x of [0, TEX - 12]) {
    g.fillStyle = '#3e3733';
    g.fillRect(x, 0, 12, TEX);
    g.fillStyle = 'rgba(255,230,205,.14)';
    g.fillRect(x ? x : 10, 0, 2, TEX);
    for (let y = 9; y < TEX; y += 22) rivet(g, x + 6, y, WALL_ASPECT, 2.2);
  }
  g.fillStyle = '#3e3733';
  g.fillRect(0, rowOf(3.4), TEX, 9);
  for (let x = 20; x < TEX; x += 24) rivet(g, x, rowOf(3.4) + 4.5, WALL_ASPECT, 2.2);
}
// an enamel plate with words on it (`left`: this much of it is kept clear of the words, for a mark)
function wordPlate(
  g: CanvasRenderingContext2D,
  [x, y, w, h]: [number, number, number, number],
  board: string,
  ink: string,
  words: string,
  left = 0,
) {
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.fillRect(x + 2, y + 2, w, h);
  g.fillStyle = board;
  g.fillRect(x, y, w, h);
  g.strokeStyle = ink;
  g.lineWidth = 2;
  g.strokeRect(x + 3, y + 2.5, w - 6, h - 5);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(x + left + (w - left) / 2, y + h / 2 + 1);
  g.scale(1, WALL_ASPECT);
  g.font = `900 ${Math.floor((w - left - 14) / words.length)}px ${SIGN_FONT}`;
  g.fillText(words, 0, 0, w - left - 12);
  g.restore();
  // chipped and rusty at the edges
  g.fillStyle = 'rgba(110,55,25,.5)';
  g.fillRect(x, y + h - 3, w * 0.3, 3);
  g.fillRect(x + w - 5, y, 5, h * 0.35);
}
// a warning triangle and the plate under it at eye height, a striped band low down
const warningPlates: Paint = g => {
  const cx = TEX * 0.5,
    top = rowOf(2.75),
    foot = rowOf(1.95);
  g.fillStyle = STRIPE_BLACK;
  g.beginPath();
  g.moveTo(cx, top - 3);
  g.lineTo(cx + 32, foot + 2);
  g.lineTo(cx - 32, foot + 2);
  g.fill();
  g.fillStyle = SAFETY_YELLOW;
  g.beginPath();
  g.moveTo(cx, top + 4);
  g.lineTo(cx + 25, foot - 1.5);
  g.lineTo(cx - 25, foot - 1.5);
  g.fill();
  g.fillStyle = STRIPE_BLACK;
  g.fillRect(cx - 2.5, top + 13, 5, 11);
  oval(g, cx, foot - 5.5, 3, 3 * WALL_ASPECT);
  wordPlate(g, [cx - 58, rowOf(1.85), 116, 24], SAFETY_YELLOW, STRIPE_BLACK, FORGE_PLATE_HEAT);
  warning(g, [0, rowOf(0.95), TEX, 13], 22);
};
// a cast iron hatch in the brickwork, the fire showing through its spy hole and round its edge
const furnaceHatch: Paint = g => {
  const x = 70,
    w = TEX - 140,
    y = rowOf(2.5),
    h = rowOf(0.9) - y,
    cx = TEX / 2,
    cy = y + h * 0.42;
  g.globalCompositeOperation = 'lighter';
  const wash = g.createRadialGradient(cx, cy, 20, cx, cy, 120);
  wash.addColorStop(0, 'rgba(255,120,40,.5)');
  wash.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = wash;
  g.fillRect(0, 0, TEX, TEX);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#ffb057'; // the gap round the hatch
  g.fillRect(x - 3, y - 2, w + 6, h + 4);
  const plate = g.createLinearGradient(0, y, 0, y + h);
  plate.addColorStop(0, '#3a3431');
  plate.addColorStop(1, '#2a2523');
  g.fillStyle = plate;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,225,200,.12)';
  g.fillRect(x, y, w, 2);
  g.strokeStyle = 'rgba(0,0,0,.5)';
  g.lineWidth = 2;
  g.strokeRect(x + 8, y + 5, w - 16, h - 10);
  for (const [rx, ry] of [
    [x + 5, y + 4],
    [x + w - 5, y + 4],
    [x + 5, y + h - 4],
    [x + w - 5, y + h - 4],
    [cx, y + 4],
    [cx, y + h - 4],
  ] as [number, number][])
    rivet(g, rx, ry, WALL_ASPECT, 2.4);
  // the spy hole: white hot in the middle
  const fire = g.createRadialGradient(cx, cy, 1, cx, cy, 20);
  fire.addColorStop(0, '#fff3cf');
  fire.addColorStop(0.45, '#ffb24c');
  fire.addColorStop(1, '#d9480f');
  g.fillStyle = STRIPE_BLACK;
  oval(g, cx, cy, 24, 24 * WALL_ASPECT);
  g.fillStyle = fire;
  oval(g, cx, cy, 18, 18 * WALL_ASPECT);
  g.fillStyle = STRIPE_BLACK;
  g.fillRect(cx - 18, cy - 1, 36, 2);
  // hinges on one side, a latch bar on the other
  g.fillStyle = '#211d1b';
  g.fillRect(x - 9, y + 6, 16, 6);
  g.fillRect(x - 9, y + h - 12, 16, 6);
  g.fillRect(x + w - 22, cy + 14, 30, 5);
};
// corrugated sheet, a rail across it
const corrugated = (g: CanvasRenderingContext2D) => {
  for (let x = 0; x < TEX; x += 8) {
    g.fillStyle = 'rgba(0,0,0,.26)';
    g.fillRect(x, 0, 3, TEX);
    g.fillStyle = 'rgba(255,232,210,.09)';
    g.fillRect(x + 4, 0, 2, TEX);
  }
  seam(g, 0, rowOf(3.4), TEX, false, WALL_ASPECT);
};
// a switchboard with its gauges and lamps, a conduit up to the roof
const switchboard: Paint = (g, rand) => {
  const x = 78,
    w = 100,
    y = rowOf(2.6),
    h = rowOf(1.0) - y;
  g.fillStyle = '#2b2725';
  g.fillRect(x + w / 2 - 5, 0, 10, y);
  g.fillStyle = 'rgba(0,0,0,.5)';
  g.fillRect(x + 3, y + 3, w, h);
  g.fillStyle = '#5c675f';
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.14)';
  g.fillRect(x, y, w, 2);
  g.strokeStyle = 'rgba(0,0,0,.45)';
  g.lineWidth = 2;
  g.strokeRect(x + 5, y + 4, w - 10, h - 8);
  for (const gx of [x + 28, x + w - 28]) {
    g.fillStyle = '#181513';
    oval(g, gx, y + 20, 16, 16 * WALL_ASPECT);
    g.fillStyle = '#d9d2c0';
    oval(g, gx, y + 20, 13, 13 * WALL_ASPECT);
    g.strokeStyle = '#8c1f14';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(gx, y + 20);
    g.lineTo(gx + 7 - rand() * 14, y + 14);
    g.stroke();
  }
  ['#e0452b', '#e9a23b', '#6fcf6a'].forEach((c, n) => {
    g.fillStyle = '#181513';
    oval(g, x + 26 + n * 24, y + 42, 6, 6 * WALL_ASPECT);
    g.fillStyle = c;
    oval(g, x + 26 + n * 24, y + 42, 4.2, 4.2 * WALL_ASPECT);
  });
  g.fillStyle = '#2b2725';
  for (let n = 0; n < 4; n++) g.fillRect(x + 16 + n * 19, y + 52, 10, 8);
};
// the works' safety board: a green cross and the words
const safetyBoard: Paint = g => {
  const x = 38,
    w = TEX - 76,
    y = rowOf(3.1),
    h = 32;
  wordPlate(g, [x, y, w, h], '#ddd6c2', '#1f6a3c', FORGE_PLATE_SAFETY, 34);
  g.fillStyle = '#1f6a3c';
  g.fillRect(x + 18, y + 7, 8, h - 14);
  g.fillRect(x + 9, y + h / 2 - 2.7, 26, 5.4);
  g.fillStyle = 'rgba(20,14,10,.22)';
  g.fillRect(x, y, w, h);
};
// The wall pictures: what each wall is made of (iron plate, bare or with riveted plating over it; firebrick;
// corrugated sheet) and what is on it. The first is the plainest and comes up most (variantOf)
interface ForgeWall {
  made: 'iron' | 'plated' | 'brick' | 'sheet';
  on?: Paint;
  soot?: number; // how many streaks of soot (8 when not given)
}
export const FORGE_WALL_PICS: ForgeWall[] = [
  { made: 'plated', soot: 12 }, // riveted iron plate
  { made: 'brick' },
  { made: 'plated', on: warningPlates },
  { made: 'brick', on: furnaceHatch },
  { made: 'sheet', on: switchboard },
  { made: 'plated', on: safetyBoard },
  { made: 'sheet' }, // (WALL_SHEET)
];
const forgeWall =
  (pic: ForgeWall): Paint =>
  (g, rand) => {
    if (pic.made === 'brick') firebrick(g, rand);
    else iron(g, rand);
    if (pic.made === 'plated') plating(g);
    if (pic.made === 'sheet') corrugated(g);
    pic.on?.(g, rand);
    soot(g, rand, pic.soot ?? 8);
    heat(g);
    grain(g, rand, 20);
  };

// the raised pattern of chequer plate, inside a rectangle
function tread(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
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
// The ground: the same concrete under every variant (the painter is given the same seed for all of them), with soft
// patches that run on across the picture's edge, so the floor reads as one surface and not as tiles
const forgeFloor =
  (variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = '#4c4640';
    g.fillRect(0, 0, TEX, TEX);
    for (let k = 0; k < 46; k++) {
      const dark = rand() < 0.6;
      smudge(
        g,
        rand() * TEX,
        rand() * TEX,
        14 + rand() * 46,
        10 + rand() * 30,
        dark ? '22,17,14' : '122,110,98',
        0.1 + rand() * 0.2,
      );
    }
    // scale and spatter: small bright and dark flecks
    for (let k = 0; k < 150; k++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(20,15,12,.5)' : 'rgba(160,140,120,.3)';
      g.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 2.5, 1 + rand() * 2.5);
    }
    // everything below stays clear of the picture's edge
    g.strokeStyle = 'rgba(14,10,8,.55)';
    g.lineWidth = 1.3;
    for (let k = 0; k < 2; k++) {
      let x = 50 + rand() * (TEX - 100),
        y = 50 + rand() * (TEX - 100);
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x = Math.min(TEX - 20, Math.max(20, x + (rand() - 0.5) * 50));
        y = Math.min(TEX - 20, Math.max(20, y + (rand() - 0.5) * 50));
        g.lineTo(x, y);
      }
      g.stroke();
    }
    if (variant === 1) {
      // a chequer-plate cover over a trench, in an angle-iron frame
      const x = 46,
        y = 70,
        w = 164,
        h = 116;
      g.fillStyle = '#1e1a18';
      g.fillRect(x - 5, y - 5, w + 10, h + 10);
      g.fillStyle = '#5b5550';
      g.fillRect(x, y, w, h);
      tread(g, x, y, w, h);
      g.fillStyle = '#16120f';
      for (const hx of [x + 16, x + w - 16]) oval(g, hx, y + h / 2, 5, 3);
      const worn = g.createRadialGradient(x + w / 2, y + h / 2, 10, x + w / 2, y + h / 2, 100);
      worn.addColorStop(0, 'rgba(210,198,186,.16)');
      worn.addColorStop(1, 'rgba(20,14,10,.3)');
      g.fillStyle = worn;
      g.fillRect(x, y, w, h);
    } else if (variant === 2) {
      // spilt oil and soot: dark, with a dull sheen at its rim
      const cx = 96 + rand() * 64,
        cy = 96 + rand() * 64;
      for (let k = 0; k < 6; k++) {
        const px = cx + (rand() - 0.5) * 70,
          py = cy + (rand() - 0.5) * 70,
          r = 22 + rand() * 30;
        smudge(g, px, py, r + 6, (r + 6) * 0.7, '96,104,112', 0.2);
        smudge(g, px, py, r, r * 0.7, '10,8,7', 0.75);
      }
    } else if (variant === 3) {
      // a bar grating over a pit
      const x = 80,
        y = 84,
        w = 96,
        h = 88;
      g.fillStyle = '#0f0c0b';
      g.fillRect(x, y, w, h);
      g.fillStyle = '#57514b';
      for (let b = 0; b < w; b += 6) g.fillRect(x + b + 1, y, 2.5, h);
      g.fillStyle = '#3d3834';
      for (let b = 20; b < h; b += 24) g.fillRect(x, y + b, w, 4);
      g.strokeStyle = '#69625b';
      g.lineWidth = 4;
      g.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
    grain(g, rand, 18);
  };
// the top of a deck or a ramp: chequer plate with a striped edge, so where a deck ends shows
const forgeDeck: Paint = (g, rand) => {
  g.fillStyle = '#5a544e';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 70, '#7c746b', '#1f1a17');
  tread(g, 0, 0, TEX, TEX);
  const band = 12;
  warning(g, [0, 0, TEX, band], 24);
  warning(g, [0, TEX - band, TEX, band], 24);
  g.save();
  g.translate(TEX / 2, TEX / 2);
  g.rotate(Math.PI / 2);
  g.translate(-TEX / 2, -TEX / 2);
  warning(g, [band, 0, TEX - band * 2, band], 24);
  warning(g, [band, TEX - band, TEX - band * 2, band], 24);
  g.restore();
  grain(g, rand, 18);
};
// an I-beam seen from below, across the picture or down it: two bright flange edges, a rusty soffit, a shadow beside it
function girder(g: CanvasRenderingContext2D, at: number, width: number, down: boolean) {
  const bar = (o: number, w: number, c: string) => {
    g.fillStyle = c;
    if (down) g.fillRect(at - width / 2 + o, 0, w, TEX);
    else g.fillRect(0, at - width / 2 + o, TEX, w);
  };
  bar(-5, width + 10, 'rgba(0,0,0,.4)');
  bar(0, width, '#5a4a3d');
  bar(0, 2.5, 'rgba(255,206,160,.4)');
  bar(width - 2.5, 2.5, 'rgba(0,0,0,.45)');
  bar(width / 2 - 2, 4, 'rgba(0,0,0,.2)');
}
// the roof from below: corrugated sheet on purlins, carried by girders that run on from tile to tile both ways
const forgeCeiling: Paint = (g, rand) => {
  g.fillStyle = css(PAINT.soot7);
  g.fillRect(0, 0, TEX, TEX);
  for (let x = 0; x < TEX; x += 16) {
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(x, 0, 6, TEX);
    g.fillStyle = 'rgba(255,214,176,.07)';
    g.fillRect(x + 9, 0, 3, TEX);
  }
  grime(g, rand, 60, css(PAINT.soot15), css(PAINT.ink1));
  girder(g, TEX * 0.25, 9, false);
  girder(g, TEX * 0.75, 9, false);
  girder(g, TEX / 2, 26, true);
  girder(g, TEX / 2, 26, false);
  // the plate where the two girders meet, bolted
  g.fillStyle = '#66574a';
  g.fillRect(TEX / 2 - 24, TEX / 2 - 24, 48, 48);
  g.strokeStyle = 'rgba(0,0,0,.45)';
  g.lineWidth = 2;
  g.strokeRect(TEX / 2 - 24, TEX / 2 - 24, 48, 48);
  for (const dx of [-16, 16]) for (const dy of [-16, 16]) rivet(g, TEX / 2 + dx, TEX / 2 + dy, 1, 3);
  for (let p = 16; p < TEX; p += 32)
    if (Math.abs(p - TEX / 2) > 30) {
      rivet(g, TEX / 2, p, 1, 2.4);
      rivet(g, p, TEX / 2, 1, 2.4);
    }
  grain(g, rand, 14);
};
// One leaf of a works door (a leaf is 2 m wide and a wall high, so its picture is stretched three times as tall):
// a painted steel fire door hung from a track, with a wired window and a striped kick plate. The boss room's is
// black iron between warning stripes, the fire behind it showing through slits near the top, and the warning written
// on a red plate below the height of the door's "BOSS" label (world/doors.ts BOSS_LABEL_Y), so the two do not cover
// each other
const forgeDoor =
  (boss: boolean): Paint =>
  (g, rand) => {
    const steel = g.createLinearGradient(0, 0, TEX, 0);
    steel.addColorStop(0, boss ? '#34302e' : '#586a72');
    steel.addColorStop(0.5, boss ? '#454040' : '#6f838b');
    steel.addColorStop(1, boss ? '#2f2b2a' : '#4e5f67');
    g.fillStyle = steel;
    g.fillRect(0, 0, TEX, TEX);
    grime(g, rand, 110, boss ? '#6a6360' : '#93a4aa', '#14110f');
    // stiffening bars across the plate and a frame, all riveted
    g.fillStyle = boss ? '#201d1c' : '#3d4a50';
    const bars = [boss ? 4.55 : 4.9, 2.95, 1.0]; // m above the floor
    for (const m of bars) g.fillRect(0, rowOf(m) - 4, TEX, 8);
    g.fillRect(0, 0, 16, TEX);
    g.fillRect(TEX - 16, 0, 16, TEX);
    for (let y = 8; y < TEX; y += 13) {
      rivet(g, 8, y, DOOR_ASPECT, 4);
      rivet(g, TEX - 8, y, DOOR_ASPECT, 4);
    }
    for (const m of bars) for (let x = 40; x < TEX - 30; x += 36) rivet(g, x, rowOf(m), DOOR_ASPECT, 4);
    // the track it hangs from, and its rollers
    g.fillStyle = '#1c1918';
    g.fillRect(0, 0, TEX, 9);
    for (const x of [TEX * 0.25, TEX * 0.75]) {
      g.fillStyle = '#1c1918';
      g.fillRect(x - 12, 9, 24, 7);
      g.fillStyle = css(PAINT.grey8);
      oval(g, x, 9, 14, 14 * DOOR_ASPECT);
    }
    if (boss) {
      warning(g, [16, rowOf(5.75), TEX - 32, rowOf(5.3) - rowOf(5.75)], 46);
      // the slits: white hot inside, their light on the plate round them
      const sy = rowOf(5.12),
        sh = rowOf(4.78) - sy;
      g.globalCompositeOperation = 'lighter';
      const halo = g.createLinearGradient(0, sy - 16, 0, sy + sh + 16);
      halo.addColorStop(0, 'rgba(255,110,30,0)');
      halo.addColorStop(0.5, 'rgba(255,110,30,.55)');
      halo.addColorStop(1, 'rgba(255,110,30,0)');
      g.fillStyle = halo;
      g.fillRect(16, sy - 16, TEX - 32, sh + 32);
      g.globalCompositeOperation = 'source-over';
      for (const x of [40, 108, 176]) {
        const fire = g.createLinearGradient(0, sy, 0, sy + sh);
        fire.addColorStop(0, '#ff7a1c');
        fire.addColorStop(0.5, '#fff1c4');
        fire.addColorStop(1, '#ff7a1c');
        g.fillStyle = STRIPE_BLACK;
        g.fillRect(x - 3, sy - 1.5, 46, sh + 3);
        g.fillStyle = fire;
        g.fillRect(x, sy, 40, sh);
      }
      // the red plate with the warning, one character over the other
      const top = rowOf(2.85),
        foot = rowOf(1.1);
      g.fillStyle = '#b3261a';
      g.fillRect(40, top, TEX - 80, foot - top);
      g.strokeStyle = '#f2e6cf';
      g.lineWidth = 6;
      g.strokeRect(49, top + 3, TEX - 98, foot - top - 6);
      g.fillStyle = '#f2e6cf';
      g.font = `900 108px ${SIGN_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.save();
      g.scale(1, DOOR_ASPECT);
      const step = (foot - top) / FORGE_DANGER.length;
      [...FORGE_DANGER].forEach((ch, n) => g.fillText(ch, TEX / 2, (top + step * (n + 0.5)) / DOOR_ASPECT + 6));
      g.restore();
      warning(g, [16, rowOf(0.85), TEX - 32, rowOf(0.15) - rowOf(0.85)], 46);
    } else {
      // a wired window at eye height: dark glass with the works' fires in it
      const wx = 62,
        ww = TEX - 124,
        wy = rowOf(2.05),
        wh = rowOf(1.45) - wy;
      g.fillStyle = '#23282b';
      g.fillRect(wx - 8, wy - 3, ww + 16, wh + 6);
      const glass = g.createLinearGradient(0, wy, 0, wy + wh);
      glass.addColorStop(0, '#2d2622');
      glass.addColorStop(1, '#c2682a');
      g.fillStyle = glass;
      g.fillRect(wx, wy, ww, wh);
      g.strokeStyle = 'rgba(15,12,10,.6)';
      g.lineWidth = 1;
      for (let x = wx + 13; x < wx + ww; x += 13) {
        g.beginPath();
        g.moveTo(x, wy);
        g.lineTo(x, wy + wh);
        g.stroke();
      }
      for (let y = wy + 4.3; y < wy + wh; y += 4.3) {
        g.beginPath();
        g.moveTo(wx, y);
        g.lineTo(wx + ww, y);
        g.stroke();
      }
      // a pull handle, and the striped kick plate
      g.fillStyle = '#1c1918';
      g.fillRect(TEX / 2 - 44, rowOf(1.25), 88, 3.5);
      warning(g, [16, rowOf(0.75), TEX - 32, rowOf(0.2) - rowOf(0.75)], 46);
    }
    const dirt = g.createLinearGradient(0, 0, 0, TEX * 0.3);
    dirt.addColorStop(0, 'rgba(12,9,7,.5)');
    dirt.addColorStop(1, 'rgba(12,9,7,0)');
    g.fillStyle = dirt;
    g.fillRect(0, 0, TEX, TEX * 0.3);
    heat(g, 0.86, boss ? 0.5 : 0.3);
    grain(g, rand, 20);
  };

// The molten floor: an iron grating over a casting channel. `glow` is what lights up while it is live: the metal
// running in the channel, seen between the bars
const GRATE = { bars: 7, bar: 0.5 }; // bars across the picture, and the share of each pitch that is iron
const forgeHazard: Paint = (g, rand) => {
  // the channel below: dull, cooling
  g.fillStyle = '#2a1512';
  g.fillRect(0, 0, TEX, TEX);
  for (let n = 0; n < 40; n++) {
    g.fillStyle = `rgba(120,48,24,${0.15 + rand() * 0.25})`;
    g.fillRect(rand() * TEX, rand() * TEX, 10 + rand() * 40, 4 + rand() * 12);
  }
  // the bars, and the frame they sit in
  const pitch = TEX / GRATE.bars;
  for (let n = 0; n < GRATE.bars; n++) {
    const x = n * pitch + (pitch * (1 - GRATE.bar)) / 2,
      w = pitch * GRATE.bar,
      iron = g.createLinearGradient(x, 0, x + w, 0);
    iron.addColorStop(0, '#1a1715');
    iron.addColorStop(0.45, '#3b3531');
    iron.addColorStop(1, '#131110');
    g.fillStyle = iron;
    g.fillRect(x, 0, w, TEX);
  }
  g.fillStyle = '#1d1a18';
  for (const y of [0, TEX * 0.48, TEX - 16]) g.fillRect(0, y, TEX, 16);
  g.fillRect(0, 0, 16, TEX);
  g.fillRect(TEX - 16, 0, 16, TEX);
  soot(g, rand, 26);
  grain(g, rand, 16);
};
const forgeHazardGlow: Paint = (g, rand) => {
  g.fillStyle = '#000';
  g.fillRect(0, 0, TEX, TEX);
  // the metal in the channel: bright, with brighter streams in it
  g.fillStyle = 'rgba(255,255,255,.7)';
  g.fillRect(0, 0, TEX, TEX);
  for (let n = 0; n < 26; n++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.5})`;
    g.fillRect(rand() * TEX, rand() * TEX, 20 + rand() * 70, 5 + rand() * 12);
  }
  // the bars and the frame stay dark (a little light spills on their edges)
  const pitch = TEX / GRATE.bars;
  g.fillStyle = 'rgba(0,0,0,.86)';
  for (let n = 0; n < GRATE.bars; n++) g.fillRect(n * pitch + (pitch * (1 - GRATE.bar)) / 2, 0, pitch * GRATE.bar, TEX);
  for (const y of [0, TEX * 0.48, TEX - 16]) g.fillRect(0, y, TEX, 16);
  g.fillRect(0, 0, 16, TEX);
  g.fillRect(TEX - 16, 0, 16, TEX);
};

// the smelter block's look (world/looks.ts makes it the first time the sector is drawn)
export function forgePictures(): Pictures {
  return {
    walls: FORGE_WALL_PICS.map((pic, v) => paint(600 + v, forgeWall(pic))),
    floors: Array.from({ length: FORGE_FLOORS }, (_, v) => paint(700, forgeFloor(v))),
    deck: paint(800, forgeDeck),
    ceiling: paint(900, forgeCeiling),
    door: paint(1000, forgeDoor(false)),
    bossDoor: paint(1001, forgeDoor(true)),
    fog: 0x150e0b,
    hazard: { base: paint(1010, forgeHazard), glow: paint(1011, forgeHazardGlow) },
  };
}
