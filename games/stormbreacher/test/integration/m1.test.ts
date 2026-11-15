import { expect, test } from 'vitest';
import { M1 } from '../../src/data/missions/m1.ts';
import { PAYOFF_TUNE } from '../../src/data/payoff.ts';
import {
  checkpointReplay,
  newScript,
  restoreCheckpoint,
  scriptInput,
  stepScript,
  type ScriptOut,
  type ScriptState,
} from '../../src/logic/script.ts';

const STEP = 1 / 60;

// The kinds and names M1 should give, in order, from the landing to the cleared result. Skips of the landing and the
// wave2-sinks cutscene are in the flow; the last skip closes beach-held.
const EXPECTED: readonly string[] = [
  'cutscene:landing',
  'ally:buddy',
  'ally:cover-b1',
  'ally:cover-b2',
  'ally:cover-b3',
  'ally:gunner',
  'objective:reach-pillboxes',
  'map:wave2:on',
  'spawn:beach-mortar',
  'spawn:b-emplacements',
  'spawn:line1-hold',
  'spawn:pillbox-hold',
  'cutsceneEnd:landing',
  'wake:b-emplacements-1',
  'objective:break-pillboxes',
  'spawn:b-squad',
  'wake:b-emplacements',
  'radio:m1.depot-hint',
  'payoff:breach',
  'flag:line1-open',
  'allyMove:cover-b1',
  'allyMove:cover-b2',
  'allyMove:cover-b3',
  'allyMove:gunner',
  'radio:m1.line1-cheer',
  'suppress:cover-b2:b-emplacements',
  'radio:m1.line2-support',
  'payoff:breach2',
  'flag:line2-open',
  'radio:m1.line2-cheer',
  'radio:m1.line2-hold',
  'flag:depot-down',
  'radio:m1.depot-down',
  'payoff:bunker1',
  'radio:m1.pillboxes-down',
  'flag:pillboxes-down',
  'payoff:bunker',
  'checkpoint:cp1',
  'allyMove:cover-b1',
  'allyMove:cover-b2',
  'allyMove:cover-b3',
  'cutscene:wave2-sinks',
  'radio:m1.wave2-lost',
  'map:wave2:off',
  'objective:take-seawall',
  'spawn:seawall-drop',
  'cutsceneEnd:wave2-sinks',
  'checkpoint:cp2',
  'objective:silence-battery',
  'spawn:battery',
  'allyMove:cover-b1',
  'allyMove:cover-b2',
  'allyMove:cover-b3',
  'radio:m1.gun1-down',
  'flag:shutter-open',
  'objective:hit-magazine',
  'cutscene:beach-held',
  'end:cleared',
  'cutsceneEnd:beach-held',
];

function label(event: ScriptOut): string {
  switch (event.kind) {
    case 'objective':
      return `objective:${event.id}`;
    case 'radio':
      return `radio:${event.line}`;
    case 'spawn':
      return `spawn:${event.wave}`;
    case 'wake':
      return `wake:${'wave' in event ? event.wave : event.enemy}`;
    case 'ally':
      return `ally:${event.id}`;
    case 'allyMove':
      return `allyMove:${event.id}`;
    case 'suppress':
      return `suppress:${event.id}:${event.wave}`;
    case 'cutscene':
      return `cutscene:${event.id}`;
    case 'cutsceneEnd':
      return `cutsceneEnd:${event.id}`;
    case 'checkpoint':
      return `checkpoint:${event.id}`;
    case 'flag':
      return `flag:${event.name}`;
    case 'map':
      return `map:${event.mark}:${event.on ? 'on' : 'off'}`;
    case 'payoff':
      return `payoff:${event.id}`;
    case 'end':
      return `end:${event.result}`;
  }
}

// Runs M1 up to cp1 (both pillboxes down). The landing is passed at once; `destroyDepot` is the detour.
function toCp1(destroyDepot: boolean): { state: ScriptState; outputs: ScriptOut[] } {
  const state = newScript(M1);
  const outputs: ScriptOut[] = [];
  outputs.push(...stepScript(state, M1, 0));
  outputs.push(...scriptInput(state, M1, { kind: 'skip' }));
  outputs.push(...scriptInput(state, M1, { kind: 'ashore' }));
  outputs.push(...scriptInput(state, M1, { kind: 'enter', area: 'b-line' }));
  outputs.push(...scriptInput(state, M1, { kind: 'blast', id: 'l1-b' }));
  outputs.push(...scriptInput(state, M1, { kind: 'enter', area: 'line2-approach' }));
  outputs.push(...scriptInput(state, M1, { kind: 'blast', id: 'l2-a' }));
  if (destroyDepot) outputs.push(...scriptInput(state, M1, { kind: 'destroyed', target: 'depot' }));
  outputs.push(...scriptInput(state, M1, { kind: 'destroyed', target: 'pillbox-1' }));
  outputs.push(...scriptInput(state, M1, { kind: 'destroyed', target: 'pillbox-2' }));
  return { state, outputs };
}

// Waits 4 s for wave2-lost, then plays the seawall, the two guns, the magazine and the ending.
function fromCp1(state: ScriptState): ScriptOut[] {
  const outputs: ScriptOut[] = [];
  for (let i = 0; i < 240; i++) outputs.push(...stepScript(state, M1, STEP));
  outputs.push(...scriptInput(state, M1, { kind: 'skip' }));
  outputs.push(...scriptInput(state, M1, { kind: 'enter', area: 'seawall-top' }));
  outputs.push(...scriptInput(state, M1, { kind: 'destroyed', target: 'main-gun-2' }));
  outputs.push(...scriptInput(state, M1, { kind: 'destroyed', target: 'main-gun-1' }));
  outputs.push(...scriptInput(state, M1, { kind: 'destroyed', target: 'magazine' }));
  outputs.push(...scriptInput(state, M1, { kind: 'skip' }));
  return outputs;
}

