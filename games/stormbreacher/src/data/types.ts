// The screens the game can be in. Only the title for now; 'briefing', 'play' and the rest come with the prototype.
export type GameState = 'title';

// What a state means to the game, kept one per state in data/states.ts.
export interface StateDef {
  playing: boolean;
}

// The mission script (SB-050): the cues that say what happens when, run by logic/script.ts. A cue is one trigger and
// the actions it runs in order; every cue fires once.

// The cutscenes the mission script may enter. The lengths are in data/script.ts.
export type CutsceneId = 'landing' | 'wave2-sinks' | 'beach-held';

// A place the player may enter, as a rectangle on the ground: its centre and its width (x) and depth (z) in metres.
export interface Area {
  x: number;
  z: number;
  w: number;
  d: number;
}

// What starts a cue. `count` left out means every target, `count: 1` means any one of them.
export type Trigger =
  | { kind: 'start' }
  | { kind: 'enter'; area: string }
  | { kind: 'destroyed'; targets: readonly string[]; count?: number }
  | { kind: 'cleared'; wave: string }
  | { kind: 'after'; cue: string; sec: number } // sec 0 fires in the same frame as the cue it follows
  | { kind: 'flag'; name: string };

// What a cue does, in order. The script only reports these as events; the screen and the map carry them out.
export type Action =
  | { kind: 'objective'; id: string }
  | { kind: 'radio'; line: string }
  | { kind: 'spawn'; wave: string }
  | { kind: 'ally'; id: string; path: string; fate?: { at: string; by: string } }
  | { kind: 'cutscene'; id: CutsceneId }
  | { kind: 'checkpoint'; id: string }
  | { kind: 'flag'; name: string }
  | { kind: 'map'; mark: string; on: boolean }
  | { kind: 'end'; result: 'cleared' };

// One line of a mission's script.
export interface Cue {
  id: string;
  trigger: Trigger;
  actions: readonly Action[];
}

// A mission's whole script and the names its cues may use. The lists are what validateMission checks against.
export interface MissionDef {
  id: string;
  cues: readonly Cue[];
  areas: Record<string, Area>;
  targets: readonly string[];
  waves: readonly string[];
  objectives: readonly string[];
  marks: readonly string[];
  allies: readonly string[];
  paths: readonly string[];
}

// The map (SB-055): what stands where on M1's B line and the front of C, written by hand, made from a seed, or put
// together in the editor. A prop is a piece of the ground or an obstacle; a target is a thing a cue can destroy; a
// spawn is where a wave comes in. +z is the sea and -z is the land.
export type PropKind = 'tile' | 'hedgehog' | 'block' | 'bunker' | 'seawall' | 'cliff' | 'crater' | 'wreck';

export const PROP_KINDS: readonly PropKind[] = [
  'tile',
  'hedgehog',
  'block',
  'bunker',
  'seawall',
  'cliff',
  'crater',
  'wreck',
];

export interface Prop {
  kind: PropKind;
  x: number; // the middle of the thing on the ground (m)
  z: number;
  yaw: number; // how far it is turned about its middle (rad)
  scale: number; // its size (tile: how dark the sand is)
}

export type TargetKind = 'pillbox' | 'depot' | 'gun' | 'magazine';

export const TARGET_KINDS: readonly TargetKind[] = ['pillbox', 'depot', 'gun', 'magazine'];

export interface TargetPlace {
  id: string; // the name the mission uses (pillbox-1, depot, ...)
  kind: TargetKind;
  x: number;
  z: number;
  yaw: number;
}

export interface SpawnPoint {
  x: number; // where a wave comes in (m)
  z: number;
}

export interface MapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface MapDef {
  id: string;
  bounds: MapBounds;
  props: Prop[];
  targets: TargetPlace[];
  spawns: Record<string, SpawnPoint[]>; // wave name -> the places it comes in
}

// What the generator must put down: bands of one kind, the cliff along the right edge, the clear ground around the
// targets and the lanes that stay open from front to back.
export interface MapBand {
  minZ: number;
  maxZ: number;
  kind: PropKind;
  count: number;
  minGap: number; // the least distance between two props of this band (m)
}

export interface MapCliff {
  x: number; // the cliff's line along the right edge (m)
  minZ: number;
  maxZ: number;
  count: number;
}

export interface MapLane {
  x: number; // the lane's middle (m)
  width: number; // the lane's full width (m)
}

export interface MapRules {
  id: string;
  bounds: MapBounds;
  bands: MapBand[];
  cliff: MapCliff;
  clear?: number; // the clear ground around a target (m); 10 when left out
  lanes: MapLane[];
}
