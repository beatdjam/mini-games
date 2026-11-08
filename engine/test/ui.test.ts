import { expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { el } from '../src/core/util.ts';

import { T, setTileWorld } from '../src/world/tiles.ts';
import { type FloorLink } from '../src/world/floors.ts';
import { banner, keepAwake, toast } from '../src/ui/ui.ts';
import { onDataClick, rowsHTML } from '../src/ui/dom.ts';
import { createHitDirs } from '../src/ui/hitdir.ts';
import { createHitMark } from '../src/ui/hitmark.ts';
import { canCopyImage, drawGrid, fitText, openXPost, saveFile } from '../src/ui/share.ts';
import { SETTINGS, renderSettings } from '../src/ui/settings.ts';
import { drawTileMap } from '../src/ui/minimap.ts';
import { createFloorMap3D } from '../src/ui/floormap3d.ts';
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
import { eq, near, ok, crossFloors } from './helpers.ts';

// ---------- core ----------
test('share: text cut to fit with an ellipsis, a grid of lines on whole pixels', () => {
  const g = document.createElement('canvas').getContext('2d')!;
  g.font = '20px sans-serif';
  expect(fitText(g, 'short', 1000)).toBe('short');
  const cut = fitText(g, 'a rather long line of text for a small box', 80);
  expect(cut.endsWith('…') && g.measureText(cut).width <= 80).toBe(true);
  const lines: number[][] = [];
  const fake = {
    beginPath() {},
    stroke() {},
    moveTo(x: number, y: number) {
      lines.push([x, y]);
    },
    lineTo() {},
  } as unknown as CanvasRenderingContext2D; // (only the calls drawGrid makes)
  drawGrid(fake, 100, 50, 50, '#123');
  // 3 lines across x (0, 50, 100) and 2 down y (0, 50), each half a pixel in
  expect(lines).toEqual([
    [0.5, 0],
    [50.5, 0],
    [100.5, 0],
    [0, 0.5],
    [0, 50.5],
  ]);
  expect((fake as unknown as { strokeStyle: string }).strokeStyle).toBe('#123');
});
test('hitmark: shows on a hit, marks a crit, goes after its time', () => {
  const mark = document.createElement('div'),
    hm = createHitMark(mark, 0.09);
  hm.show(true);
  expect(mark.classList.contains('on') && mark.classList.contains('crit')).toBe(true);
  hm.update(0.05);
  expect(mark.classList.contains('on'), 'still up').toBe(true);
  hm.show();
  expect(mark.classList.contains('crit'), 'a plain hit is not a crit').toBe(false);
  hm.update(0.05);
  expect(mark.classList.contains('on'), 'the second hit starts the time again').toBe(true);
  hm.update(0.05);
  expect(mark.classList.contains('on')).toBe(false);
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

// ---- the 3D detail map ----
test('floormap3d: floors as slabs of the tiles that show, links as posts, the viewer on its floor, drag to turn', () => {
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
  eq(map.scene.children[0].children.length, 3, 'two slab meshes and the links: no outline, label or volume unasked');
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
  const links = map.scene.children[0].children.find(o => o.userData.links) as THREE.Group;
  eq(links.children.length, 1, 'the stairs only: one post');
  const post = links.children[0] as THREE.Mesh;
  // (from tile (5, 1) of floor 0 to tile (1, 1) of floor 1)
  eq([post.position.x, post.position.z].join(), '3.5,1.5', 'half way between its ends');
  near(post.position.y, 4.12, 1e-9, 'and between the two floors');
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
test('floormap3d: the outline and name of every floor, tall spaces as boxes, a ramp, a beacon, far floors dimmer', () => {
  const { f } = crossFloors(),
    c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:200px';
  document.body.appendChild(c);
  const map = createFloorMap3D(c);
  map.build(
    f,
    {
      tile: (floor, k) => (f.grids[floor].world.grid[k] ? { color: '#ffffff', alpha: 1 } : null),
      link: l => (l.kind === 'stairs' ? { color: '#00ff00', width: 1, flat: true } : { color: '#ff00ff', width: 0.5 }),
      frame: '#888888',
      label: floor => (floor === 2 ? null : `${floor + 1}F`),
      volumes: [
        { floor: 0, floors: 1.5, i: 1, j: 1, w: 2, h: 1, color: '#ff0000' },
        { floor: 0, floors: 1, i: 4, j: 1, w: 1, h: 1, color: '#888888', quiet: true },
      ],
    },
    T,
  );
  const made = map.scene.children[0].children,
    frames = made.filter(o => o.userData.frame !== undefined) as THREE.LineLoop[],
    labels = made.filter(o => o.userData.label !== undefined) as THREE.Sprite[],
    volume = made.filter(o => o.userData.volume),
    links = (made.find(o => o.userData.links) as THREE.Group).children as THREE.Mesh[];
  eq(frames.length, 3, 'an outline on every floor');
  // the floor tiles of all the floors: columns 1 to 5, rows 1 to 3 (floor 1 is the largest)
  eq(
    Array.from(frames[1].geometry.getAttribute('position').array).join(),
    '1,8,1,6,8,1,6,8,4,1,8,4',
    'the same box on each, at the height of its floor',
  );
  eq(labels.map(o => o.userData.label).join(), '0,1', 'a name where the style gives one');
  ok(labels[0].position.x < 1 && labels[0].position.y === 0, 'outside the outline, on its floor');
  eq(volume.length, 4, 'two volumes: the faces and the edges of each');
  ok(
    ((volume[2] as THREE.Mesh).material as THREE.Material).opacity <
      ((volume[0] as THREE.Mesh).material as THREE.Material).opacity &&
      ((volume[3] as THREE.LineSegments).material as THREE.Material).opacity <
        ((volume[1] as THREE.LineSegments).material as THREE.Material).opacity,
    'a quiet one is fainter, faces and edges',
  );
  eq(volume[0].position.toArray().join(), '2,6,1.5', 'over its tiles, from its floor up one and a half floor gaps');
  const size = (m: THREE.Mesh) => {
    const q = (m.geometry as THREE.BoxGeometry).parameters;
    return [q.width, q.height, q.depth].map(v => +v.toFixed(3)).join();
  };
  eq(links.length, 2);
  // the stairs (4 tiles along, 8 up): a plate of its width lying along the way; the lift (4 along, 2 across, 8 up): a post
  eq(size(links[0]), `1,0.12,${+Math.hypot(4, 8).toFixed(3)}`, 'flat: a ramp');
  eq(size(links[1]), `0.5,0.5,${+Math.hypot(4, 2, 8).toFixed(3)}`, 'a post');
  map.draw({
    floor: 0,
    viewer: { x: T, z: T, yaw: 0 },
    markers: [
      { floor: 0, x: 1.5 * T, z: 1.5 * T, color: '#00ffff', beacon: true },
      { floor: 0, x: 2.5 * T, z: 1.5 * T, color: '#00ffff' },
    ],
  });
  const opac = (made.filter(o => o instanceof THREE.InstancedMesh) as THREE.InstancedMesh[]).map(
    m => (m.material as THREE.MeshBasicMaterial).opacity,
  );
  ok(opac[0] > opac[1] && opac[1] > opac[2], `the further from the viewer's floor, the dimmer (${opac.join()})`);
  ok(
    (frames[0].material as THREE.Material).opacity > (frames[2].material as THREE.Material).opacity &&
      labels[0].material.opacity > labels[1].material.opacity,
    'the outlines and names dim with their floors',
  );
  const [, mark, dot] = map.scene.children[1].children as THREE.Mesh[];
  ok(mark.position.y > dot.position.y, 'a beacon stands above the floor');
  ok(!(mark.material as THREE.Material).depthTest, 'and shows through the floors');
  map.dispose();
  c.remove();
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
