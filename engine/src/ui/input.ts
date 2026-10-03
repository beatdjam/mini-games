import { el, isTouch } from '../core/util.ts';
import { audioInit } from '../audio/audio.ts';
import { canvas } from '../render/render.ts';
// engine: Input for a first-person game on PC and touch.
// - PC: keys[code] is true while held; mouse look while the pointer is locked to canvas (#gl); left button -> mouseFire.
// - Touch (#touch): the left 45% of the screen is the move stick (joy.x / joy.y in -1..1, drawn with #joyBase / #joyKnob),
//   the rest drags the view. #btnFire: hold to fire (fireHeld), dragging it also turns the view. #btnFire2: hold (fire2Held).
// - tapBtn(btn, fn) binds a touch button that acts on press.
// The game fills INPUT:
//   active()      is play accepting look / fire right now
//   look(dx, dy)  turn the view by dx / dy radians
//   sens()        look speed multiplier
//   key(e)        a key went down (keys[] already updated)
//   pause()       the pointer lock was lost or the page was hidden while active
//   lockChanged() the lock state changed (for hint text)
export interface InputConfig {
  active(): boolean;
  look(dx: number, dy: number): void;
  sens(): number;
  key(e: KeyboardEvent): void;
  pause(): void;
  lockChanged(): void;
}
export const INPUT: InputConfig = {
  active: () => false,
  look: () => {},
  sens: () => 1,
  key: () => {},
  pause: () => {},
  lockChanged: () => {},
};
// touch: the left part of the screen is the move stick; this is its width as a fraction of the screen width
const STICK_ZONE = 0.45;
// touch: how far the stick knob can move from where it was grabbed (px)
const STICK_R = 55;
// touch: view turn per px of finger drag (radians per px, before INPUT.sens())
const TOUCH_LOOK = 0.0055;
// mouse: view turn per px of mouse movement while locked (radians per px, before INPUT.sens())
const MOUSE_LOOK = 0.0022;

export const keys: Record<string, boolean> = {};
// id = the pointer holding it (null when free); ox / oy = where the stick was grabbed
interface Stick {
  id: number | null;
  ox: number;
  oy: number;
  x: number;
  y: number;
}
const freeJoy = (): Stick => ({ id: null, ox: 0, oy: 0, x: 0, y: 0 });
export let joy = freeJoy();
// the pointer turning the view, and the pointer holding #btnFire (id null when free)
let look: { id: number | null; x: number; y: number } = { id: null, x: 0, y: 0 };
let fireTouch: { id: number | null; x: number; y: number } = { id: null, x: 0, y: 0 };
export let fireHeld = false; // #btnFire held
export let fire2Held = false; // #btnFire2 held
let fire2Id: number | null = null; // the pointer holding #btnFire2
export let mouseFire = false; // left mouse button held while the pointer is locked
export let locked = false; // the pointer is locked to the canvas
let lockWorked = false; // pointer lock has worked at least once (else lockFailed adds body.nolock)
export const touchEl = el('#touch');
// fireHeld can only be written in this module, so tests press fire through this
export function setFireHeld(v: boolean) {
  fireHeld = v;
}
export function lookDelta(dx: number, dy: number, k: number) {
  INPUT.look(dx * k, dy * k);
}
export const lookSpeed = () => TOUCH_LOOK * INPUT.sens();

