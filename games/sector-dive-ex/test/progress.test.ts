// Smoke test for Sector Dive Extended, the run's progress: depth, milestones, levels, the checkpoint, save and resume. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real loop by hand.
// Each test makes the state it needs; the file passes on its own and in any order (the dice are seeded where a test depends on them).
import { beforeAll, expect, test } from 'vitest';
import type { Snapshot } from '../src/data/types.ts';
import { el } from '@engine/core/util.ts';
import { tileIndex } from '@engine/world/tiles.ts';
import { encodeStore } from '@engine/core/store.ts';
import { WEAPONS } from '../src/data/weapons.ts';
import { LEVEL_DMG_MUL, isMilestone, PER, UPGRADES, levelCost, milestoneBelow } from '../src/data/progress.ts';
import { openLevelUp } from '../src/screens/levelup.ts';
import { basicW, defaultSave, exportSave, importSave, importSaveCheck, persist, save } from '../src/core/save.ts';
import {
  levelOf,
  nextLevelCost,
  progressOf,
  readiness,
  readinessScore,
  sellValue,
  startDmgMul,
} from '../src/core/rules.ts';
import { level } from '../src/world/level.ts';
import { makeTerminal } from '../src/world/portals.ts';
import { applyLevelPoint, currentWeapon, player, run } from '../src/actors/player.ts';
import { newWeapon, shotDamage } from '../src/actors/weapons.ts';
import { stageLabel } from '../src/core/stages.ts';
import { endRun, goBase, nextStage, startRun, startStage, useLink } from '../src/flow/run.ts';
import { BUILDING_V, building, setBuilding } from '../src/world/building.ts';
import { setState, show, state } from '../src/flow/state.ts';
import { discardSuspended, resumeRun, suspendRun } from '../src/flow/suspend.ts';
import { renderBase, showTab } from '../src/screens/base.ts';
import { update } from '../src/flow/update.ts';
import { stateIs, tick, bootGame, goToFloor } from './helpers.ts';

beforeAll(bootGame);

