// The cutscenes' tables (SB-180): where the camera goes, which line shows when, and what the picture does and at what
// second. logic/cutscene.ts reads them and view/cutscene.ts draws them. The seconds are on the cutscene's own clock
// (0 when it starts); a table must not run past the cutscene's length in CUTSCENE_SEC (data/script.ts).
// A cutscene the script may enter but that has no table here is not played: the game passes it over at once, as if the
// player had skipped it.
import type { CutsceneId } from './types.ts';

export type Vec3 = readonly [x: number, y: number, z: number];

export interface CameraKey {
  at: number; // second
  pos: Vec3; // where the camera is (m)
  look: Vec3; // the point it looks at (m)
  // Set: `pos` and `look` are offsets from the mech's x and z (their y stays the height), for a cutscene that starts
  // wherever the mech stands. Unset: the map's own coordinates.
  rel?: true;
}

// A place on the walk the mech takes in a cutscene (view only; the game's own mech stays at its start).
export interface MechKey {
  at: number; // second the mech is there
  pos: Vec3; // where its feet are (m)
}

export interface CutsceneLine {
  from: number; // second the line appears
  to: number; // second it goes
  key: string; // language key
}

// What the picture does at a second. `x` and `z` are the map's coordinates (m); a craft's `z` is where its body begins and
// is the player's craft's z when left out.
export type CutsceneEvent =
  | { at: number; kind: 'sink'; x: number; z?: number; sec: number } // the craft there rolls over and goes down over `sec` seconds
  | { at: number; kind: 'arrive'; x: number; z: number; from: number; sec: number } // a craft comes in from `from` to `z` over `sec` seconds
  | { at: number; kind: 'burst'; x: number; z: number } // a shell lands there
  | { at: number; kind: 'collapse'; targets: readonly string[]; sec: number } // the mission targets with these ids sink and tilt over `sec` seconds
  | { at: number; kind: 'ramp'; sec: number } // the player's craft lowers its ramp over `sec` seconds
  | { at: number; kind: 'riders'; ids: readonly string[]; sec: number } // these riders fall over `sec` seconds
  | { at: number; kind: 'tracers'; x: number; z: number; n: number }; // `n` machine-gun tracers come in at (x, z)

export interface CutsceneDef {
  camera: readonly CameraKey[]; // in time order; the first key's pose holds before it, the last one's after it
  // Set: the mech is drawn walking this path, in a straight line from key to key (it stands at the first key before it
  // and at the last one after it). Unset: the mech is not drawn, for it is not on the beach yet.
  mech?: readonly MechKey[];
  lines: readonly CutsceneLine[];
  events: readonly CutsceneEvent[];
}

