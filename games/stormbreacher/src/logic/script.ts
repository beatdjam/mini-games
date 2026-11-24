// The mission script (SB-050): triggers go in, events come out. The script keeps only its state; the mission's
// write-up (data/missions/m1.ts) is passed in on every call. No three and no DOM, so a node test can run it. Time is
// the script's own seconds, advanced by stepScript, never the wall clock.
import { ALLY_FATES } from '../data/allies.ts';
import { PAYOFFS } from '../data/payoff.ts';
import { CUTSCENE_SEC } from '../data/script.ts';
import type { Action, AllyFateBy, Cue, CutsceneId, HolePaths, MissionDef, Trigger } from '../data/types.ts';

export interface ScriptState {
  time: number; // seconds since the mission started
  fired: Record<string, number>; // cue id -> the time it fired (s)
  flags: string[];
  destroyed: string[];
  blasts: string[]; // the blast points the game has blown, in the order they blew, so a cue can wait for a line's hole
  ashore: boolean; // the mech has left the landing craft
  entered: string[];
  cleared: string[];
  spawned: string[]; // the waves sent so far, so a restored checkpoint can send the ones not cleared again
  wardenDown: boolean; // the mid boss blew (SB-1850), so the fortress's magazine may be charged (SB-1860)
  fortressDown: boolean; // the fortress's charge blew and the walls came down (SB-1860)
  objective: string | null;
  marks: string[];
  cutscene: { id: CutsceneId; left: number } | null;
  checkpoint: { id: string; snapshot: ScriptState } | null;
  ended: string | null;
}

// An event per action kind, plus the end of a cutscene; `time` is when the script produced it (s).
export type ScriptOut =
  | { kind: 'objective'; id: string; time: number }
  | { kind: 'radio'; line: string; delay?: number; callout?: string; time: number }
  | { kind: 'spawn'; wave: string; dormant?: boolean; time: number }
  | { kind: 'wake'; wave: string; time: number }
  | { kind: 'wake'; enemy: string; time: number }
  | { kind: 'ally'; id: string; path: string; fate?: { at: string; by: AllyFateBy; call?: string }; time: number }
  | { kind: 'allyMove'; id: string; path: string; time: number }
  | { kind: 'suppress'; id: string; wave: string; sec: number; time: number } // an ally's support fire on a wave (SB-2020)
  | { kind: 'allyFall'; id: string; by: AllyFateBy; time: number }
  | { kind: 'assist'; waves: readonly string[]; time: number }
  | { kind: 'cutscene'; id: CutsceneId; time: number }
  | { kind: 'cutsceneEnd'; id: CutsceneId; time: number }
  | { kind: 'checkpoint'; id: string; time: number }
  | { kind: 'flag'; name: string; time: number }
  | { kind: 'map'; mark: string; on: boolean; time: number }
  | { kind: 'payoff'; id: string; time: number } // a milestone's knock, carried out by the game and the view
  | { kind: 'end'; result: string; time: number };

// What the game tells the script. `skip` is the cutscene being passed over.
export type ScriptInput =
  | { kind: 'enter'; area: string }
  | { kind: 'destroyed'; target: string }
  | { kind: 'blast'; id: string } // a blast point blew and opened its line
  | { kind: 'ashore' } // the mech stepped off the landing craft onto the beach
  | { kind: 'cleared'; wave: string }
  | { kind: 'wardenDown' } // the mid boss's smoke ended and it blew (SB-1860)
  | { kind: 'fortressDown' } // the fortress's charge blew (SB-1860)
  | { kind: 'skip' };

// Times that should match do not have to match bit for bit (4 s of 1/60 frames is not exactly 4).
const TIME_EPS = 1e-9;

export function newScript(def: MissionDef): ScriptState {
  validateMission(def);
  return {
    time: 0,
    fired: {},
    flags: [],
    destroyed: [],
    blasts: [],
    ashore: false,
    entered: [],
    cleared: [],
    spawned: [],
    wardenDown: false,
    fortressDown: false,
    objective: null,
    marks: [],
    cutscene: null,
    checkpoint: null,
    ended: null,
  };
}

