import { KWLN_DANGER } from '../../../i18n/signs.ts';
import type { Pictures } from '../common.ts';
import { TEX, grain, grime, paint } from '../paint.ts';
import type { Paint } from '../paint.ts';
// ---- tuning numbers used only here ----

// ---- the walled city (KWLN): an alley of shuttered shops under signboards and neon; worn concrete, wet ground ----
// stains running down a wall from the top
function stains(g: CanvasRenderingContext2D, rand: () => number, n: number) {
  for (let k = 0; k < n; k++) {
    const x = rand() * TEX,
      len = 50 + rand() * 180,
      st = g.createLinearGradient(0, 0, 0, len);
    st.addColorStop(0, 'rgba(10,8,6,.5)');
    st.addColorStop(1, 'rgba(10,8,6,0)');
    g.fillStyle = st;
    g.fillRect(x, 0, 2 + rand() * 9, len);
  }
}
// a rolled steel shutter in a frame, a strip of painted wall above it for the shop's sign
const shutter: Paint = (g, rand) => {
  const x = 22,
    y = 74,
    w = TEX - 44,
    h = TEX - y;
  g.fillStyle = '#2b2622';
  g.fillRect(x - 8, y - 8, w + 16, h + 8);
  const steel = g.createLinearGradient(0, y, 0, y + h);
  steel.addColorStop(0, '#4f6a5c');
  steel.addColorStop(1, '#31463c');
  g.fillStyle = steel;
  g.fillRect(x, y, w, h);
  for (let sy = y; sy < y + h; sy += 9) {
    g.fillStyle = 'rgba(0,0,0,.42)';
    g.fillRect(x, sy, w, 2);
    g.fillStyle = 'rgba(190,220,200,.16)';
    g.fillRect(x, sy + 2, w, 1.5);
  }
  // rust at the foot, a handle, a few pasted bills
  const rust = g.createLinearGradient(0, TEX - 46, 0, TEX);
  rust.addColorStop(0, 'rgba(120,60,30,0)');
  rust.addColorStop(1, 'rgba(120,60,30,.55)');
  g.fillStyle = rust;
  g.fillRect(x, TEX - 46, w, 46);
  g.fillStyle = '#1b1815';
  g.fillRect(TEX / 2 - 14, TEX - 30, 28, 7);
  for (let k = 0; k < 3; k++) {
    g.fillStyle = ['#d8cfb8', '#c9b79a', '#b9443a'][k]!;
    g.globalAlpha = 0.75;
    g.fillRect(x + 12 + rand() * (w - 50), y + 20 + rand() * 80, 20 + rand() * 14, 26 + rand() * 12);
  }
  g.globalAlpha = 1;
};
// an iron gate over a dark doorway, tiled surround
const ironGate: Paint = g => {
  g.fillStyle = '#6f6a58';
  g.fillRect(40, 44, TEX - 80, TEX - 44);
  for (let ty = 44; ty < TEX; ty += 14) {
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.fillRect(40, ty, TEX - 80, 1.5);
  }
  for (let tx = 40; tx < TEX - 40; tx += 14) g.fillRect(tx, 44, 1.5, TEX - 44);
  g.fillStyle = '#0d0b0a';
  g.fillRect(72, 70, TEX - 144, TEX - 70);
  g.strokeStyle = '#3a3630';
  g.lineWidth = 3;
  for (let bx = 72; bx <= TEX - 72; bx += 14) {
    g.beginPath();
    g.moveTo(bx, 70);
    g.lineTo(bx, TEX);
    g.stroke();
  }
  for (let by = 84; by < TEX; by += 34) {
    g.beginPath();
    g.moveTo(72, by);
    g.lineTo(TEX - 72, by);
    g.stroke();
  }
  g.lineWidth = 2;
  for (let by = 84; by < TEX - 34; by += 34)
    for (let bx = 72; bx < TEX - 72; bx += 28) {
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + 14, by + 17);
      g.lineTo(bx + 28, by);
      g.moveTo(bx, by + 34);
      g.lineTo(bx + 14, by + 17);
      g.lineTo(bx + 28, by + 34);
      g.stroke();
    }
};
// a barred window with a light on behind it, an awning's shadow above
const barredWindow: Paint = g => {
  const x = 60,
    y = 52,
    w = 136,
    h = 92;
  g.fillStyle = '#1c1916';
  g.fillRect(x - 7, y - 7, w + 14, h + 14);
  const lit = g.createLinearGradient(0, y, 0, y + h);
  lit.addColorStop(0, '#f3d79a');
  lit.addColorStop(1, '#b8793d');
  g.fillStyle = lit;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(60,30,20,.5)';
  g.fillRect(x, y, w * 0.4, h);
  g.fillStyle = '#1c1916';
  for (let b = 1; b < 6; b++) g.fillRect(x + (w / 6) * b - 2, y, 4, h);
  g.fillRect(x, y + h / 2 - 2, w, 4);
  const drip = g.createLinearGradient(0, y + h, 0, TEX);
  drip.addColorStop(0, 'rgba(10,8,6,.55)');
  drip.addColorStop(1, 'rgba(10,8,6,0)');
  g.fillStyle = drip;
  g.fillRect(x + 8, y + h + 7, w - 16, TEX - y - h);
};
// layers of bills and posters, half torn off
const posters: Paint = (g, rand) => {
  const paper = ['#cfc6b0', '#b3a586', '#8c4a40', '#b3a15c', '#7d8a82'];
  for (let k = 0; k < 9; k++) {
    const x = 16 + rand() * 190,
      y = 96 + rand() * 96,
      w = 18 + rand() * 20,
      h = 24 + rand() * 22;
    g.globalAlpha = 0.45 + rand() * 0.3;
    g.fillStyle = paper[Math.floor(rand() * paper.length)]!;
    g.fillRect(x, y, w, h);
    g.globalAlpha = 0.65;
    g.fillStyle = '#2a211c';
    for (let l = 0; l < 3; l++) g.fillRect(x + 3, y + 5 + l * 6, (w - 6) * (0.4 + rand() * 0.6), 2);
    g.fillStyle = '#463e36';
    g.fillRect(x + w - 6 - rand() * 6, y + h - 6 - rand() * 6, 14, 14); // a torn corner
  }
  g.globalAlpha = 1;
};
// The wall pictures: what is on the concrete of each (nothing on the first, which is the plainest and comes up most:
// variantOf)
export const KWLN_WALL_PICS: (Paint | null)[] = [null, shutter, ironGate, barredWindow, posters];
// along an alley, in place of bare concrete: shutters and barred windows most, then posters and gates
export const KWLN_LANE_WALLS = [1, 3, 4, 1, 3, 2];
const kwlnWall =
  (on: Paint | null): Paint =>
  (g, rand) => {
    // worn concrete, darker toward the ground
    const bg = g.createLinearGradient(0, 0, 0, TEX);
    bg.addColorStop(0, '#5c5347');
    bg.addColorStop(0.75, '#463e36');
    bg.addColorStop(1, '#2a2521');
    g.fillStyle = bg;
    g.fillRect(0, 0, TEX, TEX);
    grime(g, rand, 170, '#7a6f60', '#14110e');
    // the joints between the cast slabs
    g.fillStyle = 'rgba(15,12,10,.35)';
    g.fillRect(0, TEX * 0.36, TEX, 2);
    g.fillRect(0, TEX * 0.7, TEX, 2);
    stains(g, rand, 10);
    on?.(g, rand);
    // the foot of the wall is the dirtiest
    const foot = g.createLinearGradient(0, TEX * 0.82, 0, TEX);
    foot.addColorStop(0, 'rgba(8,6,5,0)');
    foot.addColorStop(1, 'rgba(8,6,5,.6)');
    g.fillStyle = foot;
    g.fillRect(0, TEX * 0.82, TEX, TEX * 0.18);
    grain(g, rand, 22);
  };
