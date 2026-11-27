// Screenshots of the sortie through the game's own overview camera (tickets 2100-2130): the boat's deck just after the
// landing is skipped, the beach, the same beach with the HUD left on, line 1's front, the pillbox line, the seawall from
// below and from its top, and the fortress yard. The camera is not placed here: the mech is put where the picture
// needs it and the game's camera follows it for over a second first. npm run shots. Not a test: it is not part of npm test
// or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text>
// takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { sendToScript } from '../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
const SETTLE_SEC = 1.5; // s; well over QUARTER_TUNE.lag (0.23 s), so the camera has caught up with the mech
const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

let hide: HTMLStyleElement; // the style that leaves only the 3D view showing

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

// Keeps the mech whole and the sky clear while the camera settles: the pictures are of the look, not of a shelling, so
// the warnings and the shells that have fallen are taken away each step as the gunfight shots do.
function repair(): void {
  const current = game();
  current.armor = MECH_TUNE.armor;
  current.barrages = [];
  current.shells = [];
  current.aimed = null;
}

// Steps the game by hand, so its own camera follows the mech and the lag dies away. The drawn frames add no time
// (LOOP.maxDt = 0), so the camera stays where this leaves it while the picture is taken.
function settle(seconds = SETTLE_SEC): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    repair();
    runSystems(1 / 60);
  }
}

// Puts the mech on the ground at (x, z), facing inland (-z, yaw 0).
function place(x: number, z: number, y = 0): void {
  const mech = game().mech;
  mech.x = x;
  mech.y = y;
  mech.z = z;
  mech.yaw = 0;
  mech.grounded = true;
  mech.vy = 0;
}

// Draws the game's camera as it stands and takes the picture. The step may have turned the mech toward the cursor while
// the camera settled, so the inland facing is put back with no time left to turn it again. `hud` keeps the page's HUD.
async function picture(name: string, hud = false): Promise<void> {
  if (!wanted(name)) return;
  game().mech.yaw = 0;
  hide.disabled = hud;
  for (let i = 0; i < DRAWN_FRAMES; i++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
  hide.disabled = false;
}

// Starts the sortie and passes over the landing, so the mech is on the deck with the player's controls.
async function deck(): Promise<void> {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  // the held frames add no time; the shots' seconds are the ones settle() steps by hand
  LOOP.maxDt = 0;
  hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('quarter', async () => {
  await deck();
  // the deck, right after the landing's cutscene is skipped
  settle();
  await picture('quarter-boat');

  // the middle of the beach (the ticket's z 150), first without the HUD and then with it (the aim dot, its arc and the
  // radar); the HUD picture comes here so the radio line is the beach's, not one from a place visited later
  place(0, 150);
  settle();
  await picture('quarter-beach');
  await picture('quarter-hud', true);

  // line 1's seaward front, with blast point l1-a and the hedgehogs ahead
  place(-55, 152);
  settle();
  await picture('quarter-line1');

  // the pillbox line, with both pillboxes in the frame: beside pillbox 2, so the 45 degree camera takes pillbox 2 on
  // the right and pillbox 1, across the 55 m the pair spans, on the left
  place(14.5, -17.5);
  settle();
  await picture('quarter-pillbox');

  // below the seawall, on the open ground before its seaward face (the map has no ramp there now)
  place(50, -58);
  settle();
  await picture('quarter-seawall-below');

  // on top of the seawall
  place(50, -70, 6);
  settle();
  await picture('quarter-seawall-top');

  // inside the fortress yard
  place(0, -108);
  settle();
  await picture('quarter-yard');
});
