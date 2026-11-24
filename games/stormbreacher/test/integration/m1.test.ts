import { expect, test } from 'vitest';
import { YARD_TUNE } from '../../src/data/fortress.ts';
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

// The kinds and names M1 should give, in order, from the landing to cp1 and the leader's question. The skip of the
// landing is in the flow.
const COMMON: readonly string[] = [
  'cutscene:landing',
  'ally:buddy',
  'ally:cover-b1',
  'ally:cover-b2',
  'ally:cover-b3',
  'ally:gunner',
  'objective:reach-pillboxes',
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
  'payoff:bunker1',
  'radio:m1.pillboxes-down',
  'flag:pillboxes-down',
  'payoff:bunker',
  'checkpoint:cp1',
  'allyMove:cover-b1',
  'allyMove:cover-b2',
  'allyMove:cover-b3',
  'flag:depot-asked',
  'spawn:shelling',
  'radio:m1.depot-ask-1',
  'radio:m1.depot-ask-2',
];

// The two answers: down to the depot first, or straight on to the fortress.
const DEPOT_GO: readonly string[] = [
  'radio:m1.depot-go',
  'spawn:depot-guard',
  'map:depot:on',
  'flag:depot-taken',
  'flag:depot-down',
  'radio:m1.depot-down',
  'flag:fortress-gun-awake',
  'radio:m1.fortress-gun-wake',
];

const FORTRESS_GO: readonly string[] = [
  'radio:m1.depot-skip',
  'allyMove:cover-b3',
  'loss:1/1',
  'flag:fortress-skip',
  'flag:fortress-gun-awake',
  'radio:m1.fortress-gun-wake',
  'allyFall:cover-b3:shell',
  'radio:m1.ally-lost',
];

const TAIL: readonly string[] = [
  'checkpoint:cp2',
  'objective:stop-fortress-gun',
  'radio:m1.fortress-gate',
  'spawn:fortress-drop',
  'allyMove:cover-b1',
  'allyMove:cover-b2',
  'allyMove:cover-b3',
  'radio:m1.fortress-yard',
  'radio:m1.yard-trap',
  'spawn:yard-1',
  'assist:yard-1,yard-2,yard-3',
  'allyMove:cover-b1',
  'allyMove:cover-b2',
  'allyMove:cover-b3',
  'spawn:yard-2',
  'flag:yard-1-clear',
  'spawn:yard-3',
  'flag:yard-2-clear',
  'flag:yard-3-clear',
  'radio:m1.yard-clear',
  'radio:m1.warden',
  'spawn:warden',
  'objective:bomb-fortress',
  'radio:m1.bomb-armed',
  'flag:fortress-down',
  'cutscene:fortress-blast',
  'checkpoint:cp3',
  'objective:silence-battery',
  'spawn:battery',
  'radio:m1.get-out',
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
    case 'allyFall':
      return `allyFall:${event.id}:${event.by}`;
    case 'assist':
      return `assist:${event.waves.join(',')}`;
    case 'loss':
      return `loss:${event.allies}/${event.squads}`;
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

// Runs M1 up to cp1 and the leader's question (10 s after cp1). A depot run then walks into the hollow and breaks the
// depot; the other goes no further, so `fromCp1` can take the fortress's answer.
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
  outputs.push(...scriptInput(state, M1, { kind: 'destroyed', target: 'pillbox-1' }));
  outputs.push(...scriptInput(state, M1, { kind: 'destroyed', target: 'pillbox-2' }));
  // cp1's `after 10` question
  outputs.push(...stepScript(state, M1, 10));
  if (destroyDepot) {
    outputs.push(...scriptInput(state, M1, { kind: 'enter', area: 'depot-approach' }));
    outputs.push(...scriptInput(state, M1, { kind: 'destroyed', target: 'depot' }));
  }
  return { state, outputs };
}

