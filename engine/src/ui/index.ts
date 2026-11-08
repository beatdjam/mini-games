// engine/ui: the public entry for the ui folder. Games import from here, not from the files inside.
// The names a game may use are re-exported below; types come from the module that owns them.

export { onDataClick, rowsHTML } from './dom.ts';
export type { DataClick } from './dom.ts';
export { createFloorMap3D } from './floormap3d.ts';
export type { FloorMap3D, FloorMapMarker, FloorMapVolume } from './floormap3d.ts';
export { createHitDirs } from './hitdir.ts';
export { createHitMark } from './hitmark.ts';
export {
  INPUT,
  exitLock,
  fire2Held,
  fireHeld,
  initInput,
  joy,
  locked,
  mouseFire,
  releaseInputs,
  requestLock,
  setFireHeld,
  tapBtn,
} from './input.ts';
export {
  KEYS_PER_ACTION,
  actionDown,
  actionOf,
  bindKey,
  changedBindings,
  defineActions,
  exportBindings,
  importBindings,
  keyLabel,
  keysOf,
  resetBindings,
} from './keymap.ts';
export { drawTileMap } from './minimap.ts';
export type { MapMarker, TileStyle } from './minimap.ts';
export { SETTINGS, fullscreenSetting, languageSetting, renderSettings } from './settings.ts';
export type { SettingItem } from './settings.ts';
export { canCopyImage, canShareFile, copyImage, drawGrid, fitText, openXPost, saveFile, shareNative } from './share.ts';
export { TOUCH_LAYOUT, applyLayout, buttonLayout, initTouchLayout, openLayoutEditor } from './touchlayout.ts';
export type { ButtonPlace } from './touchlayout.ts';
export { banner, enterFs, fsSupported, isFullscreen, isStandalone, keepAwake, toast, toggleFs } from './ui.ts';
