// Bot runs for Sector Dive Extended (npm run sim): a bot (src/dev/bot.ts) plays one run per seed through the real
// game loop, stepped by hand so it goes much faster than the clock, and the outcomes are printed as a table.
// Not a test: nothing is asserted but that the runs end.
import { beforeAll, expect, test } from 'vitest';
import { commands } from 'vitest/browser';
import { createRng } from '@engine/core/util.ts';
import { isBossStage } from '../src/core/stages.ts';
import { setDropOnly } from '../src/core/rules.ts';
import { WEAPONS, WEAPON_ORDER } from '../src/data/weapons.ts';
import { fillMag, newWeapon } from '../src/actors/weapons.ts';
import { normalizeWeapons } from '../src/ui/input.ts';
import { defaultSave, setSave } from '../src/core/save.ts';
import { activeTileGrid, tileIndex } from '@engine/world/tiles.ts';
import { boss, enemies } from '../src/world/entities.ts';
import { devSeed, level } from '../src/world/level.ts';
import { player, run } from '../src/actors/player.ts';
import { goBase, startRun } from '../src/flow/run.ts';
import { state } from '../src/flow/state.ts';
import { update } from '../src/flow/update.ts';
import { BOT_STYLES, createBot, setBot } from '../src/dev/bot.ts';

declare const __SIM_SEEDS__: string;
declare const __SIM_STYLE__: string;
declare const __SIM_WEAPON__: string;

const DT = 1 / 60;
// A run goes on for as long as the bot gets anywhere: it is given up only when nothing has moved on for a while (no
// kill, no new floor or depth, no hurt boss), which is a bot that is stuck and not a game that is hard
const STALL_FRAMES = 60 * 60 * 8; // ... for this much game time (8 minutes)
const MAX_FRAMES = 60 * 60 * 60 * 12; // and, to be safe, after this much (12 hours)
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

// the kinds of player to run: "all", or names of BOT_STYLES with commas between
const styles = __SIM_STYLE__ === 'all' ? Object.keys(BOT_STYLES) : __SIM_STYLE__.split(',');
// One weapon at a time (SIM_WEAPON: names of WEAPONS with commas between, or "all"): the player starts with that
// weapon alone and every drop of the run is that weapon, so the weapons are compared with the same luck in rarity
// and upgrades. Not set: the game as it is
const only: (string | null)[] = !__SIM_WEAPON__
  ? [null]
  : __SIM_WEAPON__ === 'all'
    ? WEAPON_ORDER
    : __SIM_WEAPON__.split(',');
const cases = styles.flatMap(style =>
  only.map(weapon => ({ style, weapon, name: weapon ? `${style}@${weapon}` : style })),
);
type Row = Record<string, string | number>;
const summary: Row[] = [];
const tsv = (rows: Row[]): string => {
  const cols = Object.keys(rows[0]!);
  return [cols.join('\t'), ...rows.map(r => cols.map(c => r[c]).join('\t'))].join('\n') + '\n';
};
const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const median = (v: number[]): number => [...v].sort((a, b) => a - b)[Math.floor((v.length - 1) / 2)]!;
// the most common of some words, as "word×n", the commonest first
function tally(words: string[], top: number): string {
  const n = new Map<string, number>();
  words.forEach(w => n.set(w, (n.get(w) ?? 0) + 1));
  return [...n]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([w, k]) => `${w}×${k}`)
    .join(' ');
}

