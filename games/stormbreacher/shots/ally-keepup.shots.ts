// Screenshots of the allies keeping up with the mech (SB-2044): the moments just after the mech has gone through a line,
// seen from the game's own camera behind it. After line 2's charge, at C's front once the pillboxes are down, and just out
// of the broken land gate. The cover mechs should be in the frame, beside or just behind the mech. npm run shots. Not a
// test: it is not part of npm test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where
// the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems, systems } from '@engine/core/index.ts';
import { camera } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { sendToScript } from '../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
const PILLBOXES = ['pillbox-1', 'pillbox-2'] as const;
const WALK = 14; // how fast the mech is moved along the route by hand (m/s)

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

// Nothing shoots back while the allies walk: the picture is of their posts, not of a fight.
function quiet(): void {
  const current = game();
  current.enemies = [];
  current.barrages = [];
  current.shells = [];
  current.aimed = null;
  current.armor = MECH_TUNE.armor;
  current.battery.on = false;
}

// Walks the mech along the points at WALK m/s, facing the way it goes, one game step at a time (the drawn frames add no
// time: LOOP.maxDt = 0), then stands it still for `after` seconds.
function walk(points: readonly (readonly [number, number])[], after: number): void {
  const mech = game().mech;
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    const dist = Math.hypot(x - mech.x, z - mech.z);
    if (dist > 0.01) mech.yaw = Math.atan2(-(x - mech.x), -(z - mech.z));
    const steps = Math.max(1, Math.round((dist / WALK) * 60));
    const from = { x: mech.x, z: mech.z };
    for (let n = 1; n <= steps; n++) {
      mech.x = from.x + ((x - from.x) * n) / steps;
      mech.z = from.z + ((z - from.z) * n) / steps;
      quiet();
      runSystems(1 / 60);
    }
  }
  for (let n = 0; n < Math.round(after * 60); n++) {
    quiet();
    runSystems(1 / 60);
  }
}

// Two pictures: the game's own camera behind the mech, and one from above and behind it that takes in the 60 m round the
// mech, so the cover mechs that stand behind it are in the frame too (the game's camera looks forward).
async function picture(name: string): Promise<void> {
  LOOP.maxDt = 0;
  for (let n = 0; n < 3; n++) await frame();
  if (wanted(name)) await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
  const mech = game().mech;
  const play = systems.find(system => system.name === 'sb-play');
  if (play) play.enabled = false;
  camera.position.set(mech.x + 30, 38, mech.z + 62);
  camera.lookAt(mech.x, 0, mech.z - 8);
  await frame();
  if (wanted(name)) await page.screenshot({ path: `${__SHOTS_OUT__}/${name}-above.png` });
  if (play) play.enabled = true;
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('ally-keepup', async () => {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);
  LOOP.maxDt = 0;
  sendToScript(game(), { kind: 'ashore' });

  // line 1 blown, the three cover mechs and the gunner run through; the mech goes after them to line 2's near point
  sendToScript(game(), { kind: 'blast', id: 'l1-b' });
  walk(
    [
      [40, 150],
      [40, 122],
      [5, 110],
      [-10, 100],
      [-10, 80],
    ],
    8,
  );

  // line 2's charge blows and the mech goes through its hole; the three cover mechs follow it at once
  sendToScript(game(), { kind: 'blast', id: 'l2-a' });
  walk(
    [
      [-10, 58],
      [0, 44],
    ],
    3,
  );
  await picture('keepup-1-line2-hole');

  // the pillboxes fall: the mech goes on through C's x 35 breakthrough, and the three have C's front posts ahead of it
  walk(
    [
      [0, 20],
      [-20, -27],
    ],
    1,
  );
  for (const id of PILLBOXES) {
    const target = game().targets.find(entry => entry.id === id);
    if (target) target.hp = 0;
    sendToScript(game(), { kind: 'destroyed', target: id });
  }
  sendToScript(game(), { kind: 'skip' });
  walk(
    [
      [0, -30],
      [35, -30],
      [35, -46],
      [35, -58],
    ],
    1,
  );
  await picture('keepup-2-c-front');

  // the fortress falls and the mech goes out through its land gate; the three follow it into the field
  sendToScript(game(), { kind: 'enter', area: 'fortress-gate' });
  walk(
    [
      [0, -62],
      [0, -95],
    ],
    1,
  );
  sendToScript(game(), { kind: 'enter', area: 'fortress-yard' });
  walk([[0, -108]], 6);
  sendToScript(game(), { kind: 'cleared', wave: 'yard-1' });
  sendToScript(game(), { kind: 'fortressDown' });
  sendToScript(game(), { kind: 'skip' });
  walk(
    [
      [0, -121],
      [0, -140],
    ],
    5,
  );
  await picture('keepup-3-field');
});
