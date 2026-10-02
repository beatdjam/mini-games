// Vitest for the build test: npm run test:build. Builds the site (dist-test/) and opens it in Chromium, so it is not part of npm test.
// CHROME=/path/to/chrome picks the browser, as in vitest.config.ts. In GitHub Actions the results also go to the job summary,
// a JUnit file and an HTML report (test-results/).
import { defineConfig } from 'vitest/config';

const ci = !!process.env.GITHUB_ACTIONS;

export default defineConfig({
  test: {
    name: 'build',
    environment: 'node',
    include: ['tools/build.test.ts'],
    reporters: ci
      ? [
          'default',
          ['github-actions', { jobSummary: { enabled: true } }],
          'junit',
          ['html', { outputDir: 'test-results/build-html' }],
        ]
      : ['default'],
    outputFile: { junit: 'test-results/build-junit.xml' },
  },
});
