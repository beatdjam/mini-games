// The front's trickle in the sortie (SB-2230): enemies come out of the overview camera's sight, the living infantry
// stays capped, a sector's budget runs out, a secured sector's budget is closed, and the state goes into a suspend and a
// checkpoint.
import { describe, expect, test } from 'vitest';
import { FORTRESS_TUNE } from '../../src/data/fortress.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { PROP_SIZE } from '../../src/data/props.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { M1_SECTORS, SECTOR_TUNE, WALL_SPAWN_TUNE } from '../../src/data/sectors.ts';
import { TRICKLE_TUNE, TRICKLE_WAVE } from '../../src/data/trickle.ts';
import { QUARTER_TUNE } from '../../src/data/tune.ts';
import { rectDistance, type GroundRect } from '../../src/logic/collide.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import {
  NAV_RADIUS,
  newGame,
  retryFromCheckpoint,
  sendToScript,
  step,
  syncGate,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { hudModel } from '../../src/logic/hud.ts';
import { buildNavField, buildNavGrid, navTarget } from '../../src/logic/nav.ts';
import { seed } from '../../src/logic/rng.ts';
import { restoreSuspend, suspendOf } from '../../src/logic/suspend.ts';
import { insideQuad, viewGround } from '../../src/logic/viewGround.ts';
import { clearInfantry, holdAlliesFire, newPlayGame } from './playGame.ts';

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

// Puts one sector in front with the mech in it, runs, and gives the places of the trickle's enemies as they come out.
// Each is taken down as soon as it is read, so the living cap never stands in the budget's way.
function trickleSpawns(
  game: GameModel,
  index: number,
  mechZ: number,
  frames: number,
): { x: number; z: number; y: number }[] {
  clearInfantry(game);
  sleepScripted(game);
  game.armor = Number.MAX_SAFE_INTEGER;
  game.mech.x = 0;
  game.mech.y = 0;
  game.mech.z = mechZ;
  game.sectors!.phase.fill('stable');
  game.sectors!.phase[index] = 'advancing';
  const seen = new Set<string>();
  const points: { x: number; z: number; y: number }[] = [];
  for (let frame = 0; frame < frames; frame++) {
    step(game, idle, DT);
    for (const enemy of game.enemies) {
      if (enemy.wave !== TRICKLE_WAVE || seen.has(enemy.id)) continue;
      seen.add(enemy.id);
      points.push({ x: enemy.x, z: enemy.z, y: enemy.y });
      enemy.hp = 0;
    }
  }
  return points;
}

