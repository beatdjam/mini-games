import type { WeaponItem } from '../data/types.ts';
import { el, isTouch } from '@engine/core/util.ts';
import { prefGet, prefSet } from '@engine/core/store.ts';
import { t } from '@engine/core/i18n.ts';
import { audioInit, sfx } from '@engine/audio/audio.ts';
import { RARITY, WEAPONS, WEAPON_ORDER } from '../data/weapons.ts';
import { BOSS_META, BOSS_ORDER } from '../data/bosses.ts';
import { STASH_MAX, TUNE, UPGRADES, isMilestone } from '../data/progress.ts';
import { BASE_TAB_KEY, basicW, persist, save } from '../core/save.ts';
import { keyText } from '../ui/input.ts';
import {
  buyUpgrade,
  clampStartTier,
  equipWeapon,
  sellFromStash,
  setStartTier,
  spendBits,
  takeFromStash,
  unlockWeapon,
} from '../core/progress.ts';
import { basicNow, levelOf, nextLevelCost, readiness, sellValue } from '../core/rules.ts';
import { player, newPlayer, setPlayer } from '../actors/player.ts';
import { stageLabel, tierLabel } from '../core/stages.ts';
import { weaponName, weaponOptsHTML, weaponStats } from '../actors/weapons.ts';
import { renderSettings } from '@engine/ui/settings.ts';
import { showBaseFeedback } from '../ui/feedback.ts';
import { startPractice, startRun } from '../flow/run.ts';
import { renderSuspend } from '../flow/suspend.ts';
import { onDataClick, type DataClick } from '@engine/ui/dom.ts';

// transient state of the base screen
export const baseUI = {
  selSlot: 0, // loadout slot (0 / 1) that the next weapon assignment goes to
  tab: prefGet(BASE_TAB_KEY, 'sortie'), // open tab; the last one opened is remembered in this browser
  practiceTier: 0, // boss practice depth chosen (0-based)
};
// a weapon's numbers as it would be right after diving: the level's points in, no chips, its own options
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
onDataClick(el('.tabs'), [
  'tab',
  name => {
    showTab(name);
    el('#scrBase').scrollTop = 0;
  },
]);

