import { expect, test } from 'vitest';
import { M1, PILLBOXES_DOWN_FLAG } from '../../src/data/missions/m1.ts';
import { CUTSCENE_SEC } from '../../src/data/script.ts';
import type { Cue, MissionDef } from '../../src/data/types.ts';
import {
  newScript,
  restoreCheckpoint,
  scriptInput,
  stepScript,
  validateMission,
  type ScriptOut,
  type ScriptState,
} from '../../src/logic/script.ts';

const STEP = 1 / 60;

// The M1 script with the landing passed and both pillboxes down, so cp1 has just fired at time 0.
function atPillboxesDown(): ScriptState {
  const s = newScript(M1);
  stepScript(s, M1, 0);
  scriptInput(s, M1, { kind: 'skip' });
  scriptInput(s, M1, { kind: 'enter', area: 'b-line' });
  scriptInput(s, M1, { kind: 'destroyed', target: 'pillbox-1' });
  scriptInput(s, M1, { kind: 'destroyed', target: 'pillbox-2' });
  return s;
}

function cueOf(def: MissionDef, id: string): Cue {
  const cue = def.cues.find(c => c.id === id);
  if (!cue) throw new Error(`the mission has no cue "${id}"`);
  return cue;
}

function cloneM1(): MissionDef {
  return structuredClone(M1);
}

test('destroyed with count 1 fires on either gun, once', () => {
  for (const first of ['main-gun-1', 'main-gun-2'] as const) {
    const s = atPillboxesDown();
    const second = first === 'main-gun-1' ? 'main-gun-2' : 'main-gun-1';
    const one = scriptInput(s, M1, { kind: 'destroyed', target: first });
    expect(one.some(e => e.kind === 'radio' && e.line === 'm1.gun1-down')).toBe(true);
    const firedAt = s.fired.gun1;
    expect(firedAt).toBeTypeOf('number');
    const two = scriptInput(s, M1, { kind: 'destroyed', target: second });
    expect(s.fired.gun1).toBe(firedAt);
    expect(two.filter(e => e.kind === 'radio' && e.line === 'm1.gun1-down')).toHaveLength(0);
  }
});

test('destroyed without count waits for every target', () => {
  const s = newScript(M1);
  stepScript(s, M1, 0);
  scriptInput(s, M1, { kind: 'skip' });
  scriptInput(s, M1, { kind: 'enter', area: 'b-line' });
  scriptInput(s, M1, { kind: 'destroyed', target: 'pillbox-1' });
  expect(s.fired.cp1).toBeUndefined();
  scriptInput(s, M1, { kind: 'destroyed', target: 'pillbox-2' });
  expect(s.fired.cp1).toBeTypeOf('number');
});

test('after 4 s does not fire at 3.9 s and fires at 4 s', () => {
  // M1 has no cue timed from cp1 any more, so the rule is read on a copy with one test cue added
  const def = cloneM1();
  def.flags = [...(def.flags ?? []), 'later'];
  def.cues = [
    ...def.cues,
    { id: 'cp1-later', trigger: { kind: 'after', cue: 'cp1', sec: 4 }, actions: [{ kind: 'flag', name: 'later' }] },
  ];
  const s = newScript(def);
  stepScript(s, def, 0);
  scriptInput(s, def, { kind: 'skip' });
  scriptInput(s, def, { kind: 'enter', area: 'b-line' });
  scriptInput(s, def, { kind: 'destroyed', target: 'pillbox-1' });
  scriptInput(s, def, { kind: 'destroyed', target: 'pillbox-2' });
  for (let i = 0; i < 39; i++) stepScript(s, def, 0.1);
  expect(s.fired['cp1-later']).toBeUndefined();
  stepScript(s, def, 0.1);
  expect(s.fired['cp1-later']).toBeTypeOf('number');
});

test('a cue fires only once', () => {
  const s = newScript(M1);
  const out: ScriptOut[] = [];
  out.push(...stepScript(s, M1, 0));
  const at = s.fired.intro;
  for (let i = 0; i < 60; i++) out.push(...stepScript(s, M1, STEP));
  expect(s.fired.intro).toBe(at);
  expect(out.filter(e => e.kind === 'cutscene' && e.id === 'landing')).toHaveLength(1);
});

