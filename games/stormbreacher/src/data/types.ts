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
