import { expect, test } from 'vitest';
import '../src/main.ts';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('the terminal boots and solves the first puzzle', async () => {
  expect(document.getElementById('tvBuffer')).not.toBeNull();
  expect(document.getElementById('tvTitle')!.textContent).toContain('h');
  expect(document.querySelectorAll('#tvLevelList .lv').length).toBeGreaterThan(10);

  window.dispatchEvent(new KeyboardEvent('keydown', { key: '@', bubbles: true }));
  await tick();
  expect(document.getElementById('tvNotice')!.textContent).toContain('未対応');
  expect(document.getElementById('tvKeys')!.textContent).toContain('打鍵 1');

  window.dispatchEvent(new KeyboardEvent('keydown', { key: '"', bubbles: true }));
  await tick();
  expect(document.getElementById('tvSearch')!.textContent).toBe('"');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  await tick();

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
  await tick();

  const done = document.getElementById('tvDone')!;
  expect(done.hidden).toBe(false);
  expect(document.getElementById('tvDoneTitle')!.textContent).toContain('正解');
  expect(document.getElementById('tvDoneText')!.textContent).not.toBe('');
  expect(document.getElementById('tvMode')!.textContent).toContain('NORMAL');

  document.getElementById('tvEndless')!.click();
  await tick();
  expect(document.getElementById('tvApp')!.classList.contains('endless')).toBe(true);
  expect((document.getElementById('tvSolution') as HTMLButtonElement).hidden).toBe(true);
  expect(document.getElementById('tvSolutionKeys')!.textContent).toBe('エンドレスでは手順を出さない。');
  expect(document.getElementById('tvProgress')!.textContent).toContain('クリア');
});
