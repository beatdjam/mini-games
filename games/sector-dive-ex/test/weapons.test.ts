// Smoke test for Sector Dive Extended, weapons: firing, magazines, the bag and the pickup prompt, autofire and drops. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real loop by hand.
// Each test makes the state it needs; the file passes on its own and in any order (the dice are seeded where a test depends on them).
import { beforeAll, expect, test } from 'vitest';
import type { Pickup } from '../src/data/types.ts';
import { el, rand } from '@engine/core/util.ts';
import { clearWorld, query } from '@engine/core/world.ts';
import { t } from '@engine/core/i18n.ts';
import { V3, camera, scene } from '@engine/render/render.ts';
import { H, T, W, activeTileGrid, cover, grid, hgt, ramp } from '@engine/world/tiles.ts';
import { SPLIT_FAN, WEAPONS, WEAPON_ORDER } from '../src/data/weapons.ts';
import { EYE } from '../src/data/level.ts';
import { KIT_MAX, PER } from '../src/data/progress.ts';
import { basicW, persist, save } from '../src/core/save.ts';
import { supplyPlus, supplyRarity, pickDrop, progressOf } from '../src/core/rules.ts';
import {
  addPickup,
  enemies,
  nearPickup,
  pBullets,
  removeEnemyMesh,
  spawnEnemy,
  spawnPBullet,
} from '../src/world/entities.ts';
import { player, newPlayer, setPlayer } from '../src/actors/player.ts';
import { fillMag, rollWeapon, magSize, newWeapon } from '../src/actors/weapons.ts';
import { kitHealAmount } from '../src/actors/combat.ts';
import { findTarget, fire, shotId } from '../src/actors/firing.ts';
import { equipNearby, stowNearby } from '../src/ui/input.ts';
import { updateHud } from '../src/ui/hud.ts';
import { endRun, startRun } from '../src/flow/run.ts';
import * as THREE from 'three';
import { weaponStatText } from '../src/screens/base.ts';
import { updatePBullets } from '../src/actors/bullets.ts';
import { updatePickups } from '../src/flow/update.ts';
import { setFireHeld } from '@engine/ui/input.ts';
import { tick, bootGame } from './helpers.ts';

beforeAll(bootGame);

