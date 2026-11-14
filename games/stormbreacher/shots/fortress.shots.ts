// Screenshots of the fortress (SB-1800): the sea gate from outside, the yard, the land gate from outside, and the field
// before the battery. npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ between
// machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { camera, scene } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { lookOf } from '../src/data/looks.ts';
import { M1B_HAND } from '../src/data/maps/m1b-hand.ts';
import { M1 } from '../src/data/missions/m1.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../src/view/field.ts';
import { applyLookTo } from '../src/view/look.ts';
import { buildWorld } from '../src/view/world.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN = 'body > *:not(#gl) { visibility: hidden !important; }'; // the 3D view only

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

async function picture(name: string): Promise<void> {
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

function look(pos: readonly [number, number, number], at: readonly [number, number, number]): void {
  camera.position.set(...pos);
  camera.lookAt(...at);
  camera.updateProjectionMatrix();
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('fortress', async () => {
  for (const name of [GROUND_NAME, SIZE_BOX_NAME]) {
    const node = scene.getObjectByName(name);
    if (node) node.visible = false;
  }
  const world = buildWorld(M1B_HAND);
  applyLookTo(lookOf(M1.id), world.built.group);

  if (wanted('fortress-gate-outside')) {
    // on the approach, the sea gate and the wall either side of it ahead
    look([0, 6, -44], [0, 4, -72]);
    await picture('fortress-gate-outside');
  }
  if (wanted('fortress-yard')) {
    // over the yard, the two walls and the cover between the gates
    look([0, 24, -78], [0, 1, -108]);
    await picture('fortress-yard');
  }
  if (wanted('fortress-land-gate')) {
    // in the field past the land gate, looking back at the gate and the battery's wall
    look([0, 6, -146], [0, 4, -124]);
    await picture('fortress-land-gate');
  }
  if (wanted('fortress-field')) {
    // the field before the battery: the cover pieces and the three parts at the back
    look([0, 10, -158], [0, 4, -240]);
    await picture('fortress-field');
  }
});
