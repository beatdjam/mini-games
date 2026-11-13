import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { TARGET_HP } from '../../src/data/props.ts';
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

// The script's events with the names m1.test.ts reads them by; this file keeps its own copy.
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

// The script events of the frame just stepped, as labels.
function scriptLabels(game: GameModel): string[] {
  const labels: string[] = [];
  for (const event of game.events) if (event.kind === 'script') labels.push(label(event.event));
  return labels;
}

// Runs M1 from the landing to the cleared result. The depot and the two pillboxes are shot down from spots that see
// them; the pillboxes are shot from their sides, where their front does not turn the shots away. The rest of the targets
// (main-gun-1, main-gun-2, magazine) are not on M1B_HAND and the mech does not climb the seawall here, so the test hands
// those and seawall-top to the script with sendToScript (seawall.test.ts walks up to seawall-top).
function runM1(game: GameModel): { outs: ScriptOut[]; cleared: number; clearedAfterTargets: boolean } {
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
  const shootDown = (x: number, z: number, id: string): void => {
    const place = M1B_HAND.targets.find(item => item.id === id);
    if (!place) throw new Error(`the hand map has ${id}`);
    game.mech.x = x;
    game.mech.z = z;
    // face the target, so the shots fly at it rather than wherever yaw 0 points
    game.mech.yaw = Math.atan2(-(place.x - x), -(place.z - z));
    for (let i = 0; i < 600; i++) {
      step(game, { ...idle, fire: true }, 1 / 60);
      take();
      const target = game.targets.find(item => item.id === id);
      if (!target || target.hp <= 0) return;
    }
  };

  run(idle, 600); // the landing ends after 10 s
  game.mech.x = 0;
  game.mech.z = 140;
  run(idle, 1); // the b-line fires the pillboxes cue
  // the nests would shoot the mech on the way to the depot and the pillboxes; this test reads the script's line alone
  game.enemies = game.enemies.filter(enemy => enemy.wave !== 'b-emplacements');
  shootDown(53, 51, 'depot');
  shootDown(-13, -15, 'pillbox-1');
  shootDown(42, -15, 'pillbox-2'); // cp1 fires once both pillboxes are down
  const clearedAfterTargets = game.cleared;
  run(idle, 240); // wave2-lost fires 4 s after cp1
  send({ kind: 'enter', area: 'c-line' });
  send({ kind: 'enter', area: 'seawall-top' });
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
    'objective:reach-pillboxes',
    'map:wave2:on',
    'spawn:beach-mortar',
    'ally:buddy',
    'ally:cover-b1',
    'ally:cover-b2',
    'ally:cover-b3',
  ]);
  expect(game.script.objective).toBe('reach-pillboxes');
  expect(game.script.marks).toEqual(['wave2']);
});

test('entering the b-line changes the objective and brings a radio line', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, 1 / 60);
  game.mech.x = 0;
  game.mech.z = 140;
  step(game, idle, 1 / 60);
  expect(scriptLabels(game)).toEqual([
    'objective:break-pillboxes',
    'spawn:b-squad',
    'spawn:b-emplacements',
    'radio:m1.depot-hint',
    'ally:gunner',
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
  game.mech.x = 53;
  game.mech.z = 51;
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

test('the whole of M1 runs from the landing to the cleared result', () => {
  const game = newGame(M1B_HAND);
  const { outs, cleared, clearedAfterTargets } = runM1(game);
  expect(clearedAfterTargets).toBe(false);
  expect(Object.keys(game.script.fired).sort()).toEqual(M1.cues.map(cue => cue.id).sort());
  const objectives: string[] = [];
  for (const event of outs) if (event.kind === 'objective') objectives.push(event.id);
  expect(objectives).toEqual(['reach-pillboxes', 'break-pillboxes', 'take-seawall', 'silence-battery', 'hit-magazine']);
  expect(game.script.ended).toBe('cleared');
  expect(game.cleared).toBe(true);
  expect(cleared).toBe(1);
});

test('the game stops once the script has ended', () => {
  const game = newGame(M1B_HAND);
  runM1(game);
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
  const map: MapDef = { ...M1B_HAND, targets: [{ id: 'extra', kind: 'pillbox', x: -33, z: -15, yaw: 0 }] };
  const game = newPlayGame(map);
  game.mech.x = -33;
  game.mech.z = 5;
  game.mech.yaw = 0;
  for (let i = 0; i < 600 && game.targets[0].hp > 0; i++) step(game, { ...idle, fire: true }, 1 / 60);
  expect(game.targets[0].hp).toBe(0);
  expect(game.script.destroyed).toEqual([]);
});
