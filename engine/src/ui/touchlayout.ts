import { el, clamp } from '../core/util.ts';
import { exitLock, releaseInputs, touchEl } from './input.ts';
// engine: On-screen touch buttons: placement from defaults plus the player's edits, and an editor to drag / resize them.
// Buttons are elements with data-lb="<id>". The editor bar is #layoutBar with [data-lbact] buttons (minus / plus /
// reset / done) and #lbName. The game fills TOUCH_LAYOUT:
//   defs         { id: { x, y (centre as a fraction of the screen), s (scale), b (base size in px), name } }
//   first        id selected when the editor opens
//   edits()      the saved edits, a mutable object { id: { x, y, s } }; reset() clears them; save() persists
//   afterApply() extra tweaks after placing (e.g. hide a button the player turned off)
//   onOpen(from) / onClose(from)  switch screens around the editor (from = whatever openLayoutEditor was given)
export interface ButtonPlace {
  x: number;
  y: number;
  s: number;
}
export interface ButtonDef extends ButtonPlace {
  b: number;
  name: string;
}
export interface TouchLayoutConfig {
  defs: Record<string, ButtonDef>;
  first: string | null;
  edits(): Record<string, ButtonPlace>;
  reset(): void;
  save(): void;
  afterApply(): void;
  onOpen(from?: string): void;
  onClose(from?: string): void;
}
export const TOUCH_LAYOUT: TouchLayoutConfig = {
  defs: {},
  first: null,
  edits: () => ({}),
  reset: () => {},
  save: () => {},
  afterApply: () => {},
  onOpen: () => {},
  onClose: () => {},
};
export const buttonLayout = (id: string): ButtonDef =>
  Object.assign({}, TOUCH_LAYOUT.defs[id], TOUCH_LAYOUT.edits()[id] || {});
// the button layout editor: open, selected button, where it was opened from, the pointer dragging a button
export const layoutEditor: {
  open: boolean;
  sel: string;
  from: string | undefined;
  drag: { id: number; dx: number; dy: number } | null;
} = { open: false, sel: '', from: undefined, drag: null };
export function applyLayout() {
  const vw = window.innerWidth,
    vh = window.innerHeight;
  Object.keys(TOUCH_LAYOUT.defs).forEach(id => {
    const btn = document.querySelector<HTMLElement>(`[data-lb="${id}"]`),
      l = buttonLayout(id),
      size = Math.round(l.b * l.s);
    if (!btn) return;
    btn.style.width = size + 'px';
    btn.style.height = size + 'px';
    btn.style.left = clamp(l.x * vw, size / 2 + 4, vw - size / 2 - 4) + 'px';
    btn.style.top = clamp(l.y * vh, size / 2 + 4, vh - size / 2 - 4) + 'px';
    btn.classList.toggle('sel', layoutEditor.open && layoutEditor.sel === id);
  });
  TOUCH_LAYOUT.afterApply();
}
export function openLayoutEditor(from?: string) {
  layoutEditor.from = from;
  layoutEditor.open = true;
  layoutEditor.sel = TOUCH_LAYOUT.first || Object.keys(TOUCH_LAYOUT.defs)[0];
  releaseInputs();
  exitLock();
  TOUCH_LAYOUT.onOpen(from);
  touchEl.hidden = false;
  touchEl.classList.add('editing');
  el('#layoutBar').hidden = false;
  applyLayout();
  el('#lbName').textContent = TOUCH_LAYOUT.defs[layoutEditor.sel].name;
}
export function closeLayoutEditor() {
  layoutEditor.open = false;
  layoutEditor.drag = null;
  TOUCH_LAYOUT.save();
  touchEl.classList.remove('editing');
  el('#layoutBar').hidden = true;
  applyLayout();
  TOUCH_LAYOUT.onClose(layoutEditor.from);
}
touchEl.addEventListener(
  'pointerdown',
  e => {
    if (!layoutEditor.open) return;
    const target = e.target as HTMLElement,
      b = target.closest<HTMLElement>('[data-lb]');
    if (!b) {
      if (!target.closest('#layoutBar')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    layoutEditor.sel = b.dataset.lb ?? '';
    const r = b.getBoundingClientRect();
    layoutEditor.drag = {
      id: e.pointerId,
      dx: e.clientX - (r.left + r.width / 2),
      dy: e.clientY - (r.top + r.height / 2),
    };
    try {
      b.setPointerCapture(e.pointerId);
    } catch (err) {}
    el('#lbName').textContent = TOUCH_LAYOUT.defs[layoutEditor.sel].name;
    applyLayout();
  },
  true,
);
window.addEventListener('pointermove', e => {
  if (!layoutEditor.open || !layoutEditor.drag || e.pointerId !== layoutEditor.drag.id) return;
  const L = TOUCH_LAYOUT.edits(),
    cur = buttonLayout(layoutEditor.sel);
  L[layoutEditor.sel] = {
    x: clamp((e.clientX - layoutEditor.drag.dx) / window.innerWidth, 0, 1),
    y: clamp((e.clientY - layoutEditor.drag.dy) / window.innerHeight, 0, 1),
    s: cur.s,
  };
  applyLayout();
});
window.addEventListener('pointerup', e => {
  if (layoutEditor.drag && e.pointerId === layoutEditor.drag.id) {
    layoutEditor.drag = null;
    TOUCH_LAYOUT.save();
  }
});
el('#layoutBar').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-lbact]');
  if (!b) return;
  const a = b.dataset.lbact,
    L = TOUCH_LAYOUT.edits(),
    cur = buttonLayout(layoutEditor.sel);
  if (a === 'minus' || a === 'plus')
    L[layoutEditor.sel] = {
      x: cur.x,
      y: cur.y,
      s: clamp(Math.round((cur.s + (a === 'plus' ? 0.1 : -0.1)) * 10) / 10, 0.7, 1.6),
    };
  else if (a === 'reset') TOUCH_LAYOUT.reset();
  else if (a === 'done') {
    closeLayoutEditor();
    return;
  }
  TOUCH_LAYOUT.save();
  applyLayout();
});
window.addEventListener('resize', applyLayout);
