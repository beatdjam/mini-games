import { el } from '@engine/core/util.ts';
import { PER } from '../../data/progress.ts';
import { player, run } from '../../actors/player.ts';
import { fillMag, newWeapon } from '../../actors/weapons.ts';
import { normalizeWeapons } from '../../ui/input.ts';
import { weaponHud } from '../../ui/hud.ts';
import { showTab } from '../../screens/base.ts';
import { openBag } from '../../screens/bag.ts';
import { pause } from '../../screens/pause.ts';
import { openLevelUp } from '../../screens/levelup.ts';
import { startRun } from '../../flow/run.ts';
import { suspendRun } from '../../flow/suspend.ts';
// dev view: #view-wipe opens the data wipe dialog on the base screen (for screenshots)
export function showWipe() {
  setTimeout(() => el('#btnWipe').click(), 300);
}
// dev view: #view-keys opens the key settings dialog on the base screen; #view-keys-wait also clicks the reload key
export function showKeys(hash: string) {
  setTimeout(() => {
    showTab('settings');
    document.querySelector<HTMLElement>('[data-settings="base"] [data-action="keys"]')?.click();
    if (hash.endsWith('-wait')) document.querySelector<HTMLElement>('[data-key-action="reload"]')?.click();
  }, 300);
}
// dev view: #view-scr-<bag|pause|term> opens the bag, the pause screen or a milestone's terminal in a sample dive
// (two weapons held, two in the bag, some chips and bits), for screenshots
export function showScreen(hash: string) {
  setTimeout(() => {
    startRun();
    run.stage = 4 * PER + PER - 1;
    run.bits = 5200;
    run.perks = ['overload', 'overload', 'rapid+', 'crit', 'reload', 'light', 'magnet', 'split'];
    player.kits = 2;
    player.weapons = [fillMag(newWeapon('rail', 2, false, 9, ['crit', 'mag'])), fillMag(newWeapon('smg', 1, false, 7))];
    player.bag = [newWeapon('shotgun', 1, false, 6, ['rate']), newWeapon('launcher', 0, false, 5), null, null];
    normalizeWeapons();
    weaponHud();
    const what = hash.slice('#view-scr-'.length);
    if (what === 'bag') openBag();
    else if (what === 'pause') pause();
    else if (what === 'term') openLevelUp();
  }, 300);
}
// dev view: #tab-<sortie|up|practice|settings>[-touch] opens that base tab
export function showBaseTab(hash: string) {
  setTimeout(() => showTab(hash.slice(5).replace(/-touch$/, '')), 0);
}
// dev view: #view-susp[-touch] leaves a suspended run and returns to the base
export function showSuspended() {
  setTimeout(() => {
    startRun();
    suspendRun();
  }, 300);
}
