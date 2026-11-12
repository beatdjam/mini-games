// The briefing before the sortie (SB-310): a map seen from above and the lines that come one by one. A tap, a click,
// Enter or Space brings the next line at once; when all are out the same press goes to the sortie, and Esc or the skip
// button goes any time. This file owns the `briefing` state; what the sortie then does is play.ts's, passed in as `done`.
import { addSystem, el, t } from '@engine/core/index.ts';
import { M1_BRIEFING, M1_BRIEFING_WAVE_PATH } from '../data/briefings.ts';
import { M1B_HAND } from '../data/maps/m1b-hand.ts';
import { M1 } from '../data/missions/m1.ts';
import { briefingMap, linesOut, nextLineAt, type BriefingMap } from '../logic/briefing.ts';
import { briefingCanvasSize, drawBriefing } from '../view/briefing.ts';
import { setState, state } from './screen.ts';

const SKIP_KEY = 'Escape';
const NEXT_KEYS = ['Enter', 'Space'];

// The briefing's own state, for the tests too.
export const briefingUI = {
  time: 0, // the clock from the start (s); a tap sets it to the next line's time
  out: 0, // how many lines are on the page
  openedAt: 0, // when the briefing opened (ms, as Event.timeStamp): earlier presses (the one that opened it) are not taps
};

let onDone: (() => void) | null = null; // what to do when the briefing ends; set while it is open
let ready = false; // the listeners and the system are set up (once)
let drawing: { map: BriefingMap; ctx: CanvasRenderingContext2D } | null = null;

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('the briefing needs a 2D canvas');
  return ctx;
}

// Puts the lines out so far on the page, and the sortie button once all are out.
function syncLines(): void {
  const out = linesOut(M1_BRIEFING, briefingUI.time);
  if (out === briefingUI.out) return;
  briefingUI.out = out;
  const list = el('#sbBriefingLines');
  list.replaceChildren();
  M1_BRIEFING.slice(0, out).forEach((line, i) => {
    const row = document.createElement('p');
    row.textContent = t(line.key);
    row.dataset.latest = String(i === out - 1);
    list.append(row);
  });
  const all = out === M1_BRIEFING.length;
  el('#sbBriefingGo').hidden = !all;
  el('#sbBriefingSkip').hidden = all;
}

function draw(): void {
  if (drawing) drawBriefing(drawing.ctx, drawing.map, M1_BRIEFING, briefingUI.time);
}

function finish(): void {
  if (state !== 'briefing' || !onDone) return;
  const done = onDone;
  onDone = null;
  el('#sbBriefing').hidden = true;
  done();
}

// A press for the next line: the next line comes now, or the sortie starts when all are out.
function advance(): void {
  const next = nextLineAt(M1_BRIEFING, briefingUI.out);
  if (next === null) {
    finish();
    return;
  }
  briefingUI.time = next;
  syncLines();
  draw();
}

function isStale(event: Event): boolean {
  return event.timeStamp <= briefingUI.openedAt;
}

function setup(): void {
  ready = true;
  const map = briefingMap(M1B_HAND, M1.paths[M1_BRIEFING_WAVE_PATH] ?? []);
  const canvas = el<HTMLCanvasElement>('#sbBriefingMap');
  const size = briefingCanvasSize(map);
  canvas.width = size.width;
  canvas.height = size.height;
  drawing = { map, ctx: context(canvas) };
  el('#sbBriefing').addEventListener('click', event => {
    // the buttons answer for themselves; any other tap on the page is a press for the next line
    if (state !== 'briefing' || isStale(event) || event.target instanceof HTMLButtonElement) return;
    advance();
  });
  el('#sbBriefingGo').addEventListener('click', () => {
    if (state === 'briefing') finish();
  });
  el('#sbBriefingSkip').addEventListener('click', () => {
    if (state === 'briefing') finish();
  });
  // In the capture phase, and the press stops here: the same Esc would pause the sortie it has just started.
  window.addEventListener(
    'keydown',
    event => {
      if (state !== 'briefing' || event.repeat || isStale(event)) return;
      if (event.code === SKIP_KEY) finish();
      // a focused button turns Enter and Space into its own click
      else if (NEXT_KEYS.includes(event.code) && !(event.target instanceof HTMLButtonElement)) advance();
      else return;
      event.stopImmediatePropagation();
    },
    true,
  );
  addSystem({
    name: 'sb-briefing',
    modes: ['briefing'],
    update: dt => {
      briefingUI.time += dt;
      syncLines();
      draw();
    },
  });
}

// Opens the briefing; `done` runs when it ends, by the sortie button, a press after the last line, or a skip.
export function openBriefing(done: () => void): void {
  if (!ready) setup();
  onDone = done;
  briefingUI.time = 0;
  briefingUI.out = -1; // no line is on the page yet; syncLines puts the first
  briefingUI.openedAt = performance.now();
  el('#sbApp').hidden = true;
  el('#sbBriefing').hidden = false;
  setState('briefing');
  syncLines();
  draw();
}
