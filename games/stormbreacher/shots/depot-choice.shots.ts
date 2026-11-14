// Screenshots of the depot choice (SB-1820): the leader's question on the radio with the optional mark, the optional
// mark on the way down, the depot's hollow and its guard, and the ally the skipped depot costs at the fortress's cover.
// npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ between machines).
// SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
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

const HIDDEN =
  'body > *:not(#gl):not(#sbPlayHud) { visibility: hidden !important; } ' +
  '#sbPlayHud, #sbPlayHud * { visibility: visible !important; }'; // the 3D view and the HUD

const PILLBOXES = ['pillbox-1', 'pillbox-2'] as const;
const CHOICE = { eye: [20, 16, -22], at: [62, 1, -40] } as const; // from C towards the right cliff
const HOLLOW = { eye: [48, 22, -8], at: [78, 1, -42] } as const;
const COVER = { eye: [4, 12, -45], at: [-20, 1, -58] } as const;

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

// Step the game by hand: the drawn frames add no time (LOOP.maxDt = 0), so the seconds are the ones written here.
function advance(seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) runSystems(1 / 60);
}

// Nothing shoots while a picture is taken; the choice and the fallen ally are the subject.
function quiet(): void {
  const current = game();
  current.enemies = [];
  current.barrages = [];
  current.shells = [];
  current.aimed = null;
  current.armor = MECH_TUNE.armor;
  current.battery.on = false;
}

// Holds the game still, puts the camera where the picture needs it, draws one frame and takes the picture.
async function picture(name: string, place: { eye: readonly number[]; at: readonly number[] }): Promise<void> {
  LOOP.maxDt = 0;
  await frame();
  const play = systems.find(system => system.name === 'sb-play');
  if (play) play.enabled = false;
  camera.position.set(place.eye[0], place.eye[1], place.eye[2]);
  camera.lookAt(place.at[0], place.at[1], place.at[2]);
  await frame();
  if (wanted(name)) await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
  if (play) play.enabled = true;
}

// Starts the sortie, passes the landing and takes cp1, then waits for the leader's question (10 s after cp1).
async function theQuestion(): Promise<void> {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);
  for (const id of PILLBOXES) {
    const target = game().targets.find(entry => entry.id === id);
    if (target) target.hp = 0;
    sendToScript(game(), { kind: 'destroyed', target: id });
  }
  LOOP.maxDt = 0;
  advance(11);
  quiet();
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('depot-choice', async () => {
  await theQuestion();
  // the question is on the radio and the optional mark sits under the objective
  if (wanted('depot-choice-ask')) await picture('depot-choice-ask', CHOICE);

  // on the right road, the optional mark still shows the way down
  game().mech.x = 45;
  game().mech.z = -45;
  game().mech.y = 0;
  game().mech.yaw = -0.9;
  quiet();
  if (wanted('depot-choice-optional')) await picture('depot-choice-optional', CHOICE);

  // the hollow: the depot and pillbox-3, with the guard the cue puts out
  sendToScript(game(), { kind: 'enter', area: 'depot-approach' });
  advance(0.5);
  if (wanted('depot-choice-hollow')) await picture('depot-choice-hollow', HOLLOW);

  // the skipped depot's cost: the cover mech falls by the fortress's cover
  quiet();
  sendToScript(game(), { kind: 'enter', area: 'fortress-approach' });
  advance(2);
  if (wanted('depot-choice-after')) await picture('depot-choice-after', COVER);
});
