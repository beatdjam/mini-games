import * as THREE from 'three';
import type { Boss } from '../../data/types.ts';
import { el, rand, wrapAngle } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { basicMat, dynGroup } from '@engine/render/render.ts';
import { burst, fireball } from '@engine/render/fx.ts';
import { clearPool } from '@engine/world/projectiles.ts';
import { floorY, moveCircle } from '@engine/world/tiles.ts';
import { toast } from '@engine/ui/ui.ts';
import { query } from '@engine/core/world.ts';
import { BOSS_META, BOSS_TUNE } from '../../data/bosses.ts';
import { COLOR } from '../../data/colors.ts';
import { machine } from '../../world/models/machine.ts';
import { TITAN_HIP_Y, TITAN_SCALE, TITAN_SHIN, TITAN_THIGH, titanLook } from '../../world/models/bosses/titan.ts';
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
  | 'sweep' // a red line on the floor, then a beam across the room
  | 'leapWind' // it crouches, the ring on the floor says where
  | 'leap' // through the air, onto that ring
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
  beam: THREE.Group; // the sweep's beam and its line on the floor
  line: THREE.Mesh;
  ray: THREE.Group;
  ringAt: THREE.Mesh; // where a leap comes down
  sweepA: number; // the sweep: the angle of the line, of the beam, which way it turns
  beamA: number;
  sweepDir: number;
  beamHit: boolean;
  fromX: number; // a leap: from here...
  fromZ: number;
  toX: number; // ... to here
  toZ: number;
  air: number; // how high it is in a leap (m)
  beamStarted?: boolean;
  kick: number; // the guns' recoil, 1..0
  slam: number; // the last landing, 1..0
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
  farD: number;
  sweepWarn: number;
  sweepLock: number;
  sweepTime: [number, number, number];
  sweepArc: number;
  sweepLen: number;
  sweepW: number;
  sweepDmg: number;
  leapWind: number;
  leapLock: number;
  leapTime: number;
  leapH: number;
  leapR: number;
  leapDmg: number;
  leapWave: [number, number, number];
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
const BEAM_LINE_W = 0.14; // the sweep's warning line on the floor (m)
const BEAM_CORE_W = 0.22; // the beam's white core...
const BEAM_GLOW_W = 0.9; // ... and the light round it (m)
const BEAM_Y = 1.1; // the beam runs this high: a jump clears it (m)
const BEAM_CLEAR = 1.0; // feet this far above its floor are over it (m)
const BEAM_FROM = 2; // the beam starts this far from its body (m)
const FIRE_Y = 9.2; // the guns on its shoulders are this high (m)
const STEP_PER_M = 0.55; // the legs' clock for each metre walked (rad)
const ARM_BACK = 1.5; // the arms drawn back before a grab (rad)
const ARM_OUT = -1.55; // the arms held out in a grab (rad)
const ARM_EASE = 8; // how fast the arms close on their pose (per second)
const FALLEN_LEAN = 1.05; // how far the fallen body folds forward (rad)
const HALO_TURN: [number, number, number] = [0.25, 0.7, 1.6]; // the rings turn this fast, by stage (rad/s)
const SHARDS_TURN: [number, number, number] = [0.5, 1.1, 2.2]; // the blades circle this fast, by stage (rad/s)
const VEIN_BEAT = [1.6, 3, 7]; // the light in it beats this fast, by stage (rad/s)
const VEIN_COLOR = [COLOR.titanEye, COLOR.titanEye, 0xffa030]; // ... in this colour
const EMBER_EVERY = [0.25, 0.12, 0.04]; // an ember leaves it this often, by stage (s)
const EMBER_SPREAD = 3; // from this far around its chest (m)
const LIMP_LEAN = 0.18; // the third stage's list to one side (rad)
const LIMP_LEG = 0.55; // the broken leg stays this far back (rad)
const LIMP_SHIN = -0.1;
const FALLEN_THIGH = 1.45; // on its knees: the thighs forward...
const FALLEN_SHIN = -2.3; // ... the shins folded back under it (rad)
const RISE_JERKS = 6; // it gets up in this many jerks
const STRIDE = [0.34, 0.5, 0.24]; // how far a leg swings, by stage (rad)
const STANCE_THIGH = 0.3; // standing, the thigh leans back and the shin forward from the knee (rad)
const STANCE_SHIN = -0.6;
const KNEE_LIFT = 0.65; // how far the knee folds as a foot comes up (rad)
const STOMP_THIGH = 1.25; // a stomp lifts the thigh this far...
const STOMP_SHIN = 0.2; // ... with the shin hanging (rad)
const ARM_REST = -0.08; // the arms at rest (rad)
const ARM_SWING = 0.22; // how far they swing
const ARM_LAG = 0.8; // how late (rad of the legs' clock)
const ARM_SPREAD = 0.1; // how far out they hang (rad)
const ELBOW_REST = -0.22;
const HUNCH = 0.2; // it stands bent forward (rad)
const HIP_ROLL = 0.06; // how far the body rolls with a step (rad)
const HIP_TWIST = 0.09; // ... and turns
const SLAM_THIGH = 0.5; // a landing squats it this far: the thighs...
const SLAM_SHIN = 1.0; // ... the knees...
const SLAM_LEAN = 0.5; // ... and the body (rad)
const SLAM_FADE = 2.4; // it comes back up at this rate (per second)
const KICK_LEAN = 0.3; // the guns' recoil throws the body back this far (rad)
const KICK_FADE = 6; // per second
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
// the sweep's beam: it is put in the scene once, hidden, and goes with the boss. +z from its origin
function titanBeam() {
  const g = new THREE.Group(),
    line = new THREE.Mesh(
      new THREE.BoxGeometry(BEAM_LINE_W, 0.02, 1),
      new THREE.MeshBasicMaterial({ color: COLOR.titanEye, transparent: true, opacity: 0.8 }),
    ),
    ray = new THREE.Group(),
    core = new THREE.Mesh(new THREE.BoxGeometry(BEAM_CORE_W, BEAM_CORE_W, 1), basicMat(0xfff0e0)),
    glow = new THREE.Mesh(
      new THREE.BoxGeometry(BEAM_GLOW_W, BEAM_GLOW_W, 1),
      new THREE.MeshBasicMaterial({
        color: COLOR.titanEye,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
  ray.add(core, glow);
  g.add(line, ray);
  g.visible = false;
  dynGroup.add(g);
  return { g, line, ray };
}
function titanRing() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1, 40),
    new THREE.MeshBasicMaterial({ color: COLOR.titanEye, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  dynGroup.add(ring);
  return ring;
}
export function titanVisual(): BossVisual & {
  parts: TitanParts;
  beam: ReturnType<typeof titanBeam>;
  ring: THREE.Mesh;
} {
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
  return { mesh: parts.g, mat, parts, beam: titanBeam(), ring: titanRing() };
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
        beam: look.beam.g,
        line: look.beam.line,
        ray: look.beam.ray,
        ringAt: look.ring,
        sweepA: 0,
        beamA: 0,
        sweepDir: 1,
        beamHit: false,
        fromX: 0,
        fromZ: 0,
        toX: 0,
        toZ: 0,
        air: 0,
        kick: 0,
        slam: 0,
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
      extra: [look.beam.g, look.ring],
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
  e.air = 0;
  e.beam.visible = false;
  e.ringAt.visible = false;
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
      stage === 2
        ? ['chain', 'quake', 'guns']
        : stage === 1
          ? ['grabWind', 'sweep', 'stomp', 'leapWind', 'guns']
          : ['stomp', 'sweep', 'guns', 'leapWind'],
    next = cycle[e.pick++ % cycle.length]!,
    // what only reaches close by is no use against a player keeping away: it comes to them instead
    far = Math.hypot(player.x - e.x, player.z - e.z) > K.farD,
    st: TitanState = far && stage < 2 && (next === 'stomp' || next === 'grabWind') ? 'leapWind' : next;
  e.st = st;
  if (st === 'stomp') e.timer = K.stompTime;
  else if (st === 'guns') e.timer = K.gunsTime;
  else if (st === 'grabWind') e.timer = K.grabWind;
  else if (st === 'quake') e.timer = K.quakeTime;
  else if (st === 'sweep') {
    e.timer = K.sweepWarn + K.sweepTime[stage]!;
    e.sweepDir = Math.sin(e.t * 13) > 0 ? 1 : -1;
    e.beamHit = false;
    e.beam.visible = true;
    e.line.visible = true;
    e.ray.visible = false;
    e.aloft = true;
  } else if (st === 'leapWind') {
    e.timer = K.leapWind;
    e.aloft = true;
    e.ringAt.visible = true;
    e.ringAt.scale.setScalar(K.leapR);
  } else {
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
  let lift = 0;
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
      e.kick = 1;
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
    moveCircle(e, e.lx * K.lungeSpeed * dt, e.lz * K.lungeSpeed * dt, K.bodyR);
    e.step += K.lungeSpeed * dt * STEP_PER_M;
    if (d < K.grabR && player.inv <= 0) {
      damagePlayer(e.dmg * K.grabDmg, e);
      e.st = 'hold';
      e.timer = K.holdTime;
    } else if (e.timer <= 0) backToWalk(e);
  } else if (e.st === 'hold') {
    // held: the player is drawn into its hands, whichever way they try to go
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
  } else if (e.st === 'sweep') {
    const left = e.timer,
      time = K.sweepTime[stage]!,
      toPlayer = Math.atan2(dx, dz),
      y = floorY(e.x, e.z);
    if (left > time + K.sweepLock) e.sweepA = toPlayer; // the line follows, then stays
    e.beam.position.set(e.x, y, e.z);
    const beamLen = K.sweepLen;
    if (left > time) {
      e.face = e.sweepA - (e.sweepDir * K.sweepArc) / 2;
      e.beam.rotation.y = e.sweepA;
      e.line.position.set(0, 0.04, BEAM_FROM + beamLen / 2);
      e.line.scale.z = beamLen;
      e.flash = Math.sin(e.t * 40) > 0 ? 0.03 : 0;
    } else {
      if (e.line.visible) {
        e.line.visible = false;
        e.ray.visible = true;
        sfx('beam');
      }
      const u = 1 - Math.max(0, left) / time,
        before = e.beamStarted ? e.beamA : e.sweepA + e.sweepDir * K.sweepArc * (u - 0.5);
      e.beamStarted = true;
      e.beamA = e.sweepA + e.sweepDir * K.sweepArc * (u - 0.5);
      e.beam.rotation.y = e.beamA;
      e.face = e.beamA;
      e.ray.position.set(0, BEAM_Y, BEAM_FROM + beamLen / 2);
      e.ray.scale.z = beamLen;
      if (Math.random() < 0.5) {
        const r = BEAM_FROM + rand(0.1, 1) * beamLen;
        burst(e.x + Math.sin(e.beamA) * r, y + 0.1, e.z + Math.cos(e.beamA) * r, COLOR.orange, 2, 5, 0.5);
      }
      // did it cross the player since the last frame
      const span = Math.abs(wrapAngle(e.beamA - before)) + Math.atan2(K.sweepW + player.r, d),
        off = Math.abs(wrapAngle(toPlayer - e.beamA));
      if (!e.beamHit && off < span && d < BEAM_FROM + beamLen && player.fy - y < BEAM_CLEAR) {
        e.beamHit = true;
        damagePlayer(e.dmg * K.sweepDmg, e);
      }
      if (left <= 0) {
        e.beam.visible = false;
        e.beamStarted = false;
        e.aloft = false;
        backToWalk(e);
      }
    }
  } else if (e.st === 'leapWind') {
    turnToPlayer();
    e.toX = player.x;
    e.toZ = player.z;
    e.ringAt.position.set(player.x, floorY(player.x, player.z) + 0.06, player.z);
    e.slam = 1 - Math.max(0, e.timer) / K.leapWind; // it sinks down before it goes
    if (e.timer <= K.leapLock) {
      e.toX = e.ringAt.position.x;
      e.toZ = e.ringAt.position.z;
    }
    if (e.timer <= 0) {
      e.fromX = e.x;
      e.fromZ = e.z;
      e.st = 'leap';
      e.timer = K.leapTime;
      sfx('beam');
    }
  } else if (e.st === 'leap') {
    const u = 1 - Math.max(0, e.timer) / K.leapTime,
      goX = e.fromX + (e.ringAt.position.x - e.fromX) * u,
      goZ = e.fromZ + (e.ringAt.position.z - e.fromZ) * u;
    moveCircle(e, goX - e.x, goZ - e.z, K.bodyR);
    e.air = Math.sin(u * Math.PI) * K.leapH;
    if (e.timer <= 0) {
      e.air = 0;
      e.aloft = false;
      e.ringAt.visible = false;
      stompDown(e, K.leapWave);
      if (Math.hypot(player.x - e.x, player.z - e.z) < K.leapR) damagePlayer(e.dmg * K.leapDmg, e);
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
  poseTitan(e, dt, lift);
}
function stompDown(e: TitanBoss, wave: [number, number, number]) {
  e.slam = 1;
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
function poseTitan(e: TitanBoss, dt: number, lift: number) {
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
    K = BOSS_META.titan.tune,
    st = e.st,
    // it does not get up smoothly: it comes up in jerks, a joint at a time
    fall =
      st === 'fallen'
        ? 1
        : st === 'rising'
          ? Math.ceil((Math.max(0, e.timer) / K.riseTime) * RISE_JERKS) / RISE_JERKS
          : 0,
    s = e.step,
    h = lift / K.stompLift, // how far up a stomp is, 0..1
    stride = STRIDE[stage]!;
  e.kick = Math.max(0, e.kick - KICK_FADE * dt);
  e.slam = Math.max(0, e.slam - SLAM_FADE * dt);
  // the legs: the thigh swings, the knee folds as the foot comes up; a stomp lifts one leg high, a landing squats on both
  let tL = STANCE_THIGH + Math.sin(s) * stride + e.slam * SLAM_THIGH,
    kL = STANCE_SHIN - Math.max(0, Math.cos(s)) * KNEE_LIFT - e.slam * SLAM_SHIN,
    tR = STANCE_THIGH - Math.sin(s) * stride - h * STOMP_THIGH + e.slam * SLAM_THIGH,
    kR = STANCE_SHIN - Math.max(0, -Math.cos(s)) * KNEE_LIFT + h * STOMP_SHIN - e.slam * SLAM_SHIN;
  if (e.revived) {
    tL = LIMP_LEG; // the broken leg drags behind, nearly straight
    kL = LIMP_SHIN;
  }
  // the arms hang and swing against the legs, late; what it is doing takes them over
  const swing = Math.sin(s + ARM_LAG) * ARM_SWING;
  let aL = ARM_REST - swing,
    aR = ARM_REST + swing,
    elbow = ELBOW_REST,
    spread = ARM_SPREAD,
    curl = 0,
    lean = HUNCH;
  if (st === 'grabWind') {
    aL = ARM_BACK;
    aR = aL;
    elbow = -1.1;
    spread = 0.55;
    curl = -0.5;
    lean = -0.2;
  } else if (st === 'lunge') {
    aL = ARM_OUT;
    aR = aL;
    elbow = -0.08;
    spread = 0.28;
    curl = -0.7;
    lean = 0.55;
  } else if (st === 'hold') {
    aL = ARM_OUT * 0.85;
    aR = aL;
    elbow = -0.9;
    spread = 0.12;
    curl = 0.7;
    lean = 0.3;
  } else if (st === 'guns') {
    aL = 0.25;
    aR = aL;
    spread = 0.5;
    lean = -0.12;
  } else if (st === 'stomp' || st === 'quake') {
    spread = 0.25 + h * 0.5;
    lean = HUNCH - h * 0.4;
  } else if (st === 'sweep') {
    aL = -1.5; // one arm up along the beam, the other held back
    aR = 0.5;
    elbow = -0.1;
    spread = 0.3;
    lean = -0.1;
  } else if (st === 'leap') {
    aL = 0.9; // arms trailing, legs folded under
    aR = aL;
    spread = 0.5;
    tL = -0.9;
    tR = tL;
    kL = -1.5;
    kR = kL;
    lean = 0.4;
  } else if (st === 'leapWind') {
    aL = 0.9;
    aR = aL;
    spread = 0.4;
    lean = 0.45;
  } else if (st === 'chain') {
    aL = -2.4; // both arms up, for as long as the floor goes off
    aR = aL;
    elbow = -0.4;
    spread = 0.5;
    curl = -0.6;
    lean = -0.25;
  }
  lean += e.slam * SLAM_LEAN - e.kick * KICK_LEAN;
  // fallen: down on its knees, the body folded over, the arms left where they fell
  const mix = (a: number, b: number) => a + (b - a) * fall;
  tL = mix(tL, FALLEN_THIGH);
  tR = mix(tR, FALLEN_THIGH * 0.8);
  kL = mix(kL, FALLEN_SHIN);
  kR = mix(kR, FALLEN_SHIN * 0.9);
  aL = mix(aL, -0.9);
  aR = mix(aR, -0.55);
  elbow = mix(elbow, -0.25);
  lean = mix(lean, FALLEN_LEAN);
  const rate = st === 'rising' ? 40 : st === 'fallen' ? 3.5 : st === 'lunge' ? 18 : ARM_EASE,
    ease = (o: THREE.Object3D, axis: 'x' | 'z', to: number) => {
      o.rotation[axis] += (to - o.rotation[axis]) * Math.min(1, rate * dt);
    };
  ease(p.legL.hip, 'x', tL);
  ease(p.legL.shin, 'x', kL);
  ease(p.legR.hip, 'x', tR);
  ease(p.legR.shin, 'x', kR);
  // the feet stay flat
  p.legL.foot.rotation.x = -(p.legL.hip.rotation.x + p.legL.shin.rotation.x);
  p.legR.foot.rotation.x = -(p.legR.hip.rotation.x + p.legR.shin.rotation.x);
  ease(p.armL.arm, 'x', aL);
  ease(p.armR.arm, 'x', aR);
  ease(p.armL.arm, 'z', -spread);
  ease(p.armR.arm, 'z', spread);
  ease(p.armL.fore, 'x', elbow);
  ease(p.armR.fore, 'x', elbow * (e.revived ? 0.2 : 1)); // (one arm stops working in the third stage)
  ease(p.armL.hand, 'x', curl);
  ease(p.armR.hand, 'x', curl);
  ease(p.torso, 'x', lean);
  // the hips roll with each step, the third stage dips onto the good leg
  ease(p.torso, 'z', Math.sin(s) * HIP_ROLL * (stride / STRIDE[0]!) + (e.revived ? LIMP_LEAN : 0));
  p.torso.rotation.y = Math.sin(s + ARM_LAG) * HIP_TWIST;
  // the body stands on whichever foot is lower: the feet stay on the floor
  const reach = (t: number, k: number) => TITAN_THIGH * Math.cos(t) + TITAN_SHIN * Math.cos(t + k),
    stand =
      Math.max(
        reach(p.legL.hip.rotation.x, p.legL.shin.rotation.x),
        reach(p.legR.hip.rotation.x, p.legR.shin.rotation.x),
      ) - TITAN_HIP_Y;
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
  e.mesh.position.set(e.x + shudder, stand * TITAN_SCALE + e.air, e.z);
}
