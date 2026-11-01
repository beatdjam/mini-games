// Shared by the Sector Dive Extended smoke tests: the loop stepper, the start-up and the building helpers
import type { GameState } from '../src/data/types.ts';
import { T, W, floorY } from '@engine/world/tiles.ts';
import { setFireHeld } from '@engine/ui/input.ts';
import { boss, enemies } from '../src/world/entities.ts';
import { player, run } from '../src/actors/player.ts';
import { hurtEnemy } from '../src/actors/combat.ts';
import { SAVE_KEY, save } from '../src/core/save.ts';
import { goBase, startRun, startStage } from '../src/flow/run.ts';
import { building } from '../src/world/building.ts';
import type { Building } from '../src/world/building.ts';
import { BIOMES } from '../src/data/biomes.ts';
import { PER } from '../src/data/progress.ts';
import { devSeed, level } from '../src/world/level.ts';
import { setState, show, state } from '../src/flow/state.ts';
import { update } from '../src/flow/update.ts';

export const stateIs = (s: GameState) => state === s; // a call, so TypeScript does not keep the narrowing of an earlier state check
export const tick = (n: number) => {
  for (let k = 0; k < n; k++) {
    if (state !== 'play') {
      show(null);
      setState('play');
    }
    player.hp = player.maxHp;
    player.inv = 1;
    update(1 / 60);
  }
};

// What the game was doing, for the error of a test that fails only now and then. An actor's own values are the plain
// ones (numbers, text, true or false) of the object given
export function failInfo(actor?: object): string {
  const plain = Object.entries(actor ?? {}).filter(([, v]) => ['number', 'string', 'boolean'].includes(typeof v));
  return JSON.stringify({
    state,
    stage: run?.stage,
    kind: run?.kind,
    area: run?.area,
    floor: level.floor,
    player: { x: player.x, z: player.z, fy: player.fy, hp: player.hp, inv: player.inv },
    enemies: enemies.filter(e => !e.dead).length,
    boss: boss?.kind ?? null,
    hidden: document.hidden,
    weapons: player.weapons,
    save: { startTier: save.startTier, shortcut: save.shortcut, area: save.records.bossArea, up: save.up },
    stored: localStorage.getItem(SAVE_KEY)?.slice(0, 400),
    actor: Object.fromEntries(plain),
  });
}

// the game page started (main.ts) and a run begun; each test file calls it in its beforeAll
export async function bootGame() {
  await import('../src/main.ts');
  await new Promise(r => setTimeout(r, 300)); // the start-up timers
  startRun();
  setFireHeld(true);
}
// ---- the building: floors, stairwells and lifts, the boss room, the lockdown ----
// kills what is alive in a room right now (a splitter's halves are left for the next call)
export const killRoom = (room: number) =>
  enemies.filter(e => e.room === room && !e.dead).forEach(e => hurtEnemy(e, 1e6, false));
// puts the player on a building floor as if they had come down to it by a stairwell or lift (the start room on floor 0)
export function goToFloor(floor: number) {
  run.bld!.floor = floor;
  run.bld!.at = floor ? building!.links.findIndex(l => l.upper === floor || l.lower === floor) : -1;
  startStage();
  player.hp = 1e6;
  player.maxHp = 1e6;
  tick(2);
}
// puts the player in the middle of a tile of the floor being played, standing on its ground
export function putOnTile(k: number) {
  player.x = ((k % W) + 0.5) * T;
  player.z = (Math.floor(k / W) + 0.5) * T;
  player.fy = floorY(player.x, player.z);
  player.vy = 0;
}

// A run on the building of the first seed (1, 2, 3 ...) that has what the test needs, on the sector that seed picks, so
// the building is the same on every run of the file. (The enemies and drops in it still throw the real dice.)
export function enterBuilding(want: (b: Building) => boolean = () => true): number {
  for (let seed = 1; seed <= 200; seed++) {
    const bi = seed % BIOMES.length;
    goBase();
    startRun();
    devSeed(seed);
    run.route = [bi];
    run.stage = bi * PER;
    run.bld = undefined;
    startStage();
    devSeed(null);
    tick(2);
    if (building && want(building)) return seed;
  }
  throw new Error('no building in 200 seeds has what the test needs');
}
