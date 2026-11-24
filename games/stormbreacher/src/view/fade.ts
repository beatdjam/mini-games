// The low props that fade instead of pulling the camera in (SB-2048). A blocking prop shorter than CAMERA_TUNE.wallHeight is
// no wall for the camera: when it stands between the camera and the mech it turns see-through, and the camera stays where
// it was. Big walls keep pulling the camera in (camera.ts), so a wall's far side is still hidden.
//
// How it is drawn: a prop is one copy in an instanced mesh with its kind's other copies, and its opacity cannot change in
// place. While it fades, its copy is moved to a see-through twin of that mesh (one per kind, a few copies wide, with an
// opacity for every copy) and the opaque copy is shrunk to nothing; when it is solid again the copy goes back. A kind that
// is not fading draws nothing extra, and one that is costs one draw, however many of its props fade.
import * as THREE from 'three';
import { clamp } from '@engine/core/index.ts';
import { PROP_SIZE } from '../data/props.ts';
import type { CameraTune } from '../data/tuneTypes.ts';
import type { MapDef, Prop, PropKind } from '../data/types.ts';
import { blockingPropIndexes } from '../logic/mapShapes.ts';
import { findSlot, type PropSlot } from './outdoor.ts';

const GHOST_COPIES = 12; // how many props of one kind may be see-through at once
const NOTHING = new THREE.Matrix4().makeScale(0, 0, 0);

// A matrix shrunk to nothing where it stands. The place stays, so findSlot still finds the copy by it.
function shrunk(matrix: THREE.Matrix4): THREE.Matrix4 {
  const out = matrix.clone();
  for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) out.elements[i] = 0;
  return out;
}

// Whether a blocking prop is a wall the camera stays in front of: the table's height with the prop's own scale.
export function isCameraWall(prop: Prop, tune: Pick<CameraTune, 'wallHeight'>): boolean {
  return PROP_SIZE[prop.kind].h * prop.scale >= tune.wallHeight;
}

// For each of cameraBlockers(map)'s rects, whether it belongs to a low prop (fades, no wall). The props' rects come first, in
// blockingPropIndexes' order; the targets and the crafts after them are never low.
export function lowRects(map: MapDef, rectCount: number, tune: Pick<CameraTune, 'wallHeight'>): boolean[] {
  const owners = blockingPropIndexes(map);
  return Array.from({ length: rectCount }, (_, i) => i < owners.length && !isCameraWall(map.props[owners[i]], tune));
}

// One kind's see-through twin.
interface Ghost {
  mesh: THREE.InstancedMesh;
  fade: THREE.InstancedBufferAttribute; // each copy's opacity (0-1)
  free: number[]; // the copies not in use
}

// One low prop that may fade.
export interface FadeProp {
  prop: number; // its place in map.props
  item: Prop;
  box: THREE.Box3; // where it stands (the box the camera used to keep out of)
  amount: number; // 0 solid .. 1 faded all the way
  slot: PropSlot | null; // its copy in the instanced mesh, found the first time it fades
  saved: THREE.Matrix4 | null; // the copy's matrix while it is moved to the twin
  copy: number; // its place in the twin while it is there, else -1
}

export interface FadeSet {
  props: FadeProp[];
  group: THREE.Group | null; // the group the props are drawn in; the twins go into it
  slots: ReadonlyMap<Prop, PropSlot>; // the slots the build already found (breakable props)
  ghosts: Map<PropKind, Ghost>;
}

export function noFade(): FadeSet {
  return { props: [], group: null, slots: new Map(), ghosts: new Map() };
}

export function newFadeSet(group: THREE.Group, slots: ReadonlyMap<Prop, PropSlot>): FadeSet {
  return { props: [], group, slots, ghosts: new Map() };
}

export function addFadeProp(set: FadeSet, prop: number, item: Prop, box: THREE.Box3): void {
  set.props.push({ prop, item, box, amount: 0, slot: null, saved: null, copy: -1 });
}

// Whether the segment from `from` to `to` passes through the box widened by `pad` on x and z. A segment that starts inside
// the box (a camera that has gone into the prop) counts.
export function segmentThroughBox(from: THREE.Vector3, to: THREE.Vector3, box: THREE.Box3, pad: number): boolean {
  let near = 0;
  let far = 1;
  const axes = [
    [from.x, to.x, box.min.x - pad, box.max.x + pad],
    [from.y, to.y, box.min.y, box.max.y],
    [from.z, to.z, box.min.z - pad, box.max.z + pad],
  ] as const;
  for (const [a, b, low, high] of axes) {
    const d = b - a;
    if (Math.abs(d) < 1e-9) {
      if (a < low || a > high) return false;
      continue;
    }
    let t0 = (low - a) / d;
    let t1 = (high - a) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    if (near > far) return false;
  }
  return true;
}

