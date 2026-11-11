// The look a mission is drawn with: the resolution, the colour filter, the fog, the sky, the lights and the ground's
// sand. #view-fx, #view-hud and the sortie all call these, so the same steps are written once.
import * as THREE from 'three';
import { clamp } from '@engine/core/index.ts';
import { renderer, scene } from '@engine/render/index.ts';
import type { LookTune } from '../data/looks.ts';
import { TILE_COLOR } from './outdoor.ts';
import { MAP_FOG } from './world.ts';

let keptPixelRatio: number | null = null;

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
  if (scene.background instanceof THREE.Color) scene.background.setHex(look.skyColor);
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
  mesh: THREE.InstancedMesh;
  scales: Float32Array; // each tile's light/dark scale, kept from the build
}

// The map's tile meshes (the build may have split them into chunks): their colour is per instance.
export function collectGroundTiles(root: THREE.Object3D): GroundTint[] {
  const tiles: GroundTint[] = [];
  const base = new THREE.Color(TILE_COLOR).r;
  root.traverse(object => {
    if (!(object instanceof THREE.InstancedMesh) || object.name !== 'tile' || !object.instanceColor) return;
    const colors = object.instanceColor.array;
    const scales = new Float32Array(object.count);
    for (let i = 0; i < object.count; i++) scales[i] = base > 0 ? Number(colors[i * 3]) / base : 1;
    tiles.push({ mesh: object, scales });
  });
  return tiles;
}

export function applyGroundColor(look: LookTune, tiles: readonly GroundTint[]): void {
  const base = new THREE.Color(look.groundColor);
  const color = new THREE.Color();
  for (const { mesh, scales } of tiles) {
    for (let i = 0; i < scales.length; i++) {
      color.copy(base).multiplyScalar(scales[i]);
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

// The whole look over a built map: the canvas, the scene's lights and the ground's tiles. The sortie and #view-hud use
// this; #view-fx needs its lights collected once, so it calls the parts itself.
export function applyLookTo(look: LookTune, root: THREE.Object3D): void {
  applyLook(look, basePixelRatio());
  applyLights(look, collectLights());
  applyGroundColor(look, collectGroundTiles(root));
}
