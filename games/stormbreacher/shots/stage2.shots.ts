// Screenshots of stage 2's feedback (tickets 2270-2272): the front gauge at the right edge as the sectors move, the mark
// over an aimed-at soldier, the spark of a hit, and the man-down pop and radio line. The game is not changed here: the
// mech and the enemies are put where the picture needs them, and the game's own overview camera follows the mech for over
// a second before the picture is taken. npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels
// differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose
// names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems } from '@engine/core/index.ts';
import { currentGame, currentPlayView, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { M1_SECTORS, SECTOR_TUNE, type SectorId } from '../src/data/sectors.ts';
import { GAUGE_TUNE, INFANTRY_TUNE, MECH_TUNE } from '../src/data/tune.ts';
import type { Soldier } from '../src/logic/crowd.ts';
import { rectDistance } from '../src/logic/collide.ts';
import { newEnemy } from '../src/logic/enemies.ts';
import { sendToScript } from '../src/logic/game.ts';
import { sectorHold } from '../src/logic/sectors.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
const SETTLE_SEC = 1.5; // s; well over QUARTER_TUNE.lag (0.23 s), so the camera has caught up with the mech
const START_SETTLE_SEC = 3; // s; the infantry walks from the sea edge (z 162..170) to its wait line at z 160
const WALK_IN_SEC = 3; // s; the infantry walks this far inland before the feedback scene is set
const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const STEP = 1 / 60; // s; one frame of the game, stepped by hand

// The caps on the feedback waits. A wait that runs out still leaves its picture, so a stuck state is a reason in the
// result rather than a run with a picture missing.
const TARGETED_CAP_SEC = 20; // s; an enemy shoots at the infantry often enough to mark one in this time
const HIT_CAP_SEC = 20; // s; a shot that goes at the infantry hits it in this time
const FALL_CAP_SEC = 20; // s; a hurt soldier is put down in this time
const MANY_CAP_SEC = 25; // s; three losses come close enough together for the pop to read ×3
const RADIO_CAP_SEC = 5; // s; the man-down line comes up after the fall
const RADIO_DRAIN_CAP_SEC = 40; // s; the landing's lines and the sortie's own have the band before the picture is set
const SPARK_FRAMES = 18; // frames stepped after a hit, so the spark has come out of the soldier's body to be seen
const MANY_GRUNTS = 12; // the grunts round the first one's clear place for the ×3 pop
const MANY_HURT = 3; // soldiers one hit from down for the ×3 pop, so no more than three fall at once
const CLUSTER_NEAR = 12; // m; two soldiers this near each other are in one cluster for the picture
const CLUSTER_HALF_WIDTH = 50; // m; the cluster is picked this near x 0, clear of the cliffs and the sea edges

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

// Keeps the mech whole while the camera settles, as the sector shots do: the pictures are of the feedback, not of a
// shelling, so the warnings and the shells that have fallen are taken away each step.
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

// Steps until `done` and gives back whether it came within `seconds`; the caller still takes its picture.
function waitGame(done: () => boolean, seconds: number): boolean {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    stepGame(1);
    if (done()) return true;
  }
  return done();
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
// so the gauge, the loss pop and the radio band are in the picture too.
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

function clearAllEnemies(): void {
  for (const enemy of game().enemies) {
    if (enemy.hp > 0) enemy.hp = 0;
  }
}

// Takes a sector's counterattack enemies down. One that has not come out yet is made when its time comes, so this runs
// each frame until the sector is stable.
function clearCounter(id: SectorId): void {
  const wave = `counter-${id}`;
  for (const enemy of game().enemies) {
    if (enemy.wave === wave && enemy.hp > 0) enemy.hp = 0;
  }
}

// Steps with line 1's counterattack kept down, so it is not in the pictures of the gauge.
function settleCounter(seconds = SETTLE_SEC): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    clearCounter('line1');
    stepGame(1);
  }
}

function frontHold(): number {
  return sectorHold(game().sectors, game().script.blasts, game().map.blasts ?? []).holdZ;
}

// Takes the beach: its enemies are cleared, line 1 is blown open (the infantry cannot reach the beach's own hold while
// the closed line holds it back), and the counterattack is beaten off so the beach is stable.
function beatBeach(): void {
  clearSector('beach');
  place(0, 156);
  sendToScript(game(), { kind: 'blast', id: 'l1-a' });
  runUntil(() => phaseOf('beach') === 'counter', 60, 'the beach secured');
  runUntil(() => sectors().counterLeft[sectorIndex('beach')] === 0, 10, 'the beach counterattack out');
  for (let i = 0; i < 10 * 60; i++) {
    clearCounter('beach');
    stepGame(1);
    if (phaseOf('beach') === 'stable') return;
  }
  throw new Error('the beach counterattack was not beaten off');
}

