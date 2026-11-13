// The allied mech of the mission script as the screen draws it (SB-170): the mech's boxes in the ally's colours at a
// smaller size, running along its way and shooting at the nearest enemy (a tracer a moment, no hit), and the same boxes
// dark and lying over once it has fallen. It reads GameModel and never writes it. A model is built when its ally is
// first drawn, and nothing is drawn while a cutscene plays (the logic holds the allies then too).
import * as THREE from 'three';
import { type Rng } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { ALLY_TUNE } from '../data/allies.ts';
import { ALLY_PALETTE, ALLY_WRECK_PALETTE } from '../data/colors.ts';
import { ENEMIES, ENEMY_CHEST } from '../data/enemies.ts';
import { M1_MECH, M1_WEAPON_SCALE } from '../data/mech.ts';
import { nearestIndex } from '../logic/allies.ts';
import { spreadDir } from '../logic/fcs.ts';
import type { GameModel } from '../logic/game.ts';
import type { Battle } from './battle/index.ts';
import { buildMechVisual, disposeMech } from './mechModel.ts';

export const ALLY_MESH_NAME = 'ally';

interface AllyModel {
  run: THREE.Group; // the ally standing and running
  wreck: THREE.Group; // the same boxes dark, lying over; shown in place of `run` once the ally is down
  fireT: number; // seconds until its next tracer (s)
}

export interface AllyView {
  models: Map<string, AllyModel>; // by the ally's id
  enemyFireT: Map<string, number>; // by the enemy's id: seconds until its next tracer at an ally (s)
}

export function buildAllyView(): AllyView {
  return { models: new Map(), enemyFireT: new Map() };
}

// Builds the mech's boxes with an ally's palette. The meshes get the ally's name, so a count of the player's mech's
// meshes (named 'mech') does not take them.
function buildModel(palette: typeof ALLY_PALETTE): THREE.Group {
  const group = buildMechVisual({ build: M1_MECH, palette, weaponScale: M1_WEAPON_SCALE }, ALLY_TUNE.height);
  group.name = ALLY_MESH_NAME;
  group.traverse(object => {
    object.name = ALLY_MESH_NAME;
  });
  scene.add(group);
  return group;
}

function modelOf(view: AllyView, id: string): AllyModel {
  let model = view.models.get(id);
  if (model === undefined) {
    model = { run: buildModel(ALLY_PALETTE), wreck: buildModel(ALLY_WRECK_PALETTE), fireT: ALLY_TUNE.fireEvery };
    // the e2e finds one ally among the five by its id
    model.run.userData.allyId = id;
    model.wreck.userData.allyId = id;
    view.models.set(id, model);
  }
  return model;
}

