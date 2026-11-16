// The three enemy roles side by side (#view-grunts, SB-1480): the M1 B beach with one grunt, one assault and one heavy,
// seen from close (10m) and from far (80m), so the silhouette can be judged at both distances. It never reads the game's
// state; the panel turns the shape knobs of data/enemyLooks.ts and rebuilds the shapes.
import type * as THREE from 'three';
import { addSystem, el } from '@engine/core/index.ts';
import { camera, cullChunks, renderer } from '@engine/render/index.ts';
import { lookOf } from '../../data/looks.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { SOLDIER_KINDS, type SoldierKind } from '../../data/enemies.ts';
import { ENEMY_LOOKS, ENEMY_LOOK_TUNE } from '../../data/enemyLooks.ts';
import { newEnemy } from '../../logic/enemies.ts';
import type { GameModel } from '../../logic/game.ts';
import { applyLookTo } from '../../view/look.ts';
import { buildEnemyView, drawEnemies, removeEnemyView, type EnemyView } from '../../view/enemies.ts';
import { createTunePanel, type TuneRange } from '../tunePanel.ts';
import { buildMapScene, MAP_FOG } from './mapView.ts';

declare global {
  interface Window {
    sbGruntReport?: () => string;
  }
}

export interface GruntsShow {
  setDistance(distance: number): void;
}

// The two distances the card asks for, and the row the three stand on: the open sand between the two hedgehog lines.
const NEAR = 10; // m
const FAR = 80; // m
// The open sand between the two hedgehog lines (line 2 at z 64..72, line 1 at z 131..143), a little east of the middle
// so the blocks and wrecks of this stretch stay out of the side camera's way (SB-2063).
const ROW_X = 10; // m
const ROW_Z = 88; // m
const SPACING = 4.5; // m between two kinds, so a wider heavy does not touch its neighbour
const CAM_HEIGHT = 2.6; // m
const LOOK_HEIGHT = 1.5; // m
const KEY_DISTANCE: Record<string, number> = { '1': NEAR, '2': FAR };

const TUNE_RANGES: Record<string, TuneRange> = {
  width: { min: 0.6, max: 1.6, step: 0.01 },
  lean: { min: -0.6, max: 0.2, step: 0.01 },
  reach: { min: 0.5, max: 1.8, step: 0.01 },
  hip: { min: 0.2, max: 0.7, step: 0.01 },
};
const TUNE_LABELS: Record<string, string> = {
  width: '幅',
  lean: '前のめり（rad）',
  reach: '銃の長さ',
  hip: '腰の高さ',
};

// How many boxes one enemy of a kind is built from (a mirrored box counts twice).
function boxCount(kind: SoldierKind): number {
  return ENEMY_LOOKS[kind].reduce((sum, box) => sum + (box.mirror === 'x' ? 2 : 1), 0);
}

function enemyMeshes(view: EnemyView): THREE.InstancedMesh[] {
  return SOLDIER_KINDS.map(kind => view[kind].mesh);
}

export function showGrunts(_hash: string): GruntsShow {
  el('#sbApp').hidden = true;
  const { built } = buildMapScene(M1B_HAND);
  applyLookTo(lookOf('m1'), built.group);

  const asked = Number(new URLSearchParams(location.search).get('dist'));
  let distance = Number.isFinite(asked) && asked > 0 ? asked : NEAR;

  let view = buildEnemyView();
  const enemies = SOLDIER_KINDS.map((kind, index) => {
    const enemy = newEnemy(
      `view-${kind}`,
      'view',
      kind,
      ROW_X + (index - (SOLDIER_KINDS.length - 1) / 2) * SPACING,
      ROW_Z,
    );
    enemy.yaw = Math.PI; // the front is (-sin yaw, -cos yaw), so this faces the camera standing at +z
    enemy.awake = true;
    return enemy;
  });
  const game = { enemies } as unknown as GameModel;
  drawEnemies(view, game);

  // The beach between the two hedgehog lines is about 70m deep, so a front view from 80m would stand outside the map and
  // lose the ground under the soldiers. Past the near distances the camera moves round to the row's side instead, which
  // keeps the 80m and still shows the beach (SB-2063).
  const SIDE_FROM = 40; // m; past this the front view no longer fits on the map
  const placeCamera = () => {
    const fromSide = distance > SIDE_FROM;
    camera.position.set(fromSide ? ROW_X - distance : ROW_X, CAM_HEIGHT, fromSide ? ROW_Z : ROW_Z + distance);
    camera.lookAt(ROW_X, LOOK_HEIGHT, ROW_Z);
  };
  placeCamera();

  const rebuild = () => {
    removeEnemyView(view);
    view = buildEnemyView();
    drawEnemies(view, game);
  };

  const hud = document.createElement('div');
  hud.dataset.gruntDistance = '1';
  hud.style.cssText =
    'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);padding:4px 6px;' +
    'font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none;z-index:5';
  document.body.appendChild(hud);

  const extra = document.createElement('div');
  const note = document.createElement('div');
  note.style.cssText = 'margin-bottom:6px;color:#9fb3c0;white-space:pre-wrap';
  note.textContent =
    'キー 1 近く（10m）・2 遠く（80m。40m より遠いは横から）。\nつまみを動かすと形を作り直す。\n保存はしない。';
  extra.appendChild(note);

  createTunePanel({
    title: '量産機 #view-grunts',
    extra,
    groups: SOLDIER_KINDS.map(kind => ({
      name: `ENEMY_LOOK_TUNE.${kind}`,
      table: ENEMY_LOOK_TUNE[kind],
      ranges: TUNE_RANGES,
      labels: TUNE_LABELS,
      baseline: { ...ENEMY_LOOK_TUNE[kind] },
    })),
    onChange: rebuild,
  });

  const setDistance = (next: number) => {
    distance = next;
    placeCamera();
    hud.dataset.gruntDistance = String(distance);
    hud.textContent =
      `距離 ${distance}m\n` +
      SOLDIER_KINDS.map(kind => `${kind.padEnd(8)} 箱 ${boxCount(kind)}`).join('\n') +
      `\n描画 calls ${renderer.info.render.calls} / tris ${renderer.info.render.triangles}`;
  };
  setDistance(distance);

  window.sbGruntReport = () => {
    const kinds = SOLDIER_KINDS.map(kind => {
      const mesh = view[kind].mesh;
      return {
        kind,
        draws: 1,
        boxes: boxCount(kind),
        // an indexed shape counts its index, the way the renderer does
        triangles: (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3,
      };
    });
    return JSON.stringify({
      distance,
      kinds,
      draws: enemyMeshes(view).length,
      frame: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
    });
  };

  window.addEventListener('keydown', event => {
    const next = KEY_DISTANCE[event.key];
    if (next !== undefined) setDistance(next);
  });

  addSystem({
    name: 'sb-grunts',
    update: () => {
      cullChunks(built.chunks, built.group, camera, MAP_FOG.far);
    },
  });

  return { setDistance };
}
