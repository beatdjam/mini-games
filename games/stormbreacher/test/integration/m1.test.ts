import { expect, test } from 'vitest';
import { M1 } from '../../src/data/missions/m1.ts';
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
  'objective:reach-pillboxes',
  'map:wave2:on',
  'spawn:beach-mortar',
  'cutsceneEnd:landing',
  'ally:buddy',
  'ally:cover-b1',
  'ally:cover-b2',
  'ally:cover-b3',
  'objective:break-pillboxes',
  'spawn:b-squad',
  'spawn:b-emplacements',
  'radio:m1.depot-hint',
  'ally:gunner',
  'allyMove:cover-b1',
  'allyMove:cover-b2',
  'allyMove:cover-b3',
  'flag:depot-down',
  'radio:m1.depot-down',
  'radio:m1.pillboxes-down',
  'flag:pillboxes-down',
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
    case 'ally':
      return `ally:${event.id}`;
    case 'allyMove':
      return `allyMove:${event.id}`;
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
