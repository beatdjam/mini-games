import type * as THREE from 'three';
import { canvasTex } from '../paint.ts';
import { block, pick, seeded, soil } from '../cutoutTools.ts';
import type { G } from '../cutoutTools.ts';
// The smelter block's painted set pieces (see looks/dress.ts): the working floor of a steelworks. Let into the
// walls: control panels with their gauges and lamps, boards of tools, valve manifolds, lockers. Along the foot of
// the walls: oil drums, gas cylinders, stacked ingots, pallets, tool boxes. Overhead: chains and hooks.

const PAINT = ['#4f5a4a', '#5a5348', '#3f4a52', '#5c4a34']; // the paints of the plant's cabinets
const DRUM = ['#7a3a22', '#2f5a7a', '#b08a22', '#3a3f44', '#5a2a22'];

// a round gauge: the case, the white face, the needle
function gauge(g: G, rand: () => number, x: number, y: number, r: number) {
  g.fillStyle = '#1a1816';
  g.beginPath();
  g.arc(x, y, r + 3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d8d2c0';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#a0281e';
  g.lineWidth = 2;
  const a = Math.PI * (0.8 + rand() * 1.4);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
  g.stroke();
}
// an indicator lamp: lit ones glow
function lamp(g: G, rand: () => number, x: number, y: number) {
  const lit = rand() < 0.45,
    color = pick(rand, ['#ff5a2a', '#ffb02a', '#4de07a']);
  if (lit) {
    g.globalCompositeOperation = 'lighter';
    const glow = g.createRadialGradient(x, y, 1, x, y, 16);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow;
    g.fillRect(x - 16, y - 16, 32, 32);
    g.globalCompositeOperation = 'source-over';
  }
  g.fillStyle = lit ? color : '#3a2a22';
  g.beginPath();
  g.arc(x, y, 4.5, 0, Math.PI * 2);
  g.fill();
}
// an oil drum: its body, the two hoops, the rust on it
function drum(g: G, rand: () => number, x: number, foot: number, w: number, h: number) {
  const color = pick(rand, DRUM);
  g.fillStyle = color;
  g.fillRect(x, foot - h, w, h);
  const shade = g.createLinearGradient(x, 0, x + w, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.3)');
  shade.addColorStop(0.3, 'rgba(255,255,255,0.14)');
  shade.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = shade;
  g.fillRect(x, foot - h, w, h);
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(x, foot - h * 0.68, w, 3);
  g.fillRect(x, foot - h * 0.34, w, 3);
  g.fillStyle = 'rgba(90,40,16,0.5)';
  for (let k = 0; k < 4; k++) g.fillRect(x + rand() * w * 0.8, foot - rand() * h, 6 + rand() * 10, 4 + rand() * 10);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.beginPath();
  g.ellipse(x + w / 2, foot - h, w / 2, 4, 0, 0, Math.PI * 2);
  g.fill();
}
// a gas cylinder: tall, a cap on its neck
function cylinder(g: G, rand: () => number, x: number, foot: number, h: number) {
  const color = pick(rand, ['#7a2a22', '#4a4f55', '#2f4f3a', '#8a7a22']);
  g.fillStyle = color;
  g.fillRect(x, foot - h, 20, h);
  g.beginPath();
  g.arc(x + 10, foot - h, 10, Math.PI, 0);
  g.fill();
  g.fillStyle = '#2a2826';
  g.fillRect(x + 6, foot - h - 16, 8, 8);
  const shade = g.createLinearGradient(x, 0, x + 20, 0);
  shade.addColorStop(0, 'rgba(255,255,255,0.18)');
  shade.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = shade;
  g.fillRect(x, foot - h, 20, h);
}

// What is let into a wall, about 3.7 m by 2.8 m. Four kinds by the seed: a control panel; a board of tools over a
// bench; a valve manifold; lockers with helmets on them
export function plantTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 512,
    H = 400,
    kind = seed % 4;
  return canvasTex(W, H, g => {
    g.fillStyle = '#2c2420';
    g.fillRect(0, 0, W, H);
    if (kind === 0) {
      // three cabinets of a control panel: gauges on top, rows of lamps and switches, a mimic of pipes
      for (let x = 4; x < W - 20; x += 170) {
        block(g, x, 8, 162, H - 14, pick(rand, PAINT));
        for (let k = 0; k < 3; k++) gauge(g, rand, x + 34 + k * 47, 54, 17);
        g.fillStyle = '#1a1816';
        g.fillRect(x + 12, 96, 138, 86);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) lamp(g, rand, x + 26 + c * 22, 112 + r * 26);
        for (let c = 0; c < 5; c++) {
          g.fillStyle = '#b8b0a0';
          g.fillRect(x + 22 + c * 27, 206, 12, 22);
          g.fillStyle = '#2a2826';
          g.fillRect(x + 25 + c * 27, 200 + (rand() < 0.5 ? 0 : 14), 6, 12);
        }
        g.fillStyle = '#d2c9a8';
        g.fillRect(x + 18, 250, 126, 40);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(x + 6, 310, 150, 3);
      }
    } else if (kind === 1) {
      // a board of tools, each on its hooks, over a bench with a vice
      g.fillStyle = '#6a4f30';
      g.fillRect(10, 10, W - 20, 200);
      g.fillStyle = '#1c1a18';
      for (let x = 30; x < W - 40; x += 34 + rand() * 20) {
        const len = 50 + rand() * 110;
        g.fillRect(x, 26, 7, len);
        if (rand() < 0.5) g.fillRect(x - 8, 26, 23, 16);
        else g.fillRect(x - 5, 26 + len - 12, 17, 12);
      }
      block(g, 0, 230, W, 26, '#7a5a34');
      block(g, 10, 256, W - 20, H - 260, '#4a4038');
      block(g, 60, 196, 70, 36, '#3a4a55');
      for (let x = 180; x < W - 60; x += 60 + rand() * 40)
        block(g, x, 206, 40 + rand() * 20, 26, pick(rand, ['#a02a22', '#3a3f44', '#b08a22']));
    } else if (kind === 2) {
      // a manifold: pipes across, a valve with its red wheel on each, drips under them
      for (let y = 40; y < H - 60; y += 80) {
        g.fillStyle = '#5a4a3c';
        g.fillRect(0, y, W, 26);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(0, y + 3, W, 5);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, y + 19, W, 7);
        for (let x = 50 + rand() * 40; x < W - 40; x += 120 + rand() * 60) {
          g.fillStyle = '#3a3028';
          g.fillRect(x - 12, y - 6, 24, 38);
          g.strokeStyle = '#b02a20';
          g.lineWidth = 6;
          g.beginPath();
          g.arc(x, y - 16, 16, 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = 'rgba(90,40,16,0.5)';
          g.fillRect(x - 3, y + 30, 6, 20 + rand() * 40);
        }
      }
    } else {
      // lockers, each with its plate, helmets and gloves on top
      for (let x = 2; x < W - 10; x += 73) {
        block(g, x, 70, 69, H - 74, pick(rand, PAINT));
        g.fillStyle = 'rgba(0,0,0,0.35)';
        for (let k = 0; k < 4; k++) g.fillRect(x + 14, 86 + k * 7, 42, 3);
        g.fillStyle = '#d8d2c0';
        g.fillRect(x + 18, 130, 34, 14);
        g.fillStyle = '#2a2826';
        g.fillRect(x + 56, 220, 5, 20);
      }
      for (let x = 20; x < W - 60; x += 70 + rand() * 50) {
        g.fillStyle = pick(rand, ['#d9a02a', '#e8e2d0', '#b02a20']);
        g.beginPath();
        g.arc(x + 22, 68, 22, Math.PI, 0);
        g.fill();
        g.fillRect(x - 4, 64, 52, 6);
      }
    }
    // the furnaces' glow from across the hall, low and orange; soot over everything
    g.globalCompositeOperation = 'lighter';
    const glow = g.createLinearGradient(0, H, 0, 0);
    glow.addColorStop(0, 'rgba(255,110,40,0.20)');
    glow.addColorStop(0.7, 'rgba(255,110,40,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(12,8,6,0.22)';
    g.fillRect(0, 0, W, H);
    soil(g, rand, W, H, H * 0.4);
  });
}

