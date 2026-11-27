// The arena (#view-arena): a flat square of sand with a few concrete blocks, where the sortie's own step, mech, camera,
// FCS, enemies, gunfire, sound and HUD are tried against waves of grunts, assaults and heavies. The waves never end: once
// a group is down, the next comes in a few seconds later. The URL picks the mix, and the top left counts what the run
// did; window.sbArenaReport() returns the same numbers as JSON.
import * as THREE from 'three';
import { addSystem, el, isTouch } from '@engine/core/index.ts';
import { camera, scene } from '@engine/render/index.ts';
import { initPlayInput, readInput } from '../../app/input.ts';
import { cursorAim } from '../../app/play.ts';
import { playInputOptions } from '../../logic/input.ts';
import { mixOf } from '../arenaMix.ts';
import { FCS_QUARTER, FEEL_TUNE, MECH_TUNE, MOVE_TUNE, PLAY_BATTLE_TUNE, type FxTune } from '../../data/tune.ts';
import type { MapDef, MissionDef } from '../../data/types.ts';
import { WEAPONS } from '../../data/weapons.ts';
import { newEnemy } from '../../logic/enemies.ts';
import { newGame, step, type GameModel } from '../../logic/game.ts';
import { mapBlockers } from '../../logic/mapShapes.ts';
import { newWeapon } from '../../logic/weapons.ts';
import { cameraBoxesOfRect } from '../../view/camera.ts';
import { noFade } from '../../view/fade.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../../view/field.ts';
import { placeReticle } from '../../view/hud.ts';
import { buildOutdoor, buildTargets } from '../../view/outdoor.ts';
import { buildPlayView, drawPlay, type PlayView } from '../../view/play.ts';
import { buildShore } from '../../view/shore.ts';
import { resetSound, soundFrame } from '../../view/sound.ts';
import { MAP_FOG, groundTiles, type World } from '../../view/world.ts';
import { createTunePanel } from '../tunePanel.ts';

declare global {
  interface Window {
    sbArenaReport?: () => string;
  }
}

const RESPAWN_SEC = 3; // the seconds between a group's fall and the next group coming in
const ARENA_HALF = 60; // the arena's half-width and half-depth (m): 120 m each way
const ENEMY_NEAR = 34; // the nearest a group comes in (m)
const ENEMY_FAR = 54; // the farthest (m)

// The arena's flat sand and its cover: a few concrete blocks near the middle, well inside the ring the enemies come in on.
const ARENA_MAP: MapDef = {
  id: 'arena',
  bounds: { minX: -ARENA_HALF, maxX: ARENA_HALF, minZ: -ARENA_HALF, maxZ: ARENA_HALF },
  props: [
    { kind: 'block', x: -16, z: -14, yaw: 0.2, scale: 1 },
    { kind: 'block', x: 16, z: -12, yaw: -0.4, scale: 1.1 },
    { kind: 'block', x: 0, z: -28, yaw: 0, scale: 1 },
    { kind: 'block', x: -22, z: 20, yaw: 0.7, scale: 0.9 },
    { kind: 'block', x: 22, z: 22, yaw: -0.2, scale: 1 },
  ],
  targets: [],
  spawns: {},
};

// The smallest mission the sortie's script accepts: no cues, no areas, nothing for the HUD to show but what the run does.
const ARENA_MISSION: MissionDef = {
  id: 'arena',
  cues: [],
  areas: {},
  targets: [],
  waves: [],
  objectives: [],
  marks: [],
  allies: [],
  paths: {},
  places: {},
};

// The battle layer is the beach's own (infantry, shells, planes, smoke); the arena is empty sand, so it asks for none.
const ARENA_BATTLE_TUNE: FxTune = {
  ...PLAY_BATTLE_TUNE,
  shellEvery: 0,
  smokeCubes: 0,
  smokeMax: 0,
  wreckSmoke: 0,
  craters: 0,
  craterCap: 0,
  tracers: 0,
  allies: 0,
  allyWaves: 0,
  holdLossRate: 0,
  squads: 0,
  squad: 0,
  planes: 0,
};

