// The sectors in the sortie (SB-2210): the beach is cleared, the infantry moves up to its hold line and digs in; a
// suspend brings the sector's state and the waiting line back; a wiped-out crowd is made up from behind; and a game made
// with sectors off keeps the hold at the water's edge and says nothing about sectors.
import { describe, expect, test } from 'vitest';
import { FORTRESS_TUNE } from '../../src/data/fortress.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { PROP_SIZE } from '../../src/data/props.ts';
import { M1_SECTORS, SECTOR_TUNE, type SectorId } from '../../src/data/sectors.ts';
import {
  fortressBlast,
  newGame,
  restartGame,
  sendToScript,
  step,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { rectDistance, type GroundRect } from '../../src/logic/collide.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import { seed } from '../../src/logic/rng.ts';
import { arrivedSoldiers, sectorHold } from '../../src/logic/sectors.ts';
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

// Blows a line's point as the game does when its charge goes off: the script's record is what the hold reads.
function blowLine(game: GameModel, id: string): void {
  sendToScript(game, { kind: 'blast', id });
}

// The sectors cleared this frame, so a failed check shows which ones.
function clearedNow(game: GameModel): string[] {
  return game.events.flatMap(event => (event.kind === 'sectorCleared' ? [event.sector] : []));
}

function said(game: GameModel, line: string): boolean {
  return game.radio?.line === line || game.radioQueue.some(item => item.line === line);
}

describe('the sectors of M1', () => {
  test('the infantry waits before a closed line and pours in once the mech blows it open', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    const beach = M1_SECTORS[0];
    const line1 = M1B_HAND.blasts?.find(point => point.id === 'l1-a')?.line ?? 0;
    const waitZ = line1 + SECTOR_TUNE.lineMargin;
    enterSector(game, 'beach');
    const before = game.battle.crowd.soldiers.length;
    step(game, idle, DT);
    expect(game.sectors?.phase[0]).toBe('advancing');
    expect(game.events.some(event => event.kind === 'sectorCleared')).toBe(true);
    // line 1 is still closed: the hold is 6m seaward of it, and the radio says so after "move up".
    expect(game.battle.crowd.holdZ).toBe(waitZ);
    expect(game.battle.crowd.soldiers.length).toBe(before + SECTOR_TUNE.surge);
    expect(said(game, 'm1.sector-cleared')).toBe(true);
    expect(said(game, 'm1.sector-line-closed')).toBe(true);

    // The infantry walks to the closed line and waits there: it is not at the beach's hold, so the beach is not secured.
    // Armour set aside and the held line's loss off, so the test is about the walk and the wait.
    game.armor = Number.MAX_SAFE_INTEGER;
    game.battleTune = { ...game.battleTune, holdLossRate: 0, holdLossRamp: 0 };
    let secured = false;
    for (let frame = 0; frame < 60 * 20 && !secured; frame++) {
      step(game, idle, DT);
      secured = game.events.some(event => event.kind === 'sectorSecured');
    }
    expect(secured).toBe(false);
    expect(
      game.battle.crowd.soldiers.filter(soldier => soldier.alive).every(soldier => soldier.z >= waitZ - 1e-9),
    ).toBe(true);
    expect(game.sectors?.phase[0]).toBe('advancing');

    // A blast on line 1 opens it: the hold moves to the beach's own line, the infantry pours through, and the sector is
    // secured and counterattacked.
    blowLine(game, 'l1-a');
    step(game, idle, DT);
    expect(game.battle.crowd.holdZ).toBe(beach.holdZ);
    for (let frame = 0; frame < 60 * 60 && !secured; frame++) {
      step(game, idle, DT);
      secured = game.events.some(event => event.kind === 'sectorSecured');
    }
    expect(secured).toBe(true);
    expect(game.events.some(event => event.kind === 'sectorCounter')).toBe(true);
    expect(game.sectors?.phase[0]).toBe('counter');
  });

  test('the infantry at the beach hold line shoots an enemy inland', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    enterSector(game, 'beach');
    step(game, idle, DT);
    blowLine(game, 'l1-a');
    game.armor = Number.MAX_SAFE_INTEGER;
    let secured = false;
    for (let frame = 0; frame < 60 * 60 && !secured; frame++) {
      step(game, idle, DT);
      secured = game.events.some(event => event.kind === 'sectorSecured');
    }
    expect(secured).toBe(true);
    const holdZ = game.battle.crowd.holdZ;
    if (holdZ === null) throw new Error('the beach has no hold line');
    expect(arrivedSoldiers(game.battle.crowd, holdZ).length).toBeGreaterThan(0);

    // clear the field so the only enemy the test watches is its own, then put it 40 m inland of the hold line
    for (const enemy of game.enemies) enemy.hp = 0;
    const target = newEnemy('support-target', 'support', 'grunt', 0, holdZ - 40);
    target.awake = true;
    game.enemies.push(target);
    const full = target.hp;
    let hurt = false;
    let down = false;
    for (let frame = 0; frame < 60 * 30 && !down; frame++) {
      step(game, idle, DT);
      if (target.hp < full) hurt = true;
      down = target.hp <= 0;
    }
    expect(hurt).toBe(true);
    expect(down).toBe(true);
  });

  test('the secured beach is counterattacked, and becomes stable once its three are down', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    const beach = M1_SECTORS[0];
    enterSector(game, 'beach');
    step(game, idle, DT);
    blowLine(game, 'l1-a');
    game.armor = Number.MAX_SAFE_INTEGER;
    let countered = false;
    for (let frame = 0; frame < 60 * 60 && !countered; frame++) {
      step(game, idle, DT);
      countered = game.events.some(event => event.kind === 'sectorCounter');
    }
    expect(countered).toBe(true);
    expect(game.sectors?.phase[0]).toBe('counter');

    // one enemy every counterEvery, at the sector's land-side edge less counterBack
    const spawns: { x: number; z: number }[] = [];
    for (let frame = 0; frame < 60 * 10 && spawns.length < beach.counter; frame++) {
      step(game, idle, DT);
      for (const event of game.events) {
        if (event.kind === 'sectorSpawn') spawns.push({ x: event.x, z: event.z });
      }
    }
    expect(spawns).toHaveLength(beach.counter);
    const z = beach.landZ - SECTOR_TUNE.counterBack;
    for (const spawn of spawns) expect(spawn.z).toBeCloseTo(z);
    const counterEnemies = game.enemies.filter(enemy => enemy.wave === 'counter-beach');
    expect(counterEnemies).toHaveLength(beach.counter);
    expect(game.sectors?.counterIds[0]).toHaveLength(beach.counter);

    // with the counterattack still standing the sector is not stable; all down, it is
    expect(game.sectors?.phase[0]).toBe('counter');
    for (const enemy of counterEnemies) enemy.hp = 0;
    step(game, idle, DT);
    expect(game.events.some(event => event.kind === 'sectorStable' && event.sector === 'beach')).toBe(true);
    expect(game.sectors?.phase[0]).toBe('stable');
  });

  test('the sectors do not move while a cutscene plays, the mech is downed or the sortie is cleared', () => {
    for (const hold of ['cutscene', 'downed', 'cleared'] as const) {
      seed(7);
      const game = newPlayGame(M1B_HAND);
      enterSector(game, 'beach');
      if (hold === 'cutscene') game.script.cutscene = { id: 'beach-held', left: 1000 };
      else game[hold] = true;
      for (let frame = 0; frame < 60; frame++) step(game, idle, DT);
      expect(game.sectors?.phase[0], hold).toBe('idle');
      expect(
        game.events.some(event => event.kind === 'sectorCleared'),
        hold,
      ).toBe(false);
    }
  });

  test('a restart makes the sectors, the trickle, the support and the battle layer again, as a new game has them', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    enterSector(game, 'beach');
    step(game, idle, DT);
    expect(game.sectors?.phase[0]).toBe('advancing');
    const again = restartGame(game);
    expect(again.battle).not.toBe(game.battle);
    expect(again.sectors?.phase).toEqual(M1_SECTORS.map(() => 'idle'));
    expect(again.battle.crowd.holdZ).toBe(SECTOR_TUNE.startHoldZ);
    expect(again.trickle?.spent.every(spent => spent === 0)).toBe(true);
    expect(again.supportT).toBe(0);
  });

  test('a suspend brings the sectors and the waiting line back', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    enterSector(game, 'beach');
    step(game, idle, DT);
    const back = restoreSuspend(JSON.parse(JSON.stringify(suspendOf(game))));
    if (back === null) throw new Error('the suspend was not read');
    const line1 = M1B_HAND.blasts?.find(point => point.id === 'l1-a')?.line ?? 0;
    expect(back.sectors).toEqual(game.sectors);
    expect(back.battle.crowd.holdZ).toBe(line1 + SECTOR_TUNE.lineMargin);
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

// SB-2280: the front runs on past the pillbox line to the magazine, and the securing, the counterattack and the
// waiting line go on there too.
describe('the sectors past the pillbox line', () => {
  const CBAND = M1_SECTORS.find(entry => entry.id === 'cband')!;
  const YARD = M1_SECTORS.find(entry => entry.id === 'yard')!;

  // The fortress walls that stand before the blast (SB-2284): the sea wall and the two side walls. The land wall is
  // `collapse`, so the charge takes it away and it is not one of the walls the infantry walks round.
  function standingFortWalls(): GroundRect[] {
    const size = PROP_SIZE.fortWall;
    return M1B_HAND.props
      .filter(prop => prop.kind === 'fortWall' && prop.z !== FORTRESS_TUNE.landWallZ)
      .map(prop => ({
        x: prop.x,
        z: prop.z,
        halfW: (size.w * prop.scale) / 2,
        halfD: (size.d * prop.scale) / 2,
        yaw: prop.yaw,
      }));
  }

  // Puts every living soldier at a sector's hold line, walking (no post), so the sector is secured on the next frame.
  function lineAtHold(game: GameModel, holdZ: number): void {
    for (const soldier of game.battle.crowd.soldiers) {
      soldier.alive = true;
      soldier.post = null;
      soldier.z = holdZ;
    }
  }

  test('a new game has eleven sectors, all the enemy’s land', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    expect(game.sectors?.phase).toHaveLength(11);
    expect(game.sectors?.phase.every(phase => phase === 'idle')).toBe(true);
  });

  test('the cband is cleared and secured in the sortie, and its counterattack is called', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    // the sectors before it are behind the line, so cband is the front
    game.sectors!.phase.fill('stable');
    game.sectors!.phase[4] = 'idle';
    enterSector(game, 'cband');
    step(game, idle, DT);
    expect(game.sectors?.phase[4]).toBe('advancing');
    expect(said(game, 'm1.sector-cleared')).toBe(true);

    lineAtHold(game, CBAND.holdZ);
    game.radio = null;
    game.radioQueue.length = 0;
    step(game, idle, DT);
    expect(game.sectors?.phase[4]).toBe('counter');
    expect(said(game, 'm1.sector-secured')).toBe(true);
    expect(said(game, 'm1.sector-counter')).toBe(true);
  });

  // SB-2285: the cband's counterattack comes out of its spawn rectangles, in the open ground either side of the
  // fortress, not behind the seawall or in its yard.
  test('the cband’s counterattack comes out in its spawn zones, not in the fortress walls or its yard', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    const index = M1_SECTORS.findIndex(entry => entry.id === 'cband');
    game.sectors!.phase.fill('stable');
    game.sectors!.phase[index] = 'idle';
    enterSector(game, 'cband');
    step(game, idle, DT);
    expect(game.sectors?.phase[index]).toBe('advancing');
    lineAtHold(game, CBAND.holdZ);
    step(game, idle, DT);
    expect(game.sectors?.phase[index]).toBe('counter');

    const walls = standingFortWalls();
    expect(walls.length).toBeGreaterThan(0);
    const yard = {
      minX: -FORTRESS_TUNE.yardW / 2,
      maxX: FORTRESS_TUNE.yardW / 2,
      minZ: FORTRESS_TUNE.landWallZ + FORTRESS_TUNE.wallT / 2,
      maxZ: FORTRESS_TUNE.seaWallZ - FORTRESS_TUNE.wallT / 2,
    };
    const zones = CBAND.spawn ?? [];
    let seen = 0;
    for (let frame = 0; frame < 60 * 10 && seen < CBAND.counter; frame++) {
      const before = game.enemies.filter(enemy => enemy.wave === 'counter-cband').length;
      step(game, idle, DT);
      const fresh = game.enemies.filter(enemy => enemy.wave === 'counter-cband').slice(before);
      for (const enemy of fresh) {
        seen += 1;
        for (const wall of walls) {
          expect(rectDistance(wall, enemy.x, enemy.z), `${enemy.id} inside a wall`).toBeGreaterThan(0);
        }
        const inYard = enemy.x >= yard.minX && enemy.x <= yard.maxX && enemy.z >= yard.minZ && enemy.z <= yard.maxZ;
        expect(inYard, `${enemy.id} in the yard`).toBe(false);
        const inZone = zones.some(
          zone => enemy.x >= zone.minX && enemy.x <= zone.maxX && enemy.z >= zone.minZ && enemy.z <= zone.maxZ,
        );
        expect(inZone, `${enemy.id} outside its spawn zones`).toBe(true);
      }
    }
    expect(seen).toBe(CBAND.counter);
  });

  test('a later sector with no counterattack of its own says nothing about one', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    game.sectors!.phase.fill('stable');
    game.sectors!.phase[6] = 'advancing';
    lineAtHold(game, YARD.holdZ);
    game.radio = null;
    game.radioQueue.length = 0;
    step(game, idle, DT);
    expect(game.sectors?.phase[6]).toBe('counter');
    expect(said(game, 'm1.sector-secured')).toBe(true);
    expect(said(game, 'm1.sector-counter')).toBe(false);
    // the next frame it is stable, and the radio says so
    game.radio = null;
    game.radioQueue.length = 0;
    step(game, idle, DT);
    expect(game.sectors?.phase[6]).toBe('stable');
    expect(said(game, 'm1.sector-stable')).toBe(true);
  });

  test('the infantry’s hold line is the cband’s once it is cleared', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    game.sectors!.phase.fill('idle');
    for (let i = 0; i < 4; i++) game.sectors!.phase[i] = 'stable';
    game.sectors!.phase[4] = 'secured';
    const open = (M1B_HAND.blasts ?? []).filter(point => point.line !== null).map(point => point.id);
    expect(sectorHold(game.sectors, open, M1B_HAND.blasts ?? [])).toEqual({ holdZ: CBAND.holdZ, held: true });
  });

  test('a suspend keeps all eleven sectors', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    game.sectors!.phase.fill('stable');
    game.sectors!.phase[4] = 'advancing';
    game.sectors!.phase[10] = 'counter';
    game.sectors!.counterLeft[10] = 3;
    const back = restoreSuspend(JSON.parse(JSON.stringify(suspendOf(game))));
    if (back === null) throw new Error('the suspend was not read');
    expect(back.sectors).toEqual(game.sectors);
    expect(back.sectors?.phase).toHaveLength(11);
  });

  // SB-2283: the gate's gun, the plug's mid boss and the magazine's guns keep their sector from being cleared.
  test('the gate is cleared once its fortress gun is down and every enemy is out of it', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    const index = M1_SECTORS.findIndex(entry => entry.id === 'gate');
    game.sectors!.phase.fill('stable');
    game.sectors!.phase[index] = 'idle';
    enterSector(game, 'gate');
    step(game, idle, DT);
    expect(game.sectors?.phase[index]).toBe('idle');
    expect(clearedNow(game)).toEqual([]);

    const gun = game.targets.find(target => target.kind === 'fortressGun');
    if (gun === undefined) throw new Error('the map has no fortress gun');
    gun.hp = 0;
    enterSector(game, 'gate');
    step(game, idle, DT);
    expect(clearedNow(game)).toEqual(['gate']);
    expect(game.sectors?.phase[index]).toBe('advancing');
  });

  test('the plug is cleared once the warden is down, even before it has come out', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    const index = M1_SECTORS.findIndex(entry => entry.id === 'plug');
    game.sectors!.phase.fill('stable');
    game.sectors!.phase[index] = 'idle';
    enterSector(game, 'plug');
    step(game, idle, DT);
    expect(game.sectors?.phase[index]).toBe('idle');
    expect(game.script.wardenDown).toBe(false);

    game.script.wardenDown = true;
    enterSector(game, 'plug');
    step(game, idle, DT);
    expect(clearedNow(game)).toEqual(['plug']);
    expect(game.sectors?.phase[index]).toBe('advancing');
  });

  test('the magazine is cleared once its two main guns are down, not when the magazine itself breaks', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    const index = M1_SECTORS.findIndex(entry => entry.id === 'magazine');
    game.sectors!.phase.fill('stable');
    game.sectors!.phase[index] = 'idle';
    enterSector(game, 'magazine');
    step(game, idle, DT);
    expect(game.sectors?.phase[index]).toBe('idle');
    expect(clearedNow(game)).toEqual([]);

    for (const target of game.targets) {
      if (target.kind === 'gun') target.hp = 0;
    }
    const magazine = game.targets.find(target => target.kind === 'magazine');
    if (magazine === undefined) throw new Error('the map has no magazine');
    expect(magazine.hp).toBeGreaterThan(0);
    enterSector(game, 'magazine');
    step(game, idle, DT);
    expect(clearedNow(game)).toEqual(['magazine']);
    expect(game.sectors?.phase[index]).toBe('advancing');
  });

  // SB-2284: the yard's hold line stands behind the sea wall, so the infantry has to go through the sea gate, and it
  // never stands inside a wall on the way.
  test('the infantry goes through the sea gate without entering a wall, and the yard is secured', () => {
    seed(7);
    // A mission with no cues of its own: the yard's script waves would come out and take the test off the walls.
    const game = newPlayGame(M1B_HAND, { ...M1, cues: [], waves: [] });
    const index = M1_SECTORS.findIndex(entry => entry.id === 'yard');
    // the gate is behind the line, and the later sectors are still the enemy's: the yard is the front
    game.sectors!.phase.fill('idle');
    for (let i = 0; i < index; i++) game.sectors!.phase[i] = 'stable';
    game.script.flags.push('yard-1-clear', 'yard-2-clear', 'yard-3-clear');
    game.trickle = null;
    game.enemies = [];
    game.armor = Number.MAX_SAFE_INTEGER;
    game.battleTune = { ...game.battleTune, allyWaves: 0, shellEvery: 0 };
    // every defence line behind the yard is open, as it is when the mech has come this far
    for (const point of M1B_HAND.blasts ?? []) if (point.line !== null) blowLine(game, point.id);
    // the infantry is up at the open ground before the fortress, as the earlier sectors leave it
    game.battle.crowd.soldiers.forEach((soldier, i) => {
      soldier.alive = true;
      soldier.post = null;
      soldier.waited = false;
      soldier.x = -30 + (i % 16) * 4;
      soldier.z = -50 - Math.floor(i / 16) * 2;
    });
    enterSector(game, 'yard');
    step(game, idle, DT);
    expect(game.sectors?.phase[index]).toBe('advancing');
    expect(game.battle.crowd.holdZ).toBe(YARD.holdZ);

    const walls = standingFortWalls();
    expect(walls.length).toBeGreaterThan(0);
    let securedAt = 0;
    for (let frame = 0; frame < 60 * 60; frame++) {
      step(game, idle, DT);
      game.battle.crowd.soldiers.forEach((soldier, who) => {
        if (!soldier.alive) return;
        walls.forEach((wall, which) => {
          const at = `frame ${frame}, soldier ${who} at (${soldier.x.toFixed(1)}, ${soldier.z.toFixed(1)}), wall ${which}`;
          expect(rectDistance(wall, soldier.x, soldier.z), at).toBeGreaterThan(0);
        });
      });
      if (securedAt === 0 && game.events.some(event => event.kind === 'sectorSecured' && event.sector === 'yard')) {
        securedAt = frame + 1;
      }
    }
    expect(securedAt).toBeGreaterThan(0);
    expect(['counter', 'stable']).toContain(game.sectors?.phase[index]);
    // every posted soldier gets to its post inside the yard: none is left pressed against a wall on the way
    const posted = game.battle.crowd.soldiers.filter(soldier => soldier.alive && soldier.post !== null);
    expect(posted.length).toBeGreaterThan(0);
    for (const soldier of posted) {
      const post = soldier.post!;
      const at = `soldier at (${soldier.x.toFixed(1)}, ${soldier.z.toFixed(1)}), post (${post.x.toFixed(1)}, ${post.z.toFixed(1)})`;
      expect(Math.hypot(soldier.x - post.x, soldier.z - post.z), at).toBeLessThan(1);
    }
    // the gate costs the line some time, but it gets in well inside a minute
    expect(securedAt / 60).toBeLessThan(60);
  }, 20_000);

  test('once the blast takes the land wall down, the infantry walks through where it stood', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    game.sectors!.phase.fill('stable');
    game.trickle = null;
    game.enemies = [];
    game.armor = Number.MAX_SAFE_INTEGER;
    game.battleTune = { ...game.battleTune, allyWaves: 0, shellEvery: 0 };
    game.mech.z = 0;
    // one soldier just seaward of the land wall, posted on its far side
    const soldier = game.battle.crowd.soldiers[0];
    game.battle.crowd.soldiers = [soldier];
    soldier.alive = true;
    soldier.post = { x: -12, z: -140 };
    soldier.x = -12;
    soldier.z = -118;
    // the wall stands: it stops just before it
    for (let frame = 0; frame < 120; frame++) step(game, idle, DT);
    expect(soldier.z).toBeGreaterThan(-121.5);
    // the charge in the land wall blows: the land wall, the side walls and the door come out of the rects
    const bomb = game.blasts.find(blast => blast.id === 'fort-bomb');
    if (bomb === undefined) throw new Error('the map has no fort-bomb');
    const before = game.rects.length;
    fortressBlast(game, bomb);
    expect(game.rects.length).toBeLessThan(before);
    for (let frame = 0; frame < 60 * 10; frame++) step(game, idle, DT);
    expect(soldier.z).toBeLessThan(-131);
  });
});
