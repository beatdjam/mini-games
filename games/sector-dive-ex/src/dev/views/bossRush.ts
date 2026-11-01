import { BOSS_AREA_START_TIER } from '../../data/progress.ts';
import { BOSS_RUSH_HASH, defaultSave, persist, save, setSave } from '../../core/save.ts';
import { devBossAreaGear, devBossAreaStart } from '../../core/progress.ts';
import { startRun } from '../../flow/run.ts';
import { state } from '../../flow/state.ts';
import { BOSS_TUNE } from '../../data/bosses.ts';
import { currentWeapon, player } from '../../actors/player.ts';
import { wDmgMul } from '../../actors/weapons.ts';
const PICK_MS = 30; // between two of the chip picks made for the player (ms)
// The chips picked here are whatever comes first, not what a player would take, so the damage is set instead, from a
// real save: at DEPTH 45 (0-based 44) the damage multiplier in the stats was 2400 (240000%), a slow but winnable boss
// fight (2026-11-01). Deeper, it grows as the bosses' health does, to make the fight as long
const RUSH_DMG_AT = 44;
const RUSH_DMG = 2400;
export const rushDamage = (tier: number): number => RUSH_DMG * Math.pow(BOSS_TUNE.lateGrowth, tier - RUSH_DMG_AT);
// the chips' share of the damage set so that the stats' whole multiplier (chips x levels x weapon) is that
export function setRushDamage(tier: number) {
  player.dmgMul = rushDamage(tier) / (player.lvlDmg * wDmgMul(currentWeapon()));
}
// dev: #bossrush starts a dive at the boss area's hall, to play it through: with the save of its own that this hash
// reads (core/save.ts saveKeyFor), so the real save is not touched and the rooms beaten stay between visits. The first
// visit makes that save, equipped for the depth. #bossrush-new makes it again
export function showBossRush(hash: string) {
  if (!save.records.bossArea || hash === `${BOSS_RUSH_HASH}-new`) {
    setSave(defaultSave());
    devBossAreaStart(BOSS_AREA_START_TIER);
    devBossAreaGear(BOSS_AREA_START_TIER);
    persist();
  }
  setTimeout(() => {
    startRun();
    // the supply of a start this deep is dozens of chip picks: the first offer each time, to get to the hall
    const picks = setInterval(() => {
      if (state === 'perk') document.querySelector<HTMLButtonElement>('#perkList button')?.click();
      else {
        clearInterval(picks);
        setRushDamage(BOSS_AREA_START_TIER);
      }
    }, PICK_MS);
  }, 300);
}
