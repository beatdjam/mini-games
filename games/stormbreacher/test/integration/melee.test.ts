// The mech's fist: the front sector, the wait between blows, the free lunge, the frame the blow lands on and the
// checkpoint's reset. The mech starts on the beach from playGame, and each test puts what it needs in front of it.
import { expect, test } from 'vitest';
import { ENEMIES } from '../../src/data/enemies.ts';
import { MINE_TUNE } from '../../src/data/hazards.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { MELEE_DAMAGE_MUL, meleeHitSec, MELEE_TUNE, type MeleeKind } from '../../src/data/melee.ts';
import { TARGET_HP } from '../../src/data/props.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import {
  newGame,
  retryFromCheckpoint,
  sendToScript,
  step,
  type GameEvent,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { hudModel } from '../../src/logic/hud.ts';
import { clearInfantry, holdAlliesFire, newPlayGame } from './playGame.ts';

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

type MeleeEvent = Extract<GameEvent, { kind: 'melee' }>;

const meleeEvent = (game: GameModel): MeleeEvent | undefined =>
  game.events.find((item): item is MeleeEvent => item.kind === 'melee');

// Runs the blow from the key to after its return, without pressing it again, and returns the blow's event.
function runBlow(game: GameModel): MeleeEvent | null {
  let event: MeleeEvent | null = null;
  step(game, { ...idle, melee: true }, DT);
  const first = meleeEvent(game);
  if (first) event = first;
  const frames = Math.ceil((MELEE_TUNE.windupSec + MELEE_TUNE.swingSec + MELEE_TUNE.lungeSec + 0.2) / DT);
  for (let i = 0; i < frames; i++) {
    step(game, idle, DT);
    const found = meleeEvent(game);
    if (found) event = found;
  }
  return event;
}

// The mech on the beach from playGame, facing the land, with `kind` at `dist` metres along `deg` from its front.
function withEnemyAt(kind: 'grunt' | 'heavy' | 'emplacement', deg: number, dist: number): GameModel {
  const game = newPlayGame(M1B_HAND);
  // these tests read the fist alone: the infantry's support fire would put the enemy down first (SB-2240), and so would
  // the allies' fire now that it tells (SB-2301)
  clearInfantry(game);
  holdAlliesFire(game);
  game.mech.yaw = 0;
  const rad = (deg * Math.PI) / 180;
  game.enemies = [
    newEnemy('target-1', 'test', kind, game.mech.x + Math.sin(rad) * dist, game.mech.z - Math.cos(rad) * dist),
  ];
  return game;
}

// The mech a metre in front of a target's nearest face (its +z side), facing the land.
function withTargetAhead(id: string): GameModel {
  const game = newPlayGame(M1B_HAND);
  const target = game.targets.find(item => item.id === id);
  if (!target) throw new Error(`the map has no ${id}`);
  game.mech.x = (target.box.minX + target.box.maxX) / 2;
  game.mech.z = target.box.maxZ + MECH_TUNE.radius + 0.05;
  game.mech.y = 0;
  game.mech.yaw = 0;
  game.mech.grounded = true;
  game.enemies = [];
  game.mines = [];
  game.barrages = [];
  game.shells = [];
  for (const shutter of game.shutters) shutter.open = true; // the magazine's shutter would turn a blow away (SB-200)
  return game;
}

test('a blow downs a grunt in one, taking its health to zero', () => {
  const game = withEnemyAt('grunt', 10, 3);
  const enemy = game.enemies[0];
  const event = runBlow(game);
  expect(event).toMatchObject({ hit: true, enemy: 'target-1' });
  expect(ENEMIES.grunt.hp - MELEE_TUNE.damage).toBeLessThanOrEqual(0); // 40 health, 40 a blow (SB-2170)
  expect(enemy.hp).toBe(0);
});

test('an enemy outside the sector is a miss and does not lose health', () => {
  const game = withEnemyAt('grunt', 60, 3);
  const event = runBlow(game);
  expect(event?.hit).toBe(false);
  expect(game.enemies[0].hp).toBe(ENEMIES.grunt.hp);
});

test('the machine-gun nest now takes a blow at its share', () => {
  const game = withEnemyAt('emplacement', 5, 3);
  const event = runBlow(game);
  expect(event).toMatchObject({ hit: true, enemy: 'target-1' });
  expect(game.enemies[0].hp).toBeLessThan(ENEMIES.emplacement.hp);
  expect(game.enemies[0].hp).toBe(ENEMIES.emplacement.hp - 15);
});

test('the heavy takes less than a walking machine of the same health', () => {
  const game = withEnemyAt('heavy', 5, 3);
  const event = runBlow(game);
  expect(event?.hit).toBe(true);
  expect(game.enemies[0].hp).toBeLessThan(ENEMIES.heavy.hp);
  expect(game.enemies[0].hp).toBe(ENEMIES.heavy.hp - 24);
});

