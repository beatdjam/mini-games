import * as THREE from 'three';
import { $, clamp, pct, randi, shuffle } from '../core/util.ts';
import { clearStore, decodeStore, encodeStore, loadStore, prefGet, prefSet, saveStore } from '../core/store.ts';
import { addSystem, runSystems, stopFrame } from '../core/loop.ts';
import { WORLD, clearWorld, query, spawn, worldGroup } from '../core/world.ts';
import { LANG, fillData, lang, setI18nHook, setLang, t } from '../core/i18n.ts';
import { ANALYTICS, TRACK_LOG, track } from '../core/analytics.ts';
import { FEEDBACK, FEEDBACK_INFO_MAX, feedbackReady, feedbackUrl } from '../core/feedback.ts';
import { buildViewmodel } from '../render/render.ts';
import { burst, clearFx, fireball, parts, updateBalls } from '../render/fx.ts';
import { RISE, T, W, computeFlow, floorY, flowAt, flowDir, grid, hasLOS, hgt, moveCircle, ramp, setTileWorld, solidAt } from '../world/tiles.ts';
import { type Projectile, aimFan, clearPool, projHitsTerrain, ringAngles, steerToward, stepProjectile, takeFromPool } from '../world/projectiles.ts';
import { steerChase } from '../world/steer.ts';
import { toast } from '../ui/ui.ts';
import { INPUT, fireHeld, keys, lookDelta, mouseFire, releaseInputs } from '../ui/input.ts';
import { TOUCH_LAYOUT, applyLayout, editing, getL, openLayoutEditor } from '../ui/touchlayout.ts';
// Engine tests: open engine/test/ in a browser, or run  tools/headless.sh 'engine/test/' 20000
// Each test logs 'TEST ok <name>' or 'TEST FAIL <name> <reason>'; the last line is 'TEST DONE <passed>/<total>'.
export const results: [string, boolean][] = [];
export function test(name: string, fn: () => void) {
  try { fn(); results.push([name, true]); console.log('TEST ok ' + name); }
  catch (e) { results.push([name, false]); console.error('TEST FAIL ' + name + ' ' + (e instanceof Error ? e.message : e)); }
}
export function eq(a: unknown, b: unknown, what?: string) { if (a !== b) throw new Error(`${what || 'value'}: expected ${b}, got ${a}`); }
export function near(a: number, b: number, eps?: number, what?: string) { if (Math.abs(a - b) > (eps ?? 1e-9)) throw new Error(`${what || 'value'}: expected ~${b}, got ${a}`); }
export function ok(cond: unknown, what?: string) { if (!cond) throw new Error(what || 'expected true'); }

// ---------- core ----------
test('store: save codes round-trip, reject edits, other tags and cut-off codes', () => {
  const obj = { bits: 1234, name: 'テスト', list: [1, null, { a: true }] };
  const code = encodeStore('T1', obj);
  ok(/^T1:[A-Za-z0-9_-]+\.[0-9a-f]{8}$/.test(code), 'format ' + code);
  ok(!code.includes('bits'), 'not plain JSON');
  eq(JSON.stringify(decodeStore('T1', code)), JSON.stringify(obj), 'round trip');
  eq(JSON.stringify(decodeStore('T1', ' ' + code.slice(0, 10) + '\n' + code.slice(10) + ' ')), JSON.stringify(obj), 'whitespace ignored');
  const i = code.indexOf(':') + 5, edited = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
  eq(decodeStore('T1', edited), null, 'edited'); eq(decodeStore('T2', code), null, 'other tag');
  eq(decodeStore('T1', code.slice(0, -3)), null, 'cut off'); eq(decodeStore('T1', 'hello'), null, 'garbage');
});
test('analytics: track records the event and passes it to the GA tag when there is one', () => {
  const n = TRACK_LOG.length;
  track('test_event', { a: 1 });
  eq(TRACK_LOG.length, n + 1, 'recorded'); eq(TRACK_LOG[TRACK_LOG.length - 1]!.name, 'test_event');
  const sent: unknown[][] = [];
  window.gtag = (...args: unknown[]) => { sent.push(args); };
  try { track('test_event2', { b: 'x' }); } finally { delete window.gtag; }
  eq(sent.length, 1, 'gtag called'); eq(sent[0]![0], 'event'); eq(sent[0]![1], 'test_event2');
  ANALYTICS.game = 'g1'; track('with_game', { a: 2 }); ANALYTICS.game = '';
  eq(TRACK_LOG[TRACK_LOG.length - 1]!.params.game, 'g1', 'game id added');
  for (let k = 0; k < 60; k++) track('fill');
  eq(TRACK_LOG.length, 50, 'log keeps the last 50');
});
test('feedback: no form, no link; with one, the game, build and info are filled in', () => {
  eq(feedbackUrl('x', { url: '', game: '1', build: '2', info: '3' }), null, 'no form');
  ok(!feedbackReady({ url: '', game: '', build: '', info: '' }), 'not ready');
  const form = { url: 'https://docs.google.com/forms/d/e/abc/viewform', game: '11', build: '22', info: '33' };
  FEEDBACK.game = 'g1';
  const u = new URL(feedbackUrl('D3 BOSS & more', form)!); FEEDBACK.game = '';
  eq(u.origin + u.pathname, form.url, 'address'); eq(u.searchParams.get('usp'), 'pp_url');
  eq(u.searchParams.get('entry.11'), 'g1', 'game'); eq(u.searchParams.get('entry.22'), 'dev', 'build on the dev server');
  eq(u.searchParams.get('entry.33'), 'D3 BOSS & more', 'info');
  const long = new URL(feedbackUrl('a'.repeat(5000), form)!).searchParams.get('entry.33')!;
  eq(long.length, FEEDBACK_INFO_MAX, 'info cut'); ok(long.endsWith('…'), 'cut is marked');
  ok(!new URL(feedbackUrl('', form)!).searchParams.has('entry.33'), 'empty info left out');
});
test('util: clamp / randi / shuffle', () => {
  eq(clamp(5, 0, 3), 3); eq(clamp(-1, 0, 3), 0);
  for (let k = 0; k < 50; k++) { const v = randi(2, 4); ok(v >= 2 && v <= 4 && Number.isInteger(v), 'randi range'); }
  const a = [1, 2, 3, 4, 5]; shuffle(a); eq(a.slice().sort().join(), '1,2,3,4,5', 'shuffle keeps items');
  eq(pct(0.256), '26%');
});

