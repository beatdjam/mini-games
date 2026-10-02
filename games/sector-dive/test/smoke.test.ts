// Smoke test for Sector Dive: boots the game page (setup.ts) and runs its parts through the real loop by hand.
// The tests share one game state and run in order; some checks depend on how many random numbers the earlier ones used.
import { beforeAll, describe, expect, test } from 'vitest';
import type { GameState, Pickup, RunState, Snapshot } from '../src/data/types.ts';
import { createRng, el, rand } from '@engine/core/util.ts';
import { clearWorld, query } from '@engine/core/world.ts';
import { lang, t } from '@engine/core/i18n.ts';
import { SFX, actx, audioInit } from '@engine/audio/audio.ts';
import {
  MUSIC_STYLES,
  musicState,
  musicInit,
  musicVolume,
  playStep,
  setMusic,
  setMusicMix,
} from '@engine/audio/music.ts';
import { V3, camera, scene } from '@engine/render/render.ts';
import {
  H,
  STEP,
  T,
  W,
  blocked,
  cover,
  floorY,
  grid,
  hgt,
  isSolid,
  moveCircle,
  passable,
  ramp,
  tileIndex,
  walkable,
} from '@engine/world/tiles.ts';
import { joy, setFireHeld } from '@engine/ui/input.ts';
import { applyLayout, buttonLayout, openLayoutEditor } from '@engine/ui/touchlayout.ts';
import { MOD_PLUS_MAX, SPLIT_FAN, SPLIT_MAX, WEAPONS, WEAPON_ORDER, modPlusCost } from '../src/data/weapons.ts';
import { EYE, PLAT_H } from '../src/data/level.ts';
import { ELITE_TYPES, ENEMY_TUNE } from '../src/data/enemies.ts';
import { BOSS_META, BOSS_ORDER, BOSS_TUNE } from '../src/data/bosses.ts';
import { BIOMES } from '../src/data/biomes.ts';
import { DEPTH_HP_GROWTH, DEPTH_HP_LATE, KIT_MAX, PER, REBOOT_ENDLESS, REBOOT_UP, TUNE } from '../src/data/progress.ts';
import { PERKS } from '../src/data/perks.ts';
import { basicW, exportSave, importSave, importSaveCheck, persist, save } from '../src/core/save.ts';
import {
  weaponModOf,
  modPlusCap,
  perkName,
  pickDrop,
  REBOOT_DIFF_CAP,
  rebootCost,
  rebootMul,
  rebootMulOf,
  progressOf,
  readiness,
  readinessScore,
  readyAfterReboot,
} from '../src/core/rules.ts';
import { buildFixedLevel, buildLevel, level, roomSpot } from '../src/world/level.ts';
import { hazardState } from '../src/world/hazards.ts';
import { generateLevel } from '../src/world/levelGen.ts';
import type { GeneratedLevel } from '../src/world/levelGen.ts';
import { makePortal } from '../src/world/portals.ts';
import {
  addPickup,
  boss,
  enemies,
  isShielded,
  nearPickup,
  pBullets,
  removeEnemyMesh,
  setBoss,
  spawnEnemy,
  spawnPBullet,
  spawnWave,
} from '../src/world/entities.ts';
import {
  player,
  critChance,
  damagePlayer,
  difficultyAt,
  damageScaleAt,
  explode,
  findTarget,
  fire,
  kitHealAmount,
  rollWeapon,
  shotId,
  stageInfo,
  hurtEnemy,
  magSize,
  newPlayer,
  newWeapon,
  run,
  setPlayer,
  setRun,
  stageLabel,
  weaponStats,
} from '../src/actors/player.ts';
import { bossDifficulty, spawnBoss } from '../src/actors/bosses/common.ts';
import { equipNearby, stowNearby } from '../src/ui/input.ts';
import { changeLang, hitDirs } from '../src/ui/hud.ts';
import { endRun, goBase, nextStage, pickEnemyType, startPractice, startRun, startStage } from '../src/flow/run.ts';
import { setState, show, state } from '../src/flow/state.ts';
import { discardSuspended, resumeRun, suspendRun } from '../src/flow/suspend.ts';
import { openPerk } from '../src/screens/perk.ts';
import { pause, statsHTML } from '../src/screens/pause.ts';
import { renderBase, showTab, weaponStatText } from '../src/screens/base.ts';
import { shareData, shareText } from '../src/ui/share.ts';
import { updatePBullets } from '../src/actors/bullets.ts';
import { update, updatePickups } from '../src/flow/update.ts';
import { TRACK_LOG } from '@engine/core/analytics.ts';
import { FEEDBACK_FORM } from '@engine/core/feedback.ts';
import { COLOR } from '../src/data/colors.ts';

const stateIs = (s: GameState) => state === s; // a call, so TypeScript does not keep the narrowing of an earlier state check
const tick = (n: number) => {
  for (let k = 0; k < n; k++) {
    if (state !== 'play') {
      show(null);
      setState('play');
    }
    player.hp = player.maxHp;
    player.inv = 1;
    update(1 / 60);
  }
};

beforeAll(async () => {
  await import('../src/main.ts');
  await new Promise(r => setTimeout(r, 300)); // the start-up timers
  startRun();
  setFireHeld(true);
});

