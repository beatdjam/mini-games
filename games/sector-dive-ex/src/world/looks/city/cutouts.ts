import { PAINT, css } from '../../../data/colors.ts';
import type * as THREE from 'three';
import { canvasTex } from '../paint.ts';
import { block, pick, seeded, soil } from '../cutoutTools.ts';
import type { G } from '../cutoutTools.ts';
// The old downtown's painted set pieces (see looks/dress.ts): what an office left in a hurry is full of. Let into
// the walls: shelves of binders, desks with their sets and papers, a pantry counter, a row of steel cabinets. Along
// the foot of the walls: cartons, stacks of paper, old monitors and computers, bins, a dead plant. Overhead: ceiling
// panels come down, their cables hanging.

const SPINES = ['#2f4f7a', css(PAINT.rust1), '#2f6a4a', css(PAINT.clay5), '#33312e', '#a87a2c', '#5a5f66'];
const STEEL = ['#8d9093', '#7c8286', '#9a988f', '#6f757a'];
const CARTON = [css(PAINT.clay3), css(PAINT.clay2), '#a88a5e'];

// a row of binders and files on a shelf: spines of several colours, a few leaning, a gap here and there
function binders(g: G, rand: () => number, x: number, foot: number, w: number, h: number) {
  for (let bx = x; bx < x + w - 6;) {
    const bw = 7 + rand() * 9;
    if (rand() < 0.86) {
      const bh = h * (0.72 + rand() * 0.28);
      g.fillStyle = pick(rand, SPINES);
      g.fillRect(bx, foot - bh, bw, bh);
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillRect(bx + 1.5, foot - bh * 0.72, bw - 3, bh * 0.2);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(bx + bw - 1.5, foot - bh, 1.5, bh);
    }
    bx += bw + (rand() < 0.1 ? 10 : 0.5);
  }
}
// a cathode-ray monitor or a television: the case, the dark tube with what the window throws on it
function monitor(g: G, rand: () => number, x: number, y: number, w: number, h: number) {
  block(g, x, y, w, h, pick(rand, ['#cfc8b6', '#bdb6a4', '#a8a294']));
  const tube = g.createLinearGradient(x, y, x + w, y + h);
  tube.addColorStop(0, '#48524f');
  tube.addColorStop(1, '#1c2221');
  g.fillStyle = tube;
  g.fillRect(x + 4, y + 4, w - 8, h - 12);
  g.fillStyle = 'rgba(255,200,140,0.16)';
  g.fillRect(x + 6, y + 6, (w - 12) * 0.4, (h - 16) * 0.3);
}
// a carton, taped, a label on it; some with their flaps open
function carton(g: G, rand: () => number, x: number, y: number, w: number, h: number) {
  block(g, x, y, w, h, pick(rand, CARTON));
  g.fillStyle = 'rgba(60,40,20,0.35)';
  g.fillRect(x + w * 0.45, y, w * 0.1, h);
  if (rand() < 0.5) {
    g.fillStyle = 'rgba(245,240,225,0.8)';
    g.fillRect(x + 4, y + h * 0.5, w * 0.34, h * 0.28);
  }
}
// a stack of paper, its edges uneven
function paper(g: G, rand: () => number, x: number, foot: number, w: number, h: number) {
  for (let y = foot - 3; y > foot - h; y -= 3) {
    g.fillStyle = rand() < 0.5 ? '#e4dfd0' : '#d2ccba';
    g.fillRect(x + rand() * 4, y, w - rand() * 6, 3);
  }
}

