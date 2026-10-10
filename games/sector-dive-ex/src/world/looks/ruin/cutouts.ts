import { PAINT, css } from '../../../data/colors.ts';
import type * as THREE from 'three';
import { canvasTex } from '../paint.ts';
import { block, pick, seeded, soil } from '../cutoutTools.ts';
import type { G } from '../cutoutTools.ts';
// The ruined streets' painted set pieces (see looks/dress.ts): what was left in the flats when the people went. Let
// into the walls: a wardrobe with its doors off, a bedding cupboard, a kitchen unit, a bookcase half fallen. Along
// the foot of the walls: broken chairs, folded mattresses, crates, buckets, lumps of fallen wall. Overhead: rags on a
// line.

const WOOD = ['#5a4632', '#6a5238', '#4a3a2a', css(PAINT.clay1)];
const CLOTH = ['#8a8472', '#6f5a4a', '#5a6a72', '#9a8a6a', '#7a4a42'];

// folded bedding: a pile of quilts, each a band with its fold
function bedding(g: G, rand: () => number, x: number, foot: number, w: number, n: number) {
  for (let k = 0; k < n; k++) {
    const h = 14 + rand() * 8,
      y = foot - (k + 1) * 17;
    g.fillStyle = pick(rand, CLOTH);
    g.fillRect(x + rand() * 5, y, w - rand() * 8, h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x + 3, y + h - 3, w - 6, 3);
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.fillRect(x + 3, y, w - 6, 2);
  }
}
// a lump of fallen wall: a grey block with a broken edge
function lump(g: G, rand: () => number, x: number, foot: number, w: number, h: number) {
  g.fillStyle = pick(rand, [css(PAINT.grey6), '#6a665c', css(PAINT.grey7)]);
  g.beginPath();
  g.moveTo(x, foot);
  g.lineTo(x + w * 0.1, foot - h * (0.6 + rand() * 0.4));
  g.lineTo(x + w * 0.5, foot - h);
  g.lineTo(x + w * 0.9, foot - h * (0.5 + rand() * 0.4));
  g.lineTo(x + w, foot);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x + w * 0.55, foot - h * 0.5, w * 0.4, h * 0.5);
}

