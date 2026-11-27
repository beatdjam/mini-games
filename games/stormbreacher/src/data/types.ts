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
export type CutsceneId = 'landing' | 'wave2-sinks' | 'beach-held' | 'fortress-blast';

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
  | { kind: 'blast'; ids: readonly string[] }
  | { kind: 'ashore' } // the mech has left the landing craft (mech.z at or past the map's front edge)
  | { kind: 'cleared'; wave: string }
  | { kind: 'after'; cue: string; sec: number } // sec 0 fires in the same frame as the cue it follows
  | { kind: 'flag'; name: string }
  | { kind: 'wardenDown' } // the mid boss's smoke ended and it blew (SB-1860)
  | { kind: 'fortressDown' }; // the fortress's charge blew (SB-1860)

// A way the player's first blast in each line decides. `lines` lists each line's blast points in the order the run
// crosses their lines; the first point of a line that the game blew picks that line's part. `paths` maps the chosen ids,
// joined with '+', to a path name. A line with no blown point falls back to its first id, which keeps a checkpoint or a
// test that reaches the cue without the blast on the expected way.
export interface HolePaths {
  lines: readonly (readonly string[])[];
  paths: Readonly<Record<string, string>>;
}

// How an ally falls (`fate.by` of a script's `ally` action): a mortar shell on the beach, a machine gun on the
// bunker line, or a shell before the fortress. ALLY_FATES in data/allies.ts lists them for validateMission.
export type AllyFateBy = 'mortar' | 'gun' | 'shell';

// What a cue does, in order. The script only reports these as events; the screen and the map carry them out.
export type Action =
  | { kind: 'objective'; id: string; unlessFired?: string } // `unlessFired`: skipped when that cue has already fired (an objective of a later step must not be pulled back)
  | { kind: 'radio'; line: string; delay?: number; callout?: string } // `delay`: the line waits this many seconds before it comes up; `callout`: a language key for a short order shown near the aim while the line is up (SB-2028)
  | { kind: 'spawn'; wave: string; dormant?: boolean } // `dormant`: put out asleep, held until a `wake`
  | { kind: 'wake'; wave: string } // wake every living enemy of the wave
  | { kind: 'wake'; enemy: string } // wake one enemy by id
  | { kind: 'ally'; id: string; path: string | HolePaths; fate?: { at: string; by: AllyFateBy; call?: string } }
  | { kind: 'allyMove'; id: string; path: string | HolePaths } // an ally already out takes the next way
  | { kind: 'suppress'; id: string; wave: string; sec: number } // an ally's support fire silences a wave of nests for sec (SB-2020); `id` names the ally mech for the script check only, a tracer leaves from whichever ally is nearest the nest
  | { kind: 'allyFall'; id: string; by: AllyFateBy } // an ally already out falls where it stands
  | { kind: 'assist'; waves: readonly string[] } // the scripted allies shoot one enemy of these waves every interval; no hit box
  | { kind: 'cutscene'; id: CutsceneId }
  | { kind: 'checkpoint'; id: string }
  | { kind: 'flag'; name: string }
  | { kind: 'rearm'; areas: readonly string[] } // forget that the areas were entered; walking in again counts
  | { kind: 'map'; mark: string; on: boolean }
  | { kind: 'payoff'; id: string } // a milestone's knock (data/payoff.ts)
  | { kind: 'end'; result: 'cleared' };

// One line of a mission's script. `when` and `unless` are extra conditions on the flags: all of `when` must stand and
// none of `unless` may; the flags are the mission's `flags`. Either may be left out.
export interface Cue {
  id: string;
  trigger: Trigger;
  when?: readonly string[];
  unless?: readonly string[];
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
  flags?: readonly string[]; // the flags the cues may raise and test; left out means the mission has none
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
  | 'lowWall' // a low obstacle: too high to walk onto (above the 0.75 m step), so the mech goes around
  | 'stairs' // one flight of steps up the seawall; its rects are one per step (STAIRS_TUNE)
  | 'ramp' // one ramp up the seawall; one rect whose top slopes down to its seaward end (RAMP_TUNE)
  | 'fortWall'; // a wall of the fortress: high, thick, not shot down

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
  'fortWall',
];

export interface Prop {
  kind: PropKind;
  x: number; // the middle of the thing on the ground (m)
  z: number;
  yaw: number; // how far it is turned about its middle (rad)
  scale: number; // its size (tile: how dark the sand is)
  breakable?: boolean; // a prop a shot may break (SB-190); its kind's health is PROP_HP
  collapse?: boolean; // a prop the fortress blast brings down (SB-1860); a shot does not break it
}

// fortressGun: the heavy machine-gun nest on the fortress's sea wall.
export type TargetKind = 'pillbox' | 'depot' | 'gun' | 'magazine' | 'fortressGun';

export const TARGET_KINDS: readonly TargetKind[] = ['pillbox', 'depot', 'gun', 'magazine', 'fortressGun'];

export interface TargetPlace {
  id: string; // the name the mission uses (pillbox-1, depot, ...)
  kind: TargetKind;
  x: number;
  z: number;
  yaw: number;
  y?: number; // the bottom of the target's box above the ground (m); left out means 0
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
  fuse?: number; // seconds from planting to the blast (SB-1860); left out means CHARGE_TUNE.fuse
  after?: 'wardenDown'; // the point can be charged only once the script has heard this (the mid boss is down)
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
