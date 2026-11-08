// engine/render: the public entry for the render folder. Games import from here, not from the files inside.
// The names a game may use are re-exported below; types come from the module that owns them.

export { batcher } from './batch.ts';
export type { Batch } from './batch.ts';
export { chunkInstances, cullChunks } from './chunks.ts';
export type { Chunk } from './chunks.ts';
export { hideInFog } from './fogcull.ts';
export { FX, burst, clearFx, fireball, parts } from './fx.ts';
export { mergeParts } from './merge.ts';
export { mergeFlat } from './mergeflat.ts';
export { block, canvasTex, grain, grime, oval, paintTex, poolTex, smudge, soil, stripes, words } from './paint.ts';
export type { Paint } from './paint.ts';
export { at, ballGeo, boxGeo, cylGeo } from './parts.ts';
export {
  UP,
  V3,
  basicMat,
  buildViewmodel,
  camera,
  drawStats,
  dynGroup,
  gun,
  initRender,
  lineMat,
  renderer,
  resize,
  scene,
  shared,
  textSprite,
} from './render.ts';
export type { ViewmodelDef } from './render.ts';
export { disposeTree } from '../core/world.ts';
export {
  addCeiling,
  addDecks,
  addFloor,
  addRamps,
  addSunkSides,
  addTilePlanes,
  addWalls,
  touchesFloor,
  wallTiles,
} from './tilemesh.ts';
export { Backdrop, buildBackdrop } from './windowBackdrop.ts';
export { buildOutsideBlocks, buildOutsideCards } from './windowOutside.ts';
export type { OutsideBlock, OutsideLook, OutsideCard } from './windowOutside.ts';
export {
  WINDOW_ORDER,
  buildWindowFrames,
  buildWindowGlass,
  buildWindowPanes,
  keepOutOfPanes,
  seenThrough,
  windowGlassTex,
} from './windowPanes.ts';
export type { WindowFace } from './windowPanes.ts';
