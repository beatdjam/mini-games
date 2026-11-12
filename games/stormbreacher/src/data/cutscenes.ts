// The cutscenes' tables (SB-180): where the camera goes, which line shows when, and what the picture does and at what
// second. logic/cutscene.ts reads them and view/cutscene.ts draws them. The seconds are on the cutscene's own clock
// (0 when it starts); a table must not run past the cutscene's length in CUTSCENE_SEC (data/script.ts).
// A cutscene the script may enter but that has no table here (`wave2-sinks`, `beach-held`) is not played: the game
// passes it over at once, as if the player had skipped it.
import type { CutsceneId } from './types.ts';

export type Vec3 = readonly [x: number, y: number, z: number];

export interface CameraKey {
  at: number; // second
  pos: Vec3; // where the camera is (m)
  look: Vec3; // the point it looks at (m)
}

export interface CutsceneLine {
  from: number; // second the line appears
  to: number; // second it goes
  key: string; // language key
}

// What the picture does at a second. `x` is where the craft stands along the beach (m); it lies at the player's craft's z.
export type CutsceneEvent =
  | { at: number; kind: 'sink'; x: number; sec: number } // the craft at `x` rolls over and goes down over `sec` seconds
  | { at: number; kind: 'ramp'; sec: number }; // the player's craft lowers its ramp over `sec` seconds

export interface CutsceneDef {
  camera: readonly CameraKey[]; // in time order; the first key's pose holds before it, the last one's after it
  lines: readonly CutsceneLine[];
  events: readonly CutsceneEvent[];
}

// The map is M1B_HAND: the mech starts at (0, 166) looking to -z, the player's craft lies at z 175-187 behind it and the
// sea is +z. The last key is the game's own camera behind the mech at the start (the test compares it with cameraPose).
export const CUTSCENES: Partial<Record<CutsceneId, CutsceneDef>> = {
  landing: {
    camera: [
      { at: 0, pos: [-8, 9, 206], look: [-10, 1, 170] }, // over the sea behind the craft, the craft and the beach in view
      { at: 4, pos: [30, 5, 178], look: [-14, 2, 175] }, // from the side along the row of craft
      { at: 7, pos: [0, 3.2, 181], look: [0, 1.5, 150] }, // inside the craft, the beach past the ramp
      { at: 10, pos: [2.15, 4.4, 174.6], look: [2.15, 2.9, 166] }, // behind the mech, where the game's camera takes over
    ],
    lines: [
      { from: 0.5, to: 3.5, key: 'cutscene.landing.wave' },
      { from: 3.8, to: 6.3, key: 'cutscene.landing.hit' },
      { from: 6.5, to: 9.5, key: 'cutscene.landing.ramp' },
    ],
    events: [
      { at: 4.2, kind: 'sink', x: -20, sec: 2.5 },
      { at: 7, kind: 'ramp', sec: 1.5 },
    ],
  },
};
