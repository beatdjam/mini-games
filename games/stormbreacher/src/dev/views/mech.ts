// The mech's look plans A, E, F, B, D (#view-mech): the M1 B beach with the mech on it, spun to look around. It never
// reads the game's state and never takes input. The buttons act out walking, boosting, jumping and firing for the
// body's motion (SB-130's third card).
import * as THREE from 'three';
import { addSystem, el } from '@engine/core/index.ts';
import { camera, cullChunks, renderer, scene } from '@engine/render/index.ts';
import { lookOf } from '../../data/looks.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { CORES, PARTS } from '../../data/mech.ts';
import { CAMERA_TUNE, MECH_TUNE, MOVE_TUNE } from '../../data/tune.ts';
import { moveTuneOf } from '../../logic/mechTune.ts';
import { applyPose, cameraPose } from '../../view/camera.ts';
import { applyLookTo } from '../../view/look.ts';
import { animateMech, buildMechVisual, countMechDraws, disposeMech } from '../../view/mechModel.ts';
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

// The motions the buttons act out. 'jump' lasts one hop; the others stay on until pressed again.
const ACTS = ['walk', 'boost', 'jump', 'fire'] as const;
type Act = (typeof ACTS)[number];
const ACT_LABELS: Record<Act, string> = { walk: '歩く', boost: 'ブースト', jump: '跳ぶ', fire: '撃つ' };
const KEY_ACT: Record<string, Act> = { w: 'walk', b: 'boost', j: 'jump', f: 'fire' };
const FIRE_INTERVAL = 0.125; // the time between the acted shots (s)

type ViewMode = 'spin' | 'behind';

interface MechState {
  pattern: PatternId;
  spin: boolean;
  view: ViewMode;
  on: Record<Act, boolean>; // 'jump' is on while a hop lasts
  hopT: number; // the time since the hop began (s)
  fireT: number; // the time left to the next acted shot (s)
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
    on: { walk: false, boost: false, jump: false, fire: false },
    hopT: 0,
    fireT: 0,
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

  const actButtons = new Map<Act, HTMLButtonElement>();
  for (const act of ACTS)
    actButtons.set(
      act,
      button(bar, ACT_LABELS[act], () => toggleAct(act)),
    );

  function toggleAct(act: Act) {
    if (act === 'jump') {
      if (state.on.jump) return;
      state.on.jump = true;
      state.hopT = 0;
    } else {
      state.on[act] = !state.on[act];
    }
    paintButtons();
  }

  function paintButtons() {
    for (const [id, node] of patternButtons) paintButton(node, id === state.pattern);
    for (const [act, node] of actButtons) paintButton(node, state.on[act]);
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
      acts: state.on,
      mech: { calls: draws.calls, triangles: draws.triangles, boxes: countBoxes(mech), weight },
      frame: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
    });
  };

  // Acts the motions out: the speeds are the pattern's own legs' (moveTuneOf), the hop is the jump's arc under gravity.
  const actMotion = (dt: number) => {
    const tune = moveTuneOf(PATTERNS[state.pattern].build, MOVE_TUNE);
    let landSpeed: number | null = null;
    if (state.on.jump) {
      state.hopT += dt;
      const height = tune.jump * state.hopT - (tune.gravity * state.hopT ** 2) / 2;
      if (height <= 0) {
        state.on.jump = false;
        landSpeed = tune.jump;
        paintButtons();
      }
      mech.position.y = Math.max(0, height);
    }
    let fired = false;
    state.fireT = Math.max(0, state.fireT - dt);
    if (state.on.fire && state.fireT === 0) {
      fired = true;
      state.fireT = FIRE_INTERVAL;
    }
    const speed = state.on.boost ? tune.boost : state.on.walk ? tune.walk : 0;
    animateMech(mech, { speed, grounded: !state.on.jump, boosting: state.on.boost, landSpeed, fired }, dt);
  };

  const update = (dt: number) => {
    actMotion(dt);
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
    const act = KEY_ACT[event.key];
    if (act !== undefined) toggleAct(act);
  });

  paintButtons();
}
