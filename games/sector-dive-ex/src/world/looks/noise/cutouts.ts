import { PAINT, css } from '../../../data/colors.ts';
import type * as THREE from 'three';
import { canvasTex } from '../paint.ts';
import { block, pick, seeded, soil } from '../cutoutTools.ts';
import type { G } from '../cutoutTools.ts';
// The deep noise's painted set pieces (see looks/dress.ts): a broadcasting house gone off the air. Let into the
// walls: racks of gear with their meters and reels, shelves of tape in its boxes, a mixing desk under its monitors,
// road cases stacked to the wall. Along the foot of the walls: road cases, loudspeakers, drums of cable, lamps off
// their stands. Overhead: microphones and headphones left hanging on their leads.

const GEAR = ['#26242e', css(PAINT.plum), '#3a3644', '#1e1c26'];
const TAPE = [css(PAINT.clay6), '#b8a888', '#8a2f3a', '#2f4a7a', '#d8cfa8', css(PAINT.grey1)];
const GLOW = css(PAINT.pale);

// a meter with its needle, lit from behind
function meter(g: G, rand: () => number, x: number, y: number, w: number, h: number) {
  g.fillStyle = '#e8dfb8';
  g.fillRect(x, y, w, h);
  g.strokeStyle = '#1e1c26';
  g.lineWidth = 1.5;
  const a = -Math.PI * (0.2 + rand() * 0.6);
  g.beginPath();
  g.moveTo(x + w / 2, y + h);
  g.lineTo(x + w / 2 + Math.cos(a) * h * 0.9, y + h + Math.sin(a) * h * 0.9);
  g.stroke();
  g.fillStyle = '#a02a30';
  g.fillRect(x + w * 0.72, y + 2, w * 0.22, 3);
}
// a reel of tape on its hub
function reel(g: G, x: number, y: number, r: number) {
  g.fillStyle = '#b8b2a6';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = css(PAINT.umber1);
  g.beginPath();
  g.arc(x, y, r * 0.7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#b8b2a6';
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    g.arc(
      x + Math.cos((k * Math.PI * 2) / 3) * r * 0.42,
      y + Math.sin((k * Math.PI * 2) / 3) * r * 0.42,
      r * 0.16,
      0,
      Math.PI * 2,
    );
    g.fill();
  }
}
// a road case: black board, bright metal edges and corners, a stencil or a sticker
function roadCase(g: G, rand: () => number, x: number, y: number, w: number, h: number) {
  block(g, x, y, w, h, css(PAINT.ink10));
  g.strokeStyle = '#a8a8ac';
  g.lineWidth = 3;
  g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  g.fillStyle = '#c8c8cc';
  for (const [cx, cy] of [
    [x, y],
    [x + w - 9, y],
    [x, y + h - 9],
    [x + w - 9, y + h - 9],
  ] as const)
    g.fillRect(cx, cy, 9, 9);
  g.fillRect(x + w / 2 - 8, y + h / 2 - 4, 16, 8);
  if (rand() < 0.6) {
    g.fillStyle = pick(rand, ['#d8cfa8', '#8a2f3a', css(PAINT.pale)]);
    g.fillRect(x + 10 + rand() * (w - 50), y + 10 + rand() * (h - 30), 24 + rand() * 14, 12);
  }
}
// a loudspeaker: the cabinet and its two cones
function speaker(g: G, x: number, y: number, w: number, h: number) {
  block(g, x, y, w, h, '#1e1c22');
  for (const [cy, r] of [
    [y + h * 0.3, w * 0.22],
    [y + h * 0.68, w * 0.34],
  ] as const) {
    g.fillStyle = css(PAINT.ink4);
    g.beginPath();
    g.arc(x + w / 2, cy, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3a3644';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#2a2830';
    g.beginPath();
    g.arc(x + w / 2, cy, r * 0.35, 0, Math.PI * 2);
    g.fill();
  }
}

// What is let into a wall, about 3.7 m by 2.8 m. Four kinds by the seed: racks of gear; shelves of tape; a mixing
// desk under monitors; road cases stacked to the wall
export function studioTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 512,
    H = 400,
    kind = seed % 4;
  return canvasTex(W, H, g => {
    g.fillStyle = '#15131a';
    g.fillRect(0, 0, W, H);
    if (kind === 0) {
      for (let x = 4; x < W - 10; x += 127) {
        block(g, x, 6, 121, H - 10, pick(rand, GEAR));
        for (let y = 16; y < H - 40;) {
          const what = rand();
          if (what < 0.3) {
            reel(g, x + 36, y + 30, 22);
            reel(g, x + 86, y + 30, 22);
            y += 66;
          } else if (what < 0.6) {
            meter(g, rand, x + 14, y + 4, 42, 24);
            meter(g, rand, x + 66, y + 4, 42, 24);
            y += 38;
          } else {
            g.fillStyle = css(PAINT.ink4);
            g.fillRect(x + 8, y, 105, 22);
            for (let k = 0; k < 8; k++) {
              g.fillStyle = rand() < 0.3 ? GLOW : '#8a8890';
              g.beginPath();
              g.arc(x + 18 + k * 12, y + 11, 3.5, 0, Math.PI * 2);
              g.fill();
            }
            y += 30;
          }
        }
      }
    } else if (kind === 1) {
      g.fillStyle = '#3a3644';
      g.fillRect(0, 0, W, H);
      for (let row = 0; row < 6; row++) {
        const foot = 66 + row * 64;
        g.fillStyle = '#121016';
        g.fillRect(6, foot - 56, W - 12, 56);
        for (let x = 10; x < W - 20;) {
          const w = 9 + rand() * 6;
          if (rand() < 0.88) {
            g.fillStyle = pick(rand, TAPE);
            g.fillRect(x, foot - 50, w, 50);
            g.fillStyle = 'rgba(20,18,26,0.6)';
            g.fillRect(x + 2, foot - 40, w - 4, 16);
          }
          x += w + 1;
        }
        g.fillStyle = '#5a5666';
        g.fillRect(0, foot, W, 6);
      }
    } else if (kind === 2) {
      for (let k = 0; k < 4; k++) {
        const x = 14 + k * 124;
        block(g, x, 24, 112, 96, '#1e1c26');
        g.fillStyle = k === 2 ? '#3a3448' : css(PAINT.ink2);
        g.fillRect(x + 8, 32, 96, 74);
        if (k === 2)
          for (let n = 0; n < 500; n++) {
            g.fillStyle = rand() < 0.5 ? '#c8c2d8' : '#1a1820';
            g.fillRect(x + 8 + rand() * 94, 32 + rand() * 72, 2, 2);
          }
      }
      block(g, 0, 180, W, 80, css(PAINT.plum));
      for (let x = 14; x < W - 14; x += 16) {
        g.fillStyle = css(PAINT.ink4);
        g.fillRect(x + 5, 190, 3, 58);
        g.fillStyle = pick(rand, [css(PAINT.glow1), css(PAINT.pale), '#a02a30']);
        g.fillRect(x, 196 + rand() * 40, 13, 9);
      }
      block(g, 10, 260, W - 20, H - 264, '#26242e');
      for (let k = 0; k < 5; k++) meter(g, rand, 40 + k * 90, 132, 60, 34);
    } else {
      for (let x = 6; x < W - 60;) {
        const w = 90 + rand() * 70;
        let y = H - 4;
        for (let k = 0, n = 2 + Math.floor(rand() * 3); k < n && y > 60; k++) {
          const h = 60 + rand() * 60;
          y -= h;
          roadCase(g, rand, x, y, w, h - 3);
        }
        x += w + 6;
      }
    }
    // the work lights' violet from one side, the rest left to the dark
    g.globalCompositeOperation = 'lighter';
    const violet = g.createLinearGradient(W, 0, 0, H);
    violet.addColorStop(0, 'rgba(170,130,255,0.18)');
    violet.addColorStop(0.6, 'rgba(170,130,255,0)');
    g.fillStyle = violet;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    soil(g, rand, W, H, H * 0.6);
  });
}

