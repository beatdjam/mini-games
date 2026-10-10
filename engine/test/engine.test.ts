import { expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { clamp, createRng, distXZ, el, pct, randi, shuffle } from '../src/core/util.ts';
import { clearStore, decodeStore, encodeStore, loadStore, prefGet, prefSet, saveStore } from '../src/core/store.ts';
import { addSystem, runSystems, stopFrame } from '../src/core/loop.ts';
import { WORLD, clearWorld, query, spawn, worldGroup } from '../src/core/world.ts';
import { LANG, fillData, lang, setI18nHook, setLang, t } from '../src/core/i18n.ts';
import { ANALYTICS, TRACK_LOG, track } from '../src/core/analytics.ts';
import { FEEDBACK, FEEDBACK_INFO_MAX, feedbackReady, feedbackUrl } from '../src/core/feedback.ts';
import { buildViewmodel, disposeTree } from '../src/render/render.ts';
import {
  buildParts,
  defineMaterial,
  defineTexture,
  material,
  ownMaterial,
  texture,
  texturesReady,
} from '../src/render/materials.ts';
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
import {
  addDoorways,
  forEachRoomTile,
  generateArena,
  generateDungeon,
  setDoor,
  tileWorldOf,
} from '../src/world/dungeon.ts';
import { FLOOR_H, generateFloors } from '../src/world/floorgen.ts';
import { DOOR_CLOSE_DELAY, DOOR_SENSE_R, DOOR_SPEED, isDoorLocked, lockDoor, updateDoors } from '../src/world/doors.ts';
import { tileMapFromRows } from '../src/world/tilemap.ts';
import {
  STAIRWELL_DEFAULTS,
  allReached,
  makeRoute,
  markLinkOpenings,
  noOpenings,
  placeLink,
  roomDoors,
  stripOf,
  thinDoorPairs,
} from '../src/world/stairwells.ts';
import { type PropRule, type Slot, placeProps, slotsOf } from '../src/world/slots.ts';
import {
  type FloorLink,
  type FloorSpot,
  type Floors,
  createFloors,
  crossLink,
  feetY,
  floorFlow,
  floorReach,
  flowLink,
  linksAt,
  otherEnd,
  unreachableFloorTiles,
} from '../src/world/floors.ts';
import {
  LIFT_RIDE,
  LIFT_WAIT,
  createLift,
  liftProgress,
  liftTarget,
  updateLift,
  useFloor,
} from '../src/world/lifts.ts';
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
import { banner, keepAwake, toast } from '../src/ui/ui.ts';
import { onDataClick, rowsHTML } from '../src/ui/dom.ts';
import { withLang } from '../src/core/langslots.ts';
import { facesToward, floorSides, wallSide } from '../src/world/walls.ts';
import { WINDOW_ORDER, buildBackdrop, buildOutsideBlocks, buildWindowPanes } from '../src/render/windows.ts';
import { hideInFog } from '../src/render/fogcull.ts';
import {
  block,
  canvasTex,
  grain,
  grime,
  paintRand,
  paintTex,
  poolTex,
  smudge,
  soil,
  stripes,
  words,
} from '../src/render/paint.ts';
import { createHitDirs } from '../src/ui/hitdir.ts';
import { canCopyImage, openXPost, saveFile } from '../src/ui/share.ts';
import { SETTINGS, renderSettings } from '../src/ui/settings.ts';
import { drawTileMap } from '../src/ui/minimap.ts';
import { createFloorMap3D } from '../src/ui/floormap3d.ts';
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
// a stand-in for navigator.wakeLock: counts the requests and keeps the locks it handed out
function fakeWakeLock(present = true) {
  const log = { requests: 0, locks: [] as { released: boolean; release: () => Promise<void> }[], reject: false };
  const wakeLock = {
    request: (_type: string) => {
      log.requests++;
      if (log.reject) return Promise.reject(new DOMException('refused', 'NotAllowedError'));
      const lock = {
        released: false,
        release: () => {
          lock.released = true;
          return Promise.resolve();
        },
      };
      log.locks.push(lock);
      return Promise.resolve(lock);
    },
  };
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: present ? wakeLock : undefined });
  return log;
}
const settle = () => new Promise(r => setTimeout(r, 0)); // lets the request promises resolve
const showPage = (visibility: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  document.dispatchEvent(new Event('visibilitychange'));
};
test('ui: keepAwake takes the wake lock, gives it back, and takes it again when the page is visible again', async () => {
  const log = fakeWakeLock();
  try {
    keepAwake(true);
    await settle();
    eq(log.requests, 1, 'on: requested');
    keepAwake(true);
    await settle();
    eq(log.requests, 1, 'on twice: no second lock');
    showPage('visible');
    await settle();
    eq(log.requests, 1, 'still held: no new request');
    // the browser takes the lock away when the page goes to the background
    log.locks[0]!.released = true;
    showPage('hidden');
    await settle();
    eq(log.requests, 1, 'hidden: no request');
    showPage('visible');
    await settle();
    eq(log.requests, 2, 'visible again: taken again');
    keepAwake(false);
    await settle();
    ok(log.locks[1]!.released, 'off: released');
    // off: coming back to the page takes nothing
    showPage('hidden');
    showPage('visible');
    await settle();
    eq(log.requests, 2, 'off: not taken again');
    // off while the request is still in flight: the lock that arrives is given back
    keepAwake(true);
    keepAwake(false);
    await settle();
    eq(log.requests, 3);
    ok(log.locks[2]!.released, 'off during the request');
  } finally {
    keepAwake(false);
    Reflect.deleteProperty(document, 'visibilityState');
    Reflect.deleteProperty(navigator, 'wakeLock');
  }
});
test('ui: keepAwake does nothing without navigator.wakeLock and ignores a refused request', async () => {
  try {
    fakeWakeLock(false);
    keepAwake(true);
    showPage('visible');
    keepAwake(false);
    await settle(); // no exception, no unhandled rejection
    const log = fakeWakeLock();
    log.reject = true;
    keepAwake(true);
    await settle();
    eq(log.requests, 1, 'asked');
    log.reject = false;
    showPage('visible');
    await settle();
    eq(log.requests, 2, 'tried again after the refusal');
    eq(log.locks.length, 1);
  } finally {
    keepAwake(false);
    Reflect.deleteProperty(document, 'visibilityState');
    Reflect.deleteProperty(navigator, 'wakeLock');
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
// floor 0: a corridor with stairs at its east end and a lift at its west end. floor 1: a loop with a shut door,
// the stairs come out at its north-west corner, the lift at its south-east corner. floor 2: joined to nothing
function crossFloors() {
  const stairs: FloorLink = { kind: 'stairs', a: spot(0, 5, 1), b: spot(1, 1, 1) },
    lift: FloorLink = { kind: 'elevator', a: spot(0, 1, 1), b: spot(1, 5, 3) },
    f = floorsFromRows(
      [
        ['#######', '#.....#', '#######'],
        ['#######', '#.+...#', '#.###.#', '#.....#', '#######'],
        ['####', '#..#', '####'],
      ],
      [stairs, lift],
    );
  return { f, stairs, lift };
}
const flowRow = (f: Floors, floor: number, j: number) => {
  const w = f.grids[floor].world;
  return Array.from(w.flow.slice(j * w.W, (j + 1) * w.W)).join(',');
};
const onlyStairs = (l: FloorLink) => l.kind === 'stairs',
  anyLink = () => true;
test('floors: floorFlow leads over the floors through the links it may use', () => {
  const { f, stairs, lift } = crossFloors();
  floorFlow(f, spot(1, 3, 1), onlyStairs);
  eq(flowRow(f, 1, 1), '-1,2,1,0,1,2,-1', 'the target floor, through the shut door');
  eq(flowRow(f, 0, 1), '-1,7,6,5,4,3,-1', 'floor 0 leads to the stairs: one step over them');
  eq(flowRow(f, 2, 1), '-1,-1,-1,-1', 'a floor with no link has no way');
  eq(JSON.stringify(f.grids[0].flowDir(2.5 * T, 1.5 * T)), '[1,0]', 'flowDir on floor 0 heads for the stairs');
  eq(f.grids[0].flowDir(5.5 * T, 1.5 * T), null, 'on the stairs tile no neighbour is closer');
  ok(flowLink(f, 0, 5, 1, onlyStairs) === stairs, 'flowLink: the stairs lead on');
  eq(flowLink(f, 0, 1, 1, onlyStairs), null, 'the lift is not one to use');
  eq(flowLink(f, 1, 1, 1, onlyStairs), null, 'the stairs do not lead back down (floor 0 is farther)');
  eq(flowLink(f, 1, 3, 1, anyLink), null, 'the target tile itself');
  eq(flowLink(f, 2, 1, 1, anyLink), null, 'a tile with no way');
  eq(flowLink(f, 0, 9, 9, anyLink), null, 'outside the map');
  floorFlow(f, spot(1, 3, 1), anyLink);
  eq(flowRow(f, 0, 1), '-1,5,6,5,4,3,-1', 'with the lift too, the west end goes up by lift');
  ok(flowLink(f, 0, 1, 1, anyLink) === lift, 'flowLink picks the lift there');
  floorFlow(f, spot(0, 3, 1), onlyStairs);
  eq(flowRow(f, 1, 3), '-1,5,6,7,8,9,-1', 'the other way round: floor 1 leads down the stairs');
  ok(otherEnd(stairs, 0, 5, 1) === stairs.b && otherEnd(stairs, 1, 1, 1) === stairs.a, 'otherEnd from either end');
  expect(() => floorFlow(f, spot(0, 0, 0), anyLink)).toThrow(/floorFlow: target.*not a floor tile/);
});
test('floors: floorReach and unreachableFloorTiles cross only the links `use` accepts', () => {
  const { f } = crossFloors();
  eq(unreachableFloorTiles(f, spot(0, 1, 1)).length, 2, 'every link: only floor 2 (joined to nothing) is out of reach');
  eq(unreachableFloorTiles(f, spot(0, 1, 1), onlyStairs).length, 2, 'stairs alone still reach floor 1');
  const lifted = floorsFromRows(
    [
      ['#####', '#...#', '#####'],
      ['#####', '#...#', '#####'],
    ],
    [{ kind: 'elevator', a: spot(0, 3, 1), b: spot(1, 1, 1) }],
  );
  eq(unreachableFloorTiles(lifted, spot(0, 1, 1)).length, 0, 'the lift joins the floors');
  eq(
    JSON.stringify(unreachableFloorTiles(lifted, spot(0, 1, 1), onlyStairs)),
    JSON.stringify([spot(1, 1, 1), spot(1, 2, 1), spot(1, 3, 1)]),
    'without stairs, floor 1 is out of reach: enemies that never ride could not get there',
  );
  eq(reached(floorReach(lifted, spot(1, 2, 1), onlyStairs), 0), '0'.repeat(15), 'nor floor 0 from floor 1');
});
test('floors: crossLink moves a mover across a link once, until it steps off', () => {
  const { f, stairs } = crossFloors();
  const m: { floor: number; x: number; z: number; linkTile?: number } = { floor: 0, x: 5.3 * T, z: 1.6 * T };
  eq(
    crossLink(f, m, l => l.kind === 'elevator'),
    null,
    'a link it may not use: no move',
  );
  eq(m.floor, 0);
  ok(crossLink(f, m, onlyStairs) === stairs, 'up the stairs');
  eq(
    [m.floor, m.x, m.z, m.linkTile].join(','),
    [1, 1.5 * T, 1.5 * T, 1 * 7 + 1].join(','),
    'the middle of the other end',
  );
  eq(crossLink(f, m, onlyStairs), null, 'standing where it came out: no crossing back');
  m.x = 1.9 * T;
  eq(crossLink(f, m, onlyStairs), null, 'still on that tile');
  m.x = 2.5 * T;
  eq(crossLink(f, m, onlyStairs), null, 'off the tile: nothing there');
  eq(m.linkTile, -1, 'and the hold is gone');
  m.x = 1.5 * T;
  ok(crossLink(f, m, onlyStairs) === stairs, 'back on the stairs: down again');
  eq([m.floor, m.x, m.z].join(','), [0, 5.5 * T, 1.5 * T].join(','));
  const lost = { floor: 0, x: -3, z: 1.5 * T };
  eq(crossLink(f, lost, anyLink), null, 'outside the map');
  eq(crossLink(f, { floor: 7, x: 1.5 * T, z: 1.5 * T }, anyLink), null, 'a floor that does not exist');
});
test('lifts: standing on a lift for a moment starts it, the ride carries the rider to the other end', () => {
  const { f, lift: link } = crossFloors(),
    lift = createLift(link),
    rider: { floor: number; x: number; z: number; linkTile?: number } = { floor: 0, x: 1.5 * T, z: 1.5 * T };
  eq(updateLift(f, lift, rider, 0.5), null, 'on the lift: waiting');
  eq(lift.phase, 'wait');
  ok(lift.from === link.a, 'got on at the a end');
  rider.x = 2.5 * T;
  eq(updateLift(f, lift, rider, 0.1), null, 'stepped off before it started');
  eq([lift.phase, lift.t, lift.from].join(','), 'idle,0,', 'idle again, the wait starts over');
  rider.x = 1.5 * T;
  eq(updateLift(f, lift, rider, 0.5), null);
  eq(updateLift(f, lift, rider, 0.4), 'depart', `it starts after ${LIFT_WAIT} s`);
  ok(liftTarget(lift) === link.b, 'going to the b end');
  eq(liftProgress(lift), 0);
  eq(updateLift(f, lift, rider, 1), null, 'riding');
  near(liftProgress(lift), 1 / LIFT_RIDE, 1e-6, 'progress over the ride');
  rider.x = 2.5 * T; // the game let it drift: it still rides from where it got on
  eq(updateLift(f, lift, rider, LIFT_RIDE), 'arrive', 'the ride is over');
  eq(
    [rider.floor, rider.x, rider.z, rider.linkTile].join(','),
    [1, 5.5 * T, 3.5 * T, 3 * 7 + 5].join(','),
    'at the b end',
  );
  eq([lift.phase, liftProgress(lift), liftTarget(lift)].join(','), 'idle,0,', 'idle again');
  eq(updateLift(f, lift, rider, 5), null, 'standing where it came out: the lift does not go back');
  eq(lift.phase, 'idle');
  rider.x = 4.5 * T;
  eq(updateLift(f, lift, rider, 0.1), null, 'off the lift');
  eq(rider.linkTile, -1, 'the hold is dropped');
  rider.x = 5.5 * T;
  updateLift(f, lift, rider, 0.1);
  eq(
    updateLift(f, lift, rider, 0.1, { wait: 0.15, ride: 0.2 }),
    'depart',
    'back on: it goes down (the game may pass its own times)',
  );
  eq(updateLift(f, lift, rider, 0.2, { wait: 0.15, ride: 0.2 }), 'arrive');
  eq([rider.floor, rider.x, rider.z].join(','), [0, 1.5 * T, 1.5 * T].join(','), 'back on floor 0');
  const other = { floor: 1, x: 1.5 * T, z: 1.5 * T }; // the stairs tile of floor 1, not a lift stop
  eq(updateLift(f, createLift(link), other, 5), null, 'a tile that is not a stop');
  eq(updateLift(f, lift, rider, 0), null, 'dt 0 does nothing');
});
test('lifts: useFloor hands one floor to the module-level tile functions', () => {
  const { f } = crossFloors();
  useFloor(f, 1);
  const act = activeTileGrid().world;
  ok(act.grid === f.grids[1].world.grid && act.door === f.grids[1].world.door, 'the floor maps themselves, not copies');
  eq([act.W, act.H].join(','), '7,5');
  useFloor(f, 2);
  eq(activeTileGrid().world.door, f.grids[2].world.door, 'the next floor replaces it');
  expect(() => useFloor(f, 9)).toThrow(/useFloor: floor 9 does not exist/);
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
test('doors: a locked door shuts at once, opens for nobody, and opens again once unlocked', () => {
  const g = createTileGrid(worldFromRows(DOOR_ROWS)),
    k = g.tileIndex(doorX, midZ),
    open = () => g.world.doorOpen![k];
  eq(g.world.doorLock, undefined, 'no lock map until a door is locked');
  ok(!isDoorLocked(g.world, k));
  lockDoor(g.world, k, false);
  eq(g.world.doorLock, undefined, 'unlocking a door that was never locked adds nothing');
  const near = person(doorX - 3); // in sense range, not on the door's tile (which starts 1 m further on)
  tickDoors(g, [near], 1);
  eq(open(), 1, 'an ordinary door: open');
  lockDoor(g.world, k);
  ok(isDoorLocked(g.world, k) && !isDoorLocked(g.world, k - 1));
  updateDoors(g, [near], 0.1);
  ok(open() < 1, 'locked: it starts shutting right away, with someone near and no closeDelay');
  tickDoors(g, [near], 1);
  eq(open(), 0, 'and shuts all the way');
  ok(g.isSolid(3, 1) && !g.hasLOS(1.5 * T, midZ, 5.5 * T, midZ), 'a wall');
  tickDoors(g, [near, person(doorX + 3)], 2);
  eq(open(), 0, 'nobody near opens it');
  lockDoor(g.world, k, false);
  ok(!isDoorLocked(g.world, k));
  tickDoors(g, [near], 1);
  eq(open(), 1, 'unlocked: an ordinary door again');
  expect(() => lockDoor(g.world, k - 1)).toThrow(/no door/);
  expect(() => lockDoor(worldFromRows(['###', '#.#', '###']), 4)).toThrow(/no door/);
});
test('doors: a locked door waits for a body in the doorway before it shuts', () => {
  const g = createTileGrid(worldFromRows(DOOR_ROWS)),
    k = g.tileIndex(doorX, midZ),
    open = () => g.world.doorOpen![k],
    body = person(doorX);
  tickDoors(g, [body], 1);
  lockDoor(g.world, k);
  tickDoors(g, [body], 2);
  eq(open(), 1, 'held open while the body overlaps the tile');
  ok(!g.blocked(body.x, body.z, body.r), 'so the body is never inside a wall');
  body.x = 11.8; // the tile starts at x = 12: still overlapping
  tickDoors(g, [body], 1);
  eq(open(), 1);
  body.x = 11.4; // off the tile, still within sense range
  tickDoors(g, [body], 1);
  eq(open(), 0, 'shuts once the doorway is clear');
});
test('doors: paths and reach checks stop at a locked door', () => {
  const g = createTileGrid(worldFromRows(DOOR_ROWS)),
    k = g.tileIndex(doorX, midZ);
  g.computeFlow(5, 1);
  eq(g.flowAt(1.5 * T, midZ), 4, 'unlocked: the path goes through');
  lockDoor(g.world, k);
  g.computeFlow(5, 1);
  eq(g.flowAt(1.5 * T, midZ), -1, 'locked: the far side cannot be reached');
  eq(g.flowAt(doorX, midZ), 2, 'a body still in the doorway keeps its way out');
  eq(g.flowAt(4.5 * T, midZ), 1, 'the near side is as before');
  eq(g.flowDir(2.5 * T, midZ), null, 'no direction into the locked door');
  ok(g.isFloor(3, 1), 'the tile is still a floor tile');
  g.computeFlow(1, 1);
  eq(g.flowAt(4.5 * T, midZ), -1, 'the same from the other side');
  lockDoor(g.world, k, false);
  g.computeFlow(5, 1);
  eq(g.flowAt(1.5 * T, midZ), 4, 'unlocked again: through');
  // floors
  const f = floorsFromRows([DOOR_ROWS], []);
  lockDoor(f.grids[0].world, k);
  eq(reached(floorReach(f, spot(0, 1, 1)), 0), '0000000' + '0110000' + '0000000', 'floorReach stops in front of it');
  // the active world takes and drops the lock map with its maps
  const w = worldFromRows(DOOR_ROWS);
  lockDoor(w, k);
  setTileWorld(w);
  eq(activeTileGrid().world.doorLock, w.doorLock, 'setTileWorld hands the lock map over');
  setTileWorld(worldFromRows(DOOR_ROWS));
  eq(activeTileGrid().world.doorLock, undefined, 'a new grid starts with no lock');
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
      // (or, where two corridors run side by side, wall on one side and the other half of the door on the other)
      const wall = (t: number) => !M.grid[t],
        half = (t: number, beyond: number) => !!M.door![t] && wall(beyond);
      ok(
        (wall(c) && wall(e)) || (wall(c) && half(e, e + (e - k))) || (wall(e) && half(c, c + (c - k))),
        'walls on both sides',
      );
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
  // addDoorways alone, on a corridor of width 2: the doors come in pairs, side by side across the corridor
  const wide = generateDungeon({ ...opts, corridorW: 2 }, createRng(7));
  addDoorways(wide.maps, wide.W);
  const wd = wide.maps.door!,
    pairs = [...wd.keys()].filter(k => wd[k]);
  ok(pairs.length >= 2 && pairs.length % 2 === 0, 'a corridor 2 wide has doors, an even number');
  for (const k of pairs)
    eq([k - 1, k + 1, k - wide.W, k + wide.W].filter(t => wd[t]).length, 1, 'each has one door beside it');
  // a corridor 3 wide has none
  const wider = generateDungeon({ ...opts, corridorW: 3 }, createRng(7));
  addDoorways(wider.maps, wider.W);
  eq(wider.maps.door, undefined, 'a corridor 3 wide has no doorway');
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

// ---- several floors, generated ----
// ---- the hall: a room with a single way in ----
// the floor tiles reached from tile `from` walking over floor (4 ways, heights ignored), never stepping on `skip`
function floodFloor(d: ReturnType<typeof generateDungeon>, from: number, skip = -1): Uint8Array {
  const seen = new Uint8Array(d.W * d.H),
    queue = [from];
  seen[from] = 1;
  for (let n = 0; n < queue.length; n++)
    for (const step of [1, -1, d.W, -d.W]) {
      const k = queue[n] + step;
      if (d.maps.grid[k] !== 1 || seen[k] || k === skip) continue;
      seen[k] = 1;
      queue.push(k);
    }
  return seen;
}
const HALL_CASES = [
  { map: 36, countMin: 2, countMax: 3, hall: { w: 12, h: 12 } },
  { map: 36, hall: { w: 12, h: 12 }, platform: 1, rubble: 0.1, bridges: 2, doors: true },
  { map: 44, roomMin: 6, roomMax: 9, corridorW: 2, hall: { w: 12, h: 12 }, platform: 0.8 },
  { map: 30, countMin: 6, countMax: 8, hall: { w: 5, h: 9 }, doors: true },
];
test('dungeon: the hall is the last room, bare, with one door, and no corridor runs through it', () => {
  for (const opts of HALL_CASES)
    for (let seed = 1; seed <= 60; seed++) {
      const d = generateDungeon(opts, createRng(seed)),
        { W, maps: M } = d,
        at = `map ${opts.map} seed ${seed}`;
      ok(d.hall && d.hall.room === d.rooms.length - 1 && d.rooms.length >= 2, `${at}: the last of 2 rooms or more`);
      const hall = d.rooms[d.hall!.room],
        door = d.hall!.door;
      eq(`${hall.w}x${hall.h}`, `${opts.hall.w}x${opts.hall.h}`, 'the size asked for');
      ok(hall.x >= 3 && hall.y >= 3 && hall.x + hall.w <= W - 3 && hall.y + hall.h <= d.H - 3, `${at}: off the edge`);
      ok(!hall.plat, 'no deck');
      forEachRoomTile(hall, (i, j) => {
        const k = j * W + i;
        ok(M.grid[k] === 1 && M.hgt[k] === 0 && M.ramp[k] < 0 && !M.cover[k], `${at}: bare floor at ${i},${j}`);
        eq(M.roomOf[k], d.hall!.room, 'marked as the hall');
      });
      // the ring of wall round the hall has exactly one opening: the door
      const openings: number[] = [];
      for (let j = hall.y - 1; j <= hall.y + hall.h; j++)
        for (let i = hall.x - 1; i <= hall.x + hall.w; i++) {
          const inside = i >= hall.x && i < hall.x + hall.w && j >= hall.y && j < hall.y + hall.h;
          if (!inside && M.grid[j * W + i] === 1) openings.push(j * W + i);
        }
      eq(openings.join(), String(door), `${at}: the door is the only opening`);
      eq(M.door![door], 1, 'and it has a door, whatever the doors option says');
      eq(M.doorOpen![door], 0);
      eq(M.roomOf[door], -1);
      // every other room is reached without the hall; the hall only through its door
      const middle = (r: { x: number; y: number; w: number; h: number }) =>
          Math.floor(r.y + r.h / 2) * W + Math.floor(r.x + r.w / 2),
        without = floodFloor(d, middle(d.rooms[0]), door),
        withDoor = floodFloor(d, middle(d.rooms[0]));
      d.rooms.slice(0, -1).forEach((r, n) => eq(without[middle(r)], 1, `${at}: room ${n} reached round the hall`));
      eq(without[middle(hall)], 0, `${at}: the hall is not reached without its door`);
      eq(withDoor[middle(hall)], 1, `${at}: and is reached through it`);
      // walking by the height rules too: nothing but cover is cut off
      const f = createFloors([tileWorldOf(d)], [0], []),
        start = { floor: 0, i: middle(d.rooms[0]) % W, j: Math.floor(middle(d.rooms[0]) / W) };
      ok(
        unreachableFloorTiles(f, start).every(t => M.cover[t.j * W + t.i]),
        `${at}: every floor tile is walked to`,
      );
    }
});
test('dungeon: the hall draws two numbers first, repeats with the seed, and the option alone changes nothing else', () => {
  const opts = { map: 36, platform: 0.5, rubble: 0.1, bridges: 2 };
  for (const seed of [1, 7, 99, 2024]) {
    const a = generateDungeon({ ...opts, hall: { w: 12, h: 12 } }, createRng(seed)),
      b = generateDungeon({ ...opts, hall: { w: 12, h: 12 } }, createRng(seed));
    eq(dungeonHash(a), dungeonHash(b), 'the same seed gives the same map');
    eq(JSON.stringify(a.hall), JSON.stringify(b.hall));
    // the hall's place is the first two numbers of the seed
    const rng = createRng(seed),
      x = rng.randi(3, 36 - 12 - 3),
      y = rng.randi(3, 36 - 12 - 3),
      hall = a.rooms[a.hall!.room];
    eq(`${hall.x},${hall.y}`, `${x},${y}`);
    eq(generateDungeon(opts, createRng(seed)).hall, undefined, 'no hall without the option');
  }
  expect(() => generateDungeon({ map: 20, hall: { w: 15, h: 4 } }, createRng(1))).toThrow(/does not fit/);
  expect(() => generateDungeon({ map: 20, hall: { w: 4, h: 0 } }, createRng(1))).toThrow(/does not fit/);
  // a map the hall fills leaves no place for another room
  expect(() => generateDungeon({ map: 18, hall: { w: 12, h: 12 } }, createRng(1))).toThrow(/no room could be placed/);
});
test('floorgen: no stairs or lift ends in a hall', () => {
  const hallFloor = { countMin: 2, countMax: 3, hall: { w: 12, h: 12 } };
  for (let seed = 1; seed <= 40; seed++) {
    const g = generateFloors(
      { floors: 3, dungeon: [hallFloor, {}, hallFloor], stairs: 2, lifts: 1, liftRooms: 1 },
      createRng(seed),
    );
    for (const l of g.links)
      for (const s of [l.a, l.b]) {
        const m = g.maps[s.floor];
        ok(!m.hall || m.maps.roomOf[s.j * m.W + s.i] !== m.hall.room, `seed ${seed}: a ${l.kind} ends in the hall`);
      }
    eq(g.maps[0].hall!.room < g.maps[0].rooms.length, true);
    // every floor is still reached by stairs alone, the halls through their doors included
    const start = g.maps[0].rooms[0],
      from = { floor: 0, i: Math.floor(start.x + start.w / 2), j: Math.floor(start.y + start.h / 2) },
      cut = unreachableFloorTiles(g.floors, from, l => l.kind === 'stairs');
    const liftOnly = (t: { floor: number; i: number; j: number }) =>
      g.liftRooms.some(
        r => r.floor === t.floor && g.maps[t.floor].maps.roomOf[t.j * g.maps[t.floor].W + t.i] === r.room,
      );
    ok(
      cut.every(t => liftOnly(t) || g.maps[t.floor].maps.cover[t.j * g.maps[t.floor].W + t.i]),
      `seed ${seed}: stairs reach everything but the lift-only rooms`,
    );
  }
});
test('floorgen: tileWorldOf shares the maps and brings the doors along', () => {
  const d = generateDungeon({ map: 30, doors: true }, createRng(3)),
    w = tileWorldOf(d);
  ok(w.grid === d.maps.grid && w.hgt === d.maps.hgt && w.door === d.maps.door, 'the maps themselves');
  eq([w.W, w.H, w.flow.length, w.flowQ.length].join(','), '30,30,900,900');
  ok(!('door' in tileWorldOf(generateDungeon({ map: 30 }, createRng(3)))), 'no door maps without doors');
});
test('floorgen: floors joined by stairs (and lifts), every floor reached by stairs alone, the same seed repeats', () => {
  const opts = {
    floors: 3,
    dungeon: { map: 36, doors: true, platform: 1, rubble: 0.1, bridges: 2 },
    lifts: 1,
  };
  const stairsOnly = (l: FloorLink) => l.kind === 'stairs';
  for (const seed of [1, 7, 99, 123, 2024]) {
    const g = generateFloors(opts, createRng(seed)),
      again = generateFloors(opts, createRng(seed));
    eq(JSON.stringify(g.links), JSON.stringify(again.links), 'links repeat');
    eq(g.maps.map(dungeonHash).join(), again.maps.map(dungeonHash).join(), 'maps repeat');
    eq(
      g.links.map(l => `${l.kind}:${l.a.floor}-${l.b.floor}`).join(),
      'stairs:0-1,elevator:0-1,stairs:1-2,elevator:1-2',
    );
    eq(g.floors.baseY.join(), [0, FLOOR_H, 2 * FLOOR_H].join(), 'floor heights');
    const ends = new Set<string>();
    for (const l of g.links)
      for (const s of [l.a, l.b]) {
        const m = g.maps[s.floor].maps,
          k = s.j * g.maps[s.floor].W + s.i;
        ok(m.roomOf[k] >= 0 && m.hgt[k] === 0 && m.ramp[k] < 0 && !m.cover[k] && !m.door![k], 'a flat room tile');
        ok(!ends.has(`${s.floor}:${k}`), 'no tile holds two link ends');
        ends.add(`${s.floor}:${k}`);
      }
    // cover (waist high, more than STEP) is a floor tile nobody climbs onto: leave it out
    const offCover = (s: FloorSpot) => !g.maps[s.floor].maps.cover[s.j * g.maps[s.floor].W + s.i];
    eq(
      unreachableFloorTiles(g.floors, g.links[0].a, stairsOnly).filter(offCover).length,
      0,
      `seed ${seed}: every floor tile by stairs alone`,
    );
    // and every floor tile can come to the top floor's stairs: an enemy anywhere can follow up there
    floorFlow(g.floors, g.links[2].b, stairsOnly);
    g.floors.grids.forEach((gr, n) => {
      const w = gr.world;
      for (let k = 0; k < w.grid.length; k++)
        if (w.grid[k] === 1 && !w.cover[k]) ok(w.flow[k] >= 0, `seed ${seed}: floor ${n} tile ${k} has a way`);
    });
  }
});
test('floorgen: floors and rooms that only a lift reaches', () => {
  const stairsOnly = (l: FloorLink) => l.kind === 'stairs',
    offCover = (g: ReturnType<typeof generateFloors>) => (s: FloorSpot) =>
      !g.maps[s.floor].maps.cover[s.j * g.maps[s.floor].W + s.i];
  for (const seed of [1, 7, 99, 123, 2024]) {
    // floor 2 hangs on a lift only; every floor has one room that only a lift reaches
    const g = generateFloors(
        { floors: 3, dungeon: { map: 40, doors: true }, stairs: [1, 0], liftRooms: 1 },
        createRng(seed),
      ),
      again = generateFloors(
        { floors: 3, dungeon: { map: 40, doors: true }, stairs: [1, 0], liftRooms: 1 },
        createRng(seed),
      );
    eq(JSON.stringify(g.links), JSON.stringify(again.links), 'repeats');
    eq(g.liftRooms.length, 3, `seed ${seed}: one lift-only room per floor`);
    eq(
      g.links.map(l => `${l.kind}:${l.a.floor}-${l.b.floor}`).join(),
      'stairs:0-1,elevator:1-2,elevator:0-1,elevator:1-2,elevator:2-1',
      'the pairs, then each lift-only room to the floor above (below on the top floor)',
    );
    const start = g.links[0].a,
      everything = unreachableFloorTiles(g.floors, start).filter(offCover(g)),
      byStairs = unreachableFloorTiles(g.floors, start, stairsOnly).filter(offCover(g));
    eq(everything.length, 0, `seed ${seed}: with the lifts, every tile`);
    const inLiftRoom = (s: FloorSpot) =>
      g.liftRooms.some(
        r => r.floor === s.floor && g.maps[s.floor].maps.roomOf[s.j * g.maps[s.floor].W + s.i] === r.room,
      );
    // by stairs alone: all of floor 2 and the lift-only rooms are out of reach, and nothing else
    ok(
      byStairs.every(s => s.floor === 2 || inLiftRoom(s)),
      'only floor 2 and the lift-only rooms are cut off',
    );
    ok(
      byStairs.some(s => s.floor === 2) &&
        g.liftRooms.every(r => byStairs.some(s => s.floor === r.floor && inLiftRoom(s))),
      'all of them',
    );
    for (const r of g.liftRooms) {
      const m = g.maps[r.floor],
        room = m.rooms[r.room];
      // walls all round, two tiles deep
      for (let j = room.y - 2; j < room.y + room.h + 2; j++)
        for (let i = room.x - 2; i < room.x + room.w + 2; i++) {
          const inside = i >= room.x && j >= room.y && i < room.x + room.w && j < room.y + room.h;
          if (!inside && i >= 0 && j >= 0 && i < m.W && j < m.H)
            eq(m.maps.grid[j * m.W + i], 0, 'a wall round the room');
        }
      const ends = g.links.flatMap(l => [l.a, l.b]).filter(s => s.floor === r.floor && inLiftRoom(s));
      eq(ends.length, 1, 'one link end in the room: its own lift');
    }
  }
  // no room for a lift-only room: it is left out
  const full = generateFloors(
    { floors: 2, dungeon: { map: 12, countMin: 1, countMax: 1, roomMin: 8, roomMax: 8 }, liftRooms: 2 },
    createRng(3),
  );
  eq(full.liftRooms.length, 0, 'no place, no room');
  eq(full.links.length, 1, 'just the stairs');
});
test('floorgen: options and wrong input', () => {
  const one = generateFloors({ floors: 1 }, createRng(1));
  eq([one.maps.length, one.links.length, one.floors.grids.length].join(','), '1,0,1', 'one floor, no links');
  const per = generateFloors({ floors: 2, dungeon: [{ map: 30 }, { map: 40 }], stairs: 0, floorH: 5 }, createRng(2));
  eq(per.maps.map(m => m.W).join(), '30,40', 'options per floor');
  eq(per.links.map(l => l.kind).join(), 'elevator', 'stairs: 0: a lift joins the pair instead');
  eq(per.floors.baseY.join(), '0,5', 'floorH');
  const many = generateFloors({ floors: 2, stairs: 3, stairsKind: 'ladder' }, createRng(4));
  eq(many.links.map(l => l.kind).join(), 'ladder,ladder,ladder', 'the kind and the count');
  expect(() => generateFloors({ floors: 0 }, createRng(1))).toThrow(/floors must be 1 or more/);
  expect(() => generateFloors({ floors: 1.5 }, createRng(1))).toThrow(/floors must be 1 or more/);
  expect(() => generateFloors({ floors: 2, dungeon: [{}] }, createRng(1))).toThrow(/2 floors but 1 dungeon options/);
  expect(() => generateFloors({ floors: 3, stairs: [1] }, createRng(1))).toThrow(/2 floor pairs but 1 stairs counts/);
  const tiny = { map: 12, countMin: 1, countMax: 1, roomMin: 4, roomMax: 4 };
  expect(() => generateFloors({ floors: 2, dungeon: tiny, stairs: 20 }, createRng(1))).toThrow(
    /floor 0 has no room tile left/,
  );
});
// ---- prop slots ----
const slotText = (s: Slot) => `${s.kind}@${s.i},${s.j}` + (s.side === undefined ? '' : `/${s.side}`);
test('slots: slotsOf finds wall faces, corners, middles, room floor, corridors and doorways', () => {
  // a 5 x 4 room, a door on its east side, a corridor behind it
  const d = tileMapFromRows(['##########', '#.....####', '#.....+..#', '#.....####', '#.....####', '##########'], {}, [
    { x: 1, y: 1, w: 5, h: 4 },
  ]);
  const list = slotsOf(d).map(slotText),
    of = (kind: string) => list.filter(t => t.startsWith(kind + '@'));
  eq(of('center').join(), 'center@3,3', 'the middle of the room');
  eq(of('corner').join(), 'corner@1,1,corner@5,1,corner@1,4,corner@5,4', 'the four corners, row by row');
  eq(of('floor').join(), 'floor@2,2,floor@3,2,floor@4,2,floor@5,2,floor@2,3,floor@4,3', 'room tiles with no wall');
  eq(of('doorway').join(), 'doorway@6,2', 'the door');
  eq(of('corridor').join(), 'corridor@7,2,corridor@8,2');
  ok(list.includes('wall@1,1/1') && list.includes('wall@1,1/3'), 'a corner has two wall faces (-x, -z)');
  eq(
    list.filter(t => t.startsWith('wall@8,2')).join(),
    'wall@8,2/0,wall@8,2/2,wall@8,2/3',
    'the corridor end: walls on +x, +z, -z',
  );
  ok(!list.some(t => t.startsWith('wall@6,2')), 'a door tile is only a doorway');
  eq(list.indexOf('wall@1,1/1') < list.indexOf('corner@1,1'), true, 'a tile lists its wall faces first');
  // decks, ramps and cover take no slots
  const deck = tileMapFromRows(['######', '#.>==#', '#.##.#', '######'], {}, [{ x: 1, y: 1, w: 4, h: 2 }]);
  ok(
    slotsOf(deck).every(s => deck.maps.hgt[s.j * deck.W + s.i] === 0 && deck.maps.ramp[s.j * deck.W + s.i] < 0),
    'flat tiles only',
  );
});
test('stairwells: floors made apart are joined by a stairwell and a lift, every floor reached, drawn open round them', () => {
  expect(new Set(Array.from({ length: 100 }, (_, n) => makeRoute(5, createRng(n)).join(''))).size).toBe(6);
  expect(makeRoute(3, createRng(1))).toEqual([0, 1, 2]);
  const STRIP = stripOf();
  expect(STRIP).toBe(STAIRWELL_DEFAULTS.floorH / RISE + 3);
  let done = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const rng = createRng(seed),
      opts = { map: 48, countMin: 4, countMax: 5 },
      maps = [0, 1, 2].map(() => generateDungeon(opts, rng)),
      W = maps[0]!.W,
      keepOut = maps.map(() => new Uint8Array(W * maps[0]!.H)),
      r = maps[0]!.rooms[0]!,
      start = Math.floor(r.y + r.h / 2) * W + Math.floor(r.x + r.w / 2),
      stairs = placeLink(maps, keepOut, true, 0, 1, { floor: 0, from: start, skip: 0 }, rng),
      lift = stairs && placeLink(maps, keepOut, false, 1, 2, { floor: 1, from: stairs.b, skip: -1 }, rng);
    if (!stairs || !lift) continue;
    done++;
    expect(stairs.strip.length).toBe(STRIP);
    // the lower floor: the strip is floor, rising to floorH; the upper floor: only the landing
    expect(stairs.strip.every(k => maps[1]!.maps.grid[k] === 1)).toBe(true);
    expect(maps[1]!.maps.hgt[stairs.strip[STRIP - 1]!]).toBe(STAIRWELL_DEFAULTS.floorH);
    expect(stairs.strip.map(k => maps[0]!.maps.grid[k])).toEqual([...Array(STRIP - 2).fill(0), 1, 1]);
    expect(maps[1]!.maps.grid[lift.a] === 1 && maps[2]!.maps.grid[lift.a] === 1).toBe(true);
    expect(allReached(maps, [stairs, lift], 0), `seed ${seed}`).toBe(true);
    const open = maps.map(m => noOpenings(m.W * m.H));
    markLinkOpenings(open, maps, [stairs, lift]);
    expect(open[0]!.noFloor[stairs.a]).toBe(1);
    expect(open[0]!.voids[stairs.strip[0]!], 'over the foot of the stairs: a hole').toBe(1);
    expect(open[1]!.noCeil[stairs.strip[0]!]).toBe(1);
    expect(open[2]!.noCeil[lift.a]).toBe(1);
  }
  expect(done, 'most seeds have room for both').toBeGreaterThan(3);
});
test('stairwells: two doors close along a corridor become one; a room shut only by doors is closable', () => {
  const d = tileMapFromRows(['#######', '#.....#', '#.....#', '###+###', '###.###', '###+###', '#.....#', '#######']);
  thinDoorPairs(d);
  const doors = Array.from(d.maps.door!).flatMap((v, k) => (v ? [k] : []));
  expect(doors.length, 'the second of the pair goes').toBe(1);
  const room = tileMapFromRows(['#####', '#AAA#', '#AAA#', '##+##', '##.##']);
  expect(roomDoors(room, 0)).toEqual({ doors: [3 * 5 + 2], closable: true });
});
test('slots: placeProps keeps blocking props out of the way, and the same seed repeats', () => {
  const rules: PropRule[] = [
    { id: 'crate', slots: ['corner', 'floor'], blocks: true, count: [6, 10] },
    { id: 'sign', slots: ['wall'], blocks: false, count: 12, gap: 3 },
    { id: 'lamp', slots: ['center'], blocks: false, count: 3 },
    { id: 'stuck', slots: ['wall', 'corridor', 'doorway'], blocks: true, count: 5 },
  ];
  for (const seed of [1, 7, 99, 123, 2024]) {
    const d = generateDungeon({ map: 36, doors: true, platform: 1, rubble: 0.1 }, createRng(seed)),
      W = d.W,
      r0 = d.rooms[0],
      keep = [Math.floor(r0.y + r0.h / 2) * W + Math.floor(r0.x + r0.w / 2)];
    const p = placeProps(d, rules, createRng(seed), keep),
      again = placeProps(d, rules, createRng(seed), keep);
    eq(JSON.stringify(p), JSON.stringify(again), 'repeats');
    const crates = p.filter(x => x.id === 'crate'),
      signs = p.filter(x => x.id === 'sign');
    ok(crates.length >= 6 && crates.length <= 10, `seed ${seed}: ${crates.length} crates`);
    eq(signs.length, 12, `seed ${seed}: signs`);
    eq(p.filter(x => x.id === 'lamp').length, 3);
    eq(p.filter(x => x.id === 'stuck').length, 0, 'a blocking prop never takes a wall, corridor or doorway slot');
    ok(
      p.every(x => rules.find(r => r.id === x.id)!.slots.includes(x.slot.kind)),
      'only the kinds a rule allows',
    );
    for (const a of signs)
      for (const b of signs)
        if (a !== b) ok(Math.max(Math.abs(a.slot.i - b.slot.i), Math.abs(a.slot.j - b.slot.j)) >= 3, 'gap');
    const tileOf = (x: { slot: Slot }) => x.slot.j * W + x.slot.i;
    for (const c of crates) {
      const k = tileOf(c);
      ok(p.filter(x => tileOf(x) === k).length === 1, 'nothing else on a crate tile');
      ok(!keep.includes(k), 'not on a kept tile');
      ok(![k - 1, k + 1, k - W, k + W].some(n => d.maps.door![n]), 'not next to a door');
    }
    eq(new Set(p.map(x => slotText(x.slot))).size, p.length, 'one prop per slot');
    // with the crates made solid, every tile that could be walked to still can be (cover never could)
    const grid = d.maps.grid.slice();
    crates.forEach(c => (grid[tileOf(c)] = 0));
    const n = W * d.H,
      world = (g: Uint8Array) => ({
        W,
        H: d.H,
        grid: g,
        hgt: d.maps.hgt,
        ramp: d.maps.ramp,
        cover: d.maps.cover,
        flow: new Int16Array(n),
        flowQ: new Int32Array(n),
      }),
      start = spot(0, keep[0] % W, Math.floor(keep[0] / W)),
      before = unreachableFloorTiles(createFloors([world(d.maps.grid)], [0], []), start).length,
      after = unreachableFloorTiles(createFloors([world(grid)], [0], []), start).length;
    eq(after, before, `seed ${seed}: nothing new cut off (only cover, ${before} tiles, was out of reach)`);
  }
});
test('slots: a blocking prop that would cut the way is not placed; the count is what fits', () => {
  // a room one tile wide: blocking the middle would cut off the east end
  const d = tileMapFromRows(['#######', '#.....#', '#######'], {}, [{ x: 1, y: 1, w: 5, h: 1 }]);
  eq(
    slotsOf(d)
      .filter(s => s.kind !== 'wall')
      .map(slotText)
      .join(),
    'corner@1,1,center@3,1,corner@5,1',
  );
  const p = placeProps(d, [{ id: 'crate', slots: ['corner', 'center'], blocks: true, count: 3 }], createRng(1));
  // the west corner is where the reach check starts (no keep given), the middle would cut the way: only the east corner
  eq(p.map(x => slotText(x.slot)).join(), 'corner@5,1');
  eq(placeProps(d, [{ id: 'x', slots: ['floor'], blocks: false, count: 4 }], createRng(1)).length, 0, 'no floor slots');
});

// ---- materials and part models ----
// a 1 x 1 PNG
const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
test('materials: textures from a drawing or an image, materials with a glow, shared or own', async () => {
  defineTexture('t.panel', {
    src: (g, size) => {
      g.fillStyle = '#ff0000';
      g.fillRect(0, 0, size, size);
    },
    size: 32,
  });
  defineTexture('t.eyes', { src: (g, size) => g.clearRect(0, 0, size, size), repeat: false });
  defineTexture('t.photo', { src: PIXEL_PNG });
  expect(() => defineTexture('t.panel', { src: () => {} })).toThrow(/texture defined twice: t.panel/);
  const panel = texture('t.panel');
  ok(panel === texture('t.panel'), 'made once, then shared');
  const img = panel.image as HTMLCanvasElement;
  eq(img.width, 32, 'the canvas side');
  eq(Array.from(img.getContext('2d')!.getImageData(5, 5, 1, 1).data).join(), '255,0,0,255', 'drawn once');
  eq(panel.wrapS, THREE.RepeatWrapping, 'repeats by default');
  eq(texture('t.eyes').wrapS, THREE.ClampToEdgeWrapping, 'repeat: false');
  const photo = texture('t.photo');
  await texturesReady();
  eq((photo.image as HTMLImageElement).width, 1, 'the image is loaded');
  expect(() => texture('t.none')).toThrow(/unknown texture t.none/);

  defineMaterial('m.body', { map: 't.panel', glow: 't.eyes', emissiveIntensity: 0.4 });
  defineMaterial('m.flat', { color: 0x00ff00, lit: false, opacity: 0.5 });
  const body = material('m.body') as THREE.MeshLambertMaterial;
  ok(body instanceof THREE.MeshLambertMaterial && body === material('m.body'), 'one shared Lambert material');
  ok(body.userData.shared, 'marked shared: disposeTree keeps it');
  ok(body.map === panel && body.emissiveMap === texture('t.eyes'), 'surface and glow textures');
  eq(body.emissive.getHex(), 0xffffff, 'a glow texture glows white unless told otherwise');
  eq(body.emissiveIntensity, 0.4);
  const flat = material('m.flat');
  ok(flat instanceof THREE.MeshBasicMaterial && flat.transparent && flat.opacity === 0.5, 'unlit, see-through');
  eq((flat as THREE.MeshBasicMaterial).color.getHex(), 0x00ff00);
  const mine = ownMaterial('m.body') as THREE.MeshLambertMaterial;
  ok(mine !== body && !mine.userData.shared && mine.map === panel, 'an own copy with the shared textures');
  mine.emissiveIntensity = 3;
  eq(body.emissiveIntensity, 0.4, 'flashing the own copy leaves the shared one alone');
  // disposing a mesh with an own material frees the material, not the shared texture
  let freed = 0;
  const keep = panel.dispose;
  panel.dispose = () => {
    freed++;
  };
  disposeTree(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mine));
  panel.dispose = keep;
  eq(freed, 0, 'the texture stays');
  expect(() => material('m.none')).toThrow(/unknown material m.none/);
  expect(() => defineMaterial('m.body', {})).toThrow(/material defined twice/);
});
test('materials: buildParts makes a model of parts, sharing geometry, with its own materials when asked', () => {
  defineMaterial('m.armor', { color: 0x334455 });
  defineMaterial('m.light', { color: 0xffaa00, lit: false });
  const parts = [
    { shape: 'box' as const, size: [1, 0.6, 1.2], mat: 'm.armor', pos: [0, 0.5, 0] as [number, number, number] },
    {
      shape: 'cylinder' as const,
      size: [0.1, 0.8],
      mat: 'm.armor',
      pos: [0.6, 0.5, 0] as [number, number, number],
      rot: [0, 0, Math.PI / 2] as [number, number, number],
    },
    { shape: 'sphere' as const, size: [0.1], mat: 'm.light', pos: [0, 0.6, -0.6] as [number, number, number] },
    { shape: 'cylinder' as const, size: [0.1, 0.2, 0.5], mat: 'm.armor' },
    { shape: 'cone' as const, size: [0.2, 0.4], mat: 'm.light' },
    { shape: 'tetra' as const, size: [0.3], mat: 'm.armor' },
    { shape: 'octa' as const, size: [0.3], mat: 'm.armor' },
    { shape: 'ico' as const, size: [0.3], mat: 'm.armor' },
  ];
  const a = buildParts(parts),
    b = buildParts(parts, { own: true });
  eq(a.group.children.length, parts.length, 'one mesh per part');
  const m0 = a.group.children[0] as THREE.Mesh,
    m1 = a.group.children[1] as THREE.Mesh;
  eq(m0.position.y, 0.5, 'placed');
  near(m1.rotation.z, Math.PI / 2, 1e-9, 'turned');
  ok(m0.material === material('m.armor'), 'shared materials by default');
  eq(a.mats.length, 0);
  ok((b.group.children[0] as THREE.Mesh).geometry === m0.geometry, 'the same shape and size share one geometry');
  ok(m0.geometry.userData.shared, 'kept by disposeTree');
  eq(b.mats.length, 2, 'own: one material per name');
  ok((b.group.children[0] as THREE.Mesh).material === b.mats[0], 'the first name first');
  ok((b.group.children[1] as THREE.Mesh).material === b.mats[0], 'parts with the same name share it');
  ok(b.mats[0] !== material('m.armor'), 'not the shared one');
  expect(() => buildParts([{ shape: 'box', size: [1, 1, 1], mat: 'm.none' }])).toThrow(/unknown material m.none/);
  expect(() => buildParts([{ shape: 'blob' as never, size: [1], mat: 'm.armor' }])).toThrow(/unknown part shape blob/);
});

// ---- the 3D detail map ----
test('floormap3d: floors as slabs of the tiles that show, links as lines, the viewer on its floor, drag to turn', () => {
  const { f } = crossFloors(),
    c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:200px';
  document.body.appendChild(c);
  const map = createFloorMap3D(c);
  // floor 0 all shown, floor 1 only its first floor row (rows 0-1), floor 2 nothing; only the stairs drawn
  const style = {
    tile: (floor: number, k: number) => {
      const w = f.grids[floor].world;
      if (!w.grid[k] || floor === 2) return null;
      return floor === 1 && k >= 2 * w.W ? null : { color: floor ? '#00ff00' : '#ff0000', alpha: 1 };
    },
    link: (l: FloorLink) => (l.kind === 'stairs' ? '#ffff00' : null),
  };
  map.build(f, style, T);
  const slabs = map.scene.children[0].children.filter(o => o instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
  eq(
    slabs.map(m => `${m.userData.floor}:${m.count}`).join(),
    '0:5,1:5',
    'one slab mesh per floor with tiles: 5 each (the door is a floor tile)',
  );
  // drawn from the lowest floor up, without writing depth: seen from above (always), that is back to front
  eq(slabs.map(m => m.renderOrder).join(), '0,1');
  ok(slabs.every(m => !(m.material as THREE.Material).depthWrite));
  const at = new THREE.Matrix4(),
    p = new THREE.Vector3();
  slabs[1].getMatrixAt(0, at);
  p.setFromMatrixPosition(at);
  eq([p.x, p.y, p.z].join(), '1.5,8,1.5', 'floor 1, tile (1, 1): one floor gap up');
  const lines = map.scene.children[0].children.find(o => o.userData.links) as THREE.LineSegments;
  eq(lines.geometry.getAttribute('position').count, 2, 'the stairs only: one line, two ends');
  map.draw({
    floor: 1,
    viewer: { x: 3.5 * T, z: 1.5 * T, yaw: 0.5 },
    markers: [{ floor: 0, x: 1.5 * T, z: 1.5 * T, color: '#00ffff' }],
  });
  const dyn = map.scene.children[1].children,
    viewer = dyn.find(o => o.userData.viewer) as THREE.Mesh;
  near(viewer.position.x, 3.5, 1e-9, 'the viewer in tiles');
  near(viewer.position.z, 1.5, 1e-9);
  ok(viewer.position.y > 8 && viewer.position.y < 9, 'on floor 1');
  eq(viewer.rotation.y, 0.5, 'facing its yaw');
  eq(dyn.length, 2, 'the viewer and one marker');
  const opac = slabs.map(m => (m.material as THREE.MeshBasicMaterial).opacity);
  ok(opac[1] > opac[0], 'the viewer floor is bright, the others dimmed');
  // something was drawn
  const probe = document.createElement('canvas');
  probe.width = c.width;
  probe.height = c.height;
  const pg = probe.getContext('2d')!;
  pg.drawImage(c, 0, 0);
  const px = pg.getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let k = 3; k < px.length; k += 4) if (px[k] > 0) lit++;
  ok(lit > 0, `${lit} pixels drawn`);
  // drag turns the view, the tilt stays in its range
  const yaw0 = map.yaw;
  c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: 100, clientY: 100, bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 150, clientY: 100 }));
  near(map.yaw, yaw0 - 50 * 0.008, 1e-9, 'left-right turns around');
  window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 150, clientY: 5000 }));
  ok(map.pitch <= 1.45, 'tilt capped');
  window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 8, clientX: 900, clientY: 100 }));
  near(map.yaw, yaw0 - 50 * 0.008, 1e-9, 'another pointer does not turn it');
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 }));
  window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 300, clientY: 100 }));
  near(map.yaw, yaw0 - 50 * 0.008, 1e-9, 'released');
  // two pointers: pinching out zooms in, moving them together moves where the camera looks; the turn is left alone
  const yaw1 = map.yaw,
    ptr = (type: string, id: number, x: number, y: number, target: EventTarget = window) =>
      target.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true }));
  eq(map.zoom, 1);
  ptr('pointerdown', 1, 80, 100, c);
  ptr('pointerdown', 2, 120, 100, c);
  ptr('pointermove', 2, 160, 100); // 40 px apart -> 80 px apart
  ok(map.zoom < 0.75 && map.zoom >= 0.3, `pinching out comes closer (${map.zoom})`);
  eq(map.yaw, yaw1, 'two pointers do not turn the map');
  const zoomed = map.zoom,
    pan0 = [map.panX, map.panZ].join();
  ptr('pointermove', 1, 80, 140);
  ptr('pointermove', 2, 160, 140); // both down by 40 px: the same spread, the map moves
  near(map.zoom, zoomed, 1e-9, 'moving both without pinching keeps the zoom');
  ok([map.panX, map.panZ].join() !== pan0, 'the look-at point moved');
  ptr('pointermove', 2, 9000, 9000);
  ok(
    map.zoom >= 0.3 && Math.abs(map.panX) <= 3.5 + 1e-9 && Math.abs(map.panZ) <= 2.5 + 1e-9,
    'zoom and pan are capped',
  );
  ptr('pointerdown', 3, 10, 10, c); // a third pointer is ignored
  ptr('pointerup', 1, 0, 0);
  ptr('pointerup', 2, 0, 0);
  // the wheel zooms; the right button drags the map instead of turning it
  map.zoom = 1;
  c.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, bubbles: true, cancelable: true }));
  ok(map.zoom < 1, 'wheel up comes closer');
  c.dispatchEvent(new WheelEvent('wheel', { deltaY: 1e6, bubbles: true, cancelable: true }));
  eq(map.zoom, 1.5, 'capped');
  map.panX = 0;
  map.panZ = 0;
  c.dispatchEvent(
    new PointerEvent('pointerdown', { pointerId: 5, clientX: 50, clientY: 50, button: 2, bubbles: true }),
  );
  ptr('pointermove', 5, 70, 50);
  eq(map.yaw, yaw1, 'the right button does not turn');
  ok(map.panX !== 0 || map.panZ !== 0, 'it moves the map');
  ptr('pointerup', 5, 0, 0);
  map.draw({ floor: 0, viewer: { x: T, z: T, yaw: 0 } });
  // building again replaces the slabs
  map.build(f, { tile: (floor, k) => (f.grids[floor].world.grid[k] ? { color: '#ffffff', alpha: 1 } : null) }, T);
  eq(map.scene.children[0].children.length, 3, 'all three floors, no links drawn');
  map.dispose();
  c.remove();
});

