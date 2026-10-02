import { el } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { musicVolume } from '@engine/audio/music.ts';
import { exitLock, releaseInputs, requestLock } from '@engine/ui/input.ts';
import { RATE_OPT_MUL, RELOAD_OPT_MUL, WEAPONS } from '../data/weapons.ts';
import { BOSS_META } from '../data/bosses.ts';
import { TUNE } from '../data/progress.ts';
import { chipSummary } from '../core/rules.ts';
import { boss } from '../world/entities.ts';
import { P, critChance, curW, magSize, run, stageInfo, stageLabel, wDmgMul, wText, wo } from '../actors/player.ts';
import { bigmap, renderSettings } from '../ui/hud.ts';
import { setState, show, state } from '../flow/state.ts';
import { endRun } from '../flow/run.ts';
import { suspendRun } from '../flow/suspend.ts';
import { rowsHTML } from './rows.ts';

// the run's own text that was written out in the old language (the language can be switched from the pause screen)
export function refreshRunText() {
  if (!run || !P) return;
  const b = stageInfo(run.stage).biome;
  el('#stageLbl').innerHTML = `<b>${stageLabel(run.stage)}</b>　${b.name}`;
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
  el('#btnSuspend').hidden = !!run.practice;
  el('#pauseChips').innerHTML = statsHTML();
  show('#scrPause');
}
el('#btnResume').addEventListener('click', () => {
  show(null);
  setState('play');
  musicVolume(1);
  requestLock();
});
el('#btnAbandon').addEventListener('click', () => endRun('abandon'));
el('#btnSuspend').addEventListener('click', suspendRun);

// ---- stats panel ----
const pct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
// the rows that are always shown
function baseStatRows(w: ReturnType<typeof curW>): [string, string | number][] {
  const stamina = t('stats.staminaV', {
    max: P.stMax,
    dashes: Math.floor(P.stMax / TUNE.dashCost),
    regen: Math.round(P.stRegen),
  });
  const crit = `${Math.round(critChance() * 100)}%${P.crit + 0.08 * wo('crit') > TUNE.critCap ? t('stats.capped') : ''}`;
  return [
    [t('stats.maxHp'), P.maxHp],
    [t('stats.dmg'), pct(P.dmgMul * wDmgMul(w) - 1)], // chips and upgrades x the weapon's rarity and +value
    [t('stats.rate'), pct(P.fireRate / Math.pow(RATE_OPT_MUL, wo('rate')) - 1)],
    [t('stats.speed'), pct(P.spdMul * (1 + 0.06 * wo('speed')) - 1)],
    [t('stats.stamina'), stamina],
    [t('stats.reload'), pct(P.reloadMul * Math.pow(RELOAD_OPT_MUL, wo('reload')) - 1)],
    [t('stats.mag'), pct(magSize(w) / WEAPONS[w.id].mag - 1)], // as the weapon really loads (the launcher gets half the chips)
    [t('stats.crit'), crit],
  ];
}
export function statsHTML() {
  const w = curW(),
    rows = baseStatRows(w);
  const pierce = P.pierce + wo('pierce'),
    leech = P.leech + 2 * wo('leech'),
    gain = P.gainMul * (1 + 0.1 * wo('gain'));
  if (pierce) rows.push([t('stats.pierce'), t('stats.pierceV', { n: pierce })]);
  if (P.extra) rows.push([t('stats.split'), t('stats.splitV', { n: P.extra, pct: P.extra * 20 })]);
  if (leech) rows.push([t('stats.leech'), `HP +${leech}`]);
  if (P.chain) rows.push([t('stats.chain'), `Lv ${P.chain}`]);
  if (P.magnet > 1) rows.push([t('stats.magnet'), `×${P.magnet.toFixed(1)}`]);
  rows.push([t('stats.gain'), pct(gain - 1)]);
  const chips = chipSummary(run.perks) || t('common.none');
  return `<h3>${t('stats.title')}<small>${t('stats.titleNote', { w: wText(w) })}</small></h3>
    <dl class="reslist">${rowsHTML(rows)}</dl>
    <p class="chips">${t('stats.chips', { list: chips })}</p>`;
}
