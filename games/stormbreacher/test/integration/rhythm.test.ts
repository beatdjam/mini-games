// The rhythm of the two-line B section (SB-2020): line 2's near point stands in the machine-gun nests' fire while the
// far one is hidden behind the wreck's screen, and an ally mech's support fire silences the nests for a window long
// enough to plant a charge there.
import { expect, test } from 'vitest';
import { FRONT_TUNE, LINE2_FLAG } from '../../src/data/front.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { ENEMIES, ENEMY_CHEST } from '../../src/data/enemies.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { fireRayHit } from '../../src/logic/fire.ts';
import { isEnemyBullet, newGame, sendToScript, step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { clearInfantry, newPlayGame } from './playGame.ts';

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

const LINE2 = FRONT_TUNE.line2Z; // line 2's middle (m); the near and far points stand seaward of it
const AWAKE_SEC = 20; // the most the nests may take to start firing after they wake
const SEC = 9; // the seconds the mission's support fire holds the nests (m1's `suppress` action)

// The nests that guard line 2: the map's places landward of line 1 and seaward of line 2.
const nests = (M1B_HAND.spawns['b-emplacements'] ?? []).filter(place => place.z < 100 && place.z > LINE2);

// Whether a nest's shot from its chest to the mech's chest at a point is stopped by a prop.
function blockedFrom(nest: { x: number; z: number }, point: { x: number; z: number }, game: GameModel): boolean {
  const y = ENEMIES.emplacement.height * ENEMY_CHEST;
  const dx = point.x - nest.x;
  const dy = MECH_TUNE.chestHeight - y;
  const dz = point.z - nest.z;
  return fireRayHit(nest.x, y, nest.z, dx, dy, dz, Math.hypot(dx, dy, dz), game.propBoxes) !== null;
}

test('line 2’s near point stands in the nests’ fire and the far one behind the wreck’s screen', () => {
  const game = newGame(M1B_HAND);
  const near = M1B_HAND.blasts?.find(place => place.id === 'l2-a');
  const far = M1B_HAND.blasts?.find(place => place.id === 'l2-b');
  if (!near || !far) throw new Error('the hand map has no line 2 near and far points');
  expect(near.line).toBe(LINE2);
  expect(far.line).toBe(LINE2);
  expect(nests.length).toBeGreaterThanOrEqual(2);
  for (const nest of nests) {
    expect(blockedFrom(nest, near, game), `the near point from (${nest.x}, ${nest.z})`).toBe(false);
    expect(blockedFrom(nest, far, game), `the far point from (${nest.x}, ${nest.z})`).toBe(true);
  }
});

test('the ally’s support fire silences the nests for the mission’s seconds and then lets them fire again', () => {
  const game = newPlayGame(M1B_HAND);
  // this test reads the ally mech's support fire alone: the infantry's would weaken the nests it watches (SB-2240)
  clearInfantry(game);
  game.armor = 1e9;
  game.mech.x = 0;
  game.mech.z = 106; // just short of line 2’s approach area (z 82 to 100), in sight of its nests
  game.mech.yaw = 0;
  sendToScript(game, { kind: 'enter', area: 'b-line' }); // the nests wake
  const living = game.enemies.filter(enemy => enemy.wave === 'b-emplacements');
  expect(living).toHaveLength(6);

  // the nests' bullets in flight now, leaving out the ones already flying when the window opens
  const old = new Set<unknown>();
  const enemyShots = (): number =>
    game.bullets.filter(bullet => isEnemyBullet(bullet) && bullet.enemy === 'emplacement' && !old.has(bullet)).length;
  // let the nests start firing: without the window they do, once a woken nest's first wait and its sight are through
  let fired = false;
  for (let i = 0; i < Math.round(AWAKE_SEC / DT) && !fired; i++) {
    step(game, idle, DT);
    fired = enemyShots() > 0;
  }
  expect(fired).toBe(true);
  game.mech.z = 88;
  for (const bullet of game.bullets) old.add(bullet);

  sendToScript(game, { kind: 'enter', area: 'line2-approach' });
  const events = game.events.filter(event => event.kind === 'script').map(event => event.event);
  expect(events.find(event => event.kind === 'suppress')).toMatchObject({
    id: 'cover-b2',
    wave: 'b-emplacements',
    sec: SEC,
  });
  for (const nest of living) expect(nest.wait, nest.id).toBeGreaterThanOrEqual(SEC - 1e-9);

  // no nest fires through all but the last second of the window
  let shots = 0;
  for (let i = 0; i < Math.round((SEC - 1) / DT); i++) {
    step(game, idle, DT);
    shots += enemyShots();
  }
  expect(shots).toBe(0);

  // the silence ends on its own: a burst comes once the seconds have run out
  for (let i = 0; i < Math.round((SEC + 3) / DT); i++) {
    step(game, idle, DT);
    shots += enemyShots();
  }
  expect(shots).toBeGreaterThan(0);
});

test('the support fire shows as tracers at the nests while the window runs, the rounds-low line comes before it ends, and all stops after', () => {
  const game = newPlayGame(M1B_HAND);
  // this test reads the ally mech's support fire alone: the infantry's would weaken the nests it watches (SB-2240)
  clearInfantry(game);
  game.armor = 1e9;
  game.mech.x = 0;
  game.mech.z = 135;
  game.mech.yaw = 0;
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  // let the radio line b-line brings go by, as it has by the time the mech reaches line 2
  for (let i = 0; i < Math.round(8 / DT); i++) step(game, idle, DT);
  game.mech.z = 88;
  sendToScript(game, { kind: 'enter', area: 'line2-approach' });
  expect(game.cover).not.toBeNull();
  const nestIds = new Set(game.enemies.filter(enemy => enemy.wave === 'b-emplacements').map(enemy => enemy.id));

  // count the frame's tracer events by the second they fall in, and note when the rounds-low line comes up
  const perSecond: number[] = Array.from({ length: SEC + 4 }, () => 0);
  let ammoAt: number | null = null;
  const t0 = game.time;
  for (const event of game.events) if (event.kind === 'coverFire') perSecond[0]++;
  for (let i = 0; i < Math.round((SEC + 4) / DT); i++) {
    step(game, idle, DT);
    const sec = Math.floor(game.time - t0);
    for (const event of game.events) {
      if (event.kind !== 'coverFire') continue;
      expect(nestIds.has(event.enemy)).toBe(true);
      perSecond[Math.min(sec, perSecond.length - 1)]++;
    }
    if (ammoAt === null && game.radio?.line === 'm1.line2-ammo') ammoAt = game.time - t0;
  }
  for (let s = 0; s < SEC - 1; s++) expect(perSecond[s], `second ${s}`).toBeGreaterThan(0);
  for (let s = SEC + 1; s < perSecond.length; s++) expect(perSecond[s], `second ${s}`).toBe(0);
  expect(ammoAt).not.toBeNull();
  expect(ammoAt as number).toBeGreaterThan(SEC - 2.5);
  expect(ammoAt as number).toBeLessThan(SEC);
  expect(game.cover).toBeNull();
});

test('blowing line 2 in the middle of the window ends the support fire: no more tracers and no rounds-low line', () => {
  const game = newPlayGame(M1B_HAND);
  game.armor = 1e9;
  game.mech.x = 0;
  game.mech.z = 88;
  game.mech.yaw = 0;
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  sendToScript(game, { kind: 'enter', area: 'line2-approach' });
  expect(game.cover).not.toBeNull();
  for (let i = 0; i < Math.round(4 / DT); i++) step(game, idle, DT);
  expect(game.cover).not.toBeNull();

  sendToScript(game, { kind: 'blast', id: 'l2-a' });
  expect(game.script.flags).toContain(LINE2_FLAG);
  step(game, idle, DT);
  expect(game.cover).toBeNull();

  // run well past the end of the window: neither a tracer nor the rounds-low line comes
  let tracers = 0;
  let ammo = false;
  for (let i = 0; i < Math.round((SEC + 2) / DT); i++) {
    step(game, idle, DT);
    tracers += game.events.filter(event => event.kind === 'coverFire').length;
    if (game.radio?.line === 'm1.line2-ammo' || game.radioQueue.some(item => item.line === 'm1.line2-ammo'))
      ammo = true;
  }
  expect(tracers).toBe(0);
  expect(ammo).toBe(false);
});
