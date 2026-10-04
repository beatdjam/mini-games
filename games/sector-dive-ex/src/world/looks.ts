import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { renderer } from '@engine/render/render.ts';
import { SIDE_STEP, T, tileCenter } from '@engine/world/tiles.ts';
import { placeProps } from '@engine/world/slots.ts';
import type { PropRule } from '@engine/world/slots.ts';
import { WALL_H } from '../data/level.ts';
import { COLOR } from '../data/colors.ts';
import { KWLN_DANGER, KWLN_NEON_WORDS, KWLN_SHOP_NAMES } from '../i18n/signs.ts';
import type { Biome } from '../data/types.ts';
import type { FloorPlan } from './building.ts';
import { forgeLook } from './looks/forge.ts';
// A sector's own look: its wall, floor, deck and ceiling pictures (painted on canvases, a few variants each so the
// same picture is not on every tile) and the things fixed to its walls and ceilings (props; none of them is in the
// way, so the tile world is not touched). A sector without a look is drawn with the plain line pattern in its colours
// (world/render.ts). The pictures and the props are drawn from a seed, so a floor looks the same every time.
// The walled city is painted in this file; a look in a file of its own (world/looks/) uses the tools exported here.
// ---- tuning numbers used only here ----
export const TEX = 256; // side of a painted picture (px)
export const LAMP_POOL = 7; // side of the pool of light a ceiling lamp throws on the floor (m)
const LAMP_POOL_OPACITY = 0.7;

export interface Look {
  walls: THREE.CanvasTexture[];
  floors: THREE.CanvasTexture[];
  deck: THREE.CanvasTexture; // top of raised decks and ramps
  ceiling: THREE.CanvasTexture;
  door: THREE.CanvasTexture; // one leaf of a door (a leaf is half a tile wide and a wall high)
  bossDoor: THREE.CanvasTexture; // ... of the boss room's door
  fog: number; // the colour things fade to in the distance (the sector's own is for the plain look)
  props: (plan: FloorPlan, group: THREE.Group, rng: Rng) => void;
}
export type Paint = (g: CanvasRenderingContext2D, rand: () => number) => void;

// dev only (?plain): every sector drawn the plain way, to compare a look with what was there before
let plain = false;
export function devPlainLooks(on: boolean) {
  plain = on;
}

// a small seeded generator for the painters (the same picture every time)
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function paint(seed: number, fn: Paint, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = TEX;
  c.height = TEX;
  fn(c.getContext('2d')!, seeded(seed));
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}
// speckles and blotches over the whole picture: dirt
export function grime(g: CanvasRenderingContext2D, rand: () => number, n: number, light: string, dark: string) {
  for (let k = 0; k < n; k++) {
    g.globalAlpha = 0.04 + rand() * 0.1;
    g.fillStyle = rand() < 0.5 ? light : dark;
    const w = 4 + rand() * 46,
      h = 3 + rand() * 30;
    g.fillRect(rand() * TEX - w / 2, rand() * TEX - h / 2, w, h);
  }
  g.globalAlpha = 1;
}

