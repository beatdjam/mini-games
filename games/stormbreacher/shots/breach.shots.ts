// Screenshots of a closed defence line and the hole a blast opens (SB-1510): the line as it stands, the ring of a blast
// point, the line opened by l1-b's blast, and the place the buddy falls beside it. npm run shots. Not a test: it is not
// part of npm test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go;
// SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { camera } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { showBreach } from '../src/dev/views/breach.ts';
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

// The camera is fixed by showBreach and nothing moves it after that, so a shot can set its own view.
function look(pos: readonly [number, number, number], at: readonly [number, number, number]): void {
  camera.position.set(...pos);
  camera.lookAt(...at);
  camera.updateProjectionMatrix();
}

// The view's own "open this line with a blast" button, by the marker it carries.
function openLine(): void {
  const node = document.querySelector<HTMLButtonElement>('button[data-sb-breach="open"]');
  if (!node) throw new Error('no button to open the line');
  node.click();
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('breach', async () => {
  showBreach('#view-breach');
  await frame();

  if (wanted('breach-closed')) {
    look([40, 9, 161], [40, 1.2, 146]);
    await picture('breach-closed');
  }

  if (wanted('breach-point')) {
    look([40, 4, 153], [40, 0.6, 146.5]);
    await picture('breach-point');
  }

  if (wanted('breach-open')) {
    openLine();
    look([40, 7, 158], [40, 0.8, 144]);
    await picture('breach-open');
  }

  if (wanted('breach-buddy')) {
    // the buddy falls beside line 1's blast point, at (44, 151)
    look([56, 5, 160], [44, 0.6, 151]);
    await picture('breach-buddy');
  }
});
