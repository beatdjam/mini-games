import { createRng } from '@engine/core/util.ts';
import { BASE_BOARD, BASE_CHECK, BASE_SAFETY } from '../i18n/signs.ts';
import { SIGN_FONT } from '../world/looks/paint.ts';
// The base's backdrop (the new layout, ui/hud2.ts): the wall of the site office the workers set out from. A row of
// steel lockers on the left, the notice board and the plates in the middle, a workbench and its pegboard of tools on
// the right, a strip light over it all; one picture, painted once, laid behind the base and darkened there
// (hud2.css), so that it gives the place without taking the eye from the panels. Shaded, stained and grained, a little
// out of focus, so that it reads as a real room behind the panels rather than as a drawing
const W = 1920,
  H = 1080,
  FLOOR = 900; // where the wall meets the floor (px)
export function paintBaseBackdrop(): string {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!,
    rand = createRng(2610).next;
  // the wall: painted concrete panels, grimy toward the floor
  const wall = g.createLinearGradient(0, 0, 0, FLOOR);
  wall.addColorStop(0, '#3a3c3a');
  wall.addColorStop(1, '#2a2b29');
  g.fillStyle = wall;
  g.fillRect(0, 0, W, FLOOR);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 240; x < W; x += 240) g.fillRect(x, 0, 2, FLOOR);
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + rand() * 0.04})`;
    g.fillRect(rand() * W, rand() * FLOOR, 2 + rand() * 30, 2 + rand() * 20);
  }
  // the floor: concrete, a black and yellow line along the foot of the wall
  g.fillStyle = '#1d1e1c';
  g.fillRect(0, FLOOR, W, H - FLOOR);
  for (let x = 0; x < W; x += 40) {
    g.fillStyle = (x / 40) % 2 ? '#151515' : '#c99a12';
    g.fillRect(x, FLOOR, 40, 14);
  }
  // the strip light: a bright tube near the top, its light falling down the wall
  const glow = g.createRadialGradient(W / 2, 40, 20, W / 2, 40, 900);
  glow.addColorStop(0, 'rgba(240,236,220,0.22)');
  glow.addColorStop(1, 'rgba(240,236,220,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, FLOOR);
  g.fillStyle = '#e9e6d8';
  g.fillRect(W / 2 - 260, 30, 520, 12);
  // the lockers: six grey-green steel doors, vents at the top, a handle and a name plate each
  for (let k = 0; k < 6; k++) {
    const x = 60 + k * 112,
      y = 300;
    // (lit from the strip light above: brighter at the top, a soft edge down each side, a shadow on the wall behind)
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 24;
    g.shadowOffsetX = 6;
    const door = g.createLinearGradient(x, y, x + 104, y);
    door.addColorStop(0, '#39423c');
    door.addColorStop(0.2, k % 3 === 1 ? '#46524a' : '#4b574f');
    door.addColorStop(0.85, k % 3 === 1 ? '#424d46' : '#46524a');
    door.addColorStop(1, '#2f3732');
    g.fillStyle = door;
    g.fillRect(x, y, 104, FLOOR - y);
    g.restore();
    const fall = g.createLinearGradient(0, y, 0, FLOOR);
    fall.addColorStop(0, 'rgba(255,255,255,0.06)');
    fall.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = fall;
    g.fillRect(x, y, 104, FLOOR - y);
    // (dents and scuffs, rust bleeding from the vents)
    for (let d = 0; d < 6; d++) {
      g.fillStyle = `rgba(0,0,0,${0.08 + rand() * 0.12})`;
      g.fillRect(x + rand() * 90, y + 140 + rand() * 400, 6 + rand() * 14, 2 + rand() * 6);
    }
    g.fillStyle = 'rgba(110,60,30,0.22)';
    g.fillRect(x + 22 + rand() * 50, y + 90, 3, 30 + rand() * 80);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let v = 0; v < 5; v++) g.fillRect(x + 20, y + 30 + v * 12, 64, 4);
    g.fillRect(x + 84, y + 260, 6, 60);
    g.fillStyle = '#d8d4c4';
    g.fillRect(x + 22, y + 110, 60, 18);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(x + 104, y, 8, FLOOR - y);
  }
  // the notice board: cork in a timber frame, papers pinned at angles, its head painted on
  const bx = 820,
    by = 230;
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 30;
  g.shadowOffsetY = 10;
  g.fillStyle = '#5a4630';
  g.fillRect(bx - 12, by - 12, 424, 304);
  g.restore();
  g.fillStyle = '#8a6a44';
  g.fillRect(bx, by, 400, 280);
  for (let k = 0; k < 9; k++) {
    g.save();
    g.translate(bx + 40 + (k % 3) * 125 + rand() * 20, by + 70 + Math.floor(k / 3) * 70 + rand() * 10);
    g.rotate((rand() - 0.5) * 0.15);
    g.fillStyle = rand() < 0.2 ? '#e6d79a' : '#e8e4d6';
    g.fillRect(0, 0, 90, 56);
    g.fillStyle = 'rgba(40,40,40,0.5)';
    for (let l = 0; l < 4; l++) g.fillRect(8, 10 + l * 11, 50 + rand() * 25, 3);
    g.fillStyle = '#c0392b';
    g.fillRect(42, -3, 6, 6);
    g.restore();
  }
  g.fillStyle = '#e8e4d6';
  g.font = `bold 30px ${SIGN_FONT}`;
  g.textAlign = 'center';
  g.fillText(BASE_BOARD, bx + 200, by + 44);
  // the plates: green "safety first" with its cross, and the check before going in
  g.fillStyle = '#e8e4d6';
  g.fillRect(bx + 20, 560, 360, 90);
  g.fillStyle = '#2e7d4f';
  g.fillRect(bx + 36, 576, 58, 58);
  g.fillStyle = '#e8e4d6';
  g.fillRect(bx + 59, 582, 12, 46);
  g.fillRect(bx + 42, 599, 46, 12);
  g.fillStyle = '#2e7d4f';
  g.font = `bold 44px ${SIGN_FONT}`;
  g.textAlign = 'left';
  g.fillText(BASE_SAFETY, bx + 112, 622);
  g.fillStyle = '#c99a12';
  g.fillRect(bx + 20, 680, 360, 60);
  g.fillStyle = '#151515';
  g.font = `bold 32px ${SIGN_FONT}`;
  g.fillText(BASE_CHECK, bx + 40, 722);
  // the workbench: a steel bench, a vice on it, the pegboard of tools above
  const wx = 1340;
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.55)';
  g.shadowBlur = 28;
  g.shadowOffsetY = 8;
  g.fillStyle = '#2f3331';
  g.fillRect(wx, 260, 500, 330);
  g.restore();
  g.fillStyle = 'rgba(0,0,0,0.4)';
  for (let y = 280; y < 580; y += 24) for (let x = wx + 20; x < wx + 500; x += 24) g.fillRect(x, y, 3, 3);
  g.fillStyle = '#9a968a';
  for (let k = 0; k < 7; k++) {
    const tx = wx + 40 + k * 66,
      len = 120 + rand() * 120;
    g.fillRect(tx, 300, 10, len);
    g.fillRect(tx - 12, 300, 34, 22);
  }
  g.fillStyle = '#4a4d4a';
  g.fillRect(wx - 20, 640, 540, 30);
  g.fillRect(wx, 670, 24, FLOOR - 670);
  g.fillRect(wx + 476, 670, 24, FLOOR - 670);
  g.fillStyle = '#5c5f5a';
  g.fillRect(wx + 60, 600, 90, 40);
  g.fillStyle = '#7a3a2a';
  g.fillRect(wx + 300, 610, 120, 30);
  // water stains run down the wall from the ceiling, and the corners fall into shadow
  for (let k = 0; k < 40; k++) {
    const x = rand() * W,
      len = 120 + rand() * 500,
      st = g.createLinearGradient(0, 0, 0, len);
    st.addColorStop(0, `rgba(20,22,18,${0.12 + rand() * 0.15})`);
    st.addColorStop(1, 'rgba(20,22,18,0)');
    g.fillStyle = st;
    g.fillRect(x, 0, 4 + rand() * 18, len);
  }
  const corners = g.createRadialGradient(W / 2, H * 0.45, H * 0.35, W / 2, H * 0.45, W * 0.7);
  corners.addColorStop(0, 'rgba(0,0,0,0)');
  corners.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = corners;
  g.fillRect(0, 0, W, H);
  // as a camera sees it with the panels in focus: the wall a little out of focus and the colour drained a little, then
  // the grain of the picture over it all (this keeps the painted shapes from reading as flat cut-outs)
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const o = out.getContext('2d')!;
  o.filter = 'blur(3px) saturate(0.55) contrast(1.05)';
  o.drawImage(c, 0, 0);
  o.filter = 'none';
  const grain = o.getImageData(0, 0, W, H),
    px = grain.data;
  for (let i = 0; i < px.length; i += 4) {
    const n = (rand() - 0.5) * 18;
    px[i] = px[i]! + n;
    px[i + 1] = px[i + 1]! + n;
    px[i + 2] = px[i + 2]! + n;
  }
  o.putImageData(grain, 0, 0);
  return out.toDataURL('image/jpeg', 0.82);
}
