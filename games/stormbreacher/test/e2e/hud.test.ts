import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { TOUCH_BUTTONS, TOUCH_DEFAULTS } from '../../src/data/touch.ts';
import { buildHud, ringRadius } from '../../src/dev/hud/build.ts';
import { HUD_IDS, PLAN_IDS } from '../../src/dev/hud/plans.ts';
import { showHud } from '../../src/dev/views/hud.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

let savedUrl = '';

beforeAll(async () => {
  await page.viewport(1280, 720);
  savedUrl = location.href;
});

beforeEach(() => {
  document.getElementById('sbHud')?.remove();
  document.getElementById('sbHudBar')?.remove();
});

afterAll(() => {
  history.replaceState(null, '', savedUrl);
});

const must = (selector: string): HTMLElement => {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`missing element: ${selector}`);
  return node;
};

test('ringRadius(720) is about the aim cone at the camera fov', () => {
  const radius = ringRadius(720);
  expect(radius).toBeGreaterThanOrEqual(69);
  expect(radius).toBeLessThanOrEqual(71);
});

test('every plan has the same elements except the strip', () => {
  for (const plan of PLAN_IDS) {
    buildHud(document.body, plan, { cutscene: false, touch: false });
    for (const id of HUD_IDS) expect(document.querySelector(`#sbHud [data-hud="${id}"]`)).not.toBeNull();
    expect(document.querySelector('#sbHud [data-hud="reticle"]')).not.toBeNull();
    expect(document.querySelector('#sbHud [data-hud="lock"]')).not.toBeNull();
    const strip = document.querySelector('#sbHud [data-hud="strip"]');
    if (plan === 'b') expect(strip).not.toBeNull();
    else expect(strip).toBeNull();
  }
});

test('every plan keeps its elements inside the screen', () => {
  for (const plan of PLAN_IDS) {
    buildHud(document.body, plan, { cutscene: false, touch: false });
    const outside: string[] = [];
    for (const node of document.querySelectorAll<HTMLElement>('#sbHud [data-hud]')) {
      const id = node.dataset.hud ?? '';
      if (id === 'strip' || id.startsWith('cutscene-')) continue;
      const rect = node.getBoundingClientRect();
      if (rect.left < -1 || rect.top < -1 || rect.right > 1281 || rect.bottom > 721) outside.push(id);
    }
    expect(outside).toEqual([]);
  }
});

test('no two elements of a plan overlap', () => {
  const skipped = new Set(['strip', 'reticle', 'lock']);
  for (const plan of PLAN_IDS) {
    buildHud(document.body, plan, { cutscene: false, touch: false });
    const nodes = [...document.querySelectorAll<HTMLElement>('#sbHud [data-hud]')].filter(node => {
      const id = node.dataset.hud ?? '';
      return !skipped.has(id) && !id.startsWith('cutscene-') && !id.startsWith('touch-');
    });
    const overlaps: string[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].getBoundingClientRect();
        const b = nodes[j].getBoundingClientRect();
        const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (width > 0.5 && height > 0.5) overlaps.push(`${nodes[i].dataset.hud}/${nodes[j].dataset.hud}`);
      }
    }
    expect(overlaps).toEqual([]);
  }
});

test('no element of a plan spills out of its own box', () => {
  for (const plan of PLAN_IDS) {
    buildHud(document.body, plan, { cutscene: false, touch: false });
    const spills: string[] = [];
    for (const node of document.querySelectorAll<HTMLElement>('#sbHud [data-hud]')) {
      const box = node.getBoundingClientRect();
      for (const inner of node.querySelectorAll('*')) {
        const rect = inner.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        if (
          rect.left < box.left - 1 ||
          rect.top < box.top - 1 ||
          rect.right > box.right + 1 ||
          rect.bottom > box.bottom + 1
        ) {
          spills.push(`${plan}:${node.dataset.hud}`);
          break;
        }
      }
    }
    expect(spills).toEqual([]);
  }
});

test('the cutscene bars hide the HUD but the radio', () => {
  for (const plan of PLAN_IDS) {
    buildHud(document.body, plan, { cutscene: true, touch: false });
    const hidden = [...HUD_IDS.filter(id => id !== 'radio'), 'reticle', 'lock'];
    if (plan === 'b') hidden.push('strip');
    for (const id of hidden) expect(getComputedStyle(must(`#sbHud [data-hud="${id}"]`)).display).toBe('none');

    const radio = must('#sbHud [data-hud="radio"]');
    expect(getComputedStyle(radio).display).not.toBe('none');
    const rect = radio.getBoundingClientRect();
    const bottom = must('#sbHud [data-hud="cutscene-bottom"]').getBoundingClientRect();
    expect(rect.top).toBeGreaterThanOrEqual(bottom.top - 1);
    expect(rect.bottom).toBeLessThanOrEqual(bottom.bottom + 1);
    expect(rect.left).toBeGreaterThanOrEqual(bottom.left - 1);
    expect(rect.right).toBeLessThanOrEqual(bottom.right + 1);
    expect(getComputedStyle(must('#sbHud [data-hud="cutscene-top"]')).display).not.toBe('none');
    expect(getComputedStyle(must('#sbHud [data-hud="cutscene-bottom"]')).display).not.toBe('none');
  }
});

test('the touch rings follow the default layout', () => {
  buildHud(document.body, 'a', { cutscene: false, touch: true });
  for (const id of TOUCH_BUTTONS) {
    const box = must(`#sbHud [data-hud="touch-${id}"]`).getBoundingClientRect();
    const place = TOUCH_DEFAULTS[id];
    expect(Math.abs(box.left + box.width / 2 - innerWidth * place.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.top + box.height / 2 - innerHeight * place.y)).toBeLessThanOrEqual(2);
  }
});

test('the view opens and the plan changes with the number keys', () => {
  const params = new URLSearchParams(location.search);
  params.set('plan', 'b');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
  showHud('#view-hud');
  expect(must('#sbHud').dataset.plan).toBe('b');

  document.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
  expect(must('#sbHud').dataset.plan).toBe('c');
  expect(new URLSearchParams(location.search).get('plan')).toBe('c');

  const report = JSON.parse(window.sbHudReport!()) as {
    plan: string;
    elements: Record<string, { left: number; top: number; width: number; height: number }>;
  };
  expect(report.plan).toBe('c');
  expect(report.elements.armor).toBeDefined();

  document.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }));
  expect(must('#sbHud').dataset.plan).toBe('d');
  expect(new URLSearchParams(location.search).get('plan')).toBe('d');
});

test("plan D's arcs hug the aim circle", () => {
  buildHud(document.body, 'd', { cutscene: false, touch: false });
  const ring = ringRadius(720);
  const armor = must('#sbHud [data-hud="armor"]').getBoundingClientRect();
  const boost = must('#sbHud [data-hud="boost"]').getBoundingClientRect();
  expect(armor.right).toBeLessThanOrEqual(innerWidth / 2 - ring * 0.6);
  expect(boost.left).toBeGreaterThanOrEqual(innerWidth / 2 + ring * 0.6);
  expect(Math.abs(armor.top + armor.height / 2 - innerHeight / 2)).toBeLessThanOrEqual(2);
  expect(Math.abs(boost.top + boost.height / 2 - innerHeight / 2)).toBeLessThanOrEqual(2);
  expect(innerWidth / 2 - armor.left).toBeLessThanOrEqual(ring + 80);
  expect(boost.right - innerWidth / 2).toBeLessThanOrEqual(ring + 80);
});
