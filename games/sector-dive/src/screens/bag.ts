import type { WeaponItem } from '../data/types.ts';
import { el, rand } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { exitLock, releaseInputs, requestLock } from '@engine/ui/input.ts';
import { RARITY } from '../data/weapons.ts';
import { addPickup } from '../world/entities.ts';
import { P, kitHealAmount, run, wName, wOpts, weaponStats } from '../actors/player.ts';
import { normalizeWeapons, useKit } from '../ui/input.ts';
import { bigmap, weaponHud } from '../ui/hud.ts';
import { setState, show, state } from '../flow/state.ts';
import { statsHTML } from './pause.ts';
import { wReach } from './base.ts';

export let invSel: { where: string; i: number } | null = null; // {where:'eq'|'bag', i}
export function openBag() {
  if (state !== 'play') return;
  setState('bag');
  releaseInputs();
  exitLock();
  invSel = null;
  bigmap.hidden = true;
  renderBag();
  show('#scrBag');
}
export function closeBag() {
  show(null);
  setState('play');
  normalizeWeapons();
  weaponHud();
  requestLock();
}
el('#btnBagClose').addEventListener('click', closeBag);
el('#btnUseKit').addEventListener('click', () => {
  useKit();
  renderBag();
});
export function itemCard(w: WeaponItem | null, where: string, i: number) {
  const sel = invSel && invSel.where === where && invSel.i === i;
  const attrs = `data-inv="${where}:${i}"`;
  if (!w) return `<button class="item none ${sel ? 'sel' : ''}" ${attrs}>${t('base.empty')}</button>`;
  const s = weaponStats(w);
  const edge = w.basic ? 'var(--line)' : RARITY[w.r].css;
  const nums = t('bag.item', {
    dps: Math.round(s.dps),
    reach: wReach(s),
    hit: Math.round(s.perHit),
    hits: s.hits > 1 ? '×' + s.hits : '',
    mag: w.mag,
    magMax: s.mag,
  });
  const keep = w.basic ? `<span class="ws">${t('base.keep')}</span>` : '';
  const slot =
    where === 'eq'
      ? `<span class="ws">${t('bag.slotN', { n: i + 1 })}${i === P.cur ? t('bag.inHand') : ''}</span>`
      : '';
  return `<button class="item ${sel ? 'sel' : ''}" ${attrs} style="border-left:3px solid ${edge}">
    <span class="wn">${wName(w)}</span>
    <span class="ws">${nums}</span>${wOpts(w)}
    ${keep}
    ${slot}</button>`;
}
// the action buttons for the selected weapon
function actionButtons(where: string): string {
  const eqCount = P.weapons.filter(Boolean).length,
    bagFree = P.bag.includes(null);
  if (where === 'bag') {
    return (
      `<button class="mini-btn amber" data-act="equip0">${t('bag.toSlot1')}</button>` +
      `<button class="mini-btn amber" data-act="equip1">${t('bag.toSlot2')}</button>` +
      `<button class="mini-btn" data-act="drop">${t('bag.drop')}</button>`
    );
  }
  const canStow = eqCount > 1 && bagFree ? '' : 'disabled';
  const canDrop = eqCount > 1 ? '' : 'disabled';
  return (
    `<button class="mini-btn" data-act="stow" ${canStow}>${t('bag.stow')}</button>` +
    `<button class="mini-btn" data-act="drop" ${canDrop}>${t('bag.drop')}</button>`
  );
}
export function renderBag() {
  el('#invEq').innerHTML = P.weapons.map((w, i) => itemCard(w, 'eq', i)).join('');
  el('#invBag').innerHTML = P.bag.map((w, i) => itemCard(w, 'bag', i)).join('');
  el('#kitNum').textContent = String(P.kits);
  el('#btnUseKit').textContent = t('bag.useKit', { n: kitHealAmount() });
  el<HTMLButtonElement>('#btnUseKit').disabled = P.kits <= 0 || P.hp >= P.maxHp;
  el('#bagChips').innerHTML =
    `<p class="chips">${t('bag.status', { hp: Math.ceil(P.hp), maxHp: P.maxHp, bits: Math.floor(run.bits) })}</p>` +
    statsHTML();
  const act = el('#invAct');
  if (!invSel) {
    act.innerHTML = t('bag.pick');
    return;
  }
  const w = invSel.where === 'eq' ? P.weapons[invSel.i] : P.bag[invSel.i];
  if (!w) {
    act.innerHTML = t('bag.emptySlot');
    return;
  }
  act.innerHTML = actionButtons(invSel.where) + (w.basic ? '' : `<span>${t('bag.keptNote')}</span>`);
}
el('#scrBag').addEventListener('click', (e: Event) => {
  const tg = e.target as HTMLElement;
  const it = tg.closest<HTMLElement>('[data-inv]'),
    ac = tg.closest<HTMLElement>('[data-act]');
  if (it) {
    const [where, i] = it.dataset.inv!.split(':');
    invSel = { where, i: +i };
    renderBag();
    return;
  }
  if (!ac || !invSel) return;
  const a = ac.dataset.act,
    src = invSel.where === 'eq' ? P.weapons : P.bag,
    w = src[invSel.i];
  if (!w) return;
  if (a === 'equip0' || a === 'equip1') {
    const k = a === 'equip0' ? 0 : 1,
      prev = P.weapons[k];
    P.weapons[k] = w;
    P.bag[invSel.i] = prev;
    P.cur = k;
    invSel = { where: 'eq', i: k };
  } else if (a === 'stow') {
    const slot = P.bag.indexOf(null);
    if (slot < 0) return;
    P.bag[slot] = w;
    P.weapons[invSel.i] = null;
    invSel = { where: 'bag', i: slot };
  } else if (a === 'drop') {
    src[invSel.i] = null;
    addPickup('weapon', P.x + rand(-0.6, 0.6), P.z + rand(-0.6, 0.6), { w });
    invSel = null;
  }
  normalizeWeapons();
  sfx('pick');
  renderBag();
  weaponHud();
});
