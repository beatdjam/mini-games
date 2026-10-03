import { expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { clamp, createRng, distXZ, el, pct, randi, shuffle } from '../src/core/util.ts';
import { clearStore, decodeStore, encodeStore, loadStore, prefGet, prefSet, saveStore } from '../src/core/store.ts';
import { addSystem, runSystems, stopFrame } from '../src/core/loop.ts';
import { WORLD, clearWorld, query, spawn, worldGroup } from '../src/core/world.ts';
import { LANG, fillData, lang, setI18nHook, setLang, t } from '../src/core/i18n.ts';
import { ANALYTICS, TRACK_LOG, track } from '../src/core/analytics.ts';
import { FEEDBACK, FEEDBACK_INFO_MAX, feedbackReady, feedbackUrl } from '../src/core/feedback.ts';
import { buildViewmodel } from '../src/render/render.ts';
import { burst, clearFx, fireball, parts, updateBalls } from '../src/render/fx.ts';
import {
  COVER_H,
  DECK_H,
  RISE,
  T,
  W,
  computeFlow,
  floorY,
  flow,
  flowAt,
  flowDir,
  grid,
  hasLOS,
  hgt,
  inBounds,
  isSolid,
  moveCircle,
  OPPOSITE_SIDE,
  passable,
  ramp,
  setTileWorld,
  SIDE_NX,
  SIDE_NZ,
  SIDE_PX,
  SIDE_PZ,
  SIDE_STEP,
  solidAt,
  tileCenter,
  tileCoord,
  tileIndex,
} from '../src/world/tiles.ts';
import { forEachRoomTile, generateArena, generateDungeon } from '../src/world/dungeon.ts';
import { tileMapFromRows } from '../src/world/tilemap.ts';
import {
  type Projectile,
  aimFan,
  clearPool,
  projHitsTerrain,
  ringAngles,
  steerToward,
  stepProjectile,
  takeFromPool,
} from '../src/world/projectiles.ts';
import { steerChase } from '../src/world/steer.ts';
import { banner, toast } from '../src/ui/ui.ts';
import { createHitDirs } from '../src/ui/hitdir.ts';
import { canCopyImage, openXPost, saveFile } from '../src/ui/share.ts';
import { SETTINGS, renderSettings } from '../src/ui/settings.ts';
import { drawTileMap } from '../src/ui/minimap.ts';
import { INPUT, fireHeld, keys, lookDelta, mouseFire, releaseInputs } from '../src/ui/input.ts';
import { TOUCH_LAYOUT, applyLayout, buttonLayout, layoutEditor, openLayoutEditor } from '../src/ui/touchlayout.ts';
// Engine tests (Vitest, in Chromium: npm test). The page elements the engine expects are made by engine/test/setup.ts.
// eq / near / ok keep the short messages the tests were written with
const eq = (a: unknown, b: unknown, what?: string) => expect(a, what).toBe(b);
const near = (a: number, b: number, eps = 1e-9, what?: string) =>
  expect(Math.abs(a - b), what ?? `expected ~${b}, got ${a}`).toBeLessThanOrEqual(eps);
const ok = (cond: unknown, what?: string) => expect(cond, what).toBeTruthy();

// ---------- core ----------
test('store: save codes round-trip, reject edits, other tags and cut-off codes', () => {
  const obj = { bits: 1234, name: 'テスト', list: [1, null, { a: true }] };
  const code = encodeStore('T1', obj);
  ok(/^T1:[A-Za-z0-9_-]+\.[0-9a-f]{8}$/.test(code), 'format ' + code);
  ok(!code.includes('bits'), 'not plain JSON');
  eq(JSON.stringify(decodeStore('T1', code)), JSON.stringify(obj), 'round trip');
  eq(
    JSON.stringify(decodeStore('T1', ' ' + code.slice(0, 10) + '\n' + code.slice(10) + ' ')),
    JSON.stringify(obj),
    'whitespace ignored',
  );
  const i = code.indexOf(':') + 5,
    edited = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
  eq(decodeStore('T1', edited), null, 'edited');
  eq(decodeStore('T2', code), null, 'other tag');
  eq(decodeStore('T1', code.slice(0, -3)), null, 'cut off');
  eq(decodeStore('T1', 'hello'), null, 'garbage');
});
test('analytics: track records the event and passes it to the GA tag when there is one', () => {
  const n = TRACK_LOG.length;
  track('test_event', { a: 1 });
  eq(TRACK_LOG.length, n + 1, 'recorded');
  eq(TRACK_LOG[TRACK_LOG.length - 1]!.name, 'test_event');
  const sent: unknown[][] = [];
  window.gtag = (...args: unknown[]) => {
    sent.push(args);
  };
  try {
    track('test_event2', { b: 'x' });
  } finally {
    delete window.gtag;
  }
  eq(sent.length, 1, 'gtag called');
  eq(sent[0]![0], 'event');
  eq(sent[0]![1], 'test_event2');
  ANALYTICS.game = 'g1';
  track('with_game', { a: 2 });
  ANALYTICS.game = '';
  eq(TRACK_LOG[TRACK_LOG.length - 1]!.params.game, 'g1', 'game id added');
  for (let k = 0; k < 60; k++) track('fill');
  eq(TRACK_LOG.length, 50, 'log keeps the last 50');
});
test('feedback: no form, no link; with one, the game, build and info are filled in', () => {
  eq(feedbackUrl('x', { url: '', game: '1', build: '2', info: '3' }), null, 'no form');
  ok(!feedbackReady({ url: '', game: '', build: '', info: '' }), 'not ready');
  const form = { url: 'https://docs.google.com/forms/d/e/abc/viewform', game: '11', build: '22', info: '33' };
  FEEDBACK.game = 'g1';
  const u = new URL(feedbackUrl('D3 BOSS & more', form)!);
  FEEDBACK.game = '';
  eq(u.origin + u.pathname, form.url, 'address');
  eq(u.searchParams.get('usp'), 'pp_url');
  eq(u.searchParams.get('entry.11'), 'g1', 'game');
  eq(u.searchParams.get('entry.22'), 'dev', 'build on the dev server');
  eq(u.searchParams.get('entry.33'), 'D3 BOSS & more', 'info');
  const long = new URL(feedbackUrl('a'.repeat(5000), form)!).searchParams.get('entry.33')!;
  eq(long.length, FEEDBACK_INFO_MAX, 'info cut');
  ok(long.endsWith('…'), 'cut is marked');
  ok(!new URL(feedbackUrl('', form)!).searchParams.has('entry.33'), 'empty info left out');
});
test('util: distXZ ignores y', () => {
  near(distXZ({ x: 1, z: 2 }, { x: 4, z: 6 }), 5);
  near(distXZ({ x: 0, z: 0, y: 9 } as { x: number; z: number }, { x: 0, z: 0 }), 0);
});
test('util: clamp / randi / shuffle', () => {
  eq(clamp(5, 0, 3), 3);
  eq(clamp(-1, 0, 3), 0);
  for (let k = 0; k < 50; k++) {
    const v = randi(2, 4);
    ok(v >= 2 && v <= 4 && Number.isInteger(v), 'randi range');
  }
  const a = [1, 2, 3, 4, 5];
  shuffle(a);
  eq(a.slice().sort().join(), '1,2,3,4,5', 'shuffle keeps items');
  eq(pct(0.256), '26%');
});

test('util: createRng repeats for the same seed and stays in range', () => {
  const a = createRng(42),
    b = createRng(42),
    c = createRng(43);
  const seqA = Array.from({ length: 50 }, () => a.next());
  const seqB = Array.from({ length: 50 }, () => b.next());
  eq(seqA.join(), seqB.join(), 'same seed, same numbers');
  ok(seqA.join() !== Array.from({ length: 50 }, () => c.next()).join(), 'another seed, other numbers');
  ok(
    seqA.every(x => x >= 0 && x < 1),
    'next is in [0, 1)',
  );
  const r = createRng(7);
  for (let k = 0; k < 200; k++) {
    const n = r.randi(2, 4);
    ok(n >= 2 && n <= 4 && Number.isInteger(n), 'randi stays in a..b: ' + n);
  }
  eq(r.shuffle([1, 2, 3, 4, 5]).sort().join(), '1,2,3,4,5', 'shuffle keeps items');
  eq(createRng(9).pick(['x']), 'x', 'pick from one');
});

test('store: saved values merge deeply over defaults', () => {
  const key = 'engine-test-store';
  saveStore(key, { a: 2, nested: { x: 9 }, list: [7] });
  const { data, raw } = loadStore(key, () => ({ a: 1, b: 5, nested: { x: 1, y: 2 }, list: [1, 2, 3] }));
  eq(data.a, 2);
  eq(data.b, 5, 'new default kept');
  eq(data.nested.x, 9);
  eq(data.nested.y, 2, 'nested default kept');
  eq(data.list.join(), '7', 'arrays are replaced');
  eq(raw!.a, 2);
  clearStore(key);
  eq(loadStore(key, () => ({ a: 1 })).raw, null, 'cleared');
  prefSet(key, 'v');
  eq(prefGet(key, 'd'), 'v');
  clearStore(key);
  eq(prefGet(key, 'd'), 'd');
});

test('store: a save cannot add properties to every object through __proto__', () => {
  const key = 'engine-test-proto';
  localStorage.setItem(key, '{"a":2,"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted2":1}}}');
  const { data } = loadStore(key, () => ({ a: 1 }));
  eq(data.a, 2);
  eq(({} as Record<string, unknown>).polluted, undefined, 'Object.prototype untouched');
  eq(({} as Record<string, unknown>).polluted2, undefined, 'Object.prototype untouched through constructor');
  clearStore(key);
});

test('i18n: placeholders, functions, ja fallback, data hook, static text', () => {
  LANG.ja = {
    name: '日本語',
    ui: { hello: 'こんにちは', n: '{n} 個', f: v => `f${v.a}`, only: 'ja だけ' },
    data: { thing: 'ja' },
  };
  LANG.en = { name: 'English', ui: { hello: 'hello', n: '{n} items', f: v => `F${v.a}` }, data: { thing: 'en' } };
  let got = null;
  setI18nHook((d: { thing: string }) => {
    got = d.thing;
  });
  setLang('en');
  eq(t('n', { n: 3 }), '3 items');
  eq(t('f', { a: 1 }), 'F1');
  eq(t('only'), 'ja だけ', 'falls back to ja');
  eq(got, 'en', 'game hook got the data');
  eq(document.querySelector('[data-i18n="hello"]')!.textContent, 'hello');
  setLang('xx');
  eq(lang, 'ja', 'unknown language -> ja');
  const target: { id: string; name?: string }[] = [{ id: 'a' }, { id: 'b' }];
  fillData(target, { b: { name: 'B' } });
  eq(target[1].name, 'B', 'fillData by id');
  setI18nHook(null);
});

test('loop: order, modes, stopFrame', () => {
  const log: string[] = [];
  const a = addSystem({ name: 't-b', order: 2, modes: ['m1'], update: () => log.push('b') });
  const b = addSystem({ name: 't-a', order: 1, update: () => log.push('a') });
  const c = addSystem({
    name: 't-c',
    order: 3,
    modes: ['m1'],
    update: () => {
      log.push('c');
      stopFrame();
    },
  });
  const d = addSystem({ name: 't-d', order: 4, update: () => log.push('d') });
  runSystems(0.016, 'm1');
  eq(log.join(''), 'abc', 'm1 runs a,b,c and c stops the frame');
  log.length = 0;
  runSystems(0.016, 'm2');
  eq(log.join(''), 'ad', 'm2 skips the m1-only systems');
  [a, b, c, d].forEach(s => {
    s.enabled = false;
  });
});

test('world: update, dead, onRemove, query, groups, spawn during a pass', () => {
  const log: string[] = [];
  const g = worldGroup('t-early', 5);
  const late = spawn({
    tag: 't-late',
    update() {
      log.push('late');
    },
  });
  spawn({
    tag: 't-early',
    n: 0,
    kid: false,
    update() {
      log.push('early');
      if (!this.kid) {
        this.kid = true;
        spawn({
          tag: 't-early',
          update() {
            log.push('kid');
          },
        });
      }
    },
  });
  runSystems(0.016, 'any');
  eq(
    log.slice(0, 3).join(),
    'early,kid,late',
    'group order 5 before the default 30; a spawned object runs in the same pass',
  );
  eq(query('t-early').length, 2);
  eq(g.list, WORLD.groups['t-early'].list, 'group list is stable');
  let removed = false;
  late.onRemove = () => {
    removed = true;
  };
  late.dead = true;
  runSystems(0.016, 'any');
  ok(removed, 'onRemove ran');
  eq(query('t-late').length, 0);
  clearWorld('t-early');
  eq(g.list.length, 0, 'clearWorld');
  g.system.enabled = false;
});

// ---------- world: tiles, projectiles, steering ----------
// a 6x3 tile room: row 1 is walkable; tile (4,1) is a raised step 2 m up; everything else is wall
export function tinyWorld() {
  const w = 6,
    h = 3;
  setTileWorld({
    W: w,
    H: h,
    grid: new Uint8Array(w * h),
    hgt: new Float32Array(w * h),
    ramp: new Int8Array(w * h).fill(-1),
    cover: new Uint8Array(w * h),
    flow: new Int32Array(w * h),
    flowQ: new Int32Array(w * h),
  });
  for (let i = 0; i < 5; i++) grid[W + i] = 1;
  hgt[W + 4] = 2;
}
test('tiles: tileIndex is the grid index of the tile holding a world point', () => {
  tinyWorld();
  eq(tileIndex(0.5 * T, 0.5 * T), 0);
  eq(tileIndex(2.5 * T, 1.5 * T), W + 2);
  eq(tileIndex(4.99 * T, 2.01 * T), 2 * W + 4);
});
test('tiles: tileCoord, inBounds and tileCenter', () => {
  tinyWorld();
  eq(tileCoord(0), 0);
  eq(tileCoord(T - 0.01), 0);
  eq(tileCoord(T), 1);
  eq(tileCoord(2.5 * T), 2);
  eq(tileCoord(-0.01), -1, 'floors toward -infinity');
  ok(inBounds(0, 0) && inBounds(W - 1, 2), 'corners are inside');
  ok(!inBounds(-1, 0) && !inBounds(0, -1), 'negative is outside');
  ok(!inBounds(W, 0) && !inBounds(0, 3), 'W and H themselves are outside');
  eq(tileCenter(0), T / 2);
  eq(tileCenter(3), 3.5 * T);
  eq(tileCoord(tileCenter(4)), 4, 'the centre is inside its own tile');
});
test('tiles: side numbers match the ramp directions, steps and opposites', () => {
  eq(JSON.stringify([SIDE_PX, SIDE_NX, SIDE_PZ, SIDE_NZ]), '[0,1,2,3]');
  eq(JSON.stringify(SIDE_STEP), '[[1,0],[-1,0],[0,1],[0,-1]]');
  for (let sd = 0; sd < 4; sd++) {
    const [a, b] = SIDE_STEP[sd],
      [oa, ob] = SIDE_STEP[OPPOSITE_SIDE[sd]];
    eq(OPPOSITE_SIDE[OPPOSITE_SIDE[sd]], sd, 'opposite of the opposite');
    ok(oa === -a && ob === -b, 'the opposite side steps back');
  }
});
test('tiles: floor height, ramps, walls and steps block, line of sight', () => {
  tinyWorld();
  eq(floorY(1.5 * T, 1.5 * T), 0);
  eq(floorY(4.5 * T, 1.5 * T), 2, 'raised tile');
  ramp[W + 3] = 0;
  near(floorY(3.5 * T, 1.5 * T), RISE / 2, 1e-6, 'halfway up a +x ramp');
  ramp[W + 3] = -1;
  ok(solidAt(1.5 * T, 0.5 * T), 'row 0 is wall');
  const o = { x: 1.5 * T, z: 1.5 * T, fy: 0 };
  for (let k = 0; k < 100; k++) moveCircle(o, 0.2, 0, 0.4);
  ok(o.x < 4 * T, 'a 2 m step blocks walking (limit STEP)');
  const hitWall = moveCircle(o, 0, -10, 0.4);
  ok(hitWall, 'walls block');
  ok(hasLOS(0.5 * T, 1.5 * T, 3.5 * T, 1.5 * T), 'clear along the row');
  ok(hasLOS(0.5 * T, 1.5 * T, 3.5 * T, 1.5 * T, 0.5, 0.5), 'a low sight line over a flat floor is clear');
  ok(!hasLOS(0.5 * T, 1.5 * T, 5.5 * T, 1.5 * T, 1, 1), 'the raised tile blocks a low sight line');
});

test('tiles: flow field leads to the target around the step', () => {
  tinyWorld();
  computeFlow(0, 1);
  eq(flowAt(0.5 * T, 1.5 * T), 0, 'target tile is 0');
  eq(flowAt(3.5 * T, 1.5 * T), 3);
  const d = flowDir(3.5 * T, 1.5 * T);
  ok(d && d[0] < -0.9, 'heads toward -x');
  eq(flowAt(4.5 * T, 1.5 * T), 4, 'dropping down the 2 m step is allowed');
  computeFlow(4, 1);
  eq(flowAt(3.5 * T, 1.5 * T), -1, 'climbing it is not (more than STEP)');
});
test('dungeon: the same seed gives the same rooms, joined by walkable ground, features in place', () => {
  const opts = { map: 40, roomMin: 6, roomMax: 8, platform: 1, rubble: 0.1, bridges: 2 };
  for (const seed of [1, 7, 99]) {
    const d = generateDungeon(opts, createRng(seed)),
      again = generateDungeon(opts, createRng(seed)),
      M = d.maps;
    eq(JSON.stringify(d.rooms), JSON.stringify(again.rooms), 'rooms repeat');
    eq(Array.from(M.hgt).join(), Array.from(again.maps.hgt).join(), 'heights repeat');
    ok(d.rooms.length >= 2 && d.rooms.every(r => r.x >= 1 && r.y >= 1 && r.x + r.w < d.W && r.y + r.h < d.H), 'rooms');
    for (let k = 0; k < d.W * d.H; k++) {
      if (M.hgt[k] > 0 || M.ramp[k] >= 0 || M.cover[k]) ok(M.grid[k] === 1, 'features stand on floor');
      if (M.cover[k]) near(M.hgt[k], COVER_H, 1e-6, 'cover height');
      else if (M.hgt[k] > 0) eq(M.hgt[k], DECK_H, 'deck height');
    }
    ok(d.rooms.some(r => r.plat) && M.ramp.some(r => r >= 0), 'a deck with its ramp');
    setTileWorld({ W: d.W, H: d.H, grid: M.grid, hgt: M.hgt, ramp: M.ramp, cover: M.cover });
    setTileWorld({ flow: new Int16Array(d.W * d.H), flowQ: new Int32Array(d.W * d.H) });
    const c = (r: { x: number; y: number; w: number; h: number }) => [
      Math.floor(r.x + r.w / 2),
      Math.floor(r.y + r.h / 2),
    ];
    computeFlow(c(d.rooms[0])[0], c(d.rooms[0])[1]);
    d.rooms.forEach(r => ok(flow[c(r)[1] * d.W + c(r)[0]] >= 0, 'every room reaches the first'));
  }
  eq(
    generateDungeon({ deckH: 3, coverH: 1, platform: 1, rubble: 0.2 }, createRng(5)).maps.hgt.some(h => h === 3),
    true,
    'deckH option',
  );
});
test('dungeon: an arena is a floor square with the pillars as walls', () => {
  const a = generateArena(20, 4, 16, [[6, 6]]);
  eq(a.W, 20);
  eq(
    a.maps.grid.reduce((n, v) => n + v, 0),
    12 * 12 - 1,
    'floor minus one pillar',
  );
  eq(a.maps.grid[6 * 20 + 6], 0, 'pillar');
  eq(JSON.stringify(a.rooms), JSON.stringify([{ x: 4, y: 4, w: 12, h: 12 }]));
});
test('dungeon: forEachRoomTile visits every tile of a room once, row by row', () => {
  const seen: string[] = [];
  forEachRoomTile({ x: 2, y: 5, w: 3, h: 2 }, (i, j) => seen.push(i + ',' + j));
  eq(seen.join(' '), '2,5 3,5 4,5 2,6 3,6 4,6');
});
test('tilemap: rows become the tile maps, rooms from letters or a list, errors on bad rows', () => {
  const rows = ['########', '#A.>==.#', '#A.>==c#', '########'];
  const m = tileMapFromRows(rows);
  eq(m.W, 8);
  eq(m.H, 4);
  const at = (i: number, j: number) => j * m.W + i;
  eq(m.maps.grid[at(0, 0)], 0, 'wall');
  eq(m.maps.grid[at(2, 1)], 1, 'floor');
  eq(m.maps.hgt[at(4, 1)], DECK_H, 'deck');
  eq(m.maps.ramp[at(3, 1)], 0, 'ramp rises toward +x');
  eq(m.maps.ramp[at(4, 1)], -1, 'no ramp on a deck');
  eq(m.maps.cover[at(6, 2)], 1, 'cover');
  near(m.maps.hgt[at(6, 2)], COVER_H, 1e-6, 'cover height');
  eq(JSON.stringify(m.rooms), JSON.stringify([{ x: 1, y: 1, w: 1, h: 2 }]), 'room from letters');
  eq(m.maps.roomOf[at(1, 2)], 0, 'roomOf');
  eq(m.maps.roomOf[at(2, 1)], -1, 'roomOf outside');
  const listed = tileMapFromRows(rows, {}, [{ x: 2, y: 1, w: 2, h: 2 }]);
  eq(listed.maps.roomOf[at(3, 2)], 0, 'roomOf from a given list');
  eq(listed.maps.roomOf[at(1, 1)], -1, 'letters do not count when a list is given');
  const own = tileMapFromRows(['XYx'], { wall: 'X', floor: 'Y', deck: 'x' });
  eq(own.maps.grid.join(), '0,1,1', 'custom legend');
  eq(own.maps.hgt[2], DECK_H);
  const dirs = tileMapFromRows(['.>', '<v', '^.']);
  eq(dirs.maps.ramp.join(), '-1,0,1,2,3,-1', 'ramp sides 0:+x 1:-x 2:+z 3:-z');
  expect(() => tileMapFromRows(['##', '#'])).toThrow();
  expect(() => tileMapFromRows(['#?'])).toThrow();
  expect(() => tileMapFromRows(['#B'])).toThrow();

  setTileWorld({
    W: m.W,
    H: m.H,
    grid: m.maps.grid,
    hgt: m.maps.hgt,
    ramp: m.maps.ramp,
    cover: m.maps.cover,
    flow: new Int16Array(m.W * m.H),
    flowQ: new Int32Array(m.W * m.H),
  });
  ok(isSolid(0, 0) && !isSolid(2, 1) && isSolid(-1, 1) && isSolid(8, 1), 'isSolid');
  eq(floorY(4.5 * T, 1.5 * T), DECK_H, 'floorY on the deck');
  near(floorY(3.5 * T, 1.5 * T), RISE / 2, 1e-9, 'floorY halfway up the ramp');
  ok(passable(at(2, 1), at(3, 1), 0), 'floor to ramp');
  ok(passable(at(3, 1), at(4, 1), 0), 'ramp to deck');
  ok(passable(at(4, 1), at(3, 1), 1), 'deck back down the ramp');
  ok(!passable(at(6, 1), at(5, 1), 1), 'deck edge blocked from below');
  ok(passable(at(5, 1), at(6, 1), 0), 'stepping off the deck');
  const walker = { x: 2.5 * T, z: 1.5 * T, fy: 0 };
  for (let t = 0; t < 110; t++) {
    moveCircle(walker, 0.1, 0, 0.4);
    walker.fy = floorY(walker.x, walker.z);
  }
  ok(walker.x > 5 * T && walker.fy === DECK_H, 'walked up the ramp onto the deck');
  for (let t = 0; t < 40; t++) moveCircle(walker, 0.1, 0, 0.4);
  ok(walker.x > 6 * T, 'and off its far edge');
  const below = { x: 6.5 * T, z: 1.5 * T, fy: 0 };
  for (let t = 0; t < 40; t++) moveCircle(below, -0.1, 0, 0.4);
  ok(below.x >= 6 * T, 'blocked by the deck edge from below');
});

test('projectiles: pool, sub-steps, terrain, homing, patterns', () => {
  tinyWorld();
  const pool: Projectile[] = [],
    geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const b = takeFromPool(pool, geo, 2)!;
  b.alive = true;
  ok(takeFromPool(pool, geo, 2) !== b, 'second slot');
  pool[1].alive = true;
  eq(takeFromPool(pool, geo, 2), null, 'pool full');
  const r1 = takeFromPool(pool, geo, 2, true),
    r2 = takeFromPool(pool, geo, 2, true);
  eq(r1, b, 'full + recycle: the one handed out first');
  eq(r2, pool[1], 'then the next oldest, not the one just reused');
  Object.assign(b, { x: 0.5 * T, y: 1, z: 1.5 * T, vx: 30, vy: 0, vz: 0 });
  let steps = 0;
  stepProjectile(b, 0.1, 0.5, () => {
    steps++;
    return false;
  });
  eq(steps, 6, '3 m in 0.5 m steps');
  near(b.x, 0.5 * T + 3, 1e-9);
  let hit: number | null = null;
  stepProjectile(b, 1, 0.5, p => {
    if (projHitsTerrain(p, 10, 0.03)) {
      hit = p.x;
      return true;
    }
    return false;
  });
  ok(hit !== null && hit >= 4 * T - 0.5 && hit <= 4 * T + 0.5, 'stops at the raised tile ' + hit);
  clearPool(pool);
  ok(!pool[0].alive && !pool[1].alive, 'clearPool');
  const h = { x: 0, y: 0, z: 0, vx: 5, vy: 0, vz: 0, speed: 5 };
  for (let k = 0; k < 200; k++) steerToward(h as unknown as Projectile, 0, 0, 10, 0.05, 2.2);
  ok(h.vz > 4.9 && Math.abs(h.vx) < 0.1, 'turned toward +z');
  eq(ringAngles(4, 0).length, 4);
  near(ringAngles(4, 0)[1], Math.PI / 2);
  const fan = aimFan(0, 0, 0, 0, 0, 10, 3, 0.2, 0);
  eq(fan.length, 3);
  near(fan[1][2], 1, 1e-9, 'middle bullet aims straight');
  fan.forEach(v => near(Math.hypot(v[0], v[1], v[2]), 1, 1e-9, 'unit'));
});

test('steer: chase in sight, circle when close, push apart', () => {
  tinyWorld();
  const e = { x: 1.5 * T, z: 1.5 * T, r: 0.5, fy: 0, side: 1 };
  steerChase(e, 0.1, 8, 0, 8, true, 4, 0, [], null);
  ok(e.x > 1.5 * T, 'moved toward the target');
  const f = { x: 2 * T, z: 1.5 * T, r: 0.5, fy: 0, side: 1 },
    g2 = { x: 2 * T + 0.3, z: 1.5 * T, r: 0.5 };
  steerChase(f, 0.1, 0, 0.001, 0.001, true, 4, 0, [g2], null);
  ok(f.x < 2 * T, 'pushed away from a neighbour');
});

// ---------- render / ui ----------
test('render: viewmodel from parts, fx', () => {
  const g = buildViewmodel(
    {
      tip: [0, 0, -1],
      pos: [0.3, -0.3, -0.5],
      flash: 0.1,
      parts: [
        ['box', 0.1, 0.1, 0.5, 'a', 0, 0, 0],
        ['cyl', 0.05, 0.4, 'b', 0, 0, -0.3],
      ],
    },
    { a: 0x333333, b: 0xff0000 },
    ['b'],
  );
  eq(g.children.length, 4, '2 parts + tip + flash');
  near(g.userData.tip.position.z, -1);
  ok(!g.userData.flash.visible);
  burst(0, 1, 0, 0xffffff, 5, 3, 0.5);
  ok(parts.filter(p => p.life > 0).length >= 5, 'particles alive');
  fireball(0, 1, 0, 3, 0xff0000);
  updateBalls(0.6);
  clearFx();
  ok(
    parts.every(p => p.life <= 0),
    'clearFx',
  );
});

test('touchlayout: place, edit, reset', () => {
  let saved = 0,
    closed: string | undefined;
  const edits: Record<string, { x: number; y: number; s: number }> = {};
  Object.assign(TOUCH_LAYOUT, {
    defs: {
      fire: { x: 0.9, y: 0.8, s: 1, b: 80, name: 'fire' },
      fire2: { x: 0.2, y: 0.5, s: 1, b: 60, name: 'fire2' },
    },
    first: 'fire',
    edits: () => edits,
    reset: () => {
      for (const k in edits) delete edits[k];
    },
    save: () => {
      saved++;
    },
    onClose: (from?: string) => {
      closed = from;
    },
  });
  applyLayout();
  eq(document.querySelector<HTMLElement>('[data-lb="fire"]')!.style.width, '80px');
  openLayoutEditor('here');
  ok(layoutEditor.open && !el('#layoutBar').hidden, 'editor open');
  document.querySelector<HTMLElement>('[data-lbact="plus"]')!.click();
  near(buttonLayout('fire').s, 1.1, 1e-9, 'bigger');
  document.querySelector<HTMLElement>('[data-lbact="reset"]')!.click();
  eq(buttonLayout('fire').s, 1, 'reset');
  document.querySelector<HTMLElement>('[data-lbact="done"]')!.click();
  eq(closed, 'here');
  ok(saved > 0, 'saved');
});

test('ui / input: toast, keys, INPUT hooks', () => {
  toast('hi', 50);
  eq(el('#toast').textContent, 'hi');
  let key: string | null = null;
  INPUT.key = e => {
    key = e.code;
  };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));
  ok(keys.KeyZ, 'held');
  eq(key, 'KeyZ', 'INPUT.key called');
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ' }));
  ok(!keys.KeyZ, 'released');
  let looked: number[] = [];
  INPUT.look = (dx, dy) => {
    looked = [dx, dy];
  };
  lookDelta(10, 0, 0.01);
  near(looked[0], 0.1);
  releaseInputs();
  ok(!fireHeld && !mouseFire);
});
test('ui: a second banner stays its full time instead of going out with the first', () => {
  vi.useFakeTimers();
  try {
    const b = el('#banner');
    banner('A', 'first');
    vi.advanceTimersByTime(1500);
    banner('B', 'second');
    vi.advanceTimersByTime(1000); // the first banner's 2 s are up
    ok(b.classList.contains('on'), 'still showing');
    eq(el('#bannerCode').textContent, 'B');
    vi.advanceTimersByTime(1000);
    ok(!b.classList.contains('on'), 'gone after its own 2 s');
  } finally {
    vi.useRealTimers();
  }
});
test('hitdir: an arc shows for a hit from behind, not from in front, and fades out', () => {
  const box = document.createElement('div');
  const cam = new THREE.PerspectiveCamera(70, 16 / 9);
  const hd = createHitDirs({ container: box, view: () => ({ x: 0, z: 0, yaw: 0 }), camera: cam, time: 0.6 });
  hd.show(0, -8); // yaw 0 faces -z: straight ahead
  eq(hd.list.length, 0, 'no arc in front');
  hd.show(2, 8);
  eq(hd.list.length, 1, 'arc behind');
  eq(box.children.length, 1);
  hd.update(0.3);
  near(Number(hd.list[0].el.style.opacity), 0.5);
  hd.update(0.4);
  eq(hd.list[0].el.style.opacity, '0', 'faded out');
  hd.show(-2, 8);
  eq(hd.list.length, 1, 'the free arc is reused');
  ok(hd.list[0].t > 0);
});
test('share: X post URL, saving an image, clipboard support', () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  openXPost('a b #x');
  expect(open).toHaveBeenCalledWith('https://twitter.com/intent/tweet?text=a%20b%20%23x', '_blank', 'noopener');
  open.mockRestore();
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    eq(this.download, 'card.png');
  });
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => {};
  saveFile(new Blob(['x'], { type: 'image/png' }), 'card.png');
  expect(click).toHaveBeenCalledTimes(1);
  click.mockRestore();
  eq(typeof canCopyImage(), 'boolean');
});

