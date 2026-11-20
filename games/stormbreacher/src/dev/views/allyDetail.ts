// The ally's own look (#view-ally, SB-1730, SB-2082): M1 B's beach with the script's allied mech standing on it, seen
// from 4 m (the shoulder band and number), 10 m (the plates) or 60 m (whether it still reads as an ally), running or
// wrecked, as either of the two types (the sniper or the scout). The buttons build the other model at once.
import * as THREE from 'three';
import { addSystem, el } from '@engine/core/index.ts';
import { camera, cullChunks, scene } from '@engine/render/index.ts';
import { ALLY_KIT_IDS, ALLY_TUNE, type AllyKit, type AllyShape } from '../../data/allies.ts';
import { lookOf } from '../../data/looks.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { buildAllyMech } from '../../view/allies.ts';
import { applyLookTo } from '../../view/look.ts';
import { countProtoDraws, disposeProtoMech } from '../../view/mechProtoModel.ts';
import { createTunePanel } from '../tunePanel.ts';
import { buildMapScene, MAP_FOG } from './mapView.ts';

declare global {
  interface Window {
    sbAllyReport?: () => string;
  }
}

// The shots the view offers: how far the camera stands (m) and whether the ally lies wrecked.
export type AllyShot = 'near' | 'band' | 'far' | 'wreck';

interface ShotSpec {
  distance: number; // the camera's distance from the ally (m)
  height: number; // the camera's height above the ground (m)
  lookAt: number; // the height on the ally the camera faces (m)
  shape: AllyShape;
}

const SHOTS: Record<AllyShot, ShotSpec> = {
  near: { distance: 10, height: 2.6, lookAt: 1.5, shape: 'run' },
  band: { distance: 4, height: 2.5, lookAt: 2.1, shape: 'run' },
  far: { distance: 60, height: 9, lookAt: 1.7, shape: 'run' },
  wreck: { distance: 10, height: 2.4, lookAt: 0.7, shape: 'wreck' },
};

// The ally stands on the open sand landward of line 1, and the camera is off its front-right, so the band and the
// number face the eye. (z 143 put it in line 1's seaward row, where the hedgehogs then stood in its outline.)
const ALLY_AT = { x: 40, z: 120 };
const VIEW_BEARING = 0.6; // rad, from straight in front of the ally toward its right
const WRECK_YAW = 0.4; // the wreck's own turn, so its broken side shows

const BUTTON =
  'height:24px;border:1px solid rgba(213,228,238,0.35);background:rgba(10,17,25,0.7);color:inherit;font:inherit';

function shotOf(params: URLSearchParams): AllyShot {
  const asked = params.get('shot');
  return asked === 'far' || asked === 'wreck' ? asked : 'near';
}

function kitOf(params: URLSearchParams): AllyKit {
  const asked = params.get('kit');
  return asked !== null && (ALLY_KIT_IDS as readonly string[]).includes(asked) ? (asked as AllyKit) : 'sniper';
}

function placeCamera(shot: AllyShot): void {
  const spec = SHOTS[shot];
  camera.position.set(
    ALLY_AT.x + Math.sin(VIEW_BEARING) * spec.distance,
    spec.height,
    ALLY_AT.z - Math.cos(VIEW_BEARING) * spec.distance,
  );
  camera.lookAt(ALLY_AT.x, spec.lookAt, ALLY_AT.z);
}