test('validateMission refuses names the mission does not have', () => {
  {
    const def = cloneM1();
    cueOf(def, 'pillboxes').trigger = { kind: 'enter', area: 'nowhere' };
    expect(() => validateMission(def)).toThrow(/area/);
  }
  {
    const def = cloneM1();
    cueOf(def, 'depot').trigger = { kind: 'destroyed', targets: ['no-such-target'] };
    expect(() => validateMission(def)).toThrow(/target/);
  }
  {
    const def = cloneM1();
    cueOf(def, 'beach').actions = [{ kind: 'spawn', wave: 'no-such-wave' }];
    expect(() => validateMission(def)).toThrow(/wave/);
  }
  {
    const def = cloneM1();
    cueOf(def, 'beach').actions = [{ kind: 'objective', id: 'no-such-objective' }];
    expect(() => validateMission(def)).toThrow(/objective/);
  }
  {
    const def = cloneM1();
    cueOf(def, 'beach').actions = [{ kind: 'map', mark: 'no-such-mark', on: true }];
    expect(() => validateMission(def)).toThrow(/mark/);
  }
  {
    const def = cloneM1();
    cueOf(def, 'beach').actions = [{ kind: 'ally', id: 'no-such-ally', path: 'beach-run' }];
    expect(() => validateMission(def)).toThrow(/ally/);
  }
  {
    const def = cloneM1();
    cueOf(def, 'beach').actions = [{ kind: 'ally', id: 'buddy', path: 'no-such-path' }];
    expect(() => validateMission(def)).toThrow(/path/);
  }
  {
    const def = cloneM1();
    cueOf(def, 'depot-guard').trigger = { kind: 'after', cue: 'no-such-cue', sec: 1 };
    expect(() => validateMission(def)).toThrow(/cue/);
  }
  {
    const def = cloneM1();
    def.cues = [...def.cues, structuredClone(def.cues[0])];
    expect(() => validateMission(def)).toThrow(/twice/);
  }
});

test('validateMission refuses a flag the mission does not list, wherever the cue names it', () => {
  const unknown = 'no-such-flag';
  {
    const def = cloneM1();
    def.cues = [...def.cues, { id: 'x', trigger: { kind: 'ashore' }, when: [unknown], actions: [] }];
    expect(() => validateMission(def)).toThrow(/flag "no-such-flag"/);
  }
  {
    const def = cloneM1();
    def.cues = [...def.cues, { id: 'x', trigger: { kind: 'ashore' }, unless: [unknown], actions: [] }];
    expect(() => validateMission(def)).toThrow(/flag "no-such-flag"/);
  }
  {
    const def = cloneM1();
    cueOf(def, 'depot').actions = [{ kind: 'flag', name: unknown }];
    expect(() => validateMission(def)).toThrow(/flag "no-such-flag"/);
  }
  {
    const def = cloneM1();
    cueOf(def, 'depot').trigger = { kind: 'flag', name: unknown };
    expect(() => validateMission(def)).toThrow(/flag "no-such-flag"/);
  }
});