function requireIn(list: readonly string[], value: string, what: string): void {
  if (!list.includes(value)) throw new Error(`no ${what} "${value}" in the mission`);
}

// Refuses a mission whose cues point at names it does not have, or whose cue ids repeat. Radio lines are not checked
// here: logic cannot read the language files, so a test checks them.
export function validateMission(def: MissionDef): void {
  const ids = new Set<string>();
  for (const cue of def.cues) {
    if (ids.has(cue.id)) throw new Error(`cue "${cue.id}" appears twice`);
    ids.add(cue.id);
  }
  for (const cue of def.cues) {
    checkTrigger(def, cue.id, cue.trigger, ids);
    for (const name of cue.when ?? []) requireIn(def.flags ?? [], name, 'flag');
    for (const name of cue.unless ?? []) requireIn(def.flags ?? [], name, 'flag');
    for (const action of cue.actions) checkAction(def, cue.id, action);
  }
}

function checkTrigger(def: MissionDef, cueId: string, trigger: Trigger, ids: ReadonlySet<string>): void {
  switch (trigger.kind) {
    case 'start':
      return;
    case 'enter':
      if (!(trigger.area in def.areas)) throw new Error(`cue "${cueId}": no area "${trigger.area}"`);
      return;
    case 'destroyed':
      for (const target of trigger.targets) requireIn(def.targets, target, 'target');
      return;
    case 'blast':
      // the blast points belong to the map, which the mission does not hold: a wrong id here simply never fires
      return;
    case 'ashore':
      return;
    case 'cleared':
      requireIn(def.waves, trigger.wave, 'wave');
      return;
    case 'after':
      if (!ids.has(trigger.cue)) throw new Error(`cue "${cueId}": no cue "${trigger.cue}" to wait for`);
      return;
    case 'flag':
      requireIn(def.flags ?? [], trigger.name, 'flag');
      return;
    case 'wardenDown':
      return;
    case 'fortressDown':
      return;
    default:
      throw new Error(`cue "${cueId}": unknown trigger ${JSON.stringify(trigger)}`);
  }
}

function checkAction(def: MissionDef, cueId: string, action: Action): void {
  switch (action.kind) {
    case 'objective':
      requireIn(def.objectives, action.id, 'objective');
      if (action.unlessFired !== undefined && !def.cues.some(c => c.id === action.unlessFired)) {
        throw new Error(`cue "${cueId}": no cue "${action.unlessFired}" for unlessFired`);
      }
      return;
    case 'radio':
      return;
    case 'spawn':
      requireIn(def.waves, action.wave, 'wave');
      return;
    case 'wake':
      // an enemy id is made at run time, so only a wave name can be checked here
      if ('wave' in action) requireIn(def.waves, action.wave, 'wave');
      return;
    case 'ally':
      requireIn(def.allies, action.id, 'ally');
      checkWay(def, action.path);
      if (action.fate) {
        requireIn(Object.keys(def.places), action.fate.at, 'place');
        requireIn(ALLY_FATES, action.fate.by, 'fate');
      }
      return;
    case 'allyMove':
      requireIn(def.allies, action.id, 'ally');
      checkWay(def, action.path);
      return;
    case 'suppress':
      requireIn(def.allies, action.id, 'ally');
      requireIn(def.waves, action.wave, 'wave');
      return;
    case 'allyFall':
      requireIn(def.allies, action.id, 'ally');
      requireIn(ALLY_FATES, action.by, 'fate');
      return;
    case 'assist':
      // the waves the allies shoot at are the mission's own, as a `spawn` names one
      for (const wave of action.waves) requireIn(def.waves, wave, 'wave');
      return;
    case 'cutscene':
      if (!(action.id in CUTSCENE_SEC)) throw new Error(`cue "${cueId}": no cutscene "${action.id}"`);
      return;
    case 'checkpoint':
    case 'end':
      return;
    case 'flag':
      requireIn(def.flags ?? [], action.name, 'flag');
      return;
    case 'rearm':
      for (const area of action.areas) requireIn(Object.keys(def.areas), area, 'area');
      return;
    case 'map':
      requireIn(def.marks, action.mark, 'mark');
      return;
    case 'payoff':
      requireIn(Object.keys(PAYOFFS), action.id, 'payoff');
      return;
    default:
      throw new Error(`cue "${cueId}": unknown action ${JSON.stringify(action)}`);
  }
}

