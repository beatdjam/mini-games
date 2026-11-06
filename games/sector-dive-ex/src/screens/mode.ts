import type { GameMode } from '../data/types.ts';
import { el } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { ARCADE_OPEN, restrictionOf } from '../data/progress.ts';
import { WEAPONS } from '../data/weapons.ts';
import { ACTIVE_MODE, hasSuspendIn, isArcade, save, switchMode } from '../core/save.ts';

// The mode select (the title): which save to play, ARCADE or ENDLESS. It is opened at start-up (when ARCADE is open, or
// with #modes on the dev server) and from the base's mode button.
function renderButton(id: 'Arcade' | 'Endless', mode: GameMode) {
  const label = mode === 'arcade' ? 'ARCADE' : 'ENDLESS';
  el<HTMLButtonElement>(`#btnMode${id}`).innerHTML = hasSuspendIn(mode)
    ? `${label}<small class="modebadge">${t('mode.suspended')}</small>`
    : label;
}
export function openModeSelect() {
  renderButton('Arcade', 'arcade');
  renderButton('Endless', 'endless');
  el('#dlgMode').hidden = false;
}
function choose(mode: GameMode) {
  if (mode === ACTIVE_MODE) {
    el('#dlgMode').hidden = true;
    return;
  }
  switchMode(mode);
}
el('#btnModeArcade').addEventListener('click', () => choose('arcade'));
el('#btnModeEndless').addEventListener('click', () => choose('endless'));
el('#btnMode').addEventListener('click', openModeSelect);
document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && !el('#dlgMode').hidden) el('#dlgMode').hidden = true;
});
// on the published page, until ARCADE is open, the mode select is not part of the game: no button and no mode tag
const modeSelectable = ARCADE_OPEN || import.meta.env.DEV;
el<HTMLButtonElement>('#btnMode').hidden = !modeSelectable;
// ENDLESS's tag shows the loop once it is past the first, or the challenge (renderBase draws it, after a loop or a
// challenge starts too). withLoop false: neither, only the mode (at load, before the languages are in)
export function renderModeTag(withLoop = true) {
  const tag = el('#modeTag'),
    challenge = save.challenge;
  tag.hidden = !modeSelectable;
  if (isArcade()) {
    tag.textContent = 'ARCADE';
    return;
  }
  // at load the languages are not in yet: no t() or name until the base draws it again (withLoop)
  if (!withLoop) {
    tag.textContent = 'ENDLESS';
    return;
  }
  if (challenge) {
    const restriction =
      challenge.restriction === 'weapon' && challenge.weapon
        ? t('restriction.weaponName', {
            restriction: restrictionOf('weapon')?.name ?? 'weapon',
            weapon: WEAPONS[challenge.weapon]?.name ?? challenge.weapon,
          })
        : (restrictionOf(challenge.restriction)?.name ?? challenge.restriction);
    tag.textContent = `ENDLESS · ${t('mode.challenge', { restriction, n: challenge.strength })}`;
    return;
  }
  tag.textContent = save.loop >= 2 ? `ENDLESS · ${t('mode.loop', { n: save.loop })}` : 'ENDLESS';
}
// (at load the languages are not in yet, so t() would throw: the loop waits for the base's first draw. A save in
// loop 2 broke the page at start-up, 2026-11-07)
renderModeTag(false);