// A heap along the foot of a wall, about 3.4 m by 1.7 m: road cases, loudspeakers, drums of cable, lamps
export function studioHeapTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 512,
    H = 256,
    foot = H - 6;
  return canvasTex(W, H, g => {
    for (let x = 8 + rand() * 20; x < W - 70;) {
      const kind = rand();
      if (kind < 0.4) {
        const w = 70 + rand() * 50;
        let y = foot;
        for (let k = 0, n = 1 + Math.floor(rand() * 2); k < n; k++) {
          const h = 46 + rand() * 30;
          y -= h;
          roadCase(g, rand, x + rand() * 6, y, w, h - 2);
        }
        x += w + rand() * 20;
      } else if (kind < 0.65) {
        const w = 56 + rand() * 14,
          h = 100 + rand() * 30;
        speaker(g, x, foot - h, w, h);
        x += w + rand() * 20;
      } else if (kind < 0.85) {
        // a drum of cable on its side
        const r = 26 + rand() * 12;
        g.fillStyle = css(PAINT.grey1);
        g.beginPath();
        g.arc(x + r, foot - r, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = css(PAINT.ink4);
        g.beginPath();
        g.arc(x + r, foot - r, r * 0.7, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = css(PAINT.grey1);
        g.beginPath();
        g.arc(x + r, foot - r, r * 0.2, 0, Math.PI * 2);
        g.fill();
        x += r * 2 + rand() * 20;
      } else {
        // a lamp off its stand: the can, its barn doors
        block(g, x, foot - 40, 46, 40, '#1e1c22');
        g.fillStyle = '#3a3644';
        g.fillRect(x - 8, foot - 44, 12, 48);
        g.fillRect(x + 42, foot - 44, 12, 48);
        g.fillStyle = '#e8dfb8';
        g.beginPath();
        g.arc(x + 23, foot - 20, 13, 0, Math.PI * 2);
        g.fill();
        x += 66 + rand() * 20;
      }
    }
    soil(g, rand, W, H, H * 0.5);
  });
}

// The face of a road case or of a loudspeaker, the whole picture: the solid things the heaps and benches are made of
export function studioBoxTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    S = 128;
  return canvasTex(S, S, g => {
    g.fillStyle = css(PAINT.ink10);
    g.fillRect(0, 0, S, S);
    if (seed % 2) roadCase(g, rand, 0, 0, S, S);
    else speaker(g, 0, 0, S, S);
    soil(g, rand, S, S, S * 0.4);
  });
}