// Sets the field for the feedback pictures: the sectors are all stable (so no hold and no support fire moves or shoots),
// no wave comes in, no battle shell falls and no enemy is left to shoot the infantry. The few soldiers the picture needs
// are frozen where they stand, and the radio band is cleared so the man-down line comes up at once.
function freeField(): void {
  const current = game();
  if (current.sectors !== null) current.sectors.phase.fill('stable');
  current.battle.crowd.bounds = null; // no new wave while the picture is set
  current.battle.shellT = 1e9; // no battle shell while the picture is set
  current.bullets = [];
  current.shells = [];
  current.barrages = [];
  current.aimed = null;
  clearAllEnemies();
}

// Keeps the infantry where it stands: a soldier with a post does not walk. The waits for a mark, a hit and a fall take
// several seconds, and the soldiers must not walk out of the frame in that time.
function standFast(): void {
  for (const soldier of game().battle.crowd.soldiers) {
    if (soldier.alive && soldier.post === null) soldier.post = { x: soldier.x, z: soldier.z };
  }
}

// The soldier with the most others around it, near the middle of the map so the picture is clear of the cliffs.
function clusterSpot(): { x: number; z: number } {
  const alive = game().battle.crowd.soldiers.filter(soldier => soldier.alive);
  if (alive.length === 0) throw new Error('the infantry is all down');
  const middle = alive.filter(soldier => Math.abs(soldier.x) <= CLUSTER_HALF_WIDTH);
  const list = middle.length > 0 ? middle : alive;
  let best = list[0];
  let bestNear = -1;
  for (const soldier of list) {
    const near = list.filter(other => Math.hypot(other.x - soldier.x, other.z - soldier.z) <= CLUSTER_NEAR).length;
    if (near > bestNear) {
      best = soldier;
      bestNear = near;
    }
  }
  return { x: best.x, z: best.z };
}

function addGrunt(id: string, x: number, z: number): void {
  const grunt = newEnemy(id, 'stage2', 'grunt', x, z);
  grunt.awake = true;
  game().enemies.push(grunt);
}

// A place for the grunt the marks are about: beside the cluster and a little inland, picked for the most room around it
// so it does not stand on another soldier (which would put the mark and the spark behind its body). It stays seaward of
// line 1's hedgehogs (z 131..143), and ahead of the camera rather than under it.
function gruntSpot(at: { x: number; z: number }): { x: number; z: number } {
  const alive = game().battle.crowd.soldiers.filter(soldier => soldier.alive);
  const offsets = [
    [-10, 0],
    [10, 0],
    [-11, -2],
    [11, -2],
    [-9, 2],
    [9, 2],
  ] as const;
  let best = { x: at.x - 10, z: at.z };
  let bestRoom = -1;
  for (const [dx, dz] of offsets) {
    const x = at.x + dx;
    const z = at.z + dz;
    let room = Infinity;
    for (const soldier of alive) room = Math.min(room, Math.hypot(soldier.x - x, soldier.z - z));
    if (room > bestRoom) {
      best = { x, z };
      bestRoom = room;
    }
  }
  return best;
}

// The living soldiers nearest `at`, for the few the ×3 pop needs.
function nearestSoldiers(at: { x: number; z: number }, count: number): Soldier[] {
  return game()
    .battle.crowd.soldiers.filter(soldier => soldier.alive)
    .sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z))
    .slice(0, count);
}

// Where the mech stands for the feedback pictures: seaward of the cluster, so it looks past the mech at the infantry,
// in the open (a block or a crater under the mech would hide it).
function mechSpot(at: { x: number; z: number }): { x: number; z: number } {
  const candidates = [
    [0, 10],
    [-8, 10],
    [8, 10],
    [0, 14],
    [-10, 6],
    [10, 6],
  ] as const;
  for (const [dx, dz] of candidates) {
    const x = at.x + dx;
    const z = Math.min(at.z + dz, 168);
    if (game().rects.every(rect => rectDistance(rect, x, z) > 2)) return { x, z };
  }
  return { x: at.x, z: Math.min(at.z + 10, 168) };
}

