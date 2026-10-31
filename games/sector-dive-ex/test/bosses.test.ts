// Smoke test for Sector Dive Extended, bosses: the crusher, watcher, hoist and surgeon, their entrance, practice and hints. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real loop by hand.
// Each test makes the state it needs; the file passes on its own and in any order (the dice are seeded where a test depends on them).
import { beforeAll, expect, test } from 'vitest';
import { Group } from 'three';
import type { Boss, Enemy, RunState } from '../src/data/types.ts';
import { distXZ, el } from '@engine/core/util.ts';
import { query } from '@engine/core/world.ts';
import { t } from '@engine/core/i18n.ts';
import { clearPool } from '@engine/world/projectiles.ts';
import { floorY } from '@engine/world/tiles.ts';
import { joy, setFireHeld } from '@engine/ui/input.ts';
import { SPLIT_MAX } from '../src/data/weapons.ts';
import { ENEMY_TUNE } from '../src/data/enemies.ts';
import { BOSS_META, BOSS_ORDER, BOSS_TUNE } from '../src/data/bosses.ts';
import { DEPTH_HP_GROWTH, DEPTH_HP_LATE, PER, TUNE } from '../src/data/progress.ts';
import { PERKS } from '../src/data/perks.ts';
import { save } from '../src/core/save.ts';
import { level } from '../src/world/level.ts';
import { boss, eBullets, enemies, spawnWave } from '../src/world/entities.ts';
import { player, newPlayer, run, setPlayer, setRun } from '../src/actors/player.ts';
import { critChance, newWeapon, weaponStats } from '../src/actors/weapons.ts';
import { kitHealAmount, hurtEnemy } from '../src/actors/combat.ts';
import { difficultyAt, damageScaleAt, stageLabel } from '../src/core/stages.ts';
import { bossDifficulty, spawnBoss, spawnMinion } from '../src/actors/bosses/common.ts';
import { endRun, goBase, startPractice, startRun } from '../src/flow/run.ts';
import { update } from '../src/flow/update.ts';
import { COLOR } from '../src/data/colors.ts';
import { tick, bootGame } from './helpers.ts';

beforeAll(bootGame);