// The map is M1B_HAND: the mech waits on the craft's deck at (0, 1.8, 177) looking to -z, the player's craft lies at
// z 175-187 behind it and the sea is +z. The last key is the game's own camera behind the mech at the start (the test
// compares it with cameraPose). The mech stands on the deck the whole time and the ramp comes down; the player walks down
// it once the cutscene has handed over the controls.
export const CUTSCENES: Partial<Record<CutsceneId, CutsceneDef>> = {
  // The landing opens outside: over the sea behind the craft, the row of craft as it is shelled, then a cut at 3.45 s to
  // the camera inside the craft (behind and a little above the mech, in front of the wheelhouse). No key or second between
  // them goes into the wheelhouse box (x +-1.5, z 182.5-185.5, y 1.7-4.3; unit test), and the keys inside stay 4 m or more
  // from the mech's chest so the model is not drawn see-through. The last key is the game's own camera.
  landing: {
    camera: [
      { at: 0, pos: [-10, 8, 210], look: [-8, 2, 172] }, // over the sea behind the craft, the craft and the beach
      { at: 1.6, pos: [-14, 7, 206], look: [-20, 2, 180] }, // swing left along the row of craft
      { at: 3.4, pos: [-18, 6, 202], look: [-36, 1.5, 196] }, // the two craft to port as they go down
      { at: 3.45, pos: [0.9, 4.9, 181.2], look: [0.4, 3.4, 174.6] }, // cut inside, behind the mech: the raised ramp
      { at: 5.4, pos: [0.6, 4.7, 181.5], look: [0.2, 3.2, 174.2] }, // a little closer
      { at: 6.0, pos: [-1.8, 4.5, 181.7], look: [-20, 2.5, 182] }, // to port, the craft right beside us going down
      { at: 8.0, pos: [1.6, 4.5, 181.8], look: [0.4, 3.1, 174.6] }, // back to the deck as the ramp starts down
      { at: 10.8, pos: [2.0, 4.6, 181.2], look: [0.8, 3.2, 174.6] }, // the ramp fully down
      { at: 12, pos: [2.15, 6.2, 185.6], look: [2.15, 4.7, 177] }, // the game's camera behind the mech at the start
    ],
    mech: [{ at: 0, pos: [0, 1.8, 177] }],
    lines: [
      { from: 0.4, to: 2.8, key: 'cutscene.landing.wave' },
      { from: 3.6, to: 5.4, key: 'cutscene.landing.hit' },
      { from: 6.6, to: 8.0, key: 'cutscene.landing.shell' },
      { from: 8.6, to: 10.2, key: 'cutscene.landing.ramp' },
      { from: 10.9, to: 11.8, key: 'cutscene.landing.sweep' },
    ],
    events: [
      { at: 3.3, kind: 'burst', x: -34, z: 196 }, // a shell hits the first craft to port
      { at: 3.4, kind: 'sink', x: -34, z: 196, sec: 2.2 },
      { at: 3.9, kind: 'burst', x: -58, z: 210 }, // and the one beyond it
      { at: 4.0, kind: 'sink', x: -58, z: 210, sec: 2.4 },
      { at: 4.2, kind: 'sink', x: -20, sec: 2.5 }, // the craft right beside the player's: the burst at 6.4 s takes it
      { at: 6.4, kind: 'burst', x: -6, z: 180 }, // a shell falls off the port side and takes the riders there
      { at: 6.5, kind: 'riders', ids: ['r1', 'r5'], sec: 0.7 },
      { at: 9.2, kind: 'ramp', sec: 1.6 },
      // The machine gun sweeps the boat once the ramp is down (10.8 s); each rider starts to fall when a tracer has
      // reached the deck (about 0.33 s after it starts), so the fall follows the line that takes it.
      { at: 11.0, kind: 'tracers', x: 0.4, z: 176, n: 4 },
      { at: 11.2, kind: 'tracers', x: -0.6, z: 175.6, n: 3 },
      { at: 11.35, kind: 'tracers', x: 1.2, z: 176, n: 3 },
      { at: 11.35, kind: 'riders', ids: ['r2', 'r3'], sec: 0.5 },
      { at: 11.5, kind: 'riders', ids: ['r4'], sec: 0.5 },
    ],
  },
  // The second wave goes down at sea (the sea starts at z 170, the player's craft's body at z 175). The camera starts
  // behind the mech, looking out to sea, flies to the beach edge for the row of crafts, then comes back to the mech
  // and looks inland at the seawall where the reinforcement stands (z -75..-65).
  'wave2-sinks': {
    camera: [
      { at: 0, pos: [0, 7, 10], look: [0, 4, 60], rel: true },
      { at: 1.8, pos: [0, 14, 150], look: [0, 0, 215] },
      { at: 3.6, pos: [0, 10, 165], look: [0, 1, 212] },
      { at: 5.2, pos: [2.15, 9, 14], look: [2.15, 5, -50], rel: true },
    ],
    lines: [
      { from: 0.6, to: 3.2, key: 'cutscene.wave2.hit' },
      { from: 3.4, to: 5.9, key: 'cutscene.wave2.none' },
    ],
    events: [
      { at: 1.2, kind: 'burst', x: -40, z: 210 },
      { at: 1.4, kind: 'sink', x: -40, z: 205, sec: 1.8 },
      { at: 1.7, kind: 'burst', x: -12, z: 226 },
      { at: 1.9, kind: 'sink', x: -14, z: 222, sec: 1.8 },
      { at: 2.2, kind: 'burst', x: 16, z: 212 },
      { at: 2.4, kind: 'sink', x: 16, z: 208, sec: 1.8 },
      { at: 2.7, kind: 'burst', x: 42, z: 230 },
      { at: 2.9, kind: 'sink', x: 42, z: 226, sec: 1.8 },
    ],
  },
  // The battery goes down (the guns at z -135, the magazine at z -150), then the camera turns to the sea, where the
  // crafts come in beside the player's, and ends over the beach as the allies walk inland.
  'beach-held': {
    camera: [
      { at: 0, pos: [0, 14, -105], look: [0, 2, -145] },
      { at: 3, pos: [0, 12, -108], look: [0, 3, -145] },
      { at: 5, pos: [0, 8, 140], look: [0, 2, 190] },
      { at: 8, pos: [0, 14, 110], look: [0, 1, 40] },
    ],
    lines: [
      { from: 0.5, to: 3.5, key: 'cutscene.held.silent' },
      { from: 4.5, to: 7.5, key: 'cutscene.held.landing' },
    ],
    events: [
      { at: 0.3, kind: 'burst', x: -30, z: -135 },
      { at: 0.6, kind: 'burst', x: 30, z: -135 },
      { at: 1, kind: 'burst', x: 0, z: -150 },
      { at: 0.8, kind: 'collapse', targets: ['main-gun-1', 'main-gun-2', 'magazine'], sec: 2.2 },
      { at: 3.2, kind: 'arrive', x: -35, z: 175, from: 230, sec: 2.5 },
      { at: 3.6, kind: 'arrive', x: 40, z: 175, from: 240, sec: 2.5 },
    ],
  },
};
