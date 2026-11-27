// The front's trickle in the sortie (SB-2230): enemies come out of the overview camera's sight, the living infantry
// stays capped, a sector's budget runs out, a secured sector's budget is closed, and the state goes into a suspend and a
// checkpoint.
import { describe, expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { M1_SECTORS, SECTOR_TUNE } from '../../src/data/sectors.ts';
import { TRICKLE_TUNE, TRICKLE_WAVE } from '../../src/data/trickle.ts';
import { QUARTER_TUNE } from '../../src/data/tune.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import {
  newGame,
  retryFromCheckpoint,
  sendToScript,
  step,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { hudModel } from '../../src/logic/hud.ts';
import { seed } from '../../src/logic/rng.ts';
import { restoreSuspend, suspendOf } from '../../src/logic/suspend.ts';
import { insideQuad, viewGround } from '../../src/logic/viewGround.ts';
import { clearInfantry, newPlayGame } from './playGame.ts';

const DT = 1 / 60;
const BEACH = M1_SECTORS[0];
const LINE1 = M1_SECTORS[1];
const idle: GameInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
  sub: false,
};
const walk: GameInput = { ...idle, moveZ: 1 };

function run(game: GameModel, input: GameInput, frames: number): void {
  for (let i = 0; i < frames; i++) step(game, input, DT);
}

// The living infantry the trickle counts: nest and the mid boss left out, dormant soldiers too.
function livingInfantry(game: GameModel): number {
  return game.enemies.filter(
    enemy => enemy.hp > 0 && !enemy.dormant && enemy.kind !== 'emplacement' && enemy.kind !== 'warden',
  ).length;
}

// The scripted infantry put to sleep, so the cap leaves the whole sector budget room.
function sleepScripted(game: GameModel): void {
  for (const enemy of game.enemies) {
    if (enemy.kind === 'emplacement' || enemy.kind === 'warden') continue;
    enemy.dormant = true;
  }
}

// Breaks both pillboxes, which is what takes cp1 (as test/integration/checkpoint.test.ts does).
function takeCp1(game: GameModel): void {
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(entry => entry.id === id);
    if (target === undefined) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
}

