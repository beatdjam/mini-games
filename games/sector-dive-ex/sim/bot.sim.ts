// Bot runs for Sector Dive Extended (npm run sim): a bot (src/dev/bot.ts) plays one run per seed through the real
// game loop, stepped by hand so it goes much faster than the clock, and the outcomes are printed as a table.
// Not a test: nothing is asserted but that the runs end.
import { beforeAll, expect, test } from 'vitest';
import { commands } from 'vitest/browser';
import { createRng } from '@engine/core/util.ts';
import { isBossStage } from '../src/core/stages.ts';
import { boss } from '../src/world/entities.ts';
import { devSeed, level } from '../src/world/level.ts';
import { player, run } from '../src/actors/player.ts';
import { goBase, startRun } from '../src/flow/run.ts';
import { state } from '../src/flow/state.ts';
import { update } from '../src/flow/update.ts';
import { BOT_STYLES, createBot, setBot } from '../src/dev/bot.ts';

declare const __SIM_SEEDS__: string;
declare const __SIM_STYLE__: string;

const DT = 1 / 60;
const MAX_FRAMES = 60 * 60 * 20; // a run is given up after this much game time (20 minutes)
const YIELD_EVERY = 600; // frames between letting the page breathe (its timers run then)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const stateNow = () => state as string; // a call, so TypeScript does not keep the narrowing of an earlier check

// "1-20" or "3,7,9"
function seedsOf(text: string): number[] {
  return text.split(',').flatMap(part => {
    const [a, b] = part.split('-').map(Number);
    return b === undefined ? [a!] : Array.from({ length: b - a! + 1 }, (_, n) => a! + n);
  });
}

beforeAll(async () => {
  await import('../src/main.ts');
  await sleep(300); // the start-up timers
});

test(`bot ${__SIM_STYLE__}: seeds ${__SIM_SEEDS__}`, async () => {
  const style = BOT_STYLES[__SIM_STYLE__];
  expect(style, `no such style: ${__SIM_STYLE__}`).toBeTruthy();
  const rows: Record<string, string | number>[] = [];
  for (const seed of seedsOf(__SIM_SEEDS__)) {
    devSeed(seed);
    // the game's own dice too (the sectors' order, the chips offered, the drops), so a seed is the same run for
    // every kind of player up to where they play differently
    Math.random = createRng(seed).next;
    const bot = createBot(style!);
    startRun();
    setBot(bot);
    let frames = 0,
      end = 'gave up';
    for (; frames < MAX_FRAMES; frames++) {
      update(DT);
      if (stateNow() === 'result' || stateNow() === 'base') {
        end = player.hp <= 0 ? 'died' : 'extract';
        break;
      }
      // the boss comes on a timer of the page, not of the game: wait for it in real time
      if (isBossStage(run.stage) && !boss && !level.portals.length) await sleep(30);
      else if (frames % YIELD_EVERY === 0) await sleep(0);
    }
    const s = bot.stats;
    rows.push({
      seed,
      sector: level.biome.code,
      end,
      seconds: Math.round(s.frames / 60),
      floors: s.floors,
      toBoss: s.bossAt < 0 ? '-' : Math.round(s.bossAt / 60),
      bossHp: Math.round(s.bossHp * 100) + '%',
      weapon: player.weapons[player.cur]?.id ?? '-',
      chips: run?.perks.length ?? 0,
      kills: run?.kills ?? 0,
      damage: Math.round(s.damage),
      minHp: Math.round(s.minHp * 100) + '%',
      kits: s.kits,
      stuck: s.stuck,
      last: s.doing,
    });
    await commands.writeFile(
      `sim-results/sector-dive-ex-${__SIM_STYLE__}-${seed}.trace.txt`,
      s.trace.join('\n') + '\n',
    );
    setBot(null);
    if (stateNow() !== 'base') goBase();
    await sleep(0);
  }
  const cols = Object.keys(rows[0]!),
    table = [cols.join('\t'), ...rows.map(r => cols.map(c => r[c]).join('\t'))].join('\n'),
    summary = `${rows.filter(r => r.end === 'extract').length}/${rows.length} extracted`;
  // (the table goes to a file as well: sim-results/, not committed)
  await commands.writeFile(`sim-results/sector-dive-ex-${__SIM_STYLE__}.tsv`, table + '\n');
  console.log(`${table}\n${summary}`);
  expect(rows.length).toBeGreaterThan(0);
});
