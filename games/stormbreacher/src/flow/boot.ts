// Start-up: the table of steps, run in order. Tests call boot() as the page's main.ts does; a second call does nothing.
import { defaultLang, el, isTouch, LOOP, setLang, startLoop } from '@engine/core/index.ts';
import { initRender } from '@engine/render/index.ts';
import { FIELD_TUNE } from '../data/tune.ts';
import { initSave, settings } from '../core/save.ts';
import { loopMode } from '../core/state.ts';
import { buildField, placeCamera } from '../world/field.ts';

// The order matters: the save tells the language, the renderer needs the page, the field needs the renderer, and the
// loop draws what the field made. Only functions: nothing here touches the page as the module loads.
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
  for (const step of BOOT) step.run();
}
