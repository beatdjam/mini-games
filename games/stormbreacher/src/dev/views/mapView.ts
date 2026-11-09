// The map walk (#view-map, SB-055): one map (by hand, from a seed, or the editor's saved one) drawn with the beach's
// builder, the mission's places and the waves' spawn points, and an 8 m mech walked with #view-play's input. The screen
// shows what the map holds and what validateMapForMission says about it; window.sbMapReport() returns the same numbers.
import * as THREE from 'three';
import { addSystem, clamp, el } from '@engine/core/index.ts';
import { camera, cullChunks, renderer, scene } from '@engine/render/index.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { M1B_RULES } from '../../data/maps/m1b-rules.ts';
import { M1 } from '../../data/missions/m1.ts';
import { CAMERA_TUNE } from '../../data/tune.ts';
import { PROP_KINDS, type MapBounds, type MapDef, type PropKind } from '../../data/types.ts';
import { initPlayInput, readInput } from '../../app/input.ts';
import { validateMapForMission, type MapViolation } from '../../logic/mapCheck.ts';
import { generateMap } from '../../logic/mapgen.ts';
import { stream } from '../../logic/rng.ts';
import { applyPose, cameraPose, followPose } from '../../view/camera.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../../view/field.ts';
import { buildAreaFrames, buildSpawnMarks, countProps, groundTiles } from '../map/build.ts';
import { loadDevMap } from '../map/store.ts';
import { buildOutdoor, buildTargets } from '../outdoor/build.ts';
import { buildFlatRange, moveFeelFromParams } from './move.ts';

declare global {
  interface Window {
    sbMapReport?: () => string;
  }
}

type Source = 'hand' | 'gen' | 'edit';

// The mission's names that stand past this map's range: the guns and the magazine are behind the seawall, and the
// beach's mortar and the battery are on the other side of the bounds.
const OUT_OF_RANGE = {
  targets: ['main-gun-1', 'main-gun-2', 'magazine'],
  waves: ['beach-mortar', 'battery'],
} as const;

const SKY_COLOR = 0x9db8c6;
const FOG_NEAR = 100; // m
const FOG_FAR = 240; // m; the map is 230 m deep
const CHUNK = 32; // m
const CHUNK_MIN = 3000; // triangles
const MECH_MARGIN = 4; // how far inside the front edge the mech starts (m)

// The fog's numbers #view-map sets; #view-fx starts from the same ones when its own look is off.
export const MAP_FOG = { near: FOG_NEAR, far: FOG_FAR } as const;

export interface MapScene {
  built: ReturnType<typeof buildOutdoor>;
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

function sourceOf(params: URLSearchParams): Source {
  const value = params.get('src');
  return value === 'gen' || value === 'edit' ? value : 'hand';
}

function seedOf(params: URLSearchParams): number | null {
  const value = params.get('seed');
  if (value === null || !/^\d+$/.test(value)) return null;
  return Number(value) >>> 0;
}

function emptyMap(bounds: MapBounds): MapDef {
  return { id: 'empty', bounds, props: [], targets: [], spawns: {} };
}

// The map the URL asks for. The edited map is the editor's saved one; a MapDef is never guessed from a broken save.
function mapOf(source: Source, seed: number | null): { map: MapDef; message: string } {
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
export function buildMapScene(map: MapDef): MapScene {
  el('#sbApp').hidden = true;
  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = false;
  const ground = scene.getObjectByName(GROUND_NAME);
  if (ground) ground.visible = false;

  const fog = scene.fog instanceof THREE.Fog ? scene.fog : new THREE.Fog(SKY_COLOR, FOG_NEAR, FOG_FAR);
  fog.near = FOG_NEAR;
  fog.far = FOG_FAR;
  scene.fog = fog;
  camera.far = FOG_FAR + 20;
  camera.updateProjectionMatrix();

  const built = buildOutdoor([...groundTiles(map.bounds), ...map.props], { chunk: CHUNK, chunkMin: CHUNK_MIN });
  scene.add(built.group);
  scene.add(buildTargets(map.targets));
  scene.add(buildAreaFrames(M1.areas, map.bounds));
  scene.add(buildSpawnMarks(map.spawns));
  return { built };
}

export function showMap(_hash: string) {
  const params = new URLSearchParams(location.search);
  const source = sourceOf(params);
  const seed = seedOf(params);
  const { map, message } = mapOf(source, seed);
  const counts = countProps(map.props);
  const violations = validateMapForMission(map, M1, OUT_OF_RANGE);

  const { built } = buildMapScene(map);

  const { moveTune, feelTune } = moveFeelFromParams(params);
  const range = buildFlatRange(CAMERA_TUNE.fov, { targets: false });
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
  let camPos: THREE.Vector3 | null = null;

  addSystem({
    name: 'sb-map',
    update: dt => {
      const read = readInput(dt);
      pitch = clamp(pitch + read.pitchDelta, CAMERA_TUNE.pitchMin, CAMERA_TUNE.pitchMax);
      const step = range.step(read.input, dt, moveTune, feelTune);
      const pose = cameraPose({ x: mech.x, y: mech.y, z: mech.z, yaw: mech.yaw }, pitch, CAMERA_TUNE, []);
      camPos = camPos ? followPose(camPos, pose.pos, dt, CAMERA_TUNE.lag) : pose.pos.clone();
      const pos = camPos.clone().add(step.offset);
      applyPose(camera, { ...pose, pos }, step.fov);
      cullChunks(built.chunks, built.group, camera, FOG_FAR);
      hud.textContent = hudText(source, seed, message, map, counts, violations, mech);
    },
  });
}
