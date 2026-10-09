// Vitest for the bot runs: npm run sim. A bot plays each game's runs headless in Chromium (games/<id>/sim/*.sim.ts)
// and prints what came of them, for looking at the balance. Not a test: it is not part of npm test or the CI.
// SIM_SEEDS=1-20 (or 3,7,9) picks the buildings, SIM_STYLE=rusher,beginner the kinds of player (all of them when not
// given); CHROME as in vitest.config.ts.
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const games = readdirSync('games').filter(g => existsSync(`games/${g}/sim`));

export default defineConfig({
  test: {
    projects: games.map(id => ({
      resolve: { alias: { '@engine': resolve('engine/src') } },
      define: {
        __SIM_SEEDS__: JSON.stringify(process.env.SIM_SEEDS ?? '1-10'),
        __SIM_STYLE__: JSON.stringify(process.env.SIM_STYLE ?? 'all'),
        __SIM_WEAPON__: JSON.stringify(process.env.SIM_WEAPON ?? ''),
      },
      test: {
        name: id,
        include: [`games/${id}/sim/**/*.sim.ts`],
        setupFiles: [`games/${id}/test/setup.ts`],
        testTimeout: 30 * 60 * 1000,
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({ launchOptions: process.env.CHROME ? { executablePath: process.env.CHROME } : {} }),
          instances: [{ browser: 'chromium' as const }],
        },
      },
    })),
  },
});