test('watcher: drones at 75% and 40%', () => {
  startPractice('watcher');
  tick(10);
  if (!boss) spawnBoss('watcher');
  boss!.spawnT = 0;
  boss!.phase = 1;
  const drones = () => enemies.filter(o => !o.boss && !o.dead && o.type === 'drone').length;
  boss!.hp = boss!.maxHp * 0.7;
  tick(2);
  const a1 = drones();
  boss!.hp = boss!.maxHp * 0.35;
  tick(2);
  const a2 = drones();
  if (a1 !== 2 || a2 !== 5) throw new Error('watcher drones ' + a1 + ' ' + a2);
  endRun('abandon');
});
test('crusher: hurt below half in its jump, it changes phase once it is down, not in the air', () => {
  startPractice('crusher');
  tick(10);
  if (!boss) spawnBoss('crusher');
  const K = BOSS_META.crusher.tune,
    c = boss as Boss & { st: string };
  c.spawnT = 0;
  c.st = 'slam';
  c.timer = K.slamTime;
  tick(Math.ceil(K.slamTime * 20)); // a third of the way up
  expect(c.mesh.position.y, 'in the air').toBeGreaterThan(1);
  hurtEnemy(c, c.hp - c.maxHp * 0.4, false);
  expect(c.phase, 'not while in the air').toBe(0);
  tick(Math.ceil(K.slamTime * 60) + 2);
  expect(c.phase, 'once it has landed').toBe(1);
  expect(c.spawnT, 'the burst runs on the ground').toBeGreaterThan(0);
  endRun('abandon');
});
test('crusher: fires fans as it walks; enraged, a second charge follows the first and only that one stuns', () => {
  startPractice('crusher');
  tick(10);
  if (!boss) spawnBoss('crusher');
  const K = BOSS_META.crusher.tune,
    c = boss as Boss & { st: string; fireT: number; chained: boolean },
    shots = () => eBullets.filter(b => b.alive).length;
  c.spawnT = 0;
  c.phase = 1;
  // walking: one fan after walkFireFirst, the next walkFire later
  c.st = 'idle';
  c.timer = 10;
  c.fireT = K.walkFireFirst;
  clearPool(eBullets);
  tick(Math.ceil(K.walkFireFirst * 60) + 2);
  expect(shots(), 'the first fan').toBe(K.walkFan[0]);
  tick(Math.ceil(K.walkFire * 60));
  expect(shots(), 'the second fan').toBe(K.walkFan[0] * 2);
  // while a shockwave spreads it holds its fire
  clearPool(eBullets);
  c.fireT = 0.01;
  spawnWave(c.x, c.z, 0.01, 50, 0, COLOR.amber);
  tick(30);
  expect(shots(), 'no fan while a wave spreads').toBe(0);
  query('wave').forEach(w => {
    w.dead = true;
  });
  tick(3);
  expect(shots(), 'the fan once the wave is gone').toBe(K.walkFan[0]);
  // not enraged: the charge ends in the stun
  const charge = () => {
    c.st = 'charge';
    c.timer = 0;
    tick(1);
  };
  charge();
  expect(c.st, 'a charge ends in the stun').toBe('stun');
  // enraged: the first charge is followed by a second (no stun), and that one ends in the stun
  c.hp = c.maxHp * 0.4;
  charge();
  expect([c.st, c.chained], 'the first of the pair turns round').toEqual(['tele', true]);
  tick(Math.ceil(K.chainTele * 60) + 2);
  expect(c.st, 'and charges again').toBe('charge');
  charge();
  expect([c.st, c.chained], 'the second ends in the stun').toEqual(['stun', false]);
  endRun('abandon');
});
test('scaling: additive damage chips, compounding health, practice depth', () => {
  const p0 = newPlayer(save.loadout),
    base = p0.dmgMul,
    od = PERKS.find(x => x.id === 'overload')!;
  od.apply(p0, od.v);
  od.apply(p0, od.v);
  if (Math.abs(p0.dmgMul - (base + 0.4)) > 1e-9) throw new Error('additive chips ' + p0.dmgMul);
  const perk = (n: string) => PERKS.find(x => x.id === n)!;
  for (let k = 0; k < 6; k++) ['crit', 'reload', 'mag'].forEach(n => perk(n).apply(p0, perk(n).rv!));
  if (Math.abs(p0.reloadMul - 0.4) > 1e-9 || Math.abs(p0.magMul - 2.5) > 1e-9)
    throw new Error('caps ' + p0.reloadMul + ' ' + p0.magMul);
  const keepP = player;
  setPlayer(p0);
  const cc = critChance();
  setPlayer(keepP);
  // split-shot: full-hit total must go up by exactly 20% for a single-shot weapon and for the shotgun alike
  {
    const keep = player;
    setPlayer(newPlayer(save.loadout));
    ['rail', 'shotgun'].forEach(id => {
      const w = newWeapon(id, 0),
        a = weaponStats(w);
      player.extra = 1;
      const b = weaponStats(w);
      player.extra = 0;
      if (Math.abs((b.perHit * b.hits) / (a.perHit * a.hits) - 1.2) > 1e-9) throw new Error('split ' + id);
    });
    // split-shot stops being offered at SPLIT_MAX; the launcher fires 3 rockets at most and the rest of the
    // +20%s goes into each rocket (the total stays 1 + 0.2 x chips)
    const sp = PERKS.find(x => x.id === 'split')!;
    player.extra = SPLIT_MAX;
    if (!sp.maxed!(player)) throw new Error('split cap');
    player.extra = 5;
    const lw = newWeapon('launcher', 0),
      ls = weaponStats(lw);
    player.extra = 0;
    const l0 = weaponStats(lw);
    if (ls.hits !== 3 || Math.abs((ls.perHit * ls.hits) / l0.perHit - 2) > 1e-9)
      throw new Error('launcher split ' + ls.hits + ' ' + ls.perHit / l0.perHit);

    setPlayer(keep);
  }
  if (cc !== TUNE.critCap) throw new Error('crit cap ' + cc);
  setRun({ stage: PER - 1, route: [0] } as RunState);
  const b1 = bossDifficulty();
  setRun({ stage: 2 * PER + PER - 1, route: [0] } as RunState);
  const b3 = bossDifficulty();
  if (Math.abs(b1 - 1.33 * BOSS_TUNE.hpMul) > 1e-9 || Math.abs(b3 / b1 - BOSS_TUNE.growth * BOSS_TUNE.growth) > 1e-6)
    throw new Error('boss scaling ' + b1 + ' ' + b3);
  if (Math.abs(difficultyAt(0) - ENEMY_TUNE.hpMul) > 1e-9) throw new Error('enemy hp base ' + difficultyAt(0));
  // the per-depth factor slides from the early rate down to the late one (GROWTH_SLIDE) and never goes back up
  const bossAt = (d: number) => {
    setRun({ stage: (d - 1) * PER + PER - 1, route: [0] } as RunState);
    return bossDifficulty();
  };
  const slides = (at: (d: number) => number, early: number, late: number, what: string) => {
    const r = Array.from({ length: 18 }, (_, i) => at(i + 2) / at(i + 1)); // D1->D2 .. D18->D19
    if (Math.abs(r[0]! - early) > 1e-6 || Math.abs(r[r.length - 1]! - late) > 1e-6)
      throw new Error(what + ' ends ' + r[0] + ' ' + r[r.length - 1]);
    if (r.some((v, i) => i && v > r[i - 1]! + 1e-9))
      throw new Error(what + ' rate went up ' + r.map(v => v.toFixed(3)));
  };
  slides(bossAt, BOSS_TUNE.growth, BOSS_TUNE.lateGrowth, 'boss growth');
  slides(d => difficultyAt((d - 1) * PER), DEPTH_HP_GROWTH, DEPTH_HP_LATE, 'enemy growth');
  // values that grow with depth: hazard floors and your own rockets hit like enemies do (damageScaleAt),
  // a med kit heals a share of max HP once that is more than kitHeal
  setRun({ stage: 13 * PER, route: [0] } as RunState);
  if (Math.abs(damageScaleAt(0) - 1) > 1e-9 || !(damageScaleAt(13 * PER) > 3))
    throw new Error('damage scale ' + damageScaleAt(13 * PER));
  {
    const keep = player;
    setPlayer(newPlayer(save.loadout));
    player.maxHp = 100;
    const a = kitHealAmount();
    player.maxHp = 500;
    const b = kitHealAmount();
    setPlayer(keep);
    if (a !== TUNE.kitHeal || b !== Math.round(500 * TUNE.kitHealPct)) throw new Error('kit heal ' + a + ' ' + b);
  }
  startPractice('trinity', 2);
  tick(5);
  if (stageLabel(run.stage) !== 'D3 BOSS') throw new Error('practice depth ' + stageLabel(run.stage));
  endRun('abandon');
});
// HOIST in the boss arena: the boss ready to act, its trolley over the middle, nothing else in the arena
type HoistTest = Boss & {
  st: string;
  gunT: number;
  cargo: { x: number; fill: { material: { opacity: number } } } | null;
};
function hoistReady(): HoistTest {
  startPractice('hoist');
  tick(10);
  if (!boss) spawnBoss('hoist');
  const h = boss as HoistTest;
  h.spawnT = 0;
  h.phase = 1; // (the phase change has its own test)
  h.timer = 1e6;
  h.gunT = 1e6; // (the guns have their own test)
  h.x = h.cx;
  h.z = h.cz;
  joy.x = 0;
  joy.y = 0;
  setFireHeld(false);
  player.maxHp = 1e6;
  player.hp = 1e6;
  player.inv = 0;
  return h;
}
test('hoist: the trolley trails the player at a steady speed along each axis', () => {
  const K = BOSS_META.hoist.tune,
    h = hoistReady();
  player.x = h.cx + 15;
  player.z = h.cz - 12;
  h.st = 'chase';
  const frames = 60;
  for (let k = 0; k < frames; k++) update(1 / 60);
  expect(h.x - h.cx, 'x: a second of chase').toBeCloseTo(K.chase, 0);
  expect(h.cz - h.z, 'z: the same').toBeCloseTo(K.chase, 0);
  expect(h.mesh.position.y, 'the magnet hangs 4 to 5 m up').toBeGreaterThan(4);
  expect(h.mesh.position.y).toBeLessThan(5);
  endRun('abandon');
});
test('hoist: a load hangs over the player with a shadow that fills, then falls and hurts only whoever is in the ring', () => {
  const K = BOSS_META.hoist.tune;
  const drop = (stepOut: number) => {
    const h = hoistReady();
    player.x = h.cx + 6;
    player.z = h.cz + 6;
    h.x = player.x;
    h.z = player.z;
    h.st = 'approach';
    h.timer = K.approachMax;
    update(1 / 60);
    expect(h.st, 'the load is up').toBe('hang');
    expect(h.cargo, 'with its shadow').toBeTruthy();
    const faint = h.cargo!.fill.material.opacity,
      hp0 = player.hp;
    for (let k = 0; k < (K.warn * 60) / 2; k++) update(1 / 60);
    expect(h.cargo!.fill.material.opacity, 'the shadow fills').toBeGreaterThan(faint);
    expect(player.hp, 'nothing falls yet').toBe(hp0);
    player.x += stepOut;
    for (let k = 0; k < 180 && h.st !== 'chase'; k++) update(1 / 60);
    expect(h.st, 'it fell and landed').toBe('chase');
    expect(h.cargo, 'the load is gone').toBeNull();
    const lost = hp0 - player.hp,
      dmg = h.dmg * K.dropDmg;
    endRun('abandon');
    return { lost, dmg };
  };
  const hit = drop(0);
  expect(hit.lost, 'standing in the ring').toBeCloseTo(hit.dmg, 6);
  // (well outside: the crawler that the broken load lets out lands 1.6 m from its middle, any way round)
  expect(drop(K.shadowR + 2.5).lost, 'outside the ring').toBe(0);
});
test('hoist: the magnet drags the player toward the point under it, and the load falls there', () => {
  const K = BOSS_META.hoist.tune,
    h = hoistReady();
  player.x = h.cx - 12;
  player.z = h.cz;
  h.st = 'wind';
  h.timer = K.pullWind;
  const d0 = distXZ(player, h);
  for (let k = 0; k < Math.ceil((K.pullWind + 1) * 60); k++) update(1 / 60);
  expect(h.st, 'a second into the pull').toBe('pull');
  expect(d0 - distXZ(player, h), 'dragged about pullSpeed metres').toBeGreaterThan(K.pullSpeed * 0.8);
  expect(player.x, 'toward the magnet').toBeGreaterThan(h.cx - 12);
  for (let k = 0; k < 4 * 60 && h.st !== 'hang'; k++) update(1 / 60);
  expect(h.st, 'then the load').toBe('hang');
  expect(h.cargo!.x, 'under the magnet').toBe(h.x);
  expect(distXZ(player, h), 'and the player is under it').toBeLessThan(K.shadowR);
  endRun('abandon');
});
test('hoist: a load that breaks lets a crawler out, two below half health, up to the cap of minions', () => {
  const K = BOSS_META.hoist.tune;
  const land = (hpShare: number, others: number) => {
    const h = hoistReady(),
      crawlers = () => enemies.filter(o => !o.boss && !o.dead && o.type === 'crawler').length;
    h.hp = h.maxHp * hpShare;
    player.x = h.cx + 10;
    player.z = h.cz - 10;
    for (let k = 0; k < others; k++) spawnMinion('crawler', h.cx - 10 - k, h.cz + 10);
    const before = crawlers();
    h.st = 'approach';
    h.timer = 0;
    for (let k = 0; k < 240 && !(h.st === 'chase' && !h.cargo); k++) update(1 / 60);
    const out = crawlers() - before;
    endRun('abandon');
    return out;
  };
  expect(land(0.4, 0), 'two out').toBe(K.crawlers);
  expect(land(0.4, K.minionCap - 1), 'room for one').toBe(1);
  expect(land(0.4, K.minionCap), 'at the cap').toBe(0);
  expect(land(1, 0), 'above half health: one').toBe(K.crawlers1);
});
test('hoist: the guns under the magnet fire a fan at the player while it trails, a wider one below half health', () => {
  const K = BOSS_META.hoist.tune;
  const fan = (hpShare: number) => {
    const h = hoistReady();
    h.hp = h.maxHp * hpShare;
    player.x = h.cx + 10;
    player.z = h.cz;
    clearPool(eBullets);
    const alive = () => eBullets.filter(b => b.alive).length;
    h.st = 'chase';
    h.gunT = 0.5;
    for (let k = 0; k < 20; k++) update(1 / 60);
    const early = alive();
    for (let k = 0; k < 20; k++) update(1 / 60);
    const n = alive();
    h.st = 'wind'; // (the magnet lights to pull: the guns hold their fire)
    h.timer = 1;
    h.gunT = 0;
    const before = alive();
    update(1 / 60);
    const quiet = alive() - before;
    endRun('abandon');
    return { early, n, quiet };
  };
  const calm = fan(1);
  expect(calm.early, 'not before its time').toBe(0);
  expect(calm.n, 'one fan').toBe(K.gunN);
  expect(calm.quiet, 'not while it pulls').toBe(0);
  expect(fan(0.4).n, 'a wider one below half health').toBe(K.gunNEnr);
});
test('hoist: when it goes down the load and the pull are gone, the magnet falls and the crane stays where it stopped', () => {
  const h = hoistReady();
  player.x = h.cx + 5;
  player.z = h.cz + 5;
  h.x = player.x;
  h.z = player.z;
  h.st = 'approach';
  h.timer = 0;
  update(1 / 60);
  expect(h.st, 'a load is up').toBe('hang');
  hurtEnemy(h, h.hp + 1, false);
  const crane = query('crane');
  expect(crane.length, 'the crane and the fallen magnet').toBe(2);
  const magnet = crane[1]!.mesh as Group,
    from = magnet.position.y;
  for (let k = 0; k < 90; k++) update(1 / 60);
  expect(magnet.position.y, 'the magnet came down').toBeLessThan(from - 2);
  expect(magnet.position.y, 'and lies on the floor').toBeLessThan(floorY(h.x, h.z) + 1.5);
  expect(query('crane').length, 'the crane is still there').toBe(2);
  expect(level.portals.length, 'practice: the way home').toBe(1);
  endRun('extract');
});
// SURGEON in the boss arena: the boss ready to act with its arms made, nothing else in the arena
type SurgeonTest = Boss & {
  arms: { kind: string; foe: { hp: number; maxHp: number; dead?: boolean } | null }[];
  atk: { t: number; arm: { kind: string } } | null;
  sweep: { ac: number; dir: number; live: boolean } | null;
  clamp: { x: number; z: number; slammed: boolean } | null;
  second: boolean;
};
function surgeonReady(): SurgeonTest {
  startPractice('surgeon');
  tick(10);
  if (!boss) spawnBoss('surgeon');
  const s = boss as SurgeonTest;
  s.spawnT = 0;
  s.phase = 1; // (the phase change has its own test)
  s.timer = 1e6;
  joy.x = 0;
  joy.y = 0;
  setFireHeld(false);
  player.maxHp = 1e6;
  player.hp = 1e6;
  player.inv = 0;
  player.x = s.cx + 12;
  player.z = s.cz + 12;
  update(1 / 60); // the arms are made on its first act
  clearPool(eBullets);
  return s;
}
// the next attack begins now; returns the kind of arm that began it ('' when the body fires a ring instead)
function surgeonAttack(s: SurgeonTest): string {
  s.timer = 0;
  update(1 / 60);
  return s.atk ? s.atk.arm.kind : '';
}
// runs the attack on to its end
function surgeonFinish(s: SurgeonTest) {
  for (let k = 0; k < 600 && s.atk; k++) update(1 / 60);
}
const surgeonShoot = (s: SurgeonTest, kind: string) => {
  const arm = s.arms.find(a => a.kind === kind)!;
  hurtEnemy(arm.foe as unknown as Enemy, arm.foe!.hp + 1, false);
  update(1 / 60);
};
test('surgeon: the arms attack in turn, scalpel, needle, clamp, and a shot-off arm is skipped', () => {
  const s = surgeonReady();
  expect(
    s.arms.map(a => a.kind),
    'three arms',
  ).toEqual(['scalpel', 'needle', 'clamp']);
  const order: string[] = [];
  for (let k = 0; k < 4; k++) {
    order.push(surgeonAttack(s));
    surgeonFinish(s);
  }
  expect(order, 'in turn').toEqual(['scalpel', 'needle', 'clamp', 'scalpel']);
  surgeonShoot(s, 'needle');
  const rest: string[] = [];
  for (let k = 0; k < 3; k++) {
    rest.push(surgeonAttack(s));
    surgeonFinish(s);
  }
  expect(rest, 'the needle arm is skipped').toEqual(['clamp', 'scalpel', 'clamp']);
  endRun('abandon');
});
test('surgeon: damage to an arm does not hurt the boss, damage to the body does; an arm shot off falls', () => {
  const s = surgeonReady(),
    arm = s.arms[0]!,
    armMax = arm.foe!.maxHp;
  expect(armMax / s.maxHp, 'an arm is a tenth of the body').toBeCloseTo(BOSS_META.surgeon.tune.armHp, 6);
  const hp0 = s.hp;
  hurtEnemy(arm.foe as unknown as Enemy, armMax * 0.5, false);
  expect(s.hp, 'the body is whole').toBe(hp0);
  expect(arm.foe!.hp, 'the arm is hurt').toBeLessThan(armMax);
  const wrecks = query('wreck').length;
  surgeonShoot(s, 'scalpel');
  expect(s.hp, 'a shot-off arm costs the body nothing').toBe(hp0);
  expect(arm.foe, 'the arm is gone').toBeNull();
  expect(query('wreck').length, 'its limb falls').toBe(wrecks + 1);
  hurtEnemy(s, 100, false);
  expect(s.hp, 'the body is hurt').toBe(hp0 - 100);
  endRun('abandon');
});
test('surgeon: the scalpel line shows first, and the beam hurts only a player in its path', () => {
  const K = BOSS_META.surgeon.tune;
  const sweep = (off: number) => {
    const s = surgeonReady();
    player.x = s.cx + 10;
    player.z = s.cz;
    expect(surgeonAttack(s)).toBe('scalpel');
    const hp0 = player.hp,
      dist = 10;
    // (the line follows the player until just before the beam: the player steps off it once it has stopped)
    for (let k = 0; k < (K.scalpelWarn - K.scalpelLock) * 60 + 3; k++) update(1 / 60);
    expect(s.sweep!.live, 'the beam waits').toBe(false);
    const at = s.sweep!.ac + off;
    player.x = s.cx + Math.cos(at) * dist;
    player.z = s.cz + Math.sin(at) * dist;
    expect(player.hp, 'nothing hurts during the warning').toBe(hp0);
    for (let k = 0; k < 120 && s.atk; k++) update(1 / 60);
    expect(s.atk, 'the sweep is over').toBeNull();
    const lost = hp0 - player.hp,
      dmg = s.dmg * K.scalpelDmg;
    endRun('abandon');
    return { lost, dmg };
  };
  const hit = sweep(0);
  expect(hit.lost, 'in the path').toBeCloseTo(hit.dmg, 6);
  expect(sweep(Math.PI).lost, 'behind the body').toBe(0);
  expect(sweep(K.scalpelArc).lost, 'past the end of the arc').toBe(0);
});
test('surgeon: the clamp slams a ring that fills first, and hurts only a player inside it', () => {
  const K = BOSS_META.surgeon.tune;
  const slam = (stepOut: number) => {
    const s = surgeonReady();
    player.x = s.cx + 8;
    player.z = s.cz + 8;
    s.patIdx = 2;
    expect(surgeonAttack(s)).toBe('clamp');
    const hp0 = player.hp;
    for (let k = 0; k < (K.clampWarn * 60) / 2; k++) update(1 / 60);
    expect(s.clamp!.slammed, 'not yet').toBe(false);
    expect(player.hp, 'nothing falls yet').toBe(hp0);
    player.x += stepOut;
    for (let k = 0; k < 120 && s.atk; k++) update(1 / 60);
    expect(s.atk, 'the clamp is done').toBeNull();
    const lost = hp0 - player.hp,
      dmg = s.dmg * K.clampDmg;
    endRun('abandon');
    return { lost, dmg };
  };
  const hit = slam(0);
  expect(hit.lost, 'standing in the ring').toBeCloseTo(hit.dmg, 6);
  expect(slam(K.clampR + 2).lost, 'outside the ring').toBe(0);
});
test('surgeon: the needles are a fan aimed at the player, seven below half health', () => {
  const K = BOSS_META.surgeon.tune;
  const fan = (share: number) => {
    const s = surgeonReady();
    s.hp = s.maxHp * share;
    s.patIdx = 1;
    expect(surgeonAttack(s)).toBe('needle');
    const alive = () => eBullets.filter(b => b.alive).length;
    for (let k = 0; k < (K.needleWind * 60) / 2; k++) update(1 / 60);
    const early = alive();
    surgeonFinish(s);
    const n = alive();
    endRun('abandon');
    return { early, n };
  };
  expect(fan(1).early, 'not before it takes aim').toBe(0);
  expect(fan(1).n, 'a fan').toBe(K.needleN);
  expect(fan(0.4).n, 'a wider one').toBe(K.needleNEnr);
});
test('surgeon: with no arm left the body fires a ring', () => {
  const K = BOSS_META.surgeon.tune,
    s = surgeonReady();
  for (const kind of ['scalpel', 'needle', 'clamp']) surgeonShoot(s, kind);
  expect(
    s.arms.every(a => !a.foe),
    'no arm',
  ).toBe(true);
  clearPool(eBullets);
  expect(surgeonAttack(s), 'no arm to attack').toBe('');
  expect(eBullets.filter(b => b.alive).length, 'a ring of bullets').toBe(K.ringN);
  endRun('abandon');
});
test('surgeon: below half health the arms grow back once and two repair drones come, up to the cap', () => {
  const K = BOSS_META.surgeon.tune;
  const second = (others: number) => {
    const s = surgeonReady(),
      medics = () => enemies.filter(o => !o.boss && !o.dead && o.type === 'medic').length;
    for (let k = 0; k < others; k++) spawnMinion('crawler', s.cx - 10 - k, s.cz + 10);
    surgeonShoot(s, 'scalpel');
    surgeonShoot(s, 'clamp');
    s.hp = s.maxHp * 0.4;
    const before = medics();
    update(1 / 60);
    const out = { medics: medics() - before, arms: s.arms.filter(a => a.foe).length, second: s.second };
    // the arms are not shot off a second time: they do not grow back again
    surgeonShoot(s, 'scalpel');
    for (let k = 0; k < 10; k++) update(1 / 60);
    const again = s.arms.filter(a => a.foe).length;
    endRun('abandon');
    return { ...out, again };
  };
  const first = second(0);
  expect(first.second).toBe(true);
  expect(first.arms, 'all three are back').toBe(3);
  expect(first.medics, 'two drones').toBe(K.medics);
  expect(first.again, 'only once').toBe(2);
  expect(second(K.minionCap - 1).medics, 'room for one').toBe(1);
  expect(second(K.minionCap).medics, 'at the cap').toBe(0);
});
test('boss entrance and phase change: invulnerable while appearing and in the burst', () => {
  startPractice('trinity');
  tick(3);
  if (!boss) spawnBoss('trinity');
  const hp0 = boss!.hp;
  hurtEnemy(boss!, 100, false);
  if (boss!.hp !== hp0) throw new Error('hurt during intro');
  tick(Math.ceil(BOSS_TUNE.introTime * 60) + 5);
  hurtEnemy(boss!, boss!.maxHp * 0.6, false);
  if (!boss!.phase || !(boss!.spawnT > 0)) throw new Error('phase change');
  const hp1 = boss!.hp;
  hurtEnemy(boss!, 100, false);
  if (boss!.hp !== hp1) throw new Error('hurt during phase change');
  endRun('abandon');
});
test('boss entrance: every boss appears where it starts to move (no jump once it acts)', () => {
  BOSS_ORDER.forEach(kind => {
    startPractice(kind);
    tick(3);
    if (!boss) spawnBoss(kind);
    const b = boss!;
    expect(b.intro, kind).toBe(true);
    tick(2);
    const a = b.mesh.position.clone();
    while (b.spawnT > 0) tick(1);
    tick(1);
    const moved = Math.hypot(b.mesh.position.x - a.x, b.mesh.position.z - a.z);
    expect(moved, `${kind}: from where it appeared to where it first acts (m)`).toBeLessThan(0.5);
    endRun('abandon');
  });
});
test('run kind: a dive is a dive, a boss practice is a practice', () => {
  startPractice('crusher', 0);
  expect(run.kind, 'practice').toBe('practice');
  endRun('abandon');
  goBase();
  startRun();
  expect(run.kind, 'dive').toBe('dive');
  endRun('abandon');
});
test('boss practice: fight, win, go home; the save does not change', () => {
  const before = JSON.stringify(save);
  BOSS_ORDER.forEach(kind => {
    startPractice(kind);
    tick(120);
    if (!boss) spawnBoss(kind);
    boss!.spawnT = 0;
    if (boss!.name.indexOf(BOSS_META[kind]!.name.split(' ')[0]) !== 0)
      throw new Error('wrong boss ' + kind + ' ' + boss!.name);
    if (boss!.invuln) {
      enemies.filter(e => !e.boss).forEach(e => hurtEnemy(e, 1e6, false));
      tick(20);
    }
    spawnWave(boss!.x, boss!.z, 11, 18, 10, COLOR.orange); // a shockwave still spreading when the boss falls
    hurtEnemy(boss!, boss!.hp + 1, false);
    if (query('wave').length) throw new Error('shockwave outlived the boss ' + kind);
    tick(30);
    if (level.portals.length !== 1 || level.portals[0].kind !== 'extract') throw new Error('practice portal ' + kind);
    endRun('extract');
  });
  const after = JSON.stringify(save);
  if (before !== after) throw new Error('practice changed the save');
});
test('boss hints: shown when the boss is met for the first time, and in practice', () => {
  const shown = () => el('#toast').textContent === t('boss.crusherHint');
  goBase();
  startRun();
  tick(5);
  delete save.bossSeen.crusher;
  el('#toast').textContent = '';
  spawnBoss('crusher');
  expect(shown(), 'the first time').toBe(true);
  endRun('abandon');
  goBase();
  startRun();
  tick(5);
  el('#toast').textContent = '';
  spawnBoss('crusher');
  expect(shown(), 'met before').toBe(false);
  endRun('abandon');
  goBase();
  startPractice('crusher');
  tick(120);
  if (!boss) {
    el('#toast').textContent = '';
    spawnBoss('crusher');
  }
  expect(shown(), 'in practice').toBe(true);
  endRun('abandon');
});
