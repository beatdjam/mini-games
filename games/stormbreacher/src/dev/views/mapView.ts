// The map walk (#view-map, SB-055): one map (by hand, from a seed, or the editor's saved one) drawn with the beach's
// builder, the mission's places and the waves' spawn points, and a 4 m mech walked with #view-play's input. The mech
// cannot walk into the props or the targets. The screen shows what the map holds and what validateMapForMission says
// about it; window.sbMapReport() returns the same numbers.
import * as THREE from 'three';
import { addSystem, clamp, el } from '@engine/core/index.ts';
import { camera, cullChunks, renderer, scene } from '@engine/render/index.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { M1B_RULES } from '../../data/maps/m1b-rules.ts';
import { ATMOSPHERE_TUNE } from '../../data/atmosphere.ts';
import { MELEE_TUNE } from '../../data/melee.ts';
import { M1 } from '../../data/missions/m1.ts';
import { DEFENDER_TUNE } from '../../data/defenders.ts';
import { FRONT_TUNE } from '../../data/front.ts';
import { PAYOFF_TUNE } from '../../data/payoff.ts';
import { CAMERA_TUNE } from '../../data/tune.ts';
import { PROP_KINDS, type MapBounds, type MapDef, type PropKind } from '../../data/types.ts';
import { initPlayInput, readInput } from '../../app/input.ts';
import { validateMapForMission, type MapViolation } from '../../logic/mapCheck.ts';
import { generateMap } from '../../logic/mapgen.ts';
import { mapBlockers } from '../../logic/mapShapes.ts';
import { stream } from '../../logic/rng.ts';
import { applyPose, cameraPose, followCamera, type CameraState } from '../../view/camera.ts';
import { applyAtmosphere } from '../../view/atmosphere.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../../view/field.ts';
import { buildWorld, MAP_FOG, type World } from '../../view/world.ts';
import { buildAreaFrames, buildBlastMarks, buildSpawnMarks, countProps } from '../map/build.ts';
import { loadDevMap } from '../map/store.ts';
import { createTunePanel } from '../tunePanel.ts';
import { buildFlatRange, moveFeelFromParams } from './move.ts';

declare global {
  interface Window {
    sbMapReport?: () => string;
  }
}

export type Source = 'hand' | 'gen' | 'edit';

// The mission's names that stand past this map's range: the guns and the magazine are behind the seawall, and the
// beach's mortar and the battery are on the other side of the bounds.
const OUT_OF_RANGE = {
  targets: ['fortress-gun', 'main-gun-1', 'main-gun-2', 'magazine'],
  waves: ['beach-mortar', 'shelling', 'fortress-drop', 'battery'],
} as const;

const MECH_MARGIN = 4; // how far inside the front edge the mech starts (m)

export { MAP_FOG } from '../../view/world.ts';

export interface MapScene {
  built: World['built'];
  cameraBoxes: THREE.Box3[];
}

interface MapReport {
  src: Source;
  seed: number | null;
  id: string;
  props: number;
  targets: number;
  counts: Record<PropKind, number>;
  violations: MapViolation[];
  calls: number;
  triangles: number;
  mech: { x: number; z: number };
}

export function sourceOf(params: URLSearchParams): Source {
  const value = params.get('src');
  return value === 'gen' || value === 'edit' ? value : 'hand';
}

export function seedOf(params: URLSearchParams): number | null {
  const value = params.get('seed');
  if (value === null || !/^\d+$/.test(value)) return null;
  return Number(value) >>> 0;
}

function emptyMap(bounds: MapBounds): MapDef {
  return { id: 'empty', bounds, props: [], targets: [], spawns: {} };
}

// The map the URL asks for. The edited map is the editor's saved one; a MapDef is never guessed from a broken save.
export function mapOf(source: Source, seed: number | null): { map: MapDef; message: string } {
  if (source === 'hand') return { map: M1B_HAND, message: '' };
  if (source === 'gen') {
    const map = generateMap(stream('map'), M1B_RULES, { targets: M1B_HAND.targets, spawns: M1B_HAND.spawns });
    return { map, message: seed === null ? '種を指定していない（起動時の種で作った）' : '' };
  }
  const saved = loadDevMap();
  if (saved !== null) return { map: saved, message: '' };
  return { map: emptyMap(M1B_HAND.bounds), message: '保存されたマップが無い' };
}