let game: GameModel | null = null; // the arena in play, for the tests; null before it opens
let shownView: PlayView | null = null; // the arena's view, for the tests; null before it opens

// The arena in play, for the tests.
export const currentArenaGame = (): GameModel | null => game;

// The arena's view, for the tests.
export const currentArenaView = (): PlayView | null => shownView;

// The query of the hash (`#view-arena?enemies=grunt:4`) or, when it has none, of the page (`?enemies=grunt:4#view-arena`).
function viewParams(): URLSearchParams {
  const at = location.hash.indexOf('?');
  return new URLSearchParams(at >= 0 ? location.hash.slice(at + 1) : location.search);
}

// Where the i-th enemy stands: a ring round the mech at three distances, all inside the arena's bounds.
function spotOf(i: number, count: number): { x: number; z: number } {
  const angle = Math.PI + (i / Math.max(1, count)) * Math.PI * 2 + 0.2;
  const dist = ENEMY_NEAR + (i % 3) * ((ENEMY_FAR - ENEMY_NEAR) / 2);
  return { x: Math.sin(angle) * dist, z: Math.cos(angle) * dist };
}

// The arena's world: the sand and the blocks, without the sea, the landing craft or the beach's air. The shore group is
// built but not put in the scene, because the sortie's cutscene view asks for the crafts it holds.
function buildArenaWorld(map: MapDef): World {
  const fog = scene.fog instanceof THREE.Fog ? scene.fog : new THREE.Fog(0x9db8c6, MAP_FOG.near, MAP_FOG.far);
  fog.near = MAP_FOG.near;
  fog.far = MAP_FOG.far;
  scene.fog = fog;
  camera.far = MAP_FOG.far + 20;
  camera.updateProjectionMatrix();

  const built = buildOutdoor([...groundTiles(map.bounds), ...map.props], { chunk: 32, chunkMin: 3000 });
  scene.add(built.group);
  const targetGroup = buildTargets(map.targets);
  scene.add(targetGroup);
  return {
    built,
    targets: new Map(),
    targetGroup,
    shutters: new Map(),
    shore: buildShore(map.bounds),
    cameraBoxes: mapBlockers(map).flatMap(cameraBoxesOfRect),
    fade: noFade(),
    targetCameraBoxes: new Map(),
    slots: new Map(),
    propCameraBoxes: new Map(),
    broken: new Set(),
    opened: new Set(),
    breaks: new Map(),
  };
}

// The top left's numbers: the group's fall, the clock, and what the weapon did.
function addHud(): HTMLDivElement {
  const hud = document.createElement('div');
  hud.id = 'sbArenaHud';
  hud.style.cssText =
    'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);padding:4px 6px;' +
    'font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none;z-index:5';
  document.body.appendChild(hud);
  return hud;
}