test('a start cue with when waits for its flag and then fires once; a plain start cue fires at time 0 only', () => {
  const def: MissionDef = {
    id: 'test-start-when',
    flags: ['open'],
    cues: [
      { id: 'plain', trigger: { kind: 'start' }, actions: [] },
      { id: 'gate', trigger: { kind: 'enter', area: 'gate' }, actions: [{ kind: 'flag', name: 'open' }] },
      { id: 'waits', trigger: { kind: 'start' }, when: ['open'], actions: [] },
    ],
    areas: { gate: { x: 0, z: 0, w: 1, d: 1 } },
    targets: [],
    waves: [],
    objectives: [],
    marks: [],
    allies: [],
    paths: {},
    places: {},
  };
  validateMission(def);
  const s = newScript(def);
  stepScript(s, def, 0);
  expect(s.fired.plain).toBe(0);
  expect(s.fired.waits).toBeUndefined();
  for (let i = 0; i < 10; i++) stepScript(s, def, 0.1);
  expect(s.fired.waits).toBeUndefined();
  scriptInput(s, def, { kind: 'enter', area: 'gate' });
  stepScript(s, def, 0.1);
  const at = s.fired.waits;
  expect(at).toBeGreaterThan(0);
  for (let i = 0; i < 10; i++) stepScript(s, def, 0.1);
  expect(s.fired.waits).toBe(at);
  // unless: due from time 0 while the flag is down
  const down: MissionDef = {
    ...def,
    cues: [{ id: 'quiet', trigger: { kind: 'start' }, unless: ['open'], actions: [] }],
  };
  const t = newScript(down);
  stepScript(t, down, 0);
  expect(t.fired.quiet).toBe(0);
});

// A small script for the cutscene rules: one cue starts a cutscene, another comes 2 s after it.
const CUTSCENE_MISSION: MissionDef = {
  id: 'test-cutscene',
  cues: [
    { id: 'a', trigger: { kind: 'start' }, actions: [{ kind: 'cutscene', id: 'landing' }] },
    { id: 'b', trigger: { kind: 'after', cue: 'a', sec: 2 }, actions: [{ kind: 'flag', name: 'b' }] },
  ],
  areas: {},
  targets: [],
  waves: [],
  objectives: [],
  marks: [],
  flags: ['b'], // the flag cue `b` raises
  allies: [],
  paths: {},
  places: {},
};

test('a cutscene ends after CUTSCENE_SEC', () => {
  const s = newScript(CUTSCENE_MISSION);
  const out: ScriptOut[] = [];
  out.push(...stepScript(s, CUTSCENE_MISSION, 0));
  for (let i = 0; i < Math.round(CUTSCENE_SEC.landing / STEP); i++) out.push(...stepScript(s, CUTSCENE_MISSION, STEP));
  expect(s.cutscene).toBeNull();
  expect(out.filter(e => e.kind === 'cutsceneEnd')).toHaveLength(1);
  expect(out.filter(e => e.kind === 'cutsceneEnd').map(e => (e.kind === 'cutsceneEnd' ? e.id : null))).toEqual([
    'landing',
  ]);
});

test('skip ends the cutscene at once', () => {
  const s = newScript(CUTSCENE_MISSION);
  stepScript(s, CUTSCENE_MISSION, 0);
  const out = scriptInput(s, CUTSCENE_MISSION, { kind: 'skip' });
  expect(out).toEqual([{ kind: 'cutsceneEnd', id: 'landing', time: 0 }]);
  expect(s.cutscene).toBeNull();
});

test('after seconds run while a cutscene plays', () => {
  const s = newScript(CUTSCENE_MISSION);
  stepScript(s, CUTSCENE_MISSION, 0);
  for (let i = 0; i < 120; i++) stepScript(s, CUTSCENE_MISSION, STEP);
  expect(s.fired.b).toBeTypeOf('number');
  expect(s.cutscene?.id).toBe('landing');
});

// A small script for the flag conditions: `a` raises `one` at the start and `b` raises `two` on the gate. `d`'s trigger
// stands from the first frame, so only its `when` holds it back; `g` can never fire because its two conditions clash.
const CONDITIONS_MISSION: MissionDef = {
  id: 'test-conditions',
  cues: [
    { id: 'a', trigger: { kind: 'start' }, actions: [{ kind: 'flag', name: 'one' }] },
    { id: 'b', trigger: { kind: 'enter', area: 'gate' }, actions: [{ kind: 'flag', name: 'two' }] },
    { id: 'c', trigger: { kind: 'after', cue: 'a', sec: 0 }, when: ['one'], actions: [{ kind: 'radio', line: 'c' }] },
    { id: 'd', trigger: { kind: 'flag', name: 'one' }, when: ['two'], actions: [{ kind: 'radio', line: 'd' }] },
    { id: 'e', trigger: { kind: 'after', cue: 'a', sec: 0 }, unless: ['two'], actions: [{ kind: 'radio', line: 'e' }] },
    {
      id: 'f',
      trigger: { kind: 'after', cue: 'a', sec: 1 },
      when: ['one'],
      unless: ['two'],
      actions: [{ kind: 'radio', line: 'f' }],
    },
    {
      id: 'g',
      trigger: { kind: 'after', cue: 'a', sec: 0 },
      when: ['one'],
      unless: ['one'],
      actions: [{ kind: 'radio', line: 'g' }],
    },
  ],
  areas: { gate: { x: 0, z: 0, w: 1, d: 1 } },
  targets: [],
  waves: [],
  objectives: [],
  marks: [],
  flags: ['one', 'two'],
  allies: [],
  paths: {},
  places: {},
};

