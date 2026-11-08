import { expect, test, vi } from 'vitest';
import { clamp, createRng, distXZ, pct, randi, shuffle, turnToward, wrapAngle, yawToward } from '../src/core/util.ts';
import {
  clearStore,
  decodeStore,
  encodeStore,
  loadStore,
  packBits,
  prefGet,
  prefSet,
  saveStore,
  unpackBits,
} from '../src/core/store.ts';
import { LOOP, addSystem, frameDue, loopFrame, runSystems, stopFrame } from '../src/core/loop.ts';
import { WORLD, clearWorld, query, spawn, worldGroup } from '../src/core/world.ts';
import { LANG, fillData, lang, setI18nHook, setLang, t } from '../src/core/i18n.ts';
import { ANALYTICS, TRACK_LOG, track } from '../src/core/analytics.ts';
import { FEEDBACK, FEEDBACK_INFO_MAX, feedbackReady, feedbackUrl } from '../src/core/feedback.ts';
import { renderer } from '../src/render/render.ts';

import { showFps } from '../src/core/dev.ts';
import { withLang } from '../src/core/langslots.ts';
import { eq, near, ok } from './helpers.ts';

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
test('loop: LOOP.maxFps draws every other frame of a 120 Hz screen, and about 60 a second of a 90 Hz one', () => {
  // (a screen's frames from `from` ms on: each run starts later than the one before)
  const at = (from: number, hz: number, n: number) => Array.from({ length: n }, (_, k) => from + (k * 1000) / hz),
    count = (times: number[]) => times.filter(frameDue).length;
  LOOP.maxFps = 60;
  expect(count(at(1e6, 120, 120))).toBe(60);
  expect(Math.abs(count(at(2e6, 90, 90)) - 60)).toBeLessThanOrEqual(1);
  // after a stall, it starts again from then (not a burst of the frames it missed)
  expect(count([9e6, 9e6 + 8.3, 9e6 + 16.7])).toBe(2);
  LOOP.maxFps = 0;
  expect(count(at(1e7, 144, 10))).toBe(10);
});
test('loop: LOOP.draw false draws nothing, and clears the screen once', () => {
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
  const render = vi.spyOn(renderer, 'render');
  const clear = vi.spyOn(renderer, 'clear');
  const maxFps = LOOP.maxFps;
  LOOP.maxFps = 0;
  const sys = addSystem({ name: 't-nodraw', update: () => {} });
  try {
    LOOP.draw = false;
    loopFrame(1e9);
    eq(clear.mock.calls.length, 1, 'the last frame is cleared once');
    loopFrame(1e9 + 16);
    eq(clear.mock.calls.length, 1, 'the screen is left alone after that');
    eq(render.mock.calls.length, 0, 'nothing is drawn while LOOP.draw is false');
    LOOP.draw = true;
    loopFrame(1e9 + 32);
    ok(render.mock.calls.length > 0, 'draws again once LOOP.draw is true');
  } finally {
    LOOP.draw = true;
    LOOP.maxFps = maxFps;
    sys.enabled = false;
    render.mockRestore();
    clear.mockRestore();
    raf.mockRestore();
  }
});
test('dev: showFps counts the frames drawn and shows them after a second', async () => {
  const before = document.body.children.length;
  showFps(() => 'more');
  const box = document.body.lastElementChild as HTMLElement;
  expect(document.body.children.length).toBe(before + 1);
  await new Promise(r => setTimeout(r, 1200));
  expect(box.textContent).toMatch(/^\d+ fps {2}more$/);
  box.remove();
});
test('util: distXZ ignores y', () => {
  near(distXZ({ x: 1, z: 2 }, { x: 4, z: 6 }), 5);
  near(distXZ({ x: 0, z: 0, y: 9 } as { x: number; z: number }, { x: 0, z: 0 }), 0);
});
test('util: yawToward / wrapAngle / turnToward', () => {
  near(yawToward(0, -1), 0); // straight ahead is -z
  near(yawToward(-1, 0), Math.PI / 2); // left is positive
  near(yawToward(1, 0), -Math.PI / 2);
  near(Math.abs(yawToward(0, 1)), Math.PI);
  near(wrapAngle(Math.PI * 2 + 0.25), 0.25);
  near(wrapAngle(-Math.PI * 1.5), Math.PI / 2);
  // the shorter way round, never more than max
  near(turnToward(0, 0.3, 0.1), 0.1);
  near(turnToward(0, -0.05, 0.1), -0.05);
  near(turnToward(Math.PI - 0.1, -Math.PI + 0.1, 0.5), Math.PI + 0.1); // across ±π, not back through 0
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

test('store: flags packed to text and back, a broken text leaving them as they were', () => {
  const bits = Uint8Array.from({ length: 21 }, (_, k) => (k % 3 === 0 || k === 20 ? 1 : 0)),
    back = new Uint8Array(21);
  const text = packBits(bits);
  expect(text.length, '21 flags take 3 characters, then base64').toBe(4);
  expect(unpackBits(text, back)).toBe(true);
  expect(Array.from(back)).toEqual(Array.from(bits));
  const kept = Uint8Array.from([1, 0, 1]);
  expect(unpackBits('not base64 !', kept)).toBe(false);
  expect(Array.from(kept)).toEqual([1, 0, 1]);
  // nothing saved: every flag off
  expect(unpackBits('', kept)).toBe(true);
  expect(Array.from(kept)).toEqual([0, 0, 0]);
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

test('langslots: withLang puts the blank language fields in every entry first, the entry wins', () => {
  type Def = { hp: number; name: string; desc: string };
  const table = withLang<Def, 'name' | 'desc'>({ a: { hp: 1 }, b: { hp: 2 } }, { name: '', desc: '' });
  expect(table.a).toEqual({ hp: 1, name: '', desc: '' });
  expect(table.b!.hp).toBe(2);
  const list = withLang<Def, 'name' | 'desc'>([{ hp: 3 }], { name: '-', desc: '' });
  expect(list).toEqual([{ hp: 3, name: '-', desc: '' }]);
});
