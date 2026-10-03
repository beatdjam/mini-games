import { el } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { KEYS_PER_ACTION, bindKey, changedBindings, keyLabel, keysOf, resetBindings } from '@engine/ui/keymap.ts';
import { KEY_ACTIONS } from '../data/controls.ts';
import { persist } from '../core/save.ts';
import { setKeyBindings } from '../core/progress.ts';
import { player } from '../actors/player.ts';
import { state } from '../flow/state.ts';
import { weaponHud } from '../ui/hud.ts';
import { renderGuide } from '../ui/settings.ts';
import { renderBase } from './base.ts';

// ---- the key settings dialog (PC): the keys of every action; click one, then press the key to assign ----
// transient state of the dialog
const keysUI: {
  wait: { action: string; slot: number } | null; // the key cell waiting for a key press
  msg: string; // the line under the list (which action lost a key)
} = { wait: null, msg: '' };

const cellHTML = (action: string, slot: number): string => {
  const code = keysOf(action)[slot],
    waiting = keysUI.wait?.action === action && keysUI.wait.slot === slot;
  const label = waiting ? t('keys.press') : code ? keyLabel(code) : t('keys.none');
  const cls = `mini-btn keycell${waiting ? ' amber' : ''}${code || waiting ? '' : ' unset'}`;
  return `<button class="${cls}" data-key-action="${action}" data-slot="${slot}">${label}</button>`;
};
const rowHTML = (action: string, name: string): string => {
  const cells = Array.from({ length: KEYS_PER_ACTION }, (_, slot) => cellHTML(action, slot)).join('');
  return `<div class="invrow keyrow"><span>${name}</span><span class="keycells">${cells}</span></div>`;
};
function renderKeyDialog() {
  el('#keysList').innerHTML = KEY_ACTIONS.map(a => rowHTML(a.id, a.name)).join('');
  el('#keysMsg').textContent = keysUI.msg;
}
// everything that shows keys, after the bindings changed
export function refreshKeyTexts() {
  renderGuide();
  if (state === 'base') renderBase();
  if (player) weaponHud();
}
function saveKeys() {
  setKeyBindings(changedBindings());
  persist();
  refreshKeyTexts();
}

export function openKeyDialog() {
  keysUI.wait = null;
  keysUI.msg = '';
  renderKeyDialog();
  el('#dlgKeys').hidden = false;
  el('#btnKeysClose').focus();
}
function closeKeyDialog() {
  keysUI.wait = null;
  el('#dlgKeys').hidden = true;
}
el('#btnKeysClose').addEventListener('click', closeKeyDialog);
el('#btnKeysReset').addEventListener('click', () => {
  keysUI.wait = null;
  keysUI.msg = '';
  resetBindings();
  saveKeys();
  renderKeyDialog();
});
el('#keysList').addEventListener('click', e => {
  const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-key-action]');
  if (!cell) return;
  keysUI.wait = { action: cell.dataset.keyAction!, slot: Number(cell.dataset.slot) };
  keysUI.msg = '';
  renderKeyDialog();
});
// While a cell waits, the next key press is the answer (Esc cancels). This listener runs before the game's own key
// handling (capture phase on window) and keeps the key from reaching it, so the key does nothing else.
window.addEventListener(
  'keydown',
  e => {
    const wait = keysUI.wait;
    if (!wait) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat || !e.code) return; // a held key (e.g. the Enter that clicked the cell) is not an answer
    keysUI.wait = null;
    if (e.code !== 'Escape') {
      const lost = bindKey(wait.action, wait.slot, e.code);
      const from = KEY_ACTIONS.find(a => a.id === lost);
      keysUI.msg = from ? t('keys.moved', { key: keyLabel(e.code), action: from.name }) : '';
      saveKeys();
    }
    renderKeyDialog();
  },
  true,
);
document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && !el('#dlgKeys').hidden) closeKeyDialog();
});
