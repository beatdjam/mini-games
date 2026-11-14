// The heavy command mech (#view-warden, SB-1850). The hand map's yard is drawn with the beach's builder, the mech stands
// in the yard at (0, -95), and the warden comes out of the land gate at (0, -118). The buttons jump to each phase, start
// a charge, expose its back, bring it down or put it back. The panel turns WARDEN_TUNE; window.sbWardenReport() gives the
// phase, the health and the last frame's draw counts as JSON.
import * as THREE from 'three';
import { addSystem, el } from '@engine/core/index.ts';
import { camera, renderer, scene } from '@engine/render/index.ts';
import { ENEMY_BULLET_COLOR } from '../../data/colors.ts';
import { ENEMIES } from '../../data/enemies.ts';
import { lookOf } from '../../data/looks.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { M1_MECH, M1_MECH_PALETTE, M1_WEAPON_SCALE } from '../../data/mech.ts';
import { M1 } from '../../data/missions/m1.ts';
import { MECH_TUNE } from '../../data/tune.ts';
import { WARDEN_TUNE } from '../../data/warden.ts';
import { newEnemy, type EnemyState } from '../../logic/enemies.ts';
import { newGame, type GameModel } from '../../logic/game.ts';
import { stepShells } from '../../logic/hazards.ts';
import { stream } from '../../logic/rng.ts';
import { stepWarden, type WardenState } from '../../logic/warden.ts';
import { spawnBoom } from '../../view/boom.ts';
import { buildEnemyView, drawEnemies, type EnemyView } from '../../view/enemies.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../../view/field.ts';
import { buildHazardView, drawHazards, type HazardView } from '../../view/hazards.ts';
import { applyLookTo } from '../../view/look.ts';
import { buildMechVisual } from '../../view/mechModel.ts';
import { buildWardenChargeView, drawWardenCharge } from '../../view/play.ts';
import { buildWorld } from '../../view/world.ts';
import { createTunePanel, type TuneRange } from '../tunePanel.ts';

declare global {
  interface Window {
    sbWardenReport?: () => string;
  }
}

const MECH_X = 0; // in the yard (m)
const MECH_Z = -95;
const WARDEN_X = 0; // inside the land gate (m)
const WARDEN_Z = -118;
const CAM_POS = [16, 10, -92] as const; // over the mech's shoulder, looking at the gate
const CAM_LOOK = [0, 4, -116] as const;
const TRACER_LENGTH = 4; // as long as the game draws an enemy's tracer (m)
const MAX_TRACERS = 48; // the most lines drawn at once

const TUNE_RANGES: Record<string, TuneRange> = {
  turnRate: { min: 0.2, max: 4, step: 0.1 },
  walkOutSec: { min: 0, max: 10, step: 0.5 },
  phase2At: { min: 0.1, max: 1, step: 0.05 },
  'burst.shots': { min: 1, max: 8, step: 1 },
  'burst.interval': { min: 0.05, max: 1, step: 0.01 },
  burstTelegraph: { min: 0, max: 2, step: 0.05 },
  burstRest: { min: 0.2, max: 5, step: 0.1 },
  'charge.telegraph': { min: 0.1, max: 3, step: 0.05 },
  'charge.distance': { min: 5, max: 60, step: 1 },
  'charge.speed': { min: 5, max: 40, step: 1 },
  'charge.stagger': { min: 0.5, max: 5, step: 0.1 },
  mortarEvery: { min: 1, max: 20, step: 0.5 },
  'mortar.count': { min: 1, max: 8, step: 1 },
  'mortar.radius': { min: 1, max: 12, step: 0.5 },
  'mortar.warn': { min: 0.5, max: 6, step: 0.1 },
  'mortar.damage': { min: 1, max: 50, step: 1 },
  'mortar.spread': { min: 0, max: 20, step: 1 },
  frontMul: { min: 0, max: 1, step: 0.05 },
  sideMul: { min: 0, max: 2, step: 0.05 },
  backMul: { min: 1, max: 4, step: 0.1 },
  dieSec: { min: 0.5, max: 8, step: 0.5 },
  addsAt: { min: 0.1, max: 0.9, step: 0.05 },
  'look.bandWidth': { min: 1, max: 14, step: 0.5 },
};

