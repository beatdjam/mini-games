// Start-up: the table of steps, run in order. Tests call boot() as the page's main.ts does; a second call does nothing.
import { defaultLang, el, isTouch, LOOP, setLang, startLoop } from '@engine/core/index.ts';
import { initRender } from '@engine/render/index.ts';
import { FIELD_TUNE } from '../data/tune.ts';
import { buildField, placeCamera } from '../view/field.ts';
import { initFullscreen } from './fullscreen.ts';
import { continueSortie, pressStart, syncTitle } from './play.ts';
import { loopMode, state } from './screen.ts';
import { initSave, settings } from './storage.ts';

// The title's way into the sortie: the start button and Enter, and "continue" for a suspended one. The dev views (#view-…) keep the title's state and run
// their own systems, so there the button stays hidden and Enter does nothing.
function initStart() {
  if (location.hash.startsWith('#view-')) {
    el('#sbStart').hidden = true;
    return;
  }
  syncTitle();
  el('#sbStart').addEventListener('click', () => {
    if (state === 'title') pressStart();
  });
  el('#sbContinue').addEventListener('click', () => {
    if (state === 'title') continueSortie();
  });
  // a focused button turns Enter into its own click, which would be a second press
  window.addEventListener('keydown', event => {
    if (event.code === 'Enter' && state === 'title' && !(event.target instanceof HTMLButtonElement)) pressStart();
  });
}

// The order matters: the save tells the language, the renderer needs the page, the field needs the renderer, the start
// button needs the field's page, and the loop draws what the field made. Only functions: nothing here touches the page
// as the module loads.
const BOOT: { name: string; run: () => void }[] = [
  { name: 'save', run: initSave },
  { name: 'language', run: () => setLang(settings.lang ?? defaultLang()) },
  { name: 'render', run: () => initRender(el<HTMLCanvasElement>('#gl')) },
  {
    name: 'field',
    run: () => {
      buildField();
      placeCamera();
    },
  },
  { name: 'start', run: initStart },
  { name: 'fullscreen', run: initFullscreen },
  {
    name: 'loop',
    run: () => {
      LOOP.mode = loopMode;
      LOOP.maxFps = isTouch ? FIELD_TUNE.touchMaxFps : 0;
      startLoop();
    },
  },
];

let booted = false;

export function boot() {
  if (booted) return;
  booted = true;
  for (const s of BOOT) s.run();
}

// The game in play, for the tests and the dev views.
export { currentGame } from './play.ts';