// What is let into a wall, about 3.7 m by 2.8 m. Four kinds by the seed: a wardrobe and a chest; a bedding cupboard
// with its sliding doors half off; a kitchen unit; a bookcase with most of its books on the floor
export function flatTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 512,
    H = 400,
    kind = seed % 4;
  return canvasTex(W, H, g => {
    g.fillStyle = css(PAINT.soot10);
    g.fillRect(0, 0, W, H);
    if (kind === 0) {
      block(g, 10, 20, 230, H - 24, pick(rand, WOOD));
      g.fillStyle = '#1c1814';
      g.fillRect(24, 34, 96, H - 60);
      for (let k = 0; k < 4; k++) {
        g.fillStyle = pick(rand, CLOTH);
        g.fillRect(34 + k * 20, 60, 14, 150 + rand() * 60);
      }
      g.fillStyle = css(PAINT.soot3);
      g.fillRect(28, 50, 90, 4);
      block(g, 270, 170, 230, H - 174, pick(rand, WOOD));
      for (let k = 0; k < 4; k++) {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(278, 180 + k * 54, 214, 3);
        g.fillStyle = '#a89a78';
        g.fillRect(370, 200 + k * 54, 30, 6);
      }
      block(g, 300, 120, 60, 50, '#5a6a72');
      block(g, 380, 140, 90, 30, pick(rand, CLOTH));
    } else if (kind === 1) {
      g.fillStyle = '#1c1814';
      g.fillRect(8, 16, W - 16, H - 20);
      g.fillStyle = '#5a4632';
      g.fillRect(8, 196, W - 16, 10);
      bedding(g, rand, 30, 194, 200, 7);
      bedding(g, rand, 270, 194, 190, 4);
      bedding(g, rand, 40, 392, 180, 5);
      for (let x = 260; x < W - 80; x += 74) block(g, x, 330 - rand() * 50, 64, 62 + rand() * 50, css(PAINT.clay2));
      // one sliding door left, hanging off its track
      g.save();
      g.translate(380, 110);
      g.rotate(0.06);
      g.fillStyle = '#c9bfa4';
      g.fillRect(-10, -92, 130, 190);
      g.strokeStyle = '#5a4632';
      g.lineWidth = 6;
      g.strokeRect(-10, -92, 130, 190);
      g.restore();
    } else if (kind === 2) {
      g.fillStyle = css(PAINT.grey9);
      g.fillRect(0, 0, W, H);
      for (let x = 6; x < W - 10; x += 126) block(g, x, 10, 118, 100, '#7a7466');
      g.fillStyle = css(PAINT.grey11);
      g.fillRect(0, 226, W, 14);
      for (let x = 6; x < W - 10; x += 126) block(g, x, 242, 118, 150, '#6f6a5c');
      g.fillStyle = '#5a5f62';
      g.fillRect(40, 206, 150, 22);
      g.fillRect(104, 160, 8, 48);
      for (let x = 230; x < W - 60; x += 56 + rand() * 30) {
        // a pot or a kettle on the counter
        g.fillStyle = pick(rand, [css(PAINT.soot13), '#7a7672', '#8a4a34']);
        g.beginPath();
        g.ellipse(x + 20, 210, 20, 16, 0, 0, Math.PI * 2);
        g.fill();
        g.fillRect(x + 36, 204, 22, 4);
      }
      g.fillStyle = 'rgba(40,60,30,0.35)';
      for (let k = 0; k < 9; k++) g.fillRect(rand() * W, 110 + rand() * 100, 20 + rand() * 60, 30 + rand() * 50);
    } else {
      block(g, 20, 10, W - 40, H - 14, pick(rand, WOOD));
      for (let row = 0; row < 5; row++) {
        const foot = 80 + row * 76;
        g.fillStyle = '#1c1814';
        g.fillRect(34, foot - 62, W - 68, 62);
        for (let x = 40; x < W - 60;) {
          const w = 8 + rand() * 12;
          if (rand() < (row < 2 ? 0.75 : 0.3)) {
            const lean = rand() < 0.2 ? 6 : 0;
            g.fillStyle = pick(rand, ['#7a2f2a', '#2f4a6a', '#3a5a3a', '#c9bfa4', '#4a3a2a', '#8a6a2a']);
            g.fillRect(x + lean, foot - 50 - rand() * 8, w, 50 + rand() * 8);
          }
          x += w + 1;
        }
      }
    }
    // green light through the leaves at the window, and the damp
    g.fillStyle = 'rgba(70,90,60,0.16)';
    g.fillRect(0, 0, W, H);
    const dark = g.createLinearGradient(0, 0, W, H);
    dark.addColorStop(0.3, 'rgba(0,0,0,0)');
    dark.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = dark;
    g.fillRect(0, 0, W, H);
    soil(g, rand, W, H, H * 0.35);
  });
}

// A heap along the foot of a wall, about 3.4 m by 1.7 m: fallen wall, broken chairs, mattresses, crates, buckets
export function flatHeapTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 512,
    H = 256,
    foot = H - 6;
  return canvasTex(W, H, g => {
    for (let x = 6 + rand() * 20; x < W - 70;) {
      const kind = rand(),
        w = 50 + rand() * 60;
      if (kind < 0.35) lump(g, rand, x, foot, w, 30 + rand() * 60);
      else if (kind < 0.55) {
        // a mattress folded over, leaning
        g.fillStyle = pick(rand, CLOTH);
        g.fillRect(x, foot - 100, 26, 100);
        g.fillRect(x + 22, foot - 60, w * 0.8, 26);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        for (let y = foot - 96; y < foot; y += 14) g.fillRect(x, y, 26, 2);
      } else if (kind < 0.75) {
        // a chair on its side: the seat and the legs sticking out
        g.fillStyle = pick(rand, WOOD);
        g.fillRect(x, foot - 44, 44, 8);
        g.fillRect(x, foot - 44, 6, 44);
        g.fillRect(x + 38, foot - 44, 6, 44);
        g.fillRect(x + 4, foot - 84, 6, 42);
        g.fillRect(x + 4, foot - 84, 34, 6);
      } else if (kind < 0.9) block(g, x, foot - 40 - rand() * 20, w, 40 + rand() * 20, pick(rand, WOOD));
      else {
        g.fillStyle = pick(rand, ['#4a5a6a', '#7a4a3a', '#5a5a52']);
        g.beginPath();
        g.moveTo(x, foot - 34);
        g.lineTo(x + 34, foot - 34);
        g.lineTo(x + 28, foot);
        g.lineTo(x + 6, foot);
        g.closePath();
        g.fill();
      }
      x += w + rand() * 30;
    }
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(60,80,50,0.18)';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    soil(g, rand, W, H, H * 0.3);
  });
}

