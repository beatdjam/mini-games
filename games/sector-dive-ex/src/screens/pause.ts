import { el } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { bossRoomBiome } from '../core/bossArea.ts';
import { musicVolume } from '@engine/audio/music.ts';
import { exitLock, releaseInputs, requestLock } from '@engine/ui/input.ts';
import {
  CRIT_OPT_PER_LEVEL,
  GAIN_OPT_PER_LEVEL,
  LEECH_OPT_HP,
  RATE_OPT_MUL,
  RELOAD_OPT_MUL,
  SPEED_OPT_PER_LEVEL,
  SPLIT_DMG_PER_CHIP,
  WEAPONS,
} from '../data/weapons.ts';
import { BOSS_META } from '../data/bosses.ts';
import { TUNE } from '../data/progress.ts';
import { chipSummary } from '../core/rules.ts';
import { boss } from '../world/entities.ts';
import { player, currentWeapon, run } from '../actors/player.ts';
import { critChance, magSize, wDmgMul, weaponText, weaponOptCount } from '../actors/weapons.ts';
import { floorLabel, stageInfo, stageLabel } from '../core/stages.ts';
import { bigmap } from '../ui/hud.ts';
import { renderSettings } from '@engine/ui/settings.ts';
import { setState, show, state } from '../flow/state.ts';
import { endRun } from '../flow/run.ts';
import { suspendRun } from '../flow/suspend.ts';
import { RUN_KINDS } from '../flow/runKind.ts';
import { rowsHTML } from '@engine/ui/dom.ts';

// the run's own text that was written out in the old language (the language can be switched from the pause screen)
export function refreshRunText() {
  if (!run || !player) return;
  const si = stageInfo(run.stage),
    // the boss area: the hall is nobody's sector, and a room is in the sector of its boss, not of the depth
    place = !si.area
      ? si.biome.name
      : run.area?.at === 'room'
        ? bossRoomBiome(run.area.boss).name
        : t('boss.hallPlace');
  // the step along the route, the floor of the building it is on, the sector
  // (in two parts: the old layout runs them on one line, the new one puts the sector on a line of its own: hud2.ts)
  el('#stageLbl').innerHTML =
    `<span class="sdepth"><b>${stageLabel(run.stage)}</b> ${floorLabel()}</span>` +
    `<span class="sname">${place}</span>`;
  if (boss && boss.kind) el('#bossName').textContent = BOSS_META[boss.kind]!.title ?? boss.kind;
  if (state === 'pause') el('#pauseChips').innerHTML = statsHTML();
}
export function pause() {
  if (state !== 'play') return;
  setState('pause');
  releaseInputs();
  exitLock();
  bigmap.hidden = true;
  musicVolume(0.4);
  renderSettings();
  el('#btnSuspend').hidden = !RUN_KINDS[run.kind].save;
  armAbandon(false);
  el('#pauseChips').innerHTML = statsHTML();
  show('#scrPause');
}
el('#btnResume').addEventListener('click', () => {
  show(null);
  setState('play');
  musicVolume(1);
  requestLock();
});
// the abandon button asks once: the first click arms it (its label then says what abandoning means), the second ends
// the run. The label goes through data-i18n, so a language switch on the pause screen keeps it
let abandonArmed = false;
function armAbandon(on: boolean) {
  abandonArmed = on;
  const b = el('#btnAbandon'),
    key = on ? 'pause.abandonGo' : 'pause.abandon';
  b.dataset.i18n = key;
  b.textContent = t(key);
}
el('#btnAbandon').addEventListener('click', () => {
  if (abandonArmed) endRun('abandon');
  else armAbandon(true);
});
el('#btnSuspend').addEventListener('click', suspendRun);

// ---- stats panel ----
const pct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
// the rows that are always shown
function baseStatRows(w: ReturnType<typeof currentWeapon>): [string, string | number][] {
  const stamina = t('stats.staminaV', {
    max: player.stMax,
    dashes: Math.floor(player.stMax / TUNE.dashCost),
    regen: Math.round(player.stRegen),
  });
  const crit = `${Math.round(critChance() * 100)}%${player.crit + CRIT_OPT_PER_LEVEL * weaponOptCount('crit') > TUNE.critCap ? t('stats.capped') : ''}`;
  return [
    [t('stats.maxHp'), player.maxHp],
    [t('stats.dmg'), pct(player.dmgMul * player.lvlDmg * wDmgMul(w) - 1)], // chips x levels x the weapon's rarity and +value
    [t('stats.rate'), pct(player.fireRate / Math.pow(RATE_OPT_MUL, weaponOptCount('rate')) - 1)],
    [t('stats.speed'), pct(player.spdMul * (1 + SPEED_OPT_PER_LEVEL * weaponOptCount('speed')) - 1)],
    [t('stats.stamina'), stamina],
    [t('stats.reload'), pct(player.reloadMul * Math.pow(RELOAD_OPT_MUL, weaponOptCount('reload')) - 1)],
    [t('stats.mag'), pct(magSize(w) / WEAPONS[w.id].mag - 1)], // as the weapon really loads (the launcher gets half the chips)
    [t('stats.crit'), crit],
  ];
}
export function statsHTML() {
  const w = currentWeapon(),
    rows = baseStatRows(w);
  const pierce = player.pierce + weaponOptCount('pierce'),
    leech = player.leech + LEECH_OPT_HP * weaponOptCount('leech'),
    gain = player.gainMul * (1 + GAIN_OPT_PER_LEVEL * weaponOptCount('gain'));
  if (pierce) rows.push([t('stats.pierce'), t('stats.pierceV', { n: pierce })]);
  if (player.extra)
    rows.push([
      t('stats.split'),
      t('stats.splitV', { n: player.extra, pct: Math.round(player.extra * SPLIT_DMG_PER_CHIP * 100) }),
    ]);
  if (leech) rows.push([t('stats.leech'), `HP +${leech}`]);
  if (player.chain) rows.push([t('stats.chain'), `Lv ${player.chain}`]);
  if (player.magnet > 1) rows.push([t('stats.magnet'), `×${player.magnet.toFixed(1)}`]);
  rows.push([t('stats.gain'), pct(gain - 1)]);
  const chips = chipSummary(run.perks) || t('common.none');
  return `<h3>${t('stats.title')}<small>${t('stats.titleNote', { w: weaponText(w) })}</small></h3>
    <dl class="reslist">${rowsHTML(rows)}</dl>
    <p class="chips">${t('stats.chips', { list: chips })}</p>`;
}
