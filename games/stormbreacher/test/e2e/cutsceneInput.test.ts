// The cutscene's edge against the input: the frame a cutscene starts takes no skip, Esc while the pointer is locked
// skips instead of pausing, a jump pressed while paused is thrown away, and a sortie taken up mid-cutscene does not play
// its past blasts again. The ticket is 1680.
import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { el, runSystems } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { boot } from '../../src/app/boot.ts';
import { currentGame, startSortie, titleReturn } from '../../src/app/play.ts';
import { state } from '../../src/app/screen.ts';
import { CUTSCENE_SEC, CUTSCENE_SKIP_GUARD_SEC } from '../../src/data/script.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  // the real page loads again to go back to the title; a test cannot, so it takes the in-page way
  titleReturn.reload = false;
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

// Runs the game's systems by hand until `done` holds (the pattern of the other e2e tests), and fails when it never does.
async function until(done: () => boolean, tries = 720): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    runSystems(1 / 60);
    if (i % 30 === 29) await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} steps`);
}

const press = (code: string): boolean => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
const button = (id: string): HTMLButtonElement => el<HTMLButtonElement>(id);

// A cutscene takes no skip for CUTSCENE_SKIP_GUARD_SEC after it starts, so the tests that skip one wait that out first.
const pastGuard = (): boolean => {
  const cutscene = game().script.cutscene;
  return cutscene !== null && CUTSCENE_SEC[cutscene.id] - cutscene.left >= CUTSCENE_SKIP_GUARD_SEC + 0.1;
};

async function pastLanding(): Promise<void> {
  await frame();
  await until(pastGuard);
  press('Enter');
  await until(() => game().script.cutscene === null);
}

// The smoke of the cutscene's blasts: they stay in the scene for seconds, so a replay in one frame shows up here.
function smoke(): number {
  const mesh = scene.getObjectByName('sb-boom-smoke');
  return mesh instanceof THREE.InstancedMesh ? mesh.count : 0;
}

test('the jump of the frame a cutscene starts does not skip it, and the press is thrown away', async () => {
  startSortie();
  await pastLanding();
  const current = game();
  // the wave 2 cue fires on the next step (an after-cp1 cue): jump in the same frame it starts the cutscene
  current.script.fired.cp1 = current.script.time - 4;
  press('Space');
  runSystems(1 / 60);
  expect(current.script.cutscene?.id).toBe('wave2-sinks');
  // the press inside the guard is gone, not saved up for the moment the guard ends
  await until(pastGuard);
  expect(current.script.cutscene?.id).toBe('wave2-sinks');
  press('Enter');
  await until(() => current.script.cutscene === null);
});

test('a lost pointer lock in a cutscene skips it and does not pause', async () => {
  startSortie();
  await frame();
  await until(pastGuard);
  // Esc while the pointer is locked comes as a release, and no keydown
  document.dispatchEvent(new Event('pointerlockchange'));
  await until(() => game().script.cutscene === null);
  expect(state).toBe('play');
  expect(el('#sbPause').hidden).toBe(true);
});

test('a jump pressed while paused does not jump on the first frame after the resume', async () => {
  startSortie();
  await pastLanding();
  press('KeyP');
  expect(state).toBe('paused');
  press('Space');
  press('KeyP');
  expect(state).toBe('play');
  runSystems(1 / 60);
  expect(game().mech.vy).toBe(0);
  expect(game().mech.y).toBe(0);
});

test('a sortie taken up in the middle of a cutscene does not play its past blasts again', async () => {
  startSortie();
  await pastLanding();
  const current = game();
  // the wave 2 cutscene, 3.5 s in: its blasts (up to 2.9 s) have played
  current.script.cutscene = { id: 'wave2-sinks', left: CUTSCENE_SEC['wave2-sinks'] };
  for (let i = 0; i < Math.round(3.5 * 60); i++) runSystems(1 / 60);
  expect(current.script.cutscene?.id).toBe('wave2-sinks');
  expect(smoke()).toBeGreaterThan(0);

  press('KeyP');
  button('#sbPauseSuspend').click();
  expect(state).toBe('title');
  button('#sbContinue').click();
  expect(state).toBe('play');
  // the first frame starts at the cutscene's second, so nothing before it plays again
  runSystems(1 / 60);
  expect(currentGame()?.script.cutscene?.id).toBe('wave2-sinks');
  expect(smoke()).toBe(0);
});