test('settings: every panel shows the items, a click or a slider changes them everywhere', () => {
  const st = { on: false, mode: 'a', vol: 0.5 };
  const changed: string[] = [];
  let pressed = 0;
  const keep = { items: SETTINGS.items, onChange: SETTINGS.onChange };
  SETTINGS.items = [
    { kind: 'toggle', key: 'on', label: () => 'On', get: () => st.on, set: v => (st.on = v) },
    {
      kind: 'choice',
      key: 'mode',
      label: () => 'Mode',
      options: [
        { value: 'a', label: () => 'A' },
        { value: 'b', label: () => 'B' },
      ],
      get: () => st.mode,
      set: v => (st.mode = v),
    },
    {
      kind: 'range',
      key: 'vol',
      label: () => 'Vol',
      min: 0,
      max: 1,
      step: 0.1,
      get: () => st.vol,
      set: v => (st.vol = v),
      format: v => v.toFixed(1),
    },
    { kind: 'button', key: 'go', label: () => 'Go', onClick: () => pressed++ },
    { kind: 'toggle', key: 'hidden', label: () => 'Hidden', show: () => false, get: () => true, set: () => {} },
  ];
  SETTINGS.onChange = key => changed.push(key);
  const box = document.createElement('div');
  box.innerHTML = '<div data-settings="one"></div><div data-settings="two"></div>';
  document.body.appendChild(box);
  try {
    renderSettings();
    const [one, two] = [...box.querySelectorAll<HTMLElement>('[data-settings]')];
    ok(one.querySelector('#vol-one') && two.querySelector('#vol-two'), 'each panel has its own slider id');
    eq(one.querySelector('[data-set="hidden"]'), null, 'show: false hides the item');
    one.querySelector<HTMLElement>('[data-set="on"]')!.click();
    eq(st.on, true, 'the toggle flips the value');
    eq(two.querySelector('[data-set="on"]')!.getAttribute('aria-pressed'), 'true', 'the other panel is drawn again');
    two.querySelector<HTMLElement>('[data-choice="mode"][data-value="b"]')!.click();
    eq(st.mode, 'b', 'a choice sets the value');
    const slider = one.querySelector<HTMLInputElement>('[data-range="vol"]')!;
    slider.value = '0.8';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    near(st.vol, 0.8, 1e-9, 'the slider sets the value');
    eq(two.querySelector<HTMLInputElement>('[data-range="vol"]')!.value, '0.8', 'the other slider follows');
    eq(two.querySelector('[data-range-v="vol"]')!.textContent, '0.8', 'and its value text');
    one.querySelector<HTMLElement>('[data-action="go"]')!.click();
    eq(pressed, 1, 'a button runs its action');
    eq(changed.join(), 'on,mode,vol', 'onChange runs for each change');
  } finally {
    box.remove();
    SETTINGS.items = keep.items;
    SETTINGS.onChange = keep.onChange;
  }
});

