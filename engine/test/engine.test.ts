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
  DOOR_PASS,
  RISE,
  T,
  W,
  type TileWorld,
  activeTileGrid,
  computeFlow,
  createTileGrid,
  edgeH,
  floorY,
  flow,
  flowAt,
  flowDir,
  grid,
  hasLOS,
  hgt,
  inBounds,
  isFloor,
  isSolid,
  blocked,
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
  walkable,
} from '../src/world/tiles.ts';
import { addDoorways, forEachRoomTile, generateArena, generateDungeon, setDoor } from '../src/world/dungeon.ts';
import { DOOR_CLOSE_DELAY, DOOR_SENSE_R, DOOR_SPEED, updateDoors } from '../src/world/doors.ts';
import { tileMapFromRows } from '../src/world/tilemap.ts';
import {
  type FloorLink,
  type Floors,
  createFloors,
  feetY,
  floorReach,
  linksAt,
  unreachableFloorTiles,
} from '../src/world/floors.ts';
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
import { actx, audioInit } from '../src/audio/audio.ts';
import {
  LAYER_MIX,
  MUSIC,
  MUSIC_STYLES,
  type MusicStyle,
  musicState,
  setMusic,
  setMusicMix,
} from '../src/audio/music.ts';
import { INPUT, fire2Held, fireHeld, keys, lookDelta, mouseFire, releaseInputs } from '../src/ui/input.ts';
import {
  KEYS_PER_ACTION,
  actionDown,
  actionOf,
  bindKey,
  defineActions,
  changedBindings,
  exportBindings,
  importBindings,
  keyLabel,
  keysOf,
  resetBindings,
} from '../src/ui/keymap.ts';
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
// a TileWorld (with its own flow arrays) from rows of text
function worldFromRows(rows: string[], deckH?: number): TileWorld {
  const m = tileMapFromRows(rows, deckH === undefined ? {} : { deckH }),
    n = m.W * m.H;
  return {
    W: m.W,
    H: m.H,
    grid: m.maps.grid,
    hgt: m.maps.hgt,
    ramp: m.maps.ramp,
    cover: m.maps.cover,
    flow: new Int16Array(n),
    flowQ: new Int32Array(n),
    door: m.maps.door,
    doorOpen: m.maps.doorOpen,
  };
}
test('tiles: two tile grids keep their own terrain, collision, sight and flow', () => {
  // A: a flat corridor. B: the same size, with a 2 m deck at the right end and a wall in the middle
  const a = createTileGrid(worldFromRows(['######', '#....#', '######'])),
    b = createTileGrid(worldFromRows(['######', '#.#.=#', '######']));
  tinyWorld();
  const flowBefore = Array.from(flow).join();
  eq(a.floorY(4.5 * T, 1.5 * T), 0, 'A is flat at the right end');
  eq(b.floorY(4.5 * T, 1.5 * T), DECK_H, 'B has a deck there');
  eq(floorY(4.5 * T, 1.5 * T), 2, 'the active world is the tiny one, not A or B');
  ok(!a.solidAt(2.5 * T, 1.5 * T) && b.solidAt(2.5 * T, 1.5 * T), 'the middle tile is floor in A, wall in B');
  ok(a.hasLOS(1.5 * T, 1.5 * T, 4.5 * T, 1.5 * T), 'A: clear along the corridor');
  ok(!b.hasLOS(1.5 * T, 1.5 * T, 3.5 * T, 1.5 * T), 'B: the wall cuts the line');
  ok(!a.blocked(2.5 * T, 1.5 * T, 0.4) && b.blocked(2.5 * T, 1.5 * T, 0.4), 'blocked');
  const oa = { x: 1.5 * T, z: 1.5 * T, fy: 0 },
    ob = { x: 1.5 * T, z: 1.5 * T, fy: 0 };
  for (let k = 0; k < 100; k++) {
    a.moveCircle(oa, 0.2, 0, 0.4);
    b.moveCircle(ob, 0.2, 0, 0.4);
  }
  ok(oa.x > 4 * T, 'A: walks to the end');
  ok(ob.x < 2 * T, 'B: stops at the wall');
  ok(a.walkable(a.tileIndex(1.5 * T, 1.5 * T)) && !b.walkable(b.tileIndex(2.5 * T, 1.5 * T)), 'walkable');
  eq(a.edgeH(a.tileIndex(1.5 * T, 1.5 * T), SIDE_PX), 0, 'edgeH');
  ok(!a.inBounds(6, 1) && !b.inBounds(0, 3), 'inBounds uses each own size');
  b.computeFlow(3, 1);
  const flowB = Array.from(b.world.flow).join();
  eq(b.flowAt(3.5 * T, 1.5 * T), 0, 'B: target tile');
  eq(b.flowAt(4.5 * T, 1.5 * T), 1, 'B: one step away');
  eq(b.flowAt(1.5 * T, 1.5 * T), -1, 'B: the wall keeps the left side unreachable');
  a.computeFlow(1, 1);
  eq(Array.from(b.world.flow).join(), flowB, "B's flow is untouched by computing A's");
  eq(Array.from(flow).join(), flowBefore, "the active world's flow is untouched too");
  eq(a.flowAt(4.5 * T, 1.5 * T), 3, 'A: three steps to the left end');
  ok(a.flowDir(4.5 * T, 1.5 * T)![0] < -0.9, 'A: flowDir heads to -x');
  eq(b.flowDir(1.5 * T, 1.5 * T), null, 'B: no way from the unreachable side');
  // a change to one world shows only in the grid made from it
  b.world.hgt[b.tileIndex(3.5 * T, 1.5 * T)] = 1;
  eq(b.floorY(3.5 * T, 1.5 * T), 1);
  eq(a.floorY(3.5 * T, 1.5 * T), 0);
});
test('tiles: the module functions give what a tile grid made from the same maps gives', () => {
  const d = generateDungeon({ map: 40, roomMin: 6, roomMax: 8, platform: 1, rubble: 0.1, bridges: 2 }, createRng(7)),
    M = d.maps,
    n = d.W * d.H,
    world: TileWorld = {
      W: d.W,
      H: d.H,
      grid: M.grid,
      hgt: M.hgt,
      ramp: M.ramp,
      cover: M.cover,
      flow: new Int16Array(n),
      flowQ: new Int32Array(n),
    };
  setTileWorld(world);
  const g = createTileGrid(world),
    act = activeTileGrid(),
    rng = createRng(3),
    r = 0.4,
    span = Math.max(d.W, d.H) * T;
  // the maps are shared, so the active flow is the one g reads
  const c = d.rooms[0];
  computeFlow(Math.floor(c.x + c.w / 2), Math.floor(c.y + c.h / 2));
  let rampSeen = 0,
    flowSeen = 0;
  for (let k = 0; k < 400; k++) {
    const x = rng.rand(-T, span + T),
      z = rng.rand(-T, span + T),
      x1 = rng.rand(0, span),
      z1 = rng.rand(0, span),
      i = tileCoord(x),
      j = tileCoord(z),
      idx = rng.randi(0, n - 1),
      sd = rng.randi(0, 3);
    eq(g.floorY(x, z), floorY(x, z), 'floorY');
    eq(act.floorY(x, z), floorY(x, z), 'floorY (active object)');
    eq(g.solidAt(x, z), solidAt(x, z), 'solidAt');
    eq(g.isSolid(i, j), isSolid(i, j), 'isSolid');
    eq(g.isFloor(i, j), isFloor(i, j), 'isFloor');
    eq(g.inBounds(i, j), inBounds(i, j), 'inBounds');
    eq(g.tileIndex(x, z), tileIndex(x, z), 'tileIndex');
    eq(g.blocked(x, z, r), blocked(x, z, r), 'blocked');
    eq(g.hasLOS(x, z, x1, z1), hasLOS(x, z, x1, z1), 'hasLOS');
    eq(g.hasLOS(x, z, x1, z1, 0.5, 1.5), hasLOS(x, z, x1, z1, 0.5, 1.5), 'hasLOS with heights');
    eq(g.walkable(idx), walkable(idx), 'walkable');
    eq(g.edgeH(idx, sd), edgeH(idx, sd), 'edgeH');
    const nb = idx + SIDE_STEP[sd][0] + SIDE_STEP[sd][1] * d.W;
    if (nb >= 0 && nb < n) eq(g.passable(idx, nb, sd), passable(idx, nb, sd), 'passable');
    eq(g.flowAt(x, z), flowAt(x, z), 'flowAt');
    eq(JSON.stringify(g.flowDir(x, z)), JSON.stringify(flowDir(x, z)), 'flowDir');
    if (ramp[idx] >= 0) rampSeen++;
    if (flowAt(x, z) > 0) flowSeen++;
    const dx = rng.rand(-1, 1),
      dz = rng.rand(-1, 1),
      fy = k % 3 === 0 ? undefined : floorY(x, z),
      m1 = { x, z, fy },
      m2 = { x, z, fy };
    eq(g.moveCircle(m1, dx, dz, r), moveCircle(m2, dx, dz, r), 'moveCircle hit');
    eq(m1.x + ',' + m1.z, m2.x + ',' + m2.z, 'moveCircle position');
  }
  ok(rampSeen > 0 && flowSeen > 0, 'the sample touched ramps and the flow field');
  // computeFlow on g's own arrays gives the same field as the module one
  const own = createTileGrid({ ...world, flow: new Int16Array(n), flowQ: new Int32Array(n) });
  own.computeFlow(Math.floor(c.x + c.w / 2), Math.floor(c.y + c.h / 2));
  eq(Array.from(own.world.flow).join(), Array.from(flow).join(), 'computeFlow');
  // setTileWorld with part of the maps shows in the active object and the module functions alike, not in g
  const flat = M.grid.findIndex((v, k) => v === 1 && M.ramp[k] < 0),
    fx = tileCenter(flat % d.W),
    fz = tileCenter(Math.floor(flat / d.W)),
    raised = new Float32Array(n).fill(1.5);
  ok(M.hgt[flat] !== 1.5, 'the sample tile is not already 1.5 m up');
  setTileWorld({ hgt: raised });
  eq(floorY(fx, fz), 1.5, 'module function');
  eq(act.floorY(fx, fz), 1.5, 'active object');
  eq(act.world.hgt, raised, 'the active object holds the new array');
  eq(hgt, raised, 'the live binding follows');
  eq(g.floorY(fx, fz), M.hgt[flat], 'g keeps the maps it was made from');
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

test('ui / input: a hold button lets go only when the finger that pressed it lifts', () => {
  const btn = el('#btnFire2');
  const ptr = (type: string, id: number) => btn.dispatchEvent(new PointerEvent(type, { pointerId: id, bubbles: true }));
  ptr('pointerdown', 1);
  ok(fire2Held, 'pressed');
  ptr('pointerup', 7); // another finger lifting over the button
  ok(fire2Held, 'still held by the first finger');
  ptr('pointercancel', 7);
  ok(fire2Held, 'nor on its cancel');
  ptr('pointerup', 1);
  ok(!fire2Held, 'released by its own finger');
  ptr('pointerdown', 2);
  releaseInputs();
  ok(!fire2Held, 'releaseInputs lets go too');
  ptr('pointerup', 2);
  ok(!fire2Held);
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
// ---------- key bindings ----------
const keyEvent = (type: 'keydown' | 'keyup', code: string) => window.dispatchEvent(new KeyboardEvent(type, { code }));
const listsOf = () => JSON.stringify(exportBindings());
const defineTestActions = () =>
  defineActions([
    { id: 'jump', keys: ['Space', 'ShiftLeft'] },
    { id: 'fire', keys: ['KeyF'] },
    { id: 'map', keys: ['KeyM', 'Tab'] },
  ]);
test('keymap: actions start on their default keys; actionDown and actionOf follow the bindings', () => {
  defineTestActions();
  eq(KEYS_PER_ACTION, 2);
  eq(JSON.stringify(keysOf('jump')), '["Space","ShiftLeft"]');
  eq(JSON.stringify(keysOf('fire')), '["KeyF"]');
  eq(actionOf('KeyF'), 'fire');
  eq(actionOf('KeyM'), 'map');
  eq(actionOf('KeyZ'), null, 'unbound key');
  ok(!actionDown('jump') && !actionDown('fire'), 'nothing held');
  keyEvent('keydown', 'Space');
  ok(actionDown('jump') && !actionDown('fire'), 'first key of jump');
  keyEvent('keyup', 'Space');
  ok(!actionDown('jump'), 'released');
  keyEvent('keydown', 'ShiftLeft');
  ok(actionDown('jump'), 'second key of jump');
  keyEvent('keyup', 'ShiftLeft');
  // the right-hand Shift is the same key as the left-hand one
  eq(actionOf('ShiftRight'), 'jump');
  keyEvent('keydown', 'ShiftRight');
  ok(actionDown('jump'), 'right Shift');
  keyEvent('keyup', 'ShiftRight');
  ok(!actionDown('jump'), 'right Shift released');
  releaseInputs();
});
test('keymap: an unknown action is an error, so a typo does not pass silently', () => {
  defineTestActions();
  expect(() => actionDown('jmup')).toThrow(/unknown action/);
  expect(() => keysOf('jmup')).toThrow(/unknown action/);
  expect(() => bindKey('jmup', 0, 'KeyZ')).toThrow(/unknown action/);
});
test('keymap: defineActions refuses three keys, a default used twice and an action defined twice', () => {
  expect(() => defineActions([{ id: 'a', keys: ['KeyA', 'KeyB', 'KeyC'] }])).toThrow(/more than 2/);
  expect(() =>
    defineActions([
      { id: 'a', keys: ['KeyA'] },
      { id: 'b', keys: ['KeyA'] },
    ]),
  ).toThrow(/both a and b/);
  expect(() =>
    defineActions([
      { id: 'a', keys: ['KeyA'] },
      { id: 'a', keys: ['KeyB'] },
    ]),
  ).toThrow(/twice/);
  // a failed call leaves the earlier definition alone
  defineTestActions();
  expect(() => defineActions([{ id: 'a', keys: ['KeyA', 'KeyB', 'KeyC'] }])).toThrow();
  eq(actionOf('KeyF'), 'fire');
});
test('keymap: bindKey replaces a slot, fills an empty one, and moves a key between actions', () => {
  defineTestActions();
  // replace slot 0 of fire: the old key is no longer fire
  eq(bindKey('fire', 0, 'KeyX'), null);
  eq(JSON.stringify(keysOf('fire')), '["KeyX"]');
  eq(actionOf('KeyF'), null, 'the old key is free');
  eq(actionOf('KeyX'), 'fire');
  // an empty slot (and a slot past the end) appends
  eq(bindKey('fire', 1, 'KeyC'), null);
  eq(JSON.stringify(keysOf('fire')), '["KeyX","KeyC"]');
  eq(bindKey('fire', 5, 'KeyV'), null, 'a slot past the end is the last slot');
  eq(JSON.stringify(keysOf('fire')), '["KeyX","KeyV"]');
  // a held key stops working when it is rebound away, and the new key works
  resetBindings();
  bindKey('fire', 0, 'KeyJ');
  keyEvent('keydown', 'KeyF');
  ok(!actionDown('fire'), 'old key does nothing');
  keyEvent('keyup', 'KeyF');
  keyEvent('keydown', 'KeyJ');
  ok(actionDown('fire'), 'new key works');
  keyEvent('keyup', 'KeyJ');
  // a key another action has is taken from it, and the action that lost it is named
  resetBindings();
  eq(bindKey('fire', 1, 'KeyM'), 'map');
  eq(JSON.stringify(keysOf('fire')), '["KeyF","KeyM"]');
  eq(JSON.stringify(keysOf('map')), '["Tab"]', 'map lost KeyM and keeps its other key');
  eq(actionOf('KeyM'), 'fire');
  // the other action can end up with no keys
  eq(bindKey('jump', 0, 'Tab'), 'map');
  eq(JSON.stringify(keysOf('map')), '[]');
  ok(!actionDown('map'), 'no keys, never down');
  // the same key on the other slot of the same action swaps the two
  resetBindings();
  eq(bindKey('jump', 1, 'Space'), null);
  eq(JSON.stringify(keysOf('jump')), '["ShiftLeft","Space"]');
  // the same key on the slot it already has, or on an empty slot of its own action, changes nothing
  eq(bindKey('jump', 1, 'Space'), null);
  eq(bindKey('fire', 1, 'KeyF'), null);
  eq(JSON.stringify(keysOf('jump')), '["ShiftLeft","Space"]');
  eq(JSON.stringify(keysOf('fire')), '["KeyF"]');
  // the right-hand Shift counts as the left-hand one
  eq(bindKey('fire', 1, 'ShiftRight'), 'jump');
  eq(JSON.stringify(keysOf('fire')), '["KeyF","ShiftLeft"]');
  eq(JSON.stringify(keysOf('jump')), '["Space"]');
});
test('keymap: resetBindings returns every action to its default keys', () => {
  defineTestActions();
  const before = listsOf();
  bindKey('fire', 0, 'KeyX');
  bindKey('jump', 1, 'KeyM');
  ok(listsOf() !== before, 'changed');
  resetBindings();
  eq(listsOf(), before);
  eq(actionOf('KeyF'), 'fire');
});
test('keymap: exportBindings / importBindings round-trip, and import forgives a bad or old save', () => {
  defineTestActions();
  bindKey('fire', 0, 'KeyX');
  bindKey('map', 1, 'KeyC');
  const saved = JSON.parse(JSON.stringify(exportBindings()));
  eq(JSON.stringify(saved), '{"jump":["Space","ShiftLeft"],"fire":["KeyX"],"map":["KeyM","KeyC"]}');
  // the exported object is a copy
  saved.fire.push('KeyZ');
  eq(JSON.stringify(keysOf('fire')), '["KeyX"]');
  resetBindings();
  importBindings({ jump: ['Space', 'ShiftLeft'], fire: ['KeyX'], map: ['KeyM', 'KeyC'] });
  eq(listsOf(), '{"jump":["Space","ShiftLeft"],"fire":["KeyX"],"map":["KeyM","KeyC"]}');
  // nothing saved (an old save): the defaults
  importBindings(undefined);
  eq(JSON.stringify(keysOf('fire')), '["KeyF"]');
  importBindings({});
  eq(JSON.stringify(keysOf('map')), '["KeyM","Tab"]');
  importBindings([1, 2]);
  eq(JSON.stringify(keysOf('jump')), '["Space","ShiftLeft"]');
  // an action that is missing gets its defaults; unknown actions and bad values are ignored
  importBindings({ fire: ['KeyX'], gone: ['KeyG'], jump: 'Space', map: [1, null, 'KeyC', ''] });
  eq(listsOf(), '{"jump":["Space","ShiftLeft"],"fire":["KeyX"],"map":["KeyC"]}');
  eq(actionOf('KeyG'), null, 'unknown action ignored');
  // too many keys are cut to 2, repeats are dropped, an empty list stays empty
  importBindings({ jump: ['KeyA', 'KeyA', 'KeyB', 'KeyC'], map: [] });
  eq(JSON.stringify(keysOf('jump')), '["KeyA","KeyB"]');
  eq(JSON.stringify(keysOf('map')), '[]');
  // a key saved on two actions stays with the one defined first; a missing action never takes a key a saved one uses
  importBindings({ jump: ['KeyF'], fire: ['KeyF', 'KeyV'] });
  eq(JSON.stringify(keysOf('jump')), '["KeyF"]');
  eq(JSON.stringify(keysOf('fire')), '["KeyV"]');
  importBindings({ jump: ['KeyM'] });
  eq(JSON.stringify(keysOf('jump')), '["KeyM"]');
  eq(JSON.stringify(keysOf('map')), '["Tab"]', 'map is missing: its default KeyM is already jump');
  // right-hand keys in a save are read as left-hand ones
  importBindings({ jump: ['ShiftRight'] });
  eq(JSON.stringify(keysOf('jump')), '["ShiftLeft"]');
  resetBindings();
});
test('keymap: changedBindings saves only the changed actions, so a new default reaches old saves', () => {
  defineTestActions();
  eq(JSON.stringify(changedBindings()), '{}', 'nothing changed');
  bindKey('fire', 0, 'KeyX');
  bindKey('jump', 0, 'ShiftLeft'); // the same keys in another order count as changed
  const saved = changedBindings();
  eq(JSON.stringify(saved), '{"jump":["ShiftLeft","Space"],"fire":["KeyX"]}');
  saved.fire.push('KeyZ');
  eq(JSON.stringify(keysOf('fire')), '["KeyX"]', 'a copy');
  bindKey('map', 0, 'KeyF'); // taken from nobody now; then put back
  bindKey('map', 0, 'KeyM');
  eq(JSON.stringify(Object.keys(changedBindings())), '["jump","fire"]', 'map is back on its defaults');
  bindKey('fire', 0, 'Tab'); // takes Tab from map: both are saved, map with what is left
  eq(JSON.stringify(changedBindings()), '{"jump":["ShiftLeft","Space"],"fire":["Tab"],"map":["KeyM"]}');
  // a later version changes map's default: a save that left map alone picks it up
  defineActions([
    { id: 'jump', keys: ['Space', 'ShiftLeft'] },
    { id: 'fire', keys: ['KeyF'] },
    { id: 'map', keys: ['KeyN', 'Tab'] },
  ]);
  importBindings({ fire: ['KeyX'] });
  eq(listsOf(), '{"jump":["Space","ShiftLeft"],"fire":["KeyX"],"map":["KeyN","Tab"]}');
  resetBindings();
});
test('keymap: keyLabel gives the short name of a key', () => {
  eq(keyLabel('KeyW'), 'W');
  eq(keyLabel('Digit1'), '1');
  eq(keyLabel('ArrowUp'), '↑');
  eq(keyLabel('ArrowLeft'), '←');
  eq(keyLabel('ShiftLeft'), 'Shift');
  eq(keyLabel('ShiftRight'), 'Shift');
  eq(keyLabel('ControlLeft'), 'Ctrl');
  eq(keyLabel('Escape'), 'Esc');
  eq(keyLabel('Space'), 'Space');
  eq(keyLabel('Tab'), 'Tab');
  eq(keyLabel('Numpad5'), 'Num 5');
  eq(keyLabel('Semicolon'), ';');
  eq(keyLabel('F5'), 'F5');
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

// floors from rows of text, one per floor, the ground of floor n at 10 * n m
function floorsFromRows(floors: string[][], links: FloorLink[], deckH?: number): Floors {
  return createFloors(
    floors.map(rows => worldFromRows(rows, deckH)),
    floors.map((_, n) => 10 * n),
    links,
  );
}
const spot = (floor: number, i: number, j: number) => ({ floor, i, j });
const reached = (r: Uint8Array[], floor: number) => Array.from(r[floor]).join('');
test('floors: a link joins two floors, in both directions', () => {
  const f = floorsFromRows(
    [
      ['#######', '#.....#', '#######'],
      ['#######', '#.....#', '#.###.#', '#.....#', '#######'],
    ],
    [{ kind: 'stairs', a: spot(0, 5, 1), b: spot(1, 1, 1) }],
  );
  const up = floorReach(f, spot(0, 1, 1));
  eq(reached(up, 0), '0000000' + '0111110' + '0000000', 'floor 1 (the starting floor) is walkable end to end');
  eq(unreachableFloorTiles(f, spot(0, 1, 1)).length, 0, 'every floor tile of both floors is reached');
  eq(
    up[1].reduce((a, b) => a + b, 0),
    5 + 2 + 5,
    'all 12 floor tiles of floor 1',
  );
  const down = floorReach(f, spot(1, 3, 3));
  eq(down[0][1 * 7 + 1], 1, 'the link also leads from floor 2 down to floor 1');
  eq(unreachableFloorTiles(f, spot(1, 3, 3)).length, 0);
});
test('floors: without a link, a wall or a closed room, a floor is out of reach', () => {
  const rows1 = ['#######', '#..#..#', '#######'],
    rows0 = ['#####', '#...#', '#####'];
  const none = floorsFromRows([rows0, rows1], []);
  eq(reached(floorReach(none, spot(0, 1, 1)), 1), '0'.repeat(21), 'no link: nothing of floor 2');
  eq(unreachableFloorTiles(none, spot(0, 1, 1)).length, 4, 'the 4 tiles of floor 2');
  const one = floorsFromRows([rows0, rows1], [{ kind: 'elevator', a: spot(0, 3, 1), b: spot(1, 1, 1) }]);
  const list = unreachableFloorTiles(one, spot(0, 1, 1));
  eq(
    JSON.stringify(list),
    JSON.stringify([spot(1, 4, 1), spot(1, 5, 1)]),
    'the room behind the wall stays out of reach',
  );
  eq(floorReach(one, spot(0, 1, 1))[1][1 * 7 + 2], 1, 'the left room of floor 2 is reached');
  // a link on one floor can cross a wall
  const same = floorsFromRows([rows1], [{ kind: 'door', a: spot(0, 2, 1), b: spot(0, 4, 1) }]);
  eq(unreachableFloorTiles(same, spot(0, 1, 1)).length, 0, 'a link on one floor crosses the wall');
});
test('floors: steps up of more than STEP block the walk, drops and low steps do not', () => {
  // ground at 0 m (i 1-2), deck at 2 m (i 3-4)
  const high = floorsFromRows([['######', '#..==#', '######']], []);
  eq(reached(floorReach(high, spot(0, 1, 1)), 0), '000000' + '011000' + '000000', 'cannot climb the 2 m deck');
  eq(reached(floorReach(high, spot(0, 4, 1)), 0), '000000' + '011110' + '000000', 'but can drop from it');
  eq(
    JSON.stringify(unreachableFloorTiles(high, spot(0, 1, 1))),
    JSON.stringify([spot(0, 3, 1), spot(0, 4, 1)]),
    'the deck tiles are the unreachable ones',
  );
  eq(unreachableFloorTiles(high, spot(0, 3, 1)).length, 0, 'from the deck everything is reached');
  // the same rows with a 0.5 m deck: under STEP, so both ways work
  const low = floorsFromRows([['######', '#..==#', '######']], [], 0.5);
  eq(unreachableFloorTiles(low, spot(0, 1, 1)).length, 0, 'a 0.5 m step can be climbed');
  eq(unreachableFloorTiles(low, spot(0, 4, 1)).length, 0);
  // a ramp leads up onto the deck
  const ramp = floorsFromRows([['#####', '#.>=#', '#####']], []);
  eq(unreachableFloorTiles(ramp, spot(0, 1, 1)).length, 0, 'the ramp climbs to the deck');
  eq(unreachableFloorTiles(ramp, spot(0, 3, 1)).length, 0, 'and back down');
  // heights are per floor: floors at different baseY are joined by the link, not by their heights
  const apart = floorsFromRows(
    [
      ['####', '#..#', '####'],
      ['####', '#..#', '####'],
    ],
    [{ kind: 'stairs', a: spot(0, 2, 1), b: spot(1, 1, 1) }],
  );
  eq(unreachableFloorTiles(apart, spot(0, 1, 1)).length, 0, 'a link ignores the 10 m between the floors');
});
test('floors: feetY adds the floor height, linksAt lists the links of a tile', () => {
  const stairs: FloorLink = { kind: 'stairs', a: spot(0, 2, 1), b: spot(1, 1, 1) },
    lift: FloorLink = { kind: 'elevator', a: spot(0, 2, 1), b: spot(1, 3, 1) },
    f = floorsFromRows(
      [
        ['#####', '#.>=#', '#####'],
        ['#####', '#...#', '#####'],
      ],
      [stairs, lift],
    );
  eq(feetY(f, 0, 1.5 * T, 1.5 * T), 0, 'floor 0 ground');
  eq(feetY(f, 1, 1.5 * T, 1.5 * T), 10, 'floor 1 is 10 m up');
  eq(feetY(f, 0, 3.5 * T, 1.5 * T), DECK_H, 'the deck on floor 0');
  near(feetY(f, 0, 2.5 * T, 1.5 * T), RISE / 2, 1e-6, 'halfway up the ramp');
  f.baseY[1] = 12;
  eq(feetY(f, 1, 1.5 * T, 1.5 * T), 12, 'it reads baseY at call time');
  eq(linksAt(f, 0, 2, 1).length, 2, 'two links at the ramp tile');
  ok(linksAt(f, 0, 2, 1)[0] === stairs && linksAt(f, 0, 2, 1)[1] === lift, 'the links themselves, in the order given');
  ok(linksAt(f, 1, 1, 1)[0] === stairs && linksAt(f, 1, 3, 1)[0] === lift, 'found from the b end too');
  eq(linksAt(f, 1, 2, 1).length, 0, 'a tile with no link');
  eq(linksAt(f, 1, 9, 9).length, 0, 'outside the map');
  eq(linksAt(f, 5, 1, 1).length, 0, 'a floor that does not exist');
  const self = floorsFromRows([['###', '#.#', '###']], [{ kind: 'x', a: spot(0, 1, 1), b: spot(0, 1, 1) }]);
  eq(linksAt(self, 0, 1, 1).length, 1, 'a link from a tile to itself is listed once');
});
test('floors: createFloors names the wrong link, floorReach rejects a start off the floor', () => {
  const worlds = [worldFromRows(['####', '#..#', '####']), worldFromRows(['####', '#.##', '####'])],
    good: FloorLink = { kind: 'stairs', a: spot(0, 1, 1), b: spot(1, 1, 1) },
    make = (...links: FloorLink[]) => createFloors(worlds, [0, 5], links);
  make(good);
  expect(() => createFloors(worlds, [0], [])).toThrow(/2 floors but 1 baseY/);
  expect(() => make(good, { kind: 'lift', a: spot(2, 1, 1), b: spot(1, 1, 1) })).toThrow(/link 1 \(lift\) a: floor 2/);
  expect(() => make({ kind: 'lift', a: spot(0, 1, 1), b: spot(-1, 1, 1) })).toThrow(/link 0 \(lift\) b: floor -1/);
  expect(() => make({ kind: 'lift', a: spot(0, 4, 1), b: spot(1, 1, 1) })).toThrow(/link 0 \(lift\) a: tile \(4, 1\)/);
  expect(() => make(good, good, { kind: 'lift', a: spot(0, 1, 1), b: spot(1, 1, 3) })).toThrow(
    /link 2 \(lift\) b: tile \(1, 3\)/,
  );
  expect(() => make({ kind: 'lift', a: spot(0, 1, 1), b: spot(1, 2, 1) })).toThrow(
    /link 0 \(lift\) b: tile \(2, 1\).*not a floor/,
  );
  expect(() => make({ kind: 'lift', a: spot(0, 0.5, 1), b: spot(1, 1, 1) })).toThrow(/link 0 \(lift\) a/);
  const f = make(good);
  expect(() => floorReach(f, spot(0, 0, 0))).toThrow(/floorReach: from.*not a floor tile/);
  expect(() => floorReach(f, spot(3, 1, 1))).toThrow(/floorReach: from: floor 3/);
});

// ---- doors ----
// one row of floor with a door at column 3: the player side is columns 1-2, the far side columns 4-5
const DOOR_ROWS = ['#######', '#..+..#', '#######'];
const doorX = 3.5 * T,
  midZ = 1.5 * T;
const person = (x: number, r = 0.4) => ({ x, z: midZ, r });
// runs updateDoors for `seconds` in steps of dt
function tickDoors(
  g: ReturnType<typeof createTileGrid>,
  movers: { x: number; z: number; r: number }[],
  seconds: number,
) {
  for (let t = 0; t < seconds; t += 0.05) updateDoors(g, movers, 0.05);
}
test('doors: a shut door is a wall for movement, sight and bullets, but still a floor tile', () => {
  const g = createTileGrid(worldFromRows(DOOR_ROWS)),
    k = g.tileIndex(doorX, midZ);
  eq(g.world.door![k], 1);
  eq(g.world.doorOpen![k], 0, 'doors start shut');
  eq(g.world.grid[k], 1, 'the tile stays a floor tile');
  ok(g.isSolid(3, 1) && g.solidAt(doorX, midZ) && g.blocked(doorX, midZ, 0.4), 'solid');
  ok(g.isFloor(3, 1) && !g.isFloor(0, 0) && !g.isFloor(9, 9), 'isFloor counts the door but not walls or outside');
  ok(!g.hasLOS(1.5 * T, midZ, 5.5 * T, midZ), 'no sight through it');
  ok(g.hasLOS(1.5 * T, midZ, 2.5 * T, midZ) && g.hasLOS(4.5 * T, midZ, 5.5 * T, midZ), 'but sight on each side');
  const o = { x: 1.5 * T, z: midZ, fy: 0 };
  for (let n = 0; n < 100; n++) g.moveCircle(o, 0.2, 0, 0.4);
  ok(o.x < 3 * T - 0.4 + 1e-6 && g.moveCircle({ x: o.x, z: midZ }, 0.5, 0, 0.4), 'stopped in front of the door');
  eq(g.world.door![g.tileIndex(1.5 * T, midZ)], 0, 'ordinary floor is not a door');
});
test('doors: near someone it opens (floor to walk and see through), and it shuts again after a while', () => {
  const g = createTileGrid(worldFromRows(DOOR_ROWS)),
    k = g.tileIndex(doorX, midZ),
    open = () => g.world.doorOpen![k];
  const far = person(1.5 * T); // 8 m from the door's middle
  ok(Math.abs(far.x - doorX) > DOOR_SENSE_R);
  tickDoors(g, [far], 1);
  eq(open(), 0, 'out of range: stays shut');
  const near = person(doorX - DOOR_SENSE_R + 0.2);
  tickDoors(g, [near], 0.1);
  ok(open() > 0 && open() < DOOR_PASS, 'opening, not yet through');
  ok(g.isSolid(3, 1), 'still a wall while under DOOR_PASS');
  tickDoors(g, [near], 0.4);
  ok(open() >= DOOR_PASS && !g.isSolid(3, 1) && !g.blocked(doorX, midZ, 0.4), 'open enough: floor');
  ok(g.hasLOS(1.5 * T, midZ, 5.5 * T, midZ), 'sight goes through');
  const o = { x: near.x, z: midZ, fy: 0 };
  for (let n = 0; n < 100; n++) g.moveCircle(o, 0.2, 0, 0.4);
  ok(o.x > 4 * T, 'walks through to the far side');
  tickDoors(g, [near], 1);
  near.x = 1.5 * T; // steps away, out of range
  tickDoors(g, [near], DOOR_CLOSE_DELAY - 0.3);
  eq(open(), 1, 'stays wide open until the delay is over');
  tickDoors(g, [near], 0.3 + 1 / DOOR_SPEED + 0.3);
  eq(open(), 0, 'then closes all the way');
  ok(g.isSolid(3, 1) && !g.hasLOS(1.5 * T, midZ, 5.5 * T, midZ), 'a wall again');
});
test('doors: it does not shut while someone overlaps the tile; any of the movers opens it; options override', () => {
  const g = createTileGrid(worldFromRows(DOOR_ROWS)),
    k = g.tileIndex(doorX, midZ),
    open = () => g.world.doorOpen![k],
    tiny = { sense: 0.5, closeDelay: 0.1 };
  tickDoors(g, [person(doorX)], 1);
  eq(open(), 1);
  // the door's tile starts at x = 3 * T = 12: a body at 11.8 with r 0.4 overlaps it, one at 11.4 does not
  const run = (movers: { x: number; z: number; r: number }[], seconds: number) => {
    for (let t = 0; t < seconds; t += 0.05) updateDoors(g, movers, 0.05, tiny);
  };
  run([person(11.8)], 3);
  eq(open(), 1, 'an overlapping body holds it open');
  run([person(11.4)], 1.5);
  eq(open(), 0, 'one just outside the tile (and out of the small sense range) lets it shut');
  run([person(11.8)], 1);
  eq(open(), 1, 'overlapping a shut door opens it');
  // several movers, given as any iterable: only the near one counts
  const set = new Set([person(1.5 * T), person(4.5 * T), person(doorX + 1)]);
  tickDoors(g, [], 3);
  eq(open(), 0);
  for (let n = 0; n < 20; n++) updateDoors(g, set, 0.05);
  eq(open(), 1, 'one near mover of three is enough');
  // a faster door (the options replace the defaults one by one)
  tickDoors(g, [], 3);
  updateDoors(g, [person(doorX)], 0.1, { speed: 10 });
  eq(open(), 1, 'speed 10: fully open in 0.1 s');
  updateDoors(g, [person(doorX)], 0, {});
  updateDoors(g, [person(doorX)], -1, {});
  eq(open(), 1, 'a dt of 0 or less changes nothing');
});
test('doors: a world without doors is left alone; door without doorOpen is an error', () => {
  const plain = createTileGrid(worldFromRows(['####', '#..#', '####']));
  updateDoors(plain, [person(1.5 * T)], 1);
  eq(plain.world.door, undefined, 'nothing is added to the world');
  const bad = worldFromRows(DOOR_ROWS);
  delete bad.doorOpen;
  const g = createTileGrid(bad);
  ok(g.isSolid(3, 1), 'a door with no doorOpen counts as shut');
  expect(() => updateDoors(g, [person(doorX)], 0.1)).toThrow(/doorOpen/);
});
test('doors: paths and reach checks go through a shut door', () => {
  const rows = ['#######', '#..+..#', '#######'],
    withDoor = createTileGrid(worldFromRows(rows)),
    noDoor = createTileGrid(worldFromRows(['#######', '#.....#', '#######']));
  withDoor.computeFlow(5, 1);
  noDoor.computeFlow(5, 1);
  eq(Array.from(withDoor.world.flow).join(), Array.from(noDoor.world.flow).join(), 'the same steps as with a floor');
  eq(withDoor.flowAt(doorX, midZ), 2, 'on the door tile itself (shut)');
  eq(withDoor.flowAt(1.5 * T, midZ), 4);
  const d = withDoor.flowDir(2.5 * T, midZ);
  ok(d && d[0] > 0.9, 'flowDir heads into the shut door');
  ok(withDoor.flowDir(doorX, midZ)![0] > 0.9, 'and on along from the door tile');
  // a wall in the same place does cut the path
  const wall = createTileGrid(worldFromRows(['#######', '#..#..#', '#######']));
  wall.computeFlow(5, 1);
  eq(wall.flowAt(1.5 * T, midZ), -1);
  // floors
  const f = floorsFromRows([['#######', '#..+..#', '#######']], []);
  eq(unreachableFloorTiles(f, spot(0, 1, 1)).length, 0, 'every tile is reached through the shut door');
  eq(reached(floorReach(f, spot(0, 1, 1)), 0), '0000000' + '0111110' + '0000000', 'floorReach too');
  const sealed = floorsFromRows([['#####', '#.#+#', '#####']], []);
  eq(
    JSON.stringify(unreachableFloorTiles(sealed, spot(0, 1, 1))),
    JSON.stringify([spot(0, 3, 1)]),
    'a door cut off from the start is listed as a floor tile that cannot be reached',
  );
  eq(unreachableFloorTiles(sealed, spot(0, 3, 1)).length, 1, 'starting on the door tile itself works too');
  // a link may end on a door tile
  const two = floorsFromRows(
    [DOOR_ROWS, ['###', '#.#', '###']],
    [{ kind: 'stairs', a: spot(0, 3, 1), b: spot(1, 1, 1) }],
  );
  eq(unreachableFloorTiles(two, spot(0, 1, 1)).length, 0, 'a link on a door tile is accepted');
});
test('doors: without door maps (or with every door open, or none marked) the results are the same', () => {
  const d = generateDungeon({ map: 40, roomMin: 6, roomMax: 8, platform: 1, rubble: 0.1, bridges: 2 }, createRng(7)),
    M = d.maps,
    n = d.W * d.H,
    base = (): TileWorld => ({
      W: d.W,
      H: d.H,
      grid: M.grid,
      hgt: M.hgt,
      ramp: M.ramp,
      cover: M.cover,
      flow: new Int16Array(n),
      flowQ: new Int32Array(n),
    });
  const plain = createTileGrid(base()),
    zeros = createTileGrid({ ...base(), door: new Uint8Array(n), doorOpen: new Float32Array(n) }),
    // doors on real floor tiles, all wide open
    opened = base(),
    marked = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (M.grid[k] === 1 && k % 7 === 0) marked[k] = 1;
  const allOpen = createTileGrid({ ...opened, door: marked, doorOpen: new Float32Array(n).fill(1) });
  eq(
    marked.some(v => v === 1),
    true,
    'the sample has doors',
  );
  const c = d.rooms[0],
    ci = Math.floor(c.x + c.w / 2),
    cj = Math.floor(c.y + c.h / 2),
    rng = createRng(3),
    span = Math.max(d.W, d.H) * T;
  const grids = [plain, zeros, allOpen];
  grids.forEach(g => g.computeFlow(ci, cj));
  const flowOf = (g: typeof plain) => Array.from(g.world.flow).join();
  eq(flowOf(zeros), flowOf(plain), 'flow with all-zero door maps');
  eq(flowOf(allOpen), flowOf(plain), 'flow with open doors');
  let seen = 0;
  for (let q = 0; q < 300; q++) {
    const x = rng.rand(-T, span + T),
      z = rng.rand(-T, span + T),
      x1 = rng.rand(0, span),
      z1 = rng.rand(0, span),
      dx = rng.rand(-1, 1),
      dz = rng.rand(-1, 1),
      fy = q % 3 === 0 ? undefined : plain.floorY(x, z);
    const res = grids.map(g => {
      const m = { x, z, fy },
        hit = g.moveCircle(m, dx, dz, 0.4);
      return [
        g.solidAt(x, z),
        g.isSolid(tileCoord(x), tileCoord(z)),
        g.isFloor(tileCoord(x), tileCoord(z)),
        g.blocked(x, z, 0.4),
        g.hasLOS(x, z, x1, z1),
        g.hasLOS(x, z, x1, z1, 0.5, 1.5),
        g.flowAt(x, z),
        JSON.stringify(g.flowDir(x, z)),
        hit,
        m.x,
        m.z,
      ].join();
    });
    eq(res[1], res[0], 'all-zero door maps');
    eq(res[2], res[0], 'open doors');
    if (plain.flowAt(x, z) > 0) seen++;
  }
  ok(seen > 20, 'the sample covers reachable ground');
  // a world made with no door key at all has none, and the same module result
  eq('door' in createTileGrid(base()).world, false);
});
test('doors: the active world takes door maps through setTileWorld, and they can be removed again', () => {
  const m = tileMapFromRows(DOOR_ROWS),
    n = m.W * m.H;
  setTileWorld({ W: m.W, H: m.H, grid: m.maps.grid, hgt: m.maps.hgt, ramp: m.maps.ramp, cover: m.maps.cover });
  setTileWorld({ flow: new Int16Array(n), flowQ: new Int32Array(n), door: undefined, doorOpen: undefined });
  eq(isSolid(3, 1), false, 'no door maps: floor');
  setTileWorld({ door: m.maps.door, doorOpen: m.maps.doorOpen });
  ok(isSolid(3, 1) && isFloor(3, 1) && solidAt(doorX, midZ), 'the module functions see the shut door');
  updateDoors(activeTileGrid(), [person(doorX)], 1);
  ok(!isSolid(3, 1) && hasLOS(1.5 * T, midZ, 5.5 * T, midZ), 'and the open one');
  computeFlow(5, 1);
  eq(flowAt(1.5 * T, midZ), 4);
  setTileWorld({ door: undefined, doorOpen: undefined });
  eq(activeTileGrid().world.door, undefined);
  m.maps.doorOpen![3 + m.W] = 0;
  eq(isSolid(3, 1), false, 'removed: the tile is plain floor again');
  // a new level (a new grid) without door maps drops the doors of the one before
  setTileWorld({ door: m.maps.door, doorOpen: m.maps.doorOpen });
  setTileWorld({ W: m.W, H: m.H, grid: m.maps.grid.slice(), hgt: m.maps.hgt, ramp: m.maps.ramp, cover: m.maps.cover });
  eq(activeTileGrid().world.door, undefined, 'a new grid comes with its own doors (here none)');
  eq(DOOR_PASS > 0 && DOOR_PASS <= 1, true);
});
test('tilemap: + is a door on a floor tile; the door maps exist only when a row has one', () => {
  const m = tileMapFromRows(['#####', '#.+A#', '#####']);
  const at = (i: number, j: number) => j * m.W + i;
  eq(m.maps.grid[at(2, 1)], 1, 'a door is floor in grid');
  eq(m.maps.door![at(2, 1)], 1, 'and marked in door');
  eq(m.maps.doorOpen![at(2, 1)], 0, 'shut');
  eq(m.maps.hgt[at(2, 1)], 0);
  eq(m.maps.ramp[at(2, 1)], -1);
  eq(m.maps.cover[at(2, 1)], 0);
  eq(
    Array.from(m.maps.door!).reduce((a, b) => a + b, 0),
    1,
    'only one door',
  );
  eq(m.maps.roomOf[at(3, 1)], 0, 'room letters still work next to a door');
  eq(tileMapFromRows(['#..#', '#A.#']).maps.door, undefined, 'no door character: no door maps');
  eq(tileMapFromRows(['#..#', '#A.#']).maps.doorOpen, undefined);
  const own = tileMapFromRows(['#D.#'], { door: 'D' });
  eq(own.maps.door![1], 1, 'the door character can be changed');
  expect(() => tileMapFromRows(['#+#'], { door: 'D' })).toThrow();
  // setDoor on any maps
  const g = generateArena(10, 2, 8, []);
  eq(g.maps.door, undefined);
  setDoor(g.maps, 3 * 10 + 3);
  eq(g.maps.door![33], 1);
  eq(g.maps.doorOpen!.length, 100);
});
// a short hash of a generated dungeon (all five maps and the rooms), to compare with one made by the code before doors
function dungeonHash(d: ReturnType<typeof generateDungeon>): string {
  const M = d.maps,
    text =
      [M.grid, M.hgt, M.ramp, M.cover, M.roomOf].map(a => Array.from(a).join()).join('|') + JSON.stringify(d.rooms);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
test('dungeon: without the doors option the maps and the random numbers are what they were before doors existed', () => {
  // the hashes and the next random number were taken from the generator before doors were added
  const full = { map: 40, roomMin: 6, roomMax: 8, platform: 1, rubble: 0.1, bridges: 2 };
  const golden: [object, number, string, number][] = [
    [full, 1, '10260462', 0.163012815406546],
    [full, 7, '101b7d00', 0.8379574753344059],
    [full, 99, '5c7cc35c', 0.8688769349828362],
    [{}, 1, 'e083cc19', 0.5763414488174021],
    [{}, 7, '56976c6e', 0.42671570368111134],
    [{ bridges: 0, rubble: 0.2 }, 99, 'ef5f9794', 0.19899036060087383],
  ];
  for (const [o, seed, hash, next] of golden) {
    const rng = createRng(seed),
      d = generateDungeon(o, rng);
    eq(dungeonHash(d), hash, `seed ${seed}`);
    eq(rng.next(), next, `random numbers used, seed ${seed}`);
    eq(d.maps.door, undefined, 'no door maps');
    eq(d.maps.doorOpen, undefined);
    const off = generateDungeon({ ...o, doors: false }, createRng(seed));
    eq(dungeonHash(off), hash, 'doors: false is the same');
    eq(off.maps.door, undefined);
  }
});
test('dungeon: doors go in the room doorways, draw no random numbers, and every floor stays reachable', () => {
  const opts = { map: 40, roomMin: 6, roomMax: 8, platform: 1, rubble: 0.1 };
  for (const seed of [1, 7, 99, 123, 2024]) {
    // without bridges the only difference is the doors
    const plainRng = createRng(seed),
      doorRng = createRng(seed),
      plain = generateDungeon(opts, plainRng),
      d = generateDungeon({ ...opts, doors: true }, doorRng),
      M = d.maps,
      W = d.W;
    eq(dungeonHash(d), dungeonHash(plain), 'the same maps as without doors');
    eq(doorRng.next(), plainRng.next(), 'no random numbers drawn for doors');
    const doors: number[] = [];
    M.door!.forEach((v, k) => {
      if (v) doors.push(k);
    });
    ok(doors.length >= d.rooms.length / 2, `seed ${seed}: ${doors.length} doors`);
    eq(M.doorOpen!.length, W * d.H);
    ok(
      M.doorOpen!.every(v => v === 0),
      'all shut',
    );
    for (const k of doors) {
      eq(M.grid[k], 1, 'a door is a floor tile');
      eq(M.roomOf[k], -1, 'outside the rooms');
      // along one axis: a room tile on one side, floor on the other; across: walls
      const axisX = M.roomOf[k - 1] >= 0 || M.roomOf[k + 1] >= 0,
        [a, b] = axisX ? [k - 1, k + 1] : [k - W, k + W],
        [c, e] = axisX ? [k - W, k + W] : [k - 1, k + 1];
      ok(M.roomOf[a] >= 0 || M.roomOf[b] >= 0, 'touches a room');
      ok(M.grid[a] === 1 && M.grid[b] === 1, 'floor on both ends');
      ok(!M.grid[c] && !M.grid[e], 'walls on both sides');
    }
    // most rooms are entered through a door (a corridor that bends right at a room's edge has no doorway)
    let withDoor = 0;
    d.rooms.forEach((_r, id) => {
      if (doors.some(k => [k - 1, k + 1, k - W, k + W].some(t => M.roomOf[t] === id))) withDoor++;
    });
    ok(withDoor * 2 >= d.rooms.length, `seed ${seed}: ${withDoor} of ${d.rooms.length} rooms have a door`);
    // all floor tiles can still be reached, shut doors or not
    const f = createFloors(
      [
        {
          W,
          H: d.H,
          grid: M.grid,
          hgt: M.hgt,
          ramp: M.ramp,
          cover: M.cover,
          door: M.door,
          doorOpen: M.doorOpen,
          flow: new Int16Array(W * d.H),
          flowQ: new Int32Array(W * d.H),
        },
      ],
      [0],
      [],
    );
    const r0 = d.rooms[0];
    eq(unreachableFloorTiles(f, spot(0, Math.floor(r0.x + r0.w / 2), Math.floor(r0.y + r0.h / 2))).length, 0, 'reach');
    const g = f.grids[0];
    g.computeFlow(Math.floor(r0.x + r0.w / 2), Math.floor(r0.y + r0.h / 2));
    for (let k = 0; k < W * d.H; k++) if (M.grid[k] === 1) ok(g.world.flow[k] >= 0, 'flow reaches every floor tile');
    // while a shut door really is a wall
    ok(g.isSolid(doors[0] % W, Math.floor(doors[0] / W)), 'shut: solid');
  }
  // with bridges the doorway tiles are not used for a walkway
  const b = generateDungeon({ ...opts, doors: true, bridges: 3 }, createRng(7));
  for (let k = 0; k < b.W * b.H; k++)
    if (b.maps.door![k]) ok(b.maps.ramp[k] < 0 && b.maps.hgt[k] === 0, 'flat door tile');
  // addDoorways alone, on a corridor of width 2 there is none
  const wide = generateDungeon({ ...opts, corridorW: 2 }, createRng(7));
  addDoorways(wide.maps, wide.W);
  eq(wide.maps.door, undefined, 'a corridor 2 wide has no doorway');
});

// ---------- audio ----------
test('music: the game decides the fallback style and the mix; without them nothing breaks', () => {
  audioInit();
  ok(actx && musicState.bus, 'music bus');
  const calm: MusicStyle = { bpm: 80, root: 40, scale: 'minor', prog: [0, 3], padWave: 'sine', padCut: 800 };
  const rush: MusicStyle = { ...calm, bpm: 120 };
  Object.assign(MUSIC_STYLES, { calm, rush });
  Object.assign(LAYER_MIX, {
    soft: { pad: 1, arp: 0, bass: 0, drums: 0, tension: 0 },
    loud: { pad: 1, arp: 1, bass: 1, drums: 1, tension: 1 },
  });
  // not filled in by the game: an unknown name plays nothing, a known one plays without a mix change, an unknown mix is ignored
  setMusic('nowhere');
  eq(musicState.st, null, 'no fallback: nothing plays');
  eq(musicState.name, null);
  setMusic('calm');
  eq(musicState.st, calm);
  eq(musicState.mix, null, 'no mixOf: the mix is left alone');
  setMusicMix('missing');
  eq(musicState.mix, null, 'a mix the game does not have is ignored');
  // filled in: the fallback style, and the mix that mixOf names for the name and the boss flag
  const asked: string[] = [];
  Object.assign(MUSIC, {
    fallback: 'calm',
    mixOf: (name: string, boss: boolean) => {
      asked.push(name + (boss ? ':boss' : ''));
      return boss || name === 'rush' ? 'loud' : 'soft';
    },
  });
  setMusic('nowhere');
  eq(musicState.st, calm, 'unknown name: the fallback style');
  eq(musicState.name, 'nowhere');
  eq(musicState.mix, 'soft');
  setMusic('rush');
  eq(musicState.st, rush);
  eq(musicState.mix, 'loud');
  setMusic('calm', true);
  ok(musicState.st && musicState.st.boss, 'boss arrangement');
  eq(musicState.st!.bpm, Math.round(calm.bpm * 1.3));
  eq(musicState.name, 'calm:boss');
  eq(musicState.mix, 'loud');
  eq(asked.join(','), 'nowhere,rush,calm:boss');
  setMusic('calm');
  eq(musicState.mix, 'soft');
  // fadeOf: how fast each mix comes in
  const fades: string[] = [];
  const keepFade = MUSIC.fadeOf;
  MUSIC.fadeOf = (mix: string) => {
    fades.push(mix);
    return 0.1;
  };
  setMusicMix('loud');
  eq(fades.join(','), 'loud', 'fadeOf is asked for the mix that comes in');
  MUSIC.fadeOf = keepFade;
  Object.assign(MUSIC, { fallback: null, mixOf: () => null });
  delete MUSIC_STYLES.calm;
  delete MUSIC_STYLES.rush;
  delete LAYER_MIX.soft;
  delete LAYER_MIX.loud;
});
