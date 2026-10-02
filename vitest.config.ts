// Vitest: npm test. The engine tests and each game's smoke test run in Chromium (Vitest browser mode through Playwright).
// CHROME=/path/to/chrome picks the browser (the cloud container's, or google-chrome in CI); otherwise Playwright's own.
// In GitHub Actions the results also go to the job summary, a JUnit file and an HTML report (test-results/).
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const browser = () => ({
  enabled: true,
  headless: true,
  provider: playwright({ launchOptions: process.env.CHROME ? { executablePath: process.env.CHROME } : {} }),
  instances: [{ browser: 'chromium' as const }],
});
// the games import the engine as @engine/... (same alias as vite.config.js; projects do not inherit it)
const ci = !!process.env.GITHUB_ACTIONS;
// every game with a games/<id>/test/ folder is a project of its own; its smoke test boots the game page (setup.ts)
// and simulates thousands of frames, so it gets a long timeout
const games = readdirSync('games').filter(g => existsSync(`games/${g}/test`));

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'engine',
          include: ['engine/test/**/*.test.ts'],
          setupFiles: ['engine/test/setup.ts'],
          browser: browser(),
        },
      },
      ...games.map(id => ({
        resolve: { alias: { '@engine': resolve('engine/src') } },
        test: {
          name: id,
          include: [`games/${id}/test/**/*.test.ts`],
          setupFiles: [`games/${id}/test/setup.ts`],
          testTimeout: 60000,
          browser: browser(),
        },
      })),
    ],
    reporters: ci
      ? [
          'default',
          ['github-actions', { jobSummary: { enabled: true } }],
          'junit',
          ['html', { outputDir: 'test-results/html' }],
        ]
      : ['default'],
    outputFile: { junit: 'test-results/junit.xml' },
  },
});
