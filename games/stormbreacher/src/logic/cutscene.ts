// What a cutscene shows at a second (SB-180), as pure functions over the tables in data/cutscenes.ts: the camera's place,
// the line to show and the picture's events. No three and no DOM; view/cutscene.ts draws what these return.
import { CUTSCENES, type CameraKey, type CutsceneDef, type CutsceneEvent, type Vec3 } from '../data/cutscenes.ts';
import type { CutsceneId } from '../data/types.ts';

export interface CutscenePose {
  pos: Vec3;
  look: Vec3;
}

// Whether the cutscene has a table. One that has none is not played (data/cutscenes.ts).
export const hasCutscene = (id: CutsceneId): boolean => CUTSCENES[id] !== undefined;

function tableOf(id: CutsceneId): CutsceneDef {
  const def = CUTSCENES[id];
  if (def === undefined) throw new Error(`no table for cutscene "${id}"`);
  return def;
}

const smooth = (u: number): number => u * u * (3 - 2 * u);

const mix = (a: Vec3, b: Vec3, u: number): Vec3 => [
  a[0] + (b[0] - a[0]) * u,
  a[1] + (b[1] - a[1]) * u,
  a[2] + (b[2] - a[2]) * u,
];

// Where a mech stands (m); the offsets of a `rel` key are from it.
export interface Origin {
  x: number;
  z: number;
}

// A key's pose in the map's coordinates: a `rel` key's x and z are offsets from the mech, so `mech` must be given for one.
export function keyPose(key: CameraKey, mech?: Origin): CutscenePose {
  if (key.rel !== true) return { pos: key.pos, look: key.look };
  if (mech === undefined) throw new Error("a relative camera key needs the mech's place");
  return {
    pos: [key.pos[0] + mech.x, key.pos[1], key.pos[2] + mech.z],
    look: [key.look[0] + mech.x, key.look[1], key.look[2] + mech.z],
  };
}

// The camera at `elapsed` seconds: exactly a key's pose at the key's second, and eased between two keys, so it
// starts and stops softly at each. Before the first key and after the last, the nearest key's pose. `mech` is where the
// mech stands, for the tables whose keys are relative to it.
export function cutscenePose(id: CutsceneId, elapsed: number, mech?: Origin): CutscenePose {
  const keys = tableOf(id).camera;
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (elapsed <= first.at) return keyPose(first, mech);
  if (elapsed >= last.at) return keyPose(last, mech);
  let next = 1;
  while (keys[next].at <= elapsed) next++;
  const a = keyPose(keys[next - 1], mech);
  const b = keyPose(keys[next], mech);
  const u = smooth((elapsed - keys[next - 1].at) / (keys[next].at - keys[next - 1].at));
  return { pos: mix(a.pos, b.pos, u), look: mix(a.look, b.look, u) };
}

// The language key of the line on screen at `elapsed`, or null between lines.
export function cutsceneLine(id: CutsceneId, elapsed: number): string | null {
  const line = tableOf(id).lines.find(item => item.from <= elapsed && elapsed < item.to);
  return line === undefined ? null : line.key;
}

// The events whose second lies after `from` and not after `to`, so a frame that goes from `from` to `to` meets each
// event once. Call with `from` below 0 on the first frame to take an event at second 0.
export function cutsceneEvents(id: CutsceneId, from: number, to: number): CutsceneEvent[] {
  return tableOf(id).events.filter(event => from < event.at && event.at <= to);
}

// Where the walking mech's feet are at `elapsed`, and how fast it goes along the ground (m/s).
export interface CutsceneMech {
  x: number;
  y: number;
  z: number;
  speed: number;
}

// The mech's place in the cutscene, or null when the cutscene has no mech path (the mech is not drawn then). It goes
// in a straight line at an even speed between two keys, so the legs swing in time with the ground it covers.
export function cutsceneMech(id: CutsceneId, elapsed: number): CutsceneMech | null {
  const keys = tableOf(id).mech;
  if (keys === undefined) return null;
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (elapsed <= first.at) return { x: first.pos[0], y: first.pos[1], z: first.pos[2], speed: 0 };
  if (elapsed >= last.at) return { x: last.pos[0], y: last.pos[1], z: last.pos[2], speed: 0 };
  let next = 1;
  while (keys[next].at < elapsed) next++;
  const a = keys[next - 1];
  const b = keys[next];
  const span = b.at - a.at;
  const [x, y, z] = mix(a.pos, b.pos, (elapsed - a.at) / span);
  return { x, y, z, speed: Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]) / span };
}
