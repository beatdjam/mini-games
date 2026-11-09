// The beach under fire (#view-fx, SB-045): M1 B's hand map walked with #view-map's input, with the battle's allies,
// shells, smoke, tracers and planes around the mech, and the look (resolution, colour, haze) turned by the same knobs.
// The panel at the top right changes the values as they are; "書き出し" puts the JSON in the textarea and
// window.sbFxReport() gives the same JSON with the frame's counts.
import * as THREE from 'three';
import { addSystem, clamp } from '@engine/core/index.ts';
import { camera, cullChunks, renderer, scene } from '@engine/render/index.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { CAMERA_TUNE, FEEL_TUNE, FX_STAGES, FX_TUNE, MOVE_TUNE, type FxTune } from '../../data/tune.ts';
import { initPlayInput, readInput } from '../../app/input.ts';
import { seed as seedRng, stream } from '../../logic/rng.ts';
import { applyPose, cameraPose, followPose } from '../../view/camera.ts';
import { buildBattle, type Battle } from '../../view/battle/index.ts';
import type { CrowdCounts } from '../../logic/crowd.ts';
import { MAP_FOG, buildMapScene } from './mapView.ts';
import { buildFlatRange, checkOneTable, moveFeelFromParams, tuneWithParams } from './move.ts';

declare global {
  interface Window {
    sbFxReport?: () => string;
  }
}

type TuneKey = keyof FxTune;

// The knobs the panel shows; the colours are left out (the URL can still set them).
const SLIDERS: readonly { key: TuneKey; min: number; max: number; step: number }[] = [
  { key: 'pixel', min: 0.2, max: 1, step: 0.01 },
  { key: 'saturate', min: 0, max: 1.5, step: 0.01 },
  { key: 'contrast', min: 0.5, max: 1.6, step: 0.01 },
  { key: 'sepia', min: 0, max: 0.8, step: 0.01 },
  { key: 'haze', min: 0, max: 0.8, step: 0.01 },
  { key: 'shellEvery', min: 0, max: 10, step: 0.2 },
  { key: 'shellNear', min: 5, max: 80, step: 1 },
  { key: 'shellFar', min: 10, max: 200, step: 5 },
  { key: 'shellShake', min: 0, max: 1, step: 0.02 },
  { key: 'smokeLife', min: 0, max: 12, step: 0.5 },
  { key: 'smokeCubes', min: 0, max: 40, step: 1 },
  { key: 'smokeMax', min: 0, max: 600, step: 10 },
  { key: 'wreckSmoke', min: 0, max: 8, step: 1 },
  { key: 'craters', min: 0, max: 300, step: 5 },
  { key: 'craterMin', min: 1, max: 8, step: 0.5 },
  { key: 'craterMax', min: 2, max: 12, step: 0.5 },
  { key: 'craterWater', min: 0, max: 1, step: 0.05 },
  { key: 'shellCrater', min: 0, max: 1, step: 1 },
  { key: 'craterCap', min: 0, max: 400, step: 10 },
  { key: 'tracers', min: 0, max: 30, step: 1 },
  { key: 'tracerSpeed', min: 40, max: 400, step: 10 },
  { key: 'allies', min: 0, max: 300, step: 1 },
  { key: 'allyWaves', min: 0, max: 20, step: 0.5 },
  { key: 'allySpeed', min: 0, max: 12, step: 0.1 },
  { key: 'allyDeathRate', min: 0, max: 0.5, step: 0.01 },
  { key: 'planes', min: 0, max: 8, step: 1 },
  { key: 'planeHeight', min: 20, max: 200, step: 5 },
  { key: 'planeSpeed', min: 20, max: 150, step: 5 },
];

// Values the instanced meshes were made for: a change needs the battle rebuilt before it shows its full size.
const REBUILD_KEYS: readonly TuneKey[] = [
  'allies',
  'smokeMax',
  'craters',
  'craterCap',
  'craterMin',
  'craterMax',
  'craterWater',
];

interface FxReport {
  stage: number;
  seed: number | null;
  tune: FxTune;
  allies: CrowdCounts;
  calls: number;
  triangles: number;
  fps: number;
}

