// Screenshots of the low props that fade (SB-2048): in the fortress's yard, a block and a wreck between the camera and the
// mech. Each picture also gets a .txt of the draws and triangles of the frame. npm run shots. Not a test: it is not part of
// npm test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go.
import { beforeAll, test } from 'vitest';
import { commands, page } from 'vitest/browser';
import { LOOP, runSystems } from '@engine/core/index.ts';
import { renderer } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { sendToScript } from '../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
const SETTLE = 4; // s; the camera comes to its place and the props finish fading

// The mech's place in the yard (m, facing -z) and the prop between it and the camera behind it (+z).
const SCENES = [
  { name: 'block', x: -20, z: -92, note: 'the block at (-20, -84), between the mech and the camera' },
  { name: 'wreck', x: 14, z: -108, note: 'the wreck at (14, -98), with the camera inside it' },
] as const;

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

// Steps the game by hand, with the mech kept alive and the yard's enemies out of the picture.
function advance(seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    game().armor = MECH_TUNE.armor;
    game().enemies = [];
    runSystems(1 / 60);
  }
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('camera-fade', async () => {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);
  LOOP.maxDt = 0;
  for (const scene of SCENES) {
    const name = `camera-fade-after-${scene.name}`;
    game().mech.x = scene.x;
    game().mech.y = 0;
    game().mech.z = scene.z;
    game().mech.yaw = 0;
    advance(SETTLE);
    await frame();
    if (__SHOTS_ONLY__ && !name.includes(__SHOTS_ONLY__)) continue;
    await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
    const info = renderer.info.render;
    await commands.writeFile(
      `${__SHOTS_OUT__}/${name}.txt`,
      `${name} (${scene.note}): calls=${info.calls} triangles=${info.triangles}\n`,
    );
  }
});
