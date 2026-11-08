import type { RestrictionId } from '../data/types.ts';
import { el, pct } from '@engine/core/index.ts';
import { t } from '@engine/core/index.ts';
import { RESTRICTIONS, restrictionOf } from '../data/progress.ts';
import { WEAPONS, WEAPON_ORDER } from '../data/weapons.ts';
import { persist, save } from '../core/save.ts';
import { challengeStrengthMax, startChallenge } from '../core/progress.ts';
import type { RestrictionBonus } from '../core/rules.ts';

// The restriction challenge: the card on the base opens this dialog, one restriction and one strength are picked, and
// "Challenge" starts it (core/progress.ts startChallenge). The dialog itself changes nothing but the save.
let restriction: RestrictionId = 'pick';
let strength = 1;
let weapon = 'pistol'; // the kind a 'weapon' challenge takes
// what the base does after the challenge started (it redraws itself)
let onStarted: (() => void) | null = null;

export const restrictionName = (id: string): string => restrictionOf(id)?.name ?? id;
// the weapons a 'weapon' challenge can be started with: the kinds the save has unlocked, in WEAPON_ORDER
const weaponChoices = (): string[] => WEAPON_ORDER.filter(id => id === 'pistol' || save.unlocked[id]);
// "Damage +3% · Max HP +3%" (perLoop: "... × loop", as the dialog shows a bonus for each loop's strength)
export function bonusText(bonus: RestrictionBonus, perLoop = false): string {
  const parts: string[] = [];
  if (bonus.dmg) parts.push(t('restriction.dmg', { pct: pct(bonus.dmg) }));
  if (bonus.hp) parts.push(t('restriction.hp', { pct: pct(bonus.hp) }));
  if (bonus.bits) parts.push(t('restriction.bits', { pct: pct(bonus.bits) }));
  if (!parts.length) return '';
  const text = parts.join(t('common.sep'));
  return perLoop ? t('restriction.perLoop', { bonus: text }) : text;
}
function render() {
  const max = challengeStrengthMax(),
    choices = weaponChoices();
  if (!choices.includes(weapon)) weapon = choices[0]!;
  el('#challengeRestrictions').innerHTML = RESTRICTIONS.filter(r => r.ready)
    .map(r => {
      const bonus = r.weaponDmg
        ? t('restriction.perLoop', { bonus: t('restriction.weaponDmg', { pct: pct(r.weaponDmg) }) })
        : bonusText({ dmg: r.dmg ?? 0, hp: r.hp ?? 0, bits: r.bits ?? 0 }, true);
      return (
        `<button class="modebtn chbtn" type="button" data-chrestriction="${r.id}" aria-pressed="${r.id === restriction}">` +
        `<b>${r.name}</b>${r.desc ? `<small class="chdesc">${r.desc}</small>` : ''}<small>${bonus}</small></button>`
      );
    })
    .join('');
  el('#challengeWeapons').hidden = restriction !== 'weapon';
  el('#challengeWeaponList').innerHTML = choices
    .map(
      id =>
        `<button class="modebtn chbtn" type="button" data-chweapon="${id}" aria-pressed="${id === weapon}"><b>${WEAPONS[id]!.name}</b></button>`,
    )
    .join('');
  el('#challengeStrengths').innerHTML = Array.from(
    { length: max },
    (_, i) =>
      `<button type="button" data-chstrength="${i + 1}" aria-pressed="${i + 1 === strength}">${t('base.challengeLoop', { n: i + 1 })}</button>`,
  ).join('');
}
export function openChallengeDialog(afterStart: () => void) {
  restriction = RESTRICTIONS.find(r => r.ready)?.id ?? 'pick';
  strength = 1;
  weapon = weaponChoices()[0] ?? 'pistol';
  onStarted = afterStart;
  render();
  el('#dlgChallenge').hidden = false;
}
function close() {
  el('#dlgChallenge').hidden = true;
  onStarted = null;
}
el('#challengeRestrictions').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-chrestriction]');
  if (!b) return;
  restriction = b.dataset.chrestriction as RestrictionId;
  render();
});
el('#challengeWeaponList').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-chweapon]');
  if (!b) return;
  weapon = b.dataset.chweapon!;
  render();
});
el('#challengeStrengths').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-chstrength]');
  if (!b) return;
  strength = +b.dataset.chstrength!;
  render();
});
el('#btnChallengeGo').addEventListener('click', () => {
  if (!startChallenge(restriction, strength, restriction === 'weapon' ? weapon : undefined)) return;
  persist();
  const done = onStarted;
  close();
  done?.();
});
el('#btnChallengeClose').addEventListener('click', close);
document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && !el('#dlgChallenge').hidden) close();
});