// Plays the fortress's gate and yard, the field, the two guns, the magazine and the ending; the skipped depot's ally
// falls 1.5 s after the answer. The yard's waves are handed to the script with `cleared`, as the assist brings them down.
function fromCp1(state: ScriptState, destroyDepot: boolean): ScriptOut[] {
  const outputs: ScriptOut[] = [];
  outputs.push(...scriptInput(state, M1, { kind: 'enter', area: 'fortress-approach' }));
  if (!destroyDepot) outputs.push(...stepScript(state, M1, 2));
  outputs.push(...scriptInput(state, M1, { kind: 'enter', area: 'fortress-gate' }));
  outputs.push(...scriptInput(state, M1, { kind: 'enter', area: 'fortress-yard' }));
  // yard-2 comes YARD_TUNE.waveGapSec after the cue that sent yard-1
  outputs.push(...stepScript(state, M1, YARD_TUNE.waveGapSec));
  outputs.push(...scriptInput(state, M1, { kind: 'cleared', wave: 'yard-1' }));
  outputs.push(...scriptInput(state, M1, { kind: 'cleared', wave: 'yard-2' }));
  outputs.push(...scriptInput(state, M1, { kind: 'cleared', wave: 'yard-3' }));
  // the mid boss is down: the magazine may be charged, and the charge blows it (SB-1860)
  outputs.push(...scriptInput(state, M1, { kind: 'wardenDown' }));
  outputs.push(...scriptInput(state, M1, { kind: 'fortressDown' }));
  outputs.push(...scriptInput(state, M1, { kind: 'enter', area: 'fortress-out' }));
  outputs.push(...scriptInput(state, M1, { kind: 'destroyed', target: 'main-gun-2' }));
  outputs.push(...scriptInput(state, M1, { kind: 'destroyed', target: 'main-gun-1' }));
  outputs.push(...scriptInput(state, M1, { kind: 'destroyed', target: 'magazine' }));
  outputs.push(...scriptInput(state, M1, { kind: 'skip' }));
  return outputs;
}

function runM1(destroyDepot: boolean): { state: ScriptState; events: string[] } {
  const { state, outputs } = toCp1(destroyDepot);
  outputs.push(...fromCp1(state, destroyDepot));
  return { state, events: outputs.map(label) };
}

test('M1 runs to the cleared result by going for the depot', () => {
  const run = runM1(true);
  expect(run.events).toEqual([...COMMON, ...DEPOT_GO, ...TAIL]);
  expect(run.state.ended).toBe('cleared');
});

test('M1 runs to the cleared result by going straight on, and the skipped depot costs an ally and a squad', () => {
  const run = runM1(false);
  expect(run.events).toEqual([...COMMON, ...FORTRESS_GO, ...TAIL]);
  expect(run.state.ended).toBe('cleared');
  expect(run.state.flags).toContain('fortress-skip');
  expect(run.state.flags).not.toContain('depot-down');
});

test('restoring cp1 drops the cues after it and replays the same column', () => {
  const { state } = toCp1(false);
  scriptInput(state, M1, { kind: 'enter', area: 'fortress-approach' }); // the choice has fired

  const restored = restoreCheckpoint(state);
  expect(restored.fired.cp1).toBeTypeOf('number');
  expect(restored.fired['fortress-go']).toBeUndefined();
  expect(restored.ended).toBeNull();
  // the flag is one of cp1's actions before the checkpoint, so the copy holds it
  expect(restored.flags).toContain('pillboxes-down');

  // the question is after the checkpoint, so the restored game gets it again
  const replayed = stepScript(restored, M1, 10);
  expect(replayed.map(label)).toEqual(COMMON.slice(COMMON.indexOf('flag:depot-asked')));
  expect(fromCp1(restored, false).map(label)).toEqual([...FORTRESS_GO, ...TAIL]);
  expect(restored.ended).toBe('cleared');
});

// cp3 is taken by the fortress-down cue after its cutscene: the copy must hold the flag, the objective and the battery's
// wave, and must not play the cutscene again when it is restored (SB-1860).
test('restoring cp3 comes back with the battery objective and sends the battery again', () => {
  const { state } = toCp1(true);
  scriptInput(state, M1, { kind: 'enter', area: 'fortress-approach' });
  scriptInput(state, M1, { kind: 'enter', area: 'fortress-gate' });
  scriptInput(state, M1, { kind: 'enter', area: 'fortress-yard' });
  scriptInput(state, M1, { kind: 'wardenDown' });
  scriptInput(state, M1, { kind: 'fortressDown' });
  scriptInput(state, M1, { kind: 'destroyed', target: 'main-gun-1' });

  const restored = restoreCheckpoint(state);
  expect(restored.objective).toBe('silence-battery');
  expect(restored.flags).toContain('fortress-down');
  expect(restored.fortressDown).toBe(true);
  expect(restored.cutscene).toBeNull();
  expect(restored.destroyed).not.toContain('main-gun-1');
  const replay = checkpointReplay(restored).map(label);
  expect(replay).toContain('objective:silence-battery');
  expect(replay).toContain('spawn:battery');
  expect(replay).not.toContain('cutscene:fortress-blast');

  // going down again after the restore goes back to cp3 again
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

test('the same inputs give the same events twice', () => {
  expect(runM1(false).events).toEqual(runM1(false).events);
  expect(runM1(true).events).toEqual(runM1(true).events);
});
