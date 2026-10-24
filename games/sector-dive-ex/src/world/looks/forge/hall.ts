import { PAINT, css } from '../../../data/colors.ts';
import { FORGE_HALL_KEEP_OUT, FORGE_HALL_MOLTEN, FORGE_PLATE_HEAT } from '../../../i18n/signs.ts';
import { SIGN_FONT, TEX, WALL_ASPECT, grain, grime, oval, rowOf, smudge, words } from '../paint.ts';
import type { Paint } from '../paint.ts';
import { SAFETY_YELLOW, STRIPE_BLACK, VALVE_RED, heat, rivet, seam, soot, tread } from './strokes.ts';
// The pictures of the smelter block's casting hall, which is its boss room: sooty firebrick between cast iron columns
// over a plate skirting, blast furnace mouths with the fire white-hot inside, a tapping spout, rows of ingot moulds,
// a control board with its gauges, and plates high up that say what the place is. Its floor is chequer plate, its
// walls go on up in blackened brick and a runway girder, and its ceiling is roof steel with lattice trusses. The walls
// are numbered after the plant's own (pictures.ts FORGE_WALL_PICS; they come last): they are drawn whole.
// ---- tuning numbers used only here ----
const COLUMN = 18; // px across a cast iron column at each edge of a wall picture (0.28 m; a column every tile)
const SKIRT_TOP = 1.15; // top of the plate skirting along the foot of a wall (m)
const BRICK_W = 30; // px, a brick and ...
const BRICK_H = 9; // ... its height
const MOUTH = { half: 62, foot: 0.55, spring: 2.6 }; // a furnace mouth: half its width (px), the sill and where the arch springs (m)
const SHELVES = [4.1, 2.95, 1.8]; // the shelves of the mould wall (m)
const PLATE_TOP = 5.75; // the plates high on the wall, from ... (m)
const PLATE_FOOT = 4.55; // ... to (m)
const FLOOR_JOINT = TEX / 2; // the plates of the floor meet through the middle of its picture, none on a tile's edge
const SPLASH_POINTS = 14; // corners of the ragged outline of a splash of set iron on the floor
const FIRE = ['#fff7d0', '#ffd25a', '#ff8a24', '#8a2a0c']; // the fire: white-hot, yellow, orange, dark
const BRICKS = ['#6b4a38', '#5a3f31', '#765440', '#4f372c', '#6a4130', '#80604a'];
const CAST = '#2e2926'; // cast iron
const CAST_LIT = '#4d4640';
const SMOKE = '#1b1411';

// brick in sooty courses, burnt darker here and there
function brick(g: CanvasRenderingContext2D, rand: () => number, bottom: number) {
  g.fillStyle = SMOKE;
  g.fillRect(0, 0, TEX, bottom);
  for (let row = 0, y = 0; y < bottom; row++, y += BRICK_H)
    for (let x = row % 2 ? -BRICK_W / 2 : 0; x < TEX; x += BRICK_W) {
      g.fillStyle = BRICKS[Math.floor(rand() * BRICKS.length)]!;
      g.fillRect(x, y, BRICK_W - 1.5, BRICK_H - 1.5);
      g.fillStyle = `rgba(14,9,6,${0.3 + rand() * 0.4})`;
      g.fillRect(x, y, BRICK_W - 1.5, BRICK_H - 1.5);
      g.fillStyle = 'rgba(255,210,170,.08)';
      g.fillRect(x, y, BRICK_W - 1.5, 1.5);
    }
  grime(g, rand, 70, '#8b6b53', '#0f0a08');
}
// a cast iron column from the top of the picture to its foot, riveted, with a capital and a base block
function column(g: CanvasRenderingContext2D, x: number) {
  const iron = g.createLinearGradient(x, 0, x + COLUMN, 0);
  iron.addColorStop(0, CAST);
  iron.addColorStop(0.4, CAST_LIT);
  iron.addColorStop(1, '#221e1c');
  g.fillStyle = iron;
  g.fillRect(x, 0, COLUMN, TEX);
  g.fillStyle = 'rgba(255,225,200,.14)';
  g.fillRect(x + (x ? 3 : COLUMN - 4), 0, 1.5, TEX);
  for (const y of [0, rowOf(5.2), rowOf(SKIRT_TOP) - 2]) {
    g.fillStyle = '#3a3330';
    g.fillRect(x - (x ? 3 : 0), y, COLUMN + 3, 9);
  }
  for (let y = 28; y < TEX; y += 26) rivet(g, x + COLUMN / 2, y, WALL_ASPECT, 2.1);
}
// the wall every picture is painted on: the brick, the plate skirting with its rivets and the angle iron that caps it, a
// girder across the top, a column at each edge, soot, and the heat of the furnaces on its foot
function hallWall(g: CanvasRenderingContext2D, rand: () => number) {
  const rail = rowOf(SKIRT_TOP);
  brick(g, rand, rail);
  const plate = g.createLinearGradient(0, rail, 0, TEX);
  plate.addColorStop(0, '#3a3430');
  plate.addColorStop(1, '#2a2522');
  g.fillStyle = plate;
  g.fillRect(0, rail, TEX, TEX - rail);
  seam(g, TEX / 2, rail + 2, TEX - rail - 2, true, WALL_ASPECT);
  g.fillStyle = '#4f4741';
  g.fillRect(0, rail - 3, TEX, 5);
  g.fillStyle = 'rgba(255,225,200,.2)';
  g.fillRect(0, rail - 3, TEX, 1);
  g.fillStyle = '#35302d';
  g.fillRect(0, 0, TEX, 10);
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.fillRect(0, 10, TEX, 3);
  column(g, 0);
  column(g, TEX - COLUMN);
  soot(g, rand, 12);
  heat(g, 0.6, 0.38);
}
// the wall, finished: dirt over everything
const finish = (g: CanvasRenderingContext2D, rand: () => number) => {
  grime(g, rand, 30, '#7a6a5e', '#0d0907');
  grain(g, rand, 16);
};