const TUNE_LABELS: Record<string, string> = {
  turnRate: '旋回（rad/s）',
  walkOutSec: '出てから撃つまで（s）',
  phase2At: '段階2になる体力の割合',
  'burst.shots': '三連射の弾数',
  'burst.interval': '三連射の間隔（s）',
  burstTelegraph: '三連射の予兆（s）',
  burstRest: '撃ったあと止まる（s）',
  'charge.telegraph': '突進のしゃがみ（s）',
  'charge.distance': '突進の距離（m）',
  'charge.speed': '突進の速さ（m/s）',
  'charge.stagger': 'よろけ（s）',
  mortarEvery: '特別な攻撃の間隔（s）',
  'mortar.count': '迫撃砲の弾数',
  'mortar.radius': '迫撃砲の爆風（m）',
  'mortar.warn': '迫撃砲の予告（s）',
  'mortar.damage': '迫撃砲の装甲',
  'mortar.spread': '迫撃砲の散らし（m）',
  frontMul: '正面の倍率',
  sideMul: '横の倍率',
  backMul: '背中の倍率',
  dieSec: '倒れてから爆発まで（s）',
  addsAt: '突撃型を呼ぶ体力の割合',
  'look.bandWidth': '赤い帯の幅（m）',
};

interface Tracer {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  left: number;
}

interface TracerView {
  lines: THREE.LineSegments;
  positions: THREE.BufferAttribute;
}

function buildTracerView(): TracerView {
  const positions = new THREE.BufferAttribute(new Float32Array(MAX_TRACERS * 2 * 3), 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positions);
  geometry.setDrawRange(0, 0);
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: ENEMY_BULLET_COLOR }));
  lines.frustumCulled = false;
  scene.add(lines);
  return { lines, positions };
}

function drawTracers(view: TracerView, tracers: readonly Tracer[]): void {
  const count = Math.min(tracers.length, MAX_TRACERS);
  for (let i = 0; i < count; i++) {
    const tracer = tracers[i];
    view.positions.setXYZ(
      i * 2,
      tracer.x - tracer.dx * TRACER_LENGTH,
      tracer.y - tracer.dy * TRACER_LENGTH,
      tracer.z - tracer.dz * TRACER_LENGTH,
    );
    view.positions.setXYZ(i * 2 + 1, tracer.x, tracer.y, tracer.z);
  }
  view.positions.needsUpdate = true;
  view.lines.geometry.setDrawRange(0, count * 2);
}

function button(parent: HTMLElement, label: string, run: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.style.cssText =
    'flex:1;min-width:0;height:26px;border:1px solid rgba(213,228,238,0.35);background:rgba(10,17,25,0.7);' +
    'color:inherit;font:inherit';
  node.addEventListener('click', run);
  parent.appendChild(node);
  return node;
}

// A fresh warden inside the land gate.
function newWardenEnemy(): EnemyState {
  return newEnemy('warden-1', 'warden', 'warden', WARDEN_X, WARDEN_Z);
}

