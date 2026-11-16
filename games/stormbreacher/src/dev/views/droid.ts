// One infantry droid, close up (#view-droid, SB-1745): the M1 beach with a single droid standing on it, seen from the
// front, the front quarter or the side, or turning. It never reads the game's state and never takes input. The readout
// gives the four draws and the triangles one droid costs, so the crowd's weight can be judged against the mech's.
import * as THREE from 'three';
import { addSystem, el, systems } from '@engine/core/index.ts';
import { camera, cullChunks, scene } from '@engine/render/index.ts';
import { DROID_TUNE } from '../../data/droids.ts';
import { lookOf } from '../../data/looks.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { applyLookTo } from '../../view/look.ts';
import { soldierMeshes } from '../../view/battle/parts.ts';
import { showDroid as showDroidInstances, writeDroid } from '../../view/droidPose.ts';
import { buildMapScene, MAP_FOG } from './mapView.ts';

declare global {
  interface Window {
    sbDroidReport?: () => string;
  }
}

const SYSTEM = 'sb-droid';
const DROID_VIEW_NAME = 'sb-droid-view';
const SPIN_RATE = 0.6; // rad/s while the droid turns

// The droid stands on the open beach east of the start, 4 m landward of the sea edge, so the sea and the sky are behind
// it in a picture and no prop crowds its silhouette.
export const DROID_VIEW_AT = {
  x: 40,
  z: M1B_HAND.bounds.maxZ - 4,
};

type Turn = 'front' | 'quarter' | 'side';
const TURNS: Record<Turn, { x: number; z: number }> = {
  front: { x: 0, z: -1.9 },
  quarter: { x: 1.3, z: -1.4 },
  side: { x: 2.0, z: 0 },
};

// The three poses the ticket's pictures need: the ready stance, the squat at the hold line, and the lying droid.
type DroidPose = 'stand' | 'wait' | 'fallen';

const BUTTON_STYLE =
  'pointer-events:auto;min-height:28px;padding:0 8px;border-radius:4px;font:inherit;font-size:12px;white-space:nowrap;' +
  'border:1px solid rgba(255,207,106,.55);background:rgba(10,17,25,.85);color:#ffcf6a';

let turn: Turn = 'front';
let spin = false;
let pose: DroidPose = 'stand';

function paramsOf(hash: string): URLSearchParams {
  const at = hash.indexOf('?');
  return new URLSearchParams(at >= 0 ? hash.slice(at + 1) : location.search);
}

function turnOf(params: URLSearchParams): Turn {
  const asked = params.get('turn');
  return asked === 'quarter' || asked === 'side' ? asked : 'front';
}

function poseOf(params: URLSearchParams): DroidPose {
  const asked = params.get('pose');
  return asked === 'wait' || asked === 'fallen' ? asked : 'stand';
}

function dropSystems(): void {
  for (let i = systems.length - 1; i >= 0; i--) if (systems[i].name === SYSTEM) systems.splice(i, 1);
}

function button(parent: HTMLElement, label: string, run: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.style.cssText = BUTTON_STYLE;
  node.addEventListener('click', run);
  parent.appendChild(node);
  return node;
}

export function showDroid(hash: string): void {
  el('#sbApp').hidden = true;
  const params = paramsOf(hash);
  turn = turnOf(params);
  spin = params.get('spin') !== '0';
  pose = poseOf(params);

  const { built } = buildMapScene(M1B_HAND);
  // the sortie's own look (M1), at full resolution so the droid's edges are clear against the sand
  applyLookTo({ ...lookOf('m1'), pixel: 1 }, built.group);

  const { x, z } = DROID_VIEW_AT;

  const group = new THREE.Group();
  group.name = DROID_VIEW_NAME;
  const meshes = soldierMeshes(1);
  writeDroid(meshes, 0, x, 0, z, 0, pose === 'fallen' ? 1 : 0, pose === 'wait' ? 1 : 0);
  showDroidInstances(meshes, 1);
  group.add(meshes.bodies, meshes.heads);
  scene.add(group);

  // the look point follows the pose: the squat's chest, or the middle of the droid lying toward +z
  const eyeY = pose === 'fallen' ? 1.5 : 1.0;
  const lookY = pose === 'fallen' ? 0.22 : pose === 'wait' ? 0.78 : 0.84;
  const lookZ = pose === 'fallen' ? z + 0.3 : z;
  const placeCamera = (): void => {
    const at = TURNS[turn];
    camera.position.set(x + at.x, eyeY, z + at.z);
    camera.lookAt(x, lookY, lookZ);
  };
  placeCamera();

  document.getElementById('sbDroidBar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'sbDroidBar';
  bar.style.cssText =
    'position:fixed;left:50%;top:0;transform:translateX(-50%);height:30px;z-index:8;' +
    'pointer-events:auto;display:flex;gap:4px';
  document.body.appendChild(bar);
  const buttons = new Map<Turn, HTMLButtonElement>();
  for (const name of ['front', 'quarter', 'side'] as const) {
    buttons.set(
      name,
      button(bar, name === 'front' ? '正面' : name === 'quarter' ? '斜め' : '横', () => {
        turn = name;
        spin = false;
        group.rotation.y = 0;
        placeCamera();
        paintButtons();
      }),
    );
  }
  const spinButton = button(bar, '回転', () => {
    spin = !spin;
    paintButtons();
  });

  const note = document.createElement('div');
  note.id = 'sbDroidNote';
  note.style.cssText =
    'position:fixed;left:8px;bottom:8px;padding:4px 6px;font:12px/1.4 monospace;color:#fff;' +
    'background:rgba(0,0,0,.45);white-space:pre;z-index:7';
  note.textContent =
    '歩兵ドロイド1体。?turn=front|quarter|side、?pose=stand|wait|fallen、?spin=0。' +
    'window.sbDroidReport() が1体の描く回数と三角形を返す。';
  document.body.appendChild(note);

  function paintButtons(): void {
    for (const [name, node] of buttons) setPressed(node, name === turn);
    setPressed(spinButton, spin);
  }

  function setPressed(node: HTMLButtonElement, on: boolean): void {
    node.setAttribute('aria-pressed', String(on));
    node.style.background = on ? 'rgba(255,207,106,.85)' : 'rgba(10,17,25,.85)';
    node.style.color = on ? '#10161d' : '#ffcf6a';
  }
  paintButtons();

  window.sbDroidReport = () => {
    let calls = 0;
    let triangles = 0;
    group.traverse(object => {
      const mesh = object as THREE.InstancedMesh;
      if (mesh.isInstancedMesh !== true) return;
      calls += Math.max(1, mesh.geometry.groups.length);
      const index = mesh.geometry.getIndex();
      const corners = index === null ? mesh.geometry.getAttribute('position').count : index.count;
      triangles += corners / 3;
    });
    return JSON.stringify({ turn, spin, pose, calls, triangles, height: DROID_TUNE.height });
  };

  dropSystems();
  const update = (dt: number): void => {
    if (spin) group.rotation.y += SPIN_RATE * dt;
    cullChunks(built.chunks, built.group, camera, MAP_FOG.far);
  };
  addSystem({ name: SYSTEM, update });
  update(0);
}
