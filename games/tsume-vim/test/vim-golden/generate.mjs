// Writes the results of real Vim 9.1 for the cases in vim-golden.test.ts to cases.json.
// Usage: node games/tsume-vim/test/vim-golden/generate.mjs   (needs `vim` on PATH; CI has none)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LINES = ['foo (bar) baz', '  qux "x y" end', '', 'one {two} three', 'last line 42'];
const STARTS = [
  [0, 6],
  [1, 4],
  [3, 2],
];
const MOTIONS = [
  'h',
  'j',
  'k',
  'l',
  '0',
  '^',
  '$',
  'w',
  'b',
  'e',
  'W',
  'B',
  'E',
  'gg',
  'G',
  '2G',
  '+',
  '-',
  '_',
  '2_',
  '{',
  '}',
  '%',
  '5|',
  'g_',
  'ge',
  'gE',
  'fa',
  'Fo',
  'ta',
  'To',
  '2fa',
  'fa;',
  'fa,',
  '/e<CR>',
  '?o<CR>',
  '/e<CR>n',
  '/e<CR>N',
  '*',
  '#',
  "'m",
  '`m',
  '<CR>',
  '3w',
  '2j',
  '3e',
  '2b',
];
const TEXT_OBJECTS = ['iw', 'aw', 'iW', 'aW', 'i"', 'a"', "i'", 'i(', 'a(', 'ib', 'i)', 'i{', 'a{', 'iB', 'i[', 'i<'];
// normal-mode edits: counts, J, ~, r, put, insert with a count, . and undo, Ctrl-a/x
const EDITS = [
  'x',
  '3x',
  'X',
  '3X',
  '~',
  '3~',
  '~~',
  'J',
  '3J',
  'VjjJ',
  'r#',
  '3r#',
  'D',
  '2D',
  'C#<Esc>',
  's#<Esc>',
  '3s#<Esc>',
  'S#<Esc>',
  'cc#<Esc>',
  'dd',
  '2dd',
  'ddp',
  'ddP',
  'yyp',
  'yyP',
  'yy2p',
  'yiwp',
  'yiwP',
  'yiw3P',
  'yj3p',
  'o#<Esc>',
  'O#<Esc>',
  '3o#<Esc>',
  'i#<Esc>',
  'a#<Esc>',
  'I#<Esc>',
  'A#<Esc>',
  '3i#<Esc>',
  '3a#<Esc>',
  '>>',
  '<<',
  '3>>',
  '>j',
  '<C-a>',
  '3<C-a>',
  '<C-x>',
  '12<C-x>',
  'x.',
  'x3.',
  '3x2.',
  'x3.u',
  'dw.',
  'ddu',
  'xu<C-r>',
  'xxuu',
  'Jx',
  'ddx',
  '3x2..',
  'x3..',
];
const EDIT_LINES = ['foo  ', '  bar baz', ')qux', '', 'x 0x1f -5 Abc', 'last'];
const EDIT_STARTS = [
  [0, 0],
  [1, 4],
  [4, 2],
];
const VISUAL_OPS = [
  'p',
  'P',
  'r#',
  '~',
  'J',
  '>',
  '<',
  'y',
  'd',
  'c#<Esc>',
  'x',
  'X',
  'D',
  'C#<Esc>',
  'S#<Esc>',
  'Y',
  's#<Esc>',
  '"ad"ap',
  '"ay"aP',
];

const GROUPS = {
  move: MOTIONS,
  visual: MOTIONS.flatMap(m => [`v${m}d`, `V${m}d`]),
  op: MOTIONS.flatMap(m => [`d${m}`, `y${m}P`, `c${m}#<Esc>`]),
  textobj: TEXT_OBJECTS.flatMap(t => [`v${t}d`, `d${t}`, `c${t}#<Esc>`, `y${t}P`]),
  visualop: VISUAL_OPS.flatMap(o => [`yiwvl${o}`, `yyVj${o}`, `yiwvj${o}`]),
  normal: EDITS,
};
const bufferOf = g => (g === 'normal' ? { lines: EDIT_LINES, starts: EDIT_STARTS } : { lines: LINES, starts: STARTS });

const dir = mkdtempSync(join(tmpdir(), 'vim-golden-'));
// a result is { lines, cursor: [line, col] }, or null when Vim reported an error
function runVim(lines, start, ks) {
  const file = join(dir, 'b.txt');
  const out = join(dir, 'out.txt');
  writeFileSync(file, lines.join('\n') + '\n');
  writeFileSync(out, '');
  const vimKeys = ks
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/<(Esc|CR|C-a|C-x|C-r)>/g, '\\<$1>');
  const script = [
    'set sw=2 et nocp',
    'call cursor(4, 7)',
    'normal! mm',
    `call cursor(${start[0] + 1}, ${start[1] + 1})`,
    "let v:errmsg = ''",
    `silent! call feedkeys("${vimKeys}", 'tx')`,
    `call writefile(v:errmsg != '' ? [] : [json_encode({'lines': getline(1, '$'), 'cursor': [line('.') - 1, col('.') - 1]})], '${out}')`,
    'qa!',
  ];
  writeFileSync(join(dir, 's.vim'), script.join('\n'));
  spawnSync('vim', ['-Nu', 'NONE', '-i', 'NONE', '-es', '-S', join(dir, 's.vim'), file], { stdio: 'ignore' });
  const res = readFileSync(out, 'utf8').trim();
  return res ? JSON.parse(res) : null;
}

const cases = [];
for (const [group, keysList] of Object.entries(GROUPS)) {
  const { lines, starts } = bufferOf(group);
  for (const keys of keysList) {
    for (const start of starts) {
      const result = runVim(lines, start, keys);
      if (result === null) continue;
      cases.push({ group, lines, start, keys, lines_after: result.lines, cursor: result.cursor });
    }
  }
}
writeFileSync(new URL('./cases.json', import.meta.url), JSON.stringify(cases, null, 2) + '\n');
console.log(`wrote ${cases.length} cases`);