const kwlnFloor =
  (variant: number): Paint =>
  (g, rand) => {
    // wet paving: no joint at the edge of the picture, so the ground reads as one surface, not as tiles
    g.fillStyle = '#3a3631';
    g.fillRect(0, 0, TEX, TEX);
    grime(g, rand, 160, '#575148', '#141210');
    // cracks
    g.strokeStyle = 'rgba(8,6,5,.6)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      let x = 40 + rand() * (TEX - 80),
        y = 40 + rand() * (TEX - 80);
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (rand() - 0.5) * 44;
        y += (rand() - 0.5) * 44;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    if (variant === 1) {
      // a puddle with the signs in it
      const cx = 100 + rand() * 56,
        cy = 100 + rand() * 56,
        pool = g.createRadialGradient(cx, cy, 6, cx, cy, 80);
      pool.addColorStop(0, 'rgba(20,24,28,.75)');
      pool.addColorStop(0.75, 'rgba(20,24,28,.45)');
      pool.addColorStop(1, 'rgba(20,24,28,0)');
      g.fillStyle = pool;
      g.beginPath();
      g.ellipse(cx, cy, 80, 50, rand() * 3, 0, Math.PI * 2);
      g.fill();
      for (const c of ['rgba(255,90,140,.4)', 'rgba(90,255,190,.3)', 'rgba(255,220,150,.35)'])
        for (let k = 0; k < 3; k++) {
          g.fillStyle = c;
          g.fillRect(cx - 44 + rand() * 80, cy - 24 + rand() * 44, 12 + rand() * 22, 2);
        }
    } else if (variant === 2) {
      // a drain cover
      g.fillStyle = '#0c0b0a';
      g.fillRect(92, 100, 72, 52);
      g.fillStyle = '#4a453e';
      for (let b = 0; b < 7; b++) g.fillRect(96 + b * 10, 104, 5, 44);
      g.strokeStyle = '#5c564d';
      g.lineWidth = 3;
      g.strokeRect(92, 100, 72, 52);
    }
    grain(g, rand, 20);
  };
