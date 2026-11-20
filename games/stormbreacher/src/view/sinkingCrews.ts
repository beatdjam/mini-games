// The crews aboard the craft the landing sinks (SB-1969): the infantry stands on the deck and goes down with the craft,
// but those near the blast are thrown over the side into the sea, and the one ally mech aboard tips and slides off. The
// view reads the sink events and never writes the game. All the crews share one pair of instanced meshes (the far form,
// for they are never near), each craft owning a range of their indices; the craft is moved by view/cutscene.ts before
// this file puts its crew on it.
import * as THREE from 'three';
import { disposeTree } from '@engine/render/index.ts';
import { ALLY_TUNE } from '../data/allies.ts';
import { CRAFT_TUNE } from '../data/craft.ts';
import type { CutsceneEvent } from '../data/cutscenes.ts';
import { SINKING_CREWS, SINKING_CREW_TUNE, type DeckPlace } from '../data/landing.ts';
import { SOLDIER_POSE } from '../data/soldiers.ts';
import type { CutsceneId } from '../data/types.ts';
import { buildAllyMech } from './allies.ts';
import { soldierMeshes } from './battle/parts.ts';
import { droidMatricesChanged, showDroid, type DroidMeshes } from './droidPose.ts';
import { disposeProtoMech } from './mechProtoModel.ts';
import { SEA_LEVEL } from './shore.ts';

export const SINKING_CREW_NAME = 'sbSinkingCrew';

type SinkEvent = Extract<CutsceneEvent, { kind: 'sink' }>;

interface CrewSlot {
  place: DeckPlace;
  thrown: boolean; // thrown clear by the blast instead of going down with the craft
  side: number; // +1 or -1: the side it is thrown to
}

export interface SinkingCrewView {
  craft: THREE.Group;
  event: SinkEvent;
  first: number; // the first index this craft's crew takes in the shared meshes
  slots: readonly CrewSlot[];
  ally: THREE.Group | null; // the ally mech aboard, when this craft carries one
  allyPlace: DeckPlace | null;
  allySide: number; // +1 or -1: the side the ally mech slides over
}

export interface SinkingCrewsView {
  group: THREE.Group;
  meshes: DroidMeshes; // one pair for every craft's crew, in the far form
  total: number;
  crews: readonly SinkingCrewView[];
}

const smooth = (u: number): number => u * u * (3 - 2 * u);
const DECK_Y = CRAFT_TUNE.deckTop; // the feet's height on the deck (m)
const HEAD_TOP = SOLDIER_POSE.headY + 0.2; // the head's top above the feet (m): data/droids.ts puts it at 1.56
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const dummy = new THREE.Object3D();
const craftSpin = new THREE.Quaternion();
const spin = new THREE.Quaternion();
const turnEuler = new THREE.Euler();
const local = new THREE.Vector3();
const feet = new THREE.Vector3();
const part = new THREE.Vector3();

// Builds every sinking craft's crew as one pair of instanced meshes in `shore`, in the far form, and the ally mech on the
// craft that has one. Each craft takes a range of the meshes' indices. The crews start out of sight. The entries are the
// landing's `sink` events, matched to SINKING_CREWS by their x.
export function buildSinkingCrews(
  shore: THREE.Group,
  sinks: readonly { event: SinkEvent; craft: THREE.Group }[],
): SinkingCrewsView {
  const total = SINKING_CREWS.reduce((sum, place) => sum + place.crew.length, 0);
  const meshes = soldierMeshes(total, 'far');
  meshes.bodies.name = `${SINKING_CREW_NAME}Bodies`;
  meshes.heads.name = `${SINKING_CREW_NAME}Heads`;
  const group = new THREE.Group();
  group.name = SINKING_CREW_NAME;
  group.add(meshes.bodies, meshes.heads);
  group.visible = false;
  shore.add(group);
  showDroid(meshes, 0);
  let first = 0;
  const crews = SINKING_CREWS.map((place, index): SinkingCrewView => {
    const sink = sinks.find(entry => entry.event.x === place.craftX);
    if (sink === undefined) throw new Error(`the landing has no sinking craft at x ${place.craftX}`);
    const slots = place.crew.map((one, i): CrewSlot => ({
      place: one,
      thrown: Math.hypot(one.x, one.z - CRAFT_TUNE.length / 2) <= SINKING_CREW_TUNE.blastRadius,
      side: one.x === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(one.x),
    }));
    let ally: THREE.Group | null = null;
    const allyPlace = place.ally ?? null;
    if (allyPlace !== null) {
      ally = buildAllyMech('run', place.allyKit ?? 'sniper');
      ally.name = `${SINKING_CREW_NAME}Ally${index}`;
      ally.visible = false;
      shore.add(ally);
    }
    const crew = {
      craft: sink.craft,
      event: sink.event,
      first,
      slots,
      ally,
      allyPlace,
      allySide: allyPlace === null || allyPlace.x >= 0 ? 1 : -1,
    };
    first += place.crew.length;
    return crew;
  });
  return { group, meshes, total, crews };
}