test('store: saved values merge deeply over defaults', () => {
  const key = 'engine-test-store';
  saveStore(key, { a: 2, nested: { x: 9 }, list: [7] });
  const { data, raw } = loadStore(key, () => ({ a: 1, b: 5, nested: { x: 1, y: 2 }, list: [1, 2, 3] }));
  eq(data.a, 2); eq(data.b, 5, 'new default kept'); eq(data.nested.x, 9); eq(data.nested.y, 2, 'nested default kept');
  eq(data.list.join(), '7', 'arrays are replaced'); eq(raw!.a, 2);
  clearStore(key);
  eq(loadStore(key, () => ({ a: 1 })).raw, null, 'cleared');
  prefSet(key, 'v'); eq(prefGet(key, 'd'), 'v'); clearStore(key); eq(prefGet(key, 'd'), 'd');
});

test('i18n: placeholders, functions, ja fallback, data hook, static text', () => {
  LANG.ja = { name: '日本語', ui: { hello: 'こんにちは', n: '{n} 個', f: v => `f${v.a}`, only: 'ja だけ' }, data: { thing: 'ja' } };
  LANG.en = { name: 'English', ui: { hello: 'hello', n: '{n} items', f: v => `F${v.a}` }, data: { thing: 'en' } };
  let got = null; setI18nHook((d: { thing: string }) => { got = d.thing; });
  setLang('en');
  eq(t('n', { n: 3 }), '3 items'); eq(t('f', { a: 1 }), 'F1'); eq(t('only'), 'ja だけ', 'falls back to ja');
  eq(got, 'en', 'game hook got the data'); eq(document.querySelector('[data-i18n="hello"]')!.textContent, 'hello');
  setLang('xx'); eq(lang, 'ja', 'unknown language -> ja');
  const target: { id: string; name?: string }[] = [{ id: 'a' }, { id: 'b' }]; fillData(target, { b: { name: 'B' } }); eq(target[1].name, 'B', 'fillData by id');
  setI18nHook(null);
});

test('loop: order, modes, stopFrame', () => {
  const log: string[] = [];
  const a = addSystem({ name: 't-b', order: 2, modes: ['m1'], update: () => log.push('b') });
  const b = addSystem({ name: 't-a', order: 1, update: () => log.push('a') });
  const c = addSystem({ name: 't-c', order: 3, modes: ['m1'], update: () => { log.push('c'); stopFrame(); } });
  const d = addSystem({ name: 't-d', order: 4, update: () => log.push('d') });
  runSystems(0.016, 'm1'); eq(log.join(''), 'abc', 'm1 runs a,b,c and c stops the frame');
  log.length = 0; runSystems(0.016, 'm2'); eq(log.join(''), 'ad', 'm2 skips the m1-only systems');
  [a, b, c, d].forEach(s => { s.enabled = false; });
});

