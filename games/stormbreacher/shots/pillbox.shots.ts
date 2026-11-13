// Screenshots of the pillboxes' blast points (SB-1540): the ring beside pillbox-1 and the ring behind it, each with the
// mech standing 4 m off facing the point, so the ring is the picture's subject. npm run shots. Not a test: it is not part
// of npm test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go;
// SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { WEAPONS } from '../src/data/weapons.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { sendToScript } from '../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const CAMERA_FRAMES = 40; // frames the camera takes to come round behind the mech
const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view

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

// No mortar shells while the camera settles: the beach cue starts the barrage, and a landing would cover the ring.
function quiet(): void {
  const current = game();
  current.barrages = [];
  current.shells = [];
}

// Stands the mech `dz` metres from the point, facing `yaw` (0 is the land), and lets the camera come round behind it.
async function standAt(pointId: string, dz: number, yaw: number): Promise<void> {
  const current = game();
  const point = current.blasts.find(place => place.id === pointId);
  if (!point) throw new Error(`the map has no ${pointId}`);
  current.mech.x = point.x;
  current.mech.z = point.z + dz;
  current.mech.y = 0;
  current.mech.grounded = true;
  current.mech.yaw = yaw;
  for (let i = 0; i < CAMERA_FRAMES; i++) {
    quiet();
    await frame();
  }
}

// Puts the mech at (x, z) facing the land (yaw 0), so both pillboxes are ahead, and lets the camera come round.
async function standAtPlace(x: number, z: number): Promise<void> {
  const current = game();
  current.mech.x = x;
  current.mech.z = z;
  current.mech.y = 0;
  current.mech.grounded = true;
  current.mech.yaw = 0;
  for (let i = 0; i < CAMERA_FRAMES; i++) {
    quiet();
    await frame();
  }
}

// Breaks both pillboxes with a heavy-gun shot from the side, as a player would: the health is left at 1 and a shot starts
// just outside each box, so the game's own hit reports `destroyed` (sendToScript is not called).
function breakBoth(): void {
  const current = game();
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = current.targets.find(entry => entry.id === id);
    if (!target || target.hp <= 0) continue;
    target.hp = 1;
    const { box } = target;
    current.bullets.push({
      weapon: 'heavyGun',
      x: box.minX - 0.5,
      y: (box.minY + box.maxY) / 2,
      z: (box.minZ + box.maxZ) / 2,
      dx: 1,
      dy: 0,
      dz: 0,
      left: WEAPONS.heavyGun.range,
    });
  }
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('blast', async () => {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);

  // the side point is watched from the sea, the back point from the land
  if (wanted('blast-pillbox-side')) {
    await standAt('blast-pillbox-1-side', 4, 0);
    await picture('blast-pillbox-side');
  }
  if (wanted('blast-pillbox-back')) {
    await standAt('blast-pillbox-1-back', -4, Math.PI);
    await picture('blast-pillbox-back');
  }
});

test('break', async () => {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);

  // 35m behind the pillboxes, facing the land: both are in the picture, and the smoke stands over them
  await standAtPlace(0, 20);

  // the shots own the game's clock: a drawn frame adds no time, and the seconds are the ones a player sees
  LOOP.maxDt = 0;
  breakBoth();
  const SHOTS: readonly (readonly [string, number])[] = [
    ['0.15', 0.15],
    ['0.6', 0.6],
    ['1.5', 1.5],
    ['3', 3],
  ];
  let elapsed = 0;
  const advance = (to: number) => {
    const steps = Math.max(0, Math.round((to - elapsed) * 60));
    for (let i = 0; i < steps; i++) runSystems(1 / 60);
    elapsed = to;
  };
  advance(1 / 60); // the frame the shots land: the destroyed events and the start of the sink
  for (const [name, at] of SHOTS) {
    advance(at);
    if (wanted(`pillbox-break-${name}`)) await picture(`pillbox-break-${name}`);
  }
  LOOP.maxDt = 0.05;
});

test('advance', async () => {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);

  // 20 m behind the pillboxes, facing the land: both pillboxes and the line the infantry waits at are in the picture
  await standAtPlace(0, 20);

  // the shots own the game's clock: a drawn frame adds no time, and the seconds are the ones a player sees
  LOOP.maxDt = 0;
  // For the picture only: nothing shoots back and the armour is kept full, so the mech stands through the wait while
  // the infantry crosses the 176 m from the sea to the waiting line.
  const holdTheMech = () => {
    const current = game();
    current.enemies = [];
    current.barrages = [];
    current.shells = [];
    current.armor = MECH_TUNE.armor;
  };
  for (let i = 0; i < 60 * 90; i++) {
    holdTheMech();
    runSystems(1 / 60);
  }
  if (wanted('advance-wait')) await picture('advance-wait');

  // break both pillboxes; the flag stands and the infantry and the two allied mechs go on
  breakBoth();
  for (let i = 0; i < 60 * 4; i++) {
    holdTheMech();
    runSystems(1 / 60);
  }
  if (wanted('advance-go')) await picture('advance-go');
  LOOP.maxDt = 0.05;
});