test('a when cue waits for every flag and fires in the frame the last one stands', () => {
  const s = newScript(CONDITIONS_MISSION);
  stepScript(s, CONDITIONS_MISSION, 0);
  expect(s.fired.a).toBe(0);
  expect(s.fired.c).toBe(0); // `one` stood in the same frame as `a`
  expect(s.fired.d).toBeUndefined(); // its trigger stood, but `two` did not
  const at = s.time;
  const out = scriptInput(s, CONDITIONS_MISSION, { kind: 'enter', area: 'gate' });
  expect(s.fired.d).toBe(at); // the flag came and `d` fired in that same frame
  expect(out.filter(e => e.kind === 'radio' && e.line === 'd')).toHaveLength(1);
});

test('an unless cue does not fire once its flag stands, and another cue still fires', () => {
  // without the gate's flag, `f` (which needs `two` absent) fires a second in
  const s = newScript(CONDITIONS_MISSION);
  stepScript(s, CONDITIONS_MISSION, 0);
  expect(s.fired.e).toBe(0);
  expect(s.fired.f).toBeUndefined();
  for (let i = 0; i < 11; i++) stepScript(s, CONDITIONS_MISSION, 0.1);
  expect(s.fired.f).toBeTypeOf('number');

  // with `two` raised before `f` is due, `f` never fires; `e` fired at the start, before the flag stood
  const other = newScript(CONDITIONS_MISSION);
  stepScript(other, CONDITIONS_MISSION, 0);
  scriptInput(other, CONDITIONS_MISSION, { kind: 'enter', area: 'gate' });
  expect(other.fired.e).toBe(0);
  for (let i = 0; i < 30; i++) stepScript(other, CONDITIONS_MISSION, 0.1);
  expect(other.fired.f).toBeUndefined();
  expect(other.fired.e).toBe(0);
});

test('when and unless together need every when flag and no unless flag', () => {
  const s = newScript(CONDITIONS_MISSION);
  stepScript(s, CONDITIONS_MISSION, 0);
  for (let i = 0; i < 21; i++) stepScript(s, CONDITIONS_MISSION, 0.1);
  expect(s.fired.f).toBeTypeOf('number'); // `one` stands and `two` does not
  expect(s.fired.g).toBeUndefined(); // `one` stands and `one` stands: the two conditions clash
});

test('a flag stays up, so a later cue still sees it', () => {
  const s = newScript(CONDITIONS_MISSION);
  stepScript(s, CONDITIONS_MISSION, 0);
  expect(s.flags).toEqual(['one']);
  for (let i = 0; i < 65; i++) stepScript(s, CONDITIONS_MISSION, STEP);
  expect(s.flags).toEqual(['one']); // no frame takes a flag down
  expect(s.fired.f).toBeTypeOf('number'); // `when: ['one']` was still true a second later
});

test('an entered area stays in entered, so its cue stays fired as time goes on', () => {
  const s = newScript(M1);
  stepScript(s, M1, 0);
  scriptInput(s, M1, { kind: 'skip' });
  const out = scriptInput(s, M1, { kind: 'enter', area: 'b-line' });
  expect(out.filter(e => e.kind === 'spawn' && e.wave === 'b-squad')).toHaveLength(1);
  const at = s.fired.pillboxes;
  expect(at).toBeTypeOf('number');
  // the script has no input for leaving an area, so `entered` only grows; the test shows it is not cleared by time
  for (let i = 0; i < 60; i++) stepScript(s, M1, STEP);
  expect(s.entered).toContain('b-line');
  expect(s.fired.pillboxes).toBe(at);
});

