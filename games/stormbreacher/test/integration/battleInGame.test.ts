// The battle layer in the game (SB-2200): the infantry's crowd and the battle's shells are GameModel's now, step moves
// them and the view only draws them. The front's sectors (SB-2210) decide the waiting line, and a suspend or a retry
// rebuilds the crowd at the line the sectors hold.
import { describe, expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1_SECTORS, SECTOR_TUNE, type SectorId } from '../../src/data/sectors.ts';
import {
  newGame,
  retryFromCheckpoint,
  sendToScript,
  step,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { seed } from '../../src/logic/rng.ts';
import { sectorHold } from '../../src/logic/sectors.ts';
import { restoreSuspend, suspendOf } from '../../src/logic/suspend.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;
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

function run(game: GameModel, frames: number): void {
  for (let i = 0; i < frames; i++) step(game, idle, DT);
}

function alive(game: GameModel) {
  return game.battle.crowd.soldiers.filter(soldier => soldier.alive);
}

function meanZ(game: GameModel): number {
  const soldiers = alive(game);
  return soldiers.reduce((sum, soldier) => sum + soldier.z, 0) / soldiers.length;
}

// Breaks both pillboxes, which is what takes cp1.
function takeCp1(game: GameModel): void {
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(entry => entry.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
}

// Suspends and resumes through JSON, as the storage does.
function resumed(game: GameModel): GameModel {
  const back = restoreSuspend(JSON.parse(JSON.stringify(suspendOf(game))));
  if (!back) throw new Error('the suspend was not read');
  return back;
}

// Takes every living enemy in the sector's z band down, and leaves the mech at the sector's sea-side edge.
function enterSector(game: GameModel, id: SectorId): void {
  const sector = M1_SECTORS.find(entry => entry.id === id);
  if (sector === undefined) throw new Error(`M1 has no ${id} sector`);
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.z < sector.landZ || enemy.z > sector.seaZ + SECTOR_TUNE.seaMargin) continue;
    enemy.hp = 0;
  }
  game.mech.z = sector.seaZ - SECTOR_TUNE.enterDepth - 1;
}

describe('the battle layer in the game', () => {
  test('the infantry walks from the sea to the hold line and waits', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    const holdZ = SECTOR_TUNE.startHoldZ;
    expect(game.sectors?.phase[0]).toBe('idle');
    expect(game.battle.crowd.holdZ).toBe(holdZ);
    const before = meanZ(game);
    const count = alive(game).length;
    run(game, 600);
    // +z is the sea: walking landward lowers z, and the held line stops them at the beach's hold.
    expect(meanZ(game)).toBeLessThan(before);
    expect(alive(game).every(soldier => soldier.z >= holdZ - 1e-9)).toBe(true);
    // no new wave comes in while the line is held
    expect(alive(game).length).toBeLessThanOrEqual(count);
  });

  test('a cleared sector moves the hold and sends one wave', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    const beach = M1_SECTORS[0];
    enterSector(game, 'beach');
    const before = game.battle.crowd.soldiers.length;
    step(game, idle, DT);
    expect(game.sectors?.phase[0]).toBe('advancing');
    expect(game.battle.crowd.holdZ).toBe(beach.holdZ);
    expect(game.battle.crowd.soldiers.length).toBe(before + SECTOR_TUNE.surge);
  });

  test('the infantry keeps walking while the mech is downed', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    game.downed = true;
    const before = meanZ(game);
    run(game, 60);
    expect(meanZ(game)).toBeLessThan(before);
  });

  test('the landing cutscene holds the infantry still', () => {
    seed(7);
    const game = newGame(M1B_HAND);
    step(game, idle, 0);
    expect(game.script.cutscene?.id).toBe('landing');
    const before = meanZ(game);
    const count = alive(game).length;
    run(game, 60);
    expect(meanZ(game)).toBe(before);
    expect(alive(game).length).toBe(count);
  });

  test('a suspend rebuilds the battle at the sector’s line', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    enterSector(game, 'beach');
    step(game, idle, DT);
    const back = resumed(game);
    expect(back.sectors).toEqual(game.sectors);
    expect(back.battle.crowd.holdZ).toBe(sectorHold(back.sectors).holdZ);
    expect(back.battle.crowd.holdZ).toBe(M1_SECTORS[0].holdZ);
  });

  test('a retry rebuilds the battle at the checkpoint’s sector', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    takeCp1(game);
    expect(game.checkpoint?.id).toBe('cp1');
    const again = retryFromCheckpoint(game);
    expect(again.battle.crowd.holdZ).toBe(sectorHold(again.sectors).holdZ);
  });
});
