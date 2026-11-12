// The map editor (#view-mapedit, SB-055): a map seen from above, the kinds of props and targets down the right side,
// click to place, drag to move, R or the button to turn 15 degrees, Delete to remove. Every change is checked by
// validateMapForMission and saved to localStorage, where #view-map?src=edit walks it.
import * as THREE from 'three';
import { addSystem, el } from '@engine/core/index.ts';
import { camera, disposeTree, scene } from '@engine/render/index.ts';
import { PROP_KINDS, TARGET_KINDS, type MapDef, type PropKind, type TargetKind } from '../../data/types.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../../view/field.ts';
import { countProps } from '../map/build.ts';
import { bindEditorInput } from '../map/editorInput.ts';
import { buildEditorGroup, makeSelectionMark, placeSelectionMark } from '../map/editorScene.ts';
import {
  TARGET_IDS,
  TURN,
  emptyMap,
  remove,
  rotate,
  startFromGenerated,
  startFromHand,
  toggleBreakable,
  validate,
  type MapSelection,
  type MapTool,
} from '../map/model.ts';
import { loadDevMap, parseMap, saveDevMap } from '../map/store.ts';
import type { MapViolation } from '../../logic/mapCheck.ts';

declare global {
  interface Window {
    sbMapEditReport?: () => string;
  }
}

const PANEL =
  'position:fixed;right:8px;top:calc(env(safe-area-inset-top,0px) + 8px);' +
  'width:188px;max-height:calc(100vh - 16px);overflow:auto;padding:6px;box-sizing:border-box;' +
  'font:12px/1.35 monospace;color:#fff;background:rgba(6,12,18,.82);z-index:6;pointer-events:auto';
const BUTTON =
  'pointer-events:auto;min-height:26px;padding:0 5px;margin:1px;border-radius:4px;font:inherit;font-size:11px;' +
  'border:1px solid rgba(255,207,106,.55);background:rgba(10,17,25,.85);color:#ffcf6a';
const ACTIVE = 'background:rgba(255,207,106,.85);color:#10161d';
const FOV = 60; // degrees
const TARGET_HEIGHT = 190; // how high the camera starts over a map this size (m)
const FAR_PER_HEIGHT = 2; // the far plane as a multiple of the camera's height, so the ground below is always drawn

const PROP_LABEL: Record<PropKind, string> = {
  tile: 'タイル',
  hedgehog: '対戦車障害物',
  block: 'ブロック',
  bunker: 'トーチカ',
  seawall: '防波堤',
  cliff: '崖',
  crater: 'クレーター',
  wreck: '残骸',
  lowWall: '低い障害物',
  stairs: '階段',
};

const TARGET_LABEL: Record<TargetKind, string> = {
  pillbox: 'トーチカ',
  depot: '集積所',
  gun: '砲',
  magazine: '弾薬庫',
};

function makeButton(parent: HTMLElement, id: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = id;
  button.textContent = label;
  button.style.cssText = BUTTON;
  button.addEventListener('click', onClick);
  parent.appendChild(button);
  return button;
}

function frameHeight(map: MapDef): number {
  const width = map.bounds.maxX - map.bounds.minX;
  const depth = map.bounds.maxZ - map.bounds.minZ;
  return Math.max(TARGET_HEIGHT, Math.max(width, depth));
}