test('minimap: tiles the game lets through, overlays, markers on top, the viewer arrow', () => {
  const n = 4;
  setTileWorld({
    W: n,
    H: n,
    grid: new Uint8Array(n * n).fill(1),
    hgt: new Float32Array(n * n),
    ramp: new Int8Array(n * n).fill(-1),
    cover: new Uint8Array(n * n),
  });
  const c = document.createElement('canvas');
  c.width = 160; // 40 px per tile, 1 px per map unit
  c.height = 160;
  const g = c.getContext('2d')!;
  drawTileMap(c, g, {
    tile: k => (k === 0 || k === 5 ? { color: '#0000ff', alpha: 1 } : null),
    overlay: k => (k === 5 ? { color: '#ff0000', alpha: 1 } : null),
    markers: [{ x: 3.5 * T, z: 0.5 * T, shape: 'square', color: '#00ff00', size: 5 }],
    viewer: { x: 2.5 * T, z: 3.5 * T, yaw: 0 },
  });
  const px = (x: number, y: number) => Array.from(g.getImageData(x, y, 1, 1).data).join();
  eq(px(20, 20), '0,0,255,255', 'tile 0 drawn');
  eq(px(60, 60), '255,0,0,255', 'tile 5 drawn with its overlay on top');
  eq(px(100, 20), '0,0,0,0', 'a null tile stays empty');
  eq(px(140, 20), '0,255,0,255', 'a marker sits at its world position');
  eq(px(100, 137), '255,255,255,255', 'the viewer arrow points ahead (yaw 0 = -z = up)');
  eq(px(100, 146), '0,0,0,0', 'and not behind');
});