// a plain wall; the second has riveted iron plates over the brick, rust running from their joints
const plainWall =
  (plated: boolean): Paint =>
  (g, rand) => {
    hallWall(g, rand);
    if (plated) {
      const top = rowOf(4.9),
        foot = rowOf(SKIRT_TOP) - 4,
        course = (foot - top) / 3;
      g.fillStyle = '#3d3733';
      g.fillRect(COLUMN, top, TEX - 2 * COLUMN, foot - top);
      for (let c = 0; c < 3; c++) {
        if (c) seam(g, COLUMN, top + c * course, TEX - 2 * COLUMN, false, WALL_ASPECT);
        seam(g, c % 2 ? TEX * 0.7 : TEX * 0.35, top + c * course + 2, course - 2, true, WALL_ASPECT);
      }
      grime(g, rand, 60, '#6c5f55', '#16110f');
      for (let k = 0; k < 8; k++) {
        const len = 20 + rand() * 60,
          rust = g.createLinearGradient(0, 0, 0, len);
        rust.addColorStop(0, 'rgba(140,72,36,.4)');
        rust.addColorStop(1, 'rgba(140,72,36,0)');
        g.save();
        g.translate(COLUMN + rand() * (TEX - 2 * COLUMN - 6), top + rand() * (foot - top - 30));
        g.fillStyle = rust;
        g.fillRect(0, 0, 2 + rand() * 4, len);
        g.restore();
      }
    }
    finish(g, rand);
  };