export function showMapEdit(_hash: string) {
  el('#sbApp').hidden = true;
  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = false;
  const ground = scene.getObjectByName(GROUND_NAME);
  if (ground) ground.visible = false;

  const saved = loadDevMap();
  let map = saved ?? startFromHand();
  let selection: MapSelection = null;
  let tool: MapTool = { type: 'prop', kind: 'block' };
  let violations: MapViolation[] = validate(map);
  let dirty = true;
  let visual: THREE.Group | null = null;

  const view = {
    x: (map.bounds.minX + map.bounds.maxX) / 2,
    z: (map.bounds.minZ + map.bounds.maxZ) / 2,
    height: frameHeight(map),
  };
  camera.up.set(0, 0, -1);
  camera.fov = FOV;
  camera.updateProjectionMatrix();
  // the field's fog (60-160 m) and far plane (200 m) hid the whole map from a camera about 230 m up: no fog here, and
  // the far plane follows the height (set every frame below)
  scene.fog = null;

  const mark = makeSelectionMark();
  scene.add(mark);

  const panel = document.createElement('div');
  panel.id = 'sbMapEditPanel';
  panel.style.cssText = PANEL;
  document.body.appendChild(panel);

  const title = document.createElement('div');
  title.textContent = '物';
  panel.appendChild(title);
  const propButtons = new Map<PropKind, HTMLButtonElement>();
  for (const kind of PROP_KINDS) {
    propButtons.set(
      kind,
      makeButton(panel, `sbMapTool-prop-${kind}`, PROP_LABEL[kind], () => {
        tool = { type: 'prop', kind };
        paintTools();
      }),
    );
  }

  const targetTitle = document.createElement('div');
  targetTitle.textContent = '目標';
  panel.appendChild(targetTitle);
  const targetButtons = new Map<TargetKind, HTMLButtonElement>();
  for (const kind of TARGET_KINDS) {
    targetButtons.set(
      kind,
      makeButton(panel, `sbMapTool-target-${kind}`, TARGET_LABEL[kind], () => {
        tool = { type: 'target', kind };
        paintTools();
      }),
    );
  }
  const idLabel = document.createElement('label');
  idLabel.textContent = '目標の id ';
  const idSelect = document.createElement('select');
  idSelect.id = 'sbMapTargetId';
  idSelect.style.cssText = 'pointer-events:auto;font:inherit;max-width:100%';
  const choose = document.createElement('option');
  choose.value = '';
  choose.textContent = '選んで';
  idSelect.appendChild(choose);
  for (const id of TARGET_IDS) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    idSelect.appendChild(option);
  }
  idLabel.appendChild(idSelect);
  panel.appendChild(idLabel);

  const start = document.createElement('div');
  start.style.cssText = 'display:flex;flex-wrap:wrap;margin-top:4px';
  panel.appendChild(start);
  const seedInput = document.createElement('input');
  seedInput.id = 'sbMapSeed';
  seedInput.type = 'number';
  seedInput.value = '1';
  seedInput.style.cssText = 'pointer-events:auto;width:64px;font:inherit;margin:1px';
  start.appendChild(seedInput);
  makeButton(start, 'sbMapStartHand', '手書きから始める', () => startMap(startFromHand()));
  makeButton(start, 'sbMapStartGen', '生成から始める', () => {
    try {
      startMap(startFromGenerated(Number(seedInput.value) || 1));
    } catch (error) {
      showError(error);
    }
  });
  makeButton(start, 'sbMapStartEmpty', '空から始める', () => startMap(emptyMap(map.bounds)));

  const edits = document.createElement('div');
  edits.style.cssText = 'display:flex;flex-wrap:wrap;margin-top:4px';
  panel.appendChild(edits);
  makeButton(edits, 'sbMapRotate', '回転', () => {
    rotate(map, selection, TURN);
    changed(true);
  });
  makeButton(edits, 'sbMapDelete', '削除', () => {
    remove(map, selection);
    selection = null;
    changed(true);
  });
  makeButton(edits, 'sbMapBreakable', '壊せる', () => {
    if (toggleBreakable(map, selection)) changed(true);
  });
  makeButton(edits, 'sbMapExport', '書き出し', () => {
    text.value = JSON.stringify(map, null, 2);
    text.hidden = false;
  });
  makeButton(edits, 'sbMapImport', '読み込み', () => importText());

  const status = document.createElement('div');
  status.id = 'sbMapStatus';
  status.style.cssText = 'white-space:pre-wrap;margin-top:4px;color:#d5e4ee';
  panel.appendChild(status);

  const text = document.createElement('textarea');
  text.id = 'sbMapText';
  text.hidden = true;
  text.spellcheck = false;
  text.style.cssText =
    'pointer-events:auto;width:100%;height:120px;margin-top:4px;font:10px/1.3 monospace;' +
    'color:#e8eef2;background:rgba(5,8,12,.92);border:1px solid rgba(213,228,238,.35)';
  panel.appendChild(text);

  const canvas = el<HTMLCanvasElement>('#gl');

  function paintTools() {
    for (const [kind, button] of propButtons)
      button.style.cssText = `${BUTTON};${tool.type === 'prop' && tool.kind === kind ? ACTIVE : ''}`;
    for (const [kind, button] of targetButtons)
      button.style.cssText = `${BUTTON};${tool.type === 'target' && tool.kind === kind ? ACTIVE : ''}`;
  }

  function updateStatus() {
    const counts = countProps(map.props);
    const kinds = PROP_KINDS.map(kind => `${kind} ${counts[kind]}`).join(' ');
    const wrong = violations.length === 0 ? '違反なし' : violations.map(v => `- ${v.kind}: ${v.message}`).join('\n');
    status.textContent = `物 ${map.props.length} / 目標 ${map.targets.length}\n${kinds}\n${wrong}`;
    status.style.color = violations.some(v => v.kind === 'no-path') ? '#ff6b6b' : '#d5e4ee';
  }

  function showError(error: unknown) {
    status.textContent = `できない: ${error instanceof Error ? error.message : String(error)}`;
    status.style.color = '#ff6b6b';
  }

  function notice(message: string) {
    status.textContent = message;
    status.style.color = '#ffcf6a';
  }

  function changed(save: boolean) {
    dirty = true;
    if (save) saveDevMap(map);
  }

  function startMap(next: MapDef) {
    map = next;
    selection = null;
    view.x = (map.bounds.minX + map.bounds.maxX) / 2;
    view.z = (map.bounds.minZ + map.bounds.maxZ) / 2;
    view.height = frameHeight(map);
    changed(true);
  }

  function importText() {
    try {
      startMap(parseMap(JSON.parse(text.value)));
    } catch (error) {
      showError(error);
    }
  }

  function flush() {
    if (!dirty) return;
    dirty = false;
    if (visual) {
      scene.remove(visual);
      disposeTree(visual);
    }
    visual = buildEditorGroup(map);
    scene.add(visual);
    placeSelectionMark(mark, map, selection);
    violations = validate(map);
    updateStatus();
  }

  window.sbMapEditReport = () =>
    JSON.stringify({
      id: map.id,
      props: map.props.length,
      targets: map.targets.length,
      counts: countProps(map.props),
      violations: validate(map),
    });

  bindEditorInput({
    canvas,
    camera,
    view,
    map: () => map,
    tool: () => tool,
    targetId: () => idSelect.value,
    selection: () => selection,
    setSelection: next => {
      selection = next;
    },
    changed,
    notice,
  });

  paintTools();
  updateStatus();
  addSystem({
    name: 'sb-map-edit',
    update: () => {
      flush();
      camera.fov = FOV;
      camera.far = view.height * FAR_PER_HEIGHT;
      camera.position.set(view.x, view.height, view.z);
      camera.lookAt(view.x, 0, view.z);
      camera.updateProjectionMatrix();
      placeSelectionMark(mark, map, selection);
    },
  });
}
