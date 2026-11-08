// engine/core: the public entry for the core folder. Games import from here, not from the files inside.
// The names a game may use are re-exported below; types come from the module that owns them.

export { ANALYTICS, TRACK_LOG, track } from './analytics.ts';
export { showFps } from './dev.ts';
export { FEEDBACK, FEEDBACK_FORM, feedbackReady, openFeedback } from './feedback.ts';
export { LANG, applyStaticText, defaultLang, fillData, lang, setI18nHook, setLang, t } from './i18n.ts';
export { withLang } from './langslots.ts';
export { LOOP, addSystem, runSystems, startLoop, stopFrame, systems } from './loop.ts';
export {
  clearStore,
  decodeStore,
  encodeStore,
  loadStore,
  mergeDefaults,
  packBits,
  prefGet,
  prefSet,
  saveStore,
  unpackBits,
} from './store.ts';
export {
  clamp,
  createRng,
  distXZ,
  el,
  isTouch,
  pct,
  pick,
  rand,
  randi,
  shuffle,
  turnToward,
  wrapAngle,
  yawToward,
} from './util.ts';
export type { Rng } from './util.ts';
export { WORLD, clearWorld, groupOf, query, spawn, sweepWorld, worldGroup } from './world.ts';
export type { WorldObject } from './world.ts';