test('world: update, dead, onRemove, query, groups, spawn during a pass', () => {
  const log: string[] = [];
  const g = worldGroup('t-early', 5);
  const late = spawn({ tag: 't-late', update() { log.push('late'); } });
  const early = spawn({ tag: 't-early', n: 0, kid: false, update() { log.push('early'); if (!this.kid) { this.kid = true; spawn({ tag: 't-early', update() { log.push('kid'); } }); } } });
  runSystems(0.016, 'any');
  eq(log.slice(0, 3).join(), 'early,kid,late', 'group order 5 before the default 30; a spawned object runs in the same pass');
  eq(query('t-early').length, 2); eq(g.list, WORLD.groups['t-early'].list, 'group list is stable');
  let removed = false; late.onRemove = () => { removed = true; }; late.dead = true;
  runSystems(0.016, 'any'); ok(removed, 'onRemove ran'); eq(query('t-late').length, 0);
  clearWorld('t-early'); eq(g.list.length, 0, 'clearWorld');
  g.system.enabled = false;
});

// ---------- world: tiles, projectiles, steering ----------
// a 6x3 tile room: row 1 is walkable; tile (4,1) is a raised step 2 m up; everything else is wall
export function tinyWorld() {
  const w = 6, h = 3;
  setTileWorld({ W: w, H: h, grid: new Uint8Array(w * h), hgt: new Float32Array(w * h), ramp: new Int8Array(w * h).fill(-1), cover: new Uint8Array(w * h),
    flow: new Int32Array(w * h), flowQ: new Int32Array(w * h) });
  for (let i = 0; i < 5; i++) grid[W + i] = 1;
  hgt[W + 4] = 2;
}
test('tiles: floor height, ramps, walls and steps block, line of sight', () => {
  tinyWorld();
  eq(floorY(1.5 * T, 1.5 * T), 0); eq(floorY(4.5 * T, 1.5 * T), 2, 'raised tile');
  ramp[W + 3] = 0; near(floorY(3.5 * T, 1.5 * T), RISE / 2, 1e-6, 'halfway up a +x ramp'); ramp[W + 3] = -1;
  ok(solidAt(1.5 * T, 0.5 * T), 'row 0 is wall');
  const o = { x: 1.5 * T, z: 1.5 * T, fy: 0 };
  for (let k = 0; k < 100; k++) moveCircle(o, 0.2, 0, 0.4);
  ok(o.x < 4 * T, 'a 2 m step blocks walking (limit STEP)');
  const hitWall = moveCircle(o, 0, -10, 0.4); ok(hitWall, 'walls block');
  ok(hasLOS(0.5 * T, 1.5 * T, 3.5 * T, 1.5 * T), 'clear along the row');
  ok(hasLOS(0.5 * T, 1.5 * T, 3.5 * T, 1.5 * T, 0.5, 0.5), 'a low sight line over a flat floor is clear');
  ok(!hasLOS(0.5 * T, 1.5 * T, 5.5 * T, 1.5 * T, 1, 1), 'the raised tile blocks a low sight line');
});

test('tiles: flow field leads to the target around the step', () => {
  tinyWorld(); computeFlow(0, 1);
  eq(flowAt(0.5 * T, 1.5 * T), 0, 'target tile is 0');
  eq(flowAt(3.5 * T, 1.5 * T), 3);
  const d = flowDir(3.5 * T, 1.5 * T); ok(d && d[0] < -0.9, 'heads toward -x');
  eq(flowAt(4.5 * T, 1.5 * T), 4, 'dropping down the 2 m step is allowed');
  computeFlow(4, 1); eq(flowAt(3.5 * T, 1.5 * T), -1, 'climbing it is not (more than STEP)');
});

test('projectiles: pool, sub-steps, terrain, homing, patterns', () => {
  tinyWorld();
  const pool: Projectile[] = [], geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const b = takeFromPool(pool, geo, 2)!; b.alive = true; ok(takeFromPool(pool, geo, 2) !== b, 'second slot');
  pool[1].alive = true; eq(takeFromPool(pool, geo, 2), null, 'pool full');
  Object.assign(b, { x: 0.5 * T, y: 1, z: 1.5 * T, vx: 30, vy: 0, vz: 0 });
  let steps = 0; stepProjectile(b, 0.1, 0.5, () => { steps++; return false; });
  eq(steps, 6, '3 m in 0.5 m steps'); near(b.x, 0.5 * T + 3, 1e-9);
  let hit: number | null = null; stepProjectile(b, 1, 0.5, p => { if (projHitsTerrain(p, 10, 0.03)) { hit = p.x; return true; } return false; });
  ok(hit !== null && hit >= 4 * T - 0.5 && hit <= 4 * T + 0.5, 'stops at the raised tile ' + hit);
  clearPool(pool); ok(!pool[0].alive && !pool[1].alive, 'clearPool');
  const h = { x: 0, y: 0, z: 0, vx: 5, vy: 0, vz: 0, speed: 5 };
  for (let k = 0; k < 200; k++) steerToward(h as unknown as Projectile, 0, 0, 10, 0.05, 2.2);
  ok(h.vz > 4.9 && Math.abs(h.vx) < 0.1, 'turned toward +z');
  eq(ringAngles(4, 0).length, 4); near(ringAngles(4, 0)[1], Math.PI / 2);
  const fan = aimFan(0, 0, 0, 0, 0, 10, 3, 0.2, 0); eq(fan.length, 3);
  near(fan[1][2], 1, 1e-9, 'middle bullet aims straight'); fan.forEach(v => near(Math.hypot(v[0], v[1], v[2]), 1, 1e-9, 'unit'));
});

