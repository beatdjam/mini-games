import * as THREE from 'three';
import type { Boss } from '../../data/types.ts';
import { el, rand, wrapAngle } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { burst, fireball } from '@engine/render/fx.ts';
import { clearPool } from '@engine/world/projectiles.ts';
import { moveCircle } from '@engine/world/tiles.ts';
import { toast } from '@engine/ui/ui.ts';
import { query } from '@engine/core/world.ts';
import { BOSS_META, BOSS_TUNE } from '../../data/bosses.ts';
import { COLOR } from '../../data/colors.ts';
import { machine } from '../../world/models/machine.ts';
import { TITAN_MID, titanLook } from '../../world/models/bosses/titan.ts';
import type { TitanParts } from '../../world/models/bosses/titan.ts';
import { eBullets, fanAt, ring, shootHoming, spawnWave } from '../../world/entities.ts';
import { screenFx } from '../../ui/hud.ts';
import { player } from '../player.ts';
import { damagePlayer } from '../combat.ts';
import { RING_Y, createBoss } from './common.ts';
import type { BossVisual } from './common.ts';
// TITAN, the last boss, in three stages:
// 1. armoured: its front takes little, the reactor on its back a lot, and it turns slowly, so the fight is getting
//    round it. It stomps (a shockwave) and fires the guns on its shoulders
// 2. below half health the armour comes off: all of it takes the usual damage, it is faster, and it grabs
// 3. at no health it falls and lies still, then gets up on a broken leg with a little health back (the bar in red):
//    slow, but its attacks are the thickest. Only this stage's health running out brings it down

type TitanState =
  | 'walk'
  | 'stomp' // up on one leg, then down: a shockwave
  | 'guns' // takes aim, then fires
  | 'grabWind' // the arms go back
  | 'lunge' // it throws itself along the line it locked
  | 'hold' // the player is in its hands
  | 'chain' // blasts walk along the floor toward the player (third stage)
  | 'quake' // a stomp that shakes the whole floor (third stage)
  | 'fallen' // at no health: it lies still and nothing hurts it
  | 'rising';
