import type { WeaponItem } from '../data/types.ts';
import { clamp, el, isTouch } from '@engine/core/util.ts';
import { prefGet, prefSet } from '@engine/core/store.ts';
import { t } from '@engine/core/i18n.ts';
import { audioInit, sfx } from '@engine/audio/audio.ts';
import { track } from '@engine/core/analytics.ts';
import {
  MOD_CAP_PER_DEPTH,
  MOD_PLUS_MAX,
  MOD_RARITY_COST,
  RARITY,
  WEAPONS,
  WEAPON_ORDER,
  modPlusCost,
} from '../data/weapons.ts';
import { BOSS_META, BOSS_ORDER } from '../data/bosses.ts';
import { REBOOT_UP, STASH_MAX, TUNE, UPGRADES } from '../data/progress.ts';
import { BASE_TAB_KEY, basicW, defaultSave, persist, save } from '../core/save.ts';
import {
  basicNow,
  weaponModOf,
  modPlusCap,
  peakDepth,
  pickDrop,
  REBOOT_DIFF_CAP,
  rebootCost,
  rebootMul,
  rebootMulOf,
  readiness,
  readyAfterReboot,
  sellValue,
} from '../core/rules.ts';
import {
  player,
  newPlayer,
  setPlayer,
  stageLabel,
  tierLabel,
  weaponName,
  weaponOptsHTML,
  weaponStats,
} from '../actors/player.ts';
import { renderSettings } from '../ui/hud.ts';
import { showBaseFeedback } from '../ui/feedback.ts';
import { startPractice, startRun } from '../flow/run.ts';
import { renderSuspend } from '../flow/suspend.ts';

// transient state of the base screen
export const baseUI = {
  selSlot: 0, // loadout slot (0 / 1) that the next weapon assignment goes to
  tab: prefGet(BASE_TAB_KEY, 'sortie'), // open tab; the last one opened is remembered in this browser
  rebootArm: false, // the reboot row shows its confirmation
  practiceTier: 0, // boss practice depth chosen (0-based)
};
// a weapon's numbers as it would be right after diving: base upgrades and reboot bonuses in, no chips, its own options
// in (so weapons in the base can be compared; player may still be the last run's player, chips and all)
// what the one-target DPS leaves out: the rail's damage past `far` metres, the rocket's blast radius
export const weaponReachText = (s: ReturnType<typeof weaponStats>): string =>
  s.farDps
    ? t('weapon.far', { m: s.far, dps: Math.round(s.farDps) })
    : s.blast
      ? t('weapon.blast', { m: s.blast.toFixed(1) })
      : '';
export function weaponStatText(w: WeaponItem) {
  const d = WEAPONS[w.id],
    keep = player;
  setPlayer(newPlayer([]));
  try {
    const s = weaponStats(w);
    return t('base.wstat', {
      dps: Math.round(s.dps),
      reach: weaponReachText(s),
      dmg: Math.round(s.perHit),
      pellets: s.hits,
      rate: (1 / s.interval).toFixed(1),
      mag: s.mag,
      pierce: d.pierce,
    });
  } finally {
    setPlayer(keep);
  }
}
// base menu tabs
export function showTab(name: string) {
  const tab = document.querySelector(`[data-pane="${name}"]`) ? name : 'sortie';
  baseUI.tab = tab;
  document
    .querySelectorAll<HTMLElement>('.tabs [data-tab]')
    .forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.querySelectorAll<HTMLElement>('[data-pane]').forEach(p => {
    p.hidden = p.dataset.pane !== tab;
  });
  prefSet(BASE_TAB_KEY, tab);
}
el('.tabs').addEventListener('click', (e: Event) => {
  const tg = e.target as HTMLElement;
  const b = tg.closest<HTMLElement>('[data-tab]');
  if (b) {
    showTab(b.dataset.tab!);
    el('#scrBase').scrollTop = 0;
  }
});