// the outline of a furnace mouth: straight sides, an arch over them. `grow`: this much bigger all round (px)
function mouthPath(g: CanvasRenderingContext2D, grow: number) {
  const cx = TEX / 2,
    foot = rowOf(MOUTH.foot),
    spring = rowOf(MOUTH.spring);
  g.beginPath();
  g.moveTo(cx - MOUTH.half - grow, foot);
  g.lineTo(cx - MOUTH.half - grow, spring);
  g.ellipse(cx, spring, MOUTH.half + grow, (MOUTH.half + grow) * WALL_ASPECT, 0, Math.PI, 2 * Math.PI);
  g.lineTo(cx + MOUTH.half + grow, foot);
  g.closePath();
}
// a blast furnace's mouth: a ring of lighter firebrick, an iron frame, and inside the fire, white-hot in the middle and
// orange at the edges; the light of it on the wall round it, and a sill with slag that has run over it
const furnaceMouth: Paint = (g, rand) => {
  hallWall(g, rand);
  const cx = TEX / 2,
    foot = rowOf(MOUTH.foot),
    spring = rowOf(MOUTH.spring);
  // the arch of firebrick, its bricks marked
  mouthPath(g, 18);
  g.fillStyle = '#8a6048';
  g.fill();
  g.strokeStyle = 'rgba(20,10,6,.55)';
  g.lineWidth = 2;
  for (let a = Math.PI; a <= 2 * Math.PI + 0.01; a += Math.PI / 14) {
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (MOUTH.half + 8), spring + Math.sin(a) * (MOUTH.half + 8) * WALL_ASPECT);
    g.lineTo(cx + Math.cos(a) * (MOUTH.half + 18), spring + Math.sin(a) * (MOUTH.half + 18) * WALL_ASPECT);
    g.stroke();
  }
  mouthPath(g, 8);
  g.fillStyle = '#26211f';
  g.fill();
  g.strokeStyle = 'rgba(255,225,200,.25)';
  g.lineWidth = 1.5;
  g.stroke();
  // the fire
  mouthPath(g, 0);
  const fire = g.createRadialGradient(cx, spring + 24, 6, cx, spring + 24, 112);
  fire.addColorStop(0, FIRE[0]!);
  fire.addColorStop(0.28, FIRE[1]!);
  fire.addColorStop(0.62, FIRE[2]!);
  fire.addColorStop(1, FIRE[3]!);
  g.fillStyle = fire;
  g.fill();
  g.save();
  mouthPath(g, 0);
  g.clip();
  const edges = g.createLinearGradient(cx - MOUTH.half, 0, cx + MOUTH.half, 0);
  edges.addColorStop(0, 'rgba(40,10,0,.7)');
  edges.addColorStop(0.2, 'rgba(40,10,0,0)');
  edges.addColorStop(0.8, 'rgba(40,10,0,0)');
  edges.addColorStop(1, 'rgba(40,10,0,.7)');
  g.fillStyle = edges;
  g.fillRect(0, 0, TEX, TEX);
  g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 14; k++) {
    g.fillStyle = `rgba(255,${190 + Math.floor(rand() * 50)},90,${0.12 + rand() * 0.2})`;
    g.fillRect(cx - MOUTH.half + rand() * MOUTH.half, spring - 30 + rand() * (foot - spring + 30), 20 + rand() * 60, 3);
  }
  g.restore();
  // the sill, and slag that ran over it
  g.fillStyle = '#2c2724';
  g.fillRect(cx - MOUTH.half - 26, foot, 2 * MOUTH.half + 52, rowOf(MOUTH.foot - 0.28) - foot);
  g.fillStyle = 'rgba(255,225,200,.2)';
  g.fillRect(cx - MOUTH.half - 26, foot, 2 * MOUTH.half + 52, 1.5);
  for (let k = 0; k < 4; k++) {
    const x = cx - MOUTH.half + 10 + rand() * (2 * MOUTH.half - 30),
      len = 6 + rand() * 22,
      drip = g.createLinearGradient(0, foot, 0, foot + len);
    drip.addColorStop(0, FIRE[1]!);
    drip.addColorStop(1, FIRE[2]!);
    g.fillStyle = drip;
    g.fillRect(x, foot, 4 + rand() * 3, len);
  }
  // the light of it on the wall
  g.globalCompositeOperation = 'lighter';
  const wash = g.createRadialGradient(cx, spring + 30, 30, cx, spring + 30, 150);
  wash.addColorStop(0, 'rgba(255,130,40,.45)');
  wash.addColorStop(1, 'rgba(255,130,40,0)');
  g.fillStyle = wash;
  g.fillRect(0, 0, TEX, TEX);
  g.globalCompositeOperation = 'source-over';
  finish(g, rand);
};