// The query of the hash (`#view-fx?fx=3&seed=1`) or, when it has none, of the page (`?fx=0#view-fx`).
function viewParams(): URLSearchParams {
  const at = location.hash.indexOf('?');
  return new URLSearchParams(at >= 0 ? location.hash.slice(at + 1) : location.search);
}

function stageOf(params: URLSearchParams): number {
  const value = params.get('fx');
  return value !== null && /^[0-3]$/.test(value) ? Number(value) : 2;
}

function seedOf(params: URLSearchParams): number | null {
  const value = params.get('seed');
  return value !== null && /^\d+$/.test(value) ? Number(value) >>> 0 : null;
}

// The resolution, the colour and the fog: the only post-process this view has.
function applyLook(tune: FxTune, basePixel: number) {
  renderer.setPixelRatio(Math.max(0.1, basePixel * tune.pixel));
  const style = renderer.domElement.style;
  style.imageRendering = tune.pixel < 0.999 ? 'pixelated' : 'auto';
  style.filter =
    tune.saturate === 1 && tune.contrast === 1 && tune.sepia === 0
      ? ''
      : `saturate(${tune.saturate}) contrast(${tune.contrast}) sepia(${tune.sepia})`;
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.setHex(tune.fogColor);
    scene.fog.near = MAP_FOG.near * (1 - clamp(tune.haze, 0, 0.9));
    scene.fog.far = MAP_FOG.far;
  }
  if (scene.background instanceof THREE.Color) scene.background.setHex(tune.skyColor);
}

function hudText(stage: number, seed: number | null, counts: CrowdCounts, calls: number, tris: number, fps: number) {
  return [
    `fx ${stage} seed ${seed === null ? '-' : seed}`,
    `味方 前進 ${counts.advancing} 倒れ ${counts.fallen} 抜け ${counts.through}${counts.capped ? ' 上限' : ''}`,
    `描画 calls ${calls} / tris ${tris} / fps ${fps.toFixed(0)}`,
  ].join('\n');
}