// The names a way may use: one path as it stands, or every path a hole choice can take. The keys of a hole choice must
// cover every combination of its lines' points, so a missing way is caught when the mission loads.
function checkWay(def: MissionDef, way: string | HolePaths): void {
  const names = Object.keys(def.paths);
  if (typeof way === 'string') {
    requireIn(names, way, 'path');
    return;
  }
  for (const path of Object.values(way.paths)) requireIn(names, path, 'path');
  let keys = [''];
  for (const ids of way.lines) keys = keys.flatMap(prefix => ids.map(id => (prefix === '' ? id : `${prefix}+${id}`)));
  for (const key of keys) requireIn(Object.keys(way.paths), key, 'way');
}

// The path an `ally` or `allyMove` takes now: the first point the game blew in each line the way crosses picks that
// line's part. A line with no blown point uses its first id: an escape hatch for the dev views and the tests, never for
// the sortie's own order (a cue that picks a hole is written to fire after the blast).
function wayPath(s: ScriptState, way: string | HolePaths): string {
  if (typeof way === 'string') return way;
  const chosen: string[] = [];
  for (const ids of way.lines) {
    let picked = ids[0];
    for (const id of s.blasts) {
      if (ids.includes(id)) {
        picked = id;
        break;
      }
    }
    chosen.push(picked);
  }
  const path = way.paths[chosen.join('+')];
  if (path === undefined) throw new Error(`no way for the holes "${chosen.join('+')}"`);
  return path;
}

function checkInput(def: MissionDef, input: ScriptInput): void {
  switch (input.kind) {
    case 'enter':
      if (!(input.area in def.areas)) throw new Error(`no area "${input.area}" in the mission`);
      return;
    case 'destroyed':
      requireIn(def.targets, input.target, 'target');
      return;
    case 'blast':
      return;
    case 'ashore':
      return;
    case 'cleared':
      requireIn(def.waves, input.wave, 'wave');
      return;
    case 'wardenDown':
    case 'fortressDown':
      return;
    case 'skip':
      return;
    default:
      throw new Error(`unknown input ${JSON.stringify(input)}`);
  }
}

const firedAt = (s: ScriptState, id: string): number | undefined =>
  Object.prototype.hasOwnProperty.call(s.fired, id) ? s.fired[id] : undefined;

function isDue(s: ScriptState, cue: Cue, allowStart: boolean): boolean {
  // The flags come before the trigger: a cue whose condition is not met does not fire even when its trigger is due.
  if (cue.when !== undefined && !cue.when.every(name => s.flags.includes(name))) return false;
  if (cue.unless !== undefined && cue.unless.some(name => s.flags.includes(name))) return false;
  const trigger = cue.trigger;
  switch (trigger.kind) {
    case 'start':
      // a plain start is due at time 0 only; a start with when or unless waits for its condition (checked above)
      return allowStart && (s.time === 0 || cue.when !== undefined || cue.unless !== undefined);
    case 'enter':
      return s.entered.includes(trigger.area);
    case 'destroyed': {
      const needed = trigger.count ?? trigger.targets.length;
      let down = 0;
      for (const target of trigger.targets) if (s.destroyed.includes(target)) down++;
      return down >= needed;
    }
    case 'blast':
      return trigger.ids.some(id => s.blasts.includes(id));
    case 'ashore':
      return s.ashore;
    case 'cleared':
      return s.cleared.includes(trigger.wave);
    case 'after': {
      const at = firedAt(s, trigger.cue);
      return at !== undefined && s.time + TIME_EPS >= at + trigger.sec;
    }
    case 'flag':
      return s.flags.includes(trigger.name);
    case 'wardenDown':
      return s.wardenDown;
    case 'fortressDown':
      return s.fortressDown;
  }
}

