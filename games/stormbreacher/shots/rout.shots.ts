// The defenders' rout (SB-2015): the posts behind line 1 while it holds, the first line running two seconds after the
// breach, a suppressed pillbox muzzle, and the second line running two seconds after the last pillbox falls.
// npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ between machines).
// SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the ones whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { sendToScript } from '../src/logic/game.ts';
import { WEAPONS } from '../src/data/weapons.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';
import { CHARGE_TUNE } from '../src/data/charge.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const CAMERA_FRAMES = 40; // frames the camera takes to come round behind the mech
const HIDDEN_3D = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
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

async function picture(name: string): Promise<void> {
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

// No mortar shells while the camera settles, and no armour lost to the defenders: the picture is about where they stand.
function quiet(): void {
  const current = game();
  current.barrages = [];
  current.shells = [];
  current.armor = 1e9;
}

// Puts the mech at (x, z) facing `yaw` (0 is the land) and lets the camera come round behind it. The frames are run by
// hand, so the camera follows even while LOOP.maxDt holds the page's own loop at 0.
function standAt(x: number, z: number, yaw = 0): void {
  const current = game();
  current.mech.x = x;
  current.mech.z = z;
  current.mech.y = 0;
  current.mech.grounded = true;
  current.mech.yaw = yaw;
  for (let i = 0; i < CAMERA_FRAMES; i++) {
    quiet();
    runSystems(1 / 60);
  }
}

// The game's own seconds by hand, with the page still drawing each frame; a milestone's slow is part of them.
function advance(seconds: number): void {
  const steps = Math.max(1, Math.round(seconds * 60));
  for (let i = 0; i < steps; i++) runSystems(1 / 60);
}

// Cuts a line open as the player's charge would.
function blow(id: string): void {
  game().charges.push({ blast: id, left: 0, total: CHARGE_TUNE.fuse });
}

// Breaks both pillboxes with a charge on each side point (SB-2015: shots only suppress), so cp1 fires.
function breakBoth(): void {
  for (const id of ['blast-pillbox-1-side', 'blast-pillbox-2-side'])
    game().charges.push({ blast: id, left: 0, total: CHARGE_TUNE.fuse });
}

// A mech shot buried in a pillbox's side, as a player's hit would be: it suppresses and does no damage.
function suppressPillbox(): void {
  const current = game();
  const target = current.targets.find(entry => entry.id === 'pillbox-1');
  if (!target) throw new Error('the map has no pillbox-1');
  current.bullets.push({
    weapon: 'autocannon',
    x: target.box.minX - 1,
    y: (target.box.minY + target.box.maxY) / 2,
    z: (target.box.minZ + target.box.maxZ) / 2,
    dx: 1,
    dy: 0,
    dz: 0,
    left: WEAPONS.autocannon.range,
  });
}

async function opening(): Promise<void> {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

test('rout', async () => {
  const hide = document.createElement('style');
  hide.textContent = HIDDEN_3D;
  document.head.appendChild(hide);
  LOOP.maxDt = 0;
  try {
    if (wanted('rout-line1-hold')) {
      await opening();
      // beside the first post, looking along its cover: the defender stands in the open beside its block, and the
      // block behind it is the cover it ducks to
      standAt(-15, 118, 0);
      const defender = game().enemies.filter(enemy => enemy.wave === 'line1-hold')[0];
      // wait for its next step out, and for it to have walked to the step out point
      for (let i = 0; i < 600 && !defender.holdOut; i++) runSystems(1 / 60);
      advance(1.5);
      await picture('rout-line1-hold');
    }
    if (wanted('rout-line1-run')) {
      await opening();
      // along the way the first line runs, looking across the posts so a few of the runners stand in one frame
      standAt(60, 100, Math.PI);
      blow('l1-b');
      runSystems(1 / 60);
      advance(2.2); // two seconds after the hole opens: the first line is on its way to the next cover
      await picture('rout-line1-run');
    }
    if (wanted('rout-suppress')) {
      await opening();
      // straight in front of pillbox-1, so its muzzle is the subject
      standAt(-33, 3);
      suppressPillbox();
      runSystems(1 / 60);
      advance(0.4); // the smoke stands over the quiet muzzle
      await picture('rout-suppress');
    }
    if (wanted('rout-bunker-run')) {
      await opening();
      // along the second line's run, looking across it: line 3 stands behind the camera, and the runners go across the
      // picture after both pillboxes fall
      standAt(0, 45, Math.PI);
      breakBoth();
      runSystems(1 / 60);
      advance(2.2); // two seconds after cp1: the second line has left its posts
      await picture('rout-bunker-run');
    }
  } finally {
    LOOP.maxDt = 0.05;
    hide.remove();
  }
});