// The face of a broken chest or of a block of fallen wall, the whole picture: the solid things the heaps are made of
export function flatBoxTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    S = 128;
  return canvasTex(S, S, g => {
    if (seed % 2) {
      g.fillStyle = pick(rand, WOOD);
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let k = 1; k < 3; k++) g.fillRect(0, (S / 3) * k - 2, S, 4);
      g.fillStyle = '#a89a78';
      for (let k = 0; k < 3; k++) g.fillRect(S / 2 - 12, (S / 3) * k + 18, 24, 5);
    } else {
      g.fillStyle = css(PAINT.grey5);
      g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(20,18,16,0.6)';
      g.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.moveTo(rand() * S, 0);
        g.lineTo(rand() * S, S * 0.5);
        g.lineTo(rand() * S, S);
        g.stroke();
      }
      g.fillStyle = 'rgba(60,80,50,0.3)';
      g.fillRect(0, S * 0.7, S, S * 0.3);
    }
    const shade = g.createLinearGradient(0, 0, S, S);
    shade.addColorStop(0, 'rgba(255,255,255,0.08)');
    shade.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = shade;
    g.fillRect(0, 0, S, S);
    soil(g, rand, S, S, S * 0.2);
  });
}

// Rags left on a line: a few torn cloths, grey with the weather (about 3.4 m by 1.4 m)
export function ragsTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 384,
    H = 160;
  return canvasTex(W, H, g => {
    g.strokeStyle = css(PAINT.soot6);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 6);
    g.quadraticCurveTo(W / 2, 22, W, 6);
    g.stroke();
    for (let x = 20 + rand() * 30; x < W - 60;) {
      const w = 34 + rand() * 40,
        h = 50 + rand() * 80,
        top = 10 + Math.sin((x / W) * Math.PI) * 10;
      g.fillStyle = pick(rand, ['#8a8678', css(PAINT.grey3), '#7a7062', '#5c5a52']);
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x + w, top);
      g.lineTo(x + w - rand() * 10, top + h * (0.7 + rand() * 0.3));
      g.lineTo(x + w * 0.5, top + h);
      g.lineTo(x + rand() * 8, top + h * (0.6 + rand() * 0.3));
      g.closePath();
      g.fill();
      x += w + 20 + rand() * 50;
    }
    soil(g, rand, W, H, 0);
  });
}

// The side of a raised deck of the ruins, a tile wide and a deck high: a floor that stayed up, its broken edge of
// concrete and the bars sticking out of it, moss along its foot
export function slabDeckTex(): THREE.CanvasTexture {
  const rand = seeded(1171),
    W = 256,
    H = 128;
  return canvasTex(W, H, g => {
    g.fillStyle = css(PAINT.grey5);
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#5c5850';
    g.fillRect(0, 0, W, 18);
    g.strokeStyle = 'rgba(20,18,16,0.55)';
    g.lineWidth = 2;
    for (let k = 0; k < 9; k++) {
      g.beginPath();
      const x = rand() * W;
      g.moveTo(x, 18);
      g.lineTo(x + (rand() - 0.5) * 40, 60 + rand() * 60);
      g.stroke();
    }
    g.fillStyle = '#4a2a1c';
    for (let x = 14; x < W; x += 30 + rand() * 20) g.fillRect(x, 6, 3, 10 + rand() * 6);
    g.fillStyle = 'rgba(60,84,48,0.6)';
    for (let x = 0; x < W; x += 6) g.fillRect(x, H - 8 - rand() * 22, 6, 30);
    soil(g, rand, W, H, H * 0.3);
  });
}
