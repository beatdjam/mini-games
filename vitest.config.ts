// Vitest: npm test. Tests run in Chromium (Vitest browser mode through Playwright).
// CHROME=/path/to/chrome picks the browser (the cloud container's, or google-chrome in CI); otherwise Playwright's own.
// In GitHub Actions the results also go to the job summary, a JUnit file and an HTML report (test-results/).
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

const browser = {
  enabled: true,
  headless: true,
  provider: playwright({ launchOptions: process.env.CHROME ? { executablePath: process.env.CHROME } : {} }),
  instances: [{ browser: 'chromium' as const }],
};
const ci = !!process.env.GITHUB_ACTIONS;

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'engine', include: ['engine/test/**/*.test.ts'], setupFiles: ['engine/test/setup.ts'], browser } },
    ],
    reporters: ci ? ['default', ['github-actions', { jobSummary: { enabled: true } }], 'junit', ['html', { outputDir: 'test-results/html' }]] : ['default'],
    outputFile: { junit: 'test-results/junit.xml' },
  },
});