// the tapping side of a furnace: a mound of clay with the tap hole in it, a spout, and the stream of metal falling from
// the spout into the trough that stands before the wall (hallProps.ts)
const furnaceTap: Paint = (g, rand) => {
  hallWall(g, rand);
  const cx = TEX / 2,
    holeY = rowOf(2.3),
    lipY = rowOf(1.45);
  // the iron boss round the hole and the clay mound
  g.fillStyle = '#2c2724';
  g.fillRect(cx - 54, holeY - 34, 108, 74);
  g.strokeStyle = 'rgba(255,225,200,.2)';
  g.lineWidth = 2;
  g.strokeRect(cx - 54, holeY - 34, 108, 74);
  for (const [rx, ry] of [
    [cx - 46, holeY - 26],
    [cx + 46, holeY - 26],
    [cx - 46, holeY + 32],
    [cx + 46, holeY + 32],
  ] as const)
    rivet(g, rx, ry, WALL_ASPECT, 2.6);
  g.fillStyle = '#6b4a36';
  oval(g, cx, holeY + 4, 34, 34 * WALL_ASPECT);
  smudge(g, cx, holeY + 4, 40, 28, '20,10,6', 0.35);
  // the hole, white-hot, and the spout under it
  g.fillStyle = '#16100d';
  oval(g, cx, holeY, 15, 15 * WALL_ASPECT);
  const hole = g.createRadialGradient(cx, holeY, 1, cx, holeY, 13);
  hole.addColorStop(0, FIRE[0]!);
  hole.addColorStop(0.5, FIRE[1]!);
  hole.addColorStop(1, FIRE[2]!);
  g.fillStyle = hole;
  oval(g, cx, holeY, 12, 12 * WALL_ASPECT);
  g.fillStyle = '#34302d';
  g.beginPath();
  g.moveTo(cx - 13, holeY + 10);
  g.lineTo(cx + 13, holeY + 10);
  g.lineTo(cx + 9, lipY);
  g.lineTo(cx - 9, lipY);
  g.fill();
  // the stream: orange at the edges, yellow in the middle, with a bright splash where it lands
  const stream = g.createLinearGradient(cx - 5, 0, cx + 5, 0);
  stream.addColorStop(0, FIRE[2]!);
  stream.addColorStop(0.5, FIRE[0]!);
  stream.addColorStop(1, FIRE[2]!);
  g.fillStyle = stream;
  g.fillRect(cx - 5, lipY, 10, rowOf(0.5) - lipY);
  g.globalCompositeOperation = 'lighter';
  const splash = g.createRadialGradient(cx, rowOf(0.5), 2, cx, rowOf(0.5), 46);
  splash.addColorStop(0, 'rgba(255,200,90,.55)');
  splash.addColorStop(1, 'rgba(255,130,40,0)');
  g.fillStyle = splash;
  g.fillRect(cx - 60, rowOf(0.5) - 50, 120, 100);
  const wash = g.createRadialGradient(cx, holeY, 20, cx, holeY, 140);
  wash.addColorStop(0, 'rgba(255,130,40,.4)');
  wash.addColorStop(1, 'rgba(255,130,40,0)');
  g.fillStyle = wash;
  g.fillRect(0, 0, TEX, TEX);
  g.globalCompositeOperation = 'source-over';
  finish(g, rand);
};

// rows of ingot moulds on angle iron shelves: dark iron boxes with the sand inside, some with an ingot cast in them
const moulds: Paint = (g, rand) => {
  hallWall(g, rand);
  const count = 5,
    pitch = (TEX - 2 * COLUMN - 8) / count,
    deep = 30;
  for (const shelf of SHELVES) {
    const y = rowOf(shelf);
    for (let n = 0; n < count; n++) {
      const x = COLUMN + 6 + n * pitch;
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(x + 3, y - deep + 3, pitch - 6, deep);
      g.fillStyle = '#34302d';
      g.fillRect(x, y - deep, pitch - 6, deep);
      g.fillStyle = 'rgba(255,225,200,.16)';
      g.fillRect(x, y - deep, pitch - 6, 2);
      g.fillStyle = '#6b5a47'; // the sand
      g.fillRect(x + 5, y - deep + 6, pitch - 16, deep - 12);
      if (rand() < 0.5) {
        const ingot = g.createLinearGradient(0, y - deep + 6, 0, y - 6);
        ingot.addColorStop(0, '#9aa0a6');
        ingot.addColorStop(1, '#4b5056');
        g.fillStyle = ingot;
        g.fillRect(x + 5, y - deep + 7, pitch - 16, deep - 14);
      } else {
        g.fillStyle = 'rgba(10,6,4,.45)';
        g.fillRect(x + 5, y - deep + 6, pitch - 16, 5);
      }
    }
    g.fillStyle = '#4a423c';
    g.fillRect(COLUMN, y, TEX - 2 * COLUMN, 5);
    g.fillStyle = 'rgba(255,225,200,.22)';
    g.fillRect(COLUMN, y, TEX - 2 * COLUMN, 1.5);
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.fillRect(COLUMN, y + 5, TEX - 2 * COLUMN, 3);
  }
  g.globalCompositeOperation = 'lighter';
  const wash = g.createLinearGradient(0, rowOf(5), 0, rowOf(1.2));
  wash.addColorStop(0, 'rgba(255,120,40,0)');
  wash.addColorStop(1, 'rgba(255,120,40,.1)');
  g.fillStyle = wash;
  g.fillRect(COLUMN, rowOf(5), TEX - 2 * COLUMN, rowOf(1.2) - rowOf(5));
  g.globalCompositeOperation = 'source-over';
  finish(g, rand);
};

