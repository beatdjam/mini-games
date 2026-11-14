// The blast points on the hedgehog line and the charge planted on one (#view-breach, SB-1500). The hand map's line 1 is
// drawn with the beach's builder, the mech stands at the breakthrough at x 40, and the buttons plant a charge, burn its
// fuse to the blast, put everything back, put out the six machine-gun nests that shoot at the mech, and start the aimed
// mortar (SB-1530). The panel turns CHARGE_TUNE, ENEMIES.emplacement and AIMED_MORTAR; window.sbBreachReport() gives the
// same state and the last frame's draw counts as JSON.
import * as THREE from 'three';
import { addSystem, el } from '@engine/core/index.ts';
import { camera, renderer, scene } from '@engine/render/index.ts';
import { ENEMIES } from '../../data/enemies.ts';
import { CHARGE_TUNE } from '../../data/charge.ts';
import { ENEMY_BULLET_COLOR } from '../../data/colors.ts';
import { AIMED_MORTAR } from '../../data/hazards.ts';
import { lookOf } from '../../data/looks.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { M1_MECH, M1_MECH_PALETTE, M1_WEAPON_SCALE } from '../../data/mech.ts';
import { M1 } from '../../data/missions/m1.ts';
import { MECH_TUNE } from '../../data/tune.ts';
import { newGame, type GameModel } from '../../logic/game.ts';
import { newEnemy, stepEnemy } from '../../logic/enemies.ts';
import { inCircle, newAimed, stepAimed, stepShells } from '../../logic/hazards.ts';
import { stream } from '../../logic/rng.ts';
import { buildWorld } from '../../view/world.ts';
import { buildBlastView, drawBlasts, type BlastView } from '../../view/blasts.ts';
import { buildBooms, drawBooms, spawnBoom } from '../../view/boom.ts';
import { buildEnemyView, drawEnemies, type EnemyView } from '../../view/enemies.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../../view/field.ts';
import { buildHazardView, drawHazards, type HazardView } from '../../view/hazards.ts';
import { applyLookTo } from '../../view/look.ts';
import { buildMechVisual } from '../../view/mechModel.ts';
import { createTunePanel, type TuneRange } from '../tunePanel.ts';
import { openBreach, stepBlasts, stepCharge } from '../../logic/blasts.ts';

declare global {
  interface Window {
    sbBreachReport?: () => string;
  }
}

const MECH_X = 40; // the breakthrough on line 1 (m)
const MECH_Z = 150; // just sea-side of the line (m)
const CAM_POS = [40, 9, 161] as const; // over the mech's shoulder, looking down the line's sea-side face
const CAM_LOOK = [40, 1.2, 146] as const;
const CHARGE_RANGES: Record<string, TuneRange> = {
  holdSec: { min: 0.2, max: 4, step: 0.05 },
  reach: { min: 1, max: 15, step: 0.1 },
  fuse: { min: 0.5, max: 10, step: 0.1 },
  blastRadius: { min: 1, max: 30, step: 0.5 },
  damage: { min: 0, max: 200, step: 1 },
  holeHalfWidth: { min: 0.5, max: 15, step: 0.1 },
  holeHalfDepth: { min: 1, max: 30, step: 0.5 },
};
const CHARGE_LABELS: Record<string, string> = {
  holdSec: '長押し（s）',
  reach: '届く距離（m）',
  fuse: '導火線（s）',
  blastRadius: '爆風の半径（m）',
  damage: '爆風の装甲',
  holeHalfWidth: '穴の半幅（m）',
  holeHalfDepth: '穴の半奥行き（m）',
};

// The nest's values the panel turns, by dotted path into ENEMIES.emplacement.
const EMPLACEMENT_RANGES: Record<string, TuneRange> = {
  hp: { min: 20, max: 400, step: 5 },
  fireRange: { min: 20, max: 250, step: 5 },
  damage: { min: 1, max: 20, step: 1 },
  'burst.shots': { min: 1, max: 12, step: 1 },
  'burst.arcDeg': { min: 0, max: 90, step: 1 },
  'burst.interval': { min: 0.05, max: 1, step: 0.01 },
  'burst.rest': { min: 0.5, max: 10, step: 0.1 },
};
const EMPLACEMENT_LABELS: Record<string, string> = {
  hp: '体力',
  fireRange: '射程（m）',
  damage: '1発の装甲',
  'burst.shots': '掃射の弾数',
  'burst.arcDeg': '掃射の弧（度）',
  'burst.interval': '掃射の間隔（s）',
  'burst.rest': '次の掃射まで（s）',
};

// The aimed mortar's values the panel turns.
const AIMED_RANGES: Record<string, TuneRange> = {
  stillSec: { min: 0.5, max: 20, step: 0.1 },
  stillRadius: { min: 0.5, max: 10, step: 0.1 },
  warn: { min: 0.5, max: 10, step: 0.1 },
  radius: { min: 1, max: 20, step: 0.5 },
  damage: { min: 0, max: 100, step: 1 },
  minZ: { min: -170, max: 170, step: 1 },
};
const AIMED_LABELS: Record<string, string> = {
  stillSec: '同じ所にいる（s）',
  stillRadius: '同じと見る半径（m）',
  warn: '予告から着弾まで（s）',
  radius: '爆風の半径（m）',
  damage: '当たったときの装甲',
  minZ: '区間の手前（m）',
};