// Fires every due cue, then looks again: a cue that fires may make an `after ... 0` cue due in the same frame.
function fireDue(s: ScriptState, def: MissionDef, out: ScriptOut[], allowStart: boolean): void {
  let again = true;
  while (again) {
    again = false;
    for (const cue of def.cues) {
      if (firedAt(s, cue.id) !== undefined) continue;
      if (!isDue(s, cue, allowStart)) continue;
      s.fired[cue.id] = s.time;
      let checkpoint: string | null = null;
      for (const action of cue.actions) {
        applyAction(s, action, out);
        if (action.kind === 'checkpoint') checkpoint = action.id;
      }
      // The copy is taken once the whole cue has acted: M1's seawall cue sets the checkpoint first and then the
      // objective and the boss, and a copy taken in between came back with neither (the cue counts as fired). A
      // cutscene in the cue is not kept: coming back from the checkpoint must not play it again (SB-1860's cp3).
      if (checkpoint !== null) {
        const snapshot = snapshotOf(s);
        snapshot.cutscene = null;
        s.checkpoint = { id: checkpoint, snapshot };
      }
      again = true;
    }
  }
}

function applyAction(s: ScriptState, action: Action, out: ScriptOut[]): void {
  const time = s.time;
  switch (action.kind) {
    case 'objective':
      if (action.unlessFired !== undefined && firedAt(s, action.unlessFired) !== undefined) return;
      s.objective = action.id;
      out.push({ kind: 'objective', id: action.id, time });
      return;
    case 'radio':
      out.push({
        kind: 'radio',
        line: action.line,
        ...(action.delay === undefined ? {} : { delay: action.delay }),
        ...(action.callout === undefined ? {} : { callout: action.callout }),
        time,
      });
      return;
    case 'spawn':
      if (!s.spawned.includes(action.wave)) s.spawned.push(action.wave);
      out.push(
        action.dormant === true
          ? { kind: 'spawn', wave: action.wave, dormant: true, time }
          : { kind: 'spawn', wave: action.wave, time },
      );
      return;
    case 'wake':
      out.push(
        'wave' in action ? { kind: 'wake', wave: action.wave, time } : { kind: 'wake', enemy: action.enemy, time },
      );
      return;
    case 'ally': {
      const path = wayPath(s, action.path);
      out.push(
        action.fate
          ? { kind: 'ally', id: action.id, path, fate: action.fate, time }
          : { kind: 'ally', id: action.id, path, time },
      );
      return;
    }
    case 'allyMove':
      out.push({ kind: 'allyMove', id: action.id, path: wayPath(s, action.path), time });
      return;
    case 'suppress':
      out.push({ kind: 'suppress', id: action.id, wave: action.wave, sec: action.sec, time });
      return;
    case 'allyFall':
      out.push({ kind: 'allyFall', id: action.id, by: action.by, time });
      return;
    case 'assist':
      // the script only reports it: the game holds how often the allies shoot and which enemy each shot takes
      out.push({ kind: 'assist', waves: action.waves, time });
      return;
    case 'cutscene':
      s.cutscene = { id: action.id, left: CUTSCENE_SEC[action.id] };
      out.push({ kind: 'cutscene', id: action.id, time });
      return;
    case 'checkpoint':
      // the copy itself is taken by fireDue, after the rest of the cue
      out.push({ kind: 'checkpoint', id: action.id, time });
      return;
    case 'flag':
      if (!s.flags.includes(action.name)) s.flags.push(action.name);
      out.push({ kind: 'flag', name: action.name, time });
      return;
    case 'rearm':
      // An area the mech passed before the question must not answer it; the game sends `enter` again while it stands inside
      s.entered = s.entered.filter(area => !action.areas.includes(area));
      return;
    case 'map':
      if (action.on) {
        if (!s.marks.includes(action.mark)) s.marks.push(action.mark);
      } else {
        s.marks = s.marks.filter(mark => mark !== action.mark);
      }
      out.push({ kind: 'map', mark: action.mark, on: action.on, time });
      return;
    case 'payoff':
      out.push({ kind: 'payoff', id: action.id, time });
      return;
    case 'end':
      s.ended = action.result;
      out.push({ kind: 'end', result: action.result, time });
      return;
    default:
      throw new Error(`unknown action ${JSON.stringify(action)}`);
  }
}

