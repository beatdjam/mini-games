import { $, clamp } from '../core/util.ts';
import { exitLock, releaseInputs, touchEl } from './input.ts';
// engine: On-screen touch buttons: placement from defaults plus the player's edits, and an editor to drag / resize them.
// Buttons are elements with data-lb="<id>". The editor bar is #layoutBar with [data-lbact] buttons (minus / plus /
// reset / done) and #lbName. The game fills TOUCH_LAYOUT:
//   defs         { id: { x, y (centre as a fraction of the screen), s (scale), b (base size in px), name } }
//   first        id selected when the editor opens
//   edits()      the saved edits, a mutable object { id: { x, y, s } }; reset() clears them; save() persists
//   afterApply() extra tweaks after placing (e.g. hide a button the player turned off)
//   onOpen(from) / onClose(from)  switch screens around the editor (from = whatever openLayoutEditor was given)
export interface ButtonPlace { x: number; y: number; s: number; }
export interface ButtonDef extends ButtonPlace { b: number; name: string; }
export interface TouchLayoutConfig {
  defs: Record<string, ButtonDef>; first: string | null;
  edits(): Record<string, ButtonPlace>; reset(): void; save(): void; afterApply(): void;
  onOpen(from?: string): void; onClose(from?: string): void;
}
export const TOUCH_LAYOUT: TouchLayoutConfig = { defs: {}, first: null, edits: () => ({}), reset: () => {}, save: () => {}, afterApply: () => {}, onOpen: () => {}, onClose: () => {} };
export const getL = (id: string): ButtonDef => Object.assign({}, TOUCH_LAYOUT.defs[id], TOUCH_LAYOUT.edits()[id] || {});
export let editing = false, editSel = null, editDrag = null, editFrom = null;
export function applyLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  Object.keys(TOUCH_LAYOUT.defs).forEach(id => {
    const el = document.querySelector<HTMLElement>(`[data-lb="${id}"]`), l = getL(id), size = Math.round(l.b * l.s);
    if (!el) return;
    el.style.width = el.style.height = size + 'px';
    el.style.left = clamp(l.x * vw, size / 2 + 4, vw - size / 2 - 4) + 'px';
    el.style.top = clamp(l.y * vh, size / 2 + 4, vh - size / 2 - 4) + 'px';
    el.classList.toggle('sel', editing && editSel === id);
  });
  TOUCH_LAYOUT.afterApply();
}
export function openLayoutEditor(from?: string) {
  editFrom = from; editing = true; editSel = TOUCH_LAYOUT.first || Object.keys(TOUCH_LAYOUT.defs)[0];
  releaseInputs(); exitLock(); TOUCH_LAYOUT.onOpen(from);
  $('#touch').hidden = false; touchEl.classList.add('editing'); $('#layoutBar').hidden = false;
  applyLayout(); $('#lbName').textContent = TOUCH_LAYOUT.defs[editSel].name;
}
export function closeLayoutEditor() {
  editing = false; editDrag = null; TOUCH_LAYOUT.save();
  touchEl.classList.remove('editing'); $('#layoutBar').hidden = true; applyLayout();
  TOUCH_LAYOUT.onClose(editFrom);
}
touchEl.addEventListener('pointerdown', e => {
  if (!editing) return;
  const b = e.target.closest('[data-lb]');
  if (!b) { if (!e.target.closest('#layoutBar')) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
  e.preventDefault(); e.stopPropagation();
  editSel = b.dataset.lb;
  const r = b.getBoundingClientRect();
  editDrag = { id: e.pointerId, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2) };
  try { b.setPointerCapture(e.pointerId); } catch (err) {}
  $('#lbName').textContent = TOUCH_LAYOUT.defs[editSel].name; applyLayout();
}, true);
window.addEventListener('pointermove', e => {
  if (!editing || !editDrag || e.pointerId !== editDrag.id) return;
  const L = TOUCH_LAYOUT.edits(), cur = getL(editSel);
  L[editSel] = { x: clamp((e.clientX - editDrag.dx) / window.innerWidth, 0, 1), y: clamp((e.clientY - editDrag.dy) / window.innerHeight, 0, 1), s: cur.s };
  applyLayout();
});
window.addEventListener('pointerup', e => { if (editDrag && e.pointerId === editDrag.id) { editDrag = null; TOUCH_LAYOUT.save(); } });
$('#layoutBar').addEventListener('click', e => {
  const b = e.target.closest('[data-lbact]'); if (!b) return;
  const a = b.dataset.lbact, L = TOUCH_LAYOUT.edits(), cur = getL(editSel);
  if (a === 'minus' || a === 'plus') L[editSel] = { x: cur.x, y: cur.y, s: clamp(Math.round((cur.s + (a === 'plus' ? 0.1 : -0.1)) * 10) / 10, 0.7, 1.6) };
  else if (a === 'reset') TOUCH_LAYOUT.reset();
  else if (a === 'done') { closeLayoutEditor(); return; }
  TOUCH_LAYOUT.save(); applyLayout();
});
window.addEventListener('resize', applyLayout);
