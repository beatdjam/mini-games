// Screenshots of the infantry's squads (SB-1610): the wave coming in, the four squad soldiers cut down at the
// machine-gun nests, and a shell taking the soldiers around the mech. npm run shots. Not a test: it is not part of npm
// test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go;
// SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems, systems } from '@engine/core/index.ts';
import { camera } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { PLAY_BATTLE_TUNE } from '../src/data/tune.ts';
import { showSquad } from '../src/dev/views/squad.ts';
import { sendToScript } from '../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view

// Where the camera stands and where it looks (m); +z is the sea, and the first row of nests is at z 147.
const WAVE = { eye: [48, 13, 183], at: [45, 1, 154] } as const;
const FALLS = { eye: [45, 9, 172], at: [45, 1, 148] } as const;
const SHELL = { eye: [-16, 16, 146], at: [0, 1, 165] } as const;

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

// Opens the entry; its own system passes over the landing in the frame the cutscene comes up.
async function open(): Promise<void> {
  showSquad('#view-squad');
  await until(() => currentGame() !== null);
  await until(() => game().script.cutscene === null);
  await frame();
}

// Passes over the landing by hand, so the mech stands in the picture and the battle steps from the beach.
function passLanding(): void {
  for (let i = 0; i < 10 && game().script.cutscene !== null; i++) {
    sendToScript(game(), { kind: 'skip' });
    runSystems(1 / 60);
  }
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('squads', async () => {
  await open();
  LOOP.maxDt = 0;

  // the wave: two squads of five on their way to the nests, the rest of the 20 scattered
  advance(1.5);
  await picture('squads-wave', WAVE);

  // the nests: two of each squad down where the machine guns stand (z 147), the rest walking on
  advance(3);
  await picture('squads-falls', FALLS);

  // a shell: the values are turned as the panel would turn them, so the shells fall on the mech and take the soldiers
  // around it; the sortie is made again so the battle reads them
  PLAY_BATTLE_TUNE.allies = 60;
  PLAY_BATTLE_TUNE.allyWaves = 0;
  PLAY_BATTLE_TUNE.allySpeed = 0;
  PLAY_BATTLE_TUNE.allyDeathRate = 0;
  PLAY_BATTLE_TUNE.squads = 0;
  PLAY_BATTLE_TUNE.shellEvery = 2;
  PLAY_BATTLE_TUNE.shellNear = 3;
  PLAY_BATTLE_TUNE.shellFar = 3;
  PLAY_BATTLE_TUNE.shellFallRadius = 16;
  PLAY_BATTLE_TUNE.shellFallShare = 1;
  startSortie();
  LOOP.maxDt = 0;
  passLanding();
  advance(1.15);
  await picture('squads-shell', SHELL);
});
