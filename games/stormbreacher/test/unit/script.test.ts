import { expect, test } from 'vitest';
import { M1 } from '../../src/data/missions/m1.ts';
import { CUTSCENE_SEC } from '../../src/data/script.ts';
import type { Cue, MissionDef } from '../../src/data/types.ts';
import {
  newScript,
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
  const s = atPillboxesDown();
  for (let i = 0; i < 39; i++) stepScript(s, M1, 0.1);
  expect(s.fired['wave2-lost']).toBeUndefined();
  stepScript(s, M1, 0.1);
  expect(s.fired['wave2-lost']).toBeTypeOf('number');
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
    cueOf(def, 'wave2-lost').trigger = { kind: 'after', cue: 'no-such-cue', sec: 1 };
    expect(() => validateMission(def)).toThrow(/cue/);
  }
  {
    const def = cloneM1();
    def.cues = [...def.cues, structuredClone(def.cues[0])];
    expect(() => validateMission(def)).toThrow(/twice/);
  }
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
