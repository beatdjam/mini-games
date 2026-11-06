import type { GameMode } from '../data/types.ts';
import { el } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { ARCADE_OPEN } from '../data/progress.ts';
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
// ENDLESS's tag shows the loop once it is past the first (renderBase draws it, after a loop starts too)
export function renderModeTag(withLoop = true) {
  const tag = el('#modeTag');
  tag.hidden = !modeSelectable;
  tag.textContent = isArcade()
    ? 'ARCADE'
    : withLoop && save.loop >= 2
      ? `ENDLESS · ${t('mode.loop', { n: save.loop })}`
      : 'ENDLESS';
}
// (at load the languages are not in yet, so t() would throw: the loop waits for the base's first draw. A save in
// loop 2 broke the page at start-up, 2026-11-07)
renderModeTag(false);
