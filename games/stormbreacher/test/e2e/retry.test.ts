import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { el, runSystems, t } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { currentGame, showResult, startSortie } from '../../src/app/play.ts';
import { state } from '../../src/app/screen.ts';
import { boot } from '../../src/app/boot.ts';
import { newGame, sendToScript } from '../../src/logic/game.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// The tests share one page: each starts the sortie again directly.
beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

// How many warning lights the scene draws, from the pillboxes' instanced mesh.
function warnLights(): number {
  let count = 0;
  scene.traverse(child => {
    if (child instanceof THREE.InstancedMesh && child.name === 'sb-pillbox-warn') count += child.count;
  });
  return count;
}

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

// Runs the game's systems by hand, a 60th of a second each, until `done` holds, and fails when it never does. Waiting
// for drawn frames instead timed out at 60 s on CI when every game's tests ran at once. A drawn frame could be up to a
// 20th of a second, so 720 steps are the 12 s of the game that 240 frames were. A drawn frame every 30 steps lets the
// page's own timers move on.
async function until(done: () => boolean, tries = 720): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    runSystems(1 / 60);
    if (i % 30 === 29) await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} steps`);
}

const button = (id: string): HTMLButtonElement => el<HTMLButtonElement>(id);
const START = { x: newGame(M1B_HAND).mech.x, z: newGame(M1B_HAND).mech.z };

// Takes cp1 with the mech at (-20, 60), then goes down somewhere else.
async function downAfterCheckpoint(): Promise<void> {
  startSortie();
  const current = game();
  current.mech.x = -20;
  current.mech.z = 60;
  sendToScript(current, { kind: 'destroyed', target: 'pillbox-1' });
  sendToScript(current, { kind: 'destroyed', target: 'pillbox-2' });
  current.mech.x = 10;
  current.mech.z = 20;
  current.armor = 0;
  current.downed = true;
  await until(() => state === 'result');
}

test('the downed result shows the three buttons when there is a checkpoint', async () => {
  await downAfterCheckpoint();
  expect(button('#sbResultCheckpoint').hidden).toBe(false);
  expect(button('#sbResultRestart').hidden).toBe(false);
  expect(button('#sbResultBack').hidden).toBe(false);
  expect(button('#sbResultCheckpoint').textContent).toBe(t('result.checkpoint'));
  expect(button('#sbResultRestart').textContent).toBe(t('result.restart'));
});

test('without a checkpoint the downed result has no checkpoint button', async () => {
  startSortie();
  const current = game();
  current.armor = 0;
  current.downed = true;
  await until(() => state === 'result');
  expect(button('#sbResultCheckpoint').hidden).toBe(true);
  expect(button('#sbResultRestart').hidden).toBe(false);
  expect(button('#sbResultBack').hidden).toBe(false);
});

test('the checkpoint button goes back to the sortie at the checkpoint with the armour full', async () => {
  await downAfterCheckpoint();
  const lost = game();
  button('#sbResultCheckpoint').click();
  expect(state).toBe('play');
  expect(el('#sbResult').hidden).toBe(true);
  const again = game();
  expect(again).not.toBe(lost);
  expect(again.mech.x).toBe(-20);
  expect(again.mech.z).toBe(60);
  expect(again.armor).toBe(MECH_TUNE.armor);
  expect(again.downed).toBe(false);
  expect(again.retries).toBe(1);
  await frame();
  await frame();
  expect(state).toBe('play');
});

test('the start button goes back to the sortie at the start', async () => {
  await downAfterCheckpoint();
  button('#sbResultRestart').click();
  expect(state).toBe('play');
  expect(el('#sbResult').hidden).toBe(true);
  const again = game();
  expect(again.mech.x).toBe(START.x);
  expect(again.mech.z).toBe(START.z);
  expect(again.armor).toBe(MECH_TUNE.armor);
  expect(again.checkpoint).toBeNull();
  expect(again.retries).toBe(1);
});

test('a warning light goes out once the sortie starts again', async () => {
  startSortie();
  const current = game();
  sendToScript(current, { kind: 'skip' });
  await until(() => current.script.cutscene === null);
  current.mech.x = -33;
  current.mech.z = 10;
  await until(() => current.pillboxes.some(pillbox => pillbox.warn > 0));
  await frame();
  expect(warnLights()).toBeGreaterThan(0);

  current.armor = 0;
  current.downed = true;
  await until(() => state === 'result');
  button('#sbResultRestart').click();
  await frame();
  expect(warnLights()).toBe(0);
});

test('the cleared result has no retry buttons', () => {
  startSortie();
  showResult();
  expect(el('#sbResult .title').textContent).toBe(t('result.title'));
  expect(button('#sbResultCheckpoint').hidden).toBe(true);
  expect(button('#sbResultRestart').hidden).toBe(true);
  expect(button('#sbResultBack').hidden).toBe(false);
});

test('the result buttons take a tap above the touch layer', async () => {
  startSortie();
  // the phone shows the touch layer while the sortie plays; it covers the whole screen
  el('#touch').hidden = false;
  const current = game();
  current.armor = 0;
  current.downed = true;
  await until(() => state === 'result');
  expect(el('#touch').hidden).toBe(true);
  for (const id of ['#sbResultBack', '#sbResultRestart']) {
    const target = button(id);
    const box = target.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    expect(hit === target || target.contains(hit), `the tap on ${id} reached ${hit?.id || hit?.tagName}`).toBe(true);
  }
});
