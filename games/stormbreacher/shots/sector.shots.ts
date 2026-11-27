// Screenshots of a sector's flow through the game's own overview camera (tickets 2210-2240): the infantry at the water's
// edge just after the landing, walking up to the beach's hold line, dug in when the beach is secured, the counterattack
// that follows, the support fire from a held line, and line 2's hold after it is secured. The camera is not placed here:
// the mech is put where the picture needs it and the game's camera follows it for over a second first. npm run shots. Not
// a test: it is not part of npm test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where
// the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { M1_SECTORS, SECTOR_TUNE, type SectorId } from '../src/data/sectors.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { sendToScript } from '../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
const SETTLE_SEC = 1.5; // s; well over QUARTER_TUNE.lag (0.23 s), so the camera has caught up with the mech
const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const STEP = 1 / 60; // s; one frame of the game, stepped by hand
const START_SETTLE_SEC = 3; // s; the infantry walks from the sea edge (z 162..170) to its wait line at z 160
const SUPPORT_CAP_SEC = 20; // s; how long the advance at line 1 may take to get a support-fire frame

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

let hide: HTMLStyleElement; // the style that leaves only the 3D view showing

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

function sectors() {
  const state = game().sectors;
  if (state === null) throw new Error('the sortie has no sectors');
  return state;
}

function sectorIndex(id: SectorId): number {
  const index = M1_SECTORS.findIndex(sector => sector.id === id);
  if (index < 0) throw new Error(`M1 has no ${id} sector`);
  return index;
}

const phaseOf = (id: SectorId) => sectors().phase[sectorIndex(id)];

