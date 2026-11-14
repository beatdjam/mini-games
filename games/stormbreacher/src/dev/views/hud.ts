// The HUD mock's view (#view-hud, SB-160): the M1 B beach drawn once with a fixed camera, a mech proxy standing on
// it and the three layout plans' sample HUD over it. It never reads the game's state and never takes input.
import { addSystem, el, t } from '@engine/core/index.ts';
import { camera, cullChunks, scene } from '@engine/render/index.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { lookOf } from '../../data/looks.ts';
import { RADIO_TUNE } from '../../data/script.ts';
import { CAMERA_TUNE, MECH_TUNE } from '../../data/tune.ts';
import { applyPose, cameraPose } from '../../view/camera.ts';
import { buildHud } from '../hud/build.ts';
import { PLAN_IDS, PLAN_LABELS, type PlanId } from '../hud/plans.ts';
import { createTunePanel } from '../tunePanel.ts';
import { applyLookTo } from '../../view/look.ts';
import { buildMechProxy } from '../../view/mechProxy.ts';
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
  'pointer-events:auto;min-height:30px;padding:0 8px;border-radius:4px;font:inherit;font-size:12px;white-space:nowrap;' +
  `border:1px solid rgba(255,207,106,.55);background:${BUTTON_BACK};color:${BUTTON_TEXT}`;

// How far inside the map's front edge the mech stands (m); showMap's MECH_MARGIN is not exported.
const MECH_MARGIN = 4;

const KEY_PLAN: Record<string, PlanId> = { '1': 'a', '2': 'b', '3': 'c', '4': 'd' };

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

export function showHud(_hash: string) {
  el('#sbApp').hidden = true;

  const { built } = buildMapScene(M1B_HAND);

  const x = (M1B_HAND.bounds.minX + M1B_HAND.bounds.maxX) / 2;
  const z = M1B_HAND.bounds.maxZ - MECH_MARGIN;
  const mech = buildMechProxy(MECH_TUNE.height);
  mech.position.set(x, 0, z);
  scene.add(mech);
  // #view-fx's default look (the M1 row) without the low resolution, through the same view/look.ts the sortie uses
  applyLookTo({ ...lookOf('m1'), pixel: 1 }, built.group);

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

  // The radio sample: the mock has no GameModel, so the view keeps the same one-line-at-a-time rule here to show a queue.
  let radioLine: string | null = 'm1.wave2-lost';
  let radioLeft = RADIO_TUNE.minSec;
  const radioQueue: string[] = [];

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

  function paintRadio() {
    const node = document.querySelector<HTMLElement>('#sbHud [data-hud="radio"]');
    if (!node) return;
    node.hidden = radioLine === null;
    node.textContent = radioLine === null ? '' : `${t('hud.radio')} ${t(radioLine)}`;
  }

  function render() {
    buildHud(document.body, plan, { cutscene, touch });
    paintRadio();
    paintButtons();
  }

  function setPlan(next: PlanId) {
    plan = next;
    render();
    const query = new URLSearchParams(location.search);
    query.set('plan', plan);
    history.replaceState(null, '', `${location.pathname}?${query.toString()}${location.hash}`);
  }

  // Queues two sample lines, so the eye can see the first hold RADIO_TUNE.minSec before the second comes up.
  function flowRadio() {
    radioQueue.length = 0;
    radioQueue.push('m1.depot-hint', 'm1.pillboxes-down');
    const next = radioQueue.shift();
    radioLine = next ?? null;
    radioLeft = next === undefined ? 0 : RADIO_TUNE.minSec;
    paintRadio();
  }

  const extra = document.createElement('div');
  const radioButton = button(extra, '無線を2行流す', flowRadio);
  radioButton.dataset.sbRadio = 'flow';
  createTunePanel({
    id: 'sbTunePanel',
    title: '無線の調整',
    groups: [
      {
        name: 'RADIO_TUNE',
        table: RADIO_TUNE,
        ranges: {
          minSec: { min: 0.5, max: 8, step: 0.1 },
          maxPending: { min: 1, max: 16, step: 1 },
        },
        labels: { minSec: '表示の秒', maxPending: '待ちの上限' },
      },
    ],
    extra,
  });

  addSystem({
    name: 'sb-hud-radio',
    update: dt => {
      if (radioLeft > 0) {
        radioLeft = Math.max(0, radioLeft - dt);
        if (radioLeft > 0) return;
      }
      const next = radioQueue.shift();
      radioLine = next ?? null;
      radioLeft = next === undefined ? 0 : RADIO_TUNE.minSec;
      paintRadio();
    },
  });

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
    return JSON.stringify({ plan, cutscene, touch, radio: radioLine, elements });
  };

  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const next = KEY_PLAN[event.key];
    if (next !== undefined) setPlan(next);
  });
  window.addEventListener('resize', render);

  render();
}