// a round gauge on a board: the case, the face, the needle and the marks
function dial(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, r: number) {
  g.fillStyle = '#12100e';
  oval(g, x, y, r + 3, (r + 3) * WALL_ASPECT);
  g.fillStyle = '#d8d0b8';
  oval(g, x, y, r, r * WALL_ASPECT);
  g.strokeStyle = 'rgba(30,24,20,.7)';
  g.lineWidth = 1;
  for (let a = Math.PI * 0.75; a <= Math.PI * 2.25; a += 0.35) {
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72 * WALL_ASPECT);
    g.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92 * WALL_ASPECT);
    g.stroke();
  }
  g.strokeStyle = css(VALVE_RED);
  g.lineWidth = 1.8;
  const a = Math.PI * (0.8 + rand() * 1.4);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78 * WALL_ASPECT);
  g.stroke();
}
// the furnace's control board: a steel cabinet with a bank of gauges, rows of lamps (amber and green), a sloping desk
// with levers, and a conduit up to the roof
const control: Paint = (g, rand) => {
  hallWall(g, rand);
  const x = 34,
    w = TEX - 68,
    top = rowOf(3.5),
    foot = rowOf(1.2);
  g.fillStyle = css(PAINT.soot1);
  g.fillRect(TEX / 2 - 5, 12, 10, top - 12);
  g.fillStyle = 'rgba(0,0,0,.5)';
  g.fillRect(x + 4, top + 4, w, foot - top);
  g.fillStyle = '#54605a';
  g.fillRect(x, top, w, foot - top);
  g.fillStyle = 'rgba(255,255,255,.14)';
  g.fillRect(x, top, w, 2);
  g.strokeStyle = 'rgba(0,0,0,.45)';
  g.lineWidth = 2;
  g.strokeRect(x + 4, top + 4, w - 8, foot - top - 8);
  for (let n = 0; n < 6; n++) dial(g, rand, x + 28 + (n % 3) * 58, top + 24 + Math.floor(n / 3) * 38, 14);
  for (let n = 0; n < 8; n++) {
    const lit = rand() < 0.6,
      color = rand() < 0.5 ? '#ffb12b' : '#4ee17b',
      lx = x + 18 + n * 24,
      ly = top + 84;
    if (lit) {
      g.globalCompositeOperation = 'lighter';
      const glow = g.createRadialGradient(lx, ly, 1, lx, ly, 13);
      glow.addColorStop(0, color);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow;
      g.fillRect(lx - 13, ly - 13, 26, 26);
      g.globalCompositeOperation = 'source-over';
    }
    g.fillStyle = lit ? color : '#2a1f18';
    oval(g, lx, ly, 4, 4 * WALL_ASPECT);
  }
  g.fillStyle = '#35302d'; // the desk, and its levers
  g.fillRect(x - 6, foot - 22, w + 12, 22);
  g.fillStyle = 'rgba(255,225,200,.2)';
  g.fillRect(x - 6, foot - 22, w + 12, 1.5);
  for (let n = 0; n < 4; n++) {
    const lx = x + 22 + n * 44,
      tilt = (rand() - 0.5) * 10;
    g.strokeStyle = '#1a1614';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(lx, foot - 18);
    g.lineTo(lx + tilt, foot - 36);
    g.stroke();
    g.fillStyle = css(VALVE_RED);
    oval(g, lx + tilt, foot - 37, 4, 4 * WALL_ASPECT);
  }
  finish(g, rand);
};

// a plate high on the wall with words in it, a rim round it; each line is as large as the plate allows
const plate =
  (lines: string[], board: string, ink: string, rim: string): Paint =>
  (g, rand) => {
    hallWall(g, rand);
    const x = COLUMN + 6,
      w = TEX - 2 * COLUMN - 12,
      top = rowOf(PLATE_TOP),
      h = rowOf(PLATE_FOOT) - top;
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.fillRect(x + 2, top + 2, w, h);
    g.fillStyle = board;
    g.fillRect(x, top, w, h);
    g.strokeStyle = rim;
    g.lineWidth = 2;
    g.strokeRect(x + 3, top + 3, w - 6, h - 6);
    for (const [rx, ry] of [
      [x + 8, top + 8],
      [x + w - 8, top + 8],
      [x + 8, top + h - 8],
      [x + w - 8, top + h - 8],
    ] as const)
      rivet(g, rx, ry, WALL_ASPECT, 2);
    const px = Math.min(Math.floor((w - 40) / Math.max(...lines.map(l => l.length))), 36),
      step = h / lines.length;
    g.fillStyle = ink;
    lines.forEach((line, n) => words(g, line, TEX / 2, top + step * (n + 0.5) + 1, px, WALL_ASPECT, SIGN_FONT, w - 40));
    g.fillStyle = 'rgba(110,55,25,.5)'; // chipped and rusty at the edges
    g.fillRect(x, top + h - 3, w * 0.25, 3);
    g.fillRect(x + w - 5, top, 5, h * 0.3);
    finish(g, rand);
  };