// ---- the pieces of the base screen ----
const tierButton = (n: number): string => {
  const sub = n === 0 ? t('base.tierFirst') : t('base.tierChips', { n, times: TUNE.supplyTimes });
  const ready = readiness(n);
  return (
    `<button class="tier" data-tier="${n}" aria-pressed="${save.startTier === n}"><b>${tierLabel(n)}</b>` +
    `<small>${sub}</small><small class="rd rd${ready}">${t(`base.ready${ready}`)}</small></button>`
  );
};
const loadoutSlot = (k: number): string => {
  const w = save.loadout[k],
    on = baseUI.selSlot === k;
  const name = w ? weaponName(basicNow(w)) : t('base.empty');
  const note =
    w && !w.basic
      ? `<span class="risk">${t('base.stashRisk')}</span>`
      : w
        ? `<span class="ws">${t('base.keep')}</span>`
        : '';
  const unequip =
    k === 1 && w ? `<span class="mini-btn" data-unequip="1" role="button">${t('base.unequip')}</span>` : '';
  return `<button class="lslot ${on ? 'sel' : ''}" data-slot="${k}"><span class="eyebrow">${t('base.slot', { n: k + 1 })}${on ? t('base.slotTarget') : ''}</span>
      <span class="wn">${name}</span>${note}
      ${unequip}</button>`;
};
const lockedCard = (id: string): string => {
  const def = WEAPONS[id];
  return `<button class="wcard locked ${save.bits < def.cost ? 'poor' : ''}" data-w="${id}">
      <span class="wn">${def.name}</span><span class="wd">${def.desc}</span><span class="ws">${weaponStatText({ id, r: 0 })}</span>
      <span class="wf">${t('base.unlock', { cost: def.cost })}</span></button>`;
};
// the buttons that raise a base weapon's + value and rarity
const modButtons = (id: string): string => {
  const m = weaponModOf(id),
    pc = modPlusCost(m.plus),
    rc = MOD_RARITY_COST[m.r];
  const plusBtn =
    m.plus >= modPlusCap()
      ? `<button class="mini-btn" disabled>${t('base.plusMax')}</button>`
      : `<button class="mini-btn amber" data-modplus="${id}" ${save.bits < pc ? 'disabled' : ''}>${t('base.modPlus', { n: m.plus + 1, cost: pc })}</button>`;
  const next = RARITY[m.r + 1];
  const rarBtn =
    rc === undefined
      ? `<button class="mini-btn" disabled>${t('base.rarMax')}</button>`
      : `<button class="mini-btn amber" data-modrar="${id}" ${save.bits < rc ? 'disabled' : ''}>${t('base.modRar', { stars: next.stars, name: next.name, cost: rc })}</button>`;
  return plusBtn + rarBtn;
};
const weaponCard = (id: string): string => {
  const def = WEAPONS[id],
    w = basicNow(basicW(id)),
    m = weaponModOf(id);
  const edge = m.r ? RARITY[m.r].css : 'var(--line)';
  return `<div class="wcard" style="border-left:3px solid ${edge}">
      <span class="wn">${weaponName(w)}</span><span class="wd">${def.desc}</span><span class="ws">${weaponStatText(w)}</span>
      <span class="acts"><button class="mini-btn amber" data-w="${id}">${t('base.assign', { n: baseUI.selSlot + 1 })}</button>${modButtons(id)}</span></div>`;
};
const stashCard = (w: WeaponItem, i: number): string => {
  const assign = `<button class="mini-btn amber" data-stash="${i}">${t('base.stashAssign', { n: baseUI.selSlot + 1 })}</button>`;
  const sell = `<button class="mini-btn" data-sell="${i}">${t('base.sell', { v: sellValue(w) })}</button>`;
  return `<div class="wcard" style="border-left:3px solid ${RARITY[w.r].css}"><span class="wn">${weaponName(w)}</span><span class="ws">${weaponStatText(w)}</span>${weaponOptsHTML(w)}
      <span class="acts">${assign}${sell}</span></div>`;
};
const pipsHTML = (max: number, level: number): string =>
  Array.from({ length: max }, (_, k) => `<i class="${k < level ? 'on' : ''}"></i>`).join('');
// one upgrade row: name, description, level pips, and the buy button
const upgradeRow = (name: string, desc: string, pips: string, buy: string): string =>
  `<div class="urow"><div><div class="un">${name}</div><div class="ud">${desc}</div><div class="pips">${pips}</div></div>
      ${buy}</div>`;
const upgradeRows = (): string =>
  UPGRADES.map(u => {
    const l = save.up[u.id] || 0,
      maxed = l >= u.max,
      cost = u.cost(l);
    const buy = `<button class="buy" data-up="${u.id}" ${maxed || save.bits < cost ? 'disabled' : ''}>${maxed ? t('base.max') : cost + ' BIT'}</button>`;
    return upgradeRow(u.name, u.desc(l), pipsHTML(u.max, l), buy);
  }).join('');
const practiceTierButtons = (): string =>
  `<span>${t('base.practiceTierLabel')}</span>` +
  [0, 1, 2, 4]
    .map(n => `<button data-ptier="${n}" aria-pressed="${baseUI.practiceTier === n}">D${n + 1}</button>`)
    .join('');