// Microphones and headphones left hanging on their leads (about 2 m by 2.4 m)
export function hangingTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 200,
    H = 240;
  return canvasTex(W, H, g => {
    for (let k = 0, n = 2 + Math.floor(rand() * 3); k < n; k++) {
      const x = 24 + rand() * (W - 48),
        len = 80 + rand() * 130;
      g.strokeStyle = css(PAINT.ink4);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, 0);
      g.quadraticCurveTo(x + (rand() - 0.5) * 30, len / 2, x, len);
      g.stroke();
      if (rand() < 0.6) {
        g.fillStyle = '#3a3644';
        g.fillRect(x - 5, len, 10, 26);
        g.fillStyle = '#8a8890';
        g.beginPath();
        g.arc(x, len + 30, 8, 0, Math.PI * 2);
        g.fill();
      } else {
        g.strokeStyle = '#26242e';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(x, len + 14, 14, Math.PI, 0);
        g.stroke();
        g.fillStyle = css(PAINT.ink10);
        g.fillRect(x - 19, len + 12, 10, 16);
        g.fillRect(x + 9, len + 12, 10, 16);
      }
    }
  });
}

// The side of a raised deck of the broadcasting house, a tile wide and a deck high: a studio's stage, black cloth
// stretched on its frame, a strip of white tape and a row of floor lamps' sockets along its top
export function stageDeckTex(): THREE.CanvasTexture {
  const rand = seeded(2671),
    W = 256,
    H = 128;
  return canvasTex(W, H, g => {
    g.fillStyle = '#1a1820';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x < W; x += 9) g.fillRect(x, 14, 3, H);
    g.fillStyle = '#3a3644';
    g.fillRect(0, 0, W, 12);
    g.fillStyle = css(PAINT.glow1);
    g.fillRect(0, 12, W, 4);
    for (let x = 20; x < W; x += 46) {
      g.fillStyle = css(PAINT.ink4);
      g.fillRect(x, 24, 14, 10);
      g.fillStyle = rand() < 0.4 ? GLOW : css(PAINT.grey1);
      g.fillRect(x + 4, 27, 6, 4);
    }
    soil(g, rand, W, H, H * 0.5);
  });
}