const TRACER_LENGTH = 4; // how long a nest's tracer is drawn (m)
const TRACER_LIFE = 0.35; // how long a tracer stays in the dev view (s)
const MAX_TRACERS = 64; // the most tracers drawn at once here

interface Tracer {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  life: number; // the seconds it stays drawn
}

interface TracerView {
  lines: THREE.LineSegments;
  positions: THREE.BufferAttribute;
}

// The nests' tracers: one LineSegments, drawn from each shot's head back along its direction.
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

interface BreachReport {
  mech: { x: number; z: number };
  blasts: { id: string; x: number; z: number }[];
  charges: { blast: string; left: number }[];
  plant: { blast: string; hold: number } | null;
  nests: number;
  bullets: number;
  aimed: { still: number; warns: number } | null;
  calls: number;
  triangles: number;
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

export function showBreach(_hash: string) {
  el('#sbApp').hidden = true;
  const map = M1B_HAND;
  for (const name of [GROUND_NAME, SIZE_BOX_NAME]) {
    const node = scene.getObjectByName(name);
    if (node) node.visible = false;
  }
  let world = buildWorld(map);
  applyLookTo(lookOf(M1.id), world.built.group);
  buildBooms(map.bounds);

  const game: GameModel = newGame(map);
  game.mech.x = MECH_X;
  game.mech.z = MECH_Z;
  game.mech.y = 0;
  game.mech.grounded = true;
  game.mech.yaw = 0;

  // Draws the line closed again, or with l1-b's hole open: the map is built anew, since a blast takes props away.
  const showLine = (open: boolean) => {
    scene.remove(world.built.group);
    scene.remove(world.targetGroup);
    scene.remove(world.shore);
    for (const blast of game.blasts) blast.blasted = open && blast.id === 'l1-b';
    world = buildWorld(openBreach(map, open ? ['l1-b'] : []));
    applyLookTo(lookOf(M1.id), world.built.group);
  };

  const model = buildMechVisual(
    { build: M1_MECH, palette: M1_MECH_PALETTE, weaponScale: M1_WEAPON_SCALE },
    MECH_TUNE.height,
  );
  model.position.set(game.mech.x, game.mech.y, game.mech.z);
  scene.add(model);

  const view: BlastView = buildBlastView(map);
  const enemyView: EnemyView = buildEnemyView();
  const hazardView: HazardView = buildHazardView();
  const tracerView = buildTracerView();
  let tracers: Tracer[] = [];
  camera.position.set(...CAM_POS);
  camera.lookAt(...CAM_LOOK);
  camera.fov = 50;
  camera.updateProjectionMatrix();

  const hud = document.createElement('div');
  hud.id = 'sbBreachHud';
  hud.style.cssText =
    'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);padding:4px 6px;' +
    'font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none;z-index:5';
  document.body.appendChild(hud);

  let useHeld = false;
  window.addEventListener('keydown', event => {
    if (event.code === 'KeyF') useHeld = true;
  });
  window.addEventListener('keyup', event => {
    if (event.code === 'KeyF') useHeld = false;
  });
  // a keyup goes to the window that had the focus: leaving the page mid-hold would keep the hold on
  window.addEventListener('blur', () => {
    useHeld = false;
  });

  const extra = document.createElement('div');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  extra.appendChild(row);
  button(row, '仕掛ける', () => {
    stepCharge(game, true, CHARGE_TUNE.holdSec);
  });
  button(row, '爆破', () => {
    for (const charge of game.charges) charge.left = 0;
  });
  button(row, '戻す', () => {
    game.charges = [];
    game.plant = null;
    useHeld = false;
  });
  const lineRow = document.createElement('div');
  lineRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  extra.appendChild(lineRow);
  button(lineRow, 'この線を爆破で開く', () => showLine(true)).dataset.sbBreach = 'open';
  const close = button(lineRow, '閉じた線に戻す', () => {
    game.charges = [];
    game.plant = null;
    useHeld = false;
    showLine(false);
  });
  close.dataset.sbBreach = 'close';
  const nestRow = document.createElement('div');
  nestRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  extra.appendChild(nestRow);
  const putNests = button(nestRow, '機銃座を出す', () => {
    // the six nests of the hand map, shot at the mech as stepEnemies does it
    const places = M1B_HAND.spawns['b-emplacements'] ?? [];
    game.enemies = places.map((place, i) =>
      newEnemy(`b-emplacements-${i + 1}`, 'b-emplacements', 'emplacement', place.x, place.z),
    );
    tracers = [];
  });
  putNests.dataset.sbBreach = 'nests';
  const aimedRow = document.createElement('div');
  aimedRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  extra.appendChild(aimedRow);
  const startAimed = button(aimedRow, '狙う迫撃砲を始める', () => {
    game.aimed = newAimed(game.mech);
    game.shells = [];
  });
  startAimed.dataset.sbBreach = 'aimed';

  const note = document.createElement('div');
  note.style.cssText = 'margin-top:6px;color:#9fb3c0;white-space:pre-wrap';
  note.textContent = 'F を押し続けても仕掛けられる。\n保存はしない。';
  extra.appendChild(note);

  createTunePanel({
    title: '爆破点・爆薬・機銃座・狙う迫撃砲 #view-breach',
    extra,
    groups: [
      { name: 'CHARGE_TUNE', table: CHARGE_TUNE, ranges: CHARGE_RANGES, labels: CHARGE_LABELS },
      {
        name: 'ENEMIES.emplacement',
        table: ENEMIES.emplacement,
        ranges: EMPLACEMENT_RANGES,
        labels: EMPLACEMENT_LABELS,
      },
      { name: 'AIMED_MORTAR', table: AIMED_MORTAR, ranges: AIMED_RANGES, labels: AIMED_LABELS },
    ],
  });

  window.sbBreachReport = () => {
    const report: BreachReport = {
      mech: { x: game.mech.x, z: game.mech.z },
      blasts: game.blasts.map(blast => ({ id: blast.id, x: blast.x, z: blast.z })),
      charges: game.charges.map(charge => ({ blast: charge.blast, left: charge.left })),
      plant: game.plant === null ? null : { blast: game.plant.blast, hold: game.plant.hold },
      nests: game.enemies.filter(enemy => enemy.kind === 'emplacement').length,
      bullets: tracers.length,
      aimed: game.aimed === null ? null : { still: game.aimed.still, warns: game.shells.length },
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
    return JSON.stringify(report);
  };

  addSystem({
    name: 'sb-breach',
    update: dt => {
      game.time += dt;
      const hold = stepCharge(game, useHeld, dt);
      game.plant = hold.plant;
      for (const blown of stepBlasts(game, dt)) {
        spawnBoom('large', blown.blast.x, 0.8, blown.blast.z);
        if (blown.blast.id === 'l1-b' && !blown.blast.blasted) showLine(true);
      }
      // the aimed mortar, if the button has started it: a warning goes on the ground and then lands on the mech
      if (game.aimed !== null) {
        const shell = stepAimed(game.aimed, game.mech, dt);
        if (shell) game.shells.push(shell);
      }
      for (const shell of stepShells(game.shells, dt)) {
        spawnBoom('large', shell.x, 0.8, shell.z);
        if (inCircle(shell, shell.radius, game.mech)) game.armor = Math.max(0, game.armor - shell.damage);
      }
      // the nests shoot at the mech as stepEnemies has them: a prop or a standing target stops the line
      const blockers = [...game.propBoxes, ...game.targets.filter(target => target.hp > 0).map(target => target.box)];
      const world = {
        rects: game.rects,
        propBoxes: blockers,
        bounds: game.map.bounds,
        nav: null,
        others: game.enemies,
      };
      for (const enemy of game.enemies) {
        const shot = stepEnemy(enemy, game.mech, world, dt, stream('emplacements'));
        if (shot) tracers.push({ ...shot, life: TRACER_LIFE });
      }
      const speed = ENEMIES.emplacement.bulletSpeed;
      for (const tracer of tracers) {
        tracer.x += tracer.dx * speed * dt;
        tracer.y += tracer.dy * speed * dt;
        tracer.z += tracer.dz * speed * dt;
        tracer.life -= dt;
      }
      tracers = tracers.filter(tracer => tracer.life > 0);
      model.position.set(game.mech.x, game.mech.y, game.mech.z);
      drawBooms(dt);
      drawBlasts(view, game);
      drawEnemies(enemyView, game);
      drawHazards(hazardView, game);
      drawTracers(tracerView, tracers);
      const near = game.blasts.find(blast => blast.id === 'l1-b');
      hud.textContent =
        `機体 x ${game.mech.x} z ${game.mech.z}\n` +
        `爆破点 l1-b ${near ? `${near.x}, ${near.z}` : 'なし'}\n` +
        `長押し ${game.plant === null ? '-' : `${(game.plant.hold / CHARGE_TUNE.holdSec).toFixed(2)}`}\n` +
        `爆薬 ${game.charges.map(charge => `${charge.blast} ${charge.left.toFixed(2)}s`).join(' ') || '-'}\n` +
        `機銃座 ${game.enemies.filter(enemy => enemy.kind === 'emplacement').length} / 弾 ${tracers.length}\n` +
        `狙う迫撃砲 ${
          game.aimed === null ? '止' : `あと ${Math.max(0, AIMED_MORTAR.stillSec - game.aimed.still).toFixed(1)}s`
        } / 予告 ${game.shells.length} / 装甲 ${game.armor}\n` +
        `描画 calls ${renderer.info.render.calls} / tris ${renderer.info.render.triangles}`;
    },
  });
}