describe('the trickle in the sortie', () => {
  test('the enemies come out of the overview camera’s sight', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    game.armor = Number.MAX_SAFE_INTEGER;
    const seen = new Set<string>();
    for (let frame = 0; frame < 60 * 20; frame++) {
      step(game, idle, DT);
      for (const enemy of game.enemies) {
        if (enemy.wave !== TRICKLE_WAVE || seen.has(enemy.id)) continue;
        seen.add(enemy.id);
        const sight = viewGround(game.mech, QUARTER_TUNE, TRICKLE_TUNE.viewAspect, 0);
        expect(insideQuad(sight, enemy.x, enemy.z), enemy.id).toBe(false);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  test('the living infantry never passes the cap', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    // the cap is about the trickle: the infantry's support fire would keep the living count down (SB-2240)
    clearInfantry(game);
    game.armor = Number.MAX_SAFE_INTEGER;
    let most = 0;
    for (let frame = 0; frame < 60 * 90; frame++) {
      step(game, idle, DT);
      most = Math.max(most, livingInfantry(game));
    }
    expect(most).toBeLessThanOrEqual(TRICKLE_TUNE.maxAlive);
    // 90 s of frames: the same long bound as the budget test below, so the machine's load does not decide it
  }, 30000);

  test('the beach’s budget runs out, and then nothing more comes', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    // the budget is about the trickle: the infantry's support fire would shoot the eight down before the test reads them (SB-2240)
    clearInfantry(game);
    game.armor = Number.MAX_SAFE_INTEGER;
    // the scripted soldiers asleep: the cap does not stand in the beach budget's way
    sleepScripted(game);
    run(game, idle, 60 * 90);
    expect(game.trickle?.spent[0]).toBe(BEACH.budget);
    expect(game.enemies.filter(enemy => enemy.wave === TRICKLE_WAVE)).toHaveLength(BEACH.budget);
    const spent = game.trickle!.spent.reduce((sum, count) => sum + count, 0);
    run(game, idle, 60 * 20);
    expect(game.trickle!.spent.reduce((sum, count) => sum + count, 0)).toBe(spent);
  }, 30000);

  test('the beach is cleared only when the trickle that walked in is down too', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    game.armor = Number.MAX_SAFE_INTEGER;
    game.trickle!.t = 1e9; // hold the trickle while this test walks the beach
    // the scripted nests of the beach's band go down; the ones behind line 1 stay
    for (const enemy of game.enemies) {
      if (enemy.kind !== 'emplacement') continue;
      if (enemy.z >= BEACH.landZ && enemy.z <= BEACH.seaZ + SECTOR_TUNE.seaMargin) enemy.hp = 0;
    }
    const walkedIn = newEnemy('trickle-in', TRICKLE_WAVE, TRICKLE_TUNE.kind, 0, 140);
    game.enemies.push(walkedIn);
    game.mech.z = 160;
    step(game, idle, DT);
    expect(game.events.some(event => event.kind === 'sectorCleared')).toBe(false);
    expect(game.sectors?.phase[0]).toBe('idle');
    walkedIn.hp = 0;
    step(game, idle, DT);
    expect(game.events.some(event => event.kind === 'sectorCleared' && event.sector === 'beach')).toBe(true);
    expect(game.sectors?.phase[0]).toBe('advancing');
  });

  test('a secured beach closes its budget and line 1 pays', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    game.armor = Number.MAX_SAFE_INTEGER;
    sleepScripted(game);
    game.sectors!.phase[0] = 'secured';
    const spawned: { x: number; z: number }[] = [];
    const seen = new Set<string>();
    for (let frame = 0; frame < 60 * 60 && spawned.length === 0; frame++) {
      step(game, idle, DT);
      for (const enemy of game.enemies) {
        if (enemy.wave !== TRICKLE_WAVE || seen.has(enemy.id)) continue;
        seen.add(enemy.id);
        // where it came out, before it walked
        spawned.push({ x: enemy.x, z: enemy.z });
      }
    }
    expect(game.trickle!.spent[0]).toBe(0);
    expect(game.trickle!.spent[1]).toBeGreaterThan(0);
    expect(spawned.length).toBeGreaterThan(0);
    for (const enemy of spawned) {
      expect(enemy.z).toBeLessThanOrEqual(LINE1.landZ - TRICKLE_TUNE.spawnBack);
      expect(enemy.z).toBeGreaterThanOrEqual(LINE1.landZ - TRICKLE_TUNE.spawnBack - TRICKLE_TUNE.spawnDepth);
    }
  });

  test('a suspend brings the trickle back, and a retry goes to the checkpoint’s', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    game.armor = Number.MAX_SAFE_INTEGER;
    sleepScripted(game);
    run(game, idle, 60 * 10);
    const trickle = structuredClone(game.trickle);
    expect(trickle?.spent[0]).toBeGreaterThan(0);
    const back = restoreSuspend(JSON.parse(JSON.stringify(suspendOf(game))));
    expect(back?.trickle).toEqual(trickle);
    // a checkpoint, then a changed trickle, then a retry
    run(game, walk, 30);
    sendToScript(game, { kind: 'enter', area: 'b-line' });
    game.enemies = game.enemies.filter(enemy => enemy.wave !== 'b-emplacements');
    run(game, walk, 30);
    takeCp1(game);
    const saved = structuredClone(game.checkpoint?.trickle);
    expect(saved).not.toBeNull();
    game.trickle!.t = 42;
    game.trickle!.spent[0] += 5;
    const again = retryFromCheckpoint(game);
    expect(again.trickle).toEqual(saved);
  });

  test('a fallen trickle enemy is taken out after its keep without changing the script or the radar', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    game.armor = Number.MAX_SAFE_INTEGER;
    game.trickle!.t = 1e9;
    sleepScripted(game);
    const enemy = newEnemy('trickle-gone', TRICKLE_WAVE, TRICKLE_TUNE.kind, 0, 100);
    game.enemies.push(enemy);
    enemy.hp = 0;
    enemy.fallenT = TRICKLE_TUNE.fallenKeep;
    const radar = hudModel(game).radar;
    const cleared = [...game.script.cleared];
    step(game, idle, DT);
    expect(game.enemies.some(entry => entry.id === enemy.id)).toBe(false);
    expect(hudModel(game).radar).toEqual(radar);
    expect(game.script.cleared).toEqual(cleared);
    expect(game.script.cleared.includes(TRICKLE_WAVE)).toBe(false);
  });

  test('a game with the sectors off puts out no trickle', () => {
    seed(7);
    const game = newGame(M1B_HAND, M1, { sectors: false });
    step(game, idle, 0);
    sendToScript(game, { kind: 'skip' });
    game.mech.z = 160;
    for (const enemy of game.enemies) enemy.hp = 0;
    run(game, idle, 60 * 30);
    expect(game.trickle).toBeNull();
    expect(game.enemies.some(enemy => enemy.wave === TRICKLE_WAVE)).toBe(false);
  });
});