// A deep copy of the state at this moment. A checkpoint never saves itself, so checkpoints cannot nest.
function snapshotOf(s: ScriptState): ScriptState {
  return {
    time: s.time,
    fired: { ...s.fired },
    flags: [...s.flags],
    destroyed: [...s.destroyed],
    blasts: [...s.blasts],
    ashore: s.ashore,
    entered: [...s.entered],
    cleared: [...s.cleared],
    spawned: [...s.spawned],
    wardenDown: s.wardenDown,
    fortressDown: s.fortressDown,
    objective: s.objective,
    marks: [...s.marks],
    cutscene: s.cutscene === null ? null : { ...s.cutscene },
    checkpoint: null, // the one field a checkpoint leaves out
    ended: s.ended,
  };
}

// The state as it was when the last checkpoint was taken. The restored state keeps the same checkpoint, so going down
// again after it goes back there again (the cue that took it has fired and will not pass it a second time).
export function restoreCheckpoint(s: ScriptState): ScriptState {
  if (s.checkpoint === null) throw new Error('no checkpoint to restore');
  const restored = snapshotOf(s.checkpoint.snapshot);
  restored.checkpoint = s.checkpoint;
  return restored;
}

// The events that set the screen up again after a restore: the objective, the map marks that are on, and the waves
// sent and not yet cleared (the game re-creates their enemies). Their time is the restored state's.
export function checkpointReplay(s: ScriptState): ScriptOut[] {
  const out: ScriptOut[] = [];
  if (s.objective !== null) out.push({ kind: 'objective', id: s.objective, time: s.time });
  for (const mark of s.marks) out.push({ kind: 'map', mark, on: true, time: s.time });
  for (const wave of s.spawned) if (!s.cleared.includes(wave)) out.push({ kind: 'spawn', wave, time: s.time });
  return out;
}

export function scriptInput(s: ScriptState, def: MissionDef, input: ScriptInput): ScriptOut[] {
  checkInput(def, input);
  const out: ScriptOut[] = [];
  switch (input.kind) {
    case 'enter':
      if (!s.entered.includes(input.area)) s.entered.push(input.area);
      break;
    case 'destroyed':
      if (!s.destroyed.includes(input.target)) s.destroyed.push(input.target);
      break;
    case 'blast':
      if (!s.blasts.includes(input.id)) s.blasts.push(input.id);
      break;
    case 'ashore':
      s.ashore = true;
      break;
    case 'cleared':
      if (!s.cleared.includes(input.wave)) s.cleared.push(input.wave);
      break;
    case 'wardenDown':
      s.wardenDown = true;
      break;
    case 'fortressDown':
      s.fortressDown = true;
      break;
    case 'skip':
      if (s.cutscene !== null) {
        const id = s.cutscene.id;
        s.cutscene = null;
        out.push({ kind: 'cutsceneEnd', id, time: s.time });
      }
      break;
    default:
      throw new Error(`unknown input ${JSON.stringify(input)}`);
  }
  fireDue(s, def, out, false);
  return out;
}

export function stepScript(s: ScriptState, def: MissionDef, dt: number): ScriptOut[] {
  const out: ScriptOut[] = [];
  // The start fires on the first step, at the script's time 0, before any time is added.
  fireDue(s, def, out, true);
  if (!(dt > 0)) return out;
  s.time += dt;
  if (s.cutscene !== null) {
    s.cutscene.left -= dt;
    if (s.cutscene.left <= TIME_EPS) {
      const id = s.cutscene.id;
      s.cutscene = null;
      out.push({ kind: 'cutsceneEnd', id, time: s.time });
    }
  }
  fireDue(s, def, out, false);
  return out;
}
