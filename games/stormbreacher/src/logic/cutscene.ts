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

// The camera at `elapsed` seconds: exactly a key's pose at the key's second, and eased between two keys, so it
// starts and stops softly at each. Before the first key and after the last, the nearest key's pose.
export function cutscenePose(id: CutsceneId, elapsed: number): CutscenePose {
  const keys = tableOf(id).camera;
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (elapsed <= first.at) return { pos: first.pos, look: first.look };
  if (elapsed >= last.at) return { pos: last.pos, look: last.look };
  let next = 1;
  while (keys[next].at < elapsed) next++;
  const a: CameraKey = keys[next - 1];
  const b: CameraKey = keys[next];
  const u = smooth((elapsed - a.at) / (b.at - a.at));
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