// More grunts round the first one's place, which was picked for a clear shot: three losses then land inside the pop's
// seconds without a cover or another soldier in the way.
function addManyGrunts(at: { x: number; z: number }): void {
  const places = [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
    [3, 2],
    [-3, -2],
    [3, -2],
    [-3, 2],
    [5, 0],
    [-5, 0],
    [0, 5],
    [0, -5],
  ] as const;
  for (let i = 0; i < MANY_GRUNTS; i++) {
    const [dx, dz] = places[i];
    addGrunt(`stage2-grunt-many-${i + 1}`, at.x + dx, at.z + dz);
  }
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

test('stage2', async () => {
  await deck();
  // just ashore: every sector is the enemy's land, and the mech's and the front's marks sit near the sea's edge
  place(0, 166);
  settle(START_SETTLE_SEC);
  await picture('stage2-gauge-start', true);

  // The landing's own radio takes the band first; let it have its seconds before the sectors move.
  settle(12);

  // The beach is stable, and line 1 is secured: the gauge has its three fills (the enemy's land, secured, stable).
  beatBeach();
  clearSector('line1');
  place(0, 100);
  runUntil(() => phaseOf('line1') === 'counter', 60, 'line 1 secured');
  await picture('stage2-gauge-secured', true);

  // The mech 60 m past line 1's hold line (over GAUGE_TUNE.isolatedGap) is isolated, and 30 m is the warning.
  const front = frontHold();
  place(0, front - (GAUGE_TUNE.isolatedGap + 3));
  settleCounter();
  await picture('stage2-gauge-isolated', true);
  place(0, front - GAUGE_TUNE.warnGap);
  settleCounter();
  await picture('stage2-gauge-warn', true);

  // A fresh sortie for the feedback: the pictures are of the marks and the pop, so the field is set quiet with the
  // infantry standing still, and the landing's lines are given the band before the man-down line is called.
  await deck();
  freeField();
  settle(WALK_IN_SEC);
  standFast();
  waitGame(() => game().radio === null && game().radioQueue.length === 0, RADIO_DRAIN_CAP_SEC);

  const spot = clusterSpot();
  const standAt = mechSpot(spot);
  place(standAt.x, standAt.z);
  settle();
  const gruntAt = gruntSpot(spot);
  addGrunt('stage2-grunt-target', gruntAt.x, gruntAt.z);

  // The mark over an aimed-at soldier: wait for the enemy's shot that goes at the infantry.
  const targeted = waitGame(
    () => game().battle.crowd.soldiers.some(soldier => soldier.alive && soldier.targetedT > 0),
    TARGETED_CAP_SEC,
  );
  if (!targeted) console.warn('stage2-targeted: no soldier was aimed at within the cap');
  await picture('stage2-targeted');

  // A hit on a hurt soldier: the mark is red and the spark is out on the frame the hit is reported. The health is cut so
  // one hit is enough to read red, while one hit still leaves the soldier up.
  for (const soldier of game().battle.crowd.soldiers) if (soldier.alive) soldier.hp = 2;
  const hit = waitGame(() => game().events.some(event => event.kind === 'infantryHit'), HIT_CAP_SEC);
  if (!hit) console.warn('stage2-hit-spark: no hit was reported within the cap');
  // The spark starts at the chest, on the side away from the camera; these frames let it come out round the soldier.
  stepGame(SPARK_FRAMES);
  await picture('stage2-hit-spark');

  // A fall: one hit puts a soldier down. The radio band was drained above, so the man-down line comes up at once.
  for (const soldier of game().battle.crowd.soldiers) if (soldier.alive) soldier.hp = 1;
  const fell = waitGame(
    () => game().events.some(event => event.kind === 'battleFell' && (event.by === 'fire' || event.by === 'shell')),
    FALL_CAP_SEC,
  );
  if (!fell) console.warn('stage2-man-down: no soldier fell within the cap');
  const radio = waitGame(() => game().radio?.line === 'm1.man-down', RADIO_CAP_SEC);
  if (!radio) console.warn('stage2-man-down: the man-down line did not come up within the cap');
  await picture('stage2-man-down', true);

  // Three losses inside the pop's seconds: the first pop is let go, three soldiers by the cluster are left one hit from
  // down (no more, so the count cannot pass 3 in one frame), and more grunts come in. The pop is taken at ×3.
  clearAllEnemies();
  waitGame(() => (currentPlayView()?.hud.pop.count ?? 0) === 0, 4);
  for (const soldier of game().battle.crowd.soldiers) if (soldier.alive) soldier.hp = INFANTRY_TUNE.hp;
  for (const soldier of nearestSoldiers(gruntAt, MANY_HURT)) soldier.hp = 1;
  addManyGrunts(gruntAt);
  const many = waitGame(() => (currentPlayView()?.hud.pop.count ?? 0) === 3, MANY_CAP_SEC);
  if (!many) console.warn('stage2-man-down-many: the pop did not reach ×3 within the cap');
  await picture('stage2-man-down-many', true);
});
