import type { Enemy, RegularEnemy } from '../data/types.ts';
import { clamp, distXZ, rand } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { burst, fireball } from '@engine/render/fx.ts';
import { moveCircle } from '@engine/world/tiles.ts';
import { toast } from '@engine/ui/ui.ts';
import { ENEMY_TUNE } from '../data/enemies.ts';
import { LEECH_OPT_HP } from '../data/weapons.ts';
import { TUNE, enemyGrowth } from '../data/progress.ts';
import { progressOf } from '../core/rules.ts';
import { STAGES_PER_GROWTH_DEPTH, damageScaleAt, difficultyAt } from '../core/stages.ts';
import { level, roomSpot } from '../world/level.ts';
import { onRoomCleared } from '../flow/events.ts';
import { addPickup, dropBits, enemies, removeEnemyMesh, spawnEnemy } from '../world/entities.ts';
import { bossDown, bossPhase, isEnraged } from './bosses/common.ts';
import { screenFx, hitDirection, hitMark } from '../ui/hud.ts';
import { endRun } from '../flow/run.ts';
import { state } from '../flow/state.ts';
import { COLOR } from '../data/colors.ts';
import { player, run } from './player.ts';
import { CRIT_MUL, critChance, weaponOptCount } from './weapons.ts';
import { spheres } from './firing.ts';

// ---- tuning numbers used only here ----
// being hit and hitting
const HIT_SHAKE = 0.22; // screen shake when the player is hurt
const HIT_VIGNETTE = 0.9; // damage vignette strength when hurt
const ENEMY_FLASH = 0.07; // seconds an enemy flashes white when hit
// explosions
const BLAST_SHAKE = 0.5; // rocket blast screen shake at point-blank
const BLAST_SHAKE_DIST = 30; // ... fades out by this distance (m)
const BLAST_SHAKE_MIN = 0.25; // ... but never below this share
const BLAST_SELF_R = 0.6; // share of the radius that hurts the player
const BLAST_SELF_DMG = 7; // damage to the player there (x damageScaleAt)
const BLAST_Y_SQUASH = 0.6; // height differences count this much in blast distance
const BLAST_BODY_SHRINK = 0.5; // share of a hit sphere's radius taken off the blast distance
const BLAST_CORE = 0.4; // share of the radius that takes full damage
const BLAST_EDGE_LOSS = 0.7; // damage lost at the very edge
const BLAST_PUSH = 0.8; // rocket blast knockback on enemies (m)
const BLAST_PUSH_FLASH = 0.2; // seconds those flash
// bomber
const BOMBER_SHAKE = 0.2; // screen shake from a bomber blast
const BOMBER_PLAYER_R = 3.4; // blast radius on the player (m)
const BOMBER_PLAYER_DY = 2.5; // ... and the height difference it still reaches (m)
const BOMBER_ENEMY_R = 3.2; // blast radius on other enemies (m)
const BOMBER_ENEMY_DMG = 35; // blast damage on other enemies (before depth scaling)
const BOMBER_DEATH_DMG = 0.6; // share of its damage when a bomber is shot dead
// kills and rewards
const KILL_BITS_MUL = 0.6; // share of an enemy's bits dropped
const KILL_BITS_PER_PROG = 0.05; // more bits per progress
const KIT_DROP_SPREAD = 0.5; // a dropped kit lands this far from the enemy (m)
const CHAIN_R_BASE = 2.5,
  CHAIN_R_PER = 0.5; // chain blast radius: base + per chip (m)
const CHAIN_DMG = 18; // chain blast damage per chip
const SPLIT_KIDS = 2; // enemies a splitter breaks into
const SPLIT_OFFSET = 0.6; // the halves appear this far to each side (m)
const ROOM_KIT_OFFSET = 0.8; // a cleared room puts the kit / bits this far to each side of its centre (m)
const ROOM_BITS_BASE = 6; // bits from a cleared room (+ progress)
export const kitHealAmount = (): number => Math.round(Math.max(TUNE.kitHeal, player.maxHp * TUNE.kitHealPct));

// from: where the hit came from (the attacker or the blast), for the direction arc; none for floors and your own blasts
export function damagePlayer(d: number, from?: { x: number; z: number }) {
  if (player.inv > 0 || state !== 'play') return;
  player.hp -= d;
  player.inv = TUNE.hitInvuln;
  screenFx.shake = Math.max(screenFx.shake, HIT_SHAKE);
  screenFx.vig = HIT_VIGNETTE;
  sfx('hurt', 80);
  if (from) hitDirection(from.x, from.z);
  if (player.hp <= 0) {
    player.hp = 0;
    endRun('dead');
  }
}