const bossButton = (k: string): string =>
  `<button class="wcard" data-practice="${k}"><span class="wn">${BOSS_META[k].name}</span>
    <span class="wd">${BOSS_META[k].desc}</span><span class="wf">${t(save.bossSeen[k] ? 'base.practiceGo' : 'base.practiceGoNew')}</span></button>`;

export function renderBase() {
  showBaseFeedback();
  el('#sBits').textContent = String(save.bits);
  el('#sBest').textContent = save.best ? stageLabel(save.best - 1) : '—';
  el('#sRuns').textContent = String(save.runs);
  el('#sBoss').textContent = String(save.bossKills);
  save.startTier = clamp(save.startTier, 0, save.shortcut);
  el('#tiers').innerHTML = Array.from({ length: save.shortcut + 1 }, (_, n) => tierButton(n)).join('');
  el('#startSub').textContent = t('base.diveSub', { tier: tierLabel(save.startTier) });
  renderSuspend();
  el('#loadout').innerHTML = [0, 1].map(loadoutSlot).join('');
  el('#modCap').textContent = t('base.modCap', {
    cap: modPlusCap(),
    depth: peakDepth(),
    per: MOD_CAP_PER_DEPTH,
    min: MOD_PLUS_MAX,
  });
  el('#wgrid').innerHTML = WEAPON_ORDER.map(id =>
    id === 'pistol' || save.unlocked[id] ? weaponCard(id) : lockedCard(id),
  ).join('');
  el('#stashCount').textContent = t('base.stashCount', { n: save.stash.length, max: STASH_MAX });
  el('#stash').innerHTML = save.stash.length
    ? save.stash.map(stashCard).join('')
    : `<div class="empty">${t('base.stashEmpty')}</div>`;
  el('#ulist').innerHTML = upgradeRows();
  renderReboot();
  el('#practiceTier').innerHTML = practiceTierButtons();
  el('#bossList').innerHTML = BOSS_ORDER.map(bossButton).join('');
  renderSettings();
  el('#help').innerHTML = isTouch ? t('base.helpTouch') : t('base.helpDesk');
}