export function showAllyDetail(_hash: string) {
  el('#sbApp').hidden = true;

  const { built } = buildMapScene(M1B_HAND);
  // full resolution, as #view-mech does, so the plates' edges and the band can be judged
  applyLookTo({ ...lookOf('m1'), pixel: 1 }, built.group);

  const params = new URLSearchParams(location.search);
  let shot = shotOf(params);
  let kit = kitOf(params);

  // builds the model for a shot and puts it on the sand; the caller drops the one it replaces
  const make = (next: AllyShot, nextKit: AllyKit): THREE.Group => {
    const group = buildAllyMech(SHOTS[next].shape, nextKit);
    group.position.set(ALLY_AT.x, 0, ALLY_AT.z);
    if (SHOTS[next].shape === 'wreck') group.rotation.set(0, WRECK_YAW, ALLY_TUNE.wreckTilt, 'YXZ');
    scene.add(group);
    return group;
  };
  let model = make(shot, kit);
  placeCamera(shot);
  const place = (next: AllyShot) => {
    scene.remove(model);
    disposeProtoMech(model);
    model = make(next, kit);
    placeCamera(next);
  };

  const buttons = document.createElement('div');
  const typeRow = document.createElement('div');
  typeRow.style.cssText = 'display:flex;gap:4px;margin-bottom:4px';
  const typeLabels: Record<AllyKit, string> = { sniper: '狙撃', scout: '偵察' };
  const kitNodes = new Map<AllyKit, HTMLButtonElement>();
  for (const name of ALLY_KIT_IDS) {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = typeLabels[name];
    node.style.cssText = `${BUTTON};flex:1`;
    node.addEventListener('click', () => setKit(name));
    typeRow.appendChild(node);
    kitNodes.set(name, node);
  }
  const shotRow = document.createElement('div');
  shotRow.style.cssText = 'display:flex;gap:4px;margin-bottom:4px';
  const labels: Record<AllyShot, string> = { near: '近く 10m', band: '肩 4m', far: '遠く 60m', wreck: '倒れた姿' };
  const nodes = new Map<AllyShot, HTMLButtonElement>();
  for (const name of ['near', 'band', 'far', 'wreck'] as const) {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = labels[name];
    node.style.cssText = `${BUTTON};flex:1`;
    node.addEventListener('click', () => setShot(name));
    shotRow.appendChild(node);
    nodes.set(name, node);
  }
  buttons.append(typeRow, shotRow);

  function paint() {
    for (const [name, node] of nodes) {
      const on = name === shot;
      node.setAttribute('aria-pressed', String(on));
      node.style.background = on ? 'rgba(213,228,238,0.85)' : 'rgba(10,17,25,0.7)';
      node.style.color = on ? '#10161d' : 'inherit';
    }
    for (const [name, node] of kitNodes) {
      const on = name === kit;
      node.setAttribute('aria-pressed', String(on));
      node.style.background = on ? 'rgba(213,228,238,0.85)' : 'rgba(10,17,25,0.7)';
      node.style.color = on ? '#10161d' : 'inherit';
    }
  }

  function setShot(next: AllyShot) {
    if (next === shot) return;
    shot = next;
    place(shot);
    paint();
  }
  shotSetter = setShot;

  function setKit(next: AllyKit) {
    if (next === kit) return;
    kit = next;
    place(shot);
    paint();
  }
  kitSetter = setKit;

  createTunePanel({
    groups: [],
    title: '味方機',
    extra: buttons,
  });
  paint();

  window.sbAllyReport = () => {
    const draws = countProtoDraws(model);
    return JSON.stringify({
      shot,
      kit,
      shape: SHOTS[shot].shape,
      height: ALLY_TUNE.height,
      draws,
      camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    });
  };

  addSystem({
    name: 'sb-ally',
    update: () => cullChunks(built.chunks, built.group, camera, MAP_FOG.far),
  });
}

// A view's setting of the shot and the type, once showAlly has made one. The shots use these so each picture is the
// state the button would give, without a click having to land on the page.
let shotSetter: ((shot: AllyShot) => void) | null = null;
let kitSetter: ((kit: AllyKit) => void) | null = null;

export function showAllyDetailShot(shot: AllyShot): void {
  if (shotSetter === null) throw new Error('showAllyDetail must run before showAllyDetailShot');
  shotSetter(shot);
}

export function showAllyDetailKit(kit: AllyKit): void {
  if (kitSetter === null) throw new Error('showAllyDetail must run before showAllyDetailKit');
  kitSetter(kit);
}
