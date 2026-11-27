// Layout D's ring on the ground under the mech (SB-2155): the left half is the armour, the right half the boost, seen
// from the overview camera. One RingGeometry with a colour per vertex, so the halves are one draw; the vertices are told
// once which half they are in, from QUARTER_TUNE.azimuth alone, so the mech's own yaw never turns the ring. The ring
// reads the HudModel and never writes it.
import * as THREE from 'three';
import { scene } from '@engine/render/index.ts';
import { HUD_COLOR } from '../data/colors.ts';
import { HUD_RING_TUNE, QUARTER_TUNE } from '../data/tune.ts';
import type { HudModel } from '../logic/hud.ts';
import type { GameModel } from '../logic/game.ts';
import { armorColor, armorStage, boostOpacity, groundHalves, hitGlow, type ArmorStage } from './hudRing.ts';

export const MECH_RING_MESH_NAME = 'sb-mech-ring';

export interface MechRingView {
  mesh: THREE.Mesh;
  sides: Uint8Array; // 1 where the vertex is in the armour (screen-left) half, 0 in the boost half
  glowFrom: number | null; // the game time of the last hit, null when the armour is not lit
  last: { stage: ArmorStage; boost: number; glow: number } | null; // the colours written last
}

const armorColors: Record<ArmorStage, THREE.Color> = {
  high: new THREE.Color(armorColor('high')),
  mid: new THREE.Color(armorColor('mid')),
  low: new THREE.Color(armorColor('low')),
};
const boostColor = new THREE.Color(HUD_COLOR.bar);

// Builds the ring into the scene, hidden until layout D is drawn.
export function buildMechRing(): MechRingView {
  const tune = HUD_RING_TUNE.ground;
  const geometry = new THREE.RingGeometry(
    tune.radius - tune.thickness / 2,
    tune.radius + tune.thickness / 2,
    tune.segments,
    1,
  );
  // RingGeometry is in the xy plane; this puts it on the ground with its own theta 0 toward +x and growing toward -z.
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const sides = new Uint8Array(position.count);
  const left = groundHalves(QUARTER_TUNE.azimuth).left;
  for (let i = 0; i < position.count; i++) {
    const theta = Math.atan2(-position.getZ(i), position.getX(i));
    sides[i] = Math.cos(theta - left) >= 0 ? 1 : 0;
  }
  // MeshBasicMaterial takes a four-part vertex colour as rgb plus alpha (three r128's vertexAlphas), so the two halves
  // keep their own opacity in one mesh.
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(position.count * 4), 4));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = MECH_RING_MESH_NAME;
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, sides, glowFrom: null, last: null };
}

// Puts the ring at the mech's feet and writes the armour's shade and flash, and the boost's opacity, into its vertices.
export function drawMechRing(view: MechRingView, game: GameModel, model: HudModel, now: number): void {
  const tune = HUD_RING_TUNE.ground;
  view.mesh.position.set(game.mech.x, game.mech.y + tune.lift, game.mech.z);
  const glow = view.glowFrom === null ? 0 : hitGlow(now - view.glowFrom, tune.glowSec);
  if (view.glowFrom !== null && glow <= 0) view.glowFrom = null;
  const stage = armorStage(model.armor, tune.armorMid, tune.armorLow);
  const boost = boostOpacity(model.boost, tune.boostFullOpacity, tune.boostLowOpacity);
  if (view.last !== null && view.last.stage === stage && view.last.boost === boost && view.last.glow === glow) {
    return;
  }
  view.last = { stage, boost, glow };

  const armorAlpha = tune.armorOpacity + (1 - tune.armorOpacity) * glow;
  const armor = armorColors[stage];
  const attribute = view.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
  const colors = attribute.array as Float32Array;
  for (let i = 0; i < view.sides.length; i++) {
    const color = view.sides[i] === 1 ? armor : boostColor;
    const offset = i * 4;
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
    colors[offset + 3] = view.sides[i] === 1 ? armorAlpha : boost;
  }
  attribute.needsUpdate = true;
}

// Takes the ring out of the scene and frees it.
export function removeMechRing(view: MechRingView): void {
  scene.remove(view.mesh);
  view.mesh.geometry.dispose();
  (view.mesh.material as THREE.Material).dispose();
}