// SB-2170: the blow's power went up, so the count for each kind is pinned here. The structures and the mid boss keep the
// same health per blow as before, so a share that lets one of them take more or less fails this test too.
test('the blow’s count per kind: a grunt falls to one, a heavy to five, the structures as before', () => {
  const count = (kind: MeleeKind, hp: number): number => Math.ceil(hp / (MELEE_TUNE.damage * MELEE_DAMAGE_MUL[kind]));
  expect(count('assault', ENEMIES.assault.hp)).toBe(1);
  expect(count('grunt', ENEMIES.grunt.hp)).toBe(1);
  expect(count('heavy', ENEMIES.heavy.hp)).toBe(5);
  expect(count('emplacement', ENEMIES.emplacement.hp)).toBe(10);
  expect(count('warden', ENEMIES.warden.hp)).toBe(160);
  expect(MELEE_DAMAGE_MUL.pillbox).toBe(0); // a blow only suppresses it
  expect(count('depot', TARGET_HP.depot)).toBe(10);
  expect(count('gun', TARGET_HP.gun)).toBe(80);
  expect(count('fortressGun', TARGET_HP.fortressGun)).toBe(120);
  expect(count('magazine', TARGET_HP.magazine)).toBe(22);
  expect(count('mine', MINE_TUNE.hp)).toBe(1);
});

test('the blow lands on the frame the swing passes through, not when the key went down', () => {
  const game = withEnemyAt('grunt', 5, 3);
  const enemy = game.enemies[0];
  const strikeFrame = Math.ceil(meleeHitSec() / DT);
  let landed = -1;
  for (let frame = 1; frame <= strikeFrame + 4; frame++) {
    step(game, { ...idle, melee: true }, DT);
    if (enemy.hp < ENEMIES.grunt.hp) {
      landed = frame;
      break;
    }
  }
  expect(landed).toBe(strikeFrame);
  expect(meleeEvent(game)?.hit).toBe(true);
});

test('a blow steps in by the same lunge as before, and a miss by the short one', () => {
  const hitGame = withEnemyAt('grunt', 5, 3);
  const hitStart = { x: hitGame.mech.x, z: hitGame.mech.z };
  runBlow(hitGame);
  const hitMoved = Math.hypot(hitGame.mech.x - hitStart.x, hitGame.mech.z - hitStart.z);
  // the 1750 values: the step-in is not to change on this card
  expect(hitMoved).toBeCloseTo(5, 1);

  const missGame = withEnemyAt('grunt', 60, 3);
  const missStart = { x: missGame.mech.x, z: missGame.mech.z };
  runBlow(missGame);
  const missMoved = Math.hypot(missGame.mech.x - missStart.x, missGame.mech.z - missStart.z);
  expect(missMoved).toBeCloseTo(1.5, 1);
});

test('a blow suppresses a pillbox and takes none of its health, as a shot does', () => {
  const game = newPlayGame(M1B_HAND);
  const target = game.targets.find(item => item.id === 'pillbox-1');
  if (!target) throw new Error('the map has no pillbox-1');
  // The pillbox faces +z (toward the sea); the mech stands in front of it and faces the land.
  game.mech.x = (target.box.minX + target.box.maxX) / 2;
  game.mech.z = (target.box.minZ + target.box.maxZ) / 2 + 5;
  game.mech.y = 0;
  game.mech.yaw = 0;
  game.mech.grounded = true;
  game.enemies = [];
  const event = runBlow(game);
  expect(event).toMatchObject({ hit: true, target: 'pillbox-1' });
  expect(target.hp).toBe(TARGET_HP.pillbox);
  const state = game.pillboxes.find(item => item.id === 'pillbox-1');
  expect(state?.suppress).toBeGreaterThan(0);
  expect(game.pillboxHint).toBe(true);
});

test('a held fist strikes no faster than the interval', () => {
  const game = newPlayGame(M1B_HAND);
  game.enemies = [];
  let blows = 0;
  for (let i = 0; i < 90; i++) {
    step(game, { ...idle, melee: true }, DT);
    blows += game.events.filter(event => event.kind === 'melee').length;
  }
  expect(blows).toBe(2);
  for (let i = 0; i < 45; i++) {
    step(game, { ...idle, melee: true }, DT);
    blows += game.events.filter(event => event.kind === 'melee').length;
  }
  expect(blows).toBe(3);
});

test('the fist uses no ammo and the HUD names it once both guns are empty', () => {
  const game = withEnemyAt('grunt', 5, 3);
  game.main.ammo = 3;
  game.sub.ammo = 1;
  step(game, { ...idle, melee: true }, DT);
  expect(game.main.ammo).toBe(3);
  expect(game.sub.ammo).toBe(1);
  expect(hudModel(game).melee).toBe(false);
  game.main.ammo = 0;
  game.sub.ammo = 0;
  expect(hudModel(game).melee).toBe(true);
});