// The twin of a mesh: the same shape and material look, plus an opacity for every copy.
function ghostFor(set: FadeSet, kind: PropKind, source: THREE.InstancedMesh): Ghost | null {
  const kept = set.ghosts.get(kind);
  if (kept) return kept;
  if (set.group === null || !(source.material instanceof THREE.Material) || Array.isArray(source.material)) return null;
  const material = source.material.clone();
  material.transparent = true;
  material.depthWrite = false;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float instanceFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = instanceFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
  };
  const geometry = source.geometry.clone();
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(GHOST_COPIES), 1);
  geometry.setAttribute('instanceFade', fade);
  const mesh = new THREE.InstancedMesh(geometry, material, GHOST_COPIES);
  mesh.name = `${kind}-fade`;
  // the copies stand anywhere on the map, so the one bounding sphere of the shape would cull them
  mesh.frustumCulled = false;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GHOST_COPIES * 3).fill(1), 3);
  for (let i = 0; i < GHOST_COPIES; i++) mesh.setMatrixAt(i, NOTHING);
  mesh.visible = false;
  set.group.add(mesh);
  const ghost: Ghost = { mesh, fade, free: Array.from({ length: GHOST_COPIES }, (_, i) => GHOST_COPIES - 1 - i) };
  set.ghosts.set(kind, ghost);
  return ghost;
}

function slotOf(set: FadeSet, fade: FadeProp): PropSlot | null {
  if (fade.slot) return fade.slot;
  fade.slot = set.slots.get(fade.item) ?? (set.group ? findSlot(set.group, fade.item) : null);
  return fade.slot;
}

// Moves the prop's copy to the twin. false when it cannot (no copy found, or the twin is full).
function takeCopy(set: FadeSet, fade: FadeProp): boolean {
  const slot = slotOf(set, fade);
  if (!slot) return false;
  const ghost = ghostFor(set, fade.item.kind, slot.mesh);
  const copy = ghost?.free.pop();
  if (!ghost || copy === undefined) return false;
  const matrix = new THREE.Matrix4();
  slot.mesh.getMatrixAt(slot.index, matrix);
  fade.saved = matrix.clone();
  // the instanced meshes stand at the origin with the group, so a copy's matrix is its place in the world
  ghost.mesh.setMatrixAt(copy, matrix);
  const colors = slot.mesh.instanceColor;
  if (colors) {
    const to = ghost.mesh.instanceColor;
    if (to) {
      to.setXYZ(copy, colors.getX(slot.index), colors.getY(slot.index), colors.getZ(slot.index));
      to.needsUpdate = true;
    }
  }
  ghost.mesh.instanceMatrix.needsUpdate = true;
  slot.mesh.setMatrixAt(slot.index, shrunk(matrix));
  slot.mesh.instanceMatrix.needsUpdate = true;
  fade.copy = copy;
  return true;
}

// Puts the copy back where it was and frees its place in the twin.
function giveCopy(set: FadeSet, fade: FadeProp): void {
  if (fade.copy < 0 || !fade.slot || !fade.saved) return;
  const ghost = set.ghosts.get(fade.item.kind);
  fade.slot.mesh.setMatrixAt(fade.slot.index, fade.saved);
  fade.slot.mesh.instanceMatrix.needsUpdate = true;
  if (ghost) {
    ghost.mesh.setMatrixAt(fade.copy, NOTHING);
    ghost.mesh.instanceMatrix.needsUpdate = true;
    ghost.fade.setX(fade.copy, 0);
    ghost.fade.needsUpdate = true;
    ghost.free.push(fade.copy);
    ghost.mesh.visible = ghost.free.length < GHOST_COPIES;
  }
  fade.copy = -1;
  fade.saved = null;
}

// A prop that is gone (broken): its copy goes back where it was, so the break lowers the right matrix, and it fades no more.
export function dropFade(set: FadeSet, prop: number): void {
  for (let i = set.props.length - 1; i >= 0; i--) {
    const fade = set.props[i];
    if (fade.prop !== prop) continue;
    giveCopy(set, fade);
    set.props.splice(i, 1);
  }
}

// One frame: each prop between `from` (the camera) and `to` (the mech's chest) moves toward faded, each other one toward
// solid, at the tune's speeds.
export function fadeStep(
  set: FadeSet,
  from: THREE.Vector3,
  to: THREE.Vector3,
  dt: number,
  tune: Pick<CameraTune, 'fadeOpacity' | 'fadeIn' | 'fadeOut' | 'fadePad'>,
): void {
  const inStep = tune.fadeIn <= 0 ? 1 : dt / tune.fadeIn;
  const outStep = tune.fadeOut <= 0 ? 1 : dt / tune.fadeOut;
  for (const fade of set.props) {
    const hides = segmentThroughBox(from, to, fade.box, tune.fadePad);
    if (!hides && fade.amount === 0) continue;
    const amount = clamp(fade.amount + (hides ? inStep : -outStep), 0, 1);
    if (fade.copy < 0 && amount > 0 && !takeCopy(set, fade)) continue;
    fade.amount = amount;
    if (fade.copy < 0) continue;
    if (amount === 0) {
      giveCopy(set, fade);
      continue;
    }
    const ghost = set.ghosts.get(fade.item.kind);
    if (!ghost) continue;
    ghost.fade.setX(fade.copy, 1 + (tune.fadeOpacity - 1) * amount);
    ghost.fade.needsUpdate = true;
    ghost.mesh.visible = true;
  }
}

// The opacity a prop is drawn at now (1 solid), for the tests.
export function fadeOpacityOf(set: FadeSet, fade: FadeProp): number {
  if (fade.copy < 0) return 1;
  return set.ghosts.get(fade.item.kind)?.fade.getX(fade.copy) ?? 1;
}