// run every sector (floor + each boss candidate) once
BIOMES.forEach((b, bi) => {
  test(`floor ${b.code}`, () => {
    run.route = [bi];
    run.stage = bi * PER + 1;
    startStage();
    tick(120);
    const n0 = enemies.length;
    // walk the player through the level to exercise movement over ramps/decks
    for (let k = 0; k < 120; k++) {
      joy.y = -1;
      player.yaw += 0.05;
      tick(1);
    }
    joy.y = 0;
    enemies.slice().forEach(e => hurtEnemy(e, 1e6, false));
    tick(30);
    console.log(
      'floor',
      b.code,
      'enemies',
      n0,
      'fy',
      player.fy.toFixed(2),
      'raised',
      hgt.filter(h => h > 0).length,
      'ramps',
      ramp.filter(r => r >= 0).length,
      'haz',
      level.hazardTiles.filter(Boolean).length,
    );
  });
  b.bosses.forEach(kind => {
    test(`boss ${b.code} ${kind}`, () => {
      run.stage = bi * PER + PER - 1;
      startStage();
      setBoss(null);
      enemies.slice().forEach(e => {
        e.dead = true;
        removeEnemyMesh(e);
      });
      clearWorld('enemy');
      spawnBoss(kind);
      boss!.spawnT = 0;
      tick(400);
      if (boss && boss.invuln) {
        enemies.filter(e => !e.boss).forEach(e => hurtEnemy(e, 1e6, false));
        tick(20);
      }
      const had = !!boss;
      if (boss) hurtEnemy(boss, boss.hp + 1, false);
      tick(60);
      expect(had, 'boss spawned').toBe(true);
    });
  });
});

