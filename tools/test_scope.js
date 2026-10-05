// Says which tests a pull request needs, from the files it changes. Run: node tools/test_scope.js <base commit>
// Prints one line:
//   all            something shared changed (the engine, the tools, the configs, a workflow ...): every test
//   <id> <id> ...  only files of those games changed: their smoke tests (and the build test)
//   none           only documents changed (*.md anywhere): no test
// Used by .github/workflows/checks.yml. The deploy job (pages.yml) always runs everything.
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
console.log(scopeOf(changed));

// the rule, from the list of changed files
function scopeOf(files) {
  const games = new Set();
  for (const f of files) {
    if (f.endsWith('.md')) continue; // a document: nothing to test
    const m = /^games\/([^/]+)\//.exec(f);
    // a file outside the games, or a game without tests of its own: play safe and run everything
    if (!m || !existsSync(`games/${m[1]}/test`)) return 'all';
    games.add(m[1]);
  }
  return games.size ? [...games].sort().join(' ') : 'none';
}
