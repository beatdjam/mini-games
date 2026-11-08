// Start-up: the table of steps, run in order. Tests call boot() as the page's main.ts does; a second call does nothing.
import { addSystem, defaultLang, el, isTouch, LOOP, setLang, startLoop } from '@engine/core/index.ts';
import { initRender } from '@engine/render/index.ts';
import { FIELD_TUNE } from '../data/tune.ts';
import { newGame, step, type GameModel } from '../logic/game.ts';
import { buildField, placeCamera } from '../view/field.ts';
import { initSave, settings } from './storage.ts';
import { loopMode } from './screen.ts';

// The game's state. It starts here and is read through currentGame().
const game: GameModel = newGame();

// The order matters: the save tells the language, the renderer needs the page, the field needs the renderer, the logic
// runs before the loop draws, and the loop draws what the field made. Only functions: nothing here touches the page as
// the module loads.
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
  // the logic advances one frame at a time before the loop draws it
  { name: 'logic', run: () => addSystem({ name: 'logic', update: dt => step(game, dt) }) },
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

// The game's state, for the tests and the dev views.
export const currentGame = (): GameModel => game;
