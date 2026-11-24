// The fortress's sea-wall nest in the game (SB-1830): it sweeps the open ground before the sea gate, the staggered cover
// keeps the armour whole in its shadow, breaking the nest stops it, and the wave on the wall's top drops to its sea side.
import { expect, test } from 'vitest';
import { M1_WAVE_DROP, M1_WAVE_ENEMY } from '../../src/data/enemies.ts';
import { FORTRESS_TUNE } from '../../src/data/fortress.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { FORTRESS_GUN_FLAG, M1 } from '../../src/data/missions/m1.ts';
import { sendToScript, step, type GameInput, type GameModel, isFortressBullet } from '../../src/logic/game.ts';
import { hudModel } from '../../src/logic/hud.ts';
import { seed } from '../../src/logic/rng.ts';
import { restoreSuspend, suspendOf } from '../../src/logic/suspend.ts';
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

// SB-2045: the nest sleeps until the mech steps onto the open ground before the sea gate (`fortress-approach`).
const BEFORE = { x: 0, z: -45 }; // inside the nest's range with a clear line, but outside `fortress-approach` (z -68..-55)

function countFortressBullets(game: GameModel, seconds: number): number {
  let seen = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    step(game, idle, DT);
    for (const bullet of game.bullets) if (isFortressBullet(bullet)) seen++;
  }
  return seen;
}

function standAt(game: GameModel, at: { x: number; z: number }): void {
  game.mech.x = at.x;
  game.mech.y = 0;
  game.mech.z = at.z;
  game.mech.yaw = 0;
}

test('before it wakes, the nest does not fire even with the mech in its range and its line clear', () => {
  seed(1);
  const game = nestGame();
  standAt(game, BEFORE);
  expect(game.script.flags).not.toContain(FORTRESS_GUN_FLAG);
  expect(countFortressBullets(game, SECONDS)).toBe(0);
  expect(game.armor).toBe(MECH_TUNE.armor);
  expect(game.script.flags).not.toContain(FORTRESS_GUN_FLAG);
});

test('the mech stepping in front of the fortress wakes the nest, and it sweeps from then on', () => {
  seed(1);
  const game = nestGame();
  standAt(game, BEFORE);
  expect(countFortressBullets(game, SECONDS)).toBe(0);
  standAt(game, OPEN);
  expect(countFortressBullets(game, SECONDS)).toBeGreaterThan(0);
  expect(game.script.flags).toContain(FORTRESS_GUN_FLAG);
  expect(game.armor).toBeLessThan(MECH_TUNE.armor);
});

test('a nest broken before it wakes stays silent after the flag stands', () => {
  seed(1);
  const game = nestGame();
  standAt(game, BEFORE);
  const gun = game.targets.find(target => target.id === 'fortress-gun');
  if (!gun) throw new Error('the hand map has no fortress-gun');
  gun.hp = 0; // the mech shot it from where it stood
  expect(countFortressBullets(game, 1)).toBe(0);
  standAt(game, OPEN);
  expect(countFortressBullets(game, SECONDS)).toBe(0);
  expect(game.script.flags).toContain(FORTRESS_GUN_FLAG);
  expect(game.armor).toBe(MECH_TUNE.armor);
});

test('the wake flag survives a suspend, and the restored nest keeps sweeping', () => {
  seed(1);
  const game = nestGame();
  standAt(game, OPEN);
  step(game, idle, DT);
  const back = restoreSuspend(JSON.parse(JSON.stringify(suspendOf(game))));
  if (!back) throw new Error('the suspend did not restore');
  expect(back.script.flags).toContain(FORTRESS_GUN_FLAG);
  back.armor = MECH_TUNE.armor;
  back.barrages = [];
  back.aimed = null;
  back.enemies = [];
  back.pillboxes = [];
  expect(countFortressBullets(back, SECONDS)).toBeGreaterThan(0);
});

// SB-2051: before it wakes, the nest sits behind its plate: a shot does it no harm and throws a spark off the armour, and
// the aim does not pick it. Once the flag stands the plate opens and the nest can be hit and broken.
const NEST = 'fortress-gun';
// the mech's lock on a standing target: the aim circle's candidates, with the nest in the middle of the screen
function aimAtNest(game: GameModel): GameInput {
  const gun = game.targets.find(target => target.id === NEST);
  if (!gun) throw new Error('the hand map has no fortress-gun');
  const mech = game.mech;
  const chestY = mech.y + MECH_TUNE.chestHeight;
  const cx = (gun.box.minX + gun.box.maxX) / 2;
  const cy = (gun.box.minY + gun.box.maxY) / 2;
  const cz = (gun.box.minZ + gun.box.maxZ) / 2;
  const length = Math.hypot(cx - mech.x, cy - chestY, cz - mech.z);
  return {
    ...idle,
    fire: true,
    aim: {
      ox: mech.x,
      oy: chestY,
      oz: mech.z,
      dx: (cx - mech.x) / length,
      dy: (cy - chestY) / length,
      dz: (cz - mech.z) / length,
    },
  };
}

