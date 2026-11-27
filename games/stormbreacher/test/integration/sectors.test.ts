// The sectors in the sortie (SB-2210): the beach is cleared, the infantry moves up to its hold line and digs in; a
// suspend brings the sector's state and the waiting line back; a wiped-out crowd is made up from behind; and a game made
// with sectors off keeps the hold at the water's edge and says nothing about sectors.
import { describe, expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { M1_SECTORS, SECTOR_TUNE, type SectorId } from '../../src/data/sectors.ts';
import { newGame, sendToScript, step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { seed } from '../../src/logic/rng.ts';
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

function alive(game: GameModel): number {
  return game.battle.crowd.soldiers.filter(soldier => soldier.alive).length;
}

// Takes every living enemy in the sector's z band down and leaves the mech just inside the sector.
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

describe('the sectors of M1', () => {
  test('a cleared sector moves the infantry up and they dig in', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    const beach = M1_SECTORS[0];
    enterSector(game, 'beach');
    const before = game.battle.crowd.soldiers.length;
    step(game, idle, DT);
    expect(game.sectors?.phase[0]).toBe('advancing');
    expect(game.events.some(event => event.kind === 'sectorCleared')).toBe(true);
    expect(game.battle.crowd.holdZ).toBe(beach.holdZ);
    expect(game.battle.crowd.soldiers.length).toBe(before + SECTOR_TUNE.surge);

    // the infantry walks in and enough of it reaches the line to secure the beach (armour set aside: this is about the walk)
    game.armor = Number.MAX_SAFE_INTEGER;
    let secured = false;
    for (let frame = 0; frame < 60 * 60 && !secured; frame++) {
      step(game, idle, DT);
      secured = game.events.some(event => event.kind === 'sectorSecured');
    }
    expect(secured).toBe(true);
    expect(game.sectors?.phase[0]).toBe('secured');
  });

  test('a suspend brings the sectors and the waiting line back', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    enterSector(game, 'beach');
    step(game, idle, DT);
    const back = restoreSuspend(JSON.parse(JSON.stringify(suspendOf(game))));
    if (back === null) throw new Error('the suspend was not read');
    expect(back.sectors).toEqual(game.sectors);
    expect(back.battle.crowd.holdZ).toBe(M1_SECTORS[0].holdZ);
  });

  test('a wiped-out crowd is made up from behind while the line is held', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    for (const soldier of game.battle.crowd.soldiers) soldier.alive = false;
    expect(alive(game)).toBe(0);
    step(game, idle, DT);
    expect(alive(game)).toBe(SECTOR_TUNE.refill);
  });

  test('a game with the sectors off keeps the hold at the water’s edge and says nothing', () => {
    seed(7);
    const game = newGame(M1B_HAND, M1, { sectors: false });
    step(game, idle, 0);
    sendToScript(game, { kind: 'skip' });
    game.mech.z = 160;
    for (const enemy of game.enemies) enemy.hp = 0;
    const kinds = new Set<string>();
    const lines = new Set<string>();
    for (let frame = 0; frame < 60 * 30; frame++) {
      step(game, idle, DT);
      for (const event of game.events) kinds.add(event.kind);
      if (game.radio !== null) lines.add(game.radio.line);
    }
    expect(game.sectors).toBeNull();
    expect(kinds.has('sectorCleared')).toBe(false);
    expect(kinds.has('sectorSecured')).toBe(false);
    expect([...lines].some(line => line.startsWith('m1.sector'))).toBe(false);
    expect(game.battle.crowd.holdZ).toBe(SECTOR_TUNE.startHoldZ);
  });
});
