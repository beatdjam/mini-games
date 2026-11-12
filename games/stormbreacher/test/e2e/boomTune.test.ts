// The boom view's knobs are the shared tuning panel: a slider writes into the selected kind's table row, and
// "元に戻す" puts the row back to what it held when the view opened.
import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { boot } from '../../src/app/boot.ts';
import { BOOM_DEFS } from '../../src/data/boom.ts';
import { showBoom } from '../../src/dev/views/boom.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

test('#view-boom: a knob changes the table, and 元に戻す returns it', () => {
  const before = BOOM_DEFS.large.fire.radius;
  history.replaceState(null, '', '#view-boom');
  showBoom('#view-boom');

  const slider = document.querySelector<HTMLInputElement>(
    '[data-tune-group="BOOM_DEFS.large"] [data-tune-key="fire.radius"] input[type="range"]',
  );
  if (!slider) throw new Error('the boom view has no size knob');
  slider.value = String(before + 1);
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  expect(BOOM_DEFS.large.fire.radius).toBeCloseTo(before + 1);

  const reset = document.querySelector<HTMLButtonElement>('#sbTunePanel [data-tune-action="reset"]');
  if (!reset) throw new Error('the tuning panel has no reset button');
  reset.click();
  expect(BOOM_DEFS.large.fire.radius).toBeCloseTo(before);
});
