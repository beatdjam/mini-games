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

test('#view-boom: 元に戻す returns every kind that was changed, not only the one on screen', () => {
  const beforeLarge = BOOM_DEFS.large.fire.radius;
  const beforeSmall = BOOM_DEFS.small.fire.radius;
  history.replaceState(null, '', '#view-boom');
  showBoom('#view-boom');

  const knob = (kind: string): HTMLInputElement => {
    const slider = document.querySelector<HTMLInputElement>(
      `[data-tune-group="BOOM_DEFS.${kind}"] [data-tune-key="fire.radius"] input[type="range"]`,
    );
    if (!slider) throw new Error(`the boom view has no size knob for ${kind}`);
    return slider;
  };

  const largeSlider = knob('large');
  largeSlider.value = String(beforeLarge + 1);
  largeSlider.dispatchEvent(new Event('input', { bubbles: true }));
  expect(BOOM_DEFS.large.fire.radius).toBeCloseTo(beforeLarge + 1);

  // switch to another kind and change it too; the panel now shows only that kind's row
  const smallButton = document.querySelector<HTMLButtonElement>('[data-boom-kind="small"]');
  if (!smallButton) throw new Error('the boom view has no small kind button');
  smallButton.click();
  const smallSlider = knob('small');
  smallSlider.value = String(beforeSmall + 1);
  smallSlider.dispatchEvent(new Event('input', { bubbles: true }));
  expect(BOOM_DEFS.small.fire.radius).toBeCloseTo(beforeSmall + 1);

  const reset = document.querySelector<HTMLButtonElement>('#sbTunePanel [data-tune-action="reset"]');
  if (!reset) throw new Error('the tuning panel has no reset button');
  reset.click();
  expect(BOOM_DEFS.large.fire.radius).toBeCloseTo(beforeLarge);
  expect(BOOM_DEFS.small.fire.radius).toBeCloseTo(beforeSmall);
});