// st: what it is doing; timer: seconds left of that (Boss); face: where it faces (rad; 0 = +z); pick: its attack cycle;
// step: the legs' clock; fireT: to the next round while it walks; lx / lz: the lunge's line; left / nextT: blasts still
// to come and the time to the next; bx / bz: the last blast; stripped: the armour is off; revived: in the third stage;
// armourHinted: the toast for a hit on the armour has been shown
type TitanBoss = Boss & {
  st: TitanState;
  rig: TitanParts;
  face: number;
  pick: number;
  step: number;
  fireT: number;
  emberT: number;
  lx: number;
  lz: number;
  left: number;
  nextT: number;
  bx: number;
  bz: number;
  stripped: boolean;
  revived: boolean;
  armourHinted: boolean;
};
// the numbers TITAN's behaviour reads (BOSS_META.titan.tune)
export interface TitanTune {
  bodyR: number;
  walk: [number, number, number]; // by stage (m/s)
  turn: [number, number, number]; // by stage (rad/s)
  gap: [number, number, number]; // seconds of walking between two attacks, by stage
  armourMul: number;
  backMul: number;
  backCos: number;
  stompTime: number;
  stompLift: number;
  stompWave: [number, number, number];
  gunsTime: number;
  gunsFan: [number, number, number];
  gunsHoming: number;
  gunsHomingSpeed: number;
  walkFire: number;
  walkFan: [number, number, number];
  grabWind: number;
  lungeTime: number;
  lungeSpeed: number;
  grabR: number;
  grabDmg: number;
  holdTime: number;
  holdAt: number;
  holdEase: number;
  throwDist: number;
  throwDmg: number;
  fallTime: number;
  riseTime: number;
  reviveHp: number;
  chainN: number;
  chainEvery: number;
  chainStep: number;
  chainWave: [number, number, number];
  quakeTime: number;
  quakeWave: [number, number, number];
  quakeSecond: number;
  quakeRing: [number, number];
}
const BODY_GLOW = 0.04; // the body at rest
const FIRE_Y = 9.2; // the guns on its shoulders are this high (m)
const LEG_SWING = 0.35; // how far a leg swings as it walks (rad)
const STEP_PER_M = 0.9; // the legs' clock for each metre walked (rad)
const ARM_BACK = -1.9; // the arms drawn back before a grab (rad)
const ARM_OUT = 1.5; // the arms held out in a grab (rad)
const ARM_EASE = 8; // how fast the arms close on their pose (per second)
const FALLEN_LEAN = 1.25; // how far the fallen body leans forward (rad)
const FALLEN_DROP = 2.6; // how far the fallen body sinks (m)
const HALO_TURN: [number, number, number] = [0.25, 0.7, 1.6]; // the rings turn this fast, by stage (rad/s)
const SHARDS_TURN: [number, number, number] = [0.5, 1.1, 2.2]; // the blades circle this fast, by stage (rad/s)
const VEIN_BEAT = [1.6, 3, 7]; // the light in it beats this fast, by stage (rad/s)
const VEIN_COLOR = [COLOR.titanEye, COLOR.titanEye, 0xffa030]; // ... in this colour
const EMBER_EVERY = [0.25, 0.12, 0.04]; // an ember leaves it this often, by stage (s)
const EMBER_SPREAD = 3; // from this far around its chest (m)
const LIMP_LEAN = 0.18; // the third stage's list to one side (rad)
const LIMP_LEG = 0.5; // the broken leg stays this far out (rad)
const HEAD_HANG = 2.3; // the third stage's face hangs nearly upside down (rad)
const TWITCH_RATE = 0.8; // the face changes its tilt this many times a second, all at once...
const TWITCH_TILT = 0.5; // ... by up to this much (rad)
const SHUDDER_EVERY = 5; // the whole body shudders this often (s)...
const SHUDDER_FOR = 0.25; // ... for this long (s)...
const SHUDDER_M = 0.05; // ... by this much (m)
const BLINK_SHARE = 0.12; // the share of the time an eye is shut
const CABLE_SWAY = 0.16; // how far what hangs from the ribs sways (rad)
// a number from 0 to 1 that stays the same for a whole `n`, and looks like nothing to do with the one before
const noise = (n: number): number => {
  const v = Math.sin(n * 127.1) * 43758.5453;
  return v - Math.floor(v);
};
const CHAIN_TOWARD = 4; // the blasts start this far in front of it (m)
const stageOf = (e: TitanBoss): number => (e.revived ? 2 : e.phase > 0 ? 1 : 0);
const facing = (e: TitanBoss): [number, number] => [Math.sin(e.face), Math.cos(e.face)];
// the player stands behind it (a hit from there is a hit on its back: the shot came from where the player is)
export function titanSeesBack(e: { x: number; z: number; face: number }): boolean {
  const K = BOSS_META.titan.tune,
    dx = player.x - e.x,
    dz = player.z - e.z,
    d = Math.hypot(dx, dz) || 1;
  return (Math.sin(e.face) * dx + Math.cos(e.face) * dz) / d < K.backCos;
}
// how TITAN looks (common.ts BossVisual), and the parts its fight moves
export function titanVisual(): BossVisual & { parts: TitanParts } {
  // no hull plate and hardly any glow: a body that drinks the light (a hit still flashes it: updateEnemy)
  const mat = new THREE.MeshPhongMaterial({
    map: machine().hull,
    color: 0x4c4c55,
    specular: 0x8a8088,
    shininess: 48,
    emissive: COLOR.mag,
    emissiveIntensity: BODY_GLOW,
  }) as unknown as THREE.MeshLambertMaterial;
  mat.userData.glow = BODY_GLOW;
  mat.userData.pool = 0x5a0810;
  const parts = titanLook(mat);
  parts.core.visible = false;
  return { mesh: parts.g, mat, parts };
}
export function spawnTitan() {
  const look = titanVisual(),
    e = createBoss({
      kind: 'titan',
      look,
      behave: updTitan,
      state: {
        st: 'walk' as TitanState,
        rig: look.parts,
        face: 0,
        pick: 0,
        step: 0,
        fireT: 0,
        emberT: 0,
        lx: 0,
        lz: 0,
        left: 0,
        nextT: 0,
        bx: 0,
        bz: 0,
        stripped: false,
        revived: false,
        armourHinted: false,
      },
      hint: ['boss.titanHint', 5000],
    });
  e.face = Math.atan2(player.x - e.x, player.z - e.z); // it comes in looking at the player
  e.mesh.rotation.y = e.face;
  e.fireT = BOSS_META.titan.tune.walkFire;
  e.hit = dmg => titanHit(e, dmg);
}
// the damage a hit does; 0 when it does nothing (common.ts hurtEnemy)
function titanHit(e: TitanBoss, dmg: number): number {
  const K = BOSS_META.titan.tune;
  if (e.st === 'fallen' || e.st === 'rising') return 0;
  let dealt = dmg;
  if (!e.stripped && e.phase === 0) {
    const back = titanSeesBack(e);
    dealt = dmg * (back ? K.backMul : K.armourMul);
    if (!back) {
      const p = e.mesh.position;
      burst(p.x, p.y, p.z, COLOR.shield, 2, 4, 0.2);
      if (!e.armourHinted) {
        e.armourHinted = true;
        toast(t('boss.titanArmour'), 2400);
      }
    }
    // one hit does not go past the second stage (it stops just below the boundary)
    dealt = Math.min(dealt, e.hp - e.maxHp * BOSS_TUNE.phases[0]! * ARMOUR_FLOOR);
  }
  if (!e.revived && e.hp - dealt <= 0) {
    titanFall(e);
    return 0;
  }
  return dealt;
}
const ARMOUR_FLOOR = 0.99; // the share of the boundary's health a hit on the first stage leaves it
// at no health: it falls and lies still. The bar stays empty, nothing is said (the player thinks it is over)
function titanFall(e: TitanBoss) {
  const K = BOSS_META.titan.tune,
    p = e.mesh.position;
  e.hp = 0;
  e.st = 'fallen';
  e.timer = K.fallTime;
  e.aloft = false;
  burst(p.x, p.y, p.z, COLOR.mag, 40, 12, 1.0);
  fireball(p.x, p.y, p.z, 4, COLOR.mag);
  screenFx.shake = Math.max(screenFx.shake, 0.6);
  sfx('bigboom');
  clearPool(eBullets);
  query('wave').forEach(w => {
    w.dead = true;
  });
}
function titanRise(e: TitanBoss) {
  const K = BOSS_META.titan.tune,
    p = e.mesh.position;
  e.revived = true;
  e.hp = e.maxHp * K.reviveHp;
  e.st = 'walk';
  e.timer = K.gap[2];
  e.pick = 0;
  e.rig.mask.visible = false; // the face comes off: there are eyes behind it
  e.rig.under.visible = true;
  el('#bossFill').classList.add('revived');
  fireball(p.x, p.y, p.z, 5, COLOR.orange);
  screenFx.shake = Math.max(screenFx.shake, 0.5);
  sfx('bigboom');
  toast(t('boss.titanRise'), 2600);
}
function titanStrip(e: TitanBoss) {
  const p = e.mesh.position;
  e.stripped = true;
  e.rig.armour.visible = false;
  e.rig.core.visible = true;
  burst(p.x, p.y + 1, p.z, 0xb0b8c0, 40, 14, 1.0);
}
// the next attack of its cycle for this stage
function nextAttack(e: TitanBoss) {
  const K = BOSS_META.titan.tune,
    stage = stageOf(e),
    cycle: TitanState[] =
      stage === 2 ? ['chain', 'quake', 'guns'] : stage === 1 ? ['grabWind', 'stomp', 'guns'] : ['stomp', 'guns'],
    st = cycle[e.pick++ % cycle.length]!;
  e.st = st;
  if (st === 'stomp') e.timer = K.stompTime;
  else if (st === 'guns') e.timer = K.gunsTime;
  else if (st === 'grabWind') e.timer = K.grabWind;
  else if (st === 'quake') e.timer = K.quakeTime;
  else {
    e.timer = K.chainN * K.chainEvery;
    const [fx, fz] = facing(e);
    e.left = K.chainN;
    e.nextT = 0;
    e.bx = e.x + fx * CHAIN_TOWARD;
    e.bz = e.z + fz * CHAIN_TOWARD;
  }
}
function updTitan(e: TitanBoss, dt: number) {
  const K = BOSS_META.titan.tune,
    stage = stageOf(e),
    dx = player.x - e.x,
    dz = player.z - e.z,
    d = Math.hypot(dx, dz) || 1;
  e.t += dt;
  e.timer -= dt;
  if (e.phase > 0 && !e.stripped) titanStrip(e);
  const turnToPlayer = () => {
    const want = wrapAngle(Math.atan2(dx, dz) - e.face),
      most = K.turn[stage]! * dt;
    e.face = wrapAngle(e.face + Math.max(-most, Math.min(most, want)));
  };
  let lift = 0,
    arms = 0;
  if (e.st === 'walk') {
    turnToPlayer();
    const [fx, fz] = facing(e),
      v = K.walk[stage]! * dt;
    moveCircle(e, fx * v, fz * v, K.bodyR);
    e.step += v * STEP_PER_M;
    e.fireT -= dt;
    // it shoots as it walks, but not while a shockwave is out: a wave and a fan at once is more than two dashes answer
    if (e.fireT <= 0 && !query('wave').some(w => !w.dead)) {
      fanAt(e.x, FIRE_Y, e.z, K.walkFan[0], K.walkFan[1], K.walkFan[2], e.dmg, COLOR.fire);
      e.fireT = K.walkFire;
    }
    if (e.timer <= 0) nextAttack(e);
  } else if (e.st === 'stomp') {
    const u = 1 - Math.max(0, e.timer) / K.stompTime;
    lift = Math.sin(u * Math.PI) * K.stompLift;
    e.aloft = true;
    if (e.timer <= 0) {
      e.aloft = false;
      stompDown(e, K.stompWave);
      backToWalk(e);
    }
  } else if (e.st === 'guns') {
    turnToPlayer();
    if (e.timer <= 0) {
      fanAt(e.x, FIRE_Y, e.z, K.gunsFan[0], K.gunsFan[1], K.gunsFan[2], e.dmg, COLOR.fire);
      for (let k = 0; k < K.gunsHoming; k++)
        shootHoming(e.x, FIRE_Y, e.z, e.face + (k - (K.gunsHoming - 1) / 2), K.gunsHomingSpeed, e.dmg, COLOR.mag, {
          reach: 2,
          rise: 2,
          homing: 2.6,
        });
      backToWalk(e);
    }
  } else if (e.st === 'grabWind') {
    turnToPlayer();
    arms = ARM_BACK;
    e.flash = Math.sin(e.t * 40) > 0 ? 0.03 : 0;
    if (e.timer <= 0) {
      const [fx, fz] = facing(e);
      e.lx = fx;
      e.lz = fz;
      e.st = 'lunge';
      e.timer = K.lungeTime;
      sfx('beam');
    }
  } else if (e.st === 'lunge') {
    arms = ARM_OUT;
    moveCircle(e, e.lx * K.lungeSpeed * dt, e.lz * K.lungeSpeed * dt, K.bodyR);
    e.step += K.lungeSpeed * dt * STEP_PER_M;
    if (d < K.grabR && player.inv <= 0) {
      damagePlayer(e.dmg * K.grabDmg, e);
      e.st = 'hold';
      e.timer = K.holdTime;
    } else if (e.timer <= 0) backToWalk(e);
  } else if (e.st === 'hold') {
    // held: the player is drawn into its hands, whichever way they try to go
    arms = ARM_OUT;
    const [fx, fz] = facing(e),
      ease = Math.min(1, K.holdEase * dt);
    moveCircle(player, (e.x + fx * K.holdAt - player.x) * ease, (e.z + fz * K.holdAt - player.z) * ease, player.r);
    if (e.timer <= 0) {
      moveCircle(player, fx * K.throwDist, fz * K.throwDist, player.r);
      player.inv = 0;
      damagePlayer(e.dmg * K.throwDmg, e);
      screenFx.shake = Math.max(screenFx.shake, 0.4);
      sfx('boom');
      backToWalk(e);
    }
  } else if (e.st === 'chain') {
    e.nextT -= dt;
    if (e.left > 0 && e.nextT <= 0) {
      // each blast goes off a step on from the last, toward where the player is now
      const bd = Math.hypot(player.x - e.bx, player.z - e.bz) || 1;
      e.bx += ((player.x - e.bx) / bd) * Math.min(bd, K.chainStep);
      e.bz += ((player.z - e.bz) / bd) * Math.min(bd, K.chainStep);
      spawnWave(e.bx, e.bz, K.chainWave[0], K.chainWave[1], e.dmg * K.chainWave[2], COLOR.orange);
      fireball(e.bx, 1, e.bz, 2, COLOR.orange);
      sfx('boom', 60);
      e.left--;
      e.nextT = K.chainEvery;
    }
    if (e.timer <= 0) backToWalk(e);
  } else if (e.st === 'quake') {
    const u = 1 - Math.max(0, e.timer) / K.quakeTime;
    lift = Math.sin(u * Math.PI) * K.stompLift;
    e.aloft = true;
    if (e.timer <= 0) {
      e.aloft = false;
      stompDown(e, K.quakeWave);
      e.nextT = K.quakeSecond;
      ring(e.x, RING_Y, e.z, K.quakeRing[0], K.quakeRing[1], e.t, e.dmg, COLOR.orange);
      backToWalk(e);
    }
  } else if (e.st === 'fallen') {
    if (e.timer <= 0) {
      e.st = 'rising';
      e.timer = BOSS_META.titan.tune.riseTime;
      sfx('beam');
    }
  } else if (e.timer <= 0) titanRise(e);
  // the second wave of a quake, while it walks on
  if (e.revived && e.st !== 'chain' && e.nextT > 0) {
    e.nextT -= dt;
    if (e.nextT <= 0) stompDown(e, K.quakeWave);
  }
  poseTitan(e, dt, lift, arms);
}
function stompDown(e: TitanBoss, wave: [number, number, number]) {
  spawnWave(e.x, e.z, wave[0], wave[1], e.dmg * wave[2], COLOR.amber);
  fireball(e.x, 1, e.z, 5, COLOR.orange);
  burst(e.x, 0.5, e.z, COLOR.amber, 30, 12, 0.8);
  screenFx.shake = Math.max(screenFx.shake, 0.45);
  sfx('boom');
}
function backToWalk(e: TitanBoss) {
  e.st = 'walk';
  e.timer = BOSS_META.titan.tune.gap[stageOf(e)]!;
}
function poseTitan(e: TitanBoss, dt: number, lift: number, arms: number) {
  const stage = stageOf(e),
    down = e.st === 'fallen';
  // the show: dark and still while it lies there, everything at once when it is up
  e.rig.halo.children.forEach((r, n) => {
    r.rotation.z += (n % 2 ? -1 : 1) * (down ? 0 : HALO_TURN[stage]!) * dt * (1 + n * 0.4);
  });
  e.rig.shards.rotation.y += (down ? 0 : SHARDS_TURN[stage]!) * dt;
  const pulse = down ? 0.08 : 0.65 + Math.sin(e.t * VEIN_BEAT[stage]!) * 0.35;
  e.rig.veins.color.setHex(VEIN_COLOR[stage]!).multiplyScalar(pulse);
  e.emberT -= dt;
  if (!down && e.emberT <= 0) {
    e.emberT = EMBER_EVERY[stage]!;
    burst(
      e.x + rand(-EMBER_SPREAD, EMBER_SPREAD),
      rand(2, 9),
      e.z + rand(-EMBER_SPREAD, EMBER_SPREAD),
      VEIN_COLOR[stage]!,
      1,
      1.5,
      1.2,
      -2,
    );
  }
  const p = e.rig,
    swing = Math.sin(e.step) * LEG_SWING,
    fall = e.st === 'fallen' ? 1 : e.st === 'rising' ? Math.max(0, e.timer) / BOSS_META.titan.tune.riseTime : 0;
  p.legL.rotation.x = e.revived ? LIMP_LEG : swing;
  p.legR.rotation.x = -swing - lift * 0.3;
  const armEase = (o: THREE.Object3D) => {
    o.rotation.x += (arms - o.rotation.x) * Math.min(1, ARM_EASE * dt);
  };
  armEase(p.armL);
  armEase(p.armR);
  p.torso.rotation.x = fall * FALLEN_LEAN;
  p.torso.rotation.z = e.revived ? LIMP_LEAN : 0;
  // the face looks at the player whichever way the body faces, and does not stop for being turned round
  p.neck.rotation.y = wrapAngle(Math.atan2(player.x - e.x, player.z - e.z) - e.face);
  const beat = Math.floor(e.t * TWITCH_RATE);
  p.head.rotation.z = (e.revived ? HEAD_HANG : 0) + (e.st === 'fallen' ? 0 : (noise(beat) - 0.5) * 2 * TWITCH_TILT);
  p.head.rotation.x = (noise(beat + 0.5) - 0.5) * TWITCH_TILT;
  p.eyes.forEach((o, n) => {
    const shut = e.st === 'fallen' || noise(Math.floor(e.t * (0.6 + n * 0.13)) + n * 7.3) < BLINK_SHARE;
    o.scale.y = shut ? 0.05 : 1;
  });
  p.cables.forEach((c, n) => {
    c.rotation.x = Math.sin(e.t * (0.9 + n * 0.23) + n) * CABLE_SWAY - lift * 0.1;
    c.rotation.z = Math.sin(e.t * (0.7 + n * 0.17) + n * 2) * CABLE_SWAY;
  });
  const shudder = e.t % SHUDDER_EVERY < SHUDDER_FOR ? Math.sin(e.t * 90) * SHUDDER_M : 0;
  e.mesh.rotation.y = e.face;
  e.mesh.position.set(e.x + shudder, TITAN_MID + lift - fall * FALLEN_DROP, e.z);
}
