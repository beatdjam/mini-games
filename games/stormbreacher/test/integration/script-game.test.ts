import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { TARGET_HP } from '../../src/data/props.ts';
import { CUTSCENE_SEC } from '../../src/data/script.ts';
import type { MapDef } from '../../src/data/types.ts';
import { newPlayGame } from './playGame.ts';
import { newGame, sendToScript, step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import type { ScriptInput, ScriptOut } from '../../src/logic/script.ts';

const idle: GameInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
  sub: false,
};
const LONG = 15000; // these tests run many hundreds of frames; the default 5 s is short on a busy CI machine

// The script's events with the names m1.test.ts reads them by; this file keeps its own copy.
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

// The script events of the frame just stepped, as labels.
function scriptLabels(game: GameModel): string[] {
  const labels: string[] = [];
  for (const event of game.events) if (event.kind === 'script') labels.push(label(event.event));
  return labels;
}

// Runs M1 from the landing to the cleared result. The pillboxes and, when the run goes for it, the depot are handed to
// the script as down (the charges and the shots are other tests' work). The rest of the targets (main-gun-1,
// main-gun-2, magazine) and the fortress's gates are handed to the script with sendToScript, so the test reads the
// cue's order alone (fortress.test.ts walks through the gates). The leader asks 10 s after cp1, and the two paths
// answer by walking into the hollow or on to the fortress.
function runM1(
  game: GameModel,
  goForDepot: boolean,
): { outs: ScriptOut[]; cleared: number; clearedAfterTargets: boolean } {
  const outs: ScriptOut[] = [];
  let cleared = 0;
  const take = (from = 0): void => {
    for (let i = from; i < game.events.length; i++) {
      const event = game.events[i];
      if (event.kind === 'script') outs.push(event.event);
      if (event.kind === 'cleared') cleared++;
    }
  };
  const run = (input: GameInput, frames: number): void => {
    for (let i = 0; i < frames; i++) {
      step(game, input, 1 / 60);
      take();
    }
  };
  const send = (input: ScriptInput): void => {
    const from = game.events.length;
    sendToScript(game, input);
    take(from);
  };
  const breakTarget = (id: string): void => {
    const target = game.targets.find(item => item.id === id);
    if (!target) throw new Error(`the hand map has ${id}`);
    target.hp = 0;
    send({ kind: 'destroyed', target: id });
  };

  run(idle, 60 * (CUTSCENE_SEC.landing + 1)); // the landing ends after its 12 s
  game.mech.x = 0;
  game.mech.z = 140;
  run(idle, 1); // the b-line fires the pillboxes cue
  // the script hears line 1 open, as the bot's charge does in the real sortie, so its cue enters `fired`
  send({ kind: 'blast', id: 'l1-b' });
  // line 2's approach (the ally's support fire) and its breach, as the bot does in the real sortie (SB-2020)
  send({ kind: 'enter', area: 'line2-approach' });
  send({ kind: 'blast', id: 'l2-a' });
  // the nests and the defenders would shoot the mech on the way; this test reads the script's line alone
  game.enemies = game.enemies.filter(enemy => !['b-emplacements', 'line1-hold', 'pillbox-hold'].includes(enemy.wave));
  // the pillboxes are broken by their charges in the sortie (SB-2015); this test tells the script directly
  breakTarget('pillbox-1');
  breakTarget('pillbox-2'); // cp1 fires once both pillboxes are down
  const clearedAfterTargets = game.cleared;
  // the shelling starts 10 s after cp1; the enemies and the shells would shoot the mech down while it waits, and this
  // test reads the script's line alone
  game.enemies = [];
  game.armor = 10000;
  game.downed = false;
  run(idle, 60 * 11);
  if (goForDepot) {
    send({ kind: 'enter', area: 'depot-approach' });
    breakTarget('depot');
    game.enemies = [];
  }
  send({ kind: 'enter', area: 'fortress-approach' });
  run(idle, 60 * 2);
  send({ kind: 'enter', area: 'fortress-gate' });
  // the wall's nest falls: the sea gate opens and the cover mechs go in (SB-2300)
  send({ kind: 'destroyed', target: 'fortress-gun' });
  send({ kind: 'enter', area: 'fortress-yard' });
  // the yard's second wave comes 6 s after the first; the waves are then handed to the script as the assist brings them
  // down (this test reads the script's line, not the fight)
  run(idle, 60 * 7);
  send({ kind: 'cleared', wave: 'yard-1' });
  send({ kind: 'cleared', wave: 'yard-2' });
  send({ kind: 'cleared', wave: 'yard-3' });
  // the mid boss is down and the magazine's charge blows (SB-1860)
  send({ kind: 'wardenDown' });
  send({ kind: 'fortressDown' });
  send({ kind: 'enter', area: 'fortress-out' });
  send({ kind: 'destroyed', target: 'main-gun-2' });
  send({ kind: 'destroyed', target: 'main-gun-1' });
  send({ kind: 'destroyed', target: 'magazine' });
  return { outs, cleared, clearedAfterTargets };
}

test('the first step starts the landing and the beach', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, 1 / 60);
  expect(scriptLabels(game)).toEqual([
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
  ]);
  expect(game.script.objective).toBe('reach-pillboxes');
  expect(game.script.marks).toEqual([]);
  // the five are aboard the crafts beside the player's, waiting for the mech to step off
  expect(game.allies.map(ally => ally.id).sort()).toEqual(['buddy', 'cover-b1', 'cover-b2', 'cover-b3', 'gunner']);
});

