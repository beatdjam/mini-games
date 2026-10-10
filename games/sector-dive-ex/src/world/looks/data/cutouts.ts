import type * as THREE from 'three';
import { canvasTex } from '../paint.ts';
import { block, pick, seeded, soil } from '../cutoutTools.ts';
import type { G } from '../cutoutTools.ts';
// The waste data layer's painted set pieces (see looks/dress.ts): a server hall nobody services any more. Let into
// the walls: a patch bay with its coloured cords, shelves of spare parts, a console with its screens, a row of power
// units. Along the foot of the walls: drums of cable, chassis pulled out and left, cartons of parts, floor tiles
// lifted and stacked. Overhead: loops of cable let down from the ladders.

const CORD = ['#3d8de0', '#e0b83d', '#d9d6cc', '#e0553d', '#3de08a', '#8a5ad0'];
const CASE = ['#5c6670', '#4a525a', '#6f7880', '#3a4046'];
const LED = ['#4de0ff', '#58ff9a', '#ffb347', '#ff5a4a'];

// a small light on a panel: lit ones glow
function led(g: G, rand: () => number, x: number, y: number) {
  const color = pick(rand, LED);
  if (rand() < 0.6) {
    g.globalCompositeOperation = 'lighter';
    const glow = g.createRadialGradient(x, y, 0.5, x, y, 8);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow;
    g.fillRect(x - 8, y - 8, 16, 16);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = color;
  } else g.fillStyle = '#1c2228';
  g.fillRect(x - 1.5, y - 1.5, 3, 3);
}
// one unit of a rack: its face, its vents, its lights
function chassis(g: G, rand: () => number, x: number, y: number, w: number, h: number) {
  block(g, x, y, w, h, pick(rand, CASE));
  g.fillStyle = 'rgba(0,0,0,0.4)';
  for (let vx = x + w * 0.45; vx < x + w - 8; vx += 5) g.fillRect(vx, y + 4, 2, h - 8);
  for (let k = 0; k < 4; k++) led(g, rand, x + 10 + k * 9, y + h / 2);
}
// a drum of cable: the two cheeks and the cable wound between them
function spool(g: G, rand: () => number, x: number, foot: number, r: number) {
  g.fillStyle = '#7a6244';
  g.beginPath();
  g.arc(x, foot - r, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = pick(rand, ['#1c1c1e', '#2a4a7a', '#7a6a2a']);
  g.beginPath();
  g.arc(x, foot - r, r * 0.72, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 1;
  for (let k = 0.3; k < 0.72; k += 0.08) {
    g.beginPath();
    g.arc(x, foot - r, r * k, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#3a2e20';
  g.beginPath();
  g.arc(x, foot - r, r * 0.16, 0, Math.PI * 2);
  g.fill();
}

// What is let into a wall, about 3.7 m by 2.8 m. Four kinds by the seed: a patch bay; shelves of spare parts; a
// console; a row of power units
export function hallTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 512,
    H = 400,
    kind = seed % 4;
  return canvasTex(W, H, g => {
    g.fillStyle = '#1a2026';
    g.fillRect(0, 0, W, H);
    if (kind === 0) {
      // rows of sockets, and the cords looped from one to another
      for (let x = 6; x < W - 10; x += 168) block(g, x, 8, 160, H - 14, pick(rand, CASE));
      const socket: [number, number][] = [];
      for (let row = 0; row < 9; row++)
        for (let c = 0; c < 22; c++) {
          const x = 22 + c * 22,
            y = 30 + row * 30;
          g.fillStyle = '#0e1216';
          g.fillRect(x - 5, y - 5, 10, 10);
          socket.push([x, y]);
        }
      g.lineCap = 'round';
      for (let k = 0; k < 46; k++) {
        const [x1, y1] = pick(rand, socket),
          [x2, y2] = pick(rand, socket);
        g.strokeStyle = pick(rand, CORD);
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(x1, y1);
        g.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + 40 + rand() * 70, x2, y2);
        g.stroke();
      }
    } else if (kind === 1) {
      // shelves: drives and fans in their trays, cartons, coils of cord
      g.fillStyle = '#3a4046';
      g.fillRect(0, 0, W, H);
      for (let row = 0; row < 5; row++) {
        const foot = 76 + row * 78;
        g.fillStyle = '#12161a';
        g.fillRect(6, foot - 66, W - 12, 66);
        for (let x = 12; x < W - 50;) {
          const w = 30 + rand() * 40,
            h = 22 + rand() * 38;
          if (rand() < 0.5) chassis(g, rand, x, foot - h, w, h);
          else block(g, x, foot - h, w, h, pick(rand, ['#9a7b52', '#8a6a44', '#c9c2b0']));
          x += w + 3 + rand() * 10;
        }
        g.fillStyle = '#6f7880';
        g.fillRect(0, foot, W, 7);
      }
    } else if (kind === 2) {
      // a console: three screens (one alive), a desk of keys under them
      for (let k = 0; k < 3; k++) {
        const x = 20 + k * 164;
        block(g, x, 40, 150, 150, '#2a3038');
        g.fillStyle = k === 1 ? '#0f2a2e' : '#0c1014';
        g.fillRect(x + 10, 50, 130, 112);
        if (k === 1) {
          g.fillStyle = '#4de0ff';
          for (let row = 0; row < 9; row++) g.fillRect(x + 18, 60 + row * 11, 30 + rand() * 80, 3);
        }
      }
      block(g, 0, 214, W, 30, '#4a525a');
      for (let x = 20; x < W - 20; x += 12) {
        g.fillStyle = rand() < 0.1 ? '#e0b83d' : '#1c2228';
        g.fillRect(x, 220, 8, 8);
        g.fillRect(x, 232, 8, 8);
      }
      block(g, 10, 244, W - 20, H - 248, '#3a4046');
      for (let k = 0; k < 20; k++) led(g, rand, 30 + rand() * (W - 60), 270 + rand() * 100);
    } else {
      // power units: tall cabinets, each with its meter, its breakers and its warning
      for (let x = 4; x < W - 10; x += 127) {
        block(g, x, 6, 121, H - 10, pick(rand, CASE));
        g.fillStyle = '#0c1014';
        g.fillRect(x + 20, 30, 80, 44);
        g.fillStyle = '#58ff9a';
        g.fillRect(x + 28, 44, 20 + rand() * 50, 8);
        for (let k = 0; k < 6; k++) {
          g.fillStyle = '#1c2228';
          g.fillRect(x + 16 + k * 15, 100, 10, 30);
          g.fillStyle = rand() < 0.75 ? '#c9c2b0' : '#ff5a4a';
          g.fillRect(x + 18 + k * 15, rand() < 0.75 ? 102 : 116, 6, 12);
        }
        g.fillStyle = '#e0b83d';
        g.fillRect(x + 34, 160, 52, 40);
        g.fillStyle = '#1c2228';
        g.fillRect(x + 56, 168, 8, 16);
        g.fillRect(x + 56, 188, 8, 6);
        g.fillStyle = 'rgba(0,0,0,0.4)';
        for (let y = 240; y < H - 30; y += 9) g.fillRect(x + 14, y, 92, 3);
      }
    }
    // the cold light of the tubes from above, and the dust
    g.globalCompositeOperation = 'lighter';
    const cold = g.createLinearGradient(0, 0, 0, H);
    cold.addColorStop(0, 'rgba(160,210,255,0.14)');
    cold.addColorStop(0.6, 'rgba(160,210,255,0)');
    g.fillStyle = cold;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    soil(g, rand, W, H, H * 0.6);
  });
}

// A heap along the foot of a wall, about 3.4 m by 1.7 m: drums of cable, chassis left out, cartons, lifted floor
// tiles in a stack
export function hallHeapTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 512,
    H = 256,
    foot = H - 6;
  return canvasTex(W, H, g => {
    for (let x = 10 + rand() * 20; x < W - 70;) {
      const kind = rand();
      if (kind < 0.3) {
        const r = 30 + rand() * 20;
        spool(g, rand, x + r, foot, r);
        x += r * 2 + rand() * 20;
      } else if (kind < 0.6) {
        let y = foot;
        for (let k = 0, n = 2 + Math.floor(rand() * 4); k < n; k++) {
          y -= 20;
          chassis(g, rand, x + rand() * 8, y, 84, 18);
        }
        x += 100 + rand() * 20;
      } else if (kind < 0.8) {
        // floor tiles lifted and stacked, a little askew
        for (let k = 0, n = 3 + Math.floor(rand() * 5); k < n; k++)
          block(g, x + rand() * 6, foot - 9 - k * 9, 80, 8, '#8a9098');
        x += 96 + rand() * 20;
      } else {
        const h = 36 + rand() * 30;
        block(g, x, foot - h, 64, h, pick(rand, ['#9a7b52', '#8a6a44']));
        x += 72 + rand() * 24;
      }
    }
    // cords spilling over the floor in front
    g.lineCap = 'round';
    for (let k = 0; k < 7; k++) {
      g.strokeStyle = pick(rand, CORD);
      g.lineWidth = 2.5;
      const x = rand() * W;
      g.beginPath();
      g.moveTo(x, foot - 20 - rand() * 60);
      g.bezierCurveTo(x + 30, foot + 6, x + 80, foot - 30, x + 110 + rand() * 60, foot);
      g.stroke();
    }
    soil(g, rand, W, H, H * 0.5);
  });
}

// The face of a chassis or of a carton of parts, the whole picture: the solid things the heaps and benches are
// made of
export function hallBoxTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    S = 128;
  return canvasTex(S, S, g => {
    if (seed % 3) {
      g.fillStyle = pick(rand, CASE);
      g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 26) {
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(0, y, S, 2);
        for (let vx = 60; vx < S - 8; vx += 5) g.fillRect(vx, y + 6, 2, 16);
        for (let k = 0; k < 4; k++) led(g, rand, 10 + k * 10, y + 13);
      }
    } else {
      g.fillStyle = pick(rand, ['#9a7b52', '#8a6a44']);
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(60,40,20,0.35)';
      g.fillRect(S * 0.44, 0, S * 0.12, S);
      g.fillStyle = 'rgba(245,240,225,0.8)';
      g.fillRect(10, S * 0.55, S * 0.34, S * 0.25);
    }
    const shade = g.createLinearGradient(0, 0, S, S);
    shade.addColorStop(0, 'rgba(255,255,255,0.08)');
    shade.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = shade;
    g.fillRect(0, 0, S, S);
    soil(g, rand, S, S, S * 0.4);
  });
}

