// The fortress's charge (SB-1860): the mid boss's blast opens the magazine, a 20 s fuse runs on the HUD, the blast brings
// the walls and the land door down, wrecks the nest on the sea wall and changes the objective to the battery. A mech out
// of the sea gate is spared; one still inside takes FORT_BLAST_TUNE.damage. cp3 is taken by the blast and does not play the
// cutscene again when it is restored.
import { expect, test } from 'vitest';
import { CHARGE_TUNE } from '../../src/data/charge.ts';
import { FORT_BLAST_TUNE } from '../../src/data/fortress.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import type { GameEvent, GameInput, GameModel } from '../../src/logic/game.ts';
import { retryFromCheckpoint, sendToScript, step } from '../../src/logic/game.ts';
import { hudModel } from '../../src/logic/hud.ts';
import { restoreCheckpoint } from '../../src/logic/script.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;
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
// the same input with the use key held
const use: GameInput = { ...idle, use: true };

// A game at the land wall with the yard and the approach already entered, so their cues do not put out enemies while the
// charge's fuse burns; the fortress gun is held off so only the blast can take armour.
function atTheMagazine(): GameModel {
  const game = newPlayGame(M1B_HAND);
  game.mech.x = 0;
  game.mech.z = -120;
  game.mech.y = 0;
  game.mech.grounded = true;
  game.mech.yaw = 0;
  game.barrages = [];
  game.aimed = null;
  game.shells = [];
  game.enemies = [];
  game.fortressGun.wait = 1e9;
  game.armor = MECH_TUNE.armor;
  // the yard's cue fires on the first frame here; its waves are cleared so only the blast can take armour
  step(game, idle, DT);
  game.enemies = [];
  game.assist = null;
  return game;
}

// Holds use at the land wall until the charge is on the fort-bomb and returns the game at that frame.
function plant(game: GameModel): GameModel {
  for (let i = 0; i < Math.ceil(CHARGE_TUNE.holdSec / DT) + 2 && !game.charges.length; i++) step(game, use, DT);
  expect(game.charges).toHaveLength(1);
  expect(game.charges[0].blast).toBe('fort-bomb');
  return game;
}

interface Run {
  game: GameModel;
  events: GameEvent[];
}

// Runs the fuse out with the mech left where it is; the game stops on the frame the script hears `fortressDown`.
function toTheBlast(game: GameModel): Run {
  const events: GameEvent[] = [];
  const limit = Math.ceil((FORT_BLAST_TUNE.countdownSec + 2) / DT);
  for (let i = 0; i < limit && !game.script.fortressDown; i++) {
    step(game, idle, DT);
    events.push(...game.events);
    // the yard's waves and their assist are not what this test reads; keep their shots off the mech
    if (!game.script.fortressDown) {
      game.enemies = [];
      game.assist = null;
    }
  }
  return { game, events };
}

const blastEvents = (events: readonly GameEvent[]): number =>
  events.filter(event => event.kind === 'blast' && event.id === 'fort-bomb').length;

// The place in map.props of the land gate's door.
const doorIndex = (): number => {
  const index = M1B_HAND.props.findIndex(prop => prop.kind === 'fortWall' && prop.x === 0 && prop.collapse === true);
  if (index < 0) throw new Error('the hand map has no land door');
  return index;
};