test('progress: depth start = depth*5, boss = depth*5+4 regardless of PER', () => {
  startRun();
  tick(5);
  if (
    progressOf(0) !== 0 ||
    progressOf(PER - 1) !== 4 ||
    progressOf(PER) !== 5 ||
    stageLabel(PER - 1) !== 'D1 BOSS' ||
    stageLabel(PER) !== 'D2 1/' + (PER - 1)
  )
    throw new Error('prog/label ' + [progressOf(PER - 1), progressOf(PER), stageLabel(PER - 1), stageLabel(PER)]);
});
test('milestones: dying goes back to the last one passed, coming back keeps the depth; old mods are paid back', () => {
  if ([0, 3, 4, 8, 9, 13, 14].map(milestoneBelow).join() !== '0,0,4,4,9,9,14') throw new Error('milestones');
  const keepS = [save.shortcut, save.startTier];
  save.shortcut = 12;
  save.startTier = 12;
  startRun();
  endRun('dead');
  const dead = [save.shortcut, save.startTier];
  save.shortcut = 12;
  save.startTier = 12;
  startRun();
  endRun('extract');
  const back = save.shortcut;
  [save.shortcut, save.startTier] = keepS;
  goBase();
  if (dead.join() !== '9,9' || back !== 12) throw new Error('milestone ' + dead + ' ' + back);
  // a save from before the issue: its base weapons' mods come back as bits (+1 50, +2 75, ★★ 300)
  const old = { ...defaultSave(), bits: 5, mods: { pistol: { plus: 2, r: 1 } } } as Record<string, unknown>;
  delete old.supplyV;
  if (!importSave(encodeStore('SDX1', old))) throw new Error('old save code');
  const paid = [save.bits, Object.keys(save.mods).length];
  el('#btnWipe').click();
  el('#btnWipeGo').click();
  if (paid.join() !== [5 + 50 + 75 + 300, 0].join()) throw new Error('mods paid back ' + paid);
});
test('checkpoint: saved at stage start, deleted when the run ends', () => {
  startRun();
  tick(5);
  show(null);
  setState('play');
  if (!save.suspend || save.suspend.run.stage !== run.stage) throw new Error('checkpoint at stage start');
  const bits0 = save.suspend.run.bits;
  run.bits += 999;
  if (save.suspend.run.bits !== bits0) throw new Error('checkpoint changed mid-stage');
  nextStage();
  if (save.suspend.run.stage !== run.stage) throw new Error('checkpoint on next stage');
  endRun('dead');
  if (save.suspend) throw new Error('checkpoint survived the end of the run');
  goBase();
  startRun();
  tick(5); // leave a run going for the next check
});
test('suspend -> resume -> suspend -> discard', () => {
  // the lowest floor of the building (stage 2 of the depth), reached by one of its stairs or lifts
  run.route = [0];
  run.stage = 0;
  // (a building of its own: one left by an earlier test is of another sector, and built again from its seed for this
  // one it may come out with another number of floors than its state has)
  run.bld = undefined;
  startStage();
  goToFloor(building!.plans.length - 1);
  tick(30);
  const seedWas = run.bld!.seed,
    stageWas = run.stage;
  suspendRun();
  if (!save.suspend || state !== 'base') throw new Error('suspend failed');
  resumeRun();
  tick(60);
  if (run.stage !== stageWas || (save.suspend as Snapshot | null)?.run.stage !== stageWas)
    throw new Error('resume failed');
  if (run.bld!.seed !== seedWas || level.floor !== building!.plans.length - 1 || !level.hall)
    throw new Error('not the same building');
  suspendRun();
  discardSuspended();
  if (save.suspend || !stateIs('result')) throw new Error('discard failed');
});
test('resume: a checkpoint from before the run kinds resumes as a dive', () => {
  startRun();
  tick(5);
  suspendRun();
  if (!save.suspend) throw new Error('no checkpoint');
  const old = save.suspend.run as { kind?: string };
  delete old.kind;
  resumeRun();
  expect(run.kind, 'the old checkpoint is a dive').toBe('dive');
  endRun('abandon');
});
test('wipe: data wipe resets the save', () => {
  goBase();
  save.bits = 999;
  save.up.hp = 3;
  el('#btnWipe').click();
  el('#btnWipeGo').click();
  if (save.bits !== 0 || save.up.hp !== 0 || !el('#dlgWipe').hidden) throw new Error('wipe failed');
});
test('save codes: round trip, a bad code is refused', () => {
  save.bits = 777;
  save.up.dmg = 2;
  persist();
  const code = exportSave();
  save.bits = 1;
  save.up.dmg = 0;
  persist();
  if (importSaveCheck(code.slice(0, -1) + (code.endsWith('0') ? '1' : '0')) || importSave('SDX1:abc.00000000'))
    throw new Error('bad save code accepted');
  if (!importSave(code) || save.bits !== 777 || save.up.dmg !== 2) throw new Error('save code round trip');
  el('#btnExport').click();
  if (el('#savePanel').hidden || !el<HTMLTextAreaElement>('#saveCode').value.startsWith('SDX1:'))
    throw new Error('export panel');
  el('#btnExport').click();
  if (!el('#savePanel').hidden) throw new Error('export panel toggle');
  el('#btnWipe').click();
  el('#btnWipeGo').click();
});
test('readiness: easy at DEPTH 1, harder deeper; levels make it easier', () => {
  // (a plain handgun reads 1.75 against the fixed yardstick READY_REF_DPS: DEPTH 1 is "comfortable")
  const fresh = [0, 1, 2, 4].map(n => readiness(n));
  if (fresh[0] !== 1 || fresh.some((r, i) => i && r < fresh[i - 1]!)) throw new Error('readiness fresh ' + fresh);
  const s0 = readinessScore(2);
  save.up.dmg = 6;
  save.up.hp = 6;
  save.loadout = [basicW('rail'), null];
  const s1 = readinessScore(2);
  if (!(s1 > s0)) throw new Error('readiness upgrades ' + s0 + ' ' + s1);
});
test('level: one price for every point, a little more each level; armour and output have no cap', () => {
  // (a checkpoint of a dive in progress locks the level rows, so the dive the file began with is ended first)
  goBase();
  startRun();
  tick(2);
  endRun('abandon');
  const keepUp = { ...save.up },
    keepBits = save.bits;
  if (levelCost(0) !== 80 || !(levelCost(1) > levelCost(0)) || levelCost(10) !== Math.round(80 * 1.2 ** 10))
    throw new Error('level cost');
  for (const id of ['hp', 'dmg']) if (isFinite(UPGRADES.find(u => u.id === id)!.max)) throw new Error('capped ' + id);
  // two levels from the base: the same price on any row, the next one dearer; the points go where they were put
  for (const k of Object.keys(save.up)) save.up[k] = 0;
  save.bits = 1000;
  goBase();
  showTab('up');
  renderBase();
  const c0 = nextLevelCost();
  document.querySelector<HTMLButtonElement>('[data-up="hp"]')!.click();
  const c1 = nextLevelCost();
  document.querySelector<HTMLButtonElement>('[data-up="dmg"]')!.click();
  const got = [save.up.hp, save.up.dmg, levelOf(), save.bits];
  // a point with a cap reached cannot be bought
  save.up.choice = 1;
  renderBase();
  const full = document.querySelector<HTMLButtonElement>('[data-up="choice"]')!.disabled;
  Object.assign(save.up, keepUp);
  save.bits = keepBits;
  renderBase();
  if (got.join() !== [1, 1, 2, 1000 - c0 - c1].join() || !(c1 > c0) || !full) throw new Error('level buy ' + got);
});
test('level: none while a dive is suspended; the chip offers keep the count the dive set out with', () => {
  const keepUp = { ...save.up },
    keepBits = save.bits;
  goBase();
  startRun();
  const set = run.choice;
  save.up.choice = 1; // as if bought at the base while this dive was out
  const live = run.choice;
  endRun('abandon');
  save.up.choice = keepUp.choice;
  // a suspended dive: the rows cannot be bought, and a click does nothing
  save.bits = 1000;
  save.suspend = { run: { stage: 0, route: [0] }, P: {} } as unknown as typeof save.suspend;
  goBase();
  showTab('up');
  renderBase();
  const btn = document.querySelector<HTMLButtonElement>('[data-up="hp"]')!,
    off = btn.disabled;
  btn.disabled = false;
  btn.click();
  const hp = save.up.hp;
  save.suspend = null;
  Object.assign(save.up, keepUp);
  save.bits = keepBits;
  renderBase();
  if (set !== (keepUp.choice || 0) || live !== set || !off || hp !== keepUp.hp)
    throw new Error('suspended level ' + [set, live, off, hp]);
});
test("level: a milestone level-up spends the dive's bits, counts at once, and keeps the save's bits", () => {
  const keepUp = { ...save.up },
    keepBits = save.bits;
  goBase();
  startRun();
  tick(2);
  run.bits = 1000;
  const hp0 = player.maxHp,
    cost = nextLevelCost();
  openLevelUp();
  const open = stateIs('perk') && el('#scrPerk').dataset.mode === 'level';
  document.querySelector<HTMLButtonElement>('#perkList [data-level="hp"]')!.click();
  const got = [player.maxHp - hp0, 1000 - run.bits, save.up.hp! - (keepUp.hp || 0), save.bits === keepBits];
  el('#perkDone').click();
  const closed = stateIs('play');
  endRun('abandon');
  Object.assign(save.up, keepUp);
  save.bits = keepBits;
  persist();
  if (!open || !closed || got.join() !== [15, cost, 1, true].join()) throw new Error('milestone level ' + got);
  if (![4, 9, 14].every(isMilestone) || isMilestone(5) || isMilestone(0)) throw new Error('isMilestone');
});
test('level: a point in output multiplies the damage, apart from the chips (so it counts as much with many chips)', () => {
  const keepUp = { ...save.up };
  goBase();
  startRun();
  tick(2);
  const w = currentWeapon(),
    def = WEAPONS[w.id]!,
    dmg0 = shotDamage(def, w);
  applyLevelPoint(player, 'dmg');
  const one = shotDamage(def, w) / dmg0;
  player.dmgMul += 10; // a deep dive's chips
  const many = shotDamage(def, w);
  applyLevelPoint(player, 'dmg');
  const oneMore = shotDamage(def, w) / many;
  endRun('abandon');
  Object.assign(save.up, keepUp);
  expect(one).toBeCloseTo(LEVEL_DMG_MUL, 9);
  expect(oneMore, 'with chips, a point is worth the same').toBeCloseTo(LEVEL_DMG_MUL, 9);
  expect(startDmgMul(10)).toBeCloseTo(Math.pow(LEVEL_DMG_MUL, 10), 9);
});
test("level: a milestone's terminal opens on stepping onto it, sells the bag's weapons, and not again until stepped off", () => {
  goBase();
  startRun();
  tick(5);
  const bits0 = run.bits;
  const w = newWeapon('smg', 0);
  player.bag[0] = w;
  makeTerminal(player.x, player.z, 0xffffff, '');
  tick(90);
  const underfoot = stateIs('play');
  player.x += 3;
  tick(2);
  player.x -= 3;
  update(1 / 60);
  const open = stateIs('perk') && el('#scrPerk').dataset.mode === 'level' && !el('#sellList').hidden;
  document.querySelector<HTMLButtonElement>('#sellList [data-sell="0"]')!.click();
  const sold = [run.bits - bits0 === sellValue(w), player.bag[0] === null, el('#sellList').hidden];
  el('#perkDone').click();
  update(1 / 60);
  const stays = stateIs('play');
  endRun('abandon');
  if (!underfoot) throw new Error('terminal opened underfoot');
  if (!open) throw new Error('terminal did not open');
  if (sold.join() !== [true, true, true].join()) throw new Error('terminal sell ' + sold);
  if (!stays) throw new Error('terminal opened again without stepping off');
});
test('level: a save from before it has the reboot folded into its points', () => {
  const old = {
    ...defaultSave(),
    up: { hp: 2, dmg: 1, spd: 0, dash: 0, stam: 0, gain: 0, kit: 0, chip: 0 },
    pres: { count: 3, pts: 2, up: { gain: 1, hp: 3, funds: 1, relic: 0, choice: 1, dmg: 8, vit: 0 } },
    canReboot: true,
    bits: 5,
  } as Record<string, unknown>;
  delete old.levelV;
  if (!importSave(encodeStore('SDX1', old))) throw new Error('old save code');
  const got = [save.up.hp, save.up.dmg, save.up.choice, save.levelV, 'pres' in save, save.bits];
  el('#btnWipe').click();
  el('#btnWipeGo').click();
  // (armour 2 + its +10 HP x 3 = 2 points; output 1 + its +5% x 8 = 5 points)
  if (got.join() !== [4, 6, 1, 1, false, 5].join()) throw new Error('old save ' + got);
});
test('readiness: a strong loadout still gets harder the deeper you start', () => {
  const strong = { weapons: [{ id: 'shotgun', r: 2, plus: 37, opts: [] }], dmg: 1.48, hp: 200 };
  const deep = [6, 9, 13, 19].map(n => readinessScore(n, strong));
  if (deep.some((v, i) => i && v >= deep[i - 1]!)) throw new Error('readiness deep ' + deep.map(v => v.toFixed(2)));
  el('#btnWipe').click();
  el('#btnWipeGo').click();
});
test('resume: a run saved on a building laid out another way goes on at the same step of the route', () => {
  goBase();
  startRun();
  tick(5);
  useLink(0);
  tick(5);
  const route = building!.route,
    arrive = building!.links[0]!;
  expect(run.bld!.step).toBe(1);
  // the checkpoint as an older layout left it: no version, the stairwell or lift it came by and the rooms out of range
  const saved = (save.suspend as Snapshot | null)!.run.bld!;
  delete saved.v;
  saved.at = 99;
  saved.cleared = saved.cleared.map(() => [98, 99]);
  saved.seen = ['broken'];
  suspendRun();
  setBuilding(null);
  resumeRun();
  tick(5);
  const st = run.bld!;
  expect(st.v).toBe(BUILDING_V);
  expect([st.step, st.floor, level.floor]).toEqual([1, route[1], route[1]]);
  expect(tileIndex(player.x, player.z), 'where the first step of the route lets the player off').toBe(arrive.b);
  // the top floor counts as done: every room, so its rooms give no chips again; the floor played now is not entered yet
  expect(st.cleared[0]!.length).toBe(building!.plans[0]!.gen.rooms.length);
  expect(st.visited[0]).toBe(true);
  expect(st.cleared[route[1]!]).toEqual([]);
  expect(
    level.roomCount.some(n => n > 0),
    'the floor has its enemies',
  ).toBe(true);
  expect(
    building!.plans.filter((_, floor) => floor !== route[1]).every(p => p.seen.every(v => v === 0)),
    'the map starts unexplored (but where the player stands now)',
  ).toBe(true);
});