// The feel, the movement and the soft lock's main values.
function addTunePanel() {
  // The arena aims with FCS_QUARTER on a PC and a touch screen, so the panel writes that table.
  const fcsLabels = {
    cone: '吸着の円錐の大きさ（半角, 度）',
    range: 'ロックが届く距離 (m)',
    spread: '弾のばらつき (度)',
    pull: '照準が敵へ吸い付く速さ (度/秒)',
    nearRange: '近距離とみなす距離 (m)',
    nearSpread: '近距離でのばらつきの残り（割合）',
  };
  const fcsRanges = {
    cone: { min: 0, max: 30, step: 0.5 },
    range: { min: 20, max: 300, step: 5 },
    spread: { min: 0, max: 10, step: 0.1 },
    pull: { min: 0, max: 60, step: 1 },
    nearRange: { min: 0, max: 40, step: 1 },
    nearSpread: { min: 0, max: 10, step: 0.1 },
  };
  createTunePanel({
    id: 'sbArenaTune',
    title: '調整',
    // The fullscreen button (#sbFs in index.html) sits in the top right corner: 10px down, about 25px tall (3px padding,
    // 1px border, a 11-14px line), so 44px leaves about 9px under it. Change this with that button's size or place.
    topOffset: 44,
    groups: [
      {
        name: 'MOVE_TUNE',
        table: MOVE_TUNE,
        labels: {
          walk: '歩く速さ (m/秒)',
          stepHeight: 'ジャンプなしで乗れる段差 (m)',
          jump: 'ジャンプの初速 (m/秒)',
          gravity: '空中の重力 (m/秒²)',
          boost: 'ブーストの速さ (m/秒)',
          turn: 'キーで向きを変える速さ (rad/秒)',
        },
        ranges: {
          walk: { min: 2, max: 15, step: 0.1 },
          stepHeight: { min: 0, max: 2, step: 0.05 },
          jump: { min: 0, max: 16, step: 0.1 },
          gravity: { min: 0, max: 40, step: 1 },
          boost: { min: 5, max: 25, step: 0.5 },
          turn: { min: 0.5, max: 5, step: 0.1 },
        },
      },
      {
        name: 'FEEL_TUNE',
        table: FEEL_TUNE,
        labels: {
          boostFov: 'ブースト中に画角が広がる量 (度)',
          fireShake: '撃つたびの画面の揺れ (m)',
          landShake: '着地の揺れ（落下 10m/秒のとき, m）',
          hitStop: '撃破で機体が止まる時間 (秒)',
          dust: '砂煙の量（倍率, 0 で無し）',
          fireRate: '押しっぱなしの連射 (発/秒)',
        },
        ranges: {
          boostFov: { min: 0, max: 30, step: 1 },
          fireShake: { min: 0, max: 1, step: 0.01 },
          landShake: { min: 0, max: 1, step: 0.01 },
          hitStop: { min: 0, max: 0.3, step: 0.005 },
          dust: { min: 0, max: 3, step: 0.1 },
          fireRate: { min: 1, max: 20, step: 1 },
        },
      },
      {
        name: 'FCS_QUARTER',
        table: FCS_QUARTER,
        labels: fcsLabels,
        ranges: fcsRanges,
      },
    ],
  });
}

