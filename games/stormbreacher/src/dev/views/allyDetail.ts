// The ally's own look (#view-ally, SB-1730): M1 B's beach with the script's allied mech standing on it, seen from 10 m
// (close enough to read the plates, band and antenna) or 60 m (whether it still reads as an ally), running or wrecked.
// The tuning panel changes ALLY_DETAIL and builds the model again, so a value is judged on the next frame.
import * as THREE from 'three';
import { addSystem, el } from '@engine/core/index.ts';
import { camera, cullChunks, scene } from '@engine/render/index.ts';
import { ALLY_DETAIL, ALLY_TUNE, type AllyShape } from '../../data/allies.ts';
import { lookOf } from '../../data/looks.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { buildAllyMech } from '../../view/allies.ts';
import { applyLookTo } from '../../view/look.ts';
import { countMechDraws, disposeMech } from '../../view/mechModel.ts';
import { createTunePanel, type TuneGroup } from '../tunePanel.ts';
import { buildMapScene, MAP_FOG } from './mapView.ts';

declare global {
  interface Window {
    sbAllyReport?: () => string;
  }
}

// The shots the view offers: how far the camera stands (m) and whether the ally lies wrecked.
export type AllyShot = 'near' | 'far' | 'wreck';

interface ShotSpec {
  distance: number; // the camera's distance from the ally (m)
  height: number; // the camera's height above the ground (m)
  lookAt: number; // the height on the ally the camera faces (m)
  shape: AllyShape;
}

const SHOTS: Record<AllyShot, ShotSpec> = {
  near: { distance: 10, height: 2.6, lookAt: 1.5, shape: 'run' },
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

const TUNE: TuneGroup = {
  name: 'ALLY_DETAIL',
  table: ALLY_DETAIL,
  ranges: {
    'shoulder.width': { min: 0.08, max: 0.28, step: 0.005 },
    'shoulder.height': { min: 0.04, max: 0.18, step: 0.005 },
    'shoulder.depth': { min: 0.12, max: 0.36, step: 0.005 },
    'shoulder.y': { min: 0.24, max: 0.42, step: 0.005 },
    'band.width': { min: 0.06, max: 0.18, step: 0.005 },
    'band.height': { min: 0.01, max: 0.06, step: 0.002 },
    'antenna.height': { min: 0.1, max: 0.4, step: 0.005 },
    'wreck.shoulderLean': { min: 0, max: 1.2, step: 0.01 },
    'wreck.antennaLean': { min: 0, max: 1.4, step: 0.01 },
  },
  labels: {
    'shoulder.width': '肩の幅',
    'shoulder.height': '肩の厚み',
    'shoulder.depth': '肩の奥行き',
    'shoulder.y': '肩の高さ',
    'band.width': '帯の幅',
    'band.height': '帯の太さ',
    'antenna.height': 'アンテナの長さ',
    'wreck.shoulderLean': '倒れた肩の傾き',
    'wreck.antennaLean': '倒れたアンテナの傾き',
  },
};

function shotOf(params: URLSearchParams): AllyShot {
  const asked = params.get('shot');
  return asked === 'far' || asked === 'wreck' ? asked : 'near';
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

  // builds the model for a shot and puts it on the sand; the caller drops the one it replaces
  const make = (next: AllyShot): THREE.Group => {
    const group = buildAllyMech(SHOTS[next].shape);
    group.position.set(ALLY_AT.x, 0, ALLY_AT.z);
    if (SHOTS[next].shape === 'wreck') group.rotation.set(0, WRECK_YAW, ALLY_TUNE.wreckTilt, 'YXZ');
    scene.add(group);
    return group;
  };
  let model = make(shot);
  placeCamera(shot);
  const place = (next: AllyShot) => {
    scene.remove(model);
    disposeMech(model);
    model = make(next);
    placeCamera(next);
  };

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:4px;margin-bottom:4px';
  const labels: Record<AllyShot, string> = { near: '近く 10m', far: '遠く 60m', wreck: '倒れた姿' };
  const nodes = new Map<AllyShot, HTMLButtonElement>();
  for (const name of ['near', 'far', 'wreck'] as const) {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = labels[name];
    node.style.cssText = `${BUTTON};flex:1`;
    node.addEventListener('click', () => setShot(name));
    buttons.appendChild(node);
    nodes.set(name, node);
  }

  function paint() {
    for (const [name, node] of nodes) {
      const on = name === shot;
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

  createTunePanel({
    groups: [TUNE],
    title: '味方機',
    extra: buttons,
    onChange: () => place(shot),
  });
  paint();

  window.sbAllyReport = () => {
    const draws = countMechDraws(model);
    return JSON.stringify({
      shot,
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

// A view's setting of the shot, once showAlly has made one. The shots use this so each picture is the state the
// button would give, without a click having to land on the page.
let shotSetter: ((shot: AllyShot) => void) | null = null;

export function showAllyDetailShot(shot: AllyShot): void {
  if (shotSetter === null) throw new Error('showAllyDetail must run before showAllyDetailShot');
  shotSetter(shot);
}