async function until(done: () => boolean, tries = 600): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} frames`);
}

// Keeps the mech whole while the camera settles: the pictures are of the infantry's flow, not of a shelling, so the
// warnings and the shells that have fallen are taken away each step as the quarter shots do.
function repair(): void {
  const current = game();
  current.armor = MECH_TUNE.armor;
  current.barrages = [];
  current.shells = [];
  current.aimed = null;
}

// Steps the game by hand, so its own camera follows the mech and the lag dies away. The drawn frames add no time
// (LOOP.maxDt = 0), so the camera stays where this leaves it while the picture is taken.
function stepGame(frames: number): void {
  for (let i = 0; i < frames; i++) {
    repair();
    runSystems(STEP);
  }
}

function settle(seconds = SETTLE_SEC): void {
  stepGame(Math.round(seconds * 60));
}

// Steps until `done`, and gives up after `seconds` so a stuck state is a reason rather than a hung run.
function runUntil(done: () => boolean, seconds: number, what: string): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    stepGame(1);
    if (done()) return;
  }
  throw new Error(`the ${what} did not come in ${seconds} s`);
}

// Steps one frame at a time until the infantry fires, and gives back whether it did within the cap. The picture is
// taken straight after, so the tracer is drawn on the frame the shot was reported (picture() adds no time).
function runUntilSupport(seconds: number): boolean {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    stepGame(1);
    if (game().events.some(event => event.kind === 'supportFire')) return true;
  }
  return false;
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
// the camera settled, so the inland facing is put back with no time left to turn it again. `hud` keeps the page's HUD,
// so the radio band (the `m1.sector-*` lines) is in the picture too.
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

// Takes every living enemy in the sector's z band down, as the sector test's enterSector does.
function clearSector(id: SectorId): void {
  const sector = M1_SECTORS[sectorIndex(id)];
  for (const enemy of game().enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.z < sector.landZ || enemy.z > sector.seaZ + SECTOR_TUNE.seaMargin) continue;
    enemy.hp = 0;
  }
}

// Takes the sector's counterattack enemies down. One that has not come out yet is made when its time comes, so this
// runs each frame until the sector is stable.
function clearCounter(id: SectorId): void {
  const wave = `counter-${id}`;
  for (const enemy of game().enemies) {
    if (enemy.wave === wave && enemy.hp > 0) enemy.hp = 0;
  }
}

// Takes down the scripted enemies and the trickle's near the beach, so the pictures of the line are not crowded with
// them; the ones further inland (line 2's defenders) are left for the support fire to shoot.
function clearNearEnemies(): void {
  for (const enemy of game().enemies) {
    if (enemy.hp <= 0 || enemy.wave.startsWith('counter-')) continue;
    if (enemy.z > 90) enemy.hp = 0;
  }
}

function clearAllEnemies(): void {
  for (const enemy of game().enemies) {
    if (enemy.hp > 0) enemy.hp = 0;
  }
}

// What the pictures need to do while a sector moves on.
interface AdvanceHooks {
  afterClear?: () => Promise<void>; // after the enemies are down and the mech is put in place
  secured?: () => Promise<void>; // on the frame the hold line is secured
  counter?: () => Promise<void>; // once the counterattack has all come out
}

// Moves one sector on (SB-2210, SB-2220): its enemies are taken down, the mech is put in place, the infantry walks up
// and secures the hold line, the counterattack comes out, and it is put down so the sector is stable.
async function advance(id: SectorId, at: { x: number; z: number }, hooks: AdvanceHooks = {}): Promise<void> {
  clearSector(id);
  place(at.x, at.z);
  if (hooks.afterClear !== undefined) await hooks.afterClear();
  runUntil(() => phaseOf(id) === 'counter', 60, `${id} secured`);
  if (hooks.secured !== undefined) await hooks.secured();
  runUntil(() => sectors().counterLeft[sectorIndex(id)] === 0, 10, `${id} counterattack out`);
  if (hooks.counter !== undefined) await hooks.counter();
  const index = sectorIndex(id);
  for (let i = 0; i < 10 * 60; i++) {
    clearCounter(id);
    stepGame(1);
    if (sectors().phase[index] === 'stable') return;
  }
  throw new Error(`the ${id} counterattack was not beaten off`);
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  // the held frames add no time; the shots' seconds are the ones stepGame() steps by hand
  LOOP.maxDt = 0;
  hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('sector', async () => {
  await deck();
  // just ashore, with the infantry come up to the water's edge line (z 160)
  place(0, 166);
  settle(START_SETTLE_SEC);
  await picture('sector-start', true);

  // The landing's own radio (the buddy's call) takes the band first; let it have its seconds, so the sector's lines
  // are the ones on the band when the sector moves.
  settle(12);

  // the beach: the infantry walks to z 132 and digs in, then the three of the counterattack come out
  await advance(
    'beach',
    { x: 0, z: 156 },
    {
      afterClear: async () => {
        // 2 s into the walk (z 160 to z 132 is 28 m)
        stepGame(120);
        await picture('sector-advancing', true);
        // nearer the hold line, so the dug-in infantry sit in the middle of the frame; entering B here spends the
        // depot hint early enough for it to have had its time before the beach is secured
        place(8, 140);
        settle();
      },
      secured: async () => {
        clearNearEnemies();
        await picture('sector-secured', true);
      },
      counter: async () => {
        // the radio gives the secured line three seconds before the counterattack's, and the counterattack's enemies
        // hold their ground (z 117) meanwhile, in the frame with the hold line
        settle(1.7);
        clearNearEnemies();
        await picture('sector-counter', true);
      },
    },
  );

  // line 1: its hold line is z 80, and the infantry there shoots line 2's posted defenders and the trickle
  await advance(
    'line1',
    { x: 0, z: 100 },
    {
      afterClear: async () => {
        place(0, 72);
        settle();
        // the cap only ends the wait; the picture is taken either way, so a line that never fires still shows its state
        runUntilSupport(SUPPORT_CAP_SEC);
        await picture('sector-support', true);
      },
    },
  );

  // line 2: its hold line is z 30, 120 m from the beach, so the beach's column is outside the overview's frame
  await advance(
    'line2',
    { x: 0, z: 52 },
    {
      afterClear: async () => {
        // clear of the cover behind line 2 (the blocks at x 10, 30 and 70), with the hold line (z 30) in the frame
        place(-20, 38);
        settle();
      },
      secured: async () => {
        clearAllEnemies();
        await picture('sector-line2', true);
      },
    },
  );
});