const kwlnDeck: Paint = (g, rand) => {
  g.fillStyle = '#4b4a48';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 70, '#6a6865', '#1a1918');
  // chequer plate
  g.fillStyle = 'rgba(210,210,205,.2)';
  for (let y = 0; y < TEX; y += 22)
    for (let x = (y / 22) % 2 ? 11 : 0; x < TEX; x += 22) {
      g.save();
      g.translate(x + 6, y + 6);
      g.rotate(((x + y) / 22) % 2 ? 0.7 : -0.7);
      g.fillRect(-6, -1.5, 12, 3);
      g.restore();
    }
  // a painted edge: where a deck ends is something the player has to see
  g.strokeStyle = '#c9a23a';
  g.lineWidth = 8;
  g.strokeRect(4, 4, TEX - 8, TEX - 8);
  grain(g, rand, 18);
};
const kwlnCeiling: Paint = (g, rand) => {
  g.fillStyle = '#211e1b';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 90, '#3a3530', '#0a0908');
  // pipes and cables running under the slab
  for (const [y, w, c] of [
    [34, 14, '#4a443c'],
    [60, 7, '#3a352f'],
    [150, 16, '#514a41'],
    [182, 6, '#3a352f'],
  ] as [number, number, string][]) {
    g.fillStyle = c;
    g.fillRect(0, y, TEX, w);
    g.fillStyle = 'rgba(230,220,200,.16)';
    g.fillRect(0, y + 1, TEX, 2);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(0, y + w - 2, TEX, 2);
  }
  g.strokeStyle = 'rgba(5,4,4,.8)';
  g.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const y = 90 + k * 14;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(TEX / 3, y + 18, (TEX * 2) / 3, y - 12, TEX, y);
    g.stroke();
  }
  grain(g, rand, 14);
};
// the signs and the painted words are drawn with whatever CJK face the device has (the words: src/i18n/signs.ts)
export const KWLN_FONT =
  '"PingFang HK","PingFang TC","Noto Sans TC","Noto Sans CJK TC","Microsoft JhengHei","Hiragino Sans",sans-serif';