test('split-shot fan squeezes into SPLIT_FAN.max', () => {
  pBullets.forEach(b => {
    b.alive = false;
  });
  const keep = player.weapons[player.cur];
  player.weapons[player.cur] = newWeapon('rail', 0);
  player.extra = 25;
  player.pitch = 0;
  fire();
  const hs = pBullets
    .filter(b => b.alive)
    .map(b => {
      const l = Math.hypot(b.vx, b.vz);
      return [b.vx / l, b.vz / l];
    });
  let span = 0; // the extra rounds also get up to ±0.02 of random spread on top of the fan
  hs.forEach(a =>
    hs.forEach(b => {
      span = Math.max(span, Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1])));
    }),
  );
  player.weapons[player.cur] = keep;
  player.extra = 0;
  pBullets.forEach(b => {
    b.alive = false;
    b.mesh.visible = false;
  });
  if (hs.length !== 26 || span > SPLIT_FAN.max + 0.045 || span < SPLIT_FAN.max * 0.7)
    throw new Error('split fan ' + hs.length + ' ' + span);
});
test('fast gun fires more than once a frame and a full pool reuses the oldest round', () => {
  setFireHeld(true);
  const keep = player.weapons[player.cur];
  player.weapons[player.cur] = newWeapon('smg', 0);
  player.weapons[player.cur]!.mag = 1e5;
  player.fireRate = 4.03;
  player.extra = 10;
  player.reloadT = 0;
  player.fireCd = 0;
  const s0 = shotId;
  tick(60);
  const shots = shotId - s0;
  const last = pBullets.filter(b => b.alive && b.shot === shotId).length;
  // fill the whole pool with rounds in flight, then shoot: the new shot's rounds must still all be there
  for (let k = 0; k < 600; k++)
    spawnPBullet(new V3(player.x, 50, player.z), new V3(0, 1, 0), 1, 1, 0, 0, 0xffffff, 0, {});
  player.fireCd = 0;
  fire();
  const fresh = pBullets.filter(b => b.alive && b.shot === shotId).length;
  if (fresh !== 11) throw new Error('full pool dropped the shot: ' + fresh + ' of 11 rounds');
  player.weapons[player.cur] = keep;
  player.fireRate = 1;
  player.extra = 0;
  player.fireCd = 0;
  pBullets.forEach(b => {
    b.alive = false;
    b.mesh.visible = false;
  });
  const want = 1 / (WEAPONS.smg.rate / 4.03); // about 65 a second, more than the 60 frames
  if (shots < want - 2 || shots > want + 2 || last !== 11)
    throw new Error('fast gun ' + shots + ' shots (want ' + want.toFixed(1) + '), last shot ' + last + ' rounds');
});
test('a kit picked up with the kits full is used on the spot', () => {
  const keep = [player.kits, player.maxHp, player.hp];
  player.kits = KIT_MAX;
  player.maxHp = 500;
  player.hp = 100;
  addPickup('kit', player.x, player.z);
  updatePickups(1 / 60);
  updatePickups(1 / 60);
  const healed = player.hp - 100,
    want = kitHealAmount();
  [player.kits, player.maxHp, player.hp] = keep;
  if (healed !== want || want !== 125) throw new Error('kit on the spot healed ' + healed + ' (want ' + want + ')');
});
test("base weapon cards ignore the current run's chips", () => {
  const w = { id: 'shotgun', r: 1, plus: 3, opts: ['rate'] },
    before = weaponStatText(w),
    keep = player,
    dm = player.dmgMul;
  player.dmgMul *= 5;
  player.extra += 3;
  const during = weaponStatText(w);
  player.dmgMul = dm;
  player.extra -= 3;
  if (before !== during || player !== keep || !/\d/.test(before))
    throw new Error('base weapon stats moved with the run: ' + before + ' / ' + during);
});
test('pickup: stow goes to the bag, equip swaps with the weapon in hand', () => {
  startRun();
  tick(5);
  clearWorld('pickup');
  player.weapons = [newWeapon('pistol', 0, true), newWeapon('smg', 0)];
  player.cur = 0;
  player.bag = [null, null, null, null];
  const drop = (id: string) => {
    addPickup('weapon', player.x, player.z, { w: newWeapon(id, 1) });
    updatePickups(0);
  };
  drop('rail');
  stowNearby();
  if (!player.bag[0] || player.bag[0].id !== 'rail') throw new Error('stow');
  drop('shotgun');
  equipNearby();
  if (
    player.weapons[0]!.id !== 'shotgun' ||
    !query<Pickup>('pickup').some(p => p.kind === 'weapon' && p.w!.id === 'pistol')
  )
    throw new Error('equip swap');
  player.bag = [newWeapon('smg', 0), newWeapon('smg', 0), newWeapon('smg', 0), newWeapon('smg', 0)];
  clearWorld('pickup');
  drop('launcher');
  stowNearby();
  if (player.bag.some(w => w?.id === 'launcher') || !nearPickup) throw new Error('stow into a full bag');
  endRun('abandon');
});
test('pickup prompt: the buttons follow slot changes made while it is up (bag screen)', () => {
  startRun();
  tick(5);
  clearWorld('pickup');
  player.weapons = [newWeapon('pistol', 0, true), null];
  player.cur = 0;
  player.bag = [null, null, null, null];
  addPickup('weapon', player.x, player.z, { w: newWeapon('rail', 1) });
  updatePickups(0);
  updateHud();
  if (el('#btnStow').textContent !== t('hud.btnStow', { n: 4 }))
    throw new Error('stow label ' + el('#btnStow').textContent);
  if (el('#btnEquip').textContent !== t('hud.btnEquip2')) throw new Error('equip label');
  // what the bag screen does: fill a bag slot, then put a weapon in slot 2 (one change at a time)
  player.bag[0] = newWeapon('smg', 0);
  updateHud();
  if (el('#btnStow').textContent !== t('hud.btnStow', { n: 3 }))
    throw new Error('stale stow label ' + el('#btnStow').textContent);
  player.weapons[1] = newWeapon('smg', 0);
  updateHud();
  if (el('#btnEquip').textContent !== t('hud.btnSwap')) throw new Error('stale equip label');
  endRun('abandon');
});
test('autofire target: a fogged enemy is not picked, a close one is', () => {
  startRun();
  tick(3);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  (scene.fog as THREE.Fog).near = 2;
  (scene.fog as THREE.Fog).far = 20; // visibleRange = 12.8
  grid.fill(1);
  hgt.fill(0);
  ramp.fill(-1);
  cover.fill(0); // open floor so only distance matters
  activeTileGrid().world.door?.fill(0);
  player.x = (W * T) / 2;
  player.z = (H * T) / 2;
  player.yaw = 0;
  player.pitch = 0;
  player.fy = 0;
  camera.position.set(player.x, EYE, player.z);
  camera.rotation.set(0, 0, 0);
  const far = spawnEnemy('crawler', player.x, player.z - 20, -1, 1);
  far.mesh.position.set(far.x, EYE, far.z);
  const t1 = findTarget();
  far.z = player.z - 8;
  far.mesh.position.set(far.x, EYE, far.z);
  const t2 = findTarget();
  if (t1 || !t2) throw new Error('fog target ' + !!t1 + ' ' + !!t2);
  endRun('abandon');
});
test('shotgun knockback once per shot; launcher gets half the magazine chips', () => {
  startRun();
  tick(3);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  grid.fill(1);
  hgt.fill(0);
  ramp.fill(-1);
  cover.fill(0);
  activeTileGrid().world.door?.fill(0); // a building floor has doors: none in the way here
  player.x = (W * T) / 2;
  player.z = (H * T) / 2;
  player.fy = 0;
  const e = spawnEnemy('brute', player.x, player.z - 4, -1, 50);
  e.fy = 0;
  e.mesh.position.set(e.x, 1.1, e.z);
  const z0 = e.z;
  for (let k = 0; k < 8; k++)
    spawnPBullet(new V3(player.x + rand(-0.2, 0.2), 1.1, player.z), new V3(0, 0, -1), 65, 1, 0, 0, 0xffffff, 0, {
      kb: WEAPONS.shotgun.kb,
      shot: 999,
    });
  updatePBullets(0.1);
  const pushed = z0 - e.z;
  if (!(pushed > 0.5 && pushed < WEAPONS.shotgun!.kb! + 0.05)) throw new Error('knockback ' + pushed);
  player.magMul = 2.5;
  if (magSize(newWeapon('launcher', 0)) > 5 || magSize(newWeapon('smg', 0)) < 110)
    throw new Error('mag chips ' + magSize(newWeapon('launcher', 0)));
  endRun('abandon');
});
test('every type drops regardless of unlocks; base weapons are issued for the start depth', () => {
  const keepU = save.unlocked,
    keepL = save.loadout,
    keepS = [save.shortcut, save.startTier];
  save.unlocked = { pistol: true };
  const ids = new Set();
  for (let k = 0; k < 400; k++) ids.add(pickDrop());
  if (ids.size !== WEAPON_ORDER.length) throw new Error('drop pool should have every type: ' + [...ids]);
  save.loadout = [basicW('rail'), null];
  const got: number[] = [];
  for (const tier of [0, 9]) {
    save.shortcut = tier;
    save.startTier = tier;
    startRun();
    tick(2);
    const w = player.weapons[0]!;
    // (★ at DEPTH 1, ★★ at DEPTH 10: supplyRarity)
    if (w.id !== 'rail' || w.r !== supplyRarity(tier) || w.r !== (tier ? 1 : 0) || !w.basic)
      throw new Error('issued basic ' + JSON.stringify(w));
    got.push(w.plus || 0);
    endRun('abandon');
  }
  save.unlocked = keepU;
  save.loadout = keepL;
  [save.shortcut, save.startTier] = keepS;
  persist();
  // (DEPTH 10: what drops there, a little under it)
  if (got[0] !== 0 || got[1] !== supplyPlus(progressOf(9 * PER)) || !(got[1]! > 5)) throw new Error('issued + ' + got);
});
// a weapon new to the player (a drop, the loadout) comes with the full magazine of its options and the chips, not
// the bare WEAPONS[id].mag. At the end of the file: rollWeapon draws random numbers
test('a dropped weapon and the loadout come fully loaded, options and chips included', () => {
  setPlayer(newPlayer(save.loadout));
  player.magMul = 1.8; // magazine chips
  for (let k = 0; k < 30; k++) {
    const w = rollWeapon(30);
    expect(w.mag, w.id).toBe(magSize(w));
  }
  const smg = fillMag(newWeapon('smg', 1, false, 0, ['mag', 'mag']));
  expect(smg.mag).toBe(magSize(smg));
  expect(smg.mag, 'more than the bare magazine').toBeGreaterThan(WEAPONS.smg.mag * 1.8);
  // equipping it keeps that magazine
  player.weapons = [newWeapon('pistol', 0, true), smg];
  player.cur = 1;
  expect(player.weapons[player.cur]!.mag).toBe(magSize(smg));
  // the loadout: no chips yet, the option counts
  const opted = newWeapon('smg', 1, false, 0, ['mag']);
  const p = newPlayer([opted, null]);
  expect(p.weapons[0]!.mag).toBeGreaterThan(WEAPONS.smg.mag);
  expect(p.weapons[0]!.mag).toBe(fillMag(newWeapon('smg', 1, false, 0, ['mag']), 1).mag);
  expect(newPlayer([newWeapon('smg', 1), null]).weapons[0]!.mag, 'no option: the bare magazine').toBe(WEAPONS.smg.mag);
  setPlayer(null);
});