// Loops of cable let down from the ladders overhead, and a cord or two hanging loose (about 2.6 m by 2 m)
export function loopsTex(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed),
    W = 256,
    H = 200;
  return canvasTex(W, H, g => {
    g.lineCap = 'round';
    for (let k = 0; k < 9; k++) {
      const x1 = 10 + rand() * (W - 20),
        x2 = 10 + rand() * (W - 20);
      g.strokeStyle = pick(rand, ['#15171a', '#22262b', ...CORD]);
      g.lineWidth = 3 + rand() * 5;
      g.beginPath();
      g.moveTo(x1, 0);
      g.bezierCurveTo(x1, 80 + rand() * 110, x2, 80 + rand() * 110, x2, 0);
      g.stroke();
    }
  });
}

// The side of a raised deck of the data layer, a tile wide and a deck high: a raised floor seen from its edge, grey
// panels with their vents, a strip of status lights under the lip
export function floorDeckTex(): THREE.CanvasTexture {
  const rand = seeded(471),
    W = 256,
    H = 128;
  return canvasTex(W, H, g => {
    g.fillStyle = '#4a525a';
    g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 64) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x, 0, 2, H);
      for (let y = 40; y < H - 16; y += 8) g.fillRect(x + 12, y, 40, 3);
    }
    g.fillStyle = '#8a9098';
    g.fillRect(0, 0, W, 8);
    g.fillStyle = '#0c1014';
    g.fillRect(0, 12, W, 12);
    for (let x = 8; x < W; x += 12) led(g, rand, x, 18);
    soil(g, rand, W, H, H * 0.5);
  });
}