test('langslots: withLang puts the blank language fields in every entry first, the entry wins', () => {
  type Def = { hp: number; name: string; desc: string };
  const table = withLang<Def, 'name' | 'desc'>({ a: { hp: 1 }, b: { hp: 2 } }, { name: '', desc: '' });
  expect(table.a).toEqual({ hp: 1, name: '', desc: '' });
  expect(table.b!.hp).toBe(2);
  const list = withLang<Def, 'name' | 'desc'>([{ hp: 3 }], { name: '-', desc: '' });
  expect(list).toEqual([{ hp: 3, name: '-', desc: '' }]);
});
test('dom: rowsHTML makes the rows of a <dl>, onDataClick hands the nearest data attribute to the first match', () => {
  expect(
    rowsHTML([
      ['HP', 10],
      ['Name', 'x'],
    ]),
  ).toBe('<div><dt>HP</dt><dd>10</dd></div><div><dt>Name</dt><dd>x</dd></div>');
  const root = document.createElement('div');
  root.innerHTML = '<div data-tab="b"><span data-buy="7"><i id="leaf">x</i></span></div><p id="none">-</p>';
  document.body.appendChild(root);
  const got: string[] = [];
  onDataClick(root, ['buy', v => got.push(`buy ${v}`)], ['tab', v => got.push(`tab ${v}`)]);
  root.querySelector<HTMLElement>('#leaf')!.click();
  root.querySelector<HTMLElement>('[data-tab]')!.click();
  root.querySelector<HTMLElement>('#none')!.click();
  expect(got, 'the first entry that matches only; nothing for a plain element').toEqual(['buy 7', 'tab b']);
  root.remove();
});
test("walls: a wall's faces, the outside wall and a thin wall, which way a face looks", () => {
  const d = tileMapFromRows(['#######', '#..#..#', '#######', '#######', '#.....#', '#######']),
    at = (i: number, j: number) => j * d.W + i;
  expect(floorSides(d, at(3, 1)), 'floor on both sides').toEqual([
    [1, 0],
    [-1, 0],
  ]);
  expect(floorSides(d, at(3, 2)), 'seen from no floor').toEqual([]);
  expect(wallSide(d, at(0, 1)), 'the map edge behind it').toBe('outer');
  expect(wallSide(d, at(1, 0)), 'the map edge behind it').toBe('outer');
  expect(wallSide(d, at(3, 1)), 'floor right behind it, on both sides').toBe('inner');
  expect(wallSide(d, at(1, 2)), 'floor further behind it').toBeNull();
  expect(wallSide(d, at(3, 2)), 'seen from no floor').toBeNull();
  // the wall on a room's -x side looks toward -x (its floor is on the +x side)
  expect(facesToward(d, at(0, 1), [-1, 0])).toBe(true);
  expect(facesToward(d, at(6, 1), [-1, 0])).toBe(false);
  expect(facesToward(d, at(6, 1), [1, 0])).toBe(true);
  expect(facesToward(d, at(1, 0), [0, -1]), 'the top wall looks toward -z').toBe(true);
});
test('windows: panes on the faces mark the stencil, the backdrop is drawn only there and stays round the eye', () => {
  expect(buildWindowPanes([], 6)).toBeNull();
  // two panes on the -x face of tile (2, 3), seen from the floor at (3, 3)
  const panes = buildWindowPanes(
    [
      {
        i: 2,
        j: 3,
        di: 1,
        dj: 0,
        rects: [
          [0, 0.5, 0.5, 1],
          [0.5, 0.5, 1, 1],
        ],
      },
    ],
    6,
  )!;
  expect(panes.count).toBe(2);
  expect(panes.renderOrder).toBe(WINDOW_ORDER);
  const m = new THREE.Matrix4(),
    p = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    s = new THREE.Vector3();
  panes.getMatrixAt(0, m);
  m.decompose(p, q, s);
  expect(p.x, 'just in front of the face, toward the floor').toBeCloseTo(3 * T + 0.02);
  expect(p.y, 'the lower half of the face').toBeCloseTo(1.5);
  expect(s.x).toBeCloseTo(T / 2);
  expect(s.y).toBeCloseTo(3);
  // its front toward the floor (+x); the face's left as seen from there is toward +z
  expect(new THREE.Vector3(0, 0, 1).applyQuaternion(q).x).toBeCloseTo(1);
  expect(p.z, 'the left pane').toBeCloseTo(3.5 * T + T / 4);
  const pm = panes.material as THREE.MeshBasicMaterial;
  expect([pm.colorWrite, pm.stencilWrite, pm.stencilZPass]).toEqual([false, true, THREE.ReplaceStencilOp]);
  // the same panes again once the view out is drawn: only their depth, where the stencil is marked, so what is drawn
  // after (the see-through things of the floor) is not seen in the window from behind the wall
  const seal = panes.children[0] as THREE.InstancedMesh,
    sm = seal.material as THREE.MeshBasicMaterial;
  expect(seal.count).toBe(panes.count);
  expect(seal.renderOrder).toBeGreaterThan(WINDOW_ORDER + 3);
  expect([sm.colorWrite, sm.depthWrite, sm.depthFunc, sm.stencilFunc]).toEqual([
    false,
    true,
    THREE.AlwaysDepth,
    THREE.EqualStencilFunc,
  ]);
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(7, 2, -5);
  cam.updateMatrixWorld();
  // (where a part of it goes, the eye being at cam)
  const placed = (m: THREE.Mesh) => {
    m.onBeforeRender(
      {} as THREE.WebGLRenderer,
      new THREE.Scene(),
      cam,
      m.geometry,
      m.material as THREE.Material,
      {} as THREE.Group,
    );
    return m.position.toArray();
  };
  // the band alone: one cylinder round the eye
  const bare = buildBackdrop(new THREE.Texture(), 100, 80).children as THREE.Mesh[];
  expect(bare.length, 'the band and the floor under it (depth only)').toBe(2);
  expect((bare[1]!.material as THREE.Material).colorWrite).toBe(false);
  const back = bare[0]!,
    bm = back.material as THREE.MeshBasicMaterial;
  expect(back.renderOrder).toBe(WINDOW_ORDER + 1);
  expect([bm.depthFunc, bm.stencilFunc, bm.fog]).toEqual([THREE.AlwaysDepth, THREE.EqualStencilFunc, false]);
  expect(placed(back)).toEqual([7, 2, -5]);
  // closed above and below: a lid at the band's top edge, and the ground at groundY, drawn over the band
  const ground = new THREE.Texture(),
    closed = buildBackdrop(new THREE.Texture(), 100, 80, {
      sky: 0x112233,
      ground: { map: ground, tile: 64, clear: 30, fade: 150, haze: 0x445566 },
    }),
    [band, lid, , floor] = closed.children as THREE.Mesh[];
  closed.groundY = -22; // (24 m under the eye)
  expect(placed(band!)).toEqual([7, 2, -5]);
  const bandMat = band!.material as THREE.Material;
  expect([bandMat.depthTest, bandMat.depthFunc, bandMat.depthWrite], 'the band leaves its depth').toEqual([
    true,
    THREE.AlwaysDepth,
    true,
  ]);
  expect(placed(lid!)).toEqual([7, 42, -5]);
  expect((lid!.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x112233);
  expect(floor!.renderOrder).toBe(WINDOW_ORDER + 2);
  const fm = floor!.material as THREE.ShaderMaterial;
  expect([fm.depthTest, fm.depthWrite, fm.stencilFunc]).toEqual([false, false, THREE.EqualStencilFunc]);
  // drawn shrunk toward the eye: its edge as far as the band, just under the horizon; the picture by the true metres
  const [fx, fy, fz] = placed(floor!),
    out = fm.uniforms.reachOut!.value as number,
    shrink = floor!.scale.x / out;
  expect([fx, fz]).toEqual([7, -5]);
  expect(fy).toBeCloseTo(2 - 24 * shrink);
  expect(Math.hypot(out, 24) * shrink).toBeCloseTo(100);
  expect((Math.atan2(24, out) * 180) / Math.PI).toBeLessThan(1);
  expect([fm.uniforms.tile!.value, fm.uniforms.clear!.value, fm.uniforms.fade!.value]).toEqual([64, 30, 150]);
  expect(ground.wrapS, 'the ground repeats').toBe(THREE.RepeatWrapping);
});
test('windows: the buildings out there are only the faces asked for and the roof, each face in its own light', () => {
  const facade = new THREE.Texture(),
    roof = new THREE.Texture(),
    group = buildOutsideBlocks(
      [{ x0: 0, z0: 0, x1: 16, z1: 16, top: 28, sides: [1, 3], facade: 0, roof: 0 }],
      {
        facades: [facade],
        storey: [16, 14],
        roofs: [roof],
        roofTile: 16,
        light: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
          [1, 1, 1],
        ],
        roofLight: [0.5, 0.5, 0.5],
        haze: 0x445566,
        clear: 40,
        fade: 140,
        reach: 400,
      },
      100,
    );
  const [walls, top] = group.children as THREE.Mesh[],
    pos = walls!.geometry.getAttribute('position'),
    uv = walls!.geometry.getAttribute('uv'),
    tint = walls!.geometry.getAttribute('tint');
  expect(pos.count, 'two faces of two triangles').toBe(12);
  expect(top!.geometry.getAttribute('position').count, 'the roof').toBe(6);
  // the first face asked for: side 1, at x = x0, in side 1's light; the picture repeats 16 m across, 14 m up
  expect([pos.getX(0), pos.getX(2)]).toEqual([0, 0]);
  expect([tint.getX(0), tint.getY(0), tint.getZ(0)]).toEqual([0, 1, 0]);
  expect(Math.max(...Array.from({ length: 6 }, (_, k) => uv.getY(k)))).toBeCloseTo(2);
  expect(Math.max(...Array.from({ length: 6 }, (_, k) => uv.getX(k)))).toBeCloseTo(1);
  // the second: side 3, at z = z0
  expect([pos.getZ(6), pos.getZ(8)]).toEqual([0, 0]);
  expect(top!.geometry.getAttribute('position').getY(0)).toBe(28);
  const m = walls!.material as THREE.ShaderMaterial;
  expect(walls!.renderOrder).toBe(WINDOW_ORDER + 3);
  expect([m.depthTest, m.depthWrite, m.stencilFunc]).toEqual([true, true, THREE.EqualStencilFunc]);
  // drawn shrunk toward the eye: a block `reach` away comes inside the band
  expect(m.uniforms.shrink!.value * 400).toBeLessThan(100);
  expect(facade.wrapS).toBe(THREE.RepeatWrapping);
});
test('paint: the same seed paints the same picture; the strokes cover the canvas or the size given', () => {
  const pixels = (t: THREE.CanvasTexture) => {
    const c = t.image as HTMLCanvasElement;
    return Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data);
  };
  const art = (g: CanvasRenderingContext2D, rand: () => number) => {
    g.fillStyle = '#556677';
    g.fillRect(0, 0, 64, 64);
    grime(g, rand, 20, '#fff', '#000');
    grain(g, rand, 30);
    stripes(g, [0, 40, 64, 10], 8, '#ff0', '#000', 'rgba(0,0,0,.3)');
    block(g, 4, 4, 20, 12, '#884422');
    soil(g, rand, 64, 64, 32);
    words(g, 'A', 32, 20, 10, 0.5);
  };
  const a = paintTex(7, art, 64),
    b = paintTex(7, art, 64),
    c = paintTex(8, art, 64);
  expect((a.image as HTMLCanvasElement).width).toBe(64);
  expect(pixels(a)).toEqual(pixels(b));
  expect(pixels(a)).not.toEqual(pixels(c));
  expect(paintRand(3)()).toBe(paintRand(3)());
  expect(paintTex(1, () => {}, 32, true).wrapS).toBe(THREE.RepeatWrapping);
  expect((canvasTex(80, 20, () => {}).image as HTMLCanvasElement).height).toBe(20);
  expect(poolTex(), 'one picture for all the pools').toBe(poolTex());
  // a smudge near one edge runs on round the other edge (the next tile)
  const wrap = canvasTex(32, 32, g => smudge(g, 1, 16, 6, 6, '255,0,0', 1)),
    edge = (wrap.image as HTMLCanvasElement).getContext('2d')!.getImageData(31, 16, 1, 1).data;
  expect(edge[3]).toBeGreaterThan(0);
  // grain only over the size given
  const part = canvasTex(32, 32, g => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, 32, 32);
      grain(g, paintRand(1), 80, 16, 16);
    }),
    pg = (part.image as HTMLCanvasElement).getContext('2d')!;
  expect(Array.from(pg.getImageData(20, 20, 1, 1).data), 'outside: as painted').toEqual([128, 128, 128, 255]);
});

test('fogcull: a thing past the fog (and its reach) is hidden, one in it shown; without a fog all are shown', () => {
  const at = (x: number) => {
      const mesh = new THREE.Group();
      mesh.position.set(x, 0, 0);
      return { mesh };
    },
    near = at(10),
    edge = at(42),
    far = at(60),
    eye = new THREE.Vector3(0, 1.6, 0);
  hideInFog([near, edge, far], eye, new THREE.Fog(0, 4, 40), 3);
  expect([near.mesh.visible, edge.mesh.visible, far.mesh.visible]).toEqual([true, true, false]);
  hideInFog([near, edge, far], eye, null, 3);
  expect(far.mesh.visible, 'no fog: shown again').toBe(true);
});
