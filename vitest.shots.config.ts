// Vitest for the screenshots of the looks: npm run shots. Each game's games/<id>/shots/*.shots.ts draws scenes from fixed
// seeds in Chromium and saves them as pictures. Not a test: it is not part of npm test or the CI.
// SHOTS_OUT=<folder> picks where the pictures go (out/shots/<branch> when not given); SHOTS_ONLY=<text> takes only the
// shots whose names contain it (e.g. SHOTS_ONLY=boss-). Compare two folders with node tools/shots_diff.js <a> <b>.
// CHROME as in vitest.config.ts.
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const games = readdirSync('games').filter(g => existsSync(`games/${g}/shots`));
const branch = () => execSync('git rev-parse --abbrev-ref HEAD').toString().trim().replace(/\//g, '-');
const out = resolve(process.env.SHOTS_OUT ?? `out/shots/${branch()}`);
mkdirSync(out, { recursive: true });

export default defineConfig({
  test: {
    projects: games.map(id => ({
      resolve: { alias: { '@engine': resolve('engine/src') } },
      // (the pictures are written through the test server, which only writes where it is allowed to)
      server: { fs: { allow: ['.', out] } },
      define: {
        __SHOTS_OUT__: JSON.stringify(`${out}/${id}`),
        __SHOTS_ONLY__: JSON.stringify(process.env.SHOTS_ONLY ?? ''),
      },
      test: {
        name: id,
        include: [`games/${id}/shots/**/*.shots.ts`],
        setupFiles: [`games/${id}/test/setup.ts`],
        testTimeout: 5 * 60 * 1000,
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
