// Screenshots of an explosion at the water's edge (#view-boom, SB-1340): the flash, the smoke column, the debris and the
// sand or water, at fixed seconds. npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels
// differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose
// names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP } from '@engine/core/index.ts';
import { clearBooms, drawBooms, spawnBoom } from '../src/view/boom.ts';
import { showBoom } from '../src/dev/views/boom.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const SHOT_CLOCK = 1000; // what performance.now() says while a shot is taken (ms)
const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
const LAND = { x: 0, y: 0.4, z: 158 } as const; // the beach, in #view-boom's camera
const SEA = { x: 0, y: 0.4, z: 181 } as const; // the water, past the map's front edge (maxZ 170)

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

beforeAll(async () => {
  await page.viewport(1280, 720);
  showBoom('#view-boom');
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

// Holds the loop still: the view's own system still draws, but draws the booms with no time, so the blast stays where the
// shot puts it.
function hold(): () => void {
  const maxDt = LOOP.maxDt;
  const now = performance.now;
  LOOP.maxDt = 0;
  performance.now = () => SHOT_CLOCK;
  return () => {
    LOOP.maxDt = maxDt;
    performance.now = now;
  };
}

// Puts one blast at `at` and lets it run `seconds` before the picture.
async function shot(
  name: string,
  kind: 'small' | 'large' | 'water' | 'craft',
  at: { x: number; y: number; z: number },
  seconds: number,
) {
  clearBooms();
  spawnBoom(kind, at.x, at.y, at.z);
  drawBooms(seconds);
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

test('boom', async () => {
  const release = hold();
  try {
    // one blast of each kind while its flash is at its full size and before it fades: the four kinds can be compared
    const fullFlash: [string, 'small' | 'large' | 'water' | 'craft', { x: number; y: number; z: number }, number][] = [
      ['boom-small-0.2', 'small', LAND, 0.2],
      ['boom-large-0.2', 'large', LAND, 0.2],
      ['boom-craft-0.3', 'craft', LAND, 0.3],
      ['boom-water-0.2', 'water', SEA, 0.2],
    ];
    for (const [name, kind, at, seconds] of fullFlash) {
      if (wanted(name)) await shot(name, kind, at, seconds);
    }
    for (const at of [0.1, 0.4, 1, 3, 8]) {
      const name = `boom-large-${at}`;
      if (wanted(name)) await shot(name, 'large', LAND, at);
    }
    for (const at of [0.3, 1]) {
      const name = `boom-water-${at}`;
      if (wanted(name)) await shot(name, 'water', SEA, at);
    }
    for (const at of [0.5, 2]) {
      const name = `boom-craft-${at}`;
      if (wanted(name)) await shot(name, 'craft', LAND, at);
    }
  } finally {
    release();
  }
});
