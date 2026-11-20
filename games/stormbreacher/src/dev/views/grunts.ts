// The three enemy roles side by side (#view-grunts, SB-1480; rebuilt on the mech kit by SB-2083): the M1 B beach with one
// grunt, one assault and one heavy, seen from close (10m) and from far (80m), so the silhouette can be judged at both
// distances and the simplified far shape can be seen. It never reads the game's state.
import type * as THREE from 'three';
import { addSystem, el } from '@engine/core/index.ts';
import { camera, cullChunks, renderer } from '@engine/render/index.ts';
import { lookOf } from '../../data/looks.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { SOLDIER_KINDS } from '../../data/enemies.ts';
import { newEnemy } from '../../logic/enemies.ts';
import type { GameModel } from '../../logic/game.ts';
import { applyLookTo } from '../../view/look.ts';
import { buildEnemyView, drawEnemies, type EnemyView } from '../../view/enemies.ts';
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

// The mesh a role is actually drawn in after the draw: its full shape, or the simpler one the switch chose.
function soldierMesh(view: EnemyView, kind: (typeof SOLDIER_KINDS)[number]): THREE.InstancedMesh {
  const shown = view[kind].parts.find(part => part.mesh.count > 0);
  return shown?.mesh ?? view[kind].mesh;
}

export function showGrunts(_hash: string): GruntsShow {
  el('#sbApp').hidden = true;
  const { built } = buildMapScene(M1B_HAND);
  applyLookTo(lookOf('m1'), built.group);

  const asked = Number(new URLSearchParams(location.search).get('dist'));
  let distance = Number.isFinite(asked) && asked > 0 ? asked : NEAR;

  const view = buildEnemyView();
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

  const hud = document.createElement('div');
  hud.dataset.gruntDistance = '1';
  hud.style.cssText =
    'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);padding:4px 6px;' +
    'font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none;z-index:5';
  document.body.appendChild(hud);

  const setDistance = (next: number) => {
    distance = next;
    placeCamera();
    // the shapes the copies take depend on how far the camera stands, so the draw follows the camera
    drawEnemies(view, game);
    hud.dataset.gruntDistance = String(distance);
    hud.textContent =
      `距離 ${distance}m　キー 1 近く・2 遠く\n` +
      SOLDIER_KINDS.map(kind => {
        const mesh = soldierMesh(view, kind);
        const triangles = (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
        return `${kind.padEnd(8)} ${mesh === view[kind].mesh ? '全部品' : '簡素'} 三角 ${triangles}`;
      }).join('\n') +
      `\n描画 calls ${renderer.info.render.calls} / tris ${renderer.info.render.triangles}`;
  };
  setDistance(distance);

  window.sbGruntReport = () => {
    // A soldier's shape is one geometry in two material groups (paint and the lit lamps), so every mesh with copies
    // costs one draw per group. The near and far shapes may both stand in a mixed frame, so both count (SB-2086).
    const drawsOf = (mesh: THREE.InstancedMesh): number =>
      mesh.count === 0 ? 0 : Math.max(1, mesh.geometry.groups.length);
    const kinds = SOLDIER_KINDS.map(kind => {
      const kindView = view[kind];
      const parts = kindView.parts.map(part => ({
        level: part.level,
        draws: drawsOf(part.mesh),
        count: part.mesh.count,
        triangles: (part.mesh.geometry.index?.count ?? part.mesh.geometry.attributes.position.count) / 3,
      }));
      const shown = parts.filter(part => part.count > 0);
      return {
        kind,
        level: shown.length === 0 ? 'none' : shown.map(part => part.level).join('+'),
        draws: parts.reduce((sum, part) => sum + part.draws, 0),
        // the shape's own triangles; the copies cost that many each
        triangles: shown.length === 0 ? 0 : shown[0].triangles,
        instances: shown.reduce((sum, part) => sum + part.count, 0),
      };
    });
    return JSON.stringify({
      distance,
      kinds,
      draws: kinds.reduce((sum, kind) => sum + kind.draws, 0),
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