// Puts every crew member where the craft, the blast and the second put it. `landing` is whether the landing is the
// cutscene drawn now; the other cutscenes hide the crews. Call after the craft's own place and roll are set for the frame.
export function drawSinkingCrews(view: SinkingCrewsView, cutscene: CutsceneId | null, elapsed: number): void {
  const landing = cutscene === 'landing';
  view.group.visible = landing;
  if (!landing) {
    showDroid(view.meshes, 0);
    for (const crew of view.crews) if (crew.ally !== null) crew.ally.visible = false;
    return;
  }
  let above = 0; // the crew members whose head's top is still over the sea
  for (const crew of view.crews) {
    const since = elapsed - crew.event.at;
    const craft = crew.craft;
    craftSpin.setFromAxisAngle(Z_AXIS, craft.rotation.z);
    for (let i = 0; i < crew.slots.length; i++) {
      const slot = crew.slots[i];
      const thrown = slot.thrown && since >= 0;
      if (thrown) {
        const t = since;
        const tune = SINKING_CREW_TUNE;
        onDeck(craft, craftSpin, slot.place);
        feet.x += slot.side * tune.throwSide * t;
        feet.y += tune.throwUp * t - 0.5 * tune.gravity * t * t;
        feet.z += tune.throwForward * t;
        spin.setFromEuler(turnEuler.set(t * tune.tumble, slot.place.yaw, slot.side * t * tune.tumble, 'YXZ'));
        spin.premultiply(craftSpin);
      } else {
        onDeck(craft, craftSpin, slot.place);
        spin.setFromAxisAngle(Y_AXIS, slot.place.yaw);
        spin.premultiply(craftSpin);
      }
      // the head's top in the world, tilted with the body: the crew is drawn until it is under the sea
      const headTop = feet.y + part.copy(Y_AXIS).multiplyScalar(HEAD_TOP).applyQuaternion(spin).y;
      const sunk = headTop < SEA_LEVEL;
      if (!sunk) above++;
      writePart(view.meshes.bodies, crew.first + i, spin, SOLDIER_POSE.bodyY, sunk);
      writePart(view.meshes.heads, crew.first + i, spin, SOLDIER_POSE.headY, sunk);
    }
    drawAlly(crew, since);
  }
  showDroid(view.meshes, above > 0 ? view.total : 0);
  droidMatricesChanged(view.meshes);
}

// Where a place on the deck is in the world at this frame. The answer is in `feet`.
function onDeck(craft: THREE.Group, roll: THREE.Quaternion, place: DeckPlace): THREE.Vector3 {
  local.set(place.x, DECK_Y, place.z).applyQuaternion(roll);
  return feet.set(craft.position.x, craft.position.y, craft.position.z).add(local);
}

// One part of the body at the feet's place: `spin` turns with the craft, or over and over when thrown. A sunken part is
// scaled away.
function writePart(mesh: THREE.InstancedMesh, i: number, turn: THREE.Quaternion, height: number, sunk: boolean): void {
  dummy.position.copy(part.copy(Y_AXIS).multiplyScalar(height).applyQuaternion(turn).add(feet));
  dummy.quaternion.copy(turn);
  dummy.scale.setScalar(sunk ? 0 : 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

// The ally mech stands on the deck until the hit, then tips and slides over the side into the sea, riding the craft's
// own sinking and roll. Once the sea covers it, it is not drawn. It writes the shared `craftSpin`, `spin` and `feet`, so
// it is called after the crew of its craft is drawn, and the next craft sets `craftSpin` afresh.
function drawAlly(crew: SinkingCrewView, since: number): void {
  const ally = crew.ally;
  const place = crew.allyPlace;
  if (ally === null || place === null) return;
  craftSpin.setFromAxisAngle(Z_AXIS, crew.craft.rotation.z);
  onDeck(crew.craft, craftSpin, place);
  let tip = 0;
  if (since < 0) {
    ally.position.copy(feet);
  } else {
    const tune = SINKING_CREW_TUNE;
    ally.position.set(
      feet.x + crew.allySide * tune.allySlide * since,
      feet.y - 0.5 * tune.allySink * since * since,
      feet.z,
    );
    tip = smooth(Math.min(1, since / tune.allyTipSec)) * tune.allyTip;
  }
  ally.quaternion
    .copy(craftSpin)
    .multiply(spin.setFromAxisAngle(Y_AXIS, place.yaw))
    .multiply(spin.setFromAxisAngle(Z_AXIS, -crew.allySide * tip));
  ally.visible = ally.position.y >= SEA_LEVEL - ALLY_TUNE.height;
}

// Takes the crews and the ally mech out of the scene and gives back their geometry and materials, as removeRiders does.
export function removeSinkingCrews(view: SinkingCrewsView): void {
  view.group.parent?.remove(view.group);
  for (const mesh of [view.meshes.bodies, view.meshes.heads]) mesh.dispose();
  disposeTree(view.group);
  for (const crew of view.crews) {
    const ally = crew.ally;
    if (ally === null) continue;
    ally.parent?.remove(ally);
    disposeProtoMech(ally);
  }
}
