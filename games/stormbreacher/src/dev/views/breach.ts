// The blast points on the hedgehog line and the charge planted on one (#view-breach, SB-1500). The hand map's line 1 is
// drawn with the beach's builder, the mech stands at the breakthrough at x 40, and the buttons plant a charge, burn its
// fuse to the blast, put everything back, put out the six machine-gun nests that shoot at the mech, and start the aimed
// mortar (SB-1530). The panel turns CHARGE_TUNE, ENEMIES.emplacement and AIMED_MORTAR; window.sbBreachReport() gives the
// same state and the last frame's draw counts as JSON.
import * as THREE from 'three';
import { addSystem, el } from '@engine/core/index.ts';
import { camera, renderer, scene } from '@engine/render/index.ts';
import { ENEMIES, M1_WAVE_DROP, M1_WAVE_ENEMY } from '../../data/enemies.ts';
import { CHARGE_TUNE } from '../../data/charge.ts';
import { applyMarkerQuery, MARKER_TUNE } from '../../data/marker.ts';
import { ENEMY_BULLET_COLOR } from '../../data/colors.ts';
import { DEPOT_CHOICE_TUNE, FORT_BLAST_TUNE, YARD_TUNE } from '../../data/fortress.ts';
import { AIMED_MORTAR, BARRAGES } from '../../data/hazards.ts';
import { lookOf } from '../../data/looks.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { M1 } from '../../data/missions/m1.ts';
import { MECH_TUNE } from '../../data/tune.ts';
import { newGame, fortressBlast, type GameModel } from '../../logic/game.ts';
import { newEnemy, stepEnemy, type EnemyState } from '../../logic/enemies.ts';
import { newAssist, stepAssist } from '../../logic/assist.ts';
import { inCircle, newAimed, stepAimed, stepShells } from '../../logic/hazards.ts';
import { hudModel } from '../../logic/hud.ts';
import { stream } from '../../logic/rng.ts';
import { buildWorld, syncWorld } from '../../view/world.ts';
import { buildBlastView, drawBlasts, type BlastView } from '../../view/blasts.ts';
import { buildBooms, drawBooms, spawnBoom } from '../../view/boom.ts';
import { buildEnemyView, drawEnemies, type EnemyView } from '../../view/enemies.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../../view/field.ts';
import { buildHazardView, drawHazards, type HazardView } from '../../view/hazards.ts';
import { applyLookTo } from '../../view/look.ts';
import { buildProtoMech } from '../../view/mechProtoModel.ts';
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
// The lights over the blast points (SB-2022). `mode` is 0 dim, 1 map, 2 next (the URL's `?marker=` sets it too).
const MARKER_RANGES: Record<string, TuneRange> = {
  mode: { min: 0, max: 2, step: 1 },
  pillarHeight: { min: 0.5, max: 12, step: 0.1 },
  pillarBaseRadius: { min: 0.05, max: 1, step: 0.01 },
  diamondSize: { min: 0.2, max: 3, step: 0.05 },
  diamondLift: { min: 1, max: 16, step: 0.5 },
  brightness: { min: 0.1, max: 1.5, step: 0.05 },
  fadeStart: { min: 5, max: 40, step: 0.5 },
  fadeEnd: { min: 0, max: 15, step: 0.5 },
};
const MARKER_LABELS: Record<string, string> = {
  mode: '出し方（0 dim・1 map・2 next）',
  pillarHeight: '柱の高さ（m）',
  pillarBaseRadius: '柱の根元の半径（m）',
  diamondSize: '菱形の大きさ（m）',
  diamondLift: '菱形の高さ（m）',
  brightness: '明るさ',
  fadeStart: '薄くなり始める距離（m）',
  fadeEnd: '消える距離（m）',
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

// The depot detour's values the panel turns.
const DEPOT_RANGES: Record<string, TuneRange> = {
  askSec: { min: 0, max: 30, step: 0.5 },
  allyFallSec: { min: 0, max: 10, step: 0.1 },
  lossAllies: { min: 0, max: 5, step: 1 },
  lossSquads: { min: 0, max: 5, step: 1 },
};
const DEPOT_LABELS: Record<string, string> = {
  askSec: 'cp1 から問いまで（s）',
  allyFallSec: '答えから倒れるまで（s）',
  lossAllies: '失う味方機',
  lossSquads: '失う分隊',
};

// The yard's trap and the survivors' assist the panel turns (SB-1840). The gate's x and z go in the table, so the point
// the tracers leave from can be moved too.
const YARD_RANGES: Record<string, TuneRange> = {
  'gate.x': { min: -30, max: 30, step: 1 },
  'gate.z': { min: -80, max: -50, step: 1 },
  gateY: { min: 0, max: 12, step: 0.5 },
  assistEvery: { min: 2, max: 30, step: 0.5 },
  assistEveryDepot: { min: 2, max: 30, step: 0.5 },
  assistTracerSpeed: { min: 20, max: 200, step: 5 },
  assistDust: { min: 0, max: 4, step: 0.1 },
  waveGapSec: { min: 1, max: 20, step: 0.5 },
};
const YARD_LABELS: Record<string, string> = {
  'gate.x': '門の x（m）',
  'gate.z': '門の z（m）',
  gateY: '撃つ高さ（m）',
  assistEvery: '寄らないときの間隔（s）',
  assistEveryDepot: '寄ったときの間隔（s）',
  assistTracerSpeed: '曳光の速さ（m/s）',
  assistDust: '倒れた敵の砂煙の倍率',
  waveGapSec: 'yard-1 から yard-2 まで（s）',
};

// The fortress blast's values the panel turns (SB-1860).
const FORT_BLAST_RANGES: Record<string, TuneRange> = {
  countdownSec: { min: 5, max: 60, step: 1 },
  blastRadius: { min: 5, max: 60, step: 1 },
  damage: { min: 0, max: 300, step: 5 },
};
const FORT_BLAST_LABELS: Record<string, string> = {
  countdownSec: '仕掛けから爆発まで（s）',
  blastRadius: '爆風の半径（m）',
  damage: '中に残ったときの装甲',
};

// The yard's three waves, in the order the script sends them.
const YARD_WAVES = ['yard-1', 'yard-2', 'yard-3'] as const;

// Every enemy of the yard's waves at the map's places for it, as spawnWave in logic/game.ts puts them out.
function yardWave(): EnemyState[] {
  return YARD_WAVES.flatMap(wave => {
    const places = M1B_HAND.spawns[wave] ?? [];
    const kinds = M1_WAVE_ENEMY[wave] ?? [];
    const y = M1_WAVE_DROP[wave] ?? 0;
    return places.map((place, i) => newEnemy(`${wave}-${i + 1}`, wave, kinds[i] ?? 'grunt', place.x, place.z, y));
  });
}

// The shelling's values the panel turns.
const SHELLING_RANGES: Record<string, TuneRange> = {
  interval: { min: 1, max: 15, step: 0.5 },
  warn: { min: 0.5, max: 8, step: 0.1 },
  radius: { min: 1, max: 20, step: 0.5 },
  damage: { min: 0, max: 100, step: 1 },
  aimJitter: { min: 0, max: 40, step: 1 },
  minZ: { min: -170, max: 170, step: 1 },
  maxZ: { min: -170, max: 170, step: 1 },
  'slow.mul': { min: 1, max: 4, step: 0.05 },
};
const SHELLING_LABELS: Record<string, string> = {
  interval: '間隔（s）',
  warn: '予告から着弾まで（s）',
  radius: '爆風の半径（m）',
  damage: '当たったときの装甲',
  aimJitter: '狙いのずれ（m）',
  minZ: '届く手前（m）',
  maxZ: '届く奥（m）',
  'slow.mul': '集積所を潰した後の倍率',
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
  assist: { waves: string[]; left: number } | null;
  yard: number;
  losses: { allies: number; squads: number };
  optional: { key: string; distance: number } | null;
  calls: number;
  brokenProps: number;
  fortressDown: boolean;
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

  const model = buildProtoMech(MECH_TUNE.height);
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
    // The six nests of the hand map, not put to sleep: this page has no script to wake the dormant ones the mission puts
    // out, so each nest wakes the usual way and the view shows what they do once up.
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
  const yardRow = document.createElement('div');
  yardRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  extra.appendChild(yardRow);
  const putYard = button(yardRow, '中庭の波を出す', () => {
    // the yard's three waves at the map's places, shot at the mech as stepEnemies does it
    game.enemies = yardWave();
    game.assist = null;
    tracers = [];
  });
  putYard.dataset.sbBreach = 'yard';
  const startAssist = button(yardRow, '援護を始める', () => {
    // the survivors at the sea gate start shooting at once: the first shot comes on the next frame
    game.assist = newAssist(YARD_WAVES);
    game.assist.left = 0;
  });
  startAssist.dataset.sbBreach = 'assist';
  const fortRow = document.createElement('div');
  fortRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  extra.appendChild(fortRow);
  const plantFort = button(fortRow, '要塞に仕掛ける', () => {
    // the mech at the land wall's inner face, with the charge's point 3 m beyond it in the wall
    game.mech.x = 0;
    game.mech.z = -120;
    game.mech.y = 0;
    game.mech.grounded = true;
    game.mech.yaw = 0;
    stepCharge(game, true, CHARGE_TUNE.holdSec);
  });
  plantFort.dataset.sbBreach = 'fort-plant';
  const advanceFort = button(fortRow, '20秒進める', () => {
    for (const charge of game.charges) {
      if (charge.blast !== 'fort-bomb') continue;
      charge.left = Math.max(0, charge.left - FORT_BLAST_TUNE.countdownSec);
    }
  });
  advanceFort.dataset.sbBreach = 'fort-advance';
  const blowFort = button(fortRow, '爆発', () => {
    for (const charge of game.charges) if (charge.blast === 'fort-bomb') charge.left = 0;
  });
  blowFort.dataset.sbBreach = 'fort-blow';

  const note = document.createElement('div');
  note.style.cssText = 'margin-top:6px;color:#9fb3c0;white-space:pre-wrap';
  note.textContent =
    'F を押し続けても仕掛けられる。\n中庭の波は機体のいる所には出ない（機体は線1にいる）。\n保存はしない。';
  extra.appendChild(note);

  applyMarkerQuery(location.search);
  createTunePanel({
    title: '爆破点・爆薬・機銃座・狙う迫撃砲・中庭 #view-breach',
    extra,
    groups: [
      { name: 'CHARGE_TUNE', table: CHARGE_TUNE, ranges: CHARGE_RANGES, labels: CHARGE_LABELS },
      { name: 'MARKER_TUNE', table: MARKER_TUNE, ranges: MARKER_RANGES, labels: MARKER_LABELS },
      {
        name: 'ENEMIES.emplacement',
        table: ENEMIES.emplacement,
        ranges: EMPLACEMENT_RANGES,
        labels: EMPLACEMENT_LABELS,
      },
      { name: 'AIMED_MORTAR', table: AIMED_MORTAR, ranges: AIMED_RANGES, labels: AIMED_LABELS },
      { name: 'DEPOT_CHOICE_TUNE', table: DEPOT_CHOICE_TUNE, ranges: DEPOT_RANGES, labels: DEPOT_LABELS },
      { name: 'BARRAGES.shelling', table: BARRAGES.shelling, ranges: SHELLING_RANGES, labels: SHELLING_LABELS },
      { name: 'YARD_TUNE', table: YARD_TUNE, ranges: YARD_RANGES, labels: YARD_LABELS },
      {
        name: 'FORT_BLAST_TUNE',
        table: FORT_BLAST_TUNE,
        ranges: FORT_BLAST_RANGES,
        labels: FORT_BLAST_LABELS,
      },
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
      assist: game.assist === null ? null : { waves: game.assist.waves, left: game.assist.left },
      yard: game.enemies.filter(enemy => enemy.hp > 0 && enemy.wave.startsWith('yard-')).length,
      losses: game.losses,
      optional: hudModel(game).optional,
      brokenProps: game.brokenProps.length,
      fortressDown: game.script.fortressDown,
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
        if (blown.blast.id === 'fort-bomb' && !blown.blast.blasted) {
          blown.blast.blasted = true;
          fortressBlast(game, blown.blast);
        } else if (blown.blast.id === 'l1-b' && !blown.blast.blasted) {
          showLine(true);
        }
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
      const enemyWorld = {
        rects: game.rects,
        propBoxes: blockers,
        bounds: game.map.bounds,
        nav: null,
        others: game.enemies,
      };
      for (const enemy of game.enemies) {
        const rng = ENEMIES[enemy.kind].burst ? stream('emplacements') : stream('enemies');
        const shot = stepEnemy(enemy, game.mech, enemyWorld, dt, rng);
        if (shot) tracers.push({ ...shot, life: TRACER_LIFE });
      }
      // the survivors' assist, if the button has started it: one enemy of the yard's waves at a time, with the tracer
      // from above the sea gate
      if (game.assist !== null) {
        const every = game.script.flags.includes('depot-down') ? YARD_TUNE.assistEveryDepot : YARD_TUNE.assistEvery;
        const shot = stepAssist(game.assist, game.enemies, YARD_TUNE.gate, every, dt);
        const enemy = shot === null ? undefined : game.enemies.find(entry => entry.id === shot.id);
        if (enemy !== undefined) {
          enemy.hp = 0;
          const dx = enemy.x - YARD_TUNE.gate.x;
          const dz = enemy.z - YARD_TUNE.gate.z;
          const length = Math.hypot(dx, dz) || 1;
          tracers.push({
            x: YARD_TUNE.gate.x,
            y: YARD_TUNE.gateY,
            z: YARD_TUNE.gate.z,
            dx: dx / length,
            dy: 0,
            dz: dz / length,
            life: TRACER_LIFE,
          });
        }
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
      syncWorld(world, game, dt);
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
        `中庭 ${game.enemies.filter(enemy => enemy.hp > 0 && enemy.wave.startsWith('yard-')).length} / 援護 ${
          game.assist === null ? '止' : `あと ${Math.max(0, game.assist.left).toFixed(1)}s`
        }\n` +
        `描画 calls ${renderer.info.render.calls} / tris ${renderer.info.render.triangles}`;
    },
  });
}
