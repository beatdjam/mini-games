// Touch input for the mech (SB-030): the engine's floating stick and view drag become the MechInput that keyboard
// input fills in #view-move, and the jump / boost / lock buttons sit on top. Also measures how hard the layout is to
// use: presses per button, the most fingers down at once, and how long the stick, the view drag and fire (or boost)
// were all in use together.
import { audioInit } from '@engine/audio/index.ts';
import { el, t } from '@engine/core/index.ts';
import {
  INPUT,
  TOUCH_LAYOUT,
  applyLayout,
  fire2Held,
  fireHeld,
  initInput,
  initTouchLayout,
  joy,
  tapBtn,
} from '@engine/ui/index.ts';
import { TOUCH_BUTTONS, TOUCH_DEFAULTS, TOUCH_TUNE, type TouchButton, type TouchDefault } from '../data/touch.ts';
import type { MechInput } from '../logic/mech.ts';
import { clearTouchEdits, loadTouchEdits, saveTouchEdits, type TouchEdits } from './storage.ts';

export interface TouchRead {
  input: MechInput;
  pitchDelta: number; // the pitch this frame's drag adds (rad)
  lock: boolean; // the lock display the #btnLock button toggles
  sub: boolean; // #btnFire2 held (MechInput has no sub yet)
}

export interface TouchStats {
  presses: Record<TouchButton, number>; // how many times each button was pressed
  maxPointers: number; // the most fingers down at once
  stickLookFireSec: number; // total seconds the stick, the view drag and the main shot were all in use (s)
  stickLookBoostSec: number; // the same with the boost instead of the main shot (s)
}

// A stick moved this far from its centre counts as in use for the overlap times (fraction of the stick's radius).
const STICK_MOVE_MIN = 0.15;
// The engine's stick takes the first 45% of the screen (input.ts STICK_ZONE); the rest is the view drag.
const STICK_ZONE = 0.45;
// How long after a view drag the view still counts as in use (s).
export const LOOK_RECENT = 0.25;

const presses: Record<TouchButton, number> = { main: 0, sub: 0, jump: 0, boost: 0, lock: 0 };
const pointers = new Set<number>(); // every finger down on #touch (buttons included)
let maxPointers = 0;
let stickId: number | null = null; // the finger the engine's stick took
let lookId: number | null = null; // the finger the engine's view drag took
let lastLookAt = -Infinity; // when the view last moved (ms, performance.now)
let jumpPressed = false; // went down since the last readTouch
let jumpHeld = false; // the jump button is held
let lockOn = false;
let boostHeld = false;
let yawDelta = 0; // the view drag since the last readTouch (rad)
let pitchDelta = 0; // the same, for the pitch (rad)
let touchActive = false; // the touch view is running (INPUT.active)
let touchReady = false; // initTouch has run (a second call does nothing)
let edits: TouchEdits = {};

// A time the three conditions were all true. `total` is the part already ended (s); `since` is when the part still
// running started (ms, performance.now), or null when it is not running.
interface Combo {
  since: number | null;
  total: number;
}
const stickLookFire: Combo = { since: null, total: 0 };
const stickLookBoost: Combo = { since: null, total: 0 };

const round = (value: number): number => Math.round(value * 1000) / 1000;

function sampleCombo(combo: Combo, active: boolean, now: number) {
  if (active) {
    if (combo.since === null) combo.since = now;
  } else if (combo.since !== null) {
    combo.total += (now - combo.since) / 1000;
    combo.since = null;
  }
}

const comboSeconds = (combo: Combo, now: number): number =>
  combo.total + (combo.since === null ? 0 : (now - combo.since) / 1000);

const stickInUse = (): boolean => stickId !== null && Math.hypot(joy.x, joy.y) > STICK_MOVE_MIN;

// The view counts as in use for LOOK_RECENT after any drag, from the main button as well as the open part.
export function lookInUse(now: number): boolean {
  return now - lastLookAt <= LOOK_RECENT * 1000;
}

function sampleCombos(now: number) {
  const aiming = stickInUse() && lookInUse(now);
  sampleCombo(stickLookFire, aiming && fireHeld, now);
  sampleCombo(stickLookBoost, aiming && boostHeld, now);
}

function asTouchButton(id: string | undefined): TouchButton | null {
  for (const button of TOUCH_BUTTONS) if (button === id) return button;
  return null;
}

// The buttons' definitions: the starting places with the names from the language files.
function touchDefs(): Record<TouchButton, TouchDefault & { name: string }> {
  return {
    main: { ...TOUCH_DEFAULTS.main, name: t('btn.main') },
    sub: { ...TOUCH_DEFAULTS.sub, name: t('btn.sub') },
    jump: { ...TOUCH_DEFAULTS.jump, name: t('btn.jump') },
    boost: { ...TOUCH_DEFAULTS.boost, name: t('btn.boost') },
    lock: { ...TOUCH_DEFAULTS.lock, name: t('btn.lock') },
  };
}

