import { expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { ALLY_TUNE } from '../../src/data/allies.ts';
import { CRAFT_TUNE } from '../../src/data/craft.ts';
import { SINKING_CREWS } from '../../src/data/landing.ts';
import { SOLDIER_POSE } from '../../src/data/soldiers.ts';
import { SEA_LEVEL } from '../../src/view/shore.ts';
import {
  buildSinkingCrews,
  drawSinkingCrews,
  removeSinkingCrews,
  type SinkingCrewsView,
} from '../../src/view/sinkingCrews.ts';

// The landing's three sinking craft, at their own x, with the events the table names.
function sinkingCrews(): { view: SinkingCrewsView; shore: THREE.Group } {
  const shore = new THREE.Group();
  const sinks = SINKING_CREWS.map(place => ({
    event: { kind: 'sink' as const, at: 1, x: place.craftX, sec: 2 },
    craft: new THREE.Group(),
  }));
  return { view: buildSinkingCrews(shore, sinks), shore };
}

// The crew of the craft at x = -24; its first member stands away from the blast.
function nearCrew(view: SinkingCrewsView) {
  const crew = view.crews.find(one => one.event.x === -24);
  if (crew === undefined) throw new Error('the -24 craft has no crew');
  return crew;
}

function scaleAt(mesh: THREE.InstancedMesh, index: number): number {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new THREE.Vector3().setFromMatrixScale(matrix).x;
}

function upAt(mesh: THREE.InstancedMesh, index: number): THREE.Vector3 {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  const turn = new THREE.Quaternion().setFromRotationMatrix(matrix);
  return new THREE.Vector3(0, 1, 0).applyQuaternion(turn);
}

test("a crew member is drawn while the head's top is over the sea, and not once it is under", () => {
  const { view } = sinkingCrews();
  const crew = nearCrew(view);
  const slot = 0; // not thrown: it stays on the deck
  const index = crew.first + slot;
  const headTop = (y: number): number => y + CRAFT_TUNE.deckTop + SOLDIER_POSE.headY + 0.2;
  const feetAt = (y: number): number => y + CRAFT_TUNE.deckTop;
  // the feet are 1.4 m under the sea here, yet the head's top is still over it: it must be drawn. Judging by the feet
  // (or the body's middle) would hide it early.
  const feetUnder = SEA_LEVEL - 1.4;
  const craftY = feetUnder - CRAFT_TUNE.deckTop;
  expect(feetAt(craftY)).toBeLessThan(SEA_LEVEL - 1);
  expect(headTop(craftY)).toBeGreaterThan(SEA_LEVEL);

  crew.craft.position.y = 0;
  drawSinkingCrews(view, 'landing', 2);
  expect(scaleAt(view.meshes.bodies, index)).toBe(1);
  expect(scaleAt(view.meshes.heads, index)).toBe(1);

  crew.craft.position.y = craftY;
  drawSinkingCrews(view, 'landing', 2);
  expect(scaleAt(view.meshes.bodies, index)).toBe(1);
  expect(scaleAt(view.meshes.heads, index)).toBe(1);

  const under = SEA_LEVEL - (headTop(0) + 0.1); // a craft this low puts the head's top just under the sea
  crew.craft.position.y = under;
  drawSinkingCrews(view, 'landing', 2);
  expect(headTop(under)).toBeLessThan(SEA_LEVEL);
  expect(scaleAt(view.meshes.bodies, index)).toBe(0);
  expect(scaleAt(view.meshes.heads, index)).toBe(0);
});

test('the crew turns over with the craft', () => {
  const { view } = sinkingCrews();
  const crew = nearCrew(view);
  const index = crew.first;
  crew.craft.position.y = -1;
  crew.craft.rotation.z = 0.6;
  drawSinkingCrews(view, 'landing', 2);

  const up = upAt(view.meshes.bodies, index);
  expect(up.x).toBeCloseTo(-Math.sin(0.6), 6);
  expect(up.y).toBeCloseTo(Math.cos(0.6), 6);
  // and the head stays on the same tilted axis, above the body
  const headUp = upAt(view.meshes.heads, index);
  expect(headUp.x).toBeCloseTo(up.x, 6);
  expect(headUp.y).toBeCloseTo(up.y, 6);
});

test('another cutscene hides the crews', () => {
  const { view } = sinkingCrews();
  drawSinkingCrews(view, 'landing', 2);
  expect(view.group.visible).toBe(true);
  drawSinkingCrews(view, 'wave2-sinks', 2);
  expect(view.group.visible).toBe(false);
  expect(view.meshes.bodies.visible).toBe(false);
  expect(view.meshes.heads.visible).toBe(false);
});

test('the crews are the table: who is thrown clear, and the one ally mech', () => {
  const { view } = sinkingCrews();
  const thrown = (x: number): number =>
    view.crews.find(one => one.event.x === x)?.slots.filter(s => s.thrown).length ?? -1;
  expect(thrown(-36)).toBe(1);
  expect(thrown(-48)).toBe(1);
  expect(thrown(-24)).toBe(2);
  const allies = view.crews.filter(one => one.ally !== null);
  expect(allies).toHaveLength(1);
  expect(allies[0].event.x).toBe(-24);
  expect(() => buildSinkingCrews(new THREE.Group(), [])).toThrow();
});

test('a thrown crew member leaves the deck and turns with the craft', () => {
  const { view } = sinkingCrews();
  const crew = nearCrew(view);
  const slot = crew.slots.findIndex(one => one.thrown);
  const still = crew.slots.findIndex(one => !one.thrown);
  const index = crew.first + slot;
  const matrix = new THREE.Matrix4();
  const at = new THREE.Vector3();
  crew.craft.rotation.z = 0.6;
  // at the blast's second the member is still on the deck, with the craft's tilt already on its turn
  drawSinkingCrews(view, 'landing', crew.event.at);
  const up = upAt(view.meshes.bodies, index);
  expect(up.x).toBeCloseTo(-Math.sin(0.6), 6);
  view.meshes.bodies.getMatrixAt(index, matrix);
  const before = at.setFromMatrixPosition(matrix).clone();
  // half a second on, it is up and away; the member that stays does not move
  const stayIndex = crew.first + still;
  view.meshes.bodies.getMatrixAt(stayIndex, matrix);
  const stayBefore = at.setFromMatrixPosition(matrix).clone();
  drawSinkingCrews(view, 'landing', crew.event.at + 0.5);
  view.meshes.bodies.getMatrixAt(index, matrix);
  expect(at.setFromMatrixPosition(matrix).distanceTo(before)).toBeGreaterThan(1);
  view.meshes.bodies.getMatrixAt(stayIndex, matrix);
  expect(at.setFromMatrixPosition(matrix).distanceTo(stayBefore)).toBeLessThan(1e-6);
});

function allyOf(view: SinkingCrewsView): THREE.Group {
  const ally = nearCrew(view).ally;
  if (ally === null) throw new Error('the -24 craft has no ally mech');
  return ally;
}

test('the ally mech rides the craft: its height and tilt follow it, and it is not drawn once the sea covers it', () => {
  const { view } = sinkingCrews();
  const crew = nearCrew(view);
  const ally = allyOf(view);
  drawSinkingCrews(view, 'landing', 0); // before the blast
  const standing = ally.position.y;
  expect(standing).toBeCloseTo(CRAFT_TUNE.deckTop, 6);
  expect(ally.visible).toBe(true);

  crew.craft.position.y = -1;
  drawSinkingCrews(view, 'landing', 0);
  expect(ally.position.y).toBeCloseTo(standing - 1, 6);

  crew.craft.rotation.z = 0.6;
  drawSinkingCrews(view, 'landing', 0);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(ally.quaternion);
  expect(up.x).toBeCloseTo(-Math.sin(0.6), 6);
  expect(up.y).toBeCloseTo(Math.cos(0.6), 6);

  // a craft with its deck this far down covers it
  crew.craft.rotation.z = 0;
  crew.craft.position.y = SEA_LEVEL - ALLY_TUNE.height - CRAFT_TUNE.deckTop - 0.5;
  drawSinkingCrews(view, 'landing', 0);
  expect(ally.visible).toBe(false);
  // and after the blast it slides and sinks on its own, out of sight in the end
  crew.craft.position.y = 0;
  drawSinkingCrews(view, 'landing', crew.event.at + 0.1);
  expect(ally.visible).toBe(true);
  drawSinkingCrews(view, 'landing', crew.event.at + 10);
  expect(ally.visible).toBe(false);
});

test('removing the crews takes them out of the scene and disposes the meshes', () => {
  const { view, shore } = sinkingCrews();
  const ally = allyOf(view);
  const bodies = vi.spyOn(view.meshes.bodies, 'dispose');
  const heads = vi.spyOn(view.meshes.heads, 'dispose');
  expect(shore.children).toContain(view.group);
  expect(shore.children).toContain(ally);
  removeSinkingCrews(view);
  expect(bodies).toHaveBeenCalledTimes(1);
  expect(heads).toHaveBeenCalledTimes(1);
  expect(shore.children).not.toContain(view.group);
  expect(shore.children).not.toContain(ally);
});
