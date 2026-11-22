// The cutscene's edge against the input: the frame a cutscene starts takes no skip, Esc while the pointer is locked
// skips instead of pausing (and inside the guard does nothing), a jump pressed while paused is thrown away, and a sortie taken up mid-cutscene does not play
// its past blasts again.
import { afterEach, beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { el } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { boot } from '../../src/app/boot.ts';
import { currentGame, startSortie, titleReturn } from '../../src/app/play.ts';
import { state } from '../../src/app/screen.ts';
import { SUSPEND_KEY } from '../../src/app/storage.ts';
import { CUTSCENE_SEC } from '../../src/data/script.ts';
import { pastSkipGuard as pastGuard } from './cutsceneSkip.ts';
import { steps, untilSteps } from './steps.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  // the real page loads again to go back to the title; a test cannot, so it takes the in-page way
  titleReturn.reload = false;
});

// A test that fails before its resume would leave the suspend for the next file.
afterEach(() => localStorage.removeItem(SUSPEND_KEY));

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

// Runs the game's systems by hand until `done` holds (the pattern of the other e2e tests), and fails when it never does.
async function until(done: () => boolean): Promise<void> {
  try {
    await untilSteps(done);
  } catch (error) {
    throw new Error(`${(error as Error).message} (cutscene: ${describeCutscene()})`);
  }
}

// The cutscene's state for a failed wait: which one plays, or none, and the second it is at.
function describeCutscene(): string {
  const cutscene = currentGame()?.script.cutscene;
  if (!cutscene) return 'none';
  return `${cutscene.id} at ${(CUTSCENE_SEC[cutscene.id] - cutscene.left).toFixed(2)} s`;
}

const press = (code: string): boolean => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
const button = (id: string): HTMLButtonElement => el<HTMLButtonElement>(id);

async function pastLanding(): Promise<void> {
  steps(1);
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
  steps(1);
  expect(current.script.cutscene?.id).toBe('wave2-sinks');
  // the press inside the guard is gone, not saved up for the moment the guard ends
  await until(pastGuard);
  expect(current.script.cutscene?.id).toBe('wave2-sinks');
  press('Enter');
  await until(() => current.script.cutscene === null);
});

test('a lost pointer lock in a cutscene skips it and does not pause', async () => {
  startSortie();
  steps(1);
  await until(pastGuard);
  // Esc while the pointer is locked comes as a release, and no keydown
  document.dispatchEvent(new Event('pointerlockchange'));
  await until(() => game().script.cutscene === null);
  expect(state).toBe('play');
  expect(el('#sbPause').hidden).toBe(true);
});

// What the code does today, not a decision: inside the guard the release is thrown away like any skip, and it does not
// pause either, so the cutscene goes on without the lock until the player skips it or it ends.
test('a lost pointer lock inside the skip guard does nothing: no skip and no pause', async () => {
  startSortie();
  steps(1);
  expect(pastGuard()).toBe(false);
  document.dispatchEvent(new Event('pointerlockchange'));
  steps(1);
  expect(game().script.cutscene?.id).toBe('landing');
  expect(state).toBe('play');
  expect(el('#sbPause').hidden).toBe(true);
  // the release was not saved up: the cutscene is still playing once the guard is over
  await until(pastGuard);
  expect(game().script.cutscene?.id).toBe('landing');
  expect(state).toBe('play');
});

test('a jump pressed while paused does not jump on the first frame after the resume', async () => {
  startSortie();
  await pastLanding();
  // the mech stands on whatever the landing left it on (the boat's deck, y 1.8), not always on the ground
  const standY = game().mech.y;
  press('KeyP');
  expect(state).toBe('paused');
  press('Space');
  press('KeyP');
  expect(state).toBe('play');
  steps(1);
  expect(game().mech.vy).toBe(0);
  expect(game().mech.y).toBe(standY);
});

test('a sortie taken up in the middle of a cutscene does not play its past blasts again', async () => {
  startSortie();
  await pastLanding();
  const current = game();
  // the wave 2 cutscene, 3.5 s in: its blasts (up to 2.9 s) have played
  current.script.cutscene = { id: 'wave2-sinks', left: CUTSCENE_SEC['wave2-sinks'] };
  steps(Math.round(3.5 * 60));
  expect(current.script.cutscene?.id).toBe('wave2-sinks');
  expect(smoke()).toBeGreaterThan(0);

  press('KeyP');
  button('#sbPauseSuspend').click();
  expect(state).toBe('title');
  button('#sbContinue').click();
  expect(state).toBe('play');
  // the first frame starts at the cutscene's second, so nothing before it plays again
  steps(1);
  expect(currentGame()?.script.cutscene?.id).toBe('wave2-sinks');
  expect(smoke()).toBe(0);
});
