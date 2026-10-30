import { expect, test } from 'vitest';
import { LEVELS } from '../src/core/content/catalog.ts';
import { generateLevel } from '../src/core/content/generate/index.ts';
import { levelText } from '../src/i18n/text.ts';
import '../src/main.ts';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

const open = async (hash: string): Promise<void> => {
  history.replaceState(null, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await tick();
};

const send = async (keys: string[]): Promise<void> => {
  for (const key of keys) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await tick();
  }
};

test('the terminal boots and solves the first puzzle', async () => {
  expect(document.getElementById('tvBuffer')).not.toBeNull();
  expect(document.getElementById('tvTitle')!.textContent).toBe(levelText(LEVELS[0].id).title);
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
  const firstLevel = document.querySelector('#tvLevelList .lv');
  expect(firstLevel?.classList.contains('done')).toBe(true);
  expect(firstLevel?.querySelector('.mark')?.textContent).toBe('✓');

  document.getElementById('tvEndless')!.click();
  await tick();
  expect(document.getElementById('tvApp')!.classList.contains('endless')).toBe(true);
  expect((document.getElementById('tvSolution') as HTMLButtonElement).hidden).toBe(true);
  expect(document.getElementById('tvSolutionKeys')!.textContent).toBe('エンドレスでは手順を出さない。');
  expect(document.getElementById('tvProgress')!.textContent).toContain('クリア');
});

test('a retried endless puzzle does not count as a new clear', async () => {
  const seed = 0;
  await open(`#endless-${seed}`);
  const level = generateLevel(seed, `endless-${seed}`, 0);
  await send(level.solution);
  expect(document.getElementById('tvProgress')!.textContent).toContain('クリア 1');

  (document.getElementById('tvRetry') as HTMLButtonElement).click();
  await tick();
  await send(level.solution);
  expect(document.getElementById('tvDone')!.hidden).toBe(false);
  expect(document.getElementById('tvProgress')!.textContent).toContain('クリア 1');
});

test('insert mode waits for Escape before showing the solved panel', async () => {
  await open('#e04');
  await send(['i', 'l']);
  expect(document.getElementById('tvDone')!.hidden).toBe(true);
  await send(['Escape']);
  expect(document.getElementById('tvDone')!.hidden).toBe(false);
  expect(document.getElementById('tvDoneTitle')!.textContent).toContain('正解');
});
