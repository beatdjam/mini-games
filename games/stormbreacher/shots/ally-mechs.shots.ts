// Screenshots of the five allied mechs (SB-1590): the five on the beach, the three at their posts behind line 1, the
// gunner where the machine gun takes it, the three at C's posts and the three at the boss's cover. npm run shots. Not a
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

// Where the camera stands and where it looks for each picture (m); +z is the sea.
const BEACH = { eye: [12, 14, 192], at: [14, 1, 160] } as const;
const B_POSTS = { eye: [35, 18, 158], at: [35, 1, 120] } as const;
const GUNNER = { eye: [52, 12, 140], at: [45, 1, 112] } as const;
const C_POSTS = { eye: [22, 18, 55], at: [22, 1, 2] } as const;
const BOSS_POSTS = { eye: [0, 24, -125], at: [0, 1, -80] } as const;

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
  for (let i = 0; i < steps; i++) {
    quiet();
    runSystems(1 / 60);
  }
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

// Starts the sortie and passes over the landing, so the ashore cue has put the five allies out: the buddy, the three
// cover mechs and the gunner, who waits with them by line 1.
async function beach(): Promise<void> {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);
}

// Fires cp1 as the player's charges would: both pillboxes down at once.
function breakPillboxes(): void {
  for (const id of PILLBOXES) {
    const target = game().targets.find(entry => entry.id === id);
    if (target) target.hp = 0;
    sendToScript(game(), { kind: 'destroyed', target: id });
  }
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('ally-mechs', async () => {
  await beach();
  // the five on the beach: the three cover mechs and the gunner wait sea-side of line 1
  await picture('ally-mechs-beach', BEACH);

  // B: line 1's hole opens, the three run through it with the gunner, and the machine gun takes the gunner
  sendToScript(game(), { kind: 'blast', id: 'l1-b' });
  game().mech.x = 0;
  game().mech.z = 140;
  sendToScript(game(), { kind: 'enter', area: 'b-line' });
  LOOP.maxDt = 0;
  advance(6);
  await picture('ally-mechs-gunner-down', GUNNER);
  advance(8);
  await picture('ally-mechs-b-posts', B_POSTS);

  // C: cp1 sends the three on past lines 2 and 3 to their posts at C (the wave2-sinks cutscene is passed)
  breakPillboxes();
  sendToScript(game(), { kind: 'skip' });
  advance(40);
  await picture('ally-mechs-c-posts', C_POSTS);

  // the boss's cover: the three climb the ramp at x 35 and take their posts beyond the seawall
  sendToScript(game(), { kind: 'enter', area: 'seawall-top' });
  advance(20);
  await picture('ally-mechs-boss-posts', BOSS_POSTS);
});
