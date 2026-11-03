import type { GameMode } from '../data/types.ts';
import { el } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { ARCADE_OPEN } from '../data/progress.ts';
import { ACTIVE_MODE, hasSuspendIn, switchMode } from '../core/save.ts';

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
const tag = el('#modeTag');
tag.hidden = !modeSelectable;
tag.textContent = ACTIVE_MODE === 'arcade' ? 'ARCADE' : 'ENDLESS';
