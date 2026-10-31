// Smoke test for Sector Dive Extended, chips: scaling, supply picks and rarity. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real loop by hand.
// Each test makes the state it needs; the file passes on its own and in any order (the dice are seeded where a test depends on them).
import { beforeAll, expect, test } from 'vitest';
import { camera } from '@engine/render/render.ts';
import { LOOP } from '@engine/core/loop.ts';
import { ELITE_TYPES } from '../src/data/enemies.ts';
import { BIOMES } from '../src/data/biomes.ts';
import { TUNE } from '../src/data/progress.ts';
import { PERKS } from '../src/data/perks.ts';
import { save } from '../src/core/save.ts';
import { perkName } from '../src/core/rules.ts';
import { player, newPlayer, run, setPlayer } from '../src/actors/player.ts';
import { rollWeapon } from '../src/actors/weapons.ts';
import { endRun, goBase, pickEnemyType, startPractice, startRun } from '../src/flow/run.ts';
import { setState, show } from '../src/flow/state.ts';
import { openPerk } from '../src/screens/perk.ts';
import { stateIs, tick, bootGame } from './helpers.ts';

beforeAll(bootGame);

test('shortcut supply: 2 picks at DEPTH 3, chips applied supplyTimes times', () => {
  const keep = [save.shortcut, save.startTier, save.up.chip];
  save.shortcut = 2;
  save.startTier = 2;
  save.up.chip = 0;
  goBase();
  startRun();
  tick(3);
  const pick = (id: string) => {
    const cards = [...document.querySelectorAll<HTMLElement>('#perkList .perk')];
    const c = cards.find(b => b.querySelector('.pn')!.textContent!.includes(perkName(id))) || cards[0]!;
    c.click();
  };
  if (!document.querySelector('#perkList .pn')!.textContent!.includes('×' + TUNE.supplyTimes))
    throw new Error('supply card label');
  pick('overload');
  pick('overload');
  [save.shortcut, save.startTier, save.up.chip] = keep;
  // a capped chip (pierce, crit, reload, magazine) stops once maxed: after 3-4 of the supplyTimes, or after 2 when
  // the card is the rare version (the cards are random, so the wanted chip is not always among them)
  if (run.perks.length < 4 || run.perks.length > 2 * TUNE.supplyTimes)
    throw new Error('supply picks ' + run.perks.length);
  // the heal chip is never a supply pick; stamina regen and pickup range add up per chip instead of multiplying
  for (let k = 0; k < 40; k++) {
    openPerk('test', 'loadout', undefined, TUNE.supplyTimes);
    if ([...document.querySelectorAll('#perkList .pn')].some(n => n.textContent!.includes(perkName('repair'))))
      throw new Error('repair offered as supply');
  }
  show(null);
  setState('play');
  {
    const keep = player;
    setPlayer(newPlayer(save.loadout));
    const r0 = player.stRegen,
      sp = PERKS.find(x => x.id === 'sprint')!,
      mg = PERKS.find(x => x.id === 'magnet')!;
    for (let k = 0; k < 5; k++) {
      sp.apply(player, sp.v);
      mg.apply(player, mg.v);
    }
    const regen = player.stRegen - r0,
      range = player.magnet;
    // the stamina regen stops at its cap (without one, a dash was back in a moment and the player dashed without end)
    for (let k = 0; k < 20; k++) sp.apply(player, sp.rv!);
    const capped = player.stRegen === TUNE.staminaRegenCap && sp.maxed!(player);
    setPlayer(keep);
    if (Math.abs(regen - 5 * sp.v * TUNE.staminaRegen) > 1e-9 || Math.abs(range - 5) > 1e-9)
      throw new Error('additive chips ' + regen + ' ' + range);
    if (!capped) throw new Error('the stamina regen has a cap');
  }
  // deep drops: rarer on the whole, but not all ★★★
  {
    const rs = Array.from({ length: 400 }, () => rollWeapon(100).r),
      top = rs.filter(r => r === 2).length / rs.length;
    if (!(top > 0.4 && top < 0.7) || !rs.includes(0)) throw new Error('deep rarity ' + top);
  }
  endRun('abandon');
  goBase();
});
test("the start chips' pick: the camera is already on the player, not where the base's backdrop left it", () => {
  const keep = save.up.chip;
  save.up.chip = 1;
  goBase();
  // where the backdrop could have left the camera (flow/attract.ts)
  camera.position.set(-50, 1, -50);
  camera.rotation.set(-0.05, 2, 0);
  startRun();
  save.up.chip = keep;
  expect(stateIs('perk')).toBe(true);
  expect(Math.hypot(camera.position.x - player.x, camera.position.z - player.z)).toBeLessThan(1e-6);
  expect(camera.rotation.y).toBeCloseTo(player.yaw);
  document.querySelector<HTMLElement>('#perkList .perk')!.click();
  endRun('abandon');
  goBase();
});
test('the new base draws nothing behind it; a dive and boss practice draw again', () => {
  goBase();
  expect(LOOP.draw).toBe(false);
  startRun();
  expect(LOOP.draw).toBe(true);
  endRun('abandon');
  goBase();
  expect(LOOP.draw).toBe(false);
  startPractice('crusher', 0);
  expect(LOOP.draw).toBe(true);
  endRun('abandon');
  goBase();
});
test('rare chips show up gold; deep sectors favour tougher enemy types', () => {
  startRun();
  tick(3);
  const keep = TUNE.rareChipChance;
  TUNE.rareChipChance = 1;
  openPerk('test');
  const rareCards = document.querySelectorAll('#perkList .perk.rare').length;
  TUNE.rareChipChance = keep;
  player.hp = 1; // so a healing chip also visibly changes something
  const before = JSON.stringify(player);
  document.querySelector<HTMLElement>('#perkList .perk.rare')!.click();
  if (!rareCards || JSON.stringify(player) === before || !run.perks[run.perks.length - 1].endsWith('+'))
    throw new Error('rare chip');
  player.crit = TUNE.critCap;
  player.reloadMul = 0.4;
  player.magMul = 2.5;
  player.pierce = 3;
  for (let k = 0; k < 30; k++) {
    openPerk('test');
    const names = [...document.querySelectorAll('#perkList .pn')].map(n => n.textContent),
      maxedNames = ['crit', 'reload', 'mag', 'pierce'].map(id => perkName(id));
    if (names.some(n => maxedNames.some(m => n.replace(/^★ /, '').replace(/\+$/, '') === m)))
      throw new Error('maxed chip offered ' + names);
  }
  show(null);
  setState('play');
  let elite = 0;
  for (let k = 0; k < 400; k++) if (ELITE_TYPES.includes(pickEnemyType(BIOMES[3], 10))) elite++;
  let elite0 = 0;
  for (let k = 0; k < 400; k++) if (ELITE_TYPES.includes(pickEnemyType(BIOMES[3], 0))) elite0++;
  if (!(elite > elite0)) throw new Error('elite bias ' + elite0 + ' ' + elite);
  endRun('abandon');
});
