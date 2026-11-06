import type { RestrictionId } from '../data/types.ts';
import { el, pct } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { RESTRICTIONS, restrictionOf } from '../data/progress.ts';
import { persist } from '../core/save.ts';
import { challengeStrengthMax, startChallenge } from '../core/progress.ts';
import type { RestrictionBonus } from '../core/rules.ts';

// The restriction challenge: the card on the base opens this dialog, one restriction and one strength are picked, and
// "Challenge" starts it (core/progress.ts startChallenge). The dialog itself changes nothing but the save.
let restriction: RestrictionId = 'pick';
let strength = 1;
// what the base does after the challenge started (it redraws itself)
let onStarted: (() => void) | null = null;

export const restrictionName = (id: string): string => restrictionOf(id)?.name ?? id;
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
  const max = challengeStrengthMax();
  el('#challengeRestrictions').innerHTML = RESTRICTIONS.filter(r => r.ready)
    .map(
      r =>
        `<button class="modebtn chbtn" type="button" data-chrestriction="${r.id}" aria-pressed="${r.id === restriction}">` +
        `<b>${r.name}</b><small>${bonusText({ dmg: r.dmg ?? 0, hp: r.hp ?? 0, bits: r.bits ?? 0 }, true)}</small></button>`,
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
el('#challengeStrengths').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-chstrength]');
  if (!b) return;
  strength = +b.dataset.chstrength!;
  render();
});
el('#btnChallengeGo').addEventListener('click', () => {
  if (!startChallenge(restriction, strength)) return;
  persist();
  const done = onStarted;
  close();
  done?.();
});
el('#btnChallengeClose').addEventListener('click', close);
document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && !el('#dlgChallenge').hidden) close();
});
