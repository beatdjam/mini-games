// What the pinned tests (pins.test.ts) and the screenshots (shots/looks.shots.ts) share: the game booted with fixed
// dice, its own loop held still, and a sector's building entered on a floor of it
import { createRng } from '@engine/core/util.ts';
import { clearWorld } from '@engine/core/world.ts';
import { systems } from '@engine/core/loop.ts';
import { PER } from '../src/data/progress.ts';
import { run } from '../src/actors/player.ts';
import { startRun, startStage } from '../src/flow/run.ts';
import { building } from '../src/world/building.ts';
import { enemies, removeEnemyMesh, setBoss } from '../src/world/entities.ts';
import { devSeed } from '../src/world/level.ts';

export const SEED = 1234;
const random = Math.random;

// the game's dice from a fixed seed. three.js throws Math.random for the id of every object it makes, and how many it
// makes before a floor is filled can differ from one page to the next; those throws stay on the real dice, so that they
// do not shift the game's
export function seedDice() {
  const next = createRng(SEED).next;
  Math.random = () => ((new Error().stack ?? '').includes('generateUUID') ? random() : next());
}
// The page's own loop keeps running while a test waits: with its systems on, the enemies would move, throw the dice
// and flash their materials there, and the run could end. Off, it only draws; update() does nothing either then
export function holdLoop(on: boolean) {
  systems.forEach(s => {
    s.enabled = !on;
  });
}
// the game page started (main.ts) and a run begun, with the fixed dice and the loop held
export async function bootFixed() {
  await import('../src/main.ts');
  await new Promise(r => setTimeout(r, 300)); // the start-up timers
  devSeed(SEED);
  seedDice();
  startRun();
  holdLoop(true);
}
export function unbootFixed() {
  holdLoop(false);
  Math.random = random;
  devSeed(null);
}
export function clearEnemies() {
  setBoss(null);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
}
// the building of sector bi from the fixed seed (and the fixed dice for the enemies and drops), on the given floor
export function enterSector(bi: number, floor: number | 'last') {
  seedDice();
  run.route = [bi];
  run.stage = bi * PER;
  run.bld = undefined;
  startStage();
  if (floor !== 0) {
    const f = floor === 'last' ? building!.plans.length - 1 : floor;
    run.bld!.floor = f;
    run.bld!.at = building!.links.findIndex(l => l.upper === f || l.lower === f);
    startStage();
  }
}
