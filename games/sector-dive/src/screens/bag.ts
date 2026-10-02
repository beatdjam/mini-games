import type { WeaponItem } from '../data/types.ts';
import { el, rand } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { exitLock, releaseInputs, requestLock } from '@engine/ui/input.ts';
import { RARITY } from '../data/weapons.ts';
import { addPickup } from '../world/entities.ts';
import { player, run } from '../actors/player.ts';
import { kitHealAmount } from '../actors/combat.ts';
import { weaponName, weaponOptsHTML, weaponStats } from '../actors/weapons.ts';
import { normalizeWeapons, useKit } from '../ui/input.ts';
import { bigmap, weaponHud } from '../ui/hud.ts';
import { setState, show, state } from '../flow/state.ts';
import { statsHTML } from './pause.ts';
import { weaponReachText } from './base.ts';
import { onDataClick } from './rows.ts';

// transient state of the bag screen
const bagUI: { sel: { where: string; i: number } | null } = {
  sel: null, // the selected weapon: 'eq' (equipped slot) or 'bag' (bag slot)
};
export function openBag() {
  if (state !== 'play') return;
  setState('bag');
  releaseInputs();
  exitLock();
  bagUI.sel = null;
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
  const sel = bagUI.sel && bagUI.sel.where === where && bagUI.sel.i === i;
  const attrs = `data-inv="${where}:${i}"`;
  if (!w) return `<button class="item none ${sel ? 'sel' : ''}" ${attrs}>${t('base.empty')}</button>`;
  const s = weaponStats(w);
  const edge = w.basic ? 'var(--line)' : RARITY[w.r].css;
  const nums = t('bag.item', {
    dps: Math.round(s.dps),
    reach: weaponReachText(s),
    hit: Math.round(s.perHit),
    hits: s.hits > 1 ? '×' + s.hits : '',
    mag: w.mag,
    magMax: s.mag,
  });
  const keep = w.basic ? `<span class="ws">${t('base.keep')}</span>` : '';
  const slot =
    where === 'eq'
      ? `<span class="ws">${t('bag.slotN', { n: i + 1 })}${i === player.cur ? t('bag.inHand') : ''}</span>`
      : '';
  return `<button class="item ${sel ? 'sel' : ''}" ${attrs} style="border-left:3px solid ${edge}">
    <span class="wn">${weaponName(w)}</span>
    <span class="ws">${nums}</span>${weaponOptsHTML(w)}
    ${keep}
    ${slot}</button>`;
}
// the action buttons for the selected weapon
function actionButtons(where: string): string {
  const eqCount = player.weapons.filter(Boolean).length,
    bagFree = player.bag.includes(null);
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
  el('#invEq').innerHTML = player.weapons.map((w, i) => itemCard(w, 'eq', i)).join('');
  el('#invBag').innerHTML = player.bag.map((w, i) => itemCard(w, 'bag', i)).join('');
  el('#kitNum').textContent = String(player.kits);
  el('#btnUseKit').textContent = t('bag.useKit', { n: kitHealAmount() });
  el<HTMLButtonElement>('#btnUseKit').disabled = player.kits <= 0 || player.hp >= player.maxHp;
  el('#bagChips').innerHTML =
    `<p class="chips">${t('bag.status', { hp: Math.ceil(player.hp), maxHp: player.maxHp, bits: Math.floor(run.bits) })}</p>` +
    statsHTML();
  const act = el('#invAct');
  if (!bagUI.sel) {
    act.innerHTML = t('bag.pick');
    return;
  }
  const w = bagUI.sel.where === 'eq' ? player.weapons[bagUI.sel.i] : player.bag[bagUI.sel.i];
  if (!w) {
    act.innerHTML = t('bag.emptySlot');
    return;
  }
  act.innerHTML = actionButtons(bagUI.sel.where) + (w.basic ? '' : `<span>${t('bag.keptNote')}</span>`);
}
onDataClick(
  el('#scrBag'),
  [
    'inv',
    inv => {
      const [where, i] = inv.split(':');
      bagUI.sel = { where, i: +i };
      renderBag();
    },
  ],
  [
    'act',
    a => {
      if (!bagUI.sel) return;
      const src = bagUI.sel.where === 'eq' ? player.weapons : player.bag,
        w = src[bagUI.sel.i];
      if (!w) return;
      if (a === 'equip0' || a === 'equip1') {
        const k = a === 'equip0' ? 0 : 1,
          prev = player.weapons[k];
        player.weapons[k] = w;
        player.bag[bagUI.sel.i] = prev;
        player.cur = k;
        bagUI.sel = { where: 'eq', i: k };
      } else if (a === 'stow') {
        const slot = player.bag.indexOf(null);
        if (slot < 0) return;
        player.bag[slot] = w;
        player.weapons[bagUI.sel.i] = null;
        bagUI.sel = { where: 'bag', i: slot };
      } else if (a === 'drop') {
        src[bagUI.sel.i] = null;
        addPickup('weapon', player.x + rand(-0.6, 0.6), player.z + rand(-0.6, 0.6), { w });
        bagUI.sel = null;
      }
      normalizeWeapons();
      sfx('pick');
      renderBag();
      weaponHud();
    },
  ],
);
