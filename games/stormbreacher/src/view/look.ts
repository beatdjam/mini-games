// The look a mission is drawn with: the resolution, the colour filter, the fog, the sky, the lights and the ground's
// sand. #view-fx, #view-hud and the sortie all call these, so the same steps are written once.
import * as THREE from 'three';
import { clamp } from '@engine/core/index.ts';
import { renderer, scene } from '@engine/render/index.ts';
import { TONE, type LookTune } from '../data/looks.ts';
import { setSky } from './sky.ts';
import { MAP_FOG } from './world.ts';

let keptPixelRatio: number | null = null;

// The engine's renderer is shared with the other games, so the beach's tone map is set here, after initRender, and not in
// the engine. ACES keeps the bright sand and surf under the cloud from clipping to white.
export function applyToneBase(): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE.exposure;
}

// The renderer's resolution before any look lowered it. Kept from the first call, so a second sortie on one page does
// not take the lowered value for the original.
export function basePixelRatio(): number {
  if (keptPixelRatio === null) keptPixelRatio = renderer.getPixelRatio();
  return keptPixelRatio;
}

// The resolution, the colour and the fog: the only post-process the views have.
export function applyLook(look: LookTune, basePixel: number): void {
  renderer.setPixelRatio(Math.max(0.1, basePixel * look.pixel));
  const style = renderer.domElement.style;
  style.imageRendering = look.pixel < 0.999 ? 'pixelated' : 'auto';
  style.filter =
    look.saturate === 1 && look.contrast === 1 && look.sepia === 0
      ? ''
      : `saturate(${look.saturate}) contrast(${look.contrast}) sepia(${look.sepia})`;
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.setHex(look.fogColor);
    scene.fog.near = MAP_FOG.near * (1 - clamp(look.haze, 0, 0.9));
    scene.fog.far = MAP_FOG.far;
  }
  // the sky's lower edge is the fog's colour, so the two meet at the horizon
  setSky(look.skyColor, look.fogColor);
}

export interface LightBase {
  light: THREE.Light;
  intensity: number; // what it had before a look was turned on
}

// A light's strength before a look was turned on. Kept on the light the first time, so a sortie that starts again does
// not take an already dimmed value for the original.
function baseIntensity(light: THREE.Light): number {
  const kept = light.userData.sbBaseIntensity;
  if (typeof kept === 'number') return kept;
  light.userData.sbBaseIntensity = light.intensity;
  return light.intensity;
}

// Every light in the scene, with its starting strength.
export function collectLights(): LightBase[] {
  const lights: LightBase[] = [];
  scene.traverse(object => {
    if (object instanceof THREE.Light) lights.push({ light: object, intensity: baseIntensity(object) });
  });
  return lights;
}

export function applyLights(look: LookTune, lights: readonly LightBase[]): void {
  for (const { light, intensity } of lights) {
    const sun = light instanceof THREE.DirectionalLight ? look.sun : 1;
    light.intensity = intensity * look.light * sun;
  }
}

export interface GroundTint {
  material: THREE.MeshLambertMaterial; // the one ground plane's material
}

// The map's ground material (the ground is one plane, named 'tile').
export function collectGroundTiles(root: THREE.Object3D): GroundTint[] {
  const tiles: GroundTint[] = [];
  root.traverse(object => {
    if (
      object instanceof THREE.Mesh &&
      object.name === 'tile' &&
      object.material instanceof THREE.MeshLambertMaterial
    ) {
      tiles.push({ material: object.material });
    }
  });
  return tiles;
}

export function applyGroundColor(look: LookTune, tiles: readonly GroundTint[]): void {
  for (const { material } of tiles) material.color.setHex(look.groundColor);
}

// The whole look over a built map: the canvas, the scene's lights and the ground. The sortie and #view-hud use this;
// #view-fx needs its lights collected once, so it calls the parts itself.
export function applyLookTo(look: LookTune, root: THREE.Object3D): void {
  applyLook(look, basePixelRatio());
  applyLights(look, collectLights());
  applyGroundColor(look, collectGroundTiles(root));
}
