// The fortress's sea-wall nest and the open ground before it (#view-fortress, SB-1830). The hand map's fortress is drawn
// with the beach's builder, the mech stands on the approach at (0, -50), and the buttons start the nest's sweep, drop the
// wave from the wall's top and put everything back. The panel turns FORTRESS_GUN_TUNE; window.sbFortressReport() gives
// the same state and the last frame's draw counts as JSON.
import * as THREE from 'three';
import { addSystem, el } from '@engine/core/index.ts';
import { camera, renderer, scene } from '@engine/render/index.ts';
import { ENEMY_BULLET_COLOR } from '../../data/colors.ts';
import { M1_WAVE_DROP, M1_WAVE_ENEMY } from '../../data/enemies.ts';
import { FORTRESS_GUN_TUNE, FORTRESS_SHUTTER_TUNE } from '../../data/fortress.ts';
import { lookOf } from '../../data/looks.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { M1_MECH, M1_MECH_PALETTE, M1_WEAPON_SCALE } from '../../data/mech.ts';
import { M1 } from '../../data/missions/m1.ts';
import { MECH_TUNE } from '../../data/tune.ts';
import { newEnemy, stepEnemy, type EnemyShot, type EnemyState } from '../../logic/enemies.ts';
import { newFortressGun, stepFortressGun } from '../../logic/fortress.ts';
import { newGame, type GameModel } from '../../logic/game.ts';
import { stream } from '../../logic/rng.ts';
import { buildEnemyView, drawEnemies, type EnemyView } from '../../view/enemies.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../../view/field.ts';
import { applyLookTo } from '../../view/look.ts';
import { buildMechVisual } from '../../view/mechModel.ts';
import { buildWorld } from '../../view/world.ts';
import { createTunePanel, type TuneRange } from '../tunePanel.ts';

declare global {
  interface Window {
    sbFortressReport?: () => string;
  }
}

const MECH_X = 0; // in the open ground before the sea gate (m)
const MECH_Z = -50;
const CAM_POS = [0, 9, -38] as const; // over the mech's shoulder, looking at the wall's nest
const CAM_LOOK = [12, 9, -68] as const;
const TRACER_LENGTH = 4; // as long as the game draws an enemy's tracer (m)
const MAX_TRACERS = 96; // the most lines drawn at once
const GUN_ID = 'fortress-gun';

const TUNE_RANGES: Record<string, TuneRange> = {
  range: { min: 20, max: 250, step: 5 },
  damage: { min: 1, max: 20, step: 1 },
  shots: { min: 1, max: 16, step: 1 },
  arcDeg: { min: 0, max: 120, step: 1 },
  interval: { min: 0.05, max: 1, step: 0.01 },
  rest: { min: 0.5, max: 10, step: 0.1 },
  spread: { min: 0, max: 10, step: 0.5 },
  bulletSpeed: { min: 50, max: 400, step: 10 },
  muzzle: { min: 0.2, max: 1, step: 0.05 },
  muzzleGap: { min: 0, max: 3, step: 0.1 },
  openSec: { min: 0.2, max: 2, step: 0.05 },
  sink: { min: 0, max: 10, step: 0.5 },
};
const TUNE_LABELS: Record<string, string> = {
  range: '射程（m）',
  damage: '1発の装甲',
  shots: '掃射の弾数',
  arcDeg: '掃射の弧（度）',
  interval: '掃射の間隔（s）',
  rest: '次の掃射まで（s）',
  spread: '1発の散らし（度）',
  bulletSpeed: '弾の速さ（m/s）',
  muzzle: '撃つ高さ（箱の高さの割合）',
  muzzleGap: '箱の海側の面から（m）',
  openSec: 'シャッターが開く秒数（s）',
  sink: '閉じた砲の沈み（m）',
};

interface Shell {
  shot: EnemyShot;
  left: number; // the range left (m)
}

interface TracerView {
  lines: THREE.LineSegments;
  positions: THREE.BufferAttribute;
}

// The nest's tracers: one LineSegments, drawn from each shot's head back along its direction.
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

