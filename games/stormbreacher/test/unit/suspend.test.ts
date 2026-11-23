import { describe, expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { TARGET_SIZE, WRECK_SCALE_Y } from '../../src/data/props.ts';
import { WARDEN_TUNE } from '../../src/data/warden.ts';
import { newGame, targetRect } from '../../src/logic/game.ts';
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

  test('a blow under way is kept: its wait, lunge and clock come back the same', () => {
    const game = newGame(M1B_HAND);
    game.melee = {
      wait: 0.37,
      lunge: { dx: 0, dz: -1, left: 1.4, speed: 6 },
      blow: { t: 0.09, struck: false },
    };
    const back = restoreSuspend(stored(suspendOf(game)));
    expect(back?.melee).toEqual(game.melee);
    expect(back?.melee).not.toBe(game.melee);
  });

  test('a broken target saved before the wreck reached its rect comes back at the wreck height', () => {
    const game = newGame(M1B_HAND);
    const target = game.targets.find(entry => entry.id === 'pillbox-1');
    if (!target) throw new Error('the game has no pillbox-1');
    target.hp = 0;
    const rect = targetRect(game, 'pillbox-1');
    if (!rect) throw new Error('the game has no pillbox-1 rect');
    rect.top = TARGET_SIZE.pillbox.h; // an old save, whose rect kept the wall's height
    const back = restoreSuspend(stored(suspendOf(game)));
    if (!back) throw new Error('not read');
    expect(targetRect(back, 'pillbox-1')?.top).toBeCloseTo(TARGET_SIZE.pillbox.h * WRECK_SCALE_Y, 9);
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
    game.charges.push({ blast: 'l1-b', left: 1.75, total: 3 });
    game.plant = { blast: 'l1-a', hold: 0.5 };
    const back = restoreSuspend(stored(suspendOf(game)));
    expect(back?.charges).toEqual([{ blast: 'l1-b', left: 1.75, total: 3 }]);
    expect(back?.plant).toEqual({ blast: 'l1-a', hold: 0.5 });
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

  test('a dormant nest stays dormant and an awake one stays awake through a suspend', () => {
    const game = newGame(M1B_HAND);
    const asleep = newEnemy('b-emplacements-1', 'b-emplacements', 'emplacement', 0, 140, 0, true);
    const awake = newEnemy('b-emplacements-2', 'b-emplacements', 'emplacement', 0, 100, 0, true);
    awake.awake = true;
    awake.dormant = false;
    game.enemies.push(asleep, awake);
    const back = restoreSuspend(stored(suspendOf(game)));
    expect(back?.enemies[0]).toMatchObject({ awake: false, dormant: true });
    expect(back?.enemies[1]).toMatchObject({ awake: true, dormant: false });
  });

  test('a window of support fire, the milestone slowdown and lull, a late radio line, a pillbox’s quiet and a defender’s post come back the same', () => {
    const game = newGame(M1B_HAND);
    game.cover = { wave: 'b-emplacements', left: 5.25, wait: 0.05, next: 7, warned: true };
    game.slow = { left: 0.2, scale: 0.3 };
    game.calm = { left: 3.5, mul: 2.5 };
    game.pillboxHint = true;
    game.radioQueue.push({ line: 'm1.line2-hold', at: 12.5 }, { line: 'm1.pillboxes-down' });
    const pillbox = game.pillboxes[0];
    if (!pillbox) throw new Error('the map has no pillbox');
    pillbox.suppress = 1.75;
    const guard = newEnemy('b-guard-1', 'b-emplacements', 'grunt', 4, 60);
    guard.post = 3;
    guard.holdOut = true;
    guard.holdLeft = 1.25;
    guard.fallback = { x: 9, z: -15 };
    guard.fallbackHold = 2.5;
    guard.fallbackPost = 5;
    game.enemies.push(guard);

    const back = restoreSuspend(stored(suspendOf(game)));
    expect(back?.cover).toEqual(game.cover);
    expect(back?.slow).toEqual(game.slow);
    expect(back?.calm).toEqual(game.calm);
    expect(back?.pillboxHint).toBe(true);
    expect(back?.radioQueue).toEqual(game.radioQueue);
    expect(back?.pillboxes[0]?.suppress).toBe(1.75);
    expect(back?.enemies[back.enemies.length - 1]).toMatchObject({
      post: 3,
      holdOut: true,
      holdLeft: 1.25,
      fallback: { x: 9, z: -15 },
      fallbackHold: 2.5,
      fallbackPost: 5,
    });
    // and a second round trip changes nothing
    expect(back && JSON.stringify(suspendOf(back))).toBe(JSON.stringify(suspendOf(game)));
  });

  test('the mid boss comes back with its health and the once-only call, at the head of its phase', () => {
    const game = newGame(M1B_HAND);
    const warden = newEnemy('warden-1', 'warden', 'warden', 0, -118);
    if (!warden.warden) throw new Error('the warden has no state');
    warden.hp = 210;
    warden.warden.phase = 'charge';
    warden.warden.timer = 0.4;
    warden.warden.chargeLeft = 13;
    warden.warden.exposed = 0.4;
    warden.warden.mortarT = 3.5;
    warden.warden.called = true;
    game.enemies.push(warden);
    const back = restoreSuspend(stored(suspendOf(game)));
    // the burst, charge or volley under way is dropped with the shots in flight: it rests, then chooses again
    expect(back?.enemies[0]).toMatchObject({
      id: 'warden-1',
      hp: 210,
      warden: {
        phase: 'burst',
        burstLeft: 0,
        timer: WARDEN_TUNE.burstRest,
        chargeLeft: 0,
        exposed: 0,
        mortarT: WARDEN_TUNE.mortarEvery,
        called: true,
      },
    });
  });

  test('the aimed mortar’s anchor and stay come back', () => {
    const game = newGame(M1B_HAND);
    game.aimed = { anchor: { x: 12, z: 34 }, still: 1.75 };
    const back = restoreSuspend(stored(suspendOf(game)));
    expect(back?.aimed).toEqual({ anchor: { x: 12, z: 34 }, still: 1.75 });
  });

  test('the fortress nest’s burst under way comes back at the same shot', () => {
    const game = newGame(M1B_HAND);
    game.fortressGun = { wait: 0.08, burstLeft: 3 };
    const back = restoreSuspend(stored(suspendOf(game)));
    expect(back?.fortressGun).toEqual({ wait: 0.08, burstLeft: 3 });
  });

  test('the yard’s assist comes back with its waves and its wait', () => {
    const game = newGame(M1B_HAND);
    game.assist = { waves: ['yard-1', 'yard-3'], left: 3.5 };
    const back = restoreSuspend(stored(suspendOf(game)));
    expect(back?.assist).toEqual({ waves: ['yard-1', 'yard-3'], left: 3.5 });
    // a game that never got the cue has none
    expect(restoreSuspend(stored(suspendOf(newGame(M1B_HAND))))?.assist).toBeNull();
  });

  test('the radio queue comes back in the same order', () => {
    const game = newGame(M1B_HAND);
    game.radio = { line: 'm1.depot-hint', time: 1 };
    game.radioQueue.push({ line: 'm1.pillboxes-down' }, { line: 'm1.wave2-lost' });
    const back = restoreSuspend(stored(suspendOf(game)));
    expect(back?.radio).toEqual({ line: 'm1.depot-hint', time: 1 });
    expect(back?.radioQueue).toEqual([{ line: 'm1.pillboxes-down' }, { line: 'm1.wave2-lost' }]);
  });

  test('the losses come back, in the game and in a checkpoint', () => {
    const game = newGame(M1B_HAND);
    game.losses = { allies: 1, squads: 2 };
    const back = restoreSuspend(stored(suspendOf(game)));
    expect(back?.losses).toEqual({ allies: 1, squads: 2 });

    // a checkpoint keeps its own losses too
    game.checkpoint = { ...structuredClone({ ...game, id: 'cp1' }), map: M1B_HAND, mission: M1 };
    const withCheckpoint = restoreSuspend(stored(suspendOf(game)));
    expect(withCheckpoint?.checkpoint?.losses).toEqual({ allies: 1, squads: 2 });
  });

  test('the fortress blast’s lowered walls come back', () => {
    const game = newGame(M1B_HAND);
    game.brokenProps = [12, 13, 30];
    game.script.fortressDown = true;
    const back = restoreSuspend(stored(suspendOf(game)));
    expect(back?.brokenProps).toEqual([12, 13, 30]);
    expect(back?.script.fortressDown).toBe(true);
  });

  test('a version that is not this one is thrown away', () => {
    const data = stored(suspendOf(newGame(M1B_HAND))) as Record<string, unknown>;
    expect(restoreSuspend({ ...data, v: SUSPEND_VERSION + 1 })).toBeNull();
    expect(restoreSuspend({ ...data, v: SUSPEND_VERSION - 1 })).toBeNull();
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
    const { radioQueue: _radioQueue, ...noRadioQueue } = game;
    expect(restoreSuspend({ ...good, game: noRadioQueue })).toBeNull();
  });
});