function runM1(destroyDepot: boolean): { state: ScriptState; events: string[] } {
  const { state, outputs } = toCp1(destroyDepot);
  outputs.push(...fromCp1(state));
  return { state, events: outputs.map(label) };
}

test('M1 runs from the landing to the cleared result', () => {
  const run = runM1(true);
  expect(run.events).toEqual(EXPECTED);
  expect(run.state.ended).toBe('cleared');
});

test('restoring cp1 drops wave2-lost and replays the same column', () => {
  const { state } = toCp1(true);
  for (let i = 0; i < 240; i++) stepScript(state, M1, STEP); // 4 s: wave2-lost has fired
  expect(state.fired['wave2-lost']).toBeTypeOf('number');

  const restored = restoreCheckpoint(state);
  expect(restored.fired.cp1).toBeTypeOf('number');
  expect(restored.fired['wave2-lost']).toBeUndefined();
  expect(restored.ended).toBeNull();
  // the flag is one of cp1's actions before the checkpoint, so the copy holds it
  expect(restored.flags).toContain('pillboxes-down');

  expect(fromCp1(restored).map(label)).toEqual(EXPECTED.slice(EXPECTED.indexOf('cutscene:wave2-sinks')));
  expect(restored.ended).toBe('cleared');
});

// cp2 is taken by the seawall cue before its objective and the boss: the copy must hold both (it came back without
// them when the copy was taken in the middle of the cue)
test('restoring cp2 comes back with the battery objective and sends the battery again', () => {
  const { state } = toCp1(true);
  for (let i = 0; i < 240; i++) stepScript(state, M1, STEP);
  scriptInput(state, M1, { kind: 'skip' });
  scriptInput(state, M1, { kind: 'enter', area: 'seawall-top' });
  scriptInput(state, M1, { kind: 'destroyed', target: 'main-gun-1' });

  const restored = restoreCheckpoint(state);
  expect(restored.objective).toBe('silence-battery');
  expect(restored.destroyed).not.toContain('main-gun-1');
  const replay = checkpointReplay(restored).map(label);
  expect(replay).toContain('objective:silence-battery');
  expect(replay).toContain('spawn:battery');

  // going down again after the restore goes back to cp2 again
  scriptInput(restored, M1, { kind: 'destroyed', target: 'main-gun-2' });
  const again = restoreCheckpoint(restored);
  expect(again.destroyed).not.toContain('main-gun-2');
  expect(again.objective).toBe('silence-battery');

  // and from there the mission still ends
  scriptInput(again, M1, { kind: 'destroyed', target: 'main-gun-2' });
  scriptInput(again, M1, { kind: 'destroyed', target: 'main-gun-1' });
  scriptInput(again, M1, { kind: 'destroyed', target: 'magazine' });
  expect(again.ended).toBe('cleared');
});

test('the run without the depot still ends, and the depot flag stays down', () => {
  const run = runM1(false);
  expect(run.events).not.toContain('flag:depot-down');
  expect(run.events).not.toContain('radio:m1.depot-down');
  expect(run.events.slice(-2)).toEqual(['end:cleared', 'cutsceneEnd:beach-held']);
  expect(run.state.flags).not.toContain('depot-down');
  expect(run.state.ended).toBe('cleared');
});

test('the same inputs give the same events twice', () => {
  expect(runM1(true).events).toEqual(runM1(true).events);
});

// SB-2027: the sinking cutscene follows the bunker's slow and heading closely, not 4 s later
test('wave2-sinks starts right after the bunker payoff is over', () => {
  const wait = PAYOFF_TUNE.slowSec + PAYOFF_TUNE.headlineSec + PAYOFF_TUNE.wave2Pad;
  expect(wait).toBeLessThan(2.5);
  const { state } = toCp1(true);
  const early: ScriptOut[] = [];
  for (let i = 0; i < Math.floor((wait - 0.1) / STEP); i++) early.push(...stepScript(state, M1, STEP));
  expect(early.map(label)).not.toContain('cutscene:wave2-sinks');
  const late: ScriptOut[] = [];
  for (let i = 0; i < Math.ceil(0.2 / STEP) + 1; i++) late.push(...stepScript(state, M1, STEP));
  expect(late.map(label)).toContain('cutscene:wave2-sinks');
  expect(state.objective).toBe('take-seawall');
});

// the mech already up on the seawall when the cutscene comes: the cutscene plays but the goal stays the next one
test('wave2-lost does not pull the objective back when the seawall cue has fired', () => {
  const { state } = toCp1(true);
  const out = scriptInput(state, M1, { kind: 'enter', area: 'seawall-top' });
  expect(out.map(label)).toContain('objective:silence-battery');
  const after: ScriptOut[] = [];
  for (let i = 0; i < 240; i++) after.push(...stepScript(state, M1, STEP));
  const labels = after.map(label);
  expect(labels).toContain('cutscene:wave2-sinks');
  expect(labels).toContain('spawn:seawall-drop');
  expect(labels).not.toContain('objective:take-seawall');
  expect(state.objective).toBe('silence-battery');
});