// Puts each ally at its place, or its wreck once it is down, and lets the ones on their feet shoot through `battle` at
// the nearest enemy within ALLY_TUNE.engageRange (or ahead when none is near). The enemies answer with tracers of their
// own; both are only a look, with no hit. One that has reached the end of its way keeps shooting at its post.
export function drawAllies(view: AllyView, game: GameModel, battle: Battle, rng: Rng, dt: number): void {
  const shown = game.script.cutscene === null;
  const enemies = game.enemies.filter(enemy => enemy.hp > 0);
  const speed = ALLY_TUNE.tracerSpeed;
  for (const ally of game.allies) {
    if (!shown && !view.models.has(ally.id)) continue;
    const model = modelOf(view, ally.id);
    model.run.visible = shown && !ally.down;
    model.wreck.visible = shown && ally.down;
    model.run.position.set(ally.x, ally.y, ally.z);
    model.run.rotation.y = ally.yaw;
    model.wreck.position.set(ally.x, ally.y, ally.z);
    model.wreck.rotation.set(0, ally.yaw, ALLY_TUNE.wreckTilt, 'YXZ');
    if (!shown || ally.down) continue;
    const pick = nearestIndex({ x: ally.x, z: ally.z }, enemies, ALLY_TUNE.engageRange);
    const enemy = pick === null ? null : enemies[pick];
    // it faces its enemy every frame, so the body does not snap back between shots; the state's yaw is left alone
    if (enemy !== null) model.run.rotation.y = Math.atan2(-(enemy.x - ally.x), -(enemy.z - ally.z));
    model.fireT -= dt;
    if (model.fireT > 0) continue;
    model.fireT = ALLY_TUNE.fireEvery;
    if (enemy === null) {
      const fx = -Math.sin(ally.yaw);
      const fz = -Math.cos(ally.yaw);
      battle.tracer(
        {
          x: ally.x + fx * ALLY_TUNE.fireAhead,
          y: ally.y + ALLY_TUNE.fireHeight,
          z: ally.z + fz * ALLY_TUNE.fireAhead,
        },
        {
          x: fx * speed + rng.rand(-ALLY_TUNE.tracerSpread, ALLY_TUNE.tracerSpread),
          y: rng.rand(-ALLY_TUNE.tracerSpread, ALLY_TUNE.tracerSpread) / 2,
          z: fz * speed,
        },
      );
      continue;
    }
    const from = { x: ally.x, y: ally.y + ALLY_TUNE.fireHeight, z: ally.z };
    const to = { x: enemy.x, y: enemy.y + ENEMIES[enemy.kind].height * ENEMY_CHEST, z: enemy.z };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const aimed = spreadDir({ dx: dx / len, dy: dy / len, dz: dz / len }, ALLY_TUNE.aimSpreadDeg, rng);
    // no hit: the tracer is only a line
    battle.tracer(
      {
        x: from.x + aimed.dx * ALLY_TUNE.fireAhead,
        y: from.y + aimed.dy * ALLY_TUNE.fireAhead,
        z: from.z + aimed.dz * ALLY_TUNE.fireAhead,
      },
      { x: aimed.dx * speed, y: aimed.dy * speed, z: aimed.dz * speed },
    );
  }
  drawEnemyTracers(view, game, battle, rng, dt);
}

// Gives the living enemies a tracer at the nearest ally now and then. No hit: it is only a look, and the enemy's real
// shots are EnemyBullet. The enemies show these at their own intervals, not at the ones of their real fire.
function drawEnemyTracers(view: AllyView, game: GameModel, battle: Battle, rng: Rng, dt: number): void {
  if (game.script.cutscene !== null) return;
  const allies = game.allies.filter(ally => !ally.down);
  if (allies.length === 0) return;
  const speed = ALLY_TUNE.tracerSpeed;
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0 || !enemy.awake) continue;
    let wait = view.enemyFireT.get(enemy.id);
    if (wait === undefined) wait = rng.rand(0, ALLY_TUNE.enemyTracerEvery);
    wait -= dt;
    if (wait > 0) {
      view.enemyFireT.set(enemy.id, wait);
      continue;
    }
    const pick = nearestIndex({ x: enemy.x, z: enemy.z }, allies, ALLY_TUNE.enemyTracerRange);
    view.enemyFireT.set(enemy.id, ALLY_TUNE.enemyTracerEvery);
    if (pick === null) continue;
    const ally = allies[pick];
    const from = { x: enemy.x, y: enemy.y + ENEMIES[enemy.kind].height * ENEMY_CHEST, z: enemy.z };
    const to = { x: ally.x, y: ally.y + ALLY_TUNE.fireHeight, z: ally.z };
    const aimed = spreadDir(
      { dx: to.x - from.x, dy: to.y - from.y, dz: to.z - from.z },
      ALLY_TUNE.enemyTracerSpreadDeg,
      rng,
    );
    battle.tracer(from, { x: aimed.dx * speed, y: aimed.dy * speed, z: aimed.dz * speed });
  }
}

// Takes the models out of the scene.
export function removeAllyView(view: AllyView): void {
  for (const model of view.models.values()) {
    for (const group of [model.run, model.wreck]) {
      scene.remove(group);
      disposeMech(group);
    }
  }
  view.models.clear();
  view.enemyFireT.clear();
}