// ---- the pieces of the base screen ----
const tierButton = (n: number): string => {
  const sub = n === 0 ? t('base.tierFirst') : t('base.tierChips', { n, times: TUNE.supplyTimes });
  const ready = readiness(n);
  return (
    `<button class="tier${isMilestone(n) ? ' mile' : ''}" data-tier="${n}" aria-pressed="${save.startTier === n}"><b>${tierLabel(n)}</b>` +
    `<small>${sub}</small><small class="rd rd${ready}">${t(`base.ready${ready}`)}</small></button>`
  );
};
const loadoutSlot = (k: number): string => {
  const w = save.loadout[k],
    on = baseUI.selSlot === k;
  const name = w ? weaponName(basicNow(w, save.startTier)) : t('base.empty');
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
const weaponCard = (id: string): string => {
  const def = WEAPONS[id],
    w = basicNow(basicW(id), save.startTier);
  return `<div class="wcard" style="border-left:3px solid var(--line)">
      <span class="wn">${weaponName(w)}</span><span class="wd">${def.desc}</span><span class="ws">${weaponStatText(w)}</span>
      <span class="acts"><button class="mini-btn amber" data-w="${id}">${t('base.assign', { n: baseUI.selSlot + 1 })}</button></span></div>`;
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
// what a level's point can go to: each row's button buys the next level and puts its point there (the price is the same
// on every row: nextLevelCost). A row with no cap has no pips: its description says how far it has come
const upgradeRows = (): string => {
  const cost = nextLevelCost();
  return UPGRADES.map(u => {
    const l = save.up[u.id] || 0,
      maxed = l >= u.max;
    const buy = `<button class="buy" data-up="${u.id}" ${maxed || save.bits < cost ? 'disabled' : ''}>${maxed ? t('base.max') : '+1'}</button>`;
    return upgradeRow(u.name, u.desc(l), isFinite(u.max) ? pipsHTML(u.max, l) : '', buy);
  }).join('');
};
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
  clampStartTier();
  el('#tiers').innerHTML = Array.from({ length: save.shortcut + 1 }, (_, n) => tierButton(n)).join('');
  el('#startSub').textContent = t('base.diveSub', { tier: tierLabel(save.startTier) });
  renderSuspend();
  el('#loadout').innerHTML = [0, 1].map(loadoutSlot).join('');
  el('#wgrid').innerHTML = WEAPON_ORDER.map(id =>
    id === 'pistol' || save.unlocked[id] ? weaponCard(id) : lockedCard(id),
  ).join('');
  el('#stashCount').textContent = t('base.stashCount', { n: save.stash.length, max: STASH_MAX });
  el('#stash').innerHTML = save.stash.length
    ? save.stash.map(stashCard).join('')
    : `<div class="empty">${t('base.stashEmpty')}</div>`;
  el('#levelNow').textContent = t('base.level', { n: levelOf() });
  el('#levelNext').textContent = t('base.levelNext', { cost: nextLevelCost() });
  el('#ulist').innerHTML = upgradeRows();
  el('#practiceTier').innerHTML = practiceTierButtons();
  el('#bossList').innerHTML = BOSS_ORDER.map(bossButton).join('');
  renderSettings();
  el('#help').innerHTML = isTouch ? t('base.helpTouch') : t('base.helpDesk', { pause: keyText('pause', 0) });
}

function assignLoadout(item: WeaponItem | null) {
  equipWeapon(baseUI.selSlot, item);
}
// what the click handler does after an action: 'save' saves and redraws the base, 'redraw' only redraws it,
// 'none' does neither (the action did what it needed itself, or it did not apply)
type After = 'save' | 'redraw' | 'none';
const startBossPractice = (boss: string): After => {
  startPractice(boss, baseUI.practiceTier);
  return 'none';
};
const pickPracticeTier = (tier: string): After => {
  baseUI.practiceTier = +tier;
  return 'redraw';
};
const unequipSecond = (): After => {
  equipWeapon(1, null);
  baseUI.selSlot = 1;
  return 'save';
};
const selectSlot = (slot: string): After => {
  baseUI.selSlot = +slot;
  return 'save';
};
const chooseStartTier = (tier: string): After => {
  setStartTier(+tier);
  return 'save';
};
// a locked weapon is bought first (nothing happens if the chips fall short); then it goes to the selected slot
function unlockOrAssign(id: string): After {
  const def = WEAPONS[id];
  if (!save.unlocked[id]) {
    if (save.bits < def.cost) return 'none';
    spendBits(def.cost);
    unlockWeapon(id);
    audioInit();
    sfx('chip');
  }
  assignLoadout(basicW(id));
  return 'save';
}
const assignFromStash = (index: string): After => {
  assignLoadout(takeFromStash(+index));
  return 'save';
};
const sellStashItem = (index: string): After => {
  sellFromStash(+index);
  audioInit();
  sfx('pick');
  return 'save';
};
// saves and redraws even when the upgrade cannot be bought
function buyBaseUpgrade(id: string): After {
  const def = UPGRADES.find(x => x.id === id)!,
    l = save.up[def.id] || 0,
    cost = nextLevelCost();
  if (l < def.max && save.bits >= cost) {
    buyUpgrade(def.id, cost);
    audioInit();
    sfx('pick');
  }
  return 'save';
}
const baseAction = (attr: string, run: (value: string) => After): DataClick => [
  attr,
  value => {
    const after = run(value);
    if (after === 'save') persist();
    if (after !== 'none') renderBase();
  },
];
// the order matters: when elements are nested, the attribute that comes first here wins
onDataClick(
  el('#scrBase'),
  baseAction('practice', startBossPractice),
  baseAction('ptier', pickPracticeTier),
  baseAction('unequip', unequipSecond),
  baseAction('slot', selectSlot),
  baseAction('tier', chooseStartTier),
  baseAction('w', unlockOrAssign),
  baseAction('stash', assignFromStash),
  baseAction('sell', sellStashItem),
  baseAction('up', buyBaseUpgrade),
);
el('#btnStart').addEventListener('click', startRun);
