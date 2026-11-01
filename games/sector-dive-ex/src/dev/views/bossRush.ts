import { BOSS_AREA_START_TIER } from '../../data/progress.ts';
import { BOSS_RUSH_HASH, defaultSave, persist, save, setSave } from '../../core/save.ts';
import { devBossAreaGear, devBossAreaStart } from '../../core/progress.ts';
import { startRun } from '../../flow/run.ts';
import { state } from '../../flow/state.ts';
const PICK_MS = 30; // between two of the chip picks made for the player (ms)
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
      else clearInterval(picks);
    }, PICK_MS);
  }, 300);
}