// the walls by number, after the plant's (pictures.ts)
export const FORGE_HALL_WALLS: Paint[] = [
  plainWall(false),
  plainWall(true),
  furnaceMouth,
  furnaceTap,
  moulds,
  control,
  plate([FORGE_PLATE_HEAT], SAFETY_YELLOW, STRIPE_BLACK, STRIPE_BLACK),
  plate([FORGE_HALL_MOLTEN], '#c8581c', '#f4ecd8', '#f4ecd8'),
  plate([FORGE_HALL_KEEP_OUT], '#e6e0d0', css(VALVE_RED), css(VALVE_RED)),
];
const [PLAIN_A, PLAIN_B, MOUTH_A, TAP, MOULDS, CONTROL, SIGN_HEAT, SIGN_MOLTEN, SIGN_KEEP] = FORGE_HALL_WALLS.map(
  (_, n) => n,
);
// the walls of the hall by the share of it each picture takes: each is in the list as many times as it comes up (the
// plain walls are about a third, the furnaces' fronts another third)
export const FORGE_HALL_MAP = [
  PLAIN_A,
  PLAIN_A,
  PLAIN_A,
  PLAIN_B,
  PLAIN_B,
  PLAIN_B,
  MOUTH_A,
  MOUTH_A,
  MOUTH_A,
  TAP,
  TAP,
  MOULDS,
  MOULDS,
  CONTROL,
  SIGN_HEAT,
  SIGN_MOLTEN,
  SIGN_KEEP,
].map(n => n!);
// the pictures things are set up by (by number in the hall's own list; pictures.ts moves them after the plant's): the
// furnaces' fronts, the tapping spout, the plain walls (pipes, chains), and those with a clear foot (the plain walls
// and the mould wall, which has its lowest shelf 1.8 m up) where stores may stand
export const FORGE_HALL_MOUTHS = [MOUTH_A!];
export const FORGE_HALL_TAPS = [TAP!];
export const FORGE_HALL_PLAIN = [PLAIN_A!, PLAIN_B!];
export const FORGE_HALL_STORES = [PLAIN_A!, PLAIN_B!, MOULDS!];

// ---- the floor: chequer plate ----
// Plates of chequer plate with their joints through the middle of the picture, scuffed and sooted; the marks run on
// across the picture's edge. Variant 0 plain, 1 scorched, 2 iron that spilt and set, 3 oil
const hallFloor =
  (variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = '#3f3a36';
    g.fillRect(0, 0, TEX, TEX);
    tread(g, 0, 0, TEX, TEX);
    g.fillStyle = 'rgba(18,13,10,.4)';
    g.fillRect(0, 0, TEX, TEX);
    for (let k = 0; k < 40; k++)
      smudge(
        g,
        rand() * TEX,
        rand() * TEX,
        16 + rand() * 46,
        12 + rand() * 30,
        rand() < 0.65 ? '20,15,12' : '130,116,104',
        0.06 + rand() * 0.14,
      );
    g.fillStyle = 'rgba(10,8,6,.6)';
    g.fillRect(FLOOR_JOINT - 1, 0, 2, TEX);
    g.fillRect(0, FLOOR_JOINT - 1, TEX, 2);
    g.fillStyle = 'rgba(214,204,192,.14)';
    g.fillRect(FLOOR_JOINT + 1, 0, 1, TEX);
    g.fillRect(0, FLOOR_JOINT + 1, TEX, 1);
    g.fillStyle = 'rgba(140,126,114,.7)'; // the bolts at the joints
    for (let p = 16; p < TEX; p += 32) {
      g.fillRect(FLOOR_JOINT - 3, p, 6, 3);
      g.fillRect(p, FLOOR_JOINT - 3, 3, 6);
    }
    if (variant === 1) {
      // scorched: soot in a ring, the metal blued where it was hot, a crack across
      smudge(g, TEX * 0.5, TEX * 0.45, 70, 52, '8,6,5', 0.7);
      smudge(g, TEX * 0.5, TEX * 0.45, 46, 34, '4,3,2', 0.6);
      smudge(g, TEX * 0.5, TEX * 0.45, 90, 70, '60,70,96', 0.12);
      g.strokeStyle = 'rgba(8,6,5,.6)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(TEX * 0.22, TEX * 0.7);
      g.lineTo(TEX * 0.4, TEX * 0.58);
      g.lineTo(TEX * 0.55, TEX * 0.64);
      g.lineTo(TEX * 0.78, TEX * 0.5);
      g.stroke();
    } else if (variant === 2) {
      // iron that spilt and set: grey puddles with a blue-grey skin, a straw-coloured rim where it cooled, drops round
      for (const [bx, by, br] of [
        [0.34, 0.4, 36],
        [0.62, 0.6, 26],
        [0.5, 0.28, 16],
      ] as const) {
        smudge(g, TEX * bx, TEX * by, br + 14, (br + 14) * 0.7, '190,150,60', 0.2);
        const skin = g.createLinearGradient(TEX * bx - br, TEX * by - br, TEX * bx + br, TEX * by + br);
        skin.addColorStop(0, '#6c7480');
        skin.addColorStop(1, '#3a3f48');
        g.fillStyle = skin;
        g.beginPath(); // a ragged edge: where the metal ran and stopped
        for (let a = 0; a < SPLASH_POINTS; a++) {
          const turn = (a / SPLASH_POINTS) * Math.PI * 2,
            reach = br * (0.7 + rand() * 0.5);
          g.lineTo(TEX * bx + Math.cos(turn) * reach, TEX * by + Math.sin(turn) * reach * 0.7);
        }
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(255,255,255,.12)';
        oval(g, TEX * bx - br * 0.25, TEX * by - br * 0.2, br * 0.4, br * 0.2);
      }
      for (let k = 0; k < 16; k++) {
        const dx = TEX * (0.2 + rand() * 0.6),
          dy = TEX * (0.2 + rand() * 0.6),
          r = 1.5 + rand() * 3.5;
        g.fillStyle = '#58606b';
        oval(g, dx, dy, r, r * 0.8);
        g.fillStyle = 'rgba(255,255,255,.2)';
        oval(g, dx - r * 0.3, dy - r * 0.3, r * 0.4, r * 0.3);
      }
    } else if (variant === 3) {
      for (let k = 0; k < 5; k++) {
        const px = TEX * (0.25 + rand() * 0.5),
          py = TEX * (0.25 + rand() * 0.5),
          r = 14 + rand() * 24;
        smudge(g, px, py, r + 5, (r + 5) * 0.7, '96,108,120', 0.16);
        smudge(g, px, py, r, r * 0.7, '8,6,5', 0.7);
      }
    }
    grime(g, rand, 24, '#7c7268', '#130f0d');
    grain(g, rand, 14);
  };