// The points where the trickle came out: none inside a fortress wall, and every one walkable to from the mech.
function checkSpawnPoints(game: GameModel, points: readonly { x: number; z: number }[], label: string): void {
  // the fortress's wall pieces, taken from the map's props (not by the height of a rect, which other things share)
  const size = PROP_SIZE.fortWall;
  const walls: GroundRect[] = M1B_HAND.props
    .filter(prop => prop.kind === 'fortWall')
    .map(prop => ({
      x: prop.x,
      z: prop.z,
      halfW: (size.w * prop.scale) / 2,
      halfD: (size.d * prop.scale) / 2,
      yaw: prop.yaw,
    }));
  const grid = buildNavGrid(game.rects, game.map.bounds, NAV_RADIUS);
  const field = buildNavField(grid, game.mech.x, game.mech.z);
  for (const point of points) {
    expect(
      walls.some(wall => rectDistance(wall, point.x, point.z) === 0),
      `${label} wall`,
    ).toBe(false);
    expect(navTarget(field, point.x, point.z, game.mech.x, game.mech.z), `${label} reach`).not.toBeNull();
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
    // the budget is about the trickle: the infantry's support fire would shoot the eight down before the test reads them (SB-2240),
    // and so would the allies' fire now that it tells (SB-2301)
    clearInfantry(game);
    holdAlliesFire(game);
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

  // SB-2280: the latter half of the front has its own budgets too.
  test('the cband’s budget runs out, and then nothing more comes', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    const cband = M1_SECTORS.find(entry => entry.id === 'cband')!;
    const cbandIndex = M1_SECTORS.findIndex(entry => entry.id === 'cband');
    clearInfantry(game);
    game.armor = Number.MAX_SAFE_INTEGER;
    sleepScripted(game);
    // the sectors before the cband are behind the line, so it is the front and its budget is open
    game.sectors!.phase.fill('stable');
    game.sectors!.phase[cbandIndex] = 'advancing';
    for (let frame = 0; frame < 60 * 90; frame++) {
      step(game, idle, DT);
      // the spawned ones are taken down each frame, so the living cap does not stand in the budget's way
      for (const enemy of game.enemies) if (enemy.wave === TRICKLE_WAVE && enemy.hp > 0) enemy.hp = 0;
    }
    expect(game.trickle?.spent[cbandIndex]).toBe(cband.budget);
    const spent = game.trickle!.spent.reduce((sum, count) => sum + count, 0);
    run(game, idle, 60 * 20);
    expect(game.trickle!.spent.reduce((sum, count) => sum + count, 0)).toBe(spent);
  }, 30000);

  // SB-2304: the cband and gate come out on the sea wall's top, clear of the gate and the fortress nest.
  test('the cband and gate put their trickle out on the sea wall’s top', () => {
    for (const id of ['cband', 'gate']) {
      seed(7);
      const game = newPlayGame(M1B_HAND);
      const index = M1_SECTORS.findIndex(entry => entry.id === id);
      const sector = M1_SECTORS[index];
      const points = trickleSpawns(game, index, sector.holdZ, 60 * 90);
      expect(points.length, id).toBe(sector.budget);
      const zones = sector.spawn!;
      for (const point of points) {
        expect(point.y, id).toBe(FORTRESS_TUNE.wallH);
        expect(
          zones.some(
            zone => point.x >= zone.minX && point.x <= zone.maxX && point.z >= zone.minZ && point.z <= zone.maxZ,
          ),
          `${id} at ${point.x},${point.z}`,
        ).toBe(true);
        expect(Math.abs(point.x), `${id} at ${point.x} over the gate`).toBeGreaterThan(6);
        expect(point.x < 12 || point.x > 28, `${id} at ${point.x} in the nest`).toBe(true);
      }
    }
  }, 30000);

  // SB-2304: the enemy is seen on the wall first, then drops to the wall's seaward side, and never shows beyond the
  // fortress's sides (the old rectangles out at |x| 40..96 are gone).
  test('a cband trickle enemy perches on the wall’s top and drops to its seaward ground', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    const index = M1_SECTORS.findIndex(entry => entry.id === 'cband');
    const cband = M1_SECTORS[index];
    clearInfantry(game);
    holdAlliesFire(game);
    sleepScripted(game);
    game.armor = Number.MAX_SAFE_INTEGER;
    game.mech.x = 0;
    game.mech.y = 0;
    game.mech.z = cband.holdZ;
    game.sectors!.phase.fill('stable');
    game.sectors!.phase[index] = 'advancing';

    let watched: string | null = null;
    let start: { x: number; z: number } | null = null;
    let topFrames = 0;
    let landed: { x: number; z: number } | null = null;
    for (let frame = 0; frame < 60 * 10 && landed === null; frame++) {
      step(game, idle, DT);
      for (const enemy of game.enemies) {
        if (enemy.wave !== TRICKLE_WAVE || enemy.hp <= 0 || Math.abs(enemy.x) > 36) continue;
        if (watched === null) {
          watched = enemy.id;
          start = { x: enemy.x, z: enemy.z };
          expect(enemy.y, enemy.id).toBe(FORTRESS_TUNE.wallH);
        }
        if (enemy.id !== watched) continue;
        if (enemy.y === FORTRESS_TUNE.wallH) {
          topFrames++;
          // it stands still on the wall, not walking out over the edge while it waits
          expect(enemy.x).toBeCloseTo(start!.x, 6);
          expect(enemy.z).toBeCloseTo(start!.z, 6);
        } else if (enemy.y === 0) {
          landed = { x: enemy.x, z: enemy.z };
        }
      }
    }
    expect(watched).not.toBeNull();
    expect(topFrames / 60).toBeGreaterThanOrEqual(WALL_SPAWN_TUNE.perchSec - 0.05);
    expect(landed).not.toBeNull();
    // +z is the sea: the wall's seaward face is -68, and it lands past it
    expect(landed!.z).toBeGreaterThan(FORTRESS_TUNE.seaWallZ + FORTRESS_TUNE.wallT / 2);
    expect(Math.abs(landed!.x)).toBeLessThanOrEqual(36);
  }, 30000);

  // The yard is shut in by the walls: the zone lies inside them, and only points out of the view from the mech come out.
  // The mech stands at the sea gate, so the yard is mostly out of its view and the whole budget comes out (at the hold
  // line, z -85, the yard is in view and next to nothing does).
  test('the yard’s spawn zone stays inside the walls and within reach', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    // The yard is fought after the wall's nest falls, so its gate's shutter is up (SB-2300); the mech stands in the gate.
    const gun = game.targets.find(target => target.id === 'fortress-gun');
    if (!gun) throw new Error('the hand map has no fortress-gun');
    gun.hp = 0;
    syncGate(game);
    const index = M1_SECTORS.findIndex(entry => entry.id === 'yard');
    const sector = M1_SECTORS[index];
    const points = trickleSpawns(game, index, FORTRESS_TUNE.seaWallZ, 60 * 120);
    expect(points.length).toBeGreaterThan(0);
    expect(points.length).toBeLessThanOrEqual(sector.budget);
    checkSpawnPoints(game, points, 'yard');
  }, 30000);
});
