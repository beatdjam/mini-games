// Screenshots of the beach's surfaces (SB-1360): the start of the beach, the defence line and the seawall, seen from
// fixed places on M1's hand map, so a change to the ground, the props, the sea or the sky can be compared before and
// after. npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ between machines).
// SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { camera, cullChunks } from '@engine/render/index.ts';
import { M1B_HAND } from '../src/data/maps/m1b-hand.ts';
import { buildMapScene, MAP_FOG, type MapScene } from '../src/dev/views/mapView.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

// The three places: from the sea over the wet sand, behind the first hedgehog line, and below the seawall. The places
// are provisional; they are chosen to show the same surfaces before and after the change.
const PLACES: readonly { name: string; pos: [number, number, number]; look: [number, number, number] }[] = [
  { name: 'surfaces-beach', pos: [30, 7, 196], look: [0, 1, 165] },
  { name: 'surfaces-defense-line', pos: [0, 6.5, 155], look: [0, 1.5, 128] },
  { name: 'surfaces-breakwater', pos: [24, 10, -30], look: [0, 3, -72] },
];
const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the camera moved
const SHOT_CLOCK = 1000; // what performance.now() says while a shot is taken (ms), so the sea's crests stand still

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));
let built: MapScene['built'] | null = null;

beforeAll(async () => {
  await page.viewport(1280, 720);
  built = buildMapScene(M1B_HAND).built;
  const hide = document.createElement('style');
  hide.textContent = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
  document.head.appendChild(hide);
});

test('surfaces', async () => {
  for (const place of PLACES) {
    if (!wanted(place.name)) continue;
    camera.position.set(...place.pos);
    camera.lookAt(...place.look);
    camera.updateMatrixWorld();
    const now = performance.now;
    performance.now = () => SHOT_CLOCK;
    try {
      for (let n = 0; n < DRAWN_FRAMES; n++) {
        if (built) cullChunks(built.chunks, built.group, camera, MAP_FOG.far);
        await frame();
      }
      await page.screenshot({ path: `${__SHOTS_OUT__}/${place.name}.png` });
    } finally {
      performance.now = now;
    }
  }
});