test.each(cases)(`bot $name: seeds ${__SIM_SEEDS__}`, async ({ style: styleName, weapon, name }) => {
  const style = BOT_STYLES[styleName];
  expect(style, `no such style: ${styleName}`).toBeTruthy();
  if (weapon) expect(WEAPONS[weapon], `no such weapon: ${weapon}`).toBeTruthy();
  const rows: Row[] = [];
  for (const seed of seedsOf(__SIM_SEEDS__)) {
    // every run starts from a new save: what one run brings home (weapons, bits, upgrades) must not help the next
    setSave(defaultSave());
    devSeed(seed);
    // the game's own dice too (the sectors' order, the chips offered, the drops), so a seed is the same run for
    // every kind of player up to where they play differently
    Math.random = createRng(seed).next;
    const bot = createBot(style!);
    setDropOnly(weapon);
    startRun();
    if (weapon) {
      player.weapons = [fillMag(newWeapon(weapon, 0, true)), null];
      player.cur = 0;
      normalizeWeapons();
    }
    setBot(bot);
    let frames = 0,
      end = 'gave up';
    let moved = '',
      movedAt = 0;
    for (; frames < MAX_FRAMES; frames++) {
      const now = `${run.kills}:${run.stage}:${run.bld?.floor}:${boss ? Math.round(boss.hp) : ''}:${level.portals.length}`;
      if (now !== moved) {
        moved = now;
        movedAt = frames;
      } else if (frames - movedAt > STALL_FRAMES) break;
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
    // a run that was given up: what the floor looked like, to find where the bot went wrong
    if (end === 'gave up') {
      const w = activeTileGrid().world,
        k = tileIndex(player.x, player.z),
        at = (t: number) => `${t % w.W},${Math.floor(t / w.W)}`;
      s.trace.push(
        `-- gave up at tile ${at(k)} room ${level.roomOf[k]} floor ${level.floor} (lockdown done: ${run.bld?.ld})`,
        `   enemies left per room: ${level.roomCount.join(' ')}`,
        `   locked doors: ${[...(w.doorLock ?? [])].flatMap((v, t) => (v ? [at(t)] : [])).join(' ') || 'none'}`,
        ...enemies
          .filter(e => !e.dead)
          .map(
            e =>
              `   ${e.boss ? e.kind : e.type} room ${e.room} tile ${at(tileIndex(e.x, e.z))} y ${e.y.toFixed(1)} hp ${Math.round(e.hp)} active ${e.active}`,
          ),
      );
    }
    rows.push({
      seed,
      sector: level.biome.code,
      end,
      seconds: Math.round(s.frames / 60),
      depth: s.depth,
      bosses: (run?.bosses ?? []).join('>') || '-',
      toBoss: s.bossAt < 0 ? '-' : Math.round(s.bossAt / 60),
      bossHp: Math.round(s.bossHp * 100) + '%',
      weapons: player.weapons
        .map(w => (w ? `${w.id}${w.r}` : ''))
        .filter(Boolean)
        .join('+'),
      chips: run?.perks.length ?? 0,
      kills: run?.kills ?? 0,
      damage: Math.round(s.damage),
      minHp: Math.round(s.minHp * 100) + '%',
      kits: s.kits,
      hazard: s.hazard.toFixed(1),
      dashes: s.dashes,
      picked: s.picked,
      stuck: s.stuck,
      last: s.doing,
    });
    await commands.writeFile(`sim-results/traces/sector-dive-ex-${name}-${seed}.trace.txt`, s.trace.join('\n') + '\n');
    setBot(null);
    setDropOnly(null);
    if (stateNow() !== 'base') goBase();
    await sleep(0);
  }
  await commands.writeFile(`sim-results/sector-dive-ex-${name}.tsv`, tsv(rows));
  // one line per kind of player, for comparing them (and a change against what was there before)
  const depth = rows.map(r => r.depth as number),
    dead = rows.filter(r => r.end === 'died');
  summary.push({
    style: styleName,
    weapon: weapon ?? '-',
    runs: rows.length,
    depthMean: mean(depth).toFixed(2),
    depthMedian: median(depth),
    depthMax: Math.max(...depth),
    bossesMean: mean(rows.map(r => (r.bosses === '-' ? 0 : String(r.bosses).split('>').length))).toFixed(2),
    minutesMean: (mean(rows.map(r => r.seconds as number)) / 60).toFixed(1),
    died: dead.length,
    gaveUp: rows.filter(r => r.end === 'gave up').length,
    diedAtDepth1: dead.filter(r => r.depth === 1).length,
    killedBy: tally(
      dead.map(r => String(r.last).replace(/^fight /, '')),
      4,
    ),
  });
  await commands.writeFile('sim-results/sector-dive-ex-summary.tsv', tsv(summary));
  expect(rows.length).toBeGreaterThan(0);
});