// ---- reboot (prestige) ----
export const rebootGain = () => 2 + Math.max(0, save.shortcut - 3);
// the reboot row: info + arm button, or the confirmation
function rebootRowHTML(): string {
  if (save.suspend) return `<p class="help">${t('reboot.suspended')}</p>`;
  if (!save.canReboot) return `<p class="help">${t('reboot.locked')}</p>`;
  if (!baseUI.rebootArm) {
    return `<p class="help">${t('reboot.info', { pts: rebootGain() })}</p><button class="buy" data-reboot="arm">${t('reboot.arm')}</button>`;
  }
  const after = t('reboot.after', {
    diff: Math.round((rebootMulOf(save.pres.count + 1) - 1) * 100),
    cap: Math.round(REBOOT_DIFF_CAP * 15),
    ready: t(`base.ready${readiness(0, readyAfterReboot())}`),
  });
  return (
    `<p class="help">${t('reboot.confirm')}<br>${after}</p>
       <button class="buy" data-reboot="go">${t('reboot.go', { pts: rebootGain() })}</button>` +
    `<button class="mini-btn" data-reboot="cancel">${t('common.cancel')}</button>`
  );
}
export function renderReboot() {
  const pr = save.pres,
    sec = el('#rebootSec');
  sec.hidden = !(save.canReboot || pr.count > 0);
  if (sec.hidden) return;
  el('#rebootNote').textContent = t('reboot.note', {
    count: pr.count,
    diff: Math.round((rebootMul() - 1) * 100),
    pts: pr.pts,
  });
  el('#presList').innerHTML = REBOOT_UP.map(u => {
    const l = pr.up[u.id] || 0,
      maxed = l >= u.max,
      cost = rebootCost(u, l);
    // uncapped bonuses show their level instead of a row of pips
    const pips = isFinite(u.max) ? pipsHTML(u.max, l) : `<small>${t('pres.level', { n: l })}</small>`;
    const buy = `<button class="buy" data-pres="${u.id}" ${maxed || pr.pts < cost ? 'disabled' : ''}>${maxed ? t('base.max') : cost + ' pt'}</button>`;
    return upgradeRow(u.name, u.desc(l), pips, buy);
  }).join('');
  el('#rebootRow').innerHTML = rebootRowHTML();
}
export function doReboot() {
  const pr = save.pres,
    keep = { best: save.best, runs: save.runs, bossKills: save.bossKills, settings: save.settings };
  pr.pts += rebootGain();
  pr.count++;
  track('reboot', { count: pr.count });
  const d = defaultSave();
  Object.assign(save, d, keep, { pres: pr });
  save.bits = pr.up.funds * 150;
  for (let k = 0; k < pr.up.relic; k++) save.stash.push({ id: pickDrop(), r: 2, basic: false });
  baseUI.rebootArm = false;
  persist();
  renderBase();
  audioInit();
  sfx('portal');
}
export function assignLoadout(item: WeaponItem | null) {
  const prev = save.loadout[baseUI.selSlot];
  if (prev && !prev.basic) save.stash.push(prev);
  save.loadout[baseUI.selSlot] = item;
}
el('#scrBase').addEventListener('click', (e: Event) => {
  const tg = e.target as HTMLElement;
  const un = tg.closest<HTMLElement>('[data-unequip]'),
    sl = tg.closest<HTMLElement>('[data-slot]'),
    w = tg.closest<HTMLElement>('[data-w]'),
    u = tg.closest<HTMLElement>('[data-up]');
  const st = tg.closest<HTMLElement>('[data-stash]'),
    se = tg.closest<HTMLElement>('[data-sell]'),
    ti = tg.closest<HTMLElement>('[data-tier]');
  const pu = tg.closest<HTMLElement>('[data-pres]'),
    rb = tg.closest<HTMLElement>('[data-reboot]'),
    pr = tg.closest<HTMLElement>('[data-practice]');
  if (pr) {
    startPractice(pr.dataset.practice!, baseUI.practiceTier);
    return;
  }
  const mp = tg.closest<HTMLElement>('[data-modplus]'),
    mr = tg.closest<HTMLElement>('[data-modrar]');
  if (mp || mr) {
    const id = (mp || mr)!.dataset.modplus || (mp || mr)!.dataset.modrar!,
      m = Object.assign({ plus: 0, r: 0 }, weaponModOf(id));
    const cost = mp ? modPlusCost(m.plus) : MOD_RARITY_COST[m.r];
    if (cost === undefined || save.bits < cost || (mp && m.plus >= modPlusCap())) return;
    save.bits -= cost;
    if (mp) m.plus++;
    else m.r++;
    save.mods = Object.assign({}, save.mods, { [id]: m });
    persist();
    audioInit();
    sfx('chip');
    renderBase();
    return;
  }
  const pt = tg.closest<HTMLElement>('[data-ptier]');
  if (pt) {
    baseUI.practiceTier = +pt.dataset.ptier!;
    renderBase();
    return;
  }
  if (rb) {
    const a = rb.dataset.reboot;
    if (a === 'go') {
      doReboot();
      return;
    }
    baseUI.rebootArm = a === 'arm';
    renderReboot();
    return;
  }
  if (pu) {
    const def = REBOOT_UP.find(x => x.id === pu.dataset.pres)!,
      l = save.pres.up[def.id] || 0;
    const cost = rebootCost(def, l);
    if (l < def.max && save.pres.pts >= cost) {
      save.pres.pts -= cost;
      save.pres.up[def.id] = l + 1;
      audioInit();
      sfx('chip');
    }
  } else if (un) {
    const prev = save.loadout[1];
    if (prev && !prev.basic) save.stash.push(prev);
    save.loadout[1] = null;
    baseUI.selSlot = 1;
  } else if (sl) baseUI.selSlot = +sl.dataset.slot!;
  else if (ti) save.startTier = +ti.dataset.tier!;
  else if (w) {
    const id = w.dataset.w!,
      def = WEAPONS[id];
    if (!save.unlocked[id]) {
      if (save.bits < def.cost) return;
      save.bits -= def.cost;
      save.unlocked[id] = true;
      audioInit();
      sfx('chip');
    }
    assignLoadout(basicW(id));
  } else if (st) {
    const i = +st.dataset.stash!,
      item = save.stash.splice(i, 1)[0];
    assignLoadout(item);
  } else if (se) {
    const i = +se.dataset.sell!;
    save.bits += sellValue(save.stash[i]);
    save.stash.splice(i, 1);
    audioInit();
    sfx('pick');
  } else if (u) {
    const def = UPGRADES.find(x => x.id === u.dataset.up)!,
      l = save.up[def.id] || 0,
      cost = def.cost(l);
    if (l < def.max && save.bits >= cost) {
      save.bits -= cost;
      save.up[def.id] = l + 1;
      audioInit();
      sfx('pick');
    }
  } else return;
  persist();
  renderBase();
});
el('#btnStart').addEventListener('click', startRun);
