// npm run sim, run as several at once (npm run sim:split): the seeds (SIM_SEEDS) are cut into SIM_JOBS parts (2 when
// not given), each part run by a sim of its own with its own browser (Playwright's Chromium: CHROME is ignored, as one
// Chrome shared by two runs dropped one of them), port and output names (sim-results/sector-dive-ex-part<n>-...), and
// the parts' tables are joined into the usual ones at the end. A run takes as long as before; the whole is about
// SIM_JOBS times faster while the machine has the cores and the memory (each browser takes some hundreds of MB).
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const seeds = (process.env.SIM_SEEDS ?? '1-10').split(',').flatMap(part => {
  const [a, b] = part.split('-').map(Number);
  return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, n) => a + n);
});
const jobs = Math.max(1, Math.min(Number(process.env.SIM_JOBS ?? 2), seeds.length));
const parts = Array.from({ length: jobs }, (_, j) => seeds.filter((_, n) => n % jobs === j));
const env = { ...process.env };
delete env.CHROME;

const runs = parts.map(
  (part, j) =>
    new Promise(done => {
      const child = spawn('npx', ['vitest', 'run', '--config', 'vitest.sim.config.ts'], {
        env: { ...env, SIM_SEEDS: part.join(','), SIM_TAG: `part${j}-`, SIM_PORT: String(63400 + j) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const log = fs.createWriteStream(`sim-results/sim-part${j}.log`);
      child.stdout.pipe(log);
      child.stderr.pipe(log);
      child.on('close', code => {
        console.log(
          `part ${j} (seeds ${part.join(',')}): ${code === 0 ? 'done' : 'failed, see sim-results/sim-part' + j + '.log'}`,
        );
        done(code);
      });
    }),
);
const codes = await Promise.all(runs);

// join the parts' tables (the per-run ones by name; each part's rows in seed order)
const files = fs
  .readdirSync('sim-results')
  .filter(f => /^sector-dive-ex-part\d+-.+\.tsv$/.test(f) && !f.endsWith('summary.tsv'));
const byName = new Map();
for (const f of files) {
  const name = f.replace(/^sector-dive-ex-part\d+-/, '');
  const [head, ...rows] = fs.readFileSync(`sim-results/${f}`, 'utf8').trimEnd().split('\n');
  const t = byName.get(name) ?? { head, rows: [] };
  t.rows.push(...rows);
  byName.set(name, t);
}
for (const [name, t] of byName) {
  t.rows.sort((a, b) => Number(a.split('\t')[0]) - Number(b.split('\t')[0]));
  fs.writeFileSync(`sim-results/sector-dive-ex-${name}`, [t.head, ...t.rows].join('\n') + '\n');
  console.log(`sim-results/sector-dive-ex-${name}: ${t.rows.length} runs`);
}
process.exit(codes.some(c => c !== 0) ? 1 : 0);
