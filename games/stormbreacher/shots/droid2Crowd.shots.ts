// One wide picture of the 300-droid crowd (#view-fx stage 2, SB-1747), so the second pass of the model can be judged at
// the weight the view can show. It is its own file because #view-fx builds its own map and camera and the page starts
// fresh for each shots file. npm run shots. Not a test: the drawn pixels differ between machines.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems, systems } from '@engine/core/index.ts';
import { camera } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { showFx } from '../src/dev/views/fx.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string;
declare const __SHOTS_ONLY__: string;

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }';
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

beforeAll(async () => {
  // the dev views load by a dynamic import in main.ts: wait for it, or a late #view-… run takes the camera back
  await import('../src/dev/dev.ts');
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('droid2-crowd', async () => {
  history.replaceState(null, '', '#view-fx?fx=2&seed=1');
  showFx('#view-fx?fx=2&seed=1');
  for (let i = 0; i < 40; i++) runSystems(1 / 60);
  // stop the page's camera so the picture keeps the place this file puts it
  for (const system of systems) system.enabled = false;
  camera.position.set(0, 22, 220);
  camera.lookAt(0, 0, 160);
  camera.updateMatrixWorld();
  LOOP.render?.();
  await frame();
  if (!__SHOTS_ONLY__ || 'droid2-crowd'.includes(__SHOTS_ONLY__)) {
    await page.screenshot({ path: `${__SHOTS_OUT__}/droid2-crowd.png` });
  }
});
