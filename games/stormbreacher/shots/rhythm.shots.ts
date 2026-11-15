// The B section's rhythm (SB-2020): a top-down drawing of the section (the lines, the blast points, the nests' fire and
// the cover between them), the fire seen from line 2's near blast point, and the ground between two milestones.
// npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ between machines).
// SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { M1B_HAND } from '../src/data/maps/m1b-hand.ts';
import { PROP_SIZE } from '../src/data/props.ts';
import { sendToScript } from '../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const CAMERA_FRAMES = 40; // frames the camera takes to come round behind the mech
const WIDTH = 1280;
const HEIGHT = 720;

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

async function until(done: () => boolean, tries = 600): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} frames`);
}

async function picture(name: string): Promise<void> {
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

// No mortar shells while the camera settles and the picture is taken.
function quiet(): void {
  const current = game();
  current.barrages = [];
  current.shells = [];
}

// Puts the mech at (x, z) facing `yaw` (0 is the land) and lets the camera come round behind it.
function standAt(x: number, z: number, yaw = 0): void {
  const current = game();
  current.mech.x = x;
  current.mech.z = z;
  current.mech.y = 0;
  current.mech.grounded = true;
  current.mech.yaw = yaw;
  current.armor = 1e9;
  for (let i = 0; i < CAMERA_FRAMES; i++) {
    quiet();
    runSystems(1 / 60);
  }
}

// The top-down drawing of the section. The section's z runs from the beach (150) to the seawall's landward side (-80),
// and the drawing scales x and z alike so a line's length reads true. The nests' cones are the ground their fire sweeps.
function drawSection(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:9999';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  const MINZ = -80;
  const MAXZ = 150;
  const SCALE = (HEIGHT - 70) / (MAXZ - MINZ);
  const px = (x: number) => WIDTH / 2 + x * SCALE;
  const py = (z: number) => 35 + (MAXZ - z) * SCALE;

  ctx.fillStyle = '#c9b98f';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // the sea is the strip at the top
  ctx.fillStyle = '#7699a8';
  ctx.fillRect(0, 0, WIDTH, py(MAXZ));
  ctx.fillStyle = 'rgba(90, 120, 140, 0.25)';
  ctx.fillRect(0, py(MAXZ), WIDTH, 18);

  // the props: cover first, then the hedgehog rows over it
  for (const prop of M1B_HAND.props) {
    if (prop.kind === 'hedgehog' || prop.kind === 'seawall' || prop.kind === 'ramp' || prop.kind === 'lowWall')
      continue;
    const w = PROP_SIZE[prop.kind].w * prop.scale * SCALE;
    const d = PROP_SIZE[prop.kind].d * prop.scale * SCALE;
    if (prop.kind === 'crater') {
      ctx.fillStyle = 'rgba(120, 100, 70, 0.55)';
      ctx.beginPath();
      ctx.arc(px(prop.x), py(prop.z), w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (prop.kind === 'block') {
      ctx.fillStyle = '#8a7c62';
      ctx.fillRect(px(prop.x) - w / 2, py(prop.z) - d / 2, w, d);
    } else if (prop.kind === 'wreck') {
      ctx.fillStyle = '#4d4a44';
      ctx.fillRect(px(prop.x) - w / 2, py(prop.z) - d / 2, w, d);
    } else if (prop.kind === 'cliff') {
      ctx.fillStyle = 'rgba(80, 70, 58, 0.35)';
      ctx.fillRect(px(prop.x) - w / 2, py(prop.z) - d / 2, w, d);
    }
  }
  for (const prop of M1B_HAND.props) {
    if (prop.kind === 'hedgehog') {
      ctx.fillStyle = 'rgba(60, 56, 48, 0.8)';
      ctx.fillRect(px(prop.x) - 1.2, py(prop.z) - 1.2, 2.4, 2.4);
    } else if (prop.kind === 'seawall') {
      ctx.fillStyle = '#6f6a5e';
      ctx.fillRect(px(prop.x) - PROP_SIZE.seawall.w * SCALE * 0.5, py(prop.z) - 3, PROP_SIZE.seawall.w * SCALE, 6);
    } else if (prop.kind === 'ramp') {
      ctx.fillStyle = 'rgba(120, 110, 90, 0.7)';
      ctx.fillRect(px(prop.x) - PROP_SIZE.ramp.w * SCALE * 0.5, py(prop.z) - 2, PROP_SIZE.ramp.w * SCALE, 4);
    } else if (prop.kind === 'lowWall') {
      ctx.fillStyle = '#7b7363';
      ctx.fillRect(px(prop.x) - PROP_SIZE.lowWall.w * SCALE * 0.5, py(prop.z) - 1, PROP_SIZE.lowWall.w * SCALE, 2);
    }
  }

  // The nests and the line blast points their fire reaches: a red line stands for a clear shot, and a point the cover
  // hides gets none. A blast point under fire is ringed in red.
  const hides = (a: { x: number; z: number }, b: { x: number; z: number }): boolean => {
    for (const prop of M1B_HAND.props) {
      const size = PROP_SIZE[prop.kind];
      if (!size.blocks || prop.kind === 'seawall' || prop.kind === 'ramp' || prop.kind === 'stairs') continue;
      const halfW = (size.w * prop.scale) / 2 + 0.5;
      const halfD = (size.d * prop.scale) / 2 + 0.5;
      for (let t = 0.05; t < 0.95; t += 0.05) {
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        if (Math.abs(x - prop.x) <= halfW && Math.abs(z - prop.z) <= halfD) return true;
      }
    }
    return false;
  };
  for (const nest of M1B_HAND.spawns['b-emplacements'] ?? []) {
    for (const place of M1B_HAND.blasts ?? []) {
      if (place.line === null || place.z >= nest.z) continue;
      if (hides(nest, place)) continue;
      ctx.strokeStyle = 'rgba(190, 40, 30, 0.6)';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px(nest.x), py(nest.z));
      ctx.lineTo(px(place.x), py(place.z));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#c22';
      ctx.beginPath();
      ctx.arc(px(place.x), py(place.z), 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#a52a1e';
    ctx.beginPath();
    ctx.moveTo(px(nest.x), py(nest.z) - 7);
    ctx.lineTo(px(nest.x) + 7, py(nest.z) + 6);
    ctx.lineTo(px(nest.x) - 7, py(nest.z) + 6);
    ctx.closePath();
    ctx.fill();
  }

  // the targets
  for (const target of M1B_HAND.targets) {
    if (target.kind === 'gun' || target.kind === 'magazine') continue;
    const size = target.kind === 'pillbox' ? { w: 12, d: 8 } : { w: 10, d: 10 };
    ctx.fillStyle = '#3f3a32';
    ctx.fillRect(
      px(target.x) - (size.w * SCALE) / 2,
      py(target.z) - (size.d * SCALE) / 2,
      size.w * SCALE,
      size.d * SCALE,
    );
    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(target.id, px(target.x), py(target.z) + 4);
  }

  // the lines drawn from the map's own line numbers, and their blast points
  const lines = [...new Set((M1B_HAND.blasts ?? []).flatMap(place => (place.line === null ? [] : [place.line])))].sort(
    (a, b) => b - a,
  );
  for (const line of lines) {
    ctx.strokeStyle = 'rgba(40, 40, 40, 0.55)';
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, py(line));
    ctx.lineTo(WIDTH, py(line));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#222';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`line z ${line}`, 10, py(line) - 5);
  }
  for (const place of M1B_HAND.blasts ?? []) {
    const line = place.line !== null;
    ctx.strokeStyle = line ? '#1f5fa8' : '#8a5a12';
    ctx.fillStyle = line ? 'rgba(31, 95, 168, 0.35)' : 'rgba(138, 90, 18, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px(place.x), py(place.z), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#14324f';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(place.id, px(place.x), py(place.z) - 9);
  }

  // the lines' spacing, as the distances between the blast points' rows
  ctx.fillStyle = '#222';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('M1 B section from the top: lines, blast points, nest fire, cover', WIDTH / 2, 20);
  // the intervals, measured from one milestone's blast points to the next: line 1's points to line 2's, line 2's to
  // the pillbox line
  const seawardPointZ = (line: number): number =>
    Math.max(...(M1B_HAND.blasts ?? []).filter(place => place.line === line).map(place => place.z));
  const rows = [...lines.map(seawardPointZ), -15];
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i - 1] - rows[i];
    const midZ = (rows[i - 1] + rows[i]) / 2;
    ctx.strokeStyle = '#222';
    ctx.beginPath();
    ctx.moveTo(WIDTH - 130, py(rows[i - 1]));
    ctx.lineTo(WIDTH - 130, py(rows[i]));
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.textAlign = 'left';
    ctx.fillText(`${gap} m`, WIDTH - 122, py(midZ));
  }
  // what the two points cost
  ctx.fillStyle = '#14324f';
  ctx.textAlign = 'center';
  ctx.fillText('near: crossfire', px(-10), py(75.5) + 38);
  ctx.fillText('far: wreck screen', px(50), py(75.5) + 38);
  ctx.textAlign = 'left';
  ctx.font = '12px monospace';
  ctx.fillText('blue ring: line blast point', 10, HEIGHT - 28);
  ctx.fillText('amber ring: pillbox blast point', 10, HEIGHT - 12);
  ctx.fillText('red line: a nest has a clear shot at the point', 330, HEIGHT - 12);
  return canvas;
}

beforeAll(async () => {
  await page.viewport(WIDTH, HEIGHT);
  boot();
});

test('rhythm', async () => {
  if (wanted('rhythm-map')) {
    const canvas = drawSection();
    await picture('rhythm-map');
    canvas.remove();
  }

  if (wanted('rhythm-line2-near')) {
    startSortie();
    await until(() => game().script.cutscene !== null);
    sendToScript(game(), { kind: 'skip' });
    await until(() => game().script.cutscene === null);
    LOOP.maxDt = 0;
    try {
      // the line 2 nests are awake; the mech stands at the near point facing the sea, in their fire. The picture is
      // taken on the frame a burst is in the air, so the shot's line shows.
      sendToScript(game(), { kind: 'enter', area: 'b-line' });
      standAt(-10, 76, Math.PI);
      for (let i = 0; i < 600; i++) {
        quiet();
        runSystems(1 / 60);
        if (game().bullets.some(bullet => 'enemy' in bullet)) break;
      }
      await page.screenshot({ path: `${__SHOTS_OUT__}/rhythm-line2-near.png` });
    } finally {
      LOOP.maxDt = 0.05;
    }
  }

  if (wanted('rhythm-interval')) {
    startSortie();
    await until(() => game().script.cutscene !== null);
    sendToScript(game(), { kind: 'skip' });
    await until(() => game().script.cutscene === null);
    LOOP.maxDt = 0;
    try {
      // line 1 has opened: the cover mechs run through the hole, and the infantry pushes up the first stretch
      sendToScript(game(), { kind: 'blast', id: 'l1-b' });
      standAt(20, 102, 0);
      for (let i = 0; i < 90; i++) {
        game().barrages = [];
        game().shells = [];
        runSystems(1 / 60);
      }
      await picture('rhythm-interval');
    } finally {
      LOOP.maxDt = 0.05;
    }
  }
});