// One leaf of a sliding steel door: ribbed plate, cross bars, a warning band low down, rust at the foot. The boss
// room's is red, with the warning painted down it
const kwlnDoor =
  (boss: boolean): Paint =>
  (g, rand) => {
    const steel = g.createLinearGradient(0, 0, TEX, 0);
    steel.addColorStop(0, boss ? '#6a231f' : '#59625a');
    steel.addColorStop(0.5, boss ? '#84302a' : '#6f7a70');
    steel.addColorStop(1, boss ? '#5a1d1a' : '#4d564f');
    g.fillStyle = steel;
    g.fillRect(0, 0, TEX, TEX);
    grime(g, rand, 110, boss ? '#a5564c' : '#8d968c', '#12100f');
    // ribs down the plate, bars across it, a frame with rivets
    for (let x = 28; x < TEX; x += 40) {
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.fillRect(x, 0, 5, TEX);
      g.fillStyle = 'rgba(255,255,255,.1)';
      g.fillRect(x + 5, 0, 2, TEX);
    }
    g.fillStyle = boss ? '#451614' : '#3b423c';
    for (const y of [0, TEX * 0.33, TEX * 0.66, TEX - 12]) g.fillRect(0, y, TEX, 12);
    g.fillRect(0, 0, 14, TEX);
    g.fillRect(TEX - 14, 0, 14, TEX);
    g.fillStyle = 'rgba(0,0,0,.45)';
    for (let y = 10; y < TEX; y += 22) {
      g.fillRect(4, y, 6, 3);
      g.fillRect(TEX - 10, y, 6, 3);
    }
    // the warning band: black and yellow, about a metre up
    const by = TEX * 0.8,
      bh = 18;
    g.save();
    g.beginPath();
    g.rect(14, by, TEX - 28, bh);
    g.clip();
    g.fillStyle = '#c9a23a';
    g.fillRect(14, by, TEX - 28, bh);
    g.fillStyle = '#161412';
    for (let x = -bh; x < TEX; x += 26) {
      g.beginPath();
      g.moveTo(x, by + bh);
      g.lineTo(x + bh, by);
      g.lineTo(x + bh + 13, by);
      g.lineTo(x + 13, by + bh);
      g.fill();
    }
    g.restore();
    if (boss) {
      // the warning, one character over the other (the leaf is three times as tall as it is wide), below the height
      // of the door's "BOSS" label (world/doors.ts BOSS_LABEL_Y) so the two do not cover each other
      g.fillStyle = '#e6c04a';
      g.font = `900 150px ${KWLN_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.save();
      g.translate(TEX / 2, 0);
      g.scale(1, 1 / 3);
      [...KWLN_DANGER].forEach((ch, n) => g.fillText(ch, 0, (TEX * 0.5 + n * TEX * 0.18) * 3));
      g.restore();
    }
    const rust = g.createLinearGradient(0, TEX * 0.9, 0, TEX);
    rust.addColorStop(0, 'rgba(110,55,25,0)');
    rust.addColorStop(1, 'rgba(110,55,25,.6)');
    g.fillStyle = rust;
    g.fillRect(0, TEX * 0.9, TEX, TEX * 0.1);
    grain(g, rand, 20);
  };

// The live floor: the steel cover of a cable trench, wet, with a cable lying broken across it. `glow` is what lights up
// while it is live: the bare ends of the cable arcing, and the water on the plate
const kwlnHazard: Paint = (g, rand) => {
  const plate = g.createLinearGradient(0, 0, TEX, TEX);
  plate.addColorStop(0, '#4d5450');
  plate.addColorStop(1, '#3a403d');
  g.fillStyle = plate;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 90, '#6f7873', '#161a18');
  // the seam down the middle and the bolts along the rim
  g.fillStyle = 'rgba(0,0,0,.5)';
  g.fillRect(TEX / 2 - 2, 0, 4, TEX);
  for (let n = 18; n < TEX; n += 44)
    for (const [x, y] of [
      [n, 12],
      [n, TEX - 12],
      [12, n],
      [TEX - 12, n],
    ] as const) {
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.fillRect(x - 4, y - 4, 8, 8);
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.fillRect(x - 3, y - 3, 3, 3);
    }
  // a film of water, darker and glossy
  g.fillStyle = 'rgba(12,20,22,.5)';
  g.beginPath();
  g.ellipse(TEX * 0.56, TEX * 0.58, TEX * 0.34, TEX * 0.24, 0.4, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(190,220,215,.2)';
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(TEX * 0.56, TEX * 0.58, TEX * 0.3, TEX * 0.2, 0.4, 3.4, 5.2);
  g.stroke();
  // the cable: two ends that do not meet
  g.lineCap = 'round';
  for (const pts of KWLN_CABLE) {
    g.strokeStyle = '#0d0f0e';
    g.lineWidth = 13;
    g.beginPath();
    g.moveTo(pts[0] * TEX, pts[1] * TEX);
    g.bezierCurveTo(pts[2] * TEX, pts[3] * TEX, pts[4] * TEX, pts[5] * TEX, pts[6] * TEX, pts[7] * TEX);
    g.stroke();
    // the copper showing at the broken end
    g.strokeStyle = '#b0703a';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(pts[6] * TEX, pts[7] * TEX);
    g.lineTo((pts[6] + (pts[6] - pts[4]) * 0.12) * TEX, (pts[7] + (pts[7] - pts[5]) * 0.12) * TEX);
    g.stroke();
  }
  grain(g, rand, 18);
};
// the two halves of the broken cable, each a curve from the rim to its bare end (as shares of the picture)
const KWLN_CABLE: number[][] = [
  [0, 0.2, 0.2, 0.22, 0.26, 0.4, 0.4, 0.46],
  [1, 0.86, 0.8, 0.9, 0.7, 0.66, 0.58, 0.6],
];
const kwlnHazardGlow: Paint = (g, rand) => {
  g.fillStyle = '#000';
  g.fillRect(0, 0, TEX, TEX);
  // the water lights up
  const pool = g.createRadialGradient(TEX * 0.56, TEX * 0.58, 6, TEX * 0.56, TEX * 0.58, TEX * 0.46);
  // (the whole plate is lit, not only the water: a live tile must be plain to see from across a room)
  pool.addColorStop(0, 'rgba(255,255,255,1)');
  pool.addColorStop(0.6, 'rgba(255,255,255,.75)');
  pool.addColorStop(1, 'rgba(255,255,255,.5)');
  g.fillStyle = pool;
  g.fillRect(0, 0, TEX, TEX);
  // arcs between the two bare ends and out over the water: jagged, bright
  const [a, b] = [KWLN_CABLE[0]!, KWLN_CABLE[1]!],
    ends: [number, number][] = [
      [a[6]! * TEX, a[7]! * TEX],
      [b[6]! * TEX, b[7]! * TEX],
    ];
  g.strokeStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 12;
  g.lineJoin = 'round';
  for (let n = 0; n < 7; n++) {
    const [x0, y0] = ends[n % 2]!,
      // the first two join the ends; the rest strike out over the plate
      [x1, y1] = n < 2 ? ends[1 - (n % 2)]! : [x0 + (rand() - 0.5) * TEX * 0.9, y0 + (rand() - 0.5) * TEX * 0.9];
    g.lineWidth = n < 2 ? 4 : 2.5;
    g.beginPath();
    g.moveTo(x0, y0);
    for (let t = 1; t <= 6; t++)
      g.lineTo(x0 + ((x1 - x0) * t) / 6 + (rand() - 0.5) * 22, y0 + ((y1 - y0) * t) / 6 + (rand() - 0.5) * 22);
    g.stroke();
  }
  g.shadowBlur = 0;
};

// the walled city's look (world/looks.ts makes it the first time the sector is drawn)
export function kwlnPictures(): Pictures {
  return {
    walls: KWLN_WALL_PICS.map((on, v) => paint(100 + v, kwlnWall(on))),
    laneWalls: KWLN_LANE_WALLS,
    floors: [0, 1, 2].map(v => paint(200 + v, kwlnFloor(v))), // bare, a puddle, a drain
    deck: paint(300, kwlnDeck),
    ceiling: paint(400, kwlnCeiling),
    door: paint(500, kwlnDoor(false)),
    bossDoor: paint(501, kwlnDoor(true)),
    fog: 0x12100f,
    hazard: { base: paint(510, kwlnHazard), glow: paint(511, kwlnHazardGlow) },
  };
}
