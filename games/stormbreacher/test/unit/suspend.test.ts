import { describe, expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { blastPropIndexes } from '../../src/logic/blasts.ts';
import { newGame } from '../../src/logic/game.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import { buildNavGrid, newNav } from '../../src/logic/nav.ts';
import { SUSPEND_VERSION, restoreSuspend, suspendOf } from '../../src/logic/suspend.ts';

// The data as the storage hands it back: written to JSON and read again.
const stored = (data: unknown): unknown => JSON.parse(JSON.stringify(data));

describe('suspend', () => {
  test('the data names the map and mission by id and carries the version', () => {
    const data = suspendOf(newGame(M1B_HAND));
    expect(data.v).toBe(SUSPEND_VERSION);
    expect(data.map).toBe(M1B_HAND.id);
    expect(data.mission).toBe(M1.id);
    expect(data.checkpoint).toBeNull();
    expect('map' in data.game).toBe(false);
    expect('mission' in data.game).toBe(false);
  });

  test('the frame-only fields are not kept: events, bullets in flight, shells warned and the enemies’ nav', () => {
    const game = newGame(M1B_HAND);
    game.bullets.push({ enemy: 'grunt', x: 0, y: 1, z: 0, dx: 0, dy: 0, dz: 1, left: 10 });
    game.shells.push({ x: 1, z: 2, radius: 5, warn: 2, left: 1, damage: 10 });
    game.nav = { grid: buildNavGrid(game.rects, M1B_HAND.bounds, 0.75), field: null, since: 3 };
    const data = suspendOf(game);
    expect('events' in data.game).toBe(false);
    expect('bullets' in data.game).toBe(false);
    expect('shells' in data.game).toBe(false);
    expect('nav' in data.game).toBe(false);
    const back = restoreSuspend(stored(data));
    expect(back?.bullets).toEqual([]);
    expect(back?.shells).toEqual([]);
    expect(back?.events).toEqual([]);
    expect(back?.nav).toEqual(newNav()); // made again from the rects on the first frame with an enemy
  });

  test('read back, every other field is the same, and map and mission are the definitions themselves', () => {
    const game = newGame(M1B_HAND);
    game.time = 12.5;
    game.armor = 321;
    game.mech.x = 7;
    game.retries = 2;
    game.events = [];
    const back = restoreSuspend(stored(suspendOf(game)));
    expect(back).toEqual({ ...game, bullets: [], shells: [], events: [] });
    expect(back?.map).toBe(M1B_HAND);
    expect(back?.mission).toBe(M1);
  });

  test('the data is a deep copy: changing the game afterwards does not change it', () => {
    const game = newGame(M1B_HAND);
    const data = suspendOf(game);
    const before = JSON.stringify(data);
    game.mech.x += 50;
    game.targets[0].hp = 0;
    game.script.flags.push('x');
    expect(JSON.stringify(data)).toBe(before);
  });

  test('the game read back shares nothing with the data', () => {
    const data = stored(suspendOf(newGame(M1B_HAND)));
    const before = JSON.stringify(data);
    const back = restoreSuspend(data);
    if (!back) throw new Error('not read');
    back.mech.x += 50;
    back.targets[0].hp = 0;
    expect(JSON.stringify(data)).toBe(before);
  });

  test('the planted charges and the hold under way come back', () => {
    const game = newGame(M1B_HAND);
    game.charges.push({ blast: 'l1-b', left: 1.75 });
    game.plant = { blast: 'l1-a', hold: 0.5 };
    const back = restoreSuspend(stored(suspendOf(game)));
    expect(back?.charges).toEqual([{ blast: 'l1-b', left: 1.75 }]);
    expect(back?.plant).toEqual({ blast: 'l1-a', hold: 0.5 });
  });

  test('a blasted line comes back blasted and stays open', () => {
    const game = newGame(M1B_HAND);
    const point = game.blasts.find(blast => blast.id === 'l1-b');
    if (!point) throw new Error('the map has no l1-b');
    point.blasted = true;
    // what the game does to its own arrays when the blast opens the line
    const removed = new Set(blastPropIndexes(game.map, point));
    game.propRefs = game.propRefs.filter(index => !removed.has(index));
    const back = restoreSuspend(stored(suspendOf(game)));
    expect(back?.blasts.find(blast => blast.id === 'l1-b')?.blasted).toBe(true);
    expect(back?.propRefs.some(index => removed.has(index))).toBe(false);
    expect(back?.blasts.find(blast => blast.id === 'l1-a')?.blasted).toBe(false);
  });

  test('a nest’s burst under way comes back at the same shot', () => {
    const game = newGame(M1B_HAND);
    const nest = newEnemy('b-emplacements-1', 'b-emplacements', 'emplacement', 0, 140);
    nest.burstLeft = 3;
    nest.wait = 0.08;
    nest.awake = true;
    game.enemies.push(nest);
    const back = restoreSuspend(stored(suspendOf(game)));
    expect(back?.enemies[0]).toMatchObject({ kind: 'emplacement', burstLeft: 3, wait: 0.08 });
  });

  test('the aimed mortar’s anchor and stay come back', () => {
    const game = newGame(M1B_HAND);
    game.aimed = { anchor: { x: 12, z: 34 }, still: 1.75 };
    const back = restoreSuspend(stored(suspendOf(game)));
    expect(back?.aimed).toEqual({ anchor: { x: 12, z: 34 }, still: 1.75 });
  });

  test('a version that is not this one is thrown away', () => {
    const data = stored(suspendOf(newGame(M1B_HAND))) as Record<string, unknown>;
    expect(restoreSuspend({ ...data, v: SUSPEND_VERSION + 1 })).toBeNull();
    expect(restoreSuspend({ ...data, v: 6 })).toBeNull();
    expect(restoreSuspend({ ...data, v: 5 })).toBeNull();
    expect(restoreSuspend({ ...data, v: 4 })).toBeNull();
    expect(restoreSuspend({ ...data, v: 3 })).toBeNull();
    expect(restoreSuspend({ ...data, v: 0 })).toBeNull();
    const { v: _v, ...noVersion } = data;
    expect(restoreSuspend(noVersion)).toBeNull();
  });

  test('damaged data is thrown away and does not throw', () => {
    const good = stored(suspendOf(newGame(M1B_HAND))) as Record<string, unknown>;
    const game = good.game as Record<string, unknown>;
    const cases: unknown[] = [
      null,
      undefined,
      'text',
      42,
      [],
      {},
      { ...good, map: 'no-such-map' },
      { ...good, mission: 'no-such-mission' },
      { ...good, map: 'constructor' },
      { ...good, game: null },
      { ...good, game: { ...game, time: 'soon' } },
      { ...good, game: { ...game, mech: null } },
      { ...good, game: { ...game, enemies: {} } },
      { ...good, checkpoint: 'cp1' },
      { ...good, checkpoint: { id: 'cp1' } },
    ];
    for (const data of cases) expect(restoreSuspend(data)).toBeNull();
    const { retries: _retries, ...noRetries } = game;
    expect(restoreSuspend({ ...good, game: noRetries })).toBeNull();
  });
});
