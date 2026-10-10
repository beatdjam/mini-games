import type * as THREE from 'three';
import { canvasTex } from '../paint.ts';
import { block, pick, seeded, soil } from '../cutoutTools.ts';
import type { G } from '../cutoutTools.ts';
import { KWLN_SHOP_NAMES } from '../../../i18n/signs.ts';
import { KWLN_FONT } from './pictures.ts';
// The walled city's painted set pieces: pictures of whole heaps of things, stood against the walls as flat cut-outs
// (the picture is clear where there is nothing). One painted picture holds what dozens of plain boxes could not: the
// goods on a stall's shelves, a heap of tubs and baskets and old sets, a line of washing, a mat of wires overhead.
// Painted from a seed, so a picture is the same every time.

const PLASTIC = ['#b5442e', '#c9702c', '#2f6aa8', '#3d7d5c', '#b9a23c', '#8d3a52'];
const CARD = ['#8a6a44', '#7a5c3a', '#9a7b52'];
// a plastic tub or pail, its rim an ellipse; `stack` more of them nested in it
function tub(g: G, rand: () => number, x: number, foot: number, w: number, h: number) {
  const color = pick(rand, PLASTIC);
  for (let k = 0, n = 1 + Math.floor(rand() * 3); k < n; k++) {
    const y = foot - h - k * 7;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + w, y);
    g.lineTo(x + w * 0.86, y + h);
    g.lineTo(x + w * 0.14, y + h);
    g.closePath();
    g.fill();
    const shade = g.createLinearGradient(x, 0, x + w, 0);
    shade.addColorStop(0, 'rgba(255,255,255,0.2)');
    shade.addColorStop(0.45, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = shade;
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath();
    g.ellipse(x + w / 2, y + 1, w / 2, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.lineWidth = 1.5;
    g.stroke();
  }
}
// a woven basket
function basket(g: G, x: number, foot: number, w: number, h: number) {
  g.fillStyle = '#8b6b3e';
  g.beginPath();
  g.moveTo(x, foot - h);
  g.lineTo(x + w, foot - h);
  g.lineTo(x + w * 0.82, foot);
  g.lineTo(x + w * 0.18, foot);
  g.closePath();
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = 'rgba(50,32,14,0.6)';
  g.lineWidth = 1;
  for (let k = -h; k < w + h; k += 5) {
    g.beginPath();
    g.moveTo(x + k, foot - h);
    g.lineTo(x + k + h, foot);
    g.moveTo(x + k + h, foot - h);
    g.lineTo(x + k, foot);
    g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x + w * 0.6, foot - h, w * 0.4, h);
  g.restore();
}
// an old television set or a radio: the cabinet, the tube, the knobs
function oldSet(g: G, rand: () => number, x: number, y: number, w: number, h: number) {
  block(g, x, y, w, h, pick(rand, ['#2a2622', '#3a3028', '#44403a', '#5a4a36']));
  const tube = g.createLinearGradient(x, y, x + w, y + h);
  tube.addColorStop(0, '#62706c');
  tube.addColorStop(1, '#26302e');
  g.fillStyle = tube;
  g.fillRect(x + 5, y + 5, w * 0.66, h - 10);
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.fillRect(x + 8, y + 8, w * 0.25, h * 0.2);
  g.fillStyle = '#b8b0a0';
  for (let k = 0; k < 3; k++) g.fillRect(x + w * 0.78, y + 7 + k * (h / 3.4), w * 0.14, h * 0.13);
}
// a cardboard box or a wooden crate, with its tape or slats
function crate(g: G, rand: () => number, x: number, y: number, w: number, h: number) {
  const wood = rand() < 0.4;
  block(g, x, y, w, h, wood ? '#5f4a30' : pick(rand, CARD));
  g.fillStyle = 'rgba(0,0,0,0.28)';
  if (wood) for (let k = 1; k < 4; k++) g.fillRect(x, y + (h / 4) * k, w, 2);
  else g.fillRect(x + w * 0.44, y, w * 0.1, h);
  if (!wood && rand() < 0.6) {
    g.fillStyle = 'rgba(150,30,24,0.7)';
    g.fillRect(x + 5, y + h * 0.55, w * 0.3, h * 0.22);
  }
}
// a tied bag
function bag(g: G, rand: () => number, x: number, foot: number, r: number) {
  g.fillStyle = pick(rand, ['#1d1b1c', '#2a2f3a', '#6a2a24', '#3a3a34']);
  g.beginPath();
  g.ellipse(x, foot - r * 0.8, r, r * 0.85, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(x - r * 0.18, foot - r * 1.9, r * 0.36, r * 0.4);
  g.fillStyle = 'rgba(255,255,255,0.13)';
  g.beginPath();
  g.ellipse(x - r * 0.35, foot - r * 1.05, r * 0.3, r * 0.45, 0.5, 0, Math.PI * 2);
  g.fill();
}

// A heap along the foot of a wall, about 3.4 m wide and 1.7 m high: tubs, baskets, sets, boxes and bags, some on top
// of others
export function heapTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 512,
    H = 256,
    foot = H - 6;
  return canvasTex(W, H, g => {
    // the back row first (taller: boxes and sets, stacked), then what stands in front of it
    for (let x = 6 + rand() * 20; x < W - 70;) {
      const w = 54 + rand() * 46;
      let y = foot;
      for (let k = 0, n = 1 + Math.floor(rand() * 3); k < n; k++) {
        const h = 40 + rand() * 34;
        y -= h;
        if (rand() < 0.4) oldSet(g, rand, x + rand() * 6, y, w * (0.8 + rand() * 0.2), h - 2);
        else crate(g, rand, x + rand() * 6, y, w * (0.8 + rand() * 0.2), h - 2);
      }
      x += w + rand() * 26;
    }
    for (let x = 4 + rand() * 30; x < W - 50;) {
      const kind = rand(),
        w = 36 + rand() * 30;
      if (kind < 0.4) tub(g, rand, x, foot, w, 22 + rand() * 16);
      else if (kind < 0.6) basket(g, x, foot, w, 26 + rand() * 14);
      else if (kind < 0.85) bag(g, rand, x + w / 2, foot, 14 + rand() * 10);
      else crate(g, rand, x, foot - 30, w, 30);
      x += w + rand() * 40;
    }
    soil(g, rand, W, H, H * 0.45);
  });
}

// A stall's front, about 3.6 m by 2.8 m: shelves crammed with goods, things hung from the top, the shop's board over
// it, a bare bulb's light in the middle of it
export function stallTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 512,
    H = 400;
  return canvasTex(W, H, g => {
    g.fillStyle = '#17120f';
    g.fillRect(0, 0, W, H);
    // the board over the stall, and a strip of awning under it
    g.fillStyle = '#d2bd80';
    g.fillRect(8, 6, W - 16, 52);
    g.fillStyle = 'rgba(90,60,20,0.3)';
    g.fillRect(8, 44, W - 16, 14);
    g.font = `900 40px ${KWLN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#a01c18';
    g.fillText(pick(rand, KWLN_SHOP_NAMES), W / 2, 33);
    for (let x = 0; x < W; x += 28) {
      g.fillStyle = (x / 28) % 2 ? '#7c2f28' : '#c8c0aa';
      g.fillRect(x, 60, 28, 16);
    }
    // the shelves and what is on them: jars, tins, packets, each with its label
    const goods = ['#b8402c', '#d09a2c', '#2e6c9a', '#4a8a5a', '#d8d0bc', '#7a3a5a', '#c86a2a', '#8a8f96'];
    for (let row = 0; row < 4; row++) {
      const y = 96 + row * 62;
      g.fillStyle = '#3a2a1c';
      g.fillRect(6, y + 48, W - 12, 8);
      for (let x = 12; x < W - 26;) {
        const w = 12 + rand() * 20,
          h = 22 + rand() * 24;
        if (rand() < 0.9) {
          block(g, x, y + 48 - h, w, h, pick(rand, goods));
          g.fillStyle = 'rgba(240,235,215,0.75)';
          g.fillRect(x + 2, y + 48 - h * 0.62, w - 4, h * 0.26);
        }
        x += w + 1 + rand() * 4;
      }
    }
    // things hung along the top: bags, strings of packets, a ladle
    for (let x = 20; x < W - 20; x += 30 + rand() * 40) {
      const len = 30 + rand() * 70;
      g.strokeStyle = '#0c0a09';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, 76);
      g.lineTo(x, 76 + len);
      g.stroke();
      g.fillStyle = pick(rand, goods);
      g.beginPath();
      g.ellipse(x, 76 + len + 10, 9 + rand() * 6, 13 + rand() * 6, 0, 0, Math.PI * 2);
      g.fill();
    }
    // the bulb: warm light over the middle of the stall, falling off to the edges
    g.globalCompositeOperation = 'lighter';
    const bulb = g.createRadialGradient(W / 2, 130, 6, W / 2, 150, 300);
    bulb.addColorStop(0, 'rgba(255,214,150,0.55)');
    bulb.addColorStop(0.4, 'rgba(255,190,110,0.18)');
    bulb.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = bulb;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#fff3d6';
    g.beginPath();
    g.arc(W / 2, 122, 6, 0, Math.PI * 2);
    g.fill();
    // dark toward the corners, as the bulb leaves them
    const edge = g.createRadialGradient(W / 2, 170, 120, W / 2, 200, 360);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = edge;
    g.fillRect(0, 60, W, H - 60);
    soil(g, rand, W, H, H * 0.6);
  });
}

// A line of washing, about 3.8 m long: shirts, trousers and cloths on a pole, each with its folds
export function washingTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 512,
    H = 200;
  return canvasTex(W, H, g => {
    g.fillStyle = '#6f6a5e';
    g.fillRect(0, 8, W, 4);
    const cloths = ['#c9c2b0', '#7c2e2c', '#3a5c88', '#b59c48', '#4c6a54', '#8a8f96', '#d8cfc0', '#5a3a5c'];
    for (let x = 10; x < W - 50;) {
      const w = 44 + rand() * 40,
        h = 90 + rand() * 80,
        color = pick(rand, cloths),
        kind = rand();
      g.fillStyle = color;
      if (kind < 0.45) {
        // a shirt: the body and the two sleeves hanging
        g.fillRect(x + w * 0.2, 12, w * 0.6, h * 0.8);
        g.fillRect(x, 12, w * 0.24, h * 0.45);
        g.fillRect(x + w * 0.76, 12, w * 0.24, h * 0.45);
      } else if (kind < 0.7) {
        // trousers over the pole
        g.fillRect(x + w * 0.1, 12, w * 0.36, h);
        g.fillRect(x + w * 0.54, 12, w * 0.36, h * 0.94);
      } else g.fillRect(x, 12, w, h * 0.7);
      // folds: darker and lighter stripes down the cloth, only where there is cloth
      g.globalCompositeOperation = 'source-atop';
      for (let fx = x; fx < x + w; fx += 7 + rand() * 6) {
        g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.1)';
        g.fillRect(fx, 12, 3, h);
      }
      g.globalCompositeOperation = 'source-over';
      x += w + 6 + rand() * 22;
    }
    soil(g, rand, W, H, 0);
  });
}

// A mat of wires seen from below: thick and thin, sagging across one another, most of the picture covered
export function wireMatTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    S = 256,
    wires = ['#0d0b0b', '#161312', '#2a2420', '#3b332b', '#7d7364'];
  return canvasTex(S, S, g => {
    g.lineCap = 'round';
    for (let k = 0; k < 120; k++) {
      const across = rand() < 0.5,
        a = rand() * S,
        b = a + (rand() - 0.5) * S * 0.7,
        sag = (rand() - 0.5) * S * 0.5;
      g.strokeStyle = pick(rand, wires);
      g.lineWidth = 2.5 + rand() * rand() * 12;
      g.beginPath();
      if (across) {
        g.moveTo(-10, a);
        g.quadraticCurveTo(S / 2, (a + b) / 2 + sag, S + 10, b);
      } else {
        g.moveTo(a, -10);
        g.quadraticCurveTo((a + b) / 2 + sag, S / 2, b, S + 10);
      }
      g.stroke();
    }
  });
}

// One face of a crate or a carton, the whole picture (not a cut-out): the solid things a heap is built round
export function crateFaceTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    S = 128;
  return canvasTex(S, S, g => {
    const wood = seed % 2 === 0;
    g.fillStyle = wood ? '#5f4a30' : pick(rand, CARD);
    g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    if (wood) {
      for (let k = 1; k < 5; k++) g.fillRect(0, (S / 5) * k - 2, S, 4);
      g.fillRect(0, 0, 8, S);
      g.fillRect(S - 8, 0, 8, S);
    } else {
      g.fillRect(S * 0.44, 0, S * 0.12, S);
      g.fillStyle = 'rgba(150,30,24,0.75)';
      g.fillRect(12, S * 0.56, S * 0.34, S * 0.22);
    }
    const shade = g.createLinearGradient(0, 0, S, S);
    shade.addColorStop(0, 'rgba(255,255,255,0.1)');
    shade.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = shade;
    g.fillRect(0, 0, S, S);
    soil(g, rand, S, S, S * 0.3);
  });
}

// The side of a raised deck of the walled city, a tile wide and a deck high: a shop's platform, small white tiles
// gone grey over a concrete foot, a red-painted edge along its top
export function shopDeckTex(): THREE.CanvasTexture {
  const rand = seeded(71),
    W = 256,
    H = 128;
  return canvasTex(W, H, g => {
    g.fillStyle = '#b9b6aa';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(40,36,32,0.5)';
    for (let x = 0; x < W; x += 16) g.fillRect(x, 0, 1.5, H);
    for (let y = 0; y < H; y += 16) g.fillRect(0, y, W, 1.5);
    for (let k = 0; k < 14; k++) {
      g.fillStyle = 'rgba(60,54,46,0.5)';
      g.fillRect(Math.floor(rand() * 16) * 16 + 1.5, Math.floor(rand() * 6) * 16 + 1.5, 14.5, 14.5);
    }
    g.fillStyle = '#8a2a22';
    g.fillRect(0, 0, W, 10);
    g.fillStyle = '#4a443c';
    g.fillRect(0, H - 22, W, 22);
    soil(g, rand, W, H, H * 0.25);
  });
}
