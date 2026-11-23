// The fortress's sea-wall nest in the game (SB-1830): it sweeps the open ground before the sea gate, the staggered cover
// keeps the armour whole in its shadow, breaking the nest stops it, and the wave on the wall's top drops to its sea side.
import { expect, test } from 'vitest';
import { M1_WAVE_DROP, M1_WAVE_ENEMY } from '../../src/data/enemies.ts';
import { FORTRESS_TUNE } from '../../src/data/fortress.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { sendToScript, step, type GameInput, type GameModel, isFortressBullet } from '../../src/logic/game.ts';
import { seed } from '../../src/logic/rng.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;
const OPEN = { x: 0, z: -58 }; // in front of the sea gate, with no cover between it and the nest
const SHADOW = { x: 30, z: -60 }; // just seaward of the wreck at (30, -64)
const SECONDS = 8; // two bursts and a little more (s)
const SAFE_ARMOR = 1e6;

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

// The hand map without its mines, and with nothing that could hurt the mech but the nest: no barrage, no aimed mortar,
// no enemies, and the pillboxes silent.
function nestGame(): GameModel {
  const game = newPlayGame({ ...M1B_HAND, mines: [] });
  game.barrages = [];
  game.aimed = null;
  game.enemies = [];
  game.pillboxes = [];
  return game;
}

// Runs the nest against a mech standing at `at` and returns the armour it took. The seed is the same for each run, so
// the sweep's spread is the same too.
function armorTaken(at: { x: number; z: number }, seconds = SECONDS): number {
  seed(1);
  const game = nestGame();
  game.mech.x = at.x;
  game.mech.y = 0;
  game.mech.z = at.z;
  game.mech.yaw = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) step(game, idle, DT);
  return MECH_TUNE.armor - game.armor;
}

test('the nest sweeps the open ground and its bullets take the armour', () => {
  seed(1);
  const game = nestGame();
  game.mech.x = OPEN.x;
  game.mech.z = OPEN.z;
  game.mech.y = 0;
  let bullets = 0;
  let hits = 0;
  for (let i = 0; i < Math.round(SECONDS / DT); i++) {
    step(game, idle, DT);
    for (const bullet of game.bullets) if (isFortressBullet(bullet)) bullets++;
    for (const event of game.events) if (event.kind === 'hit' && event.mech) hits++;
  }
  expect(bullets).toBeGreaterThan(0);
  expect(hits).toBeGreaterThan(0);
  expect(game.armor).toBeLessThan(MECH_TUNE.armor);
});

test('the cover in the open ground shadows the mech, and the same seconds out in the open take armour', () => {
  const covered = armorTaken(SHADOW);
  const open = armorTaken(OPEN);
  expect(open).toBeGreaterThan(0);
  expect(covered).toBe(0);
  expect(open).toBeGreaterThan(covered);
});

test('the same shadow takes armour once the cover in the open ground is taken away', () => {
  // the control of the test above: the shadow is the cover's, not a place the sweep never reaches
  seed(1);
  const game = nestGame();
  // the open ground's pieces are the low ones (under 6 m) seaward of the wall's face (z -68)
  game.propBoxes = game.propBoxes.filter(box => !(box.minZ > -68 && box.maxZ < -50 && box.maxY < 6));
  game.mech.x = SHADOW.x;
  game.mech.y = 0;
  game.mech.z = SHADOW.z;
  game.mech.yaw = 0;
  for (let i = 0; i < Math.round(SECONDS / DT); i++) step(game, idle, DT);
  expect(MECH_TUNE.armor - game.armor).toBeGreaterThan(0);
});

test('the nest does not fire once its target is broken', () => {
  seed(1);
  const game = nestGame();
  game.mech.x = OPEN.x;
  game.mech.z = OPEN.z;
  game.mech.y = 0;
  const gun = game.targets.find(target => target.id === 'fortress-gun');
  if (!gun) throw new Error('the hand map has no fortress-gun');
  gun.hp = 0;
  let seen = 0;
  for (let i = 0; i < Math.round(SECONDS / DT); i++) {
    step(game, idle, DT);
    for (const bullet of game.bullets) if (isFortressBullet(bullet)) seen++;
  }
  expect(seen).toBe(0);
  expect(game.armor).toBe(MECH_TUNE.armor);
});

test('the wave on the wall’s top falls and lands on its sea side', () => {
  const game = nestGame();
  game.armor = SAFE_ARMOR;
  const gun = game.targets.find(target => target.id === 'fortress-gun');
  if (!gun) throw new Error('the hand map has no fortress-gun');
  gun.hp = 0; // this test is about where the wave lands, not the nest's fire
  // the gate's cue waits for the leader's question; the wave is what this test is after
  game.script.flags.push('depot-asked');
  sendToScript(game, { kind: 'enter', area: 'fortress-gate' });
  const wave = game.enemies.filter(enemy => enemy.wave === 'fortress-drop');
  expect(wave).toHaveLength(M1B_HAND.spawns['fortress-drop'].length);
  expect(wave.map(enemy => enemy.kind)).toEqual(M1_WAVE_ENEMY['fortress-drop']);
  expect(wave.every(enemy => enemy.y === FORTRESS_TUNE.wallH)).toBe(true);

  for (let i = 0; i < Math.round(3 / DT) && wave.some(enemy => enemy.y > 0); i++) step(game, idle, DT);
  for (const enemy of wave) {
    expect(enemy.y).toBe(0);
    // they jump off toward +z while they fall: the wall's seaward face is at z -68
    expect(enemy.z).toBeGreaterThan(-68);
  }
});

test('the hand map’s wave from the wall has a kind for each of its places', () => {
  expect(M1_WAVE_ENEMY['fortress-drop']).toHaveLength(M1B_HAND.spawns['fortress-drop'].length);
  expect(M1_WAVE_DROP['fortress-drop']).toBe(FORTRESS_TUNE.wallH);
  expect(M1.targets).toContain('fortress-gun');
  expect(M1.waves).toContain('fortress-drop');
});