// What is let into a wall, about 3.7 m by 2.8 m. Four kinds by the seed: shelves of binders; desks with their sets
// under a pin board; a pantry counter; steel cabinets and lockers
export function officeTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 512,
    H = 400,
    kind = seed % 4;
  return canvasTex(W, H, g => {
    g.fillStyle = '#4a443a';
    g.fillRect(0, 0, W, H);
    if (kind === 0) {
      // steel shelving, five shelves of binders, cartons on top
      g.fillStyle = css(PAINT.grey4);
      g.fillRect(0, 0, W, H);
      for (let row = 0; row < 5; row++) {
        const foot = 96 + row * 72;
        g.fillStyle = '#2f2b26';
        g.fillRect(4, foot - 62, W - 8, 62);
        binders(g, rand, 10, foot, W - 20, 54);
        g.fillStyle = '#9a968c';
        g.fillRect(0, foot, W, 7);
      }
      for (let x = 12; x < W - 80; x += 70 + rand() * 40) carton(g, rand, x, 4, 60 + rand() * 30, 30);
      g.fillStyle = '#8a867c';
      for (const x of [0, W / 2 - 4, W - 8]) g.fillRect(x, 0, 8, H);
    } else if (kind === 1) {
      // a pin board over two desks pushed to the wall: sets, papers, a telephone
      g.fillStyle = '#7b6a4c';
      g.fillRect(40, 30, W - 80, 130);
      for (let k = 0; k < 16; k++) {
        g.fillStyle = pick(rand, [css(PAINT.glow4), css(PAINT.glow1), '#e6d9a8', '#c9d6de']);
        g.fillRect(50 + rand() * (W - 150), 38 + rand() * 90, 26 + rand() * 30, 22 + rand() * 24);
      }
      g.fillStyle = '#8f8a7e';
      g.fillRect(0, 250, W, 14);
      g.fillStyle = '#5f5a50';
      g.fillRect(0, 264, W, H - 264);
      for (let x = 10; x < W - 20; x += 126) {
        g.fillStyle = '#77726a';
        g.fillRect(x, 276, 112, 112);
        g.fillStyle = css(PAINT.soot12);
        for (let dy = 0; dy < 3; dy++) g.fillRect(x + 30, 292 + dy * 34, 52, 5);
      }
      for (let x = 30; x < W - 100; x += 150 + rand() * 30) {
        monitor(g, rand, x, 178, 84, 72);
        paper(g, rand, x + 92, 250, 44, 10 + rand() * 26);
      }
    } else if (kind === 2) {
      // a pantry: cupboards over a counter, a sink, a kettle, cups; a calendar on the wall
      g.fillStyle = '#b9b2a2';
      g.fillRect(0, 0, W, H);
      for (let x = 6; x < W - 10; x += 100) block(g, x, 10, 94, 110, '#a9a08a');
      g.fillStyle = '#d8d4c8';
      g.fillRect(0, 232, W, 16);
      for (let x = 6; x < W - 10; x += 100) block(g, x, 250, 94, 144, '#9a917c');
      g.fillStyle = '#8f9499';
      g.fillRect(60, 214, 120, 20);
      g.fillStyle = '#5a5f66';
      g.fillRect(112, 180, 8, 36);
      block(g, 250, 190, 40, 44, '#c44a36');
      for (let x = 320; x < 470; x += 30) block(g, x, 212, 20, 22, pick(rand, ['#e8e2d6', '#d0dfe6', '#e6d9a8']));
      g.fillStyle = '#f0ebdc';
      g.fillRect(380, 130, 70, 70);
      g.fillStyle = '#b0302a';
      g.fillRect(380, 130, 70, 16);
    } else {
      // steel cabinets and lockers, a helmet and files on top
      for (let x = 2; x < W - 10; x += 102) {
        block(g, x, 60, 98, H - 64, pick(rand, STEEL));
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(x + 48, 66, 2, H - 76);
        g.fillStyle = css(PAINT.glow4);
        g.fillRect(x + 12, 96, 30, 16);
        g.fillRect(x + 58, 96, 30, 16);
        g.fillStyle = css(PAINT.soot8);
        g.fillRect(x + 38, 200, 6, 22);
        g.fillRect(x + 54, 200, 6, 22);
      }
      binders(g, rand, 20, 60, 200, 44);
      for (let x = 260; x < W - 80; x += 80) carton(g, rand, x, 22, 64, 38);
    }
    // the low sun from the windows across the room: warm over one side, the far corner left dark
    g.globalCompositeOperation = 'lighter';
    const sun = g.createLinearGradient(0, 0, W, H);
    sun.addColorStop(0, 'rgba(255,170,90,0.20)');
    sun.addColorStop(0.6, 'rgba(255,170,90,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    const dark = g.createLinearGradient(0, 0, W, H);
    dark.addColorStop(0.4, 'rgba(0,0,0,0)');
    dark.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = dark;
    g.fillRect(0, 0, W, H);
    soil(g, rand, W, H, H * 0.55);
  });
}

