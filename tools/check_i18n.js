// Checks the language files: every key used in the code / HTML exists in each language,
// and every language has the same ui keys and data entries as ja. Run: node tools/check_i18n.js games/<game-id>
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(path.join(__dirname, '..'), process.argv[2] || (console.error('usage: node tools/check_i18n.js games/<game-id>'), process.exit(2)));
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(path.join(root, 'js'));
const ctx = { LANG: {}, pct: v => `${Math.round(v * 100)}%`, console };
vm.createContext(ctx);
for (const f of fs.readdirSync(path.join(root, 'js/lang'))) vm.runInContext(fs.readFileSync(path.join(root, 'js/lang', f), 'utf8').replace(/^import .*$/gm, ''), ctx); // the imports (LANG, pct) come from ctx
const LANG = ctx.LANG, used = new Set();
const code = files.filter(f => !f.includes('/lang/')).map(f => fs.readFileSync(f, 'utf8')).join('\n');
for (const m of code.matchAll(/\bt\(\s*'([\w.]+)'/g)) used.add(m[1]);
for (const m of code.matchAll(/\bt\([^'()]*\?\s*'([\w.]+)'\s*:\s*'([\w.]+)'/g)) { used.add(m[1]); used.add(m[2]); }
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const m of html.matchAll(/data-i18n(?:-\w+)?="([\w.]+)"/g)) used.add(m[1]);
let bad = 0;
const say = s => { console.log(s); bad++; };
for (const code of Object.keys(LANG)) {
  const L = LANG[code];
  for (const k of used) if (!(k in L.ui)) say(`${code}: missing ui key ${k}`);
  for (const k of Object.keys(LANG.ja.ui)) if (!(k in L.ui)) say(`${code}: missing ui key ${k} (in ja)`);
  for (const k of Object.keys(L.ui)) if (!(k in LANG.ja.ui)) say(`${code}: extra ui key ${k}`);
  for (const sec of Object.keys(LANG.ja.data)) {
    if (!L.data[sec]) { say(`${code}: missing data.${sec}`); continue; }
    const a = LANG.ja.data[sec], b = L.data[sec];
    if (Array.isArray(a)) { if (a.length !== b.length) say(`${code}: data.${sec} has ${b.length} rows, ja has ${a.length}`); continue; }
    for (const k of Object.keys(a)) {
      if (!b[k]) { say(`${code}: missing data.${sec}.${k}`); continue; }
      for (const f of Object.keys(a[k])) if (!(f in b[k])) say(`${code}: missing data.${sec}.${k}.${f}`);
    }
  }
}
const unused = Object.keys(LANG.ja.ui).filter(k => !used.has(k));
if (unused.length) console.log('not found in code (may be built dynamically):', unused.join(' '));
console.log(bad ? `${bad} problem(s)` : `ok: ${Object.keys(LANG).join(', ')} / ${used.size} keys used`);
process.exit(bad ? 1 : 0);