test('the landing hands the allies down their ramps before the mech steps off, and stepping off wakes the front nest', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, 1 / 60);
  sendToScript(game, { kind: 'skip' });
  const buddy = game.allies.find(ally => ally.id === 'buddy');
  if (!buddy) throw new Error('the sortie has no buddy');
  const start = { x: buddy.x, z: buddy.z };
  // the handover alone sends them down their ramps, with the mech still on the deck
  step(game, idle, 1 / 60);
  expect(scriptLabels(game)).toEqual([]);
  expect({ x: buddy.x, z: buddy.z }).not.toEqual(start);
  // the mech's own step off the craft wakes the front nest
  game.mech.x = 0;
  game.mech.z = 166;
  step(game, idle, 1 / 60);
  expect(scriptLabels(game)).toEqual(['wake:b-emplacements-1']); // the other five wait for B
});

test('entering the b-line changes the objective and brings a radio line', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, 1 / 60);
  sendToScript(game, { kind: 'skip' });
  game.mech.x = 0;
  game.mech.z = 166;
  step(game, idle, 1 / 60); // the ashore cue
  game.mech.z = 140;
  step(game, idle, 1 / 60);
  expect(scriptLabels(game)).toEqual([
    'objective:break-pillboxes',
    'spawn:b-squad',
    'wake:b-emplacements',
    'radio:m1.depot-hint',
  ]);
  expect(game.radio).toEqual({ line: 'm1.depot-hint', time: game.time });
  step(game, idle, 1 / 60);
  expect(scriptLabels(game)).toEqual([]);
  expect(game.script.entered).toEqual(['b-line']);
});

test('spawn and ally change nothing else in the game', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, 1 / 60);
  expect(game.targets).toHaveLength(M1B_HAND.targets.length);
  for (const target of game.targets) expect(target.hp).toBe(TARGET_HP[target.kind]);
});

test('breaking the depot reaches the script', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, 1 / 60);
  sendToScript(game, { kind: 'skip' }); // the mech takes no input during the landing
  game.mech.x = 75;
  game.mech.z = -25;
  game.mech.yaw = 0;
  let labels: string[] = [];
  for (let i = 0; i < 600 && !game.script.destroyed.includes('depot'); i++) {
    step(game, { ...idle, fire: true }, 1 / 60);
    labels = scriptLabels(game);
  }
  expect(game.script.destroyed).toContain('depot');
  expect(labels).toContain('flag:depot-down');
  expect(labels).toContain('radio:m1.depot-down');
});

test(
  'the whole of M1 runs from the landing to the cleared result by going for the depot',
  () => {
    const game = newGame(M1B_HAND);
    const { outs, cleared, clearedAfterTargets } = runM1(game, true);
    expect(clearedAfterTargets).toBe(false);
    // every cue fires on the way through the depot
    expect(Object.keys(game.script.fired).sort()).toEqual(M1.cues.map(cue => cue.id).sort());
    const objectives: string[] = [];
    for (const event of outs) if (event.kind === 'objective') objectives.push(event.id);
    expect(objectives).toEqual([
      'reach-pillboxes',
      'break-pillboxes',
      'stop-fortress-gun',
      'bomb-fortress',
      'silence-battery',
      'hit-magazine',
    ]);
    expect(game.script.ended).toBe('cleared');
    expect(game.cleared).toBe(true);
    expect(cleared).toBe(1);
  },
  LONG,
);

test(
  'the whole of M1 runs from the landing to the cleared result by going straight on',
  () => {
    const game = newGame(M1B_HAND);
    const { cleared } = runM1(game, false);
    // the depot's own cues do not fire: the mech never walks into the hollow and never breaks it
    const depots = new Set(['depot-guard', 'depot']);
    expect(Object.keys(game.script.fired).sort()).toEqual(
      M1.cues
        .map(cue => cue.id)
        .filter(id => !depots.has(id))
        .sort(),
    );
    expect(game.script.ended).toBe('cleared');
    expect(game.cleared).toBe(true);
    expect(cleared).toBe(1);
  },
  LONG,
);

test('the game stops once the script has ended', () => {
  const game = newGame(M1B_HAND);
  runM1(game, false);
  // the closing cutscene still runs the game; once it is over the game stops
  sendToScript(game, { kind: 'skip' });
  const time = game.time;
  const z = game.mech.z;
  step(game, { ...idle, moveZ: 1 }, 1 / 60);
  expect(game.time).toBe(time);
  expect(game.mech.z).toBe(z);
});

test('the game can hand a cleared wave to the script', () => {
  const game = newGame(M1B_HAND);
  sendToScript(game, { kind: 'cleared', wave: 'b-squad' });
  expect(game.script.cleared).toEqual(['b-squad']);
  sendToScript(game, { kind: 'cleared', wave: 'b-squad' });
  expect(game.script.cleared).toEqual(['b-squad']);
  expect(() => {
    sendToScript(game, { kind: 'cleared', wave: 'nope' });
    sendToScript(game, { kind: 'destroyed', target: 'nope' });
    sendToScript(game, { kind: 'enter', area: 'nope' });
  }).not.toThrow();
  expect(game.script.destroyed).toEqual([]);
  expect(game.script.entered).toEqual([]);
});

test('a target the mission does not know does not break the game', () => {
  // a depot, because a shot no longer breaks a pillbox (SB-2015)
  const map: MapDef = { ...M1B_HAND, targets: [{ id: 'extra', kind: 'depot', x: -33, z: -15, yaw: 0 }] };
  const game = newPlayGame(map);
  game.mech.x = -33;
  game.mech.z = -5;
  game.mech.yaw = 0;
  for (let i = 0; i < 600 && game.targets[0].hp > 0; i++) step(game, { ...idle, fire: true }, 1 / 60);
  expect(game.targets[0].hp).toBe(0);
  expect(game.script.destroyed).toEqual([]);
});
