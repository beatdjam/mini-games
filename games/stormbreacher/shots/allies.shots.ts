// Screenshots of the allied mech's own look (#view-ally, SB-1730, SB-2082): the sniper and the scout from 10 m (the
// shoulder band and number), from 60 m (whether it still reads as an ally) and wrecked. Not the five allies taking their posts
// (#view-allies, shots/ally-mechs.shots.ts): this one is a single mech up close. npm run shots. Not a test: it is not
// part of npm test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go;
// SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { type AllyKit } from '../src/data/allies.ts';
import { showAllyDetail, showAllyDetailKit, showAllyDetailShot, type AllyShot } from '../src/dev/views/allyDetail.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

beforeAll(async () => {
  await page.viewport(1280, 720);
  showAllyDetail('#view-ally');
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('allies', async () => {
  const shots: [string, AllyShot, AllyKit][] = [
    ['ally-near', 'near', 'sniper'],
    ['ally-band', 'band', 'sniper'],
    ['ally-far', 'far', 'sniper'],
    ['ally-wreck', 'wreck', 'sniper'],
    ['ally-scout-near', 'near', 'scout'],
    ['ally-scout-band', 'band', 'scout'],
    ['ally-scout-far', 'far', 'scout'],
  ];
  for (const [name, shot, kit] of shots) {
    if (!wanted(name)) continue;
    showAllyDetailKit(kit);
    showAllyDetailShot(shot);
    for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
    await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
  }
});
