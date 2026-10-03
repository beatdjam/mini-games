import { el } from '@engine/core/util.ts';
import { clearStore } from '@engine/core/store.ts';
import { t } from '@engine/core/i18n.ts';
import { toast } from '@engine/ui/ui.ts';
import { applyLayout } from '@engine/ui/touchlayout.ts';
import { SAVE_KEY, defaultSave, exportSave, importSave, importSaveCheck, persist, setSave } from '../core/save.ts';
import { baseUI, renderBase } from './base.ts';
import { onDataClick } from './rows.ts';

// ---- full data wipe (red confirmation dialog) ----
el('#btnWipe').addEventListener('click', () => {
  el('#dlgWipe').hidden = false;
  el('#btnWipeCancel').focus();
});
el('#btnWipeCancel').addEventListener('click', () => {
  el('#dlgWipe').hidden = true;
});
document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && !el('#dlgWipe').hidden) el('#dlgWipe').hidden = true;
});
// ---- save codes: copy the save to another device (settings tab > data) ----
// export shows the code with copy / save-to-file; import takes a pasted code or a file, asks once, then reloads
// transient state of the save-code panel
const savePanel: {
  mode: 'export' | 'import' | null; // null = closed
  importArm: boolean; // the import confirmation is showing
} = { mode: null, importArm: false };
// the buttons under the code box: export (copy / file / close), import (check / file / close), or the import confirmation
const saveBtn = (act: string, label: string, cls = 'mini-btn'): string =>
  `<button class="${cls}" data-save="${act}">${label}</button>`;
function saveButtons(mode: 'export' | 'import'): string {
  const close = saveBtn('close', t('common.close'));
  if (mode === 'export') {
    return saveBtn('copy', t('save.copy'), 'mini-btn amber') + saveBtn('download', t('save.download')) + close;
  }
  if (savePanel.importArm)
    return saveBtn('go', t('save.importGo'), 'danger-ghost') + saveBtn('cancel', t('common.cancel'));
  return saveBtn('check', t('save.importCheck'), 'mini-btn amber') + saveBtn('file', t('save.fromFile')) + close;
}
function renderSavePanel() {
  const panel = el('#savePanel'),
    box = el<HTMLTextAreaElement>('#saveCode');
  panel.hidden = !savePanel.mode;
  if (!savePanel.mode) return;
  box.readOnly = savePanel.mode === 'export';
  box.placeholder = savePanel.mode === 'import' ? t('save.paste') : '';
  el('#saveMsg').textContent = t(
    savePanel.mode === 'export' ? 'save.exportNote' : savePanel.importArm ? 'save.importConfirm' : 'save.importNote',
  );
  el('#saveBtns').innerHTML = saveButtons(savePanel.mode);
}
function openSavePanel(mode: 'export' | 'import') {
  savePanel.mode = savePanel.mode === mode ? null : mode;
  savePanel.importArm = false;
  el<HTMLTextAreaElement>('#saveCode').value = savePanel.mode === 'export' ? exportSave() : '';
  renderSavePanel();
}
el('#btnExport').addEventListener('click', () => openSavePanel('export'));
el('#btnImport').addEventListener('click', () => openSavePanel('import'));
onDataClick(el('#saveBtns'), [
  'save',
  a => {
    const box = el<HTMLTextAreaElement>('#saveCode');
    if (a === 'close') {
      savePanel.mode = null;
      renderSavePanel();
    } else if (a === 'copy') {
      const done = () => toast(t('save.copied'), 2000);
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(box.value).then(done, () => {
          box.select();
          toast(t('save.copyFailed'), 3000);
        });
      else {
        box.select();
        toast(t('save.copyFailed'), 3000);
      }
    } else if (a === 'download') {
      const url = URL.createObjectURL(new Blob([box.value + '\n'], { type: 'text/plain' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `sector-dive-save-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } else if (a === 'file') el<HTMLInputElement>('#saveFile').click();
    else if (a === 'check') {
      if (!box.value.trim()) return;
      if (!importSaveCheck(box.value)) {
        toast(t('save.invalid'), 3000);
        return;
      }
      savePanel.importArm = true;
      renderSavePanel();
    } else if (a === 'cancel') {
      savePanel.importArm = false;
      renderSavePanel();
    } else if (a === 'go') {
      if (!importSave(box.value)) {
        savePanel.importArm = false;
        renderSavePanel();
        toast(t('save.invalid'), 3000);
        return;
      }
      location.reload();
    }
  },
]);
el<HTMLInputElement>('#saveFile').addEventListener('change', e => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  f.text().then(txt => {
    el<HTMLTextAreaElement>('#saveCode').value = txt.trim();
    (e.target as HTMLInputElement).value = '';
  });
});

el('#btnWipeGo').addEventListener('click', () => {
  clearStore(SAVE_KEY);
  setSave(defaultSave());
  persist();
  el('#dlgWipe').hidden = true;
  baseUI.selSlot = 0;
  renderBase();
  applyLayout();
});
