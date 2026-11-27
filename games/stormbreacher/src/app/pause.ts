// The pause menu (SB-210): a sortie stops at P, Esc or the pause button, and the menu offers resume, suspend and abandon.
// Abandon asks once more, because it cannot be taken back. This file owns the menu and the `paused` state; what suspend
// and abandon do to the sortie is play.ts's, passed in by initPause.
import { el } from '@engine/core/index.ts';
import { PAUSE_KEYS } from '../data/keys.ts';
import { setState, state } from './screen.ts';
import { takeSkip } from './skip.ts';
import { clearPendingTouch } from './touch.ts';

export interface PauseHooks {
  inCutscene: () => boolean; // whether a cutscene is playing, where Esc skips it instead of pausing
  suspend: () => void;
  abandon: () => void;
}

let hooks: PauseHooks | null = null; // set by initPause; null until the first sortie
let askingAbandon = false; // the menu shows the abandon question instead of its three buttons

// The menu's buttons for the question being asked or not.
function showButtons(): void {
  for (const id of ['#sbPauseResume', '#sbPauseSuspend', '#sbPauseAbandon']) el(id).hidden = askingAbandon;
  for (const id of ['#sbAbandonYes', '#sbAbandonNo']) el(id).hidden = !askingAbandon;
}

// Whether the pause button is on the page: only while a sortie is in play.
export function showPauseButton(show: boolean): void {
  el('#sbPauseBtn').hidden = !show;
}

// Closes the menu without changing the state (the sortie ended or went to the title).
export function hidePause(): void {
  el('#sbPause').hidden = true;
  askingAbandon = false;
}

function pause(): void {
  if (state !== 'play') return;
  setState('paused');
  askingAbandon = false;
  showButtons();
  el('#sbPause').hidden = false;
}

function resume(): void {
  if (state !== 'paused') return;
  hidePause();
  setState('play');
  // a press that came while paused (Esc, the menu's clicks) must not skip the cutscene that goes on
  takeSkip();
  // a use (the keyboard's and the touch buttons') pressed while paused would act on the first frame after the resume
  clearPendingTouch();
}

// A key at the pause: Esc and P pause, close the abandon question or resume.
function onKey(event: KeyboardEvent): void {
  if (event.repeat || !PAUSE_KEYS.includes(event.code) || !hooks) return;
  if (state === 'play') {
    if (event.code === 'Escape' && hooks.inCutscene()) return;
    pause();
  } else if (state === 'paused') {
    if (askingAbandon) {
      askingAbandon = false;
      showButtons();
    } else {
      resume();
    }
  }
}

// Sets up the buttons and the keys; the second call does nothing.
export function initPause(given: PauseHooks): void {
  if (hooks) return;
  hooks = given;
  window.addEventListener('keydown', onKey);
  el('#sbPauseBtn').addEventListener('click', () => {
    pause();
    el('#sbPauseBtn').blur();
  });
  el('#sbPauseResume').addEventListener('click', () => {
    resume();
  });
  el('#sbPauseSuspend').addEventListener('click', () => given.suspend());
  el('#sbPauseAbandon').addEventListener('click', () => {
    askingAbandon = true;
    showButtons();
  });
  el('#sbAbandonYes').addEventListener('click', () => given.abandon());
  el('#sbAbandonNo').addEventListener('click', () => {
    askingAbandon = false;
    showButtons();
  });
}
