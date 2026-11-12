// The mech's look plans A, E, F, B, D (#view-mech): the M1 B beach with the mech on it, spun to look around. It never
// reads the game's state and never takes input.
import * as THREE from 'three';
import { addSystem, el } from '@engine/core/index.ts';
import { camera, cullChunks, renderer, scene } from '@engine/render/index.ts';
import { lookOf } from '../../data/looks.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { CORES, PARTS } from '../../data/mech.ts';
import { CAMERA_TUNE, MECH_TUNE } from '../../data/tune.ts';
import { applyPose, cameraPose } from '../../view/camera.ts';
import { applyLookTo } from '../../view/look.ts';
import { buildMechVisual, countMechDraws, disposeMech } from '../../view/mechModel.ts';
import { PATTERN_IDS, PATTERN_LABELS, PATTERNS, type PatternId } from '../mech/patterns.ts';
import { buildMapScene, MAP_FOG } from './mapView.ts';

declare global {
  interface Window {
    sbMechReport?: () => string;
  }
}

const BUTTON_TEXT = '#ffcf6a';
const BUTTON_BACK = 'rgba(10,17,25,.85)';
const BUTTON_ON_TEXT = '#10161d';
const BUTTON_ON_BACK = 'rgba(255,207,106,.85)';
const BUTTON =
  'pointer-events:auto;min-height:30px;padding:0 8px;border-radius:4px;font:inherit;font-size:12px;white-space:nowrap;' +
  `border:1px solid rgba(255,207,106,.55);background:${BUTTON_BACK};color:${BUTTON_TEXT}`;

// How far inside the map's front edge the mech stands (m); showMap's MECH_MARGIN is not exported.
const MECH_MARGIN = 4;

// The spin's speed (rad/s; 仮).
const SPIN_RATE = 0.6;

const KEY_PATTERN: Record<string, PatternId> = { '1': 'a', '2': 'e', '3': 'f', '4': 'b', '5': 'd' };

type ViewMode = 'spin' | 'behind';

interface MechState {
  pattern: PatternId;
  spin: boolean;
  view: ViewMode;
}

function paintButton(node: HTMLButtonElement, on: boolean) {
  node.setAttribute('aria-pressed', String(on));
  node.style.background = on ? BUTTON_ON_BACK : BUTTON_BACK;
  node.style.color = on ? BUTTON_ON_TEXT : BUTTON_TEXT;
}

function button(parent: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.style.cssText = BUTTON;
  node.addEventListener('click', onClick);
  parent.appendChild(node);
  return node;
}

function stateOf(params: URLSearchParams): MechState {
  const asked = params.get('pattern');
  const pattern = asked !== null && (PATTERN_IDS as readonly string[]).includes(asked) ? (asked as PatternId) : 'a';
  return {
    pattern,
    spin: params.get('spin') !== '0',
    view: params.get('view') === 'behind' ? 'behind' : 'spin',
  };
}

// The boxes the mech draws now, after the mirrors and with the weapons (one instance is one box).
function countBoxes(root: THREE.Object3D): number {
  let boxes = 0;
  root.traverse(object => {
    const mesh = object as THREE.InstancedMesh;
    if (mesh.isInstancedMesh === true) boxes += mesh.count;
  });
  return boxes;
}

export function showMech(_hash: string) {
  el('#sbApp').hidden = true;

  const { built } = buildMapScene(M1B_HAND);
  // the sortie's own look (M1), so a pale palette is judged against the sand it will stand on; full resolution, to
  // see the boxes' edges
  applyLookTo({ ...lookOf('m1'), pixel: 1 }, built.group);

  const x = (M1B_HAND.bounds.minX + M1B_HAND.bounds.maxX) / 2;
  const z = M1B_HAND.bounds.maxZ - MECH_MARGIN;
  const height = MECH_TUNE.height;
  const state = stateOf(new URLSearchParams(location.search));

  let mech = buildMechVisual(PATTERNS[state.pattern], height);
  mech.position.set(x, 0, z);
  scene.add(mech);

  document.getElementById('sbMechBar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'sbMechBar';
  bar.style.cssText =
    'position:fixed;left:50%;top:0;transform:translateX(-50%);height:28px;z-index:8;' +
    'pointer-events:auto;display:flex;gap:4px';
  document.body.appendChild(bar);

  const patternButtons = new Map<PatternId, HTMLButtonElement>();
  for (const id of PATTERN_IDS)
    patternButtons.set(
      id,
      button(bar, `${id.toUpperCase()} ${PATTERN_LABELS[id]}`, () => setPattern(id)),
    );
  const spinButton = button(bar, '回転', () => {
    state.spin = !state.spin;
    paintButtons();
  });
  const viewButton = button(bar, '後ろから', () => {
    state.view = state.view === 'spin' ? 'behind' : 'spin';
    paintButtons();
  });

  function paintButtons() {
    for (const [id, node] of patternButtons) paintButton(node, id === state.pattern);
    paintButton(spinButton, state.spin);
    paintButton(viewButton, state.view === 'behind');
  }

  function setPattern(next: PatternId) {
    if (next === state.pattern) {
      paintButtons();
      return;
    }
    state.pattern = next;
    const position = mech.position.clone();
    const yaw = mech.rotation.y;
    scene.remove(mech);
    disposeMech(mech);
    mech = buildMechVisual(PATTERNS[next], height);
    mech.position.copy(position);
    mech.rotation.y = yaw;
    scene.add(mech);
    paintButtons();
    const query = new URLSearchParams(location.search);
    query.set('pattern', next);
    history.replaceState(null, '', `${location.pathname}?${query.toString()}${location.hash}`);
  }

  window.sbMechReport = () => {
    const draws = countMechDraws(mech);
    const build = PATTERNS[state.pattern].build;
    const weight =
      CORES[build.core].weight +
      PARTS.arms[build.arms].weight +
      PARTS.legs[build.legs].weight +
      PARTS.back[build.back].weight +
      PARTS.fcs[build.fcs].weight;
    return JSON.stringify({
      pattern: state.pattern,
      spin: state.spin,
      view: state.view,
      mech: { calls: draws.calls, triangles: draws.triangles, boxes: countBoxes(mech), weight },
      frame: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
    });
  };

  const update = (dt: number) => {
    if (state.view === 'behind') {
      mech.rotation.y = 0;
      applyPose(camera, cameraPose({ x, y: 0, z, yaw: 0 }, 0, CAMERA_TUNE, []), CAMERA_TUNE.fov);
    } else {
      if (state.spin) mech.rotation.y += SPIN_RATE * dt;
      camera.position.set(x + height, height * 0.9, z + height * 2.4);
      camera.lookAt(x, height * 0.5, z);
    }
    cullChunks(built.chunks, built.group, camera, MAP_FOG.far);
  };
  addSystem({ name: 'sb-mech', update });
  update(0);

  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const next = KEY_PATTERN[event.key];
    if (next !== undefined) setPattern(next);
  });

  paintButtons();
}