// A heap along the foot of a wall, about 3.4 m by 1.7 m: drums, gas cylinders, ingots, pallets, tool boxes
export function plantHeapTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 512,
    H = 256,
    foot = H - 6;
  return canvasTex(W, H, g => {
    for (let x = 8 + rand() * 20; x < W - 60;) {
      const kind = rand();
      if (kind < 0.42) {
        const w = 52 + rand() * 12,
          h = 78 + rand() * 14;
        drum(g, rand, x, foot, w, h);
        if (rand() < 0.3) drum(g, rand, x + 4, foot - h, w - 6, h * 0.9);
        x += w + rand() * 22;
      } else if (kind < 0.62) {
        for (let k = 0, n = 1 + Math.floor(rand() * 3); k < n; k++)
          cylinder(g, rand, x + k * 24, foot, 120 + rand() * 30);
        x += 80 + rand() * 20;
      } else if (kind < 0.82) {
        // ingots stacked on a pallet
        g.fillStyle = '#6a5236';
        g.fillRect(x, foot - 10, 110, 10);
        for (let r = 0, rows = 2 + Math.floor(rand() * 3); r < rows; r++)
          for (let c = 0; c < 4; c++) block(g, x + 4 + c * 26 + (r % 2) * 6, foot - 26 - r * 17, 24, 15, '#7c7770');
        x += 120 + rand() * 20;
      } else {
        block(g, x, foot - 34, 70, 34, pick(rand, ['#a02a22', '#3a4a55', '#b08a22']));
        g.fillStyle = '#1c1a18';
        g.fillRect(x + 22, foot - 42, 26, 8);
        x += 80 + rand() * 30;
      }
    }
    g.fillStyle = 'rgba(12,8,6,0.2)';
    g.globalCompositeOperation = 'source-atop';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    soil(g, rand, W, H, H * 0.4);
  });
}