export const FORGE_HALL_FLOORS: Paint[] = [0, 1, 2, 3].map(hallFloor);

// ---- the wall above the usual height (a tile wide, as high as the boss room goes above the usual wall) ----
const RUNWAY = [0.5, 0.64]; // the runway girder's lattice, from ... to ... as a share of the picture's height, from the top
const WINDOWS = [0.12, 0.3]; // the clerestory panes, the same
// blackened brick between the columns (which run on up from the picture below), a girder along its foot (it runs on
// from the picture of the wall under it), a lattice girder across it, and two high windows, their glass black with
// smoke
export const forgeHallUpper: Paint = (g, rand) => {
  brick(g, rand, TEX);
  g.fillStyle = 'rgba(6,4,3,.55)';
  g.fillRect(0, 0, TEX, TEX);
  g.fillStyle = '#35302d'; // the girder along the foot
  g.fillRect(0, TEX - 18, TEX, 18);
  g.fillStyle = 'rgba(255,225,200,.2)';
  g.fillRect(0, TEX - 18, TEX, 1.5);
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.fillRect(0, TEX - 22, TEX, 4);
  // the windows: a frame, smoky glass with the dull light of the roof in it, bars across
  for (const start of WINDOWS) {
    const y = TEX * start,
      h = TEX * 0.12,
      x = COLUMN + 24,
      w = TEX - 2 * COLUMN - 48;
    g.fillStyle = '#26211f';
    g.fillRect(x - 5, y - 4, w + 10, h + 8);
    const glass = g.createLinearGradient(0, y, 0, y + h);
    glass.addColorStop(0, '#2d2723');
    glass.addColorStop(1, '#4b3b2d');
    g.fillStyle = glass;
    g.fillRect(x, y, w, h);
    g.fillStyle = '#26211f';
    for (let bx = x + w / 4; bx < x + w - 2; bx += w / 4) g.fillRect(bx - 1.5, y, 3, h);
    g.fillRect(x, y + h / 2 - 1.5, w, 3);
  }
  // the lattice girder: two chords and the diagonals between them
  const a = TEX * RUNWAY[0]!,
    b = TEX * RUNWAY[1]!;
  g.fillStyle = '#35302d';
  g.fillRect(0, a, TEX, 7);
  g.fillRect(0, b - 7, TEX, 7);
  g.strokeStyle = '#3d3733';
  g.lineWidth = 4;
  for (let x = COLUMN; x < TEX - COLUMN; x += 34) {
    g.beginPath();
    g.moveTo(x, b - 7);
    g.lineTo(x + 17, a + 7);
    g.lineTo(x + 34, b - 7);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,225,200,.14)';
  g.fillRect(0, a, TEX, 1.5);
  for (const x of [0, TEX - COLUMN]) {
    // the columns, on up
    const iron = g.createLinearGradient(x, 0, x + COLUMN, 0);
    iron.addColorStop(0, CAST);
    iron.addColorStop(0.4, CAST_LIT);
    iron.addColorStop(1, '#221e1c');
    g.fillStyle = iron;
    g.fillRect(x, 0, COLUMN, TEX);
    for (let y = 18; y < TEX; y += 26) rivet(g, x + COLUMN / 2, y, WALL_ASPECT, 2.1);
  }
  soot(g, rand, 14);
  g.globalCompositeOperation = 'lighter'; // the heat that rises: the lowest part of it warm
  const rise = g.createLinearGradient(0, TEX * 0.75, 0, TEX);
  rise.addColorStop(0, 'rgba(255,112,36,0)');
  rise.addColorStop(1, 'rgba(255,112,36,.14)');
  g.fillStyle = rise;
  g.fillRect(0, TEX * 0.75, TEX, TEX * 0.25);
  g.globalCompositeOperation = 'source-over';
  grime(g, rand, 50, '#6e6258', '#0b0807');
  grain(g, rand, 14);
};

