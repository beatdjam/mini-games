// The screens the game can be in: the title, the sortie itself and its result. 'briefing' and the rest come with the
// prototype.
export type GameState = 'title' | 'briefing' | 'play' | 'paused' | 'result';

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

// How an ally falls (`fate.by` of a script's `ally` action): a mortar shell on the beach, or a machine gun on the
// bunker line. ALLY_FATES in data/allies.ts lists them for validateMission.
export type AllyFateBy = 'mortar' | 'gun';

// What a cue does, in order. The script only reports these as events; the screen and the map carry them out.
export type Action =
  | { kind: 'objective'; id: string }
  | { kind: 'radio'; line: string }
  | { kind: 'spawn'; wave: string }
  | { kind: 'ally'; id: string; path: string; fate?: { at: string; by: AllyFateBy; call?: string } }
  | { kind: 'allyMove'; id: string; path: string } // an ally already out takes the next way
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

// A point on the ground (m); +z is the sea.
export interface GroundSpot {
  x: number;
  z: number;
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
  paths: Readonly<Record<string, readonly GroundSpot[]>>; // the ways an ally runs, by name; a way is the points it passes in order
  places: Readonly<Record<string, GroundSpot>>; // the places a fate happens at, by name
}

// The map (SB-055): what stands where on M1's B line and the front of C, written by hand, made from a seed, or put
// together in the editor. A prop is a piece of the ground or an obstacle; a target is a thing a cue can destroy; a
// spawn is where a wave comes in. +z is the sea and -z is the land.
export type PropKind =
  | 'tile'
  | 'hedgehog'
  | 'block'
  | 'bunker'
  | 'seawall'
  | 'cliff'
  | 'crater'
  | 'wreck'
  | 'lowWall' // a low obstacle: too high to walk onto, low enough to jump over
  | 'stairs' // one flight of steps up the seawall; its rects are one per step (STAIRS_TUNE)
  | 'ramp'; // one ramp up the seawall; one rect whose top slopes down to its seaward end (RAMP_TUNE)

export const PROP_KINDS: readonly PropKind[] = [
  'tile',
  'hedgehog',
  'block',
  'bunker',
  'seawall',
  'cliff',
  'crater',
  'wreck',
  'lowWall',
  'stairs',
  'ramp',
];

export interface Prop {
  kind: PropKind;
  x: number; // the middle of the thing on the ground (m)
  z: number;
  yaw: number; // how far it is turned about its middle (rad)
  scale: number; // its size (tile: how dark the sand is)
  breakable?: boolean; // a prop a shot may break (SB-190); its kind's health is PROP_HP
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

// Where a mine lies on the ground (m).
export interface MinePlace {
  x: number;
  z: number;
}

// A place a charge may be planted (m). `line` is the line's centre z (null for a point that belongs to no line, such as a
// pillbox's); `x` and `z` are the point on the ground. +z is the sea, and a point on a line stands 2 m sea-side of the
// line's most seaward face. `target` names the target the charge breaks: a pillbox's point sets it, a point on a line
// leaves it out.
export interface BlastPlace {
  id: string;
  line: number | null;
  x: number;
  z: number;
  target?: string;
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
  mines?: MinePlace[]; // left out where a map has none: the generated and edited maps hold none, so only the hand map sets it
  blasts?: BlastPlace[]; // the places a charge may be planted, left out where a map has none
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

// A defence line: rows of one kind across x, with a gap where the mech may pass and a stretch that can be broken
// through later. `z` is the line's middle, `depth` its span along z and `spacing` the distance between props in a row.
export interface MapGap {
  x: number; // the gap's middle (m)
  width: number; // the clear distance between the props' rectangles (m)
}

export interface MapLine {
  z: number; // the line's middle (m)
  depth: number; // the line's span along z (m)
  rows: number; // how many rows the line has
  kind: PropKind;
  spacing: number; // the distance between props in a row (m)
  gaps: MapGap[]; // the breakthroughs
  breakable: MapGap[]; // the stretches whose props are marked breakable
}

export interface MapRules {
  id: string;
  bounds: MapBounds;
  lines: MapLine[];
  bands: MapBand[];
  cliff: MapCliff;
  clear?: number; // the clear ground around a target (m); 10 when left out
  lanes: MapLane[];
}

// The briefing (SB-310): what its map can show, and the lines that bring them in.
// battery: the guns and the magazine; pillboxes; squad: where the B line's soldiers come in; depot; wave1 and wave2:
// the arrows of the first wave (the player's, with the ally) and of the second wave that follows.
export type BriefingSymbol = 'battery' | 'pillboxes' | 'squad' | 'depot' | 'wave1' | 'wave2';

export interface BriefingLine {
  key: string; // the language key of the line
  at: number; // when the line comes, from the start (s)
  show: readonly BriefingSymbol[]; // the symbols that come in with it; they blink while it is the latest line
}