// The small numbers at the top left: what the map holds, what is wrong with it, and what the last frame drew.
function hudText(
  source: Source,
  seed: number | null,
  message: string,
  map: MapDef,
  counts: Record<PropKind, number>,
  violations: readonly MapViolation[],
  mech: { x: number; z: number },
): string {
  const kinds = PROP_KINDS.map(kind => `${kind} ${counts[kind]}`).join(' ');
  const wrong = violations.length === 0 ? 'なし' : violations.map(v => `- ${v.kind}: ${v.message}`).join('\n');
  return [
    `src ${source}${seed === null ? '' : ` seed ${seed}`} id ${map.id}`,
    message,
    `物 ${map.props.length} (${kinds})`,
    `目標 ${map.targets.length}`,
    `描画 calls ${renderer.info.render.calls} / tris ${renderer.info.render.triangles}`,
    `機体 x ${mech.x.toFixed(1)} z ${mech.z.toFixed(1)}`,
    `違反 ${wrong}`,
  ]
    .filter(line => line !== '')
    .join('\n');
}

// Hides the start-up field and builds the walkable map into the scene: its ground and props, its targets, the mission's
// areas and the waves' marks. #view-map and #view-fx share it; the fog it sets is the one both start from.
export function buildMapScene(map: MapDef, air = true): MapScene {
  el('#sbApp').hidden = true;
  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = false;
  const ground = scene.getObjectByName(GROUND_NAME);
  if (ground) ground.visible = false;

  const { built, cameraBoxes } = buildWorld(map, air);
  scene.add(buildAreaFrames(M1.areas, map.bounds));
  scene.add(buildSpawnMarks(map.spawns));
  scene.add(buildBlastMarks(map.blasts));
  return { built, cameraBoxes };
}