// A button held by the finger that pressed it; only that finger can let it go. `onHold` runs whenever the held state
// changes and `onDown`, if given, once on the press. The engine's hold-button binding is not exported (the engine
// stays as it is), so the same steps are here.
function bindHold(btn: HTMLElement, onHold: (down: boolean) => void, onDown?: () => void) {
  let heldId: number | null = null;
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    audioInit();
    try {
      btn.setPointerCapture(e.pointerId);
    } catch (err) {}
    heldId = e.pointerId;
    btn.classList.add('down');
    onHold(true);
    onDown?.();
  });
  const up = (e: PointerEvent) => {
    if (e.pointerId !== heldId) return;
    heldId = null;
    btn.classList.remove('down');
    onHold(false);
  };
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
}

export function initTouch() {
  if (touchReady) return;
  touchReady = true;
  initInput({ touch: el('#touch'), fire: el('#btnFire'), fire2: el('#btnFire2') });
  edits = loadTouchEdits();
  TOUCH_LAYOUT.defs = touchDefs();
  TOUCH_LAYOUT.first = 'main';
  TOUCH_LAYOUT.edits = () => edits;
  TOUCH_LAYOUT.reset = () => {
    clearTouchEdits();
    edits = {};
  };
  TOUCH_LAYOUT.save = () => saveTouchEdits(edits);
  TOUCH_LAYOUT.afterApply = () => {};
  TOUCH_LAYOUT.onOpen = () => {};
  TOUCH_LAYOUT.onClose = () => applyLayout();
  initTouchLayout();
  el('#touch').hidden = false;
  applyLayout();
  touchActive = true;

  const touch = el('#touch');
  // capture, so a button's own handler (which stops propagation) has not hidden the press yet
  touch.addEventListener(
    'pointerdown',
    e => {
      pointers.add(e.pointerId);
      maxPointers = Math.max(maxPointers, pointers.size);
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const button = asTouchButton(target.closest<HTMLElement>('[data-lb]')?.dataset.lb);
      if (button) presses[button]++;
      if (target !== touch) return;
      // the same split as the engine: the left 45% is the stick while no other finger has it, the rest is the view
      if (e.clientX < window.innerWidth * STICK_ZONE && stickId === null) stickId = e.pointerId;
      else lookId = e.pointerId;
    },
    true,
  );
  const end = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (stickId === e.pointerId) stickId = null;
    if (lookId === e.pointerId) lookId = null;
  };
  touch.addEventListener('pointerup', end, true);
  touch.addEventListener('pointercancel', end, true);

  bindHold(
    el('#btnJump'),
    down => {
      jumpHeld = down;
    },
    () => {
      jumpPressed = true;
    },
  );
  tapBtn(el('#btnLock'), () => {
    lockOn = !lockOn;
    el('#btnLock').classList.toggle('on', lockOn);
  });
  bindHold(el('#btnBoost'), down => {
    boostHeld = down;
  });

  INPUT.active = () => touchActive;
  INPUT.look = (dx: number, dy: number) => {
    lastLookAt = performance.now();
    yawDelta -= dx * TOUCH_TUNE.lookX;
    pitchDelta -= dy * TOUCH_TUNE.lookY;
  };
}

// This frame's input. The view motion is read and cleared, and a jump is true for one read only.
export function readTouch(): TouchRead {
  sampleCombos(performance.now());
  const input: MechInput = {
    moveX: joy.x,
    moveZ: -joy.y, // the stick up is forward
    turn: yawDelta,
    jump: jumpPressed,
    jumpHeld,
    boost: boostHeld,
    fire: fireHeld,
  };
  const pitch = pitchDelta;
  yawDelta = 0;
  pitchDelta = 0;
  jumpPressed = false;
  return { input, pitchDelta: pitch, lock: lockOn, sub: fire2Held };
}

export function touchStats(): TouchStats {
  const now = performance.now();
  sampleCombos(now);
  return {
    presses: { ...presses },
    maxPointers,
    stickLookFireSec: round(comboSeconds(stickLookFire, now)),
    stickLookBoostSec: round(comboSeconds(stickLookBoost, now)),
  };
}

export function resetTouchStats() {
  for (const button of TOUCH_BUTTONS) presses[button] = 0;
  maxPointers = 0;
  stickLookFire.total = 0;
  stickLookFire.since = null;
  stickLookBoost.total = 0;
  stickLookBoost.since = null;
  sampleCombos(performance.now());
}
