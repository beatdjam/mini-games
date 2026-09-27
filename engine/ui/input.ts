import { $, isTouch } from '../core/util.ts';
import { audioInit } from '../audio/audio.ts';
import { canvas } from '../render/render.ts';
// engine: Input for a first-person game on PC and touch.
// - PC: keys[code] is true while held; mouse look while the pointer is locked to canvas (#gl); left button -> mouseFire.
// - Touch (#touch): the left 45% of the screen is the move stick (joy.x / joy.y in -1..1, drawn with #joyBase / #joyKnob),
//   the rest drags the view. #btnFire: hold to fire (fireHeld), dragging it also turns the view. #btnFire2: hold (fire2Held).
// - tapBtn(el, fn) binds a touch button that acts on press.
// The game fills INPUT:
//   active()      is play accepting look / fire right now
//   look(dx, dy)  turn the view by dx / dy radians
//   sens()        look speed multiplier
//   key(e)        a key went down (keys[] already updated)
//   pause()       the pointer lock was lost or the page was hidden while active
//   lockChanged() the lock state changed (for hint text)
export interface InputConfig {
  active(): boolean; look(dx: number, dy: number): void; sens(): number; key(e: KeyboardEvent): void; pause(): void; lockChanged(): void;
}
export const INPUT: InputConfig = { active: () => false, look: () => {}, sens: () => 1, key: () => {}, pause: () => {}, lockChanged: () => {} };
export const keys: Record<string, boolean> = {};
export let joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, look = { id: null, x: 0, y: 0 }, fireTouch = { id: null, x: 0, y: 0 };
export let fireHeld = false, fire2Held = false, mouseFire = false, locked = false, lockWorked = false;
export const touchEl = $('#touch');
export function setFireHeld(v) { fireHeld = v; } // tests
export function lookDelta(dx: number, dy: number, k: number) { INPUT.look(dx * k, dy * k); }
export const tk = () => 0.0055 * INPUT.sens();

touchEl.addEventListener('pointerdown', e => {
  if (e.target !== touchEl) return;
  audioInit();
  if (e.pointerType === 'mouse' && !document.body.classList.contains('nolock')) { if (!locked) requestLock(); return; }
  e.preventDefault();
  try { touchEl.setPointerCapture(e.pointerId); } catch (err) {}
  if (e.clientX < window.innerWidth * 0.45 && joy.id === null) {
    joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
    const jb = $('#joyBase'); jb.style.left = e.clientX + 'px'; jb.style.top = e.clientY + 'px'; jb.style.display = 'block';
    $('#joyKnob').style.transform = '';
  } else if (look.id === null) { look = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
});
touchEl.addEventListener('pointermove', e => {
  if (e.pointerId === joy.id) {
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = Math.hypot(dx, dy), R = 55;
    if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    joy.x = dx / R; joy.y = dy / R;
    $('#joyKnob').style.transform = `translate(${dx}px,${dy}px)`;
  } else if (e.pointerId === look.id) {
    lookDelta(e.clientX - look.x, e.clientY - look.y, tk()); look.x = e.clientX; look.y = e.clientY;
  }
});
export function endPointer(e) {
  if (e.pointerId === joy.id) { joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; $('#joyBase').style.display = 'none'; }
  if (e.pointerId === look.id) look = { id: null, x: 0, y: 0 };
}
touchEl.addEventListener('pointerup', endPointer);
touchEl.addEventListener('pointercancel', endPointer);
export function releaseInputs() {
  joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; look = { id: null, x: 0, y: 0 }; fireTouch = { id: null, x: 0, y: 0 };
  fireHeld = false; fire2Held = false; mouseFire = false; $('#joyBase').style.display = 'none'; $('#btnFire').classList.remove('down'); $('#btnFire2').classList.remove('down');
  for (const k in keys) keys[k] = false;
}
export const btnFire = $('#btnFire');
btnFire.addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation(); audioInit();
  try { btnFire.setPointerCapture(e.pointerId); } catch (err) {}
  fireTouch = { id: e.pointerId, x: e.clientX, y: e.clientY }; fireHeld = true; btnFire.classList.add('down');
});
btnFire.addEventListener('pointermove', e => {
  if (e.pointerId !== fireTouch.id) return;
  lookDelta(e.clientX - fireTouch.x, e.clientY - fireTouch.y, tk()); fireTouch.x = e.clientX; fireTouch.y = e.clientY;
});
export const fireUp = e => { if (e.pointerId === fireTouch.id) { fireTouch.id = null; fireHeld = false; btnFire.classList.remove('down'); } };
btnFire.addEventListener('pointerup', fireUp); btnFire.addEventListener('pointercancel', fireUp);
export function tapBtn(el: HTMLElement, fn: () => void) { el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audioInit(); fn(); }); }
export const btnFire2 = $('#btnFire2');
btnFire2.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audioInit(); try { btnFire2.setPointerCapture(e.pointerId); } catch (err) {} fire2Held = true; btnFire2.classList.add('down'); });
export const fire2Up = () => { fire2Held = false; btnFire2.classList.remove('down'); };
btnFire2.addEventListener('pointerup', fire2Up); btnFire2.addEventListener('pointercancel', fire2Up);

export function exitLock() { if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) {} } }
export function lockFailed() { if (!lockWorked) document.body.classList.add('nolock'); INPUT.lockChanged(); }
export function requestLock() {
  if (isTouch) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(lockFailed);
  } catch (err) { lockFailed(); }
}
document.addEventListener('pointerlockchange', () => {
  const was = locked; locked = document.pointerLockElement === canvas;
  if (locked) { lockWorked = true; document.body.classList.remove('nolock'); }
  // a lock requested just before a menu opened can land after it (Firefox is slow here): let go so the menu is usable
  if (locked && !INPUT.active()) exitLock();
  INPUT.lockChanged();
  if (was && !locked && INPUT.active()) INPUT.pause();
});
document.addEventListener('pointerlockerror', lockFailed);
document.addEventListener('mousedown', e => { if (locked && INPUT.active() && e.button === 0) { audioInit(); mouseFire = true; } });
document.addEventListener('mouseup', () => { mouseFire = false; });
document.addEventListener('mousemove', e => { if (locked && INPUT.active()) lookDelta(e.movementX, e.movementY, 0.0022 * INPUT.sens()); });
window.addEventListener('keydown', e => { keys[e.code] = true; INPUT.key(e); });
window.addEventListener('keyup', e => { keys[e.code] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && INPUT.active()) INPUT.pause(); });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());