// The face of a steel box or of a pallet of ingots, the whole picture: the solid things the heaps and benches are
// made of
export function plantBoxTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    S = 128;
  return canvasTex(S, S, g => {
    if (seed % 2) {
      g.fillStyle = pick(rand, PAINT);
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(0, S / 2 - 2, S, 4);
      g.fillStyle = 'rgba(90,40,16,0.45)';
      for (let k = 0; k < 8; k++) g.fillRect(rand() * S, rand() * S, 6 + rand() * 18, 4 + rand() * 14);
    } else {
      g.fillStyle = '#4a4540';
      g.fillRect(0, 0, S, S);
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 4; c++) block(g, 3 + c * 31 + (r % 2) * 6, 4 + r * 24, 28, 20, '#7c7770');
    }
    const shade = g.createLinearGradient(0, 0, S, S);
    shade.addColorStop(0, 'rgba(255,255,255,0.08)');
    shade.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = shade;
    g.fillRect(0, 0, S, S);
    soil(g, rand, S, S, S * 0.3);
  });
}

// Chains hanging from the roof steel, a hook or a block on some (about 1.6 m by 2.6 m)
export function chainsTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 160,
    H = 256;
  return canvasTex(W, H, g => {
    for (let k = 0, n = 2 + Math.floor(rand() * 3); k < n; k++) {
      const x = 20 + rand() * (W - 40),
        len = 90 + rand() * 140;
      g.strokeStyle = '#1c1a18';
      g.lineWidth = 2;
      for (let y = 0; y < len; y += 9) {
        g.beginPath();
        g.ellipse(x + ((y / 9) % 2 ? 1.5 : -1.5), y + 5, 3.5, 5.5, 0, 0, Math.PI * 2);
        g.stroke();
      }
      if (rand() < 0.6) {
        g.strokeStyle = '#c9952a';
        g.lineWidth = 5;
        g.beginPath();
        g.arc(x, len + 12, 10, -Math.PI / 2, Math.PI * 0.9);
        g.stroke();
      } else block(g, x - 10, len, 20, 18, '#3a3f44');
    }
  });
}

// What an alley of the plant is roofed with: a rack of pipes side by side on cross steel, seen from below
export function pipeRackTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    S = 256;
  return canvasTex(S, S, g => {
    g.fillStyle = '#14100e';
    g.fillRect(0, 0, S, S);
    for (let x = 6; x < S - 10;) {
      const w = 12 + rand() * 26,
        pipe = g.createLinearGradient(x, 0, x + w, 0);
      pipe.addColorStop(0, '#2a221c');
      pipe.addColorStop(0.4, pick(rand, ['#7a5a40', '#5a4f48', '#6a4a30']));
      pipe.addColorStop(1, '#1c1612');
      g.fillStyle = pipe;
      g.fillRect(x, 0, w, S);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      for (let y = 30 + rand() * 60; y < S; y += 90 + rand() * 60) g.fillRect(x - 1, y, w + 2, 6);
      x += w + 4 + rand() * 12;
    }
    soil(g, rand, S, S, 0);
  });
}

// The side of a raised deck of the plant, a tile wide and a deck high: a casting platform's steel, riveted plates
// under a yellow and black edge, rust running down from the seams
export function plantDeckTex(): THREE.CanvasTexture {
  const rand = seeded(771),
    W = 256,
    H = 128;
  return canvasTex(W, H, g => {
    const steel = g.createLinearGradient(0, 0, 0, H);
    steel.addColorStop(0, '#4a4038');
    steel.addColorStop(1, '#2c2622');
    g.fillStyle = steel;
    g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 64) {
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(x, 16, 2, H);
      g.fillStyle = '#17120f';
      for (let y = 30; y < H; y += 26) {
        g.fillRect(x + 6, y, 4, 4);
        g.fillRect(x + 54, y, 4, 4);
      }
      g.fillStyle = 'rgba(110,50,20,0.4)';
      g.fillRect(x + 2 + rand() * 50, 20, 5, 30 + rand() * 70);
    }
    for (let x = -16; x < W; x += 32) {
      g.fillStyle = '#d9a41e';
      g.beginPath();
      g.moveTo(x, 16);
      g.lineTo(x + 16, 0);
      g.lineTo(x + 32, 0);
      g.lineTo(x + 16, 16);
      g.fill();
      g.fillStyle = '#17120f';
      g.beginPath();
      g.moveTo(x + 16, 16);
      g.lineTo(x + 32, 0);
      g.lineTo(x + 48, 0);
      g.lineTo(x + 32, 16);
      g.fill();
    }
    soil(g, rand, W, H, H * 0.3);
  });
}
