import { beforeEach, expect, test } from 'vitest';
import { el, t } from '@engine/core/index.ts';
import { fsSupported, isStandalone } from '@engine/ui/index.ts';
import { state } from '../../src/app/screen.ts';
import { boot } from '../../src/app/boot.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeEach(() => boot());

test('the fullscreen button shows where the browser can go fullscreen, with its words', () => {
  const button = el<HTMLButtonElement>('#sbFs');
  expect(button.hidden).toBe(!fsSupported || isStandalone);
  expect(button.textContent).toBe(t('app.fs'));
});

test('the fullscreen button sits in the top right corner, over the page', () => {
  const button = el<HTMLButtonElement>('#sbFs');
  if (button.hidden) return;
  const box = button.getBoundingClientRect();
  expect(box.width).toBeGreaterThan(0);
  expect(box.top).toBeLessThan(window.innerHeight / 4);
  expect(box.left).toBeGreaterThan(window.innerWidth / 2);
  expect(Number(getComputedStyle(button).zIndex)).toBeGreaterThan(Number(getComputedStyle(el('#touch')).zIndex));
});

test('pressing the fullscreen button does not start a sortie and leaves the focus', () => {
  const button = el<HTMLButtonElement>('#sbFs');
  button.focus();
  button.click();
  expect(document.activeElement).not.toBe(button);
  expect(state).toBe('title');
});