export function showFx(_hash: string) {
  const params = viewParams();
  const stage = stageOf(params);
  const seed = seedOf(params);
  if (seed !== null) seedRng(seed);

  checkOneTable(FX_TUNE, MOVE_TUNE);
  checkOneTable(FX_TUNE, FEEL_TUNE);
  const tune = tuneWithParams({ ...FX_STAGES[stage] }, params);
  const { moveTune, feelTune } = moveFeelFromParams(params);

  const { built } = buildMapScene(M1B_HAND);
  const basePixel = renderer.getPixelRatio();
  applyLook(tune, basePixel);

  const range = buildFlatRange(CAMERA_TUNE.fov, { targets: false });
  const mech = range.mech;
  mech.x = (M1B_HAND.bounds.minX + M1B_HAND.bounds.maxX) / 2;
  mech.z = M1B_HAND.bounds.maxZ - 4;
  mech.yaw = 0;
  initPlayInput();

  const rng = stream('field');
  const craterRng = stream('craters');
  const start = { x: mech.x, z: mech.z };
  let battle: Battle = buildBattle(M1B_HAND, tune, rng, craterRng, start);

  const hud = document.createElement('div');
  hud.id = 'sbFxHud';
  hud.style.cssText =
    'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);padding:4px 6px;' +
    'font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none;z-index:5';
  document.body.appendChild(hud);

  const panel = document.createElement('div');
  panel.id = 'sbFxPanel';
  panel.style.cssText =
    'position:fixed;right:8px;top:calc(env(safe-area-inset-top,0px) + 8px);width:236px;max-height:calc(100vh - 16px);' +
    'display:flex;flex-direction:column;font:11px/1.35 monospace;color:#e8eef2;background:rgba(10,17,25,0.88);' +
    'border:1px solid rgba(213,228,238,0.3);z-index:6';
  document.body.appendChild(panel);

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;gap:4px;padding:4px';
  const fold = document.createElement('button');
  fold.type = 'button';
  fold.style.cssText =
    'flex:1;height:24px;border:1px solid rgba(213,228,238,0.35);background:rgba(10,17,25,0.7);color:inherit;font:inherit';
  const rebuild = document.createElement('button');
  rebuild.type = 'button';
  rebuild.textContent = 'やり直し';
  rebuild.style.cssText =
    'height:24px;border:1px solid rgba(213,228,238,0.35);background:rgba(10,17,25,0.7);color:inherit;font:inherit';
  head.append(fold, rebuild);
  panel.appendChild(head);

  const body = document.createElement('div');
  body.style.cssText = 'overflow:auto;padding:0 6px 6px';
  panel.appendChild(body);

  let collapsed = window.innerHeight < 520;
  const showFold = () => {
    body.hidden = collapsed;
    fold.textContent = collapsed ? 'つまみ ▸' : 'つまみ ▾';
  };
  showFold();
  fold.addEventListener('click', () => {
    collapsed = !collapsed;
    showFold();
  });

  const values = new Map<TuneKey, HTMLElement>();
  for (const spec of SLIDERS) {
    const row = document.createElement('label');
    row.style.cssText = 'display:block;border-top:1px solid rgba(213,228,238,0.12);padding:2px 0';
    const title = document.createElement('span');
    title.textContent = `${spec.key} `;
    const value = document.createElement('b');
    value.textContent = String(tune[spec.key]);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(tune[spec.key]);
    input.style.cssText = 'display:block;width:100%;margin:0';
    input.addEventListener('input', () => {
      tune[spec.key] = Number(input.value);
      value.textContent = String(tune[spec.key]);
      applyLook(tune, basePixel);
      if (REBUILD_KEYS.includes(spec.key)) rebuild.textContent = 'やり直し *';
    });
    row.append(title, value, input);
    body.appendChild(row);
    values.set(spec.key, value);
  }

  rebuild.addEventListener('click', () => {
    battle.dispose();
    battle = buildBattle(M1B_HAND, tune, rng, craterRng, start);
    rebuild.textContent = 'やり直し';
    for (const spec of SLIDERS) values.get(spec.key)?.replaceChildren(String(tune[spec.key]));
    applyLook(tune, basePixel);
  });

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.textContent = '書き出し';
  exportBtn.style.cssText =
    'width:100%;height:24px;margin-top:4px;border:1px solid rgba(255,207,106,0.6);background:rgba(10,17,25,0.7);' +
    'color:#ffcf6a;font:inherit';
  const exportBox = document.createElement('textarea');
  exportBox.hidden = true;
  exportBox.style.cssText = 'width:100%;height:96px;margin-top:4px;box-sizing:border-box;font:10px/1.3 monospace';
  body.append(exportBtn, exportBox);

  const baseReport = () => ({
    stage,
    seed,
    tune: { ...tune },
    allies: battle.counts(),
  });

  let pitch = 0;
  let camPos: THREE.Vector3 | null = null;
  let fps = 0;
  let fpsFrames = 0;
  let fpsTime = 0;

  window.sbFxReport = () => {
    const report: FxReport = {
      ...baseReport(),
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      fps,
    };
    return JSON.stringify(report);
  };

  exportBtn.addEventListener('click', () => {
    exportBox.value = JSON.stringify(baseReport(), null, 2);
    exportBox.hidden = false;
  });

  addSystem({
    name: 'sb-fx',
    update: dt => {
      const read = readInput(dt);
      pitch = clamp(pitch + read.pitchDelta, CAMERA_TUNE.pitchMin, CAMERA_TUNE.pitchMax);
      range.feel.shake += battle.step(dt, mech);
      const step = range.step(read.input, dt, moveTune, feelTune);
      const pose = cameraPose({ x: mech.x, y: mech.y, z: mech.z, yaw: mech.yaw }, pitch, CAMERA_TUNE, []);
      camPos = camPos ? followPose(camPos, pose.pos, dt, CAMERA_TUNE.lag) : pose.pos.clone();
      const pos = camPos.clone().add(step.offset);
      applyPose(camera, { ...pose, pos }, step.fov);
      cullChunks(built.chunks, built.group, camera, MAP_FOG.far);

      fpsFrames++;
      fpsTime += dt;
      if (fpsTime >= 1) {
        fps = fpsFrames / fpsTime;
        fpsFrames = 0;
        fpsTime = 0;
      }
      hud.textContent = hudText(
        stage,
        seed,
        battle.counts(),
        renderer.info.render.calls,
        renderer.info.render.triangles,
        fps,
      );
    },
  });
}