test('the charge on the fort-bomb shows the 20 s countdown on the HUD and blows once', () => {
  const game = plant(atTheMagazine());
  const planted = hudModel(game).charge;
  expect(planted?.total).toBe(FORT_BLAST_TUNE.countdownSec);
  expect(planted?.left).toBeLessThanOrEqual(FORT_BLAST_TUNE.countdownSec);
  expect(planted?.left).toBeGreaterThan(FORT_BLAST_TUNE.countdownSec - 0.1);

  // a second of the fuse is one second off the HUD's bar
  for (let i = 0; i < 60; i++) step(game, idle, DT);
  const later = hudModel(game).charge;
  expect(later?.left).toBeLessThan((planted?.left ?? 0) - 0.8);

  // outside the gate the mech is spared; the blast is reported once and the walls come down
  game.mech.x = 0;
  game.mech.z = -58;
  const run = toTheBlast(game);
  expect(blastEvents(run.events)).toBe(1);
  expect(run.game.armor).toBe(MECH_TUNE.armor);
  expect(run.game.brokenProps.length).toBeGreaterThan(0);
  expect(run.game.brokenProps).toContain(doorIndex());
  expect(run.game.propRefs).not.toContain(doorIndex());
  expect(run.game.targets.find(target => target.id === 'fortress-gun')?.hp).toBe(0);
  expect(run.game.script.fortressDown).toBe(true);
  // the walls in the box are down; the sea wall (the gun's) is left standing
  const seaWalls = M1B_HAND.props.flatMap((prop, index) => (prop.kind === 'fortWall' && prop.z === -71 ? [index] : []));
  for (const index of seaWalls) expect(run.game.brokenProps).not.toContain(index);
});

test('the blast changes the objective, takes cp3 and sends the battery, and a retry does not play the cutscene again', () => {
  const game = plant(atTheMagazine());
  game.mech.x = 0;
  game.mech.z = -58;
  const { game: blown } = toTheBlast(game);
  expect(blown.script.cutscene?.id).toBe('fortress-blast');
  expect(blown.script.objective).toBe('silence-battery');
  expect(blown.script.flags).toContain('fortress-down');
  expect(blown.checkpoint?.id).toBe('cp3');
  expect(blown.checkpoint?.script.cutscene).toBeNull();
  expect(blown.script.spawned).toContain('battery');
  expect(blown.battery.on).toBe(true);

  // the live script still plays the cutscene; the copy the checkpoint kept does not
  const restored = restoreCheckpoint(blown.script);
  expect(restored.cutscene).toBeNull();
  const again = retryFromCheckpoint(blown);
  expect(again.script.cutscene).toBeNull();
  expect(again.script.fortressDown).toBe(true);
  expect(again.brokenProps).toEqual(blown.brokenProps);
});

test('a mech still inside takes FORT_BLAST_TUNE.damage, and one with less armour is downed', () => {
  const inside = plant(atTheMagazine());
  const { game: hurt } = toTheBlast(inside);
  expect(hurt.armor).toBe(MECH_TUNE.armor - FORT_BLAST_TUNE.damage);
  expect(hurt.downed).toBe(false);

  const weak = plant(atTheMagazine());
  weak.armor = FORT_BLAST_TUNE.damage - 10;
  const { game: downed, events } = toTheBlast(weak);
  expect(downed.armor).toBe(0);
  expect(downed.downed).toBe(true);
  expect(events.some(event => event.kind === 'downed')).toBe(true);
});

test('the mid boss’s blast does not open the land door; only the charge does', () => {
  const game = atTheMagazine();
  expect(game.propRefs).toContain(doorIndex());
  sendToScript(game, { kind: 'wardenDown' });
  step(game, idle, DT);
  expect(game.script.objective).toBe('bomb-fortress');
  expect(game.propRefs).toContain(doorIndex());

  plant(game);
  game.mech.z = -58;
  toTheBlast(game);
  expect(game.propRefs).not.toContain(doorIndex());
});

test('the fuse does not burn while a cutscene plays', () => {
  const game = plant(atTheMagazine());
  const left = game.charges[0].left;
  game.script.cutscene = { id: 'fortress-blast', left: 1 };
  for (let i = 0; i < 60; i++) step(game, idle, DT);
  expect(game.charges[0].left).toBe(left);
  // and once the cutscene ends it runs on
  game.script.cutscene = null;
  for (let i = 0; i < 30; i++) step(game, idle, DT);
  expect(game.charges[0]?.left ?? 0).toBeLessThan(left);
});