function drawTracers(view: TracerView, shells: readonly Shell[]): void {
  const count = Math.min(shells.length, MAX_TRACERS);
  for (let i = 0; i < count; i++) {
    const { x, y, z, dx, dy, dz } = shells[i].shot;
    view.positions.setXYZ(i * 2, x - dx * TRACER_LENGTH, y - dy * TRACER_LENGTH, z - dz * TRACER_LENGTH);
    view.positions.setXYZ(i * 2 + 1, x, y, z);
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

// The wave from the wall's top: one enemy at each of the map's places for it, at the wall's height.
function dropWave(): EnemyState[] {
  const places = M1B_HAND.spawns['fortress-drop'] ?? [];
  const kinds = M1_WAVE_ENEMY['fortress-drop'] ?? [];
  const y = M1_WAVE_DROP['fortress-drop'] ?? 0;
  return places.map((place, i) =>
    newEnemy(`fortress-drop-${i + 1}`, 'fortress-drop', kinds[i] ?? 'grunt', place.x, place.z, y),
  );
}

export function showFortress(_hash: string) {
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

  const model = buildMechVisual(
    { build: M1_MECH, palette: M1_MECH_PALETTE, weaponScale: M1_WEAPON_SCALE },
    MECH_TUNE.height,
  );
  model.position.set(game.mech.x, game.mech.y, game.mech.z);
  scene.add(model);

  const enemyView: EnemyView = buildEnemyView();
  const tracerView = buildTracerView();
  let sweeping = false;
  let shells: Shell[] = [];
  camera.position.set(...CAM_POS);
  camera.lookAt(...CAM_LOOK);
  camera.fov = 55;
  camera.updateProjectionMatrix();

  const hud = document.createElement('div');
  hud.id = 'sbFortressHud';
  hud.style.cssText =
    'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);padding:4px 6px;' +
    'font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none;z-index:5';
  document.body.appendChild(hud);

  const extra = document.createElement('div');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  extra.appendChild(row);
  const sweep = button(row, '掃射を始める', () => {
    // start on the next frame, not after the rest, so the button shows the burst at once
    game.fortressGun = { wait: 0, burstLeft: 0 };
    sweeping = true;
  });
  sweep.dataset.sbFortress = 'sweep';
  const drop = button(row, '壁の上の波を出す', () => {
    game.enemies = dropWave();
  });
  drop.dataset.sbFortress = 'drop';
  const reset = button(row, '戻す', () => {
    sweeping = false;
    game.fortressGun = newFortressGun();
    shells = [];
    game.enemies = [];
  });
  reset.dataset.sbFortress = 'reset';

  const note = document.createElement('div');
  note.style.cssText = 'margin-top:6px;color:#9fb3c0;white-space:pre-wrap';
  note.textContent = '掃射の敵は要塞の前の遮蔽で防げる。\n保存はしない。';
  extra.appendChild(note);

  createTunePanel({
    title: '要塞の機関砲 #view-fortress',
    extra,
    groups: [
      { name: 'FORTRESS_GUN_TUNE', table: FORTRESS_GUN_TUNE, ranges: TUNE_RANGES, labels: TUNE_LABELS },
      { name: 'FORTRESS_SHUTTER_TUNE', table: FORTRESS_SHUTTER_TUNE, ranges: TUNE_RANGES, labels: TUNE_LABELS },
    ],
  });

  window.sbFortressReport = () => {
    const gun = game.targets.find(target => target.id === GUN_ID);
    return JSON.stringify({
      mech: { x: game.mech.x, z: game.mech.z },
      gun:
        gun === undefined
          ? null
          : {
              id: gun.id,
              hp: gun.hp,
              y: gun.box.minY,
              wait: game.fortressGun.wait,
              burstLeft: game.fortressGun.burstLeft,
            },
      bullets: shells.length,
      enemies: game.enemies.length,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    });
  };

  addSystem({
    name: 'sb-fortress',
    update: dt => {
      game.time += dt;
      const gun = game.targets.find(target => target.id === GUN_ID);
      if (sweeping && gun !== undefined && gun.hp > 0) {
        const blockers = [
          ...game.propBoxes,
          ...game.targets.filter(other => other.hp > 0 && other.id !== gun.id).map(other => other.box),
        ];
        const shot = stepFortressGun(game.fortressGun, gun.box, game.mech, blockers, dt, stream('battery'));
        if (shot) shells.push({ shot, left: FORTRESS_GUN_TUNE.range });
      }
      for (const shell of shells) {
        const fly = Math.min(FORTRESS_GUN_TUNE.bulletSpeed * dt, shell.left);
        shell.shot.x += shell.shot.dx * fly;
        shell.shot.y += shell.shot.dy * fly;
        shell.shot.z += shell.shot.dz * fly;
        shell.left -= fly;
      }
      shells = shells.filter(shell => shell.left > 0);

      const enemyWorld = {
        rects: game.rects,
        propBoxes: [...game.propBoxes, ...game.targets.filter(target => target.hp > 0).map(target => target.box)],
        bounds: game.map.bounds,
        nav: null,
        others: game.enemies,
      };
      for (const enemy of game.enemies) stepEnemy(enemy, game.mech, enemyWorld, dt, stream('enemies'));

      model.position.set(game.mech.x, game.mech.y, game.mech.z);
      drawEnemies(enemyView, game);
      drawTracers(tracerView, shells);
      const hp = gun?.hp ?? 0;
      hud.textContent =
        `機体 x ${game.mech.x} z ${game.mech.z}\n` +
        `機関砲 ${GUN_ID} 体力 ${hp} / y ${gun?.box.minY ?? 0}\n` +
        `掃射 ${sweeping ? '入' : '切'} / 待ち ${game.fortressGun.wait.toFixed(2)}s / 残り ${game.fortressGun.burstLeft}\n` +
        `弾 ${shells.length} / 敵 ${game.enemies.length}\n` +
        `描画 calls ${renderer.info.render.calls} / tris ${renderer.info.render.triangles}`;
    },
  });
}
