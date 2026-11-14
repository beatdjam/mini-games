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
  | { at: number; kind: 'sail'; from: number; sec: number } // the player's craft and the two beside it come in from `from` m seaward over `sec` seconds
  | { at: number; kind: 'sink'; x: number; z?: number; sec: number } // the craft there (sailing with the three until it is hit) rolls over and goes down over `sec` seconds
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
  // Set: the battlefield's clock stands still while this cutscene plays, so the first squad runs once the player has
  // the controls (the landing). Unset: the battlefield runs on as the picture plays.
  holdsBattle?: true;
}

// The map is M1B_HAND: the mech waits on the craft's deck at (0, 1.8, 177) looking to -z, the player's craft lies at
// z 175-187 behind it and the sea is +z. Two more craft come in at x -12 and 12 with the allies aboard (view/shore.ts).
// For the first 8.4 s the three sail in from 45 m seaward with a sinking row beside them (the `sail` event), and the
// camera keys are offsets from the mech there, so the picture rides with the craft. The last key is the game's own
// camera behind the mech at the start (the test compares it with cameraPose). The mech stands on the deck the whole time
// and the ramps come down; the player walks down its ramp once the cutscene has handed over the controls.
export const CUTSCENES: Partial<Record<CutsceneId, CutsceneDef>> = {
  // The landing opens outside: over the sea behind the player's craft, which is in the middle of the picture, with the
  // row of craft to port. All three craft sail for the beach and the three beside them are sunk in this outside shot,
  // before the camera moves at 5.4 s. It then comes over the stern, above the wheelhouse (x +-1.5, z 182.5-185.5,
  // y 1.7-4.3; unit test) and the stern wall (top 4.7 m), and into the deck behind the mech without a cut. Inside it
  // looks at the ramp the whole time. The keys inside stay 4 m or more from the mech's chest so the model is not drawn
  // see-through. The last key is the game's own camera. Values are provisional.
  landing: {
    camera: [
      // offsets from the mech (x 0, z 177 at the shore), so all nine keys sail in with it
      { at: 0, rel: true, pos: [7, 12, 47], look: [0, 2.4, 3] }, // over the sea behind the craft: it in the middle, the row to port
      { at: 2, rel: true, pos: [-1, 11, 41], look: [-30, 2, 1] }, // swing left along the row as the shells land
      { at: 4, rel: true, pos: [-8, 10, 31], look: [-42, 2, 2] }, // the two craft to port go down
      { at: 5.4, rel: true, pos: [1, 8.8, 23], look: [0, 2.8, 3] }, // turn back to the player's craft
      { at: 6.6, rel: true, pos: [0.9, 7, 12], look: [0.3, 3.2, 1] }, // over the stern, above the wheelhouse
      { at: 7.4, rel: true, pos: [0.9, 4.9, 4.2], look: [0.4, 3.4, -2.4] }, // inside, behind the mech: the raised ramp
      { at: 8.4, rel: true, pos: [0.6, 4.7, 4.5], look: [0.2, 3.2, -2.8] }, // a little closer, still facing the ramp
      { at: 10.8, rel: true, pos: [2, 4.6, 4.2], look: [0.8, 3.2, -2.4] }, // the ramp fully down
      { at: 12, rel: true, pos: [2.15, 6.2, 8.6], look: [2.15, 4.7, 0] }, // the game's camera behind the mech at the start
    ],
    mech: [{ at: 0, pos: [0, 1.8, 177] }],
    holdsBattle: true,
    lines: [
      { from: 0.4, to: 2.8, key: 'cutscene.landing.wave' },
      { from: 3.6, to: 5.4, key: 'cutscene.landing.hit' },
      { from: 6.6, to: 8.0, key: 'cutscene.landing.shell' },
      { from: 8.6, to: 10.2, key: 'cutscene.landing.ramp' },
      { from: 10.9, to: 11.8, key: 'cutscene.landing.sweep' },
    ],
    events: [
      // The three craft come in together and reach the shore at 8.4 s, 0.8 s before the ramps start down.
      { at: 0, kind: 'sail', from: 45, sec: 8.4 },
      // The row beyond the port craft sails with them: each is hit and goes down where it is, x -36 then -48.
      { at: 1.2, kind: 'burst', x: -36, z: 215.6 }, // a shell hits the near craft of the row
      { at: 1.3, kind: 'sink', x: -36, z: 171, sec: 1.8 },
      { at: 2.2, kind: 'burst', x: -48, z: 212.2 }, // and the one beyond it
      { at: 2.3, kind: 'sink', x: -48, z: 173, sec: 2.0 },
      { at: 3.2, kind: 'sink', x: -24, z: 175, sec: 2.2 }, // the craft right beside the port one rolls over as the camera turns in
      // A shell falls at the port bow once the camera is over the stern. It is out of sight behind the raised ramp, so it
      // is the shake, the sound and the riders falling that say how near it was; the riders keep their old seconds. Its z
      // is the bow at 6.4 s (past the sea's edge), so the view draws a water column there.
      { at: 6.4, kind: 'burst', x: -6, z: 185.7 },
      { at: 6.5, kind: 'riders', ids: ['r1', 'r5'], sec: 0.7 },
      { at: 9.2, kind: 'ramp', sec: 1.6 },
      // The machine gun sweeps the boat once the ramp is down (10.8 s); each rider starts to fall once a tracer has
      // reached the deck (about 0.32 s after it starts). r4 falls to the 11.2 s burst, so it goes after that one lands.
      { at: 11.0, kind: 'tracers', x: 0.4, z: 176, n: 4 },
      { at: 11.2, kind: 'tracers', x: -0.6, z: 175.6, n: 3 },
      { at: 11.35, kind: 'tracers', x: 1.2, z: 176, n: 3 },
      { at: 11.35, kind: 'riders', ids: ['r2', 'r3'], sec: 0.5 },
      { at: 11.6, kind: 'riders', ids: ['r4'], sec: 0.4 },
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
  // The battery goes down (the guns at z -235, the magazine at z -250), seen from the wreckage past the fortress's land
  // gate (z -140); then the camera turns to the sea, where the crafts come in beside the player's, and ends over the beach
  // as the allies walk inland. It ends in the result screen, so its last key need not match the game camera.
  'beach-held': {
    camera: [
      { at: 0, pos: [0, 14, -140], look: [0, 4, -235] },
      { at: 3, pos: [0, 12, -145], look: [0, 5, -240] },
      { at: 5, pos: [0, 8, 140], look: [0, 2, 190] },
      { at: 8, pos: [0, 14, 110], look: [0, 1, 40] },
    ],
    lines: [
      { from: 0.5, to: 3.5, key: 'cutscene.held.silent' },
      { from: 4.5, to: 7.5, key: 'cutscene.held.landing' },
    ],
    events: [
      { at: 0.3, kind: 'burst', x: -45, z: -235 },
      { at: 0.6, kind: 'burst', x: 45, z: -235 },
      { at: 1, kind: 'burst', x: 0, z: -250 },
      { at: 0.8, kind: 'collapse', targets: ['main-gun-1', 'main-gun-2', 'magazine'], sec: 2.2 },
      { at: 3.2, kind: 'arrive', x: -35, z: 175, from: 230, sec: 2.5 },
      { at: 3.6, kind: 'arrive', x: 40, z: 175, from: 240, sec: 2.5 },
    ],
  },
  // The fortress's charge blows (SB-1860): the walls come down under the camera, then the view rises to the battery past
  // them, cuts out to the sea where a craft goes down, and ends behind the mech outside the sea gate. Every key is relative
  // to the mech (the run may end anywhere outside the gate); the last one is the game's own camera. The sea keys stand at
  // z 100-150, inside camera.far 260 of the craft they watch. The wall's fall is drawn by syncWorld from `brokenProps`,
  // not by a `collapse` event; the bursts here are the shells of the charge going off.
  'fortress-blast': {
    camera: [
      { at: 0, pos: [0, 18, -8], look: [0, 8, -128], rel: true }, // outside the sea gate, over the fortress
      { at: 3, pos: [0, 14, -14], look: [0, 10, -240], rel: true }, // up to the battery's place beyond the ruin
      { at: 4, pos: [0, 16, 178], look: [0, 6, 258], rel: true }, // cut out to the sea
      { at: 4.02, pos: [0, 16, 178], look: [0, 6, 258], rel: true }, // hold it: the cut is not a long flight
      { at: 7, pos: [0, 14, 198], look: [0, 4, 278], rel: true }, // the craft off the beach as it goes down
      { at: 10, pos: [2.15, 4.4, 8.6], look: [2.15, 2.9, 0], rel: true }, // the game's camera behind the mech
    ],
    lines: [
      { from: 0.5, to: 3.6, key: 'cutscene.blast.fall' },
      { from: 6.2, to: 9.4, key: 'cutscene.blast.gun' },
    ],
    events: [
      { at: 0.2, kind: 'burst', x: -30, z: -120 },
      { at: 0.5, kind: 'burst', x: 0, z: -120 },
      { at: 0.8, kind: 'burst', x: 30, z: -120 },
      { at: 1.1, kind: 'burst', x: -24, z: -71 }, // the sea wall
      { at: 1.4, kind: 'burst', x: 24, z: -71 },
      { at: 1.7, kind: 'burst', x: -12, z: -125 },
      { at: 2.0, kind: 'burst', x: 12, z: -125 },
      { at: 2.3, kind: 'burst', x: 0, z: -100 },
      { at: 2.6, kind: 'burst', x: -32, z: -100 },
      { at: 2.8, kind: 'burst', x: 32, z: -100 },
      // the craft off the beach rolls over as the charge blows; at 6 s the great gun beyond fires on another
      { at: 2.5, kind: 'sink', x: 0, z: 180, sec: 2 },
      { at: 6, kind: 'burst', x: 0, z: -265 }, // the super-heavy gun's place (L8 brings its model)
      { at: 6, kind: 'sink', x: 30, z: 184, sec: 2 },
    ],
  },
};