test('ledge: stepping off a raised deck leaves nothing stuck or half inside', () => {
  // a ramp, a 3x3 deck and open floor beside it
  const rows = ['##########', '#>===....#', '#>===....#', '#>===....#', '##########'];
  run.route = [5];
  run.stage = 26;
  buildFixedLevel(BIOMES[5], { rows, rooms: [{ x: 1, y: 1, w: 8, h: 3 }], start: 0, exit: 0 });
  let tested = 0,
    stuck = 0,
    inside = 0;
  for (let k = 0; k < W * H; k++) {
    const i = k % W,
      j = (k / W) | 0;
    if (i > W - 4 || grid[k] !== 1 || hgt[k] !== PLAT_H || ramp[k] >= 0 || cover[k]) continue;
    if (!walkable(k + 1) || hgt[k + 1] !== 0 || !walkable(k + 2) || hgt[k + 2] !== 0) continue;
    for (const who of ['player', 'enemy']) {
      const o: { x: number; z: number; fy: number; vy?: number; r?: number } =
        who === 'player' ? player : spawnEnemy('crawler', 0, 0, -1, 1);
      o.x = (i + 1) * T - 0.2;
      o.z = (j + 0.5) * T;
      o.fy = PLAT_H;
      o.vy = 0;
      for (let t = 0; t < 60; t++) {
        moveCircle(o, 0.15, 0, o.r || player.r);
        const g2 = floorY(o.x, o.z);
        o.fy = who === 'player' ? Math.max(g2, o.fy - 0.2) : g2;
      }
      const x0 = o.x;
      moveCircle(o, 0.3, 0, o.r || player.r);
      tested++;
      if (o.x <= x0 && !blocked(x0 + 0.3, o.z, o.r || player.r)) stuck++;
      if (floorY(o.x - (o.r || player.r) + 0.02, o.z) > o.fy + STEP) inside++;
    }
  }
  if (tested !== 6) throw new Error('ledge: expected 6 cases, ran ' + tested);
  if (stuck || inside) throw new Error('ledge check failed');
});
test('progress: depth start = depth*5, boss = depth*5+4 regardless of PER', () => {
  startRun();
  tick(5);
  if (
    progressOf(0) !== 0 ||
    progressOf(PER - 1) !== 4 ||
    progressOf(PER) !== 5 ||
    stageLabel(PER - 1) !== 'D1 BOSS' ||
    stageLabel(PER) !== 'D2 1/' + (PER - 1)
  )
    throw new Error('prog/label ' + [progressOf(PER - 1), progressOf(PER), stageLabel(PER - 1), stageLabel(PER)]);
});
test('shield: front wears the shield, back hurts, then it breaks', () => {
  run.route = [3];
  run.stage = PER * 3 + 1;
  startStage();
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  const [sx, sz] = roomSpot(level.rooms[level.startIdx]);
  const e = spawnEnemy('shield', sx, sz, -1, 1);
  if (!isShielded(e)) throw new Error('shield fields');
  e.face = 0;
  e.mesh.rotation.y = 0; // facing +z
  const shoot = (dir: number) => {
    spawnPBullet(new V3(sx, e.fy! + 1.6, sz + dir * 2.5), new V3(0, 0, -dir), 60, 20, 0, 0, 0xffffff, 0, {});
    updatePBullets(0.1);
  }; // above rubble height
  const hp0 = e.hp,
    sh0 = e.shieldHp;
  shoot(1); // from the front
  if (!(e.shieldHp < sh0 && e.hp === hp0)) throw new Error('shield front ' + [e.shieldHp, sh0, e.hp, hp0]);
  shoot(-1); // from behind
  if (!(e.hp < hp0)) throw new Error('shield back');
  for (let k = 0; k < 20 && e.shieldHp > 0; k++) shoot(1);
  if (e.shieldHp > 0 || e.stun <= 0) throw new Error('shield break');
  const hp1 = e.hp;
  shoot(1);
  if (!(e.hp < hp1)) throw new Error('after break');
  removeEnemyMesh(e);
  clearWorld('enemy');
});
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
test('watcher: drones at 75% and 40%', () => {
  startPractice('watcher');
  tick(10);
  if (!boss) spawnBoss('watcher');
  boss!.spawnT = 0;
  boss!.phased = true;
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
  if (
    Math.abs(b1 - 1.33 * BOSS_TUNE.hpMul * rebootMul()) > 1e-9 ||
    Math.abs(b3 / b1 - BOSS_TUNE.growth * BOSS_TUNE.growth) > 1e-6
  )
    throw new Error('boss scaling ' + b1 + ' ' + b3);
  if (Math.abs(difficultyAt(0) - ENEMY_TUNE.hpMul * rebootMul()) > 1e-9)
    throw new Error('enemy hp base ' + difficultyAt(0));
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
  if (Math.abs(damageScaleAt(0) - rebootMul()) > 1e-9 || !(damageScaleAt(13 * PER) > 3 * rebootMul()))
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
test('chain blast: one kill in a tight cluster does not cascade', () => {
  startRun();
  tick(3);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  player.chain = 3;
  player.dmgMul = 10; // blasts strong enough to kill anything they touch
  const [cx, cz] = roomSpot(level.rooms[level.startIdx]);
  const line = [0, 2.8, 5.6, 8.4].map(dx => spawnEnemy('crawler', cx + dx, cz, -1, 1)); // each 2.8m apart, blast radius 4
  hurtEnemy(line[0], 1e6, false);
  const alive = line.filter(e => !e.dead).length;
  if (alive !== 2) throw new Error('chain cascade: alive ' + alive);
  endRun('abandon');
});
test('shortcut supply: 2 picks at DEPTH 3, chips applied supplyTimes times', () => {
  const keep = [save.shortcut, save.startTier, save.up.chip];
  save.shortcut = 2;
  save.startTier = 2;
  save.up.chip = 0;
  goBase();
  startRun();
  tick(3);
  const pick = (id: string) => {
    const cards = [...document.querySelectorAll<HTMLElement>('#perkList .perk')];
    const c = cards.find(b => b.querySelector('.pn')!.textContent!.includes(perkName(id))) || cards[0]!;
    c.click();
  };
  if (!document.querySelector('#perkList .pn')!.textContent!.includes('×' + TUNE.supplyTimes))
    throw new Error('supply card label');
  pick('overload');
  pick('overload');
  [save.shortcut, save.startTier, save.up.chip] = keep;
  // a capped chip (pierce, crit, reload, magazine) stops once maxed, after 3-4 of the supplyTimes
  if (run.perks.length < 6 || run.perks.length > 2 * TUNE.supplyTimes)
    throw new Error('supply picks ' + run.perks.length);
  // the heal chip is never a supply pick; stamina regen and pickup range add up per chip instead of multiplying
  for (let k = 0; k < 40; k++) {
    openPerk('test', 'loadout', undefined, TUNE.supplyTimes);
    if ([...document.querySelectorAll('#perkList .pn')].some(n => n.textContent!.includes(perkName('repair'))))
      throw new Error('repair offered as supply');
  }
  show(null);
  setState('play');
  {
    const keep = player;
    setPlayer(newPlayer(save.loadout));
    const r0 = player.stRegen,
      sp = PERKS.find(x => x.id === 'sprint')!,
      mg = PERKS.find(x => x.id === 'magnet')!;
    for (let k = 0; k < 5; k++) {
      sp.apply(player, sp.v);
      mg.apply(player, mg.v);
    }
    const regen = player.stRegen - r0,
      range = player.magnet;
    setPlayer(keep);
    if (Math.abs(regen - 5 * sp.v * TUNE.staminaRegen) > 1e-9 || Math.abs(range - 5) > 1e-9)
      throw new Error('additive chips ' + regen + ' ' + range);
  }
  // deep drops: rarer on the whole, but not all ★★★
  {
    const rs = Array.from({ length: 400 }, () => rollWeapon(100).r),
      top = rs.filter(r => r === 2).length / rs.length;
    if (!(top > 0.4 && top < 0.7) || !rs.includes(0)) throw new Error('deep rarity ' + top);
  }
  endRun('abandon');
  goBase();
});
test('rare chips show up gold; deep sectors favour tougher enemy types', () => {
  startRun();
  tick(3);
  const keep = TUNE.rareChipChance;
  TUNE.rareChipChance = 1;
  openPerk('test');
  const rareCards = document.querySelectorAll('#perkList .perk.rare').length;
  TUNE.rareChipChance = keep;
  player.hp = 1; // so a healing chip also visibly changes something
  const before = JSON.stringify(player);
  document.querySelector<HTMLElement>('#perkList .perk.rare')!.click();
  if (!rareCards || JSON.stringify(player) === before || !run.perks[run.perks.length - 1].endsWith('+'))
    throw new Error('rare chip');
  player.crit = TUNE.critCap;
  player.reloadMul = 0.4;
  player.magMul = 2.5;
  player.pierce = 3;
  for (let k = 0; k < 30; k++) {
    openPerk('test');
    const names = [...document.querySelectorAll('#perkList .pn')].map(n => n.textContent),
      maxedNames = ['crit', 'reload', 'mag', 'pierce'].map(id => perkName(id));
    if (names.some(n => maxedNames.some(m => n.replace(/^★ /, '').replace(/\+$/, '') === m)))
      throw new Error('maxed chip offered ' + names);
  }
  show(null);
  setState('play');
  let elite = 0;
  for (let k = 0; k < 400; k++) if (ELITE_TYPES.includes(pickEnemyType(BIOMES[3], 10))) elite++;
  let elite0 = 0;
  for (let k = 0; k < 400; k++) if (ELITE_TYPES.includes(pickEnemyType(BIOMES[3], 0))) elite0++;
  if (!(elite > elite0)) throw new Error('elite bias ' + elite0 + ' ' + elite);
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
  if (magSize(newWeapon('launcher', 0)) > 4 || magSize(newWeapon('smg', 0)) < 110)
    throw new Error('mag chips ' + magSize(newWeapon('launcher', 0)));
  endRun('abandon');
});
test('every type drops regardless of unlocks; modded basic weapons start modded', () => {
  const keepU = save.unlocked,
    keepM = save.mods,
    keepL = save.loadout;
  save.unlocked = { pistol: true };
  const ids = new Set();
  for (let k = 0; k < 400; k++) ids.add(pickDrop());
  if (ids.size !== WEAPON_ORDER.length) throw new Error('drop pool should have every type: ' + [...ids]);
  save.mods = { rail: { plus: 3, r: 2 } };
  save.loadout = [basicW('rail'), null];
  startRun();
  tick(2);
  const w = player.weapons[0]!;
  if (w.id !== 'rail' || w.plus !== 3 || w.r !== 2 || !w.basic) throw new Error('modded basic ' + JSON.stringify(w));
  endRun('abandon');
  save.unlocked = keepU;
  save.mods = keepM;
  save.loadout = keepL;
  persist();
});
test('mod + cap follows the deepest depth; past +10 each level costs x1.2', () => {
  const keepS = [save.shortcut, save.peak, save.bits],
    keepMods = save.mods;
  save.shortcut = 0;
  save.peak = 0;
  const c0 = modPlusCap();
  save.shortcut = 13;
  save.peak = 13;
  const c1 = modPlusCap();
  save.shortcut = 12;
  const c2 = modPlusCap(); // died once: the shortcut closed a step, the cap stays
  if (c0 !== MOD_PLUS_MAX || c1 !== 21 || c2 !== 21) throw new Error('mod cap ' + [c0, c1, c2]);
  if (
    Math.abs(modPlusCost(11) / modPlusCost(10) - 1.2) > 0.01 ||
    Math.abs(modPlusCost(10) / modPlusCost(9) - 1.5) > 0.01
  )
    throw new Error('mod cost');
  save.mods = { pistol: { plus: 10, r: 0 } };
  save.bits = 1e7;
  goBase();
  showTab('sortie');
  renderBase();
  document.querySelector<HTMLButtonElement>('[data-modplus="pistol"]')!.click();
  const raised = weaponModOf('pistol').plus;
  save.peak = 0;
  save.shortcut = 0;
  renderBase();
  const capped = !document.querySelector('[data-modplus="pistol"]');
  [save.shortcut, save.peak, save.bits] = keepS;
  save.mods = keepMods;
  renderBase();
  persist();
  if (raised !== 11 || !capped) throw new Error('mod past +10 ' + raised + ' ' + capped);
});
test('splitter killed by a chain blast or a rocket: both halves survive', () => {
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
  const cx = (W * T) / 2,
    cz = (H * T) / 2;
  player.chain = 3;
  player.dmgMul = 10;
  let s = spawnEnemy('splitter', cx, cz, -1, 1);
  hurtEnemy(s, 1e6, false);
  const a1 = enemies.filter(e => !e.dead && !e.boss && e.type === 'mini').length;
  player.chain = 0;
  s = spawnEnemy('splitter', cx + 10, cz, -1, 1);
  explode(s.x, 1, s.z, 5, 1e6, COLOR.fire, true);
  const a2 = enemies.filter(e => !e.dead && !e.boss && e.type === 'mini').length;
  if (a1 !== 2 || a2 !== 4) throw new Error('splitter halves ' + a1 + ' ' + a2);
  endRun('abandon');
});
test('music: every style and its boss arrangement can be scheduled', () => {
  audioInit();
  musicInit();
  if (!musicState.bus) throw new Error('music bus');
  Object.keys(MUSIC_STYLES).forEach(name => {
    [false, true].forEach(boss => {
      if (boss && name === 'BASE') return;
      setMusic(name, boss);
      if (!musicState.st || musicState.name !== name + (boss ? ':boss' : '')) throw new Error('setMusic ' + name);
      for (let k = 0; k < 64; k++) playStep(musicState.st, k, actx!.currentTime + k * 0.01, 0.1);
    });
  });
  setMusicMix('combat');
  setMusicMix('explore');
  musicVolume(0.4);
  musicVolume(1);
  Object.keys(SFX).forEach(k => SFX[k]()); // every effect builds its node graph without errors
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
  if (!boss!.phased || !(boss!.spawnT > 0)) throw new Error('phase change');
  const hp1 = boss!.hp;
  hurtEnemy(boss!, 100, false);
  if (boss!.hp !== hp1) throw new Error('hurt during phase change');
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
test('checkpoint: saved at stage start, deleted when the run ends', () => {
  startRun();
  tick(5);
  show(null);
  setState('play');
  if (!save.suspend || save.suspend.run.stage !== run.stage) throw new Error('checkpoint at stage start');
  const bits0 = save.suspend.run.bits;
  run.bits += 999;
  if (save.suspend.run.bits !== bits0) throw new Error('checkpoint changed mid-stage');
  nextStage();
  if (save.suspend.run.stage !== run.stage) throw new Error('checkpoint on next stage');
  endRun('dead');
  if (save.suspend) throw new Error('checkpoint survived the end of the run');
  goBase();
  startRun();
  tick(5); // leave a run going for the next check
});
test('feedback: hidden without a form; with one, the result screen opens it filled in', () => {
  const keepForm = { ...FEEDBACK_FORM },
    keepOpen = window.open,
    opened: string[] = [];
  window.open = ((u: string) => {
    opened.push(u);
    return null;
  }) as typeof window.open;
  try {
    FEEDBACK_FORM.url = '';
    goBase();
    if (!el('#btnFeedbackBase').hidden) throw new Error('feedback shown without a form');
    Object.assign(FEEDBACK_FORM, {
      url: 'https://docs.google.com/forms/d/e/test/viewform',
      game: '1',
      build: '2',
      info: '3',
    });
    startRun();
    tick(5);
    run.perks = ['split', 'split', 'rapid+'];
    endRun('extract');
    if (el('#btnFeedbackRes').hidden) throw new Error('feedback button on the result screen');
    el('#btnFeedbackRes').click();
    const info = new URL(opened[0]!).searchParams.get('entry.3') || '';
    if (
      !info.includes('result=extract') ||
      !info.includes('splitx2') ||
      !info.includes('rapid+') ||
      new URL(opened[0]!).searchParams.get('entry.1') !== 'sector-dive'
    )
      throw new Error('feedback info ' + info);
    goBase();
    if (el('#btnFeedbackBase').hidden) throw new Error('feedback link on the base screen');
    el('#btnFeedbackBase').click();
    if (!(new URL(opened[1]!).searchParams.get('entry.3') || '').startsWith('from=base'))
      throw new Error('feedback base info');
  } finally {
    Object.assign(FEEDBACK_FORM, keepForm);
    window.open = keepOpen;
  }
  goBase();
  startRun();
  tick(5);
});
test('result chips: counted, most first, order folded underneath', () => {
  goBase();
  startRun();
  tick(5);
  run.perks = ['rapid', 'split', 'split+', 'split', 'overload+'];
  endRun('extract');
  const want = t('res.chips', {
    n: 5,
    list: [
      t('common.countRare', { name: perkName('split'), n: 3, r: 1 }),
      perkName('rapid'),
      perkName('overload+'),
    ].join(t('common.sep')),
  });
  if (el('#resChips').textContent !== want) throw new Error('result chips ' + el('#resChips').textContent);
  if (
    el('#resOrder').hidden ||
    el<HTMLDetailsElement>('#resOrder').open ||
    el('#resOrderList').textContent !== run.perks.map(perkName).join(t('common.sep'))
  )
    throw new Error('result chip order');
  goBase();
  startPractice('crusher', 0);
  tick(5);
  endRun('abandon');
  if (!el('#resOrder').hidden) throw new Error('chip order after practice');
  goBase();
  startRun();
  tick(5);
});
test('current stats: rarity damage, real magazine, chips counted', () => {
  const keep = player.weapons[player.cur];
  player.weapons[player.cur] = newWeapon('launcher', 2);
  player.magMul = 2.5;
  run.perks = ['mag', 'mag', 'mag+'];
  const rows = new Map(
    [...new DOMParser().parseFromString(statsHTML(), 'text/html').querySelectorAll('.reslist div')].map(d => [
      d.querySelector('dt')!.textContent,
      d.querySelector('dd')!.textContent,
    ]),
  );
  const pc = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  const dmg = rows.get(t('stats.dmg')),
    mag = rows.get(t('stats.mag')),
    html = statsHTML();
  player.weapons[player.cur] = keep;
  player.magMul = 1;
  if (
    dmg !== pc(player.dmgMul * 1.55 - 1) ||
    mag !== pc(4 / 2 - 1) /* 2 rounds x (1 + 1.5 x 0.5) = 3.5 -> 4, not +150% */ ||
    !html.includes(t('common.countRare', { name: perkName('mag'), n: 3, r: 1 }))
  )
    throw new Error('stats ' + [dmg, mag]);
});
test('share: shown after a real run, hidden after practice; text fits X', () => {
  goBase();
  startRun();
  tick(5);
  run.bosses = ['watcher'];
  run.perks = ['overload', 'overload', 'rapid+'];
  endRun('extract');
  if (
    el('#btnShare').hidden ||
    !shareData ||
    shareData.bosses[0] !== BOSS_META.watcher.short ||
    shareData.chips[0] !== t('common.count', { name: perkName('overload'), n: 2 })
  )
    throw new Error('share data');
  if (!shareText(shareData).includes('#SectorDive') || !shareText(shareData).includes(BOSS_META.watcher.short))
    throw new Error('share text');
  el('#btnShare').click();
  if (el('#sharePanel').hidden) throw new Error('share panel on PC');
  goBase();
  startPractice('crusher', 0);
  tick(5);
  endRun('abandon');
  if (!el('#btnShare').hidden) throw new Error('share shown after practice');
  // a deep run beats many bosses: the post counts them per kind and stays within X's 280 (CJK counts 2, the URL 23)
  const xLen = (s: string) => {
    const [body, url] = [s.slice(0, s.lastIndexOf('\n')), s.slice(s.lastIndexOf('\n') + 1)];
    return [...body].reduce((n, c) => n + (c.charCodeAt(0) > 0x10ff ? 2 : 1), 0) + 1 + (url ? 23 : 0);
  };
  const many = {
    ...shareData!,
    bosses: Array.from({ length: 30 }, (_, i) => BOSS_META[BOSS_ORDER[i % BOSS_ORDER.length]!]!.short),
  };
  const keepLang = lang,
    lens: number[] = [];
  for (const code of ['ja', 'en']) {
    changeLang(code);
    const s = shareText({
      ...many,
      bosses: many.bosses.map((_, i) => BOSS_META[BOSS_ORDER[i % BOSS_ORDER.length]!]!.short),
    });
    lens.push(xLen(s));
    if (!s.includes('30')) throw new Error('boss count missing ' + s);
  }
  changeLang(keepLang);
  if (lens.some(n => n > 280)) throw new Error('share text too long ' + lens);
  goBase();
  startRun();
  tick(5);
  // switching the language from the pause screen rewrites the stats panel and the stage label
  {
    const other = lang === 'ja' ? 'en' : 'ja';
    pause();
    changeLang(other);
    const ok =
      el('#pauseChips').innerHTML.includes(t('stats.title')) &&
      el('#stageLbl').textContent!.includes(stageInfo(run.stage).biome.name);
    changeLang(keepLang);
    show(null);
    setState('play');
    if (!ok) throw new Error('pause screen kept the old language');
  }
});
test('analytics: the flow above sent its events', () => {
  if (TRACK_LOG.some(e => e.params.game !== 'sector-dive')) throw new Error('analytics: game id missing');
  const ev = TRACK_LOG.map(e => e.name + ':' + (e.params.result ?? e.params.method ?? ''));
  for (const want of [
    'dive_start:',
    'level_start:',
    'level_end:extract',
    'level_end:dead',
    'share:panel',
    'practice_start:',
    'practice_end:abandon',
  ])
    if (!ev.includes(want)) throw new Error('analytics event ' + want + ' / ' + ev.slice(-12).join(' '));
  if (
    TRACK_LOG.some(
      e =>
        (e.name === 'level_start' || e.name === 'level_end') &&
        e.params.stage_role !== 'normal' &&
        e.params.stage_role !== 'boss',
    )
  )
    throw new Error('analytics: stage_role');
});
test('suspend -> resume -> suspend -> discard', () => {
  run.route = [0];
  run.stage = 2;
  startStage();
  tick(30);
  suspendRun();
  if (!save.suspend || state !== 'base') throw new Error('suspend failed');
  resumeRun();
  tick(60);
  if (run.stage !== 2 || (save.suspend as Snapshot | null)?.run.stage !== 2) throw new Error('resume failed');
  suspendRun();
  discardSuspended();
  if (save.suspend || !stateIs('result')) throw new Error('discard failed');
});
test('wipe: data wipe resets the save', () => {
  goBase();
  save.bits = 999;
  save.up.hp = 3;
  el('#btnWipe').click();
  el('#btnWipeGo').click();
  if (save.bits !== 0 || save.up.hp !== 0 || !el('#dlgWipe').hidden) throw new Error('wipe failed');
});
test('hit direction: a hit from behind shows the arc, one from in front does not', () => {
  goBase();
  startRun();
  tick(5);
  player.yaw = 0;
  player.hp = 1e6;
  player.maxHp = 1e6;
  hitDirs.forEach(d => {
    d.t = 0;
  });
  player.inv = 0;
  damagePlayer(1, { x: player.x, z: player.z - 8 });
  if (hitDirs.some(d => d.t > 0)) throw new Error('hit arc shown for a hit from the front');
  player.inv = 0;
  damagePlayer(1, { x: player.x + 3, z: player.z + 8 });
  if (!hitDirs.some(d => d.t > 0)) throw new Error('no hit arc for a hit from behind');
  goBase();
});
test('gates: one opening underfoot waits until the player steps off and back', () => {
  goBase();
  startRun();
  tick(5);
  const st = run.stage;
  makePortal(player.x, player.z, 0xffffff, 'next', '');
  tick(30);
  if (run.stage !== st) throw new Error('gate took the player right away');
  tick(60);
  if (run.stage !== st) throw new Error('gate took the player without stepping off');
  player.x += 3;
  tick(2);
  player.x -= 3;
  tick(2);
  if (run.stage !== st + 1) throw new Error('gate did not work after stepping off and back');
  goBase();
});
test('save codes: round trip, a bad code is refused', () => {
  save.bits = 777;
  save.up.dmg = 2;
  persist();
  const code = exportSave();
  save.bits = 1;
  save.up.dmg = 0;
  persist();
  if (importSaveCheck(code.slice(0, -1) + (code.endsWith('0') ? '1' : '0')) || importSave('SD1:abc.00000000'))
    throw new Error('bad save code accepted');
  if (!importSave(code) || save.bits !== 777 || save.up.dmg !== 2) throw new Error('save code round trip');
  el('#btnExport').click();
  if (el('#savePanel').hidden || !el<HTMLTextAreaElement>('#saveCode').value.startsWith('SD1:'))
    throw new Error('export panel');
  el('#btnExport').click();
  if (!el('#savePanel').hidden) throw new Error('export panel toggle');
  el('#btnWipe').click();
  el('#btnWipeGo').click();
});
test('readiness: fair at DEPTH 1, harder deeper; upgrades and mods make it easier', () => {
  const fresh = [0, 1, 2, 4].map(n => readiness(n));
  if (fresh[0] !== 2 || fresh.some((r, i) => i && r < fresh[i - 1]!)) throw new Error('readiness fresh ' + fresh);
  const s0 = readinessScore(2);
  save.up.dmg = 6;
  save.up.hp = 6;
  save.mods = { rail: { plus: 10, r: 2 } };
  save.loadout = [basicW('rail'), null];
  const s1 = readinessScore(2);
  if (!(s1 > s0)) throw new Error('readiness upgrades ' + s0 + ' ' + s1);
  // reboot difficulty stops growing at REBOOT_DIFF_CAP reboots; the rating after the next reboot is worse than now
  if (rebootMulOf(REBOOT_DIFF_CAP + 5) !== rebootMulOf(REBOOT_DIFF_CAP) || !(rebootMulOf(1) > rebootMulOf(0)))
    throw new Error('reboot cap');
  if (!(readinessScore(0, readyAfterReboot()) < readinessScore(0))) throw new Error('readiness after reboot');
});
test('reboot bonuses: uncapped, cost climbs, reach the player and the readiness', () => {
  const dmgU = REBOOT_UP.find(u => u.id === 'dmg')!,
    keepUp = { ...save.pres.up };
  if ([0, 1, 4].map(l => rebootCost(dmgU, l)).join() !== '1,2,5' || isFinite(dmgU.max))
    throw new Error('reboot bonus cost');
  const s0 = readinessScore(5),
    p0 = newPlayer(save.loadout);
  save.pres.up.dmg = 4;
  save.pres.up.vit = 2;
  const p1 = newPlayer(save.loadout),
    s1 = readinessScore(5);
  Object.assign(save.pres.up, keepUp);
  if (
    Math.abs(p1.dmgMul - p0.dmgMul - 4 * REBOOT_ENDLESS.dmg) > 1e-9 ||
    p1.maxHp !== Math.round(p0.maxHp * (1 + 2 * REBOOT_ENDLESS.vit)) ||
    !(s1 > s0)
  )
    throw new Error('reboot bonus effect ' + [p1.dmgMul, p1.maxHp, s0, s1]);
  const keepCan = save.canReboot;
  goBase();
  showTab('up');
  save.pres.pts = 3;
  save.canReboot = true;
  renderBase();
  const buy = () => document.querySelector<HTMLButtonElement>('[data-pres="dmg"]')!.click();
  buy();
  buy(); // 1 pt, then 2 pt
  const got = save.pres.up.dmg,
    left = save.pres.pts;
  Object.assign(save.pres.up, keepUp);
  save.pres.pts = 0;
  save.canReboot = keepCan;
  renderBase();
  if (got !== 2 || left !== 0) throw new Error('reboot bonus buy ' + got + ' ' + left);
});
test('trooper: 3-round bursts, hit spheres at head, chest and legs', () => {
  goBase();
  startRun();
  run.stage = PER - 1;
  run.forceBoss = 'trinity';
  startStage();
  show(null);
  setState('play');
  player.hp = 1e6;
  player.maxHp = 1e6;
  enemies.forEach(o => {
    o.dead = true;
    removeEnemyMesh(o);
  });
  const e = spawnEnemy('trooper', player.x, player.z - 7, -1, 1);
  e.active = true;
  e.cd = 0;
  for (let k = 0; k < 30; k++) update(1 / 60); // 0.5 s: one burst (3 rounds, 0.13 s apart)
  const shots = e.shots,
    [head, chest, legs] = e.parts!.map(q => q.p.y);
  run.forceBoss = undefined;
  endRun('abandon');
  goBase();
  if (shots !== 3 || !(head > chest && chest > legs))
    throw new Error('trooper burst ' + shots + ' spheres ' + [head, chest, legs]);
});
test('hazard floors: none in the start room, off at the start of an area', () => {
  goBase();
  startRun();
  for (const route of [1, 4])
    for (let k = 0; k < 30; k++) {
      run.route = [route];
      run.stage = (k % 6) * PER + (k % 3);
      startStage();
      const R = level.rooms[level.startIdx]!;
      for (let j = R.y - 1; j <= R.y + R.h; j++)
        for (let i = R.x - 1; i <= R.x + R.w; i++)
          if (level.hazardTiles[j * W + i])
            throw new Error(`hazard in the start room: route ${route} stage ${run.stage} tile ${i},${j}`);
      if (hazardState() === 'on') throw new Error('hazards live at the start of an area');
    }
  endRun('abandon');
  goBase();
});
test('readiness: a strong loadout still gets harder the deeper you start', () => {
  const strong = { weapons: [{ id: 'shotgun', r: 2, plus: 37, opts: [] }], dmg: 1.48, hp: 200, rebootMul: 1.45 };
  const deep = [6, 9, 13, 19].map(n => readinessScore(n, strong));
  if (deep.some((v, i) => i && v >= deep[i - 1]!)) throw new Error('readiness deep ' + deep.map(v => v.toFixed(2)));
  el('#btnWipe').click();
  el('#btnWipeGo').click();
});
test('touch layout editor: the edit is kept', () => {
  const s0 = buttonLayout('dash').s;
  openLayoutEditor('base');
  if (!stateIs('layout') || el('#layoutBar').hidden) throw new Error('layout editor open');
  document.querySelector<HTMLElement>('[data-lbact="plus"]')!.click();
  document.querySelector<HTMLElement>('[data-lbact="done"]')!.click();
  if (state !== 'base' || Math.abs(buttonLayout('dash').s - (s0 + 0.1)) > 1e-9)
    throw new Error('layout editor ' + buttonLayout('dash').s);
  save.settings.layout = {};
  applyLayout();
});

// reachability: from the start room, can the player walk into every room (and back to the start)?
describe('reachability', () => {
  beforeAll(() => {
    startRun();
    tick(10);
  });
  BIOMES.forEach((b, bi) => {
    test(`reach ${b.code}`, () => {
      let bad = 0,
        back = 0;
      for (let n = 0; n < 25; n++) {
        run.route = [bi];
        run.stage = bi * PER;
        buildLevel(b, false);
        const reach = (from: number) => {
          const seenT = new Uint8Array(W * H),
            q = [from];
          seenT[from] = 1;
          while (q.length) {
            const c = q.pop()!,
              ci = c % W,
              cj = (c / W) | 0;
            [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ].forEach(([a, bb], sd) => {
              const ni = ci + a,
                nj = cj + bb;
              if (isSolid(ni, nj)) return;
              const nn = nj * W + ni;
              if (!seenT[nn] && passable(c, nn, sd)) {
                seenT[nn] = 1;
                q.push(nn);
              }
            });
          }
          return seenT;
        };
        const [sx, sz] = roomSpot(level.rooms[level.startIdx]),
          st = tileIndex(sx, sz),
          fwdR = reach(st);
        level.rooms.forEach(r => {
          const [x, z] = roomSpot(r),
            k = tileIndex(x, z);
          if (!fwdR[k]) bad++;
          else if (!reach(k)[st]) back++;
        });
      }
      console.log('reach', b.code, 'unreachable rooms', bad, 'one-way rooms', back);
    });
  });
});

test('the same seed builds the same level', () => {
  const snap = () => ({ rooms: JSON.stringify(level.rooms), grid: Array.from(grid), start: level.startIdx });
  buildLevel(BIOMES[1], false, null, 1234);
  const a = snap();
  buildLevel(BIOMES[1], false, null, 1234);
  expect(snap()).toEqual(a);
  expect(level.seed).toBe(1234);
});

// A pin on generation: the same seed must keep giving the same maps, rooms and start. Changing the generator or the
// order it draws random numbers in changes these on purpose, and then the numbers here are updated with it.
function levelHash(gen: GeneratedLevel): string {
  const M = gen.maps;
  const maps = [M.grid, M.hgt, M.ramp, M.cover, gen.hazard, M.roomOf].map(a => Array.from(a).join(','));
  const text = maps.join('|') + JSON.stringify(gen.rooms) + gen.startIdx;
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}
test('generation is pinned: the same seed gives the same level', () => {
  const got: Record<string, string> = {};
  BIOMES.forEach(b => {
    got[b.code] = levelHash(generateLevel(b, false, null, createRng(1234)));
  });
  BOSS_ORDER.forEach(k => {
    got['arena ' + k] = levelHash(generateLevel(BIOMES[0], true, k, createRng(1234)));
  });
  expect(got).toEqual({
    DATA: '31230a44',
    FORGE: 'a37e213e',
    NOISE: 'f514cc1b',
    RUIN: 'ea80ade1',
    KWLN: '9b86bedd',
    CITY: 'd1432964',
    'arena watcher': 'b566d42b',
    'arena crusher': 'b566d42b',
    'arena core': 'dc3f981b',
    'arena phantom': 'b566d42b',
    'arena trinity': 'dc3f981b',
    'arena bastion': 'dc3f981b',
  });
});