// fine grain over the whole picture, pixel by pixel: what makes flat paint look like a surface
export function grain(g: CanvasRenderingContext2D, rand: () => number, amount: number) {
  const img = g.getImageData(0, 0, TEX, TEX),
    px = img.data;
  for (let n = 0; n < px.length; n += 4) {
    const d = (rand() - 0.5) * amount;
    px[n] = px[n]! + d;
    px[n + 1] = px[n + 1]! + d;
    px[n + 2] = px[n + 2]! + d;
  }
  g.putImageData(img, 0, 0);
}
// a picture of its own size (the signs are wide or tall, not square)
function canvasTex(w: number, h: number, fn: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  fn(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return t;
}

// ---- the walled city (KWLN): an alley of shuttered shops under signboards and neon; worn concrete, wet ground ----
// the wall pictures: 0 bare concrete, 1 a rolled shutter, 2 an iron gate, 3 a lit window, 4 posters
const KWLN_SHUTTER = 1;
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
const kwlnWall =
  (variant: number): Paint =>
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
    if (variant === KWLN_SHUTTER) {
      // a rolled steel shutter in a frame, a strip of painted wall above it for the shop's sign
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
    } else if (variant === 2) {
      // an iron gate over a dark doorway, tiled surround
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
    } else if (variant === 3) {
      // a barred window with a light on behind it, an awning's shadow above
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
    } else if (variant === 4) {
      // layers of bills and posters, half torn off
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
    }
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
const SIGN_FONT =
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
      g.font = `900 150px ${SIGN_FONT}`;
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
// a soft round patch of light, for the pools under the lamps and signs
export const poolPaint: Paint = g => {
  const r = g.createRadialGradient(TEX / 2, TEX / 2, 4, TEX / 2, TEX / 2, TEX / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, TEX, TEX);
};
// the front of an air conditioner
const acPaint: Paint = (g, rand) => {
  g.fillStyle = '#6b6a66';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 50, '#8a8984', '#1e1d1c');
  g.fillStyle = '#1c1b1a';
  g.beginPath();
  g.arc(TEX * 0.36, TEX / 2, TEX * 0.3, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#55534f';
  g.lineWidth = 5;
  for (let k = 0; k < 6; k++) {
    g.beginPath();
    g.arc(TEX * 0.36, TEX / 2, 10 + k * 11, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#1c1b1a';
  for (let k = 0; k < 7; k++) g.fillRect(TEX * 0.74, 40 + k * 26, TEX * 0.2, 10);
  const rust = g.createLinearGradient(0, TEX * 0.8, 0, TEX);
  rust.addColorStop(0, 'rgba(110,60,30,0)');
  rust.addColorStop(1, 'rgba(110,60,30,.6)');
  g.fillStyle = rust;
  g.fillRect(0, TEX * 0.8, TEX, TEX * 0.2);
};

// ---- the signs ----
// a shop's board over its shutter: [paint colour, board colour], one per name of KWLN_SHOP_NAMES
const BOARD_PAINT: [string, string][] = [
  ['#b3261e', '#e6dcc3'],
  ['#f1e6c8', '#8f1d18'],
  ['#1f5c3a', '#e2dcc8'],
  ['#f4e9c9', '#1d3f5e'],
  ['#d8b23a', '#3a1414'],
  ['#b3261e', '#d9d2ba'],
];
const BOARDS = KWLN_SHOP_NAMES.map((name, n): [string, string, string] => [
  name,
  ...BOARD_PAINT[n % BOARD_PAINT.length]!,
]);
// a neon sign standing out from a wall, read top to bottom: the tube colour, one per word of KWLN_NEON_WORDS
const NEON_TUBES = [
  COLOR.neonMint,
  COLOR.neonPink,
  COLOR.neonGold,
  COLOR.neonPink,
  COLOR.neonSky,
  COLOR.neonGold,
  COLOR.neonMint,
  COLOR.neonSky,
];
const NEONS = KWLN_NEON_WORDS.map((words, n): [string, number] => [words, NEON_TUBES[n % NEON_TUBES.length]!]);
const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');
function boardTex([name, ink, board]: [string, string, string]): THREE.CanvasTexture {
  return canvasTex(512, 128, g => {
    g.fillStyle = board;
    g.fillRect(0, 0, 512, 128);
    // weathered: darker at the edges, streaks from the top
    const edge = g.createLinearGradient(0, 0, 0, 128);
    edge.addColorStop(0, 'rgba(0,0,0,.28)');
    edge.addColorStop(0.3, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,.34)');
    g.fillStyle = edge;
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = 'rgba(0,0,0,.45)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 506, 122);
    g.fillStyle = ink;
    g.font = `900 ${name.length > 4 ? 78 : 88}px ${SIGN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name, 256, 68, 470);
  });
}
function neonTex([words, color]: [string, number]): THREE.CanvasTexture {
  const h = 512,
    w = 160;
  return canvasTex(w, h, g => {
    g.fillStyle = '#0d0b0c';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = hex(color);
    g.shadowColor = hex(color);
    g.shadowBlur = 16;
    g.lineWidth = 5;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#fff';
    g.font = `900 ${words.length > 1 ? 118 : 132}px ${SIGN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const step = (h - 60) / words.length;
    [...words].forEach((ch, n) => {
      const y = 30 + step * (n + 0.5);
      g.shadowBlur = 26;
      g.fillStyle = hex(color);
      g.fillText(ch, w / 2, y);
      g.shadowBlur = 6;
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillText(ch, w / 2, y);
    });
  });
}

const LAMP_COLORS = [0xffe2b0, 0xffe2b0, 0xdff3ff]; // bare bulbs and a cold tube now and then
const KWLN_PROPS: PropRule[] = [
  { id: 'neon', slots: ['wall'], blocks: false, count: [14, 20], gap: 2 },
  { id: 'pipes', slots: ['wall'], blocks: false, count: [16, 24], gap: 2 },
  { id: 'ac', slots: ['wall'], blocks: false, count: [6, 10], gap: 3 },
  { id: 'lamp', slots: ['floor', 'center', 'corridor'], blocks: false, count: [10, 14], gap: 3 },
];
const BOARD = { w: 3.5, h: 0.9, y: 4.75, out: 0.07, tilt: 0.1, chance: 0.8 }; // a shop's board (m, m, m, m, rad)
const NEON = { thick: 0.12, h: 2.5, out: 0.85, y: 4.2 }; // a neon sign standing out from a wall (m)
interface KwlnShared {
  pool: THREE.CanvasTexture;
  ac: THREE.CanvasTexture;
  boards: THREE.CanvasTexture[];
  neons: THREE.CanvasTexture[];
}
let kwlnShared: KwlnShared | null = null;
// Signboards over the shutters, neon signs standing out from the walls with their colour on the ground, pipes and
// air conditioners on the walls, bare lamps on the ceiling
function kwlnProps(plan: FloorPlan, group: THREE.Group, rng: Rng) {
  kwlnShared ??= {
    pool: paint(11, poolPaint),
    ac: paint(12, acPaint),
    boards: BOARDS.map(boardTex),
    neons: NEONS.map(neonTex),
  };
  const shared = kwlnShared,
    d = { W: plan.gen.W, H: plan.gen.H, maps: plan.gen.maps, rooms: plan.gen.rooms },
    placed = placeProps(d, KWLN_PROPS, rng),
    of = (id: string) => placed.filter(p => p.id === id).map(p => p.slot),
    m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    one = new THREE.Vector3(1, 1, 1),
    up = new THREE.Vector3(0, 1, 0);
  type WallSlot = { i: number; j: number; side?: number };
  // where on a wall face: the tile's middle moved to the wall, `off` along it, `out` away from it
  const onWall = (s: WallSlot, off: number, out: number, y: number) => {
    const [di, dj] = SIDE_STEP[s.side ?? 0]!;
    return new THREE.Vector3(
      tileCenter(s.i) + di * (T / 2 - out) + dj * off,
      y,
      tileCenter(s.j) + dj * (T / 2 - out) + di * off,
    );
  };
  // the turn that makes a thing's +z look away from the wall
  const facing = (s: WallSlot) => {
    const [di, dj] = SIDE_STEP[s.side ?? 0]!;
    return Math.atan2(-di, -dj);
  };
  const lights: { x: number; z: number; color: number }[] = [];
  const instances = (mesh: THREE.InstancedMesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  };

  // a board over every shutter that faces a floor tile (most of them): the shop's name
  const fronts: WallSlot[] = [];
  for (let j = 1; j < d.H - 1; j++)
    for (let i = 1; i < d.W - 1; i++) {
      if (d.maps.grid[j * d.W + i] !== 1) continue;
      SIDE_STEP.forEach(([di, dj], side) => {
        const wall = (j + dj) * d.W + i + di;
        if (d.maps.grid[wall] || plan.voids[wall]) return;
        if (variantOf(wall, KWLN_WALLS, WALL_PLAIN_SHARE) === KWLN_SHUTTER && rng.next() < BOARD.chance)
          fronts.push({ i, j, side });
      });
    }
  shared.boards.forEach((map, b) => {
    const mine = fronts.filter((_, n) => n % shared.boards.length === b);
    if (!mine.length) return;
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(BOARD.w, BOARD.h),
      new THREE.MeshBasicMaterial({ map }),
      mine.length,
    );
    mine.forEach((s, n) => {
      // tipped a little toward the street, as boards hang
      q.setFromEuler(new THREE.Euler(BOARD.tilt, facing(s), 0, 'YXZ'));
      m.compose(onWall(s, 0, BOARD.out, BOARD.y), q, one);
      mesh.setMatrixAt(n, m);
    });
    instances(mesh);
  });

  // neon signs: a thin box standing out from the wall, its two broad faces lit, read along the street
  const neons = of('neon').filter(s => !plan.noCeil[s.j * d.W + s.i]);
  shared.neons.forEach((map, b) => {
    const mine = neons.filter((_, n) => n % shared.neons.length === b);
    if (!mine.length) return;
    const lit = new THREE.MeshBasicMaterial({ map }),
      edge = new THREE.MeshBasicMaterial({ color: 0x15121a }),
      mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(NEON.thick, NEON.h, NEON.out),
        [lit, lit, edge, edge, edge, edge],
        mine.length,
      );
    mine.forEach((s, n) => {
      const off = rng.rand(-1.2, 1.2),
        at = onWall(s, off, NEON.out / 2 + 0.05, NEON.y + rng.rand(-0.4, 0.3));
      q.setFromAxisAngle(up, facing(s));
      m.compose(at, q, one);
      mesh.setMatrixAt(n, m);
      lights.push({ x: at.x, z: at.z, color: NEONS[b]![1] });
    });
    instances(mesh);
  });

  // pipes: a thick and a thin one side by side, floor to ceiling
  const pipes = of('pipes');
  if (pipes.length) {
    const mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.1, 0.1, WALL_H, 8),
      new THREE.MeshBasicMaterial({ color: 0x55504a }),
      pipes.length * 2,
    );
    pipes.forEach((s, n) => {
      const off = rng.rand(-1.3, 1.3);
      m.compose(onWall(s, off, 0.14, WALL_H / 2), q.identity(), one);
      mesh.setMatrixAt(n * 2, m);
      m.compose(onWall(s, off + 0.3, 0.1, WALL_H / 2), q.identity(), new THREE.Vector3(0.55, 1, 0.55));
      mesh.setMatrixAt(n * 2 + 1, m);
    });
    instances(mesh);
  }
  // air conditioners: a box high on the wall, its front toward the street
  const acs = of('ac');
  if (acs.length) {
    const front = new THREE.MeshBasicMaterial({ map: shared.ac }),
      body = new THREE.MeshBasicMaterial({ color: 0x4d4c49 }),
      mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1.3, 0.8, 0.5),
        [body, body, body, body, front, front],
        acs.length,
      );
    acs.forEach((s, n) => {
      q.setFromAxisAngle(up, facing(s));
      m.compose(onWall(s, rng.rand(-1, 1), 0.26, rng.rand(2.9, 3.6)), q, one);
      mesh.setMatrixAt(n, m);
    });
    instances(mesh);
  }
  // lamps (not where the ceiling is open): a bright plate on the ceiling
  const lamps = of('lamp').filter(s => !plan.noCeil[s.j * d.W + s.i]);
  if (lamps.length) {
    const plates = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.9, 0.08, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
        lamps.length,
      ),
      color = new THREE.Color();
    lamps.forEach((s, n) => {
      const x = tileCenter(s.i),
        z = tileCenter(s.j),
        c = rng.pick(LAMP_COLORS);
      q.setFromAxisAngle(up, rng.pick([0, Math.PI / 2]));
      m.compose(new THREE.Vector3(x, WALL_H - 0.06, z), q, one);
      plates.setMatrixAt(n, m);
      plates.setColorAt(n, color.setHex(c));
      lights.push({ x, z, color: c });
    });
    instances(plates);
  }
  // the light the lamps and the neon throw on the ground: a soft pool of their colour
  if (lights.length) {
    const geo = new THREE.PlaneGeometry(LAMP_POOL, LAMP_POOL);
    geo.rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(
        geo,
        new THREE.MeshBasicMaterial({
          map: shared.pool,
          transparent: true,
          opacity: LAMP_POOL_OPACITY,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
        lights.length,
      ),
      color = new THREE.Color();
    lights.forEach((l, n) => {
      m.compose(new THREE.Vector3(l.x, 0.05, l.z), q.identity(), one);
      pools.setMatrixAt(n, m);
      pools.setColorAt(n, color.setHex(l.color));
    });
    instances(pools);
  }
}

const KWLN_WALLS = 5; // the wall pictures (see kwlnWall)
// the looks, made the first time a sector is drawn (the pictures stay for the life of the page)
const MAKERS: Record<string, () => Look> = {
  KWLN: () => ({
    walls: Array.from({ length: KWLN_WALLS }, (_, v) => paint(100 + v, kwlnWall(v))),
    floors: [0, 1, 2].map(v => paint(200 + v, kwlnFloor(v))), // bare, a puddle, a drain
    deck: paint(300, kwlnDeck),
    ceiling: paint(400, kwlnCeiling),
    door: paint(500, kwlnDoor(false)),
    bossDoor: paint(501, kwlnDoor(true)),
    fog: 0x12100f,
    props: kwlnProps,
  }),
  FORGE: forgeLook,
};
const made: Record<string, Look> = {};
// the sector's look, or null when it has none (or ?plain is on): it is drawn the plain way then
export function lookOf(b: Biome): Look | null {
  if (plain || !MAKERS[b.code]) return null;
  return (made[b.code] ??= MAKERS[b.code]!());
}
// which picture a tile gets: the same one every time, scattered so that neighbours differ. The first picture is the
// plainest and comes up most (`plainShare` of the tiles)
export function variantOf(k: number, count: number, plainShare: number): number {
  const h = (Math.imul(k + 1, 2654435761) >>> 0) / 4294967296;
  return h < plainShare ? 0 : 1 + (Math.floor((h - plainShare) * 9973) % (count - 1));
}
export const WALL_PLAIN_SHARE = 0.4; // share of the wall tiles that get the plain picture
export const FLOOR_PLAIN_SHARE = 0.6; // ... of the floor tiles