test('a checkpoint keeps the flags, so a cue that branched on them branches the same after a restore', () => {
  const def = cloneM1();
  def.cues = [
    ...def.cues,
    {
      id: 'branch-on',
      trigger: { kind: 'after', cue: 'cp1', sec: 0 },
      when: [PILLBOXES_DOWN_FLAG],
      actions: [{ kind: 'radio', line: 'branch-on' }],
    },
    {
      id: 'branch-off',
      trigger: { kind: 'after', cue: 'cp1', sec: 0 },
      unless: [PILLBOXES_DOWN_FLAG],
      actions: [{ kind: 'radio', line: 'branch-off' }],
    },
  ];
  const s = newScript(def);
  stepScript(s, def, 0);
  scriptInput(s, def, { kind: 'skip' });
  scriptInput(s, def, { kind: 'enter', area: 'b-line' });
  scriptInput(s, def, { kind: 'destroyed', target: 'pillbox-1' });
  scriptInput(s, def, { kind: 'destroyed', target: 'pillbox-2' });
  const on = s.fired['branch-on'];
  expect(on).toBeTypeOf('number');
  expect(s.fired['branch-off']).toBeUndefined();

  // past cp1 the depot raises another flag; the copy must keep only the flags cp1 had
  scriptInput(s, def, { kind: 'destroyed', target: 'depot' });
  expect(s.flags).toContain('depot-down');
  const restored = restoreCheckpoint(s);
  expect(restored.flags).toContain(PILLBOXES_DOWN_FLAG);
  expect(restored.flags).not.toContain('depot-down');
  stepScript(restored, def, 0);
  expect(restored.fired['branch-on']).toBe(on);
  expect(restored.fired['branch-off']).toBeUndefined();
});

test('a restore keeps the times of the cues from before the checkpoint and forgets those after it', () => {
  const s = atPillboxesDown();
  const intro = s.fired.intro;
  const cp1 = s.fired.cp1;
  expect(cp1).toBeTypeOf('number');
  scriptInput(s, M1, { kind: 'destroyed', target: 'depot' });
  expect(s.fired.depot).toBeTypeOf('number');
  const restored = restoreCheckpoint(s);
  expect(restored.fired.intro).toBe(intro);
  expect(restored.fired.cp1).toBe(cp1);
  expect(restored.fired.depot).toBeUndefined();
});

test('the same inputs at the same times give the same flags and the same fired cues', () => {
  const run = (): ScriptState => {
    const s = newScript(CONDITIONS_MISSION);
    stepScript(s, CONDITIONS_MISSION, 0);
    scriptInput(s, CONDITIONS_MISSION, { kind: 'enter', area: 'gate' });
    for (let i = 0; i < 42; i++) stepScript(s, CONDITIONS_MISSION, STEP);
    return s;
  };
  expect(run()).toEqual(run());
});

test('an assist action checks its waves and goes out as one assist event', () => {
  const def = cloneM1();
  def.cues = [
    {
      id: 'a',
      trigger: { kind: 'start' },
      actions: [{ kind: 'assist', waves: ['yard-1', 'yard-2'] }],
    },
  ];
  const s = newScript(def);
  const out = stepScript(s, def, 0);
  expect(out).toEqual([{ kind: 'assist', waves: ['yard-1', 'yard-2'], time: 0 }]);
  // the script reports it only: its own state holds no assist, the game does
  expect(s.flags).toEqual([]);
});

test('an assist action naming a wave the mission does not have is refused', () => {
  const def = cloneM1();
  def.cues = [
    {
      id: 'a',
      trigger: { kind: 'start' },
      actions: [{ kind: 'assist', waves: ['yard-1', 'no-such-wave'] }],
    },
  ];
  expect(() => validateMission(def)).toThrow(/wave/);
});