test('a retry from a checkpoint has the fist ready again', () => {
  const game = newPlayGame(M1B_HAND);
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(item => item.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
  expect(game.checkpoint?.id).toBe('cp1');
  step(game, { ...idle, melee: true }, DT);
  expect(game.melee.wait).toBeGreaterThan(0);
  expect(game.melee.blow).not.toBeNull();
  const again = retryFromCheckpoint(game);
  expect(again.melee.wait).toBe(0);
  expect(again.melee.lunge).toBeNull();
  expect(again.melee.blow).toBeNull();
});

test('a blow reaches the battery gun, the depot and the magazine from their faces, not their middles', () => {
  for (const id of ['main-gun-1', 'depot', 'magazine']) {
    const game = withTargetAhead(id);
    const target = game.targets.find(item => item.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    const before = target.hp;
    const event = runBlow(game);
    expect(event, id).toMatchObject({ hit: true, target: id });
    expect(target.hp, id).toBeLessThan(before);
  }
});

test('a prop or a wall between the fist and its mark turns the blow away', () => {
  const game = withEnemyAt('grunt', 0, 4);
  const z = game.mech.z;
  // a tall box between the chest and the enemy's face: the blow follows a shot's rule and does not go through it
  game.propBoxes.push({ minX: -3, maxX: 3, minY: 0, maxY: 6, minZ: z - 2.5, maxZ: z - 2 });
  const event = runBlow(game);
  expect(event?.hit).toBe(false);
  expect(game.enemies[0].hp).toBe(ENEMIES.grunt.hp);
});

test('a defender still hidden behind its cover cannot be punched; one stepped out can', () => {
  const hidden = withEnemyAt('grunt', 5, 3);
  hidden.enemies[0].post = 0;
  hidden.enemies[0].holdOut = false;
  hidden.enemies[0].holdLeft = 10;
  expect(runBlow(hidden)?.hit).toBe(false);
  expect(hidden.enemies[0].hp).toBe(ENEMIES.grunt.hp);

  const shown = withEnemyAt('grunt', 5, 3);
  shown.enemies[0].post = 0;
  shown.enemies[0].holdOut = true;
  shown.enemies[0].holdLeft = 10;
  expect(runBlow(shown)?.hit).toBe(true);
  expect(shown.enemies[0].hp).toBeLessThan(ENEMIES.grunt.hp);
});

test('a defender running to its next cover can be punched while it is out in the open', () => {
  const running = withEnemyAt('grunt', 5, 3);
  running.enemies[0].post = 0; // the old cover's number stays while it runs
  running.enemies[0].holdOut = false;
  running.enemies[0].fallback = { x: running.mech.x + 20, z: running.mech.z - 20 };
  expect(runBlow(running)?.hit).toBe(true);
  expect(running.enemies[0].hp).toBeLessThan(ENEMIES.grunt.hp);
});

test('the blast of a punched mine leaves the punching mech out of it', () => {
  const game = withEnemyAt('grunt', 60, 3); // no enemy in the sector, so the nearest thing is the mine
  game.mines = [{ x: game.mech.x, z: game.mech.z - 2, hp: MINE_TUNE.hp }];
  const armor = game.armor;
  const event = runBlow(game);
  expect(event).toMatchObject({ hit: true });
  expect(game.mines).toEqual([]);
  expect(game.armor).toBe(armor);
});

test('the mech does not swing the fist while it holds the charge button', () => {
  const game = withEnemyAt('grunt', 5, 3);
  for (let i = 0; i < 60; i++) step(game, { ...idle, melee: true, use: true }, DT);
  expect(game.melee.wait).toBe(0);
  expect(game.melee.blow).toBeNull();
  expect(game.events.some(item => item.kind === 'melee')).toBe(false);
  expect(game.enemies[0].hp).toBe(ENEMIES.grunt.hp);
});

test('a milestone’s slowdown stretches the fist’s clock with the rest of the game', () => {
  const game = withEnemyAt('grunt', 5, 3);
  game.slow = { left: 10, scale: 0.5 };
  step(game, { ...idle, melee: true }, DT);
  expect(game.melee.blow?.t).toBeCloseTo(DT * 0.5, 10); // beginMelee starts the clock in the same frame
  expect(game.melee.wait).toBeCloseTo(MELEE_TUNE.interval, 10);
});

// The checkpoint copy keeps the fist's state like every other field, so the wait and the blow are in the suspend's shape
// too; this guards the game's own copy against a field added without a home in suspendOf.
test('the game starts with the fist ready', () => {
  expect(newGame(M1B_HAND).melee).toEqual({ wait: 0, lunge: null, blow: null });
});
