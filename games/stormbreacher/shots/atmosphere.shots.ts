// Screenshots of the beach's air (SB-1440): the smoke columns, the low haze and the burning wrecks from the landing, from
// in front of the first defence line and from before the pillboxes, all under the sortie's own look. npm run shots. Not
// a test: it is not part of npm test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks
// where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { camera, cullChunks } from '@engine/render/index.ts';
import { lookOf } from '../src/data/looks.ts';
import { M1B_HAND } from '../src/data/maps/m1b-hand.ts';
import { M1 } from '../src/data/missions/m1.ts';
import { buildMapScene, MAP_FOG, type MapScene } from '../src/dev/views/mapView.ts';
import { applyLookTo } from '../src/view/look.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

// The three places the ticket asks for: just after the landing looking landward, in front of the first hedgehog line,
// and before the pillboxes. The places are provisional; they are chosen to show the same air before and after a change.
const PLACES: readonly { name: string; pos: [number, number, number]; look: [number, number, number] }[] = [
  { name: 'atmosphere-beach', pos: [0, 4.2, 168], look: [0, 2, 120] },
  { name: 'atmosphere-defence-line', pos: [8, 5.5, 150], look: [-4, 2, 112] },
  { name: 'atmosphere-pillboxes', pos: [0, 5, 14], look: [0, 2.5, -28] },
];
const DRAWN_FRAMES = 6; // frames drawn first, so the smoke and the haze have moved off their first frame
const SHOT_CLOCK = 1000; // what performance.now() says while a shot is taken (ms)

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));
let built: MapScene['built'] | null = null;

beforeAll(async () => {
  await page.viewport(1280, 720);
  const scene = buildMapScene(M1B_HAND);
  built = scene.built;
  applyLookTo({ ...lookOf(M1.id), pixel: 1 }, built.group);
  const hide = document.createElement('style');
  hide.textContent = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
  document.head.appendChild(hide);
});

test('atmosphere', async () => {
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
