// Build test: npm run test:build. Builds the site into dist-test/, serves it like the published one and checks
// what only the build has: the version stamp, the analytics tag, and that each game's page opens in Chromium without errors.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { preview, type PreviewServer } from 'vite';

const OUT = 'dist-test';
const PORT = 8766;
const ORIGIN = `http://localhost:${PORT}`;
const SETTLE_MS = 2000; // how long a page may run before its errors are counted
const games = readdirSync('games').filter(g => existsSync(`games/${g}/index.html`));
// the element that shows on the base screen of each game
const BASE_SCREEN: Record<string, string> = { 'sector-dive': '#scrBase', 'sector-dive-ex': '#scrBase' };

let server: PreviewServer;

beforeAll(async () => {
  execFileSync('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir'], { stdio: 'ignore' });
  server = await preview({ build: { outDir: OUT }, preview: { port: PORT, strictPort: true } });
}, 120000);

afterAll(async () => {
  await new Promise(done => server.httpServer.close(done));
});

describe.each(games)('%s', id => {
  const html = () => readFileSync(`${OUT}/games/${id}/index.html`, 'utf8');

  test('the build stamp matches version.json', () => {
    const stamp = html().match(/<meta name="build" content="([^"]*)"/)?.[1];
    const { build } = JSON.parse(readFileSync(`${OUT}/games/${id}/version.json`, 'utf8'));
    expect(stamp).not.toBe('dev');
    expect(stamp).toBe(build);
  });

  test('the analytics tag is in the page', () => {
    expect(html()).toMatch(/gtag\('config','G-[A-Z0-9]+'\)/);
  });

  test('the page opens without errors and shows the base screen', async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      // a font or another site that cannot be reached is not the page's fault: only count errors from our own files
      page.on('console', m => {
        if (m.type() === 'error' && (!m.location().url || m.location().url.startsWith(ORIGIN))) errors.push(m.text());
      });
      await page.goto(`${ORIGIN}/mini-games/games/${id}/`);
      await page.waitForTimeout(SETTLE_MS);
      expect(errors).toEqual([]);
      expect(await page.locator(BASE_SCREEN[id]!).isVisible()).toBe(true);
    } finally {
      await browser.close();
    }
  }, 30000);
});
