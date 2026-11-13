// The allied mech of the mission script as the screen draws it (SB-170): the mech's boxes in the ally's colours at a
// smaller size, running along its way and shooting ahead (a tracer a moment, no hit), and the same boxes dark and lying
// over once it has fallen. It reads GameModel and never writes it. A model is built when its ally is first drawn, and
// nothing is drawn while a cutscene plays (the logic holds the allies then too).
import * as THREE from 'three';
import { type Rng } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { ALLY_TUNE } from '../data/allies.ts';
import { ALLY_PALETTE, ALLY_WRECK_PALETTE } from '../data/colors.ts';
import { M1_MECH, M1_WEAPON_SCALE } from '../data/mech.ts';
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
}

export function buildAllyView(): AllyView {
  return { models: new Map() };
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

// Puts each ally at its place, or its wreck once it is down, and lets the ones on their feet shoot ahead through
// `battle`. One that has reached the end of its way keeps shooting at its post: only the next ticket turns the tracers
// toward the nearest enemy.
export function drawAllies(view: AllyView, game: GameModel, battle: Battle, rng: Rng, dt: number): void {
  const shown = game.script.cutscene === null;
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
    model.fireT -= dt;
    if (model.fireT > 0) continue;
    model.fireT = ALLY_TUNE.fireEvery;
    const fx = -Math.sin(ally.yaw);
    const fz = -Math.cos(ally.yaw);
    const speed = ALLY_TUNE.tracerSpeed;
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
}