function nestHp(game: GameModel): number {
  return game.targets.find(target => target.id === NEST)?.hp ?? -1;
}

test('before it wakes, a shot at the nest takes no health, throws a spark off the plate and the aim never picks it', () => {
  seed(1);
  const game = nestGame();
  standAt(game, BEFORE);
  const full = nestHp(game);
  expect(game.shutters.find(shutter => shutter.target === NEST)).toEqual({ target: NEST, open: false });
  let hits = 0;
  let deflected = 0;
  let picked = 0;
  for (let i = 0; i < Math.round(4 / DT); i++) {
    step(game, aimAtNest(game), DT);
    for (const event of game.events) {
      if (event.kind === 'hit' && event.target === NEST) {
        hits++;
        if (event.deflected) deflected++;
      }
    }
    if (game.aimTarget === NEST) picked++;
  }
  expect(hits).toBeGreaterThan(5);
  expect(deflected).toBe(hits);
  expect(nestHp(game)).toBe(full);
  expect(picked).toBe(0);
  expect(game.script.flags).not.toContain(FORTRESS_GUN_FLAG);
  expect(hudModel(game).enemy).toBeNull();
});

test('once it wakes, the plate is open: the nest takes shots, the aim picks it and shots break it', () => {
  seed(1);
  const game = nestGame();
  standAt(game, OPEN);
  step(game, idle, DT);
  step(game, idle, DT);
  expect(game.script.flags).toContain(FORTRESS_GUN_FLAG);
  expect(game.shutters.find(shutter => shutter.target === NEST)).toEqual({ target: NEST, open: true });
  const full = nestHp(game);
  game.armor = 1e6;
  let picked = 0;
  let deflected = 0;
  for (let i = 0; i < Math.round(20 / DT) && nestHp(game) > 0; i++) {
    step(game, aimAtNest(game), DT);
    for (const event of game.events) if (event.kind === 'hit' && event.target === NEST && event.deflected) deflected++;
    if (game.aimTarget === NEST) picked++;
  }
  expect(deflected).toBe(0);
  expect(picked).toBeGreaterThan(0);
  expect(nestHp(game)).toBeLessThan(full);
  expect(nestHp(game)).toBe(0);
});

test('the plate’s state follows the flag after a suspend, and a suspend from before the plate gets one', () => {
  seed(1);
  // asleep: the plate is shut after the round trip and the nest still takes no harm
  const asleep = nestGame();
  standAt(asleep, BEFORE);
  step(asleep, idle, DT);
  const shut = restoreSuspend(JSON.parse(JSON.stringify(suspendOf(asleep))));
  if (!shut) throw new Error('the suspend did not restore');
  expect(shut.shutters.find(shutter => shutter.target === NEST)?.open).toBe(false);
  standAt(shut, BEFORE);
  for (let i = 0; i < 30; i++) step(shut, aimAtNest(shut), DT);
  expect(nestHp(shut)).toBe(shut.targets.find(target => target.id === NEST)?.hp);
  expect(nestHp(shut)).toBeGreaterThan(0);
  expect(nestHp(shut)).toBe(300);
  // awake: the plate is open after the round trip, to match the flag
  const awake = nestGame();
  standAt(awake, OPEN);
  step(awake, idle, DT);
  step(awake, idle, DT);
  const open = restoreSuspend(JSON.parse(JSON.stringify(suspendOf(awake))));
  if (!open) throw new Error('the suspend did not restore');
  expect(open.script.flags).toContain(FORTRESS_GUN_FLAG);
  expect(open.shutters.find(shutter => shutter.target === NEST)?.open).toBe(true);
  // a save from before the plate has no shutter for the nest: it is added to match the flag
  for (const [game, want] of [
    [asleep, false],
    [awake, true],
  ] as const) {
    const old = JSON.parse(JSON.stringify(suspendOf(game)));
    old.game.shutters = old.game.shutters.filter((shutter: { target: string }) => shutter.target !== NEST);
    if (old.checkpoint)
      old.checkpoint.shutters = old.checkpoint.shutters.filter(
        (shutter: { target: string }) => shutter.target !== NEST,
      );
    const back = restoreSuspend(old);
    if (!back) throw new Error('the old suspend did not restore');
    expect(back.shutters.find(shutter => shutter.target === NEST)?.open).toBe(want);
  }
});

test('the sea gate’s checkpoint copies the flag and the open plate together', () => {
  seed(1);
  const game = nestGame();
  standAt(game, OPEN);
  step(game, idle, DT);
  step(game, idle, DT);
  expect(game.shutters.find(shutter => shutter.target === NEST)?.open).toBe(true);
  // cp2 comes at the sea gate, after the approach has woken the nest; its copy holds the flag and the open plate
  game.script.flags.push('depot-asked');
  sendToScript(game, { kind: 'enter', area: 'fortress-gate' });
  step(game, idle, DT);
  expect(game.checkpoint?.id).toBe('cp2');
  expect(game.checkpoint?.script.flags).toContain(FORTRESS_GUN_FLAG);
  expect(game.checkpoint?.shutters.find(shutter => shutter.target === NEST)?.open).toBe(true);
});