export function hurtEnemy(e: Enemy, dmg: number, isCrit: boolean) {
  if (e.dead) return;
  if (e.boss && e.spawnT > 0) {
    burst(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, 0xffffff, 2, 3, 0.2);
    return;
  }
  if (e.invuln) {
    if (!e.hinted) {
      e.hinted = true;
      toast(t('run.shielded'), 2400);
    }
    burst(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, COLOR.shield, 2, 4, 0.2);
    return;
  }
  const dealt = e.stunMul ? dmg * e.stunMul : dmg;
  e.hp -= dealt;
  e.flash = ENEMY_FLASH;
  if (!e.active) {
    e.active = true;
    if (e.room >= 0)
      enemies.forEach(o => {
        if (o.room === e.room) o.active = true;
      });
  }
  hitMark(isCrit);
  sfx('hit', 45);
  if (e.hp <= 0) killEnemy(e);
  else if (e.boss && !e.phased && isEnraged(e)) bossPhase(e);
}
// push an enemy dist metres straight away from (fromX, fromZ), stopping at walls
export function knockAway(e: Enemy, fromX: number, fromZ: number, dist: number) {
  const kx = e.x - fromX,
    kz = e.z - fromZ,
    kl = Math.hypot(kx, kz) || 1;
  moveCircle(e, (kx / kl) * dist, (kz / kl) * dist, e.r);
}
// the look and sound of a player explosion, and the screen shake
function blastFx(x: number, y: number, z: number, radius: number, color: number, big?: boolean) {
  if (big) {
    // kept small and short so a blast near you doesn't hide what's behind it
    fireball(x, y, z, radius * 0.5, COLOR.orange);
    fireball(x, y, z, radius * 0.28, 0xfff2c0);
    burst(x, y, z, COLOR.fire, 26, 12, 0.6);
    burst(x, y, z, COLOR.amber, 10, 7, 0.45);
    burst(x, y + 0.5, z, 0x5b6470, 6, 2.5, 0.7, -3);
    sfx('bigboom', 60);
    const pd = distXZ(player, { x, z });
    screenFx.shake = Math.max(screenFx.shake, BLAST_SHAKE * clamp(1 - pd / BLAST_SHAKE_DIST, BLAST_SHAKE_MIN, 1));
  } else {
    burst(x, y, z, color || COLOR.fire, 22, 9, 0.7);
    burst(x, y, z, 0xffffff, 8, 5, 0.4);
    sfx('boom', 60);
    screenFx.shake = Math.max(screenFx.shake, 0.12);
  }
}
// a rocket blast hurts the player standing close to it
function blastSelfHit(x: number, z: number, radius: number) {
  const pd = distXZ(player, { x, z });
  if (pd < radius * BLAST_SELF_R && state === 'play') damagePlayer(BLAST_SELF_DMG * damageScaleAt(run.stage));
}
// damage every enemy in the blast; rockets (big) also push non-bosses away
function blastEnemies(x: number, y: number, z: number, radius: number, blastDmg: number, crit: boolean, big?: boolean) {
  for (const e of enemies.slice()) {
    // enemies spawned by this blast's kills aren't hit by it
    if (e.dead) continue;
    let dd = Infinity;
    for (const sp of spheres(e)) {
      const q = sp.p;
      dd = Math.min(dd, Math.hypot(q.x - x, (q.y - y) * BLAST_Y_SQUASH, q.z - z) - sp.r * BLAST_BODY_SHRINK);
    }
    if (dd < radius) {
      const core = radius * BLAST_CORE,
        fall = dd <= core ? 1 : 1 - ((dd - core) / (radius - core)) * BLAST_EDGE_LOSS;
      hurtEnemy(e, blastDmg * fall, crit);
      if (big && !e.boss && !e.dead) {
        knockAway(e, x, z, BLAST_PUSH);
        e.flash = BLAST_PUSH_FLASH;
      }
    }
  }
}
// player explosions (rockets, chain blasts); one crit roll per explosion
// big: true for rockets (bigger fireball and shake, hurts the player nearby, pushes enemies); false for chain blasts
export function explode(x: number, y: number, z: number, radius: number, dmg: number, color: number, big?: boolean) {
  const crit = Math.random() < critChance();
  const blastDmg = crit ? dmg * CRIT_MUL : dmg;
  blastFx(x, y, z, radius, color, big);
  if (big) blastSelfHit(x, z, radius);
  blastEnemies(x, y, z, radius, blastDmg, crit, big);
}
// bomber blast: hurts the player and any enemy caught in it
function bomberBlast(x: number, y: number, z: number, dmg: number) {
  burst(x, y, z, COLOR.bomber, 26, 10, 0.7);
  burst(x, y, z, 0xffffff, 8, 5, 0.3);
  fireball(x, y, z, 3, COLOR.orange);
  sfx('boom', 40);
  screenFx.shake = Math.max(screenFx.shake, BOMBER_SHAKE);
  const at = { x, z };
  if (distXZ(player, at) < BOMBER_PLAYER_R && Math.abs(player.fy + 1 - y) < BOMBER_PLAYER_DY) damagePlayer(dmg, at);
  // the blast on other enemies grows with enemy health, so it still matters deep down
  const hit = (BOMBER_ENEMY_DMG * difficultyAt(run.stage)) / ENEMY_TUNE.hpMul;
  for (const o of enemies.slice()) if (!o.dead && !o.boss && distXZ(o, at) < BOMBER_ENEMY_R) hurtEnemy(o, hit, false);
}
export function detonate(e: RegularEnemy) {
  e.detonated = true;
  killEnemy(e, true);
  bomberBlast(e.x, e.mesh.position.y, e.z, e.dmg);
}
// bits, a kit (chance) and leech healing for a kill
function dropKillRewards(e: RegularEnemy) {
  dropBits(e.x, e.z, e.def.bits * KILL_BITS_MUL * (1 + progressOf(run.stage) * KILL_BITS_PER_PROG));
  if (Math.random() < TUNE.kitDropChance)
    addPickup('kit', e.x + rand(-KIT_DROP_SPREAD, KIT_DROP_SPREAD), e.z + rand(-KIT_DROP_SPREAD, KIT_DROP_SPREAD));
  const lh = player.leech + LEECH_OPT_HP * weaponOptCount('leech');
  if (lh) player.hp = Math.min(player.maxHp, player.hp + lh);
}
let inChainBlast = false;
// chain chip: the dead enemy explodes
function chainBlast(e: RegularEnemy) {
  // chain blast: only enemies you killed explode; kills caused by a chain blast don't set off another one
  if (!player.chain || inChainBlast) return;
  inChainBlast = true;
  const pos = e.mesh.position;
  // damage grows with depth at the same rate as enemy health, so the chip stays useful deep down
  const depthScale = enemyGrowth(progressOf(run.stage) / STAGES_PER_GROWTH_DEPTH);
  explode(
    pos.x,
    pos.y,
    pos.z,
    CHAIN_R_BASE + player.chain * CHAIN_R_PER,
    CHAIN_DMG * player.chain * player.dmgMul * depthScale,
    COLOR.amber,
  );
  inChainBlast = false;
}
// splitter: breaks into minis
function splitIntoMinis(e: RegularEnemy) {
  if (!e.def.split) return;
  for (let k = 0; k < SPLIT_KIDS; k++) {
    const m = spawnEnemy(
      'mini',
      e.x + (k ? SPLIT_OFFSET : -SPLIT_OFFSET),
      e.z + rand(-0.4, 0.4),
      e.room,
      difficultyAt(run.stage),
    );
    m.active = true;
  }
  if (e.room >= 0) level.roomCount[e.room] += SPLIT_KIDS;
}
function killEnemy(e: Enemy, noReward?: boolean) {
  e.dead = true;
  if (!noReward) run.kills++;
  const pos = e.mesh.position;
  burst(pos.x, pos.y, pos.z, e.boss ? COLOR.mag : e.def.color, e.boss ? 60 : 14, e.boss ? 14 : 8, e.boss ? 1.4 : 0.7);
  removeEnemyMesh(e);
  sfx('kill', 30);
  if (e.boss) {
    bossDown(e);
    return;
  }
  if (e.def.bomber && !e.detonated) {
    e.detonated = true;
    bomberBlast(e.x, pos.y, e.z, e.dmg * BOMBER_DEATH_DMG);
  }
  if (!noReward) {
    dropKillRewards(e);
    chainBlast(e);
  }
  // splitter: the halves appear after any blast from this kill, so they aren't wiped out by it
  splitIntoMinis(e);
  if (e.room >= 0 && --level.roomCount[e.room] === 0) roomCleared(e.room);
}
function roomCleared(idx: number) {
  if (onRoomCleared(idx)) return; // a lockdown wave, or the lockdown's own reward
  const [x, z] = roomSpot(level.rooms[idx]);
  // (once the pre-boss supply has been given, the building's rooms drop no chips: flow/events.ts)
  if (!run.bld?.supplied && Math.random() < TUNE.chipChance) {
    addPickup('chip', x, z);
    toast(t('run.clearedChip'));
  } else {
    addPickup('kit', x - ROOM_KIT_OFFSET, z);
    dropBits(x + ROOM_KIT_OFFSET, z, ROOM_BITS_BASE + progressOf(run.stage));
    toast(t('run.cleared'));
  }
}
