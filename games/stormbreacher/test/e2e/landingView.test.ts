// #view-landing: the landing cutscene held at a second, with the arrows and the camera knobs (SB-1630). The page is the
// real sortie, so the report reads the drawn frame's counts as well as the second and the pose.
import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { boot } from '../../src/app/boot.ts';
import { CUTSCENE_SEC } from '../../src/data/script.ts';
import { showLanding } from '../../src/dev/views/landing.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

interface LandingReport {
  at: number;
  keyAt: number;
  pose: { pos: readonly number[]; look: readonly number[] };
  calls: number;
  triangles: number;
}

const frames = async (n: number): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
};

function report(): LandingReport {
  if (!window.sbLandingReport) throw new Error('#view-landing has no report');
  return JSON.parse(window.sbLandingReport()) as LandingReport;
}

const landed = (name: string): string => document.querySelector(`[data-landing="${name}"]`)?.textContent ?? '';

// A synthetic key can be lost while the page is busy; the view moves on it at once, so check and press again if it did
// not take.
async function press(code: 'ArrowLeft' | 'ArrowRight'): Promise<void> {
  const before = report().at;
  for (let i = 0; i < 5; i++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    await frames(1);
    if (Math.abs(report().at - before) > 1e-9) return;
  }
}

test('#view-landing holds at ?at, moves by a tenth with the arrows and stops before the end', async () => {
  history.replaceState(null, '', '#view-landing?at=6');
  showLanding('#view-landing?at=6');
  await frames(3);
  const held = report();
  expect(held.at).toBeCloseTo(6, 6);
  expect(held.keyAt).toBeCloseTo(6, 6);
  expect(landed('at')).toBe('6');
  expect(landed('key')).toBe('5');
  expect(landed('pose')).toContain('pos');

  await press('ArrowRight');
  await frames(2);
  const moved = report();
  expect(moved.at).toBeCloseTo(6.1, 6);
  expect(landed('at')).toBe('6.1');
  expect(moved.pose.pos).not.toEqual(held.pose.pos);

  await press('ArrowLeft');
  await frames(2);
  expect(report().at).toBeCloseTo(6, 6);

  // 12 s would put the cutscene's `left` at 0, so the view stops just before it
  showLanding('#view-landing?at=12');
  await frames(3);
  expect(report().at).toBeCloseTo(CUTSCENE_SEC.landing - 0.05, 6);
  // the nearest key at or before that second is the 10.8 s one
  expect(landed('key')).toBe('7');
});

test('#view-landing knobs turn the nearest key and copy it in the table shape', async () => {
  history.replaceState(null, '', '#view-landing?at=8');
  showLanding('#view-landing?at=8');
  await frames(3);
  expect(report().at).toBeCloseTo(8, 6);
  expect(landed('key')).toBe('6');

  const group = document.querySelector('[data-tune-group="CUTSCENES.landing.camera.6"]');
  if (!group) throw new Error('the panel has no group for the 8 s key');
  const range = group.querySelector('[data-tune-key="pos.0"] input[type="range"]');
  if (!(range instanceof HTMLInputElement)) throw new Error('the key has no pos.0 knob');
  range.value = '2.5';
  range.dispatchEvent(new Event('input', { bubbles: true }));
  await frames(2);
  expect(report().pose.pos[0]).toBeCloseTo(2.5, 6);

  // the page's clipboard is replaced so the test reads what the button would copy
  let copied = '';
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text: string) => void (copied = text) },
  });
  const copy = document.querySelector('#sbTunePanel [data-tune-action="copy"]');
  if (!(copy instanceof HTMLButtonElement)) throw new Error('the panel has no copy button');
  copy.click();
  await frames(1);
  expect(copied).toMatch(/^CUTSCENES\.landing\.camera\.6\.pos\.0: 2\.5$/m);
});