test('steer: chase in sight, circle when close, push apart', () => {
  tinyWorld();
  const e = { x: 1.5 * T, z: 1.5 * T, r: 0.5, fy: 0, side: 1 };
  steerChase(e, 0.1, 8, 0, 8, true, 4, 0, [], null); ok(e.x > 1.5 * T, 'moved toward the target');
  const f = { x: 2 * T, z: 1.5 * T, r: 0.5, fy: 0, side: 1 }, g2 = { x: 2 * T + 0.3, z: 1.5 * T, r: 0.5 };
  steerChase(f, 0.1, 0, 0.001, 0.001, true, 4, 0, [g2], null); ok(f.x < 2 * T, 'pushed away from a neighbour');
});

// ---------- render / ui ----------
test('render: viewmodel from parts, fx', () => {
  const g = buildViewmodel({ tip: [0, 0, -1], pos: [0.3, -0.3, -0.5], flash: 0.1, parts: [['box', 0.1, 0.1, 0.5, 'a', 0, 0, 0], ['cyl', 0.05, 0.4, 'b', 0, 0, -0.3]] }, { a: 0x333333, b: 0xff0000 }, ['b']);
  eq(g.children.length, 4, '2 parts + tip + flash'); near(g.userData.tip.position.z, -1); ok(!g.userData.flash.visible);
  burst(0, 1, 0, 0xffffff, 5, 3, 0.5); ok(parts.filter(p => p.life > 0).length >= 5, 'particles alive');
  fireball(0, 1, 0, 3, 0xff0000); updateBalls(0.6); clearFx(); ok(parts.every(p => p.life <= 0), 'clearFx');
});

test('touchlayout: place, edit, reset', () => {
  let saved = 0, closed: string | undefined; const edits: Record<string, { x: number; y: number; s: number }> = {};
  Object.assign(TOUCH_LAYOUT, {
    defs: { fire: { x: 0.9, y: 0.8, s: 1, b: 80, name: 'fire' }, fire2: { x: 0.2, y: 0.5, s: 1, b: 60, name: 'fire2' } }, first: 'fire',
    edits: () => edits, reset: () => { for (const k in edits) delete edits[k]; }, save: () => { saved++; }, onClose: (from?: string) => { closed = from; },
  });
  applyLayout(); eq(document.querySelector<HTMLElement>('[data-lb="fire"]')!.style.width, '80px');
  openLayoutEditor('here'); ok(editing && !$('#layoutBar').hidden, 'editor open');
  document.querySelector<HTMLElement>('[data-lbact="plus"]')!.click(); near(getL('fire').s, 1.1, 1e-9, 'bigger');
  document.querySelector<HTMLElement>('[data-lbact="reset"]')!.click(); eq(getL('fire').s, 1, 'reset');
  document.querySelector<HTMLElement>('[data-lbact="done"]')!.click(); eq(closed, 'here'); ok(saved > 0, 'saved');
});

test('ui / input: toast, keys, INPUT hooks', () => {
  toast('hi', 50); eq($('#toast').textContent, 'hi');
  let key: string | null = null; INPUT.key = e => { key = e.code; };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' })); ok(keys.KeyZ, 'held'); eq(key, 'KeyZ', 'INPUT.key called');
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ' })); ok(!keys.KeyZ, 'released');
  let looked: number[] = []; INPUT.look = (dx, dy) => { looked = [dx, dy]; }; lookDelta(10, 0, 0.01); near(looked[0], 0.1);
  releaseInputs(); ok(!fireHeld && !mouseFire);
});

export const passed = results.filter(r => r[1]).length;
console.log(`TEST DONE ${passed}/${results.length}`);
document.getElementById('out')!.innerHTML = results.map(([n, p]) => `<span class="${p ? 'ok' : 'fail'}">${p ? 'ok  ' : 'FAIL'} ${n}</span>`).join('\n') + `\n\n${passed}/${results.length} passed`;
