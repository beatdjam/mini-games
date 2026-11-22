// Says which tests a pull request needs, from the files it changes. Run: node tools/test_scope.js <base commit>
// Prints one line:
//   all            something shared changed (the engine, package.json, the configs, checks.yml, this file, any file not listed
//                  below ...): every test
//   <id> <id> ...  only files of those games changed (plus files that need nothing or only the build test): their tests
//   build          only the files of the build test changed (index.html, privacy.html, public/, tools/build.test.ts,
//                  vitest.build.config.ts): the build test only (npm run test:build), no Vitest project
//   none           nothing that a test covers changed: no test
// The build test runs whenever the line is not none. Used by .github/workflows/checks.yml. The deploy job (pages.yml) always
// runs everything.
//
// How a file outside games/ is sorted (a file that is in no list below is "all": a new file plays safe):
//   no test needed  *.md anywhere; files that the typecheck and lint (which run in every PR) already cover, or that no CI test runs:
//                   the workflows pages.yml and changelog.yml, .claude/, .opencode/, opencode.json, .gitignore, the queue tools,
//                   the publish and commit tools, the tools CI does not run (shots, sim, trailer) and their configs,
//                   and what lint runs (check_style.js, check_i18n.js, ESLint, Prettier, dependency-cruiser configs)
//   build test only index.html, privacy.html, public/, tools/build.test.ts, vitest.build.config.ts
//   all             everything else, e.g. engine/, package.json, package-lock.json, tsconfig.json, vitest.config.ts,
//                   vite.config.js, .nvmrc, .github/workflows/checks.yml, tools/test_scope.js
// A file of a game: that game's tests (a game without a test/ folder of its own is "all").
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const base = process.argv[2];
if (!base) {
  console.error('usage: node tools/test_scope.js <base commit>');
  process.exit(2);
}
const changed = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const noTestFiles = new Set([
  '.github/workflows/pages.yml',
  '.github/workflows/changelog.yml',
  'opencode.json',
  '.gitignore',
  'tools/run_queue.sh',
  'tools/run_queue_test.sh',
  'tools/queue_mark.sh',
  'tools/queue_mark_test.sh',
  'tools/queue_status.py',
  'tools/build_updates.py',
  'tools/check_changelog.py',
  'tools/check_doc_facts.py',
  'tools/shots_diff.js',
  'tools/sim_split.js',
  'vitest.shots.config.ts',
  'vitest.sim.config.ts',
  'tools/check_style.js',
  'tools/check_i18n.js',
  'eslint.config.js',
  '.prettierrc.json',
  '.prettierignore',
  '.dependency-cruiser.cjs',
  '.dependency-cruiser-known-violations.json',
]);
const noTestFolders = ['.claude/', '.opencode/', 'tools/trailer/'];
const buildTestFiles = new Set(['index.html', 'privacy.html', 'tools/build.test.ts', 'vitest.build.config.ts']);
const buildTestFolders = ['public/'];

// the rule, from the list of changed files
function scopeOf(files) {
  const games = new Set();
  let build = false;
  for (const f of files) {
    if (f.endsWith('.md')) continue; // a document: nothing to test
    if (noTestFiles.has(f) || noTestFolders.some(d => f.startsWith(d))) continue;
    if (buildTestFiles.has(f) || buildTestFolders.some(d => f.startsWith(d))) {
      build = true;
      continue;
    }
    const m = /^games\/([^/]+)\//.exec(f);
    // a file in no list, or a game without tests of its own: play safe and run everything
    if (!m || !existsSync(`games/${m[1]}/test`)) return 'all';
    games.add(m[1]);
  }
  if (games.size) return [...games].sort().join(' ');
  return build ? 'build' : 'none';
}

console.log(scopeOf(changed));
