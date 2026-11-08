// engine/trailer: the public entry for the trailer folder. Games import from here, not from the files inside.
// The names a game may use are re-exported below; types come from the module that owns them.

export { runTrailer } from './film.ts';
export type { TrailerGame } from './film.ts';
export { FILM_SETTINGS, parseScript, setting } from './script.ts';
export type { Script, ScriptLine, ScriptScene } from './script.ts';
