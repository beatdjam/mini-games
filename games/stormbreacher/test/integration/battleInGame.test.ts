// The battle layer in the game (SB-2200): the infantry's crowd and the battle's shells are GameModel's now, step moves
// them and the view only draws them. The front's sectors (SB-2210) decide the waiting line, and a suspend or a retry
// rebuilds the crowd at the line the sectors hold.
import { describe, expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1_SECTORS, SECTOR_TUNE, type SectorId } from '../../src/data/sectors.ts';
import { INFANTRY_TUNE } from '../../src/data/tune.ts';
import {
  newGame,
  retryFromCheckpoint,
  sendToScript,
  step,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import { type Soldier } from '../../src/logic/crowd.ts';
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
    enterSector(game, 'beach');
    const line1 = M1B_HAND.blasts?.find(point => point.id === 'l1-a')?.line ?? 0;
    const before = game.battle.crowd.soldiers.length;
    step(game, idle, DT);
    expect(game.sectors?.phase[0]).toBe('advancing');
    // line 1 still stands closed, so the hold stops seaward of it rather than at the beach's own line
    expect(game.battle.crowd.holdZ).toBe(line1 + SECTOR_TUNE.lineMargin);
    expect(game.battle.crowd.soldiers.length).toBe(before + SECTOR_TUNE.surge);
  });

  test('the infantry holds still while the mech is downed', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    game.downed = true;
    const before = meanZ(game);
    run(game, 60);
    expect(meanZ(game)).toBe(before);
    expect(game.events).toEqual([]);
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
    const line1 = M1B_HAND.blasts?.find(point => point.id === 'l1-a')?.line ?? 0;
    expect(back.sectors).toEqual(game.sectors);
    expect(back.battle.crowd.holdZ).toBe(sectorHold(back.sectors, back.script.blasts, M1B_HAND.blasts ?? []).holdZ);
    expect(back.battle.crowd.holdZ).toBe(line1 + SECTOR_TUNE.lineMargin);
  });

  test('a retry rebuilds the battle at the checkpoint’s sector', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    takeCp1(game);
    expect(game.checkpoint?.id).toBe('cp1');
    const again = retryFromCheckpoint(game);
    expect(again.battle.crowd.holdZ).toBe(sectorHold(again.sectors, again.script.blasts, M1B_HAND.blasts ?? []).holdZ);
  });

  // A game whose sectors are all stable, so the infantry walks landward past the water's edge with no line holding it.
  // The battle has one soldier and one awake grunt, and no new wave, shell or trickle to move the test.
  function infantryField(posted: boolean): { game: GameModel; soldier: Soldier } {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    game.trickle = null;
    if (game.sectors !== null) game.sectors.phase.fill('stable');
    game.battleTune = { ...game.battleTune, allyWaves: 0, allySpeed: 0.5, shellEvery: 0 };
    game.mech.x = 0;
    game.mech.y = 0;
    game.mech.z = 146;
    const soldier = game.battle.crowd.soldiers[0];
    game.battle.crowd.soldiers = [soldier];
    soldier.x = 0;
    soldier.z = posted ? 160 : 169;
    soldier.hp = INFANTRY_TUNE.hp;
    soldier.alive = true;
    soldier.waited = posted;
    soldier.post = posted ? { x: 0, z: 160 } : null;
    soldier.targetedT = 0;
    const grunt = newEnemy('grunt-test', 'test', 'grunt', 0, 155);
    grunt.awake = true;
    game.enemies = [grunt];
    return { game, soldier };
  }

  test('an enemy’s fire takes a walking soldier’s health away and puts it down, while the mech is still shot at', () => {
    const { game, soldier } = infantryField(false);
    const full = soldier.hp;
    const armor = game.armor;
    let hurt = false;
    let fell = false;
    let mechHurt = false;
    for (let frame = 0; frame < 60 * 40 && !fell; frame++) {
      step(game, idle, DT);
      if (soldier.hp < full) hurt = true;
      if (game.events.some(event => event.kind === 'battleFell' && event.by === 'fire')) fell = true;
      if (game.armor < armor) mechHurt = true;
    }
    expect(hurt).toBe(true);
    expect(soldier.alive).toBe(false);
    expect(fell).toBe(true);
    // the shots that go at the mech are still there
    expect(mechHurt).toBe(true);
  });

  test('a posted soldier near the same enemy loses less health in the same time', () => {
    // A run of its own each time: both start from the same seed, so the enemy's shots and rolls line up.
    function lostOver(posted: boolean): number {
      const { game, soldier } = infantryField(posted);
      const full = soldier.hp;
      for (let frame = 0; frame < 60 * 20; frame++) step(game, idle, DT);
      return full - soldier.hp;
    }
    const walkingLost = lostOver(false);
    const postedLost = lostOver(true);
    expect(walkingLost).toBeGreaterThan(0);
    expect(postedLost).toBeGreaterThan(0);
    expect(postedLost).toBeLessThan(walkingLost);
  });
});