// A heap along the foot of a wall, about 3.4 m by 1.7 m: cartons, paper, old sets and computers, bins, a dead plant
export function officeHeapTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 512,
    H = 256,
    foot = H - 6;
  return canvasTex(W, H, g => {
    for (let x = 6 + rand() * 20; x < W - 80;) {
      const w = 56 + rand() * 44;
      let y = foot;
      for (let k = 0, n = 1 + Math.floor(rand() * 3); k < n; k++) {
        const h = 38 + rand() * 30;
        y -= h;
        if (rand() < 0.3) monitor(g, rand, x + rand() * 6, y, w * 0.85, h - 2);
        else carton(g, rand, x + rand() * 6, y, w * (0.8 + rand() * 0.2), h - 2);
      }
      x += w + rand() * 30;
    }
    for (let x = 6 + rand() * 30; x < W - 50;) {
      const kind = rand(),
        w = 34 + rand() * 30;
      if (kind < 0.35) paper(g, rand, x, foot, w, 14 + rand() * 40);
      else if (kind < 0.55) {
        // a computer's case on its side
        block(g, x, foot - 26, w + 20, 26, css(PAINT.clay6));
        g.fillStyle = css(PAINT.soot13);
        g.fillRect(x + 6, foot - 18, 22, 5);
      } else if (kind < 0.75) {
        // a waste bin
        g.fillStyle = pick(rand, ['#4a5560', '#5f5a50', '#6a4a3a']);
        g.beginPath();
        g.moveTo(x, foot - 40);
        g.lineTo(x + w * 0.8, foot - 40);
        g.lineTo(x + w * 0.7, foot);
        g.lineTo(x + w * 0.1, foot);
        g.closePath();
        g.fill();
      } else if (kind < 0.88) {
        // a plant gone brown in its pot
        g.fillStyle = '#7a4a34';
        g.fillRect(x + 6, foot - 22, 26, 22);
        g.strokeStyle = '#6a5a34';
        g.lineWidth = 2;
        for (let k = 0; k < 7; k++) {
          g.beginPath();
          g.moveTo(x + 19, foot - 22);
          g.quadraticCurveTo(
            x + 19 + (rand() - 0.5) * 50,
            foot - 60,
            x + 19 + (rand() - 0.5) * 70,
            foot - 40 - rand() * 50,
          );
          g.stroke();
        }
      } else carton(g, rand, x, foot - 32, w, 32);
      x += w + rand() * 44;
    }
    soil(g, rand, W, H, H * 0.45);
  });
}

// The face of a steel cabinet or of a carton, the whole picture: the solid things the heaps and counters are made of
export function officeBoxTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    S = 128;
  return canvasTex(S, S, g => {
    if (seed % 2) {
      g.fillStyle = pick(rand, STEEL);
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (let k = 1; k < 3; k++) g.fillRect(0, (S / 3) * k - 1, S, 3);
      g.fillStyle = css(PAINT.soot8);
      for (let k = 0; k < 3; k++) g.fillRect(S / 2 - 16, (S / 3) * k + 16, 32, 5);
    } else {
      g.fillStyle = pick(rand, CARTON);
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(60,40,20,0.35)';
      g.fillRect(S * 0.44, 0, S * 0.12, S);
      g.fillStyle = 'rgba(245,240,225,0.8)';
      g.fillRect(10, S * 0.55, S * 0.34, S * 0.25);
    }
    const shade = g.createLinearGradient(0, 0, S, S);
    shade.addColorStop(0, 'rgba(255,255,255,0.1)');
    shade.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = shade;
    g.fillRect(0, 0, S, S);
    soil(g, rand, S, S, S * 0.3);
  });
}

// A ceiling panel come down on one side, its hanger wires and a cable or two hanging from where it was (about 2.4 m
// by 1.8 m, seen against the ceiling)
export function fallenPanelTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 256,
    H = 192;
  return canvasTex(W, H, g => {
    g.strokeStyle = '#1b1a18';
    g.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      g.lineWidth = 1.5 + rand() * 3;
      g.beginPath();
      const x = 20 + rand() * (W - 40);
      g.moveTo(x, 0);
      g.quadraticCurveTo(x + (rand() - 0.5) * 60, 70, x + (rand() - 0.5) * 80, 60 + rand() * 110);
      g.stroke();
    }
    g.save();
    g.translate(W / 2, 70);
    g.rotate(0.35 + rand() * 0.3);
    g.fillStyle = css(PAINT.chalk);
    g.fillRect(-90, -8, 180, 16);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = -80; x < 90; x += 12) g.fillRect(x, -6, 2, 12);
    g.restore();
    soil(g, rand, W, H, 0);
  });
}

// The side of a raised deck of the office, a tile wide and a deck high: a mezzanine built of partition panels, an
// aluminium edge along its top, a dark skirting at its foot
export function officeDeckTex(): THREE.CanvasTexture {
  const rand = seeded(871),
    W = 256,
    H = 128;
  return canvasTex(W, H, g => {
    g.fillStyle = '#b8ad96';
    g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 64) {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x, 0, 2, H);
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.fillRect(x + 2, 0, 2, H);
    }
    g.fillStyle = css(PAINT.grey11);
    g.fillRect(0, 0, W, 9);
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.fillRect(0, 0, W, 2);
    g.fillStyle = css(PAINT.soot10);
    g.fillRect(0, H - 14, W, 14);
    const shade = g.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = shade;
    g.fillRect(0, 0, W, H);
    soil(g, rand, W, H, H * 0.5);
  });
}
