#!/usr/bin/env node
// Checks the style rules in STYLE.md that a script can see (npm run lint; also run on every PR).
//   node tools/check_style.js
// Prints each problem as file:line and exits 1 if there is any. The rules (see STYLE.md for why):
//   no-index-any   no `[k: string]: any` (list an object's fields instead)
//   no-as-any      no `as any` (type it properly; a narrow `as` with a comment is fine)
//   engine-import  engine/ never imports from games/
//   ui-text        no Japanese in string literals outside src/i18n/ (screen text goes in the language files)
//   lang-tone      the Japanese UI text keeps the plain tone: no casual endings such as 「〜てね」「〜だよ」
//   shared-color   a colour written in two or more files of a game (outside src/data/, src/dev/, src/i18n/) needs a
//                  name in src/data/colors.ts (white and black excepted)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = f => path.relative(ROOT, f).split(path.sep).join('/');
const walk = d =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap(e =>
      e.name === 'node_modules'
        ? []
        : e.isDirectory()
          ? walk(path.join(d, e.name))
          : e.name.endsWith('.ts')
            ? [path.join(d, e.name)]
            : [],
    );
const files = [...walk(path.join(ROOT, 'engine')), ...walk(path.join(ROOT, 'games'))].map(f => ({
  f: rel(f),
  text: fs.readFileSync(f, 'utf8'),
}));

const problems = [];
const report = (f, i, rule, msg) => problems.push(`${f}:${i + 1}  [${rule}] ${msg}`);
const JA = /[\u3040-\u30ff\u3400-\u9fff]/;
// the code part of a line (a trailing // comment dropped; good enough for these checks, not a parser)
const code = line => line.replace(/(^|[^:'"`\\])\/\/.*$/, '$1');

for (const { f, text } of files) {
  const lines = text.split('\n');
  const isEngine = f.startsWith('engine/'),
    isLang = /\/src\/i18n\/[a-z]{2}\.ts$/.test(f),
    isTest = /\/(dev|test)\//.test(f);
  lines.forEach((line, i) => {
    const c = code(line);
    if (/\[\s*\w+\s*:\s*string\s*\]\s*:\s*any\b/.test(c))
      report(f, i, 'no-index-any', 'list the fields instead of [k: string]: any');
    if (/\bas\s+any\b/.test(c)) report(f, i, 'no-as-any', 'type it instead of `as any`');
    if (isEngine && /from\s+['"][^'"]*\/games\//.test(c))
      report(f, i, 'engine-import', 'engine must not import from games/');
    if (!isLang && !isTest) {
      for (const m of c.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g))
        if (JA.test(m[2])) {
          report(f, i, 'ui-text', `screen text belongs in src/i18n/: ${m[0].slice(0, 40)}`);
          break;
        }
    }
    if (isLang && /\/ja\.ts$/.test(f) && /てね|だよ|だね|よね/.test(c))
      report(f, i, 'lang-tone', 'keep the plain tone (〜する / 〜して), no 〜てね / 〜だよ');
  });
}

// shared-color: per game, colours written in more than one logic file
const byGame = {};
for (const { f, text } of files) {
  const m = f.match(/^games\/([^/]+)\//);
  if (!m || /\/src\/(data|dev|i18n)\//.test(f)) continue;
  text.split('\n').forEach((line, i) => {
    for (const h of code(line).matchAll(/(?:0x|#)([0-9a-fA-F]{6})\b/g)) {
      const hex = h[1].toLowerCase();
      if (hex === 'ffffff' || hex === '000000') continue;
      const g = (byGame[m[1]] = byGame[m[1]] || {}),
        at = (g[hex] = g[hex] || []);
      at.push([f, i]);
    }
  });
}
for (const g of Object.values(byGame))
  for (const [hex, at] of Object.entries(g)) {
    if (new Set(at.map(a => a[0])).size < 2) continue;
    for (const [f, i] of at)
      report(
        f,
        i,
        'shared-color',
        `#${hex} is written in ${new Set(at.map(a => a[0])).size} files: give it a name in src/data/colors.ts`,
      );
  }

if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n${problems.length} problem(s). The rules are in STYLE.md.`);
  process.exit(1);
}
console.log(`ok: ${files.length} files`);