// ---- the ceiling: roof steel with lattice trusses ----
const TRUSS = 14; // px across a chord of a truss
const BRACE = 6; // ... a diagonal
// the roof from below: corrugated sheet under black soot, a lattice truss running on from tile to tile both ways (two
// chords, X bracing in each bay, a gusset plate with bolts where they cross) and a faint warmth where the heat
// collects
export const forgeHallCeiling: Paint = (g, rand) => {
  g.fillStyle = css(PAINT.soot1);
  g.fillRect(0, 0, TEX, TEX);
  for (let x = 0; x < TEX; x += 16) {
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.fillRect(x, 0, 6, TEX);
    g.fillStyle = 'rgba(255,214,176,.06)';
    g.fillRect(x + 9, 0, 3, TEX);
  }
  grime(g, rand, 70, '#5c5148', '#0c0908');
  const mid = TEX / 2,
    pad = 24;
  g.strokeStyle = '#3d3733';
  g.lineWidth = BRACE;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    g.beginPath();
    g.moveTo(mid + sx * (TEX / 2 + 2), mid + sy * (TEX / 2 + 2));
    g.lineTo(mid + sx * pad, mid + sy * pad);
    g.stroke();
  }
  for (const down of [false, true]) {
    for (const off of [-1, 1]) {
      g.fillStyle = '#3a3430';
      const at = mid + off * (TRUSS / 2 + 8);
      if (down) g.fillRect(at - 3, 0, 6, TEX);
      else g.fillRect(0, at - 3, TEX, 6);
    }
    g.fillStyle = '#3f3935';
    if (down) g.fillRect(mid - TRUSS / 2, 0, TRUSS, TEX);
    else g.fillRect(0, mid - TRUSS / 2, TEX, TRUSS);
  }
  g.fillStyle = 'rgba(255,214,176,.16)';
  g.fillRect(0, mid - TRUSS / 2, TEX, 1.5);
  g.fillRect(mid - TRUSS / 2, 0, 1.5, TEX);
  g.fillStyle = '#4a423c'; // the gusset plate where the two trusses cross
  g.fillRect(mid - pad, mid - pad, 2 * pad, 2 * pad);
  g.strokeStyle = 'rgba(0,0,0,.5)';
  g.lineWidth = 2;
  g.strokeRect(mid - pad, mid - pad, 2 * pad, 2 * pad);
  for (const dx of [-16, 16]) for (const dy of [-16, 16]) rivet(g, mid + dx, mid + dy, 1, 3);
  for (let p = 16; p < TEX; p += 32)
    if (Math.abs(p - mid) > 30) {
      rivet(g, mid, p, 1, 2.4);
      rivet(g, p, mid, 1, 2.4);
    }
  g.globalCompositeOperation = 'lighter';
  const warm = g.createRadialGradient(mid, mid, 10, mid, mid, 190);
  warm.addColorStop(0, 'rgba(255,112,36,.1)');
  warm.addColorStop(1, 'rgba(255,112,36,0)');
  g.fillStyle = warm;
  g.fillRect(0, 0, TEX, TEX);
  g.globalCompositeOperation = 'source-over';
  grain(g, rand, 12);
};