export function showMap(_hash: string) {
  const params = new URLSearchParams(location.search);
  const source = sourceOf(params);
  const seed = seedOf(params);
  const { map, message } = mapOf(source, seed);
  const counts = countProps(map.props);
  const violations = validateMapForMission(map, M1, OUT_OF_RANGE);

  const { built, cameraBoxes } = buildMapScene(map);

  const { moveTune, feelTune } = moveFeelFromParams(params);
  const range = buildFlatRange(CAMERA_TUNE.fov, { targets: false, rects: mapBlockers(map) });
  const mech = range.mech;
  mech.x = (map.bounds.minX + map.bounds.maxX) / 2;
  mech.z = map.bounds.maxZ - MECH_MARGIN;
  mech.yaw = 0;
  initPlayInput();

  const hud = document.createElement('div');
  hud.id = 'sbMapHud';
  hud.style.cssText =
    'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);padding:4px 6px;' +
    'font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none;z-index:5';
  document.body.appendChild(hud);

  // The feel's values, turned while walking: the movement, the camera's place and the effects that sell a step, a
  // landing and a shot. The walk uses the copies with the URL's values on top (moveFeelFromParams), so the panel starts
  // from what the view actually runs.
  createTunePanel({
    title: '手応え #view-map',
    groups: [
      {
        name: 'MOVE_TUNE',
        table: moveTune,
        ranges: {
          walk: { min: 0, max: 20, step: 0.1 },
          jump: { min: 0, max: 20, step: 0.1 },
          gravity: { min: 0, max: 60, step: 0.5 },
          boost: { min: 0, max: 30, step: 0.5 },
        },
        labels: {
          walk: '歩く速さ（m/s）',
          jump: 'ジャンプ（m/s）',
          gravity: '重力（m/s^2）',
          boost: 'ブースト（m/s）',
        },
      },
      {
        name: 'CAMERA_TUNE',
        table: CAMERA_TUNE,
        ranges: {
          dist: { min: 1, max: 20, step: 0.1 },
          height: { min: -5, max: 10, step: 0.1 },
          minDist: { min: 0, max: 3, step: 0.1 },
          margin: { min: 0, max: 2, step: 0.05 },
          pullSpeed: { min: 0, max: 20, step: 0.5 },
          pullGap: { min: 0, max: 3, step: 0.1 },
          pullNear: { min: 0, max: 2, step: 0.05 },
          returnSpeed: { min: 0, max: 10, step: 0.5 },
          returnLag: { min: 0, max: 1, step: 0.01 },
          turnLag: { min: 0, max: 1, step: 0.01 },
          returnDelay: { min: 0, max: 2, step: 0.05 },
          releaseGap: { min: 0, max: 5, step: 0.1 },
          rise: { min: 0, max: 3, step: 0.05 },
          riseRange: { min: 0, max: 5, step: 0.1 },
          closeLook: { min: 0, max: 5, step: 0.1 },
          closePitch: { min: 0, max: 0.5, step: 0.01 },
          fastTurn: { min: 0, max: 20, step: 0.5 },
          probeDeg: { min: 0, max: 15, step: 0.5 },
        },
        labels: {
          dist: '距離（m）',
          height: '高さ（m）',
          minDist: '寄れる最短（m）',
          margin: '壁の前の隙間（m）',
          pullSpeed: '寄る速さの上限（m/s）',
          pullGap: '戻りを閉じる残り（m）',
          pullNear: '寄りとみなす近さ（m）',
          returnSpeed: '戻る速さ（m/s）',
          returnLag: '戻る時定数（s）',
          turnLag: '向きを追う時定数（s）',
          returnDelay: '戻り始めを待つ時間（s）',
          releaseGap: '離れたとみなす差（m）',
          rise: '寄ったときの上げ（m）',
          riseRange: '上げを戻す距離（m）',
          closeLook: '寄ったとき前へ出す注視点（m）',
          closePitch: '見下ろしの上乗せ（rad）',
          fastTurn: '急旋回とみなす速さ（rad/s）',
          probeDeg: '角を見る角度（度）',
        },
      },
      {
        name: 'FEEL_TUNE',
        table: feelTune,
        ranges: {
          boostFov: { min: 0, max: 40, step: 1 },
          fovRate: { min: 0.5, max: 30, step: 0.5 },
          landShake: { min: 0, max: 2, step: 0.01 },
          fireShake: { min: 0, max: 1, step: 0.01 },
          damageShake: { min: 0, max: 2, step: 0.01 },
          shakeDecay: { min: 0, max: 30, step: 0.5 },
          hitStop: { min: 0, max: 0.5, step: 0.01 },
          dust: { min: 0, max: 3, step: 0.1 },
          fireRate: { min: 1, max: 20, step: 0.5 },
        },
        labels: {
          boostFov: 'ブーストの画角（度）',
          fovRate: '画角の速さ（1/s）',
          landShake: '着地の揺れ（m）',
          fireShake: '射撃の揺れ（m）',
          damageShake: '被弾の揺れ（m）',
          shakeDecay: '揺れの収まり（1/s）',
          hitStop: 'ヒットストップ（s）',
          dust: '砂煙の倍率',
          fireRate: '連射（発/s）',
        },
      },
      {
        name: 'FRONT_TUNE',
        table: FRONT_TUNE,
        ranges: {
          beachZ: { min: -20, max: 170, step: 1 },
          line1Z: { min: 0, max: 170, step: 1 },
          pillboxesZ: { min: -60, max: 40, step: 1 },
        },
        labels: {
          beachZ: '前線: 浜(z)',
          line1Z: '前線: 線1(z)',
          pillboxesZ: '前線: トーチカ線(z)',
        },
      },
      {
        name: 'PAYOFF_TUNE',
        table: PAYOFF_TUNE,
        ranges: {
          slowSec: { min: 0, max: 1, step: 0.01 },
          slowScale: { min: 0, max: 1, step: 0.05 },
          firstSlowSec: { min: 0, max: 1, step: 0.01 },
          firstSlowScale: { min: 0, max: 1, step: 0.05 },
          calmSec: { min: 0, max: 15, step: 0.5 },
          calmMul: { min: 1, max: 5, step: 0.1 },
          headlineSec: { min: 0, max: 4, step: 0.1 },
          cheerDelay: { min: 0, max: 5, step: 0.1 },
          retreatSpeed: { min: 1, max: 3, step: 0.05 },
          retreatHold: { min: 0, max: 10, step: 0.5 },
          retreatArrive: { min: 0.5, max: 5, step: 0.1 },
          surgeAllies: { min: 0, max: 40, step: 1 },
        },
        labels: {
          slowSec: '溜めの秒',
          slowScale: '溜めの時間の割合',
          firstSlowSec: '1基目の溜めの秒',
          firstSlowScale: '1基目の時間の割合',
          calmSec: '砲撃が弱まる秒',
          calmMul: '砲撃の間隔の倍率',
          headlineSec: '見出しの秒',
          cheerDelay: '歓声の遅れ（秒）',
          retreatSpeed: '下がる速さの倍率',
          retreatHold: '遮蔽に留まる秒',
          retreatArrive: '着いたと見る距離(m)',
          surgeAllies: '節目の増援（人）',
        },
      },
      {
        name: 'DEFENDER_TUNE',
        table: DEFENDER_TUNE,
        ranges: {
          hideSec: { min: 0, max: 8, step: 0.1 },
          peekSec: { min: 0.5, max: 8, step: 0.1 },
          stepSpeed: { min: 1, max: 10, step: 0.1 },
          arrive: { min: 0.1, max: 2, step: 0.1 },
          firstWait: { min: 0, max: 5, step: 0.1 },
          fireInterval: { min: 0.5, max: 8, step: 0.1 },
        },
        labels: {
          hideSec: '守備: 隠れる秒',
          peekSec: '守備: 身を出す秒',
          stepSpeed: '守備: 出る速さ(m/s)',
          arrive: '守備: 着いたと見る距離(m)',
          firstWait: '守備: 出てから最初の射撃まで(s)',
          fireInterval: '守備: 射撃間隔(s)',
        },
      },
      {
        // SB-1440: the beach's air. The scene redraws from these every frame; the screen layers and the canvas's grade
        // are put back by applyAtmosphere, which the change below calls.
        name: 'ATMOSPHERE_TUNE',
        table: ATMOSPHERE_TUNE,
        ranges: {
          columns: { min: 0, max: 12, step: 1 },
          rise: { min: 0, max: 6, step: 0.1 },
          windX: { min: -8, max: 8, step: 0.1 },
          windZ: { min: -8, max: 8, step: 0.1 },
          plumeLife: { min: 1, max: 20, step: 0.5 },
          plumeOpacity: { min: 0, max: 1, step: 0.01 },
          hazeSheets: { min: 0, max: 8, step: 1 },
          hazeOpacity: { min: 0, max: 0.5, step: 0.01 },
          hazeDrift: { min: -6, max: 6, step: 0.1 },
          fires: { min: 0, max: 5, step: 1 },
          glowSize: { min: 0, max: 30, step: 0.5 },
          glowOpacity: { min: 0, max: 1, step: 0.01 },
          flameFlicker: { min: 0, max: 1, step: 0.01 },
          grade: { min: 0, max: 1, step: 0.01 },
          vignette: { min: 0, max: 1, step: 0.01 },
          grain: { min: 0, max: 1, step: 0.01 },
        },
        labels: {
          columns: '煙の柱の本数（0で無し）',
          rise: '煙の上る速さ（m/s）',
          windX: '風（x m/s）',
          windZ: '風（z m/s）',
          plumeLife: '煙の寿命（s）',
          plumeOpacity: '煙の濃さ',
          hazeSheets: 'かすみの枚数（0で無し）',
          hazeOpacity: 'かすみの濃さ',
          hazeDrift: 'かすみの流れ（m/s）',
          fires: '燃える残骸の数（0で無し）',
          glowSize: '炎の照り返し（m）',
          glowOpacity: '炎の照り返しの濃さ',
          flameFlicker: '炎の揺れ',
          grade: '画面の色（0で無し）',
          vignette: '画面の端の暗さ（0で無し）',
          grain: '粒状感（0で無し）',
        },
      },
      {
        // The fist's values: the sector, the wait, the lunge and what a hit asks the feel for. The walk here has no
        // enemies, so the panel shows the numbers for a sortie to use; the sortie's mech swings the fist.
        name: 'MELEE_TUNE',
        table: MELEE_TUNE,
        ranges: {
          damage: { min: 0, max: 100, step: 1 },
          range: { min: 1, max: 15, step: 0.1 },
          halfArcDeg: { min: 5, max: 180, step: 1 },
          interval: { min: 0.5, max: 3, step: 0.01 },
          lungeSec: { min: 0.05, max: 1, step: 0.01 },
          lungeDistance: { min: 0, max: 15, step: 0.1 },
          missDistance: { min: 0, max: 5, step: 0.1 },
          hitStop: { min: 0, max: 0.3, step: 0.01 },
          hitShake: { min: 0, max: 2, step: 0.01 },
        },
        labels: {
          damage: '威力',
          range: '届く距離（m）',
          halfArcDeg: '扇の半角（度）',
          interval: '間隔（s）',
          lungeSec: '踏み込みの時間（s）',
          lungeDistance: '踏み込み（m）',
          missDistance: '空振りの踏み込み（m）',
          hitStop: 'ヒットストップ（s）',
          hitShake: '当たったときの揺れ（m）',
        },
      },
    ],
    onChange: group => {
      if (group === 'ATMOSPHERE_TUNE') applyAtmosphere();
    },
  });

  window.sbMapReport = () => {
    const report: MapReport = {
      src: source,
      seed,
      id: map.id,
      props: map.props.length,
      targets: map.targets.length,
      counts,
      violations,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      mech: { x: mech.x, z: mech.z },
    };
    return JSON.stringify(report);
  };

  let pitch = 0;
  let cam: CameraState | null = null;

  addSystem({
    name: 'sb-map',
    update: dt => {
      const read = readInput(dt);
      pitch = clamp(pitch + read.pitchDelta, CAMERA_TUNE.pitchMin, CAMERA_TUNE.pitchMax);
      const step = range.step(read.input, dt, moveTune, feelTune);
      const pose = cameraPose({ x: mech.x, y: mech.y, z: mech.z, yaw: mech.yaw }, pitch, CAMERA_TUNE, cameraBoxes);
      cam = followCamera(cam, pose, dt, CAMERA_TUNE);
      const pos = cam.pos.clone().add(step.offset);
      applyPose(camera, { ...pose, pos, look: cam.look }, step.fov);
      cullChunks(built.chunks, built.group, camera, MAP_FOG.far);
      hud.textContent = hudText(source, seed, message, map, counts, violations, mech);
    },
  });
}
