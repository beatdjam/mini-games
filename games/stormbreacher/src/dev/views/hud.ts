// The HUD mock's view (#view-hud, SB-160): the M1 B beach drawn once with a fixed camera, a mech proxy standing on
// it and the three layout plans' sample HUD over it. It never reads the game's state and never takes input.
import * as THREE from 'three';
import { addSystem, el } from '@engine/core/index.ts';
import { camera, cullChunks, renderer, scene } from '@engine/render/index.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { CAMERA_TUNE, FX_TUNE, MECH_TUNE } from '../../data/tune.ts';
import { applyPose, cameraPose } from '../../view/camera.ts';
import { buildHud } from '../hud/build.ts';
import { PLAN_IDS, PLAN_LABELS, type PlanId } from '../hud/plans.ts';
import { buildMechProxy } from '../mechProxy.ts';
import { TILE_COLOR } from '../outdoor/build.ts';
import { buildMapScene, MAP_FOG } from './mapView.ts';

declare global {
  interface Window {
    sbHudReport?: () => string;
  }
}

const BUTTON_TEXT = '#ffcf6a';
const BUTTON_BACK = 'rgba(10,17,25,.85)';
const BUTTON_ON_TEXT = '#10161d';
const BUTTON_ON_BACK = 'rgba(255,207,106,.85)';
const BUTTON =
  'pointer-events:auto;min-height:30px;padding:0 8px;border-radius:4px;font:inherit;font-size:12px;' +
  `border:1px solid rgba(255,207,106,.55);background:${BUTTON_BACK};color:${BUTTON_TEXT}`;

// How far inside the map's front edge the mech stands (m); showMap's MECH_MARGIN is not exported.
const MECH_MARGIN = 4;

const KEY_PLAN: Record<string, PlanId> = { '1': 'a', '2': 'b', '3': 'c' };

function paintButton(node: HTMLButtonElement, on: boolean) {
  node.setAttribute('aria-pressed', String(on));
  node.style.background = on ? BUTTON_ON_BACK : BUTTON_BACK;
  node.style.color = on ? BUTTON_ON_TEXT : BUTTON_TEXT;
}

// #view-fx's default look (FX_TUNE, its middle strength) without its battle: every light dimmed, the canvas's colour
// filter, the fog and the sky, and the sand of the ground tiles. The low resolution is left out. fx.ts keeps its own
// helpers private, so the same steps are repeated here on the same table.
function applyFxLook() {
  scene.traverse(object => {
    if (!(object instanceof THREE.Light)) return;
    const sun = object instanceof THREE.DirectionalLight ? FX_TUNE.sun : 1;
    object.intensity *= FX_TUNE.light * sun;
  });
  renderer.domElement.style.filter = `saturate(${FX_TUNE.saturate}) contrast(${FX_TUNE.contrast}) sepia(${FX_TUNE.sepia})`;
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.setHex(FX_TUNE.fogColor);
    scene.fog.near = MAP_FOG.near * (1 - FX_TUNE.haze);
  }
  if (scene.background instanceof THREE.Color) scene.background.setHex(FX_TUNE.skyColor);

  // each tile keeps its light/dark scale against the sand it was built in
  const base = new THREE.Color(TILE_COLOR).r;
  const ground = new THREE.Color(FX_TUNE.groundColor);
  const color = new THREE.Color();
  scene.traverse(object => {
    if (!(object instanceof THREE.InstancedMesh) || object.name !== 'tile' || !object.instanceColor) return;
    const colors = object.instanceColor.array;
    for (let i = 0; i < object.count; i++) {
      const scale = base > 0 ? Number(colors[i * 3]) / base : 1;
      object.setColorAt(i, color.copy(ground).multiplyScalar(scale));
    }
    object.instanceColor.needsUpdate = true;
  });
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

export function showHud(_hash: string) {
  el('#sbApp').hidden = true;

  const { built } = buildMapScene(M1B_HAND);

  const x = (M1B_HAND.bounds.minX + M1B_HAND.bounds.maxX) / 2;
  const z = M1B_HAND.bounds.maxZ - MECH_MARGIN;
  const mech = buildMechProxy(MECH_TUNE.height);
  mech.position.set(x, 0, z);
  scene.add(mech);
  applyFxLook();

  const pose = cameraPose({ x, y: 0, z, yaw: 0 }, 0, CAMERA_TUNE, []);
  applyPose(camera, pose, CAMERA_TUNE.fov);
  addSystem({
    name: 'sb-hud',
    update: () => cullChunks(built.chunks, built.group, camera, MAP_FOG.far),
  });

  const params = new URLSearchParams(location.search);
  const asked = params.get('plan');
  let plan: PlanId = asked !== null && (PLAN_IDS as readonly string[]).includes(asked) ? (asked as PlanId) : 'a';
  let cutscene = params.get('cut') === '1';
  let touch = params.get('touch') === '1';

  const planButtons = new Map<PlanId, HTMLButtonElement>();

  document.getElementById('sbHudBar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'sbHudBar';
  bar.style.cssText =
    'position:fixed;left:50%;top:0;transform:translateX(-50%);height:28px;z-index:8;' +
    'pointer-events:auto;display:flex;gap:4px';
  document.body.appendChild(bar);

  for (const id of PLAN_IDS)
    planButtons.set(
      id,
      button(bar, `${id.toUpperCase()} ${PLAN_LABELS[id]}`, () => setPlan(id)),
    );
  const cutButton = button(bar, 'カットシーン', () => {
    cutscene = !cutscene;
    render();
  });
  const touchButton = button(bar, 'タッチの位置', () => {
    touch = !touch;
    render();
  });

  function paintButtons() {
    for (const [id, node] of planButtons) paintButton(node, id === plan);
    paintButton(cutButton, cutscene);
    paintButton(touchButton, touch);
  }

  function render() {
    buildHud(document.body, plan, { cutscene, touch });
    paintButtons();
  }

  function setPlan(next: PlanId) {
    plan = next;
    render();
    const query = new URLSearchParams(location.search);
    query.set('plan', plan);
    history.replaceState(null, '', `${location.pathname}?${query.toString()}${location.hash}`);
  }

  window.sbHudReport = () => {
    const elements: Record<string, { left: number; top: number; width: number; height: number }> = {};
    const root = document.getElementById('sbHud');
    if (root) {
      for (const node of root.querySelectorAll<HTMLElement>('[data-hud]')) {
        const id = node.dataset.hud;
        if (!id) continue;
        const rect = node.getBoundingClientRect();
        elements[id] = {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }
    }
    return JSON.stringify({ plan, cutscene, touch, elements });
  };

  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const next = KEY_PLAN[event.key];
    if (next !== undefined) setPlan(next);
  });
  window.addEventListener('resize', render);

  render();
}
