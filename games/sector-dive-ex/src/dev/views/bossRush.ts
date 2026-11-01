import { BOSS_AREA_START_TIER } from '../../data/progress.ts';
import { BOSS_RUSH_HASH, defaultSave, persist, save, setSave } from '../../core/save.ts';
import { devBossAreaGear, devBossAreaStart } from '../../core/progress.ts';
import { startRun } from '../../flow/run.ts';
import { state } from '../../flow/state.ts';
import { BOSS_TUNE } from '../../data/bosses.ts';
import { player } from '../../actors/player.ts';
import { fillMag, newWeapon, wDmgMul } from '../../actors/weapons.ts';
import type { WeaponItem } from '../../data/types.ts';
const PICK_MS = 30; // between two of the chip picks made for the player (ms)
// The chips picked here are whatever comes first, not what a player would take, so the player is then set to a real
// dive instead: a save at DEPTH 47 of 2026-11-01, whose damage was 240000% (2400 times). The damage alone is set to what
// DEPTH 50 is assumed to reach, 300000%: a guess until a real save gets there. The bosses' health is tuned for it
// (BOSS_TUNE.roomHpMul, BOSS_META.titan.hp). Elsewhere the damage grows as the bosses' health does, to make the fight as long
const RUSH_DMG_AT = 49;
const RUSH_DMG = 3000;
export const rushDamage = (tier: number): number => RUSH_DMG * Math.pow(BOSS_TUNE.lateGrowth, tier - RUSH_DMG_AT);
const RUSH_BUILD = {
  maxHp: 1160,
  spdMul: 1.84,
  fireRate: 9.66,
  gainMul: 2.818,
  leech: 101,
  pierce: 3,
  extra: 7,
  crit: 0.45,
  chain: 22,
  magnet: 7.4,
  reloadMul: 0.4,
  magMul: 2.5,
  stMax: 828,
  stRegen: 106.08,
};
const RUSH_WEAPONS: WeaponItem[] = [
  { id: 'shotgun', r: 2, basic: false, plus: 135, opts: ['leech', 'mag'] },
  { id: 'pistol', r: 2, basic: false, plus: 134, opts: ['mag', 'rate'] },
];
export function setRushBuild(tier: number) {
  Object.assign(player, RUSH_BUILD);
  player.hp = player.maxHp;
  player.st = player.stMax;
  player.weapons = RUSH_WEAPONS.map(w => fillMag(newWeapon(w.id, w.r, w.basic, w.plus, [...w.opts!])));
  player.cur = 0;
  player.dmgMul = rushDamage(tier) / (player.lvlDmg * wDmgMul(player.weapons[0]!));
}
// dev: #bossrush starts a dive at the boss area's hall, to play it through: with the save of its own that this hash
// reads (core/save.ts saveKeyFor), so the real save is not touched and the rooms beaten stay between visits. The first
// visit makes that save, equipped for the depth. #bossrush-new makes it again
export function showBossRush(hash: string) {
  if (!save.records.bossArea || hash === `${BOSS_RUSH_HASH}-new`) {
    setSave(defaultSave());
    devBossAreaStart(BOSS_AREA_START_TIER);
    devBossAreaGear();
    persist();
  }
  setTimeout(() => {
    startRun();
    // the supply of a start this deep is dozens of chip picks: the first offer each time, to get to the hall
    const picks = setInterval(() => {
      if (state === 'perk') document.querySelector<HTMLButtonElement>('#perkList button')?.click();
      else {
        clearInterval(picks);
        setRushBuild(BOSS_AREA_START_TIER);
      }
    }, PICK_MS);
  }, 300);
}
