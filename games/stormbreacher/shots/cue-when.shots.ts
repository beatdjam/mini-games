// A screenshot of the mission script view after some flags have been raised (SB-1810): the event log alone, since the
// conditions change no picture. npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels
// differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots
// whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { boot } from '../src/app/boot.ts';
import { showScript } from '../src/dev/views/script.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN =
  'body > *:not(#gl):not(#sbScriptStatus):not(#sbScriptLog):not(#sbScriptRadio) ' +
  '{ visibility: hidden !important; } ' +
  '#sbScriptStatus, #sbScriptStatus *, #sbScriptLog, #sbScriptLog *, ' +
  '#sbScriptRadio, #sbScriptRadio * { visibility: visible !important; }'; // the 3D view and the script view's log, flags and radio

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

interface ScriptReport {
  events: { kind: string }[];
}

function report(): ScriptReport {
  if (!window.sbScriptReport) throw new Error('the script view has no report');
  return JSON.parse(window.sbScriptReport()) as ScriptReport;
}

async function picture(name: string): Promise<void> {
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

async function until(done: () => boolean, tries = 600): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    await frame();
  }
  if (!done()) throw new Error(`the view did not reach the state in ${tries} frames`);
}

function click(id: string): void {
  const button = document.getElementById(id);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`the script view has no button "${id}"`);
  button.click();
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('cue-when', async () => {
  showScript('#view-script');
  // the landing passed, both pillboxes down (cp1 raises `pillboxes-down`) and the depot broken (`depot-down`)
  click('sbScriptSkip');
  click('sbScriptDestroy-pillbox-1');
  click('sbScriptDestroy-pillbox-2');
  click('sbScriptDestroy-depot');

  await until(() => report().events.some(event => event.kind === 'flag'));
  if (wanted('cue-when-log')) await picture('cue-when-log');
});
