// Screenshots of the aimed mortar (SB-1530): the mech standing in one place, the warning ring on that place, the landing
// and the armour it costs. npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ
// between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names
// contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { camera } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { AIMED_MORTAR } from '../src/data/hazards.ts';
import { showBreach } from '../src/dev/views/breach.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN =
  'body > *:not(#gl):not(#sbBreachHud) { visibility: hidden !important; } ' +
  '#sbBreachHud, #sbBreachHud * { visibility: visible !important; }'; // the 3D view and the view's HUD
// The game's stay and warning are 5 s and 2.5 s; the windows here are wide, so a slow frame cannot miss the landing.
const STILL_SEC = 8;
const WARN_SEC = 2;

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

interface BreachReport {
  aimed: { still: number; warns: number } | null;
}

function report(): BreachReport {
  if (!window.sbBreachReport) throw new Error('the breach view has no report');
  return JSON.parse(window.sbBreachReport()) as BreachReport;
}

async function until(done: () => boolean, tries = 600): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    await frame();
  }
  if (!done()) throw new Error(`the view did not reach the state in ${tries} frames`);
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('aimed-mortar', async () => {
  showBreach('#view-breach');
  AIMED_MORTAR.stillSec = STILL_SEC;
  AIMED_MORTAR.warn = WARN_SEC;
  const start = document.querySelector<HTMLButtonElement>('button[data-sb-breach="aimed"]');
  if (!start) throw new Error('no button to start the aimed mortar');
  start.click();

  if (wanted('aimed-mortar-standing')) {
    // early in the stay: the mech stands at (40, 150) and no ring has come yet
    look([40, 9, 161], [40, 1.2, 146]);
    await until(() => {
      const aimed = report().aimed;
      return aimed !== null && aimed.warns === 0 && aimed.still > STILL_SEC * 0.4;
    });
    await picture('aimed-mortar-standing');
  }

  if (wanted('aimed-mortar-warn')) {
    // the ring of the warned shell on the place the mech stands
    look([24, 16, 168], [40, 0.8, 147]);
    await until(() => (report().aimed?.warns ?? 0) > 0);
    await picture('aimed-mortar-warn');
  }

  if (wanted('aimed-mortar-land')) {
    // a warned shell, then the ring gone: it has landed on the mech
    await until(() => (report().aimed?.warns ?? 0) > 0);
    await until(() => report().aimed?.warns === 0);
    await picture('aimed-mortar-land');
  }

  if (wanted('aimed-mortar-armor')) {
    // the fire of the landing, and the armour the shell took (the view shows it in its HUD)
    for (let i = 0; i < 10; i++) await frame();
    await picture('aimed-mortar-armor');
  }
});