export function showWarden(_hash: string) {
  el('#sbApp').hidden = true;
  for (const name of [GROUND_NAME, SIZE_BOX_NAME]) {
    const node = scene.getObjectByName(name);
    if (node) node.visible = false;
  }
  const world = buildWorld(M1B_HAND);
  applyLookTo(lookOf(M1.id), world.built.group);

  const game: GameModel = newGame(M1B_HAND);
  game.mech.x = MECH_X;
  game.mech.z = MECH_Z;
  game.mech.y = 0;
  game.mech.grounded = true;
  game.mech.yaw = 0;
  game.enemies = [newWardenEnemy()];

  const model = buildMechVisual(
    { build: M1_MECH, palette: M1_MECH_PALETTE, weaponScale: M1_WEAPON_SCALE },
    MECH_TUNE.height,
  );
  model.position.set(game.mech.x, game.mech.y, game.mech.z);
  scene.add(model);

  const enemyView: EnemyView = buildEnemyView();
  const hazardView: HazardView = buildHazardView();
  const chargeView = buildWardenChargeView();
  const tracerView = buildTracerView();
  let tracers: Tracer[] = [];
  let smokeT = 0;
  camera.position.set(...CAM_POS);
  camera.lookAt(...CAM_LOOK);
  camera.fov = 55;
  camera.updateProjectionMatrix();

  const hud = document.createElement('div');
  hud.id = 'sbWardenHud';
  hud.style.cssText =
    'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);padding:4px 6px;' +
    'font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none;z-index:5';
  document.body.appendChild(hud);

  const stateOf = (): WardenState | undefined => game.enemies[0]?.warden;
  const reset = (): void => {
    game.enemies = [newWardenEnemy()];
    game.shells = [];
    tracers = [];
    smokeT = 0;
  };

  const extra = document.createElement('div');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:4px;margin-bottom:4px';
  extra.appendChild(row);
  button(row, '段階1', () => {
    reset();
    const state = stateOf();
    if (state) state.timer = 0;
  }).dataset.sbWarden = 'phase1';
  button(row, '段階2', () => {
    reset();
    const enemy = game.enemies[0];
    const state = stateOf();
    if (!enemy || !state) return;
    enemy.hp = ENEMIES.warden.hp * WARDEN_TUNE.phase2At;
    state.phase = 'burst';
    state.burstLeft = 0;
    state.timer = 0;
    state.mortarT = 0;
  }).dataset.sbWarden = 'phase2';
  const row2 = document.createElement('div');
  row2.style.cssText = 'display:flex;gap:4px;margin-bottom:4px';
  extra.appendChild(row2);
  button(row2, '突進', () => {
    reset();
    const state = stateOf();
    if (!state) return;
    state.phase = 'charge';
    state.timer = WARDEN_TUNE.charge.telegraph;
    state.chargeLeft = WARDEN_TUNE.charge.distance;
  }).dataset.sbWarden = 'charge';
  button(row2, 'よろけ', () => {
    const state = stateOf();
    if (!state) return;
    state.phase = 'stagger';
    state.timer = WARDEN_TUNE.charge.stagger;
    state.exposed = WARDEN_TUNE.charge.stagger;
  }).dataset.sbWarden = 'stagger';
  const row3 = document.createElement('div');
  row3.style.cssText = 'display:flex;gap:4px;margin-bottom:4px';
  extra.appendChild(row3);
  button(row3, '倒す', () => {
    const enemy = game.enemies[0];
    const state = stateOf();
    if (!enemy || !state) return;
    enemy.hp = 0;
    state.dying = 0;
  }).dataset.sbWarden = 'down';
  button(row3, '戻す', reset).dataset.sbWarden = 'reset';

  const note = document.createElement('div');
  note.style.cssText = 'margin-top:6px;color:#9fb3c0;white-space:pre-wrap';
  note.textContent = '正面は硬く、横と背中が通る。突進を壁で止めると2秒よろける。\n保存はしない。';
  extra.appendChild(note);

  createTunePanel({
    title: '重装指揮機 #view-warden',
    extra,
    groups: [{ name: 'WARDEN_TUNE', table: WARDEN_TUNE, ranges: TUNE_RANGES, labels: TUNE_LABELS }],
  });

  window.sbWardenReport = () => {
    const enemy = game.enemies[0];
    const state = enemy?.warden;
    return JSON.stringify({
      mech: { x: game.mech.x, z: game.mech.z, armor: game.armor },
      warden:
        enemy === undefined || state === undefined
          ? null
          : {
              id: enemy.id,
              x: enemy.x,
              z: enemy.z,
              yaw: enemy.yaw,
              hp: enemy.hp,
              maxHp: ENEMIES.warden.hp,
              phase: state.phase,
              timer: state.timer,
              burstLeft: state.burstLeft,
              exposed: state.exposed,
              called: state.called,
              dying: state.dying,
            },
      bullets: tracers.length,
      shells: game.shells.length,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    });
  };

  addSystem({
    name: 'sb-warden',
    update: dt => {
      game.time += dt;
      const enemy = game.enemies[0];
      if (enemy?.warden !== undefined) {
        const worldForStep = {
          rects: game.rects,
          propBoxes: [...game.propBoxes, ...game.targets.filter(target => target.hp > 0).map(target => target.box)],
          bounds: game.map.bounds,
          nav: null,
          others: game.enemies,
        };
        const out = stepWarden(enemy.warden, enemy, game.mech, worldForStep, dt, stream('enemies'));
        for (const shot of out.shots) {
          tracers.push({ ...shot, left: ENEMIES.warden.fireRange });
        }
        game.shells.push(...out.shells);
      }
      for (const tracer of tracers) {
        const fly = Math.min(ENEMIES.warden.bulletSpeed * dt, tracer.left);
        tracer.x += tracer.dx * fly;
        tracer.y += tracer.dy * fly;
        tracer.z += tracer.dz * fly;
        tracer.left -= fly;
      }
      tracers = tracers.filter(tracer => tracer.left > 0);
      stepShells(game.shells, dt);
      if (enemy !== undefined && enemy.hp <= 0 && (enemy.warden?.dying ?? 0) > 0) {
        smokeT -= dt;
        if (smokeT <= 0) {
          spawnBoom('small', enemy.x, 1.5, enemy.z);
          smokeT = 0.7;
        }
      }

      model.position.set(game.mech.x, game.mech.y, game.mech.z);
      drawEnemies(enemyView, game);
      drawWardenCharge(chargeView, game);
      drawHazards(hazardView, game);
      drawTracers(tracerView, tracers);
      const state = stateOf();
      const hp = enemy?.hp ?? 0;
      hud.textContent =
        `機体 x ${game.mech.x} z ${game.mech.z}\n` +
        `中ボス 体力 ${hp} / ${ENEMIES.warden.hp}\n` +
        `段階 ${state?.phase ?? '-'} / 残り ${state?.timer.toFixed(2) ?? '-'}s / 露出 ${state?.exposed.toFixed(2) ?? '-'}s\n` +
        `弾 ${tracers.length} / 迫撃 ${game.shells.length}\n` +
        `描画 calls ${renderer.info.render.calls} / tris ${renderer.info.render.triangles}`;
    },
  });
}