touchEl.addEventListener('pointerdown', e => {
  if (e.target !== touchEl) return;
  audioInit();
  if (e.pointerType === 'mouse' && !document.body.classList.contains('nolock')) {
    if (!locked) requestLock();
    return;
  }
  e.preventDefault();
  try {
    touchEl.setPointerCapture(e.pointerId);
  } catch (err) {}
  if (e.clientX < window.innerWidth * STICK_ZONE && joy.id === null) {
    joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
    const jb = el('#joyBase');
    jb.style.left = e.clientX + 'px';
    jb.style.top = e.clientY + 'px';
    jb.style.display = 'block';
    el('#joyKnob').style.transform = '';
  } else if (look.id === null) {
    look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
});
touchEl.addEventListener('pointermove', e => {
  if (e.pointerId === joy.id) {
    let dx = e.clientX - joy.ox,
      dy = e.clientY - joy.oy;
    const l = Math.hypot(dx, dy);
    if (l > STICK_R) {
      dx = (dx / l) * STICK_R;
      dy = (dy / l) * STICK_R;
    }
    joy.x = dx / STICK_R;
    joy.y = dy / STICK_R;
    el('#joyKnob').style.transform = `translate(${dx}px,${dy}px)`;
  } else if (e.pointerId === look.id) {
    lookDelta(e.clientX - look.x, e.clientY - look.y, lookSpeed());
    look.x = e.clientX;
    look.y = e.clientY;
  }
});
export function endPointer(e: PointerEvent) {
  if (e.pointerId === joy.id) {
    joy = freeJoy();
    el('#joyBase').style.display = 'none';
  }
  if (e.pointerId === look.id) look = { id: null, x: 0, y: 0 };
}
touchEl.addEventListener('pointerup', endPointer);
touchEl.addEventListener('pointercancel', endPointer);
export function releaseInputs() {
  joy = freeJoy();
  look = { id: null, x: 0, y: 0 };
  fireTouch = { id: null, x: 0, y: 0 };
  fireHeld = false;
  fire2Held = false;
  fire2Id = null;
  mouseFire = false;
  el('#joyBase').style.display = 'none';
  el('#btnFire').classList.remove('down');
  el('#btnFire2').classList.remove('down');
  for (const k in keys) keys[k] = false;
}
// a hold button: pressing it captures the pointer and adds the 'down' class; onDown sets the held state
// and onUp (pointerup / pointercancel) clears it, including the 'down' class
function bindHoldButton(btn: HTMLElement, onDown: (e: PointerEvent) => void, onUp: (e: PointerEvent) => void) {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    audioInit();
    try {
      btn.setPointerCapture(e.pointerId);
    } catch (err) {}
    onDown(e);
    btn.classList.add('down');
  });
  btn.addEventListener('pointerup', onUp);
  btn.addEventListener('pointercancel', onUp);
}
export const btnFire = el('#btnFire');
// only the pointer that pressed #btnFire can release it (the same for #btnFire2)
export const fireUp = (e: PointerEvent) => {
  if (e.pointerId === fireTouch.id) {
    fireTouch.id = null;
    fireHeld = false;
    btnFire.classList.remove('down');
  }
};
bindHoldButton(
  btnFire,
  e => {
    fireTouch = { id: e.pointerId, x: e.clientX, y: e.clientY };
    fireHeld = true;
  },
  fireUp,
);
btnFire.addEventListener('pointermove', e => {
  if (e.pointerId !== fireTouch.id) return;
  lookDelta(e.clientX - fireTouch.x, e.clientY - fireTouch.y, lookSpeed());
  fireTouch.x = e.clientX;
  fireTouch.y = e.clientY;
});
export function tapBtn(btn: HTMLElement, fn: () => void) {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    audioInit();
    fn();
  });
}
export const btnFire2 = el('#btnFire2');
// like fireUp: only the pointer that pressed #btnFire2 can release it
export const fire2Up = (e: PointerEvent) => {
  if (e.pointerId === fire2Id) {
    fire2Id = null;
    fire2Held = false;
    btnFire2.classList.remove('down');
  }
};
bindHoldButton(
  btnFire2,
  e => {
    fire2Id = e.pointerId;
    fire2Held = true;
  },
  fire2Up,
);

export function exitLock() {
  if (document.pointerLockElement) {
    try {
      document.exitPointerLock();
    } catch (e) {}
  }
}
export function lockFailed() {
  if (!lockWorked) document.body.classList.add('nolock');
  INPUT.lockChanged();
}
export function requestLock() {
  if (isTouch) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(lockFailed);
  } catch (err) {
    lockFailed();
  }
}
document.addEventListener('pointerlockchange', () => {
  const was = locked;
  locked = document.pointerLockElement === canvas;
  if (locked) {
    lockWorked = true;
    document.body.classList.remove('nolock');
  }
  // a lock requested just before a menu opened can land after it (Firefox is slow here): let go so the menu is usable
  if (locked && !INPUT.active()) exitLock();
  INPUT.lockChanged();
  if (was && !locked && INPUT.active()) INPUT.pause();
});
document.addEventListener('pointerlockerror', lockFailed);
document.addEventListener('mousedown', e => {
  if (locked && INPUT.active() && e.button === 0) {
    audioInit();
    mouseFire = true;
  }
});
document.addEventListener('mouseup', () => {
  mouseFire = false;
});
document.addEventListener('mousemove', e => {
  if (locked && INPUT.active()) lookDelta(e.movementX, e.movementY, MOUSE_LOOK * INPUT.sens());
});
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  INPUT.key(e);
});
window.addEventListener('keyup', e => {
  keys[e.code] = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && INPUT.active()) INPUT.pause();
});
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());