// The values the user settled in the arena (2026-11-17) are the game's own now (SB-2072), so the arena opens on them.
export function showArena(_hash: string) {
  const params = viewParams();
  const mix = mixOf(params.get('enemies'));
  const god = params.get('god') !== '0';
  const endlessAmmo = params.get('ammo') === 'inf';

  el('#sbApp').hidden = true;
  const ground = scene.getObjectByName(GROUND_NAME);
  if (ground) ground.visible = false;
  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = false;

  const arena = newGame(ARENA_MAP, ARENA_MISSION, { battleTune: ARENA_BATTLE_TUNE, sectors: false });
  // newGame puts the mech on the landing craft's deck at the map's front edge; the arena starts it in the middle.
  arena.mech.x = 0;
  arena.mech.y = 0;
  arena.mech.z = 0;
  arena.mech.yaw = 0;
  arena.rects = mapBlockers(ARENA_MAP);
  game = arena;

  const view: PlayView = buildPlayView(arena, {
    world: buildArenaWorld(ARENA_MAP),
  });
  shownView = view;
  initPlayInput(playInputOptions());
  el('#touch').hidden = !isTouch;
  // the arena takes no jump (D-50), so its touch layer has no jump button
  el('#btnJump').hidden = true;
  resetSound(arena.radio);

  let kills = 0;
  let shots = 0;
  let hits = 0;
  let round = 0;
  let respawnLeft = -1; // the seconds until the next group, or -1 while a group is up

  function spawnGroup() {
    round++;
    for (let i = 0; i < mix.length; i++) {
      const spot = spotOf(i, mix.length);
      arena.enemies.push(newEnemy(`arena-${round}-${i + 1}`, 'arena', mix[i], spot.x, spot.z));
    }
  }
  spawnGroup();

  // The tanks run dry as the sortie's do; R fills them again, and ?ammo=inf keeps them full.
  function refill() {
    arena.main = newWeapon(arena.main.id);
    arena.sub = newWeapon(arena.sub.id);
  }
  window.addEventListener('keydown', event => {
    if (event.code === 'KeyR') refill();
  });

  const round3 = (value: number): number => Math.round(value * 1000) / 1000;
  const report = () => ({ kills, time: round3(arena.time), shots, hits });
  window.sbArenaReport = () => JSON.stringify(report());

  addTunePanel();
  const hud = addHud();

  addSystem({
    name: 'sb-arena',
    update: dt => {
      const read = readInput(dt);
      step(arena, { ...read.input, ...cursorAim(arena, view, read), sub: read.sub, use: read.use, aim: view.aim }, dt);

      // The sortie's craft lane is the one way past the front edge of the map (logic/game.ts stepBounds); the arena has no
      // craft, so put the mech back on the sand where the craft's walls would have stood.
      const radius = MECH_TUNE.radius;
      const minX = ARENA_MAP.bounds.minX + radius;
      const maxX = ARENA_MAP.bounds.maxX - radius;
      const minZ = ARENA_MAP.bounds.minZ + radius;
      const maxZ = ARENA_MAP.bounds.maxZ - radius;
      if (arena.mech.x < minX) {
        arena.mech.x = minX;
        if (arena.mech.vx < 0) arena.mech.vx = 0;
      } else if (arena.mech.x > maxX) {
        arena.mech.x = maxX;
        if (arena.mech.vx > 0) arena.mech.vx = 0;
      }
      if (arena.mech.z < minZ) {
        arena.mech.z = minZ;
        if (arena.mech.vz < 0) arena.mech.vz = 0;
      } else if (arena.mech.z > maxZ) {
        arena.mech.z = maxZ;
        if (arena.mech.vz > 0) arena.mech.vz = 0;
      }

      // The arena's mech does not fall unless ?god=0 asks for the sortie's way. Its armour is put back full every frame,
      // so the gauge stays full and a hit only shows for the frame it lands.
      if (god) {
        arena.armor = MECH_TUNE.armor;
        if (arena.downed) {
          arena.downed = false;
          arena.events = arena.events.filter(event => event.kind !== 'downed');
        }
      }
      if (endlessAmmo) {
        arena.main.ammo = WEAPONS[arena.main.id].ammo;
        arena.sub.ammo = WEAPONS[arena.sub.id].ammo;
      }

      for (const event of arena.events) {
        if (event.kind === 'shot') shots++;
        else if (event.kind === 'hit' && event.enemy !== null) hits++;
        else if (event.kind === 'enemyDown') kills++;
      }

      const alive = arena.enemies.some(enemy => enemy.hp > 0);
      if (respawnLeft < 0 && !alive) respawnLeft = RESPAWN_SEC;
      else if (respawnLeft >= 0) {
        respawnLeft -= dt;
        if (respawnLeft <= 0) {
          arena.enemies = [];
          spawnGroup();
          respawnLeft = -1;
        }
      }

      soundFrame(arena, dt);
      drawPlay(view, arena, dt, read.pitchDelta);
      placeReticle(view.hud, read.cursor);

      const time = arena.time.toFixed(1);
      hud.textContent =
        `倒した ${kills}  ${time} s${god ? '' : arena.downed ? '  down' : ''}\n` +
        `撃った ${shots}  当てた ${hits}\n` +
        `弾 ${arena.main.ammo}/${WEAPONS[arena.main.id].ammo}  ${arena.sub.ammo}/${WEAPONS[arena.sub.id].ammo}`;
    },
  });
}
