import {
  SURGEON_NECK,
  SURGEON_SHOULDER,
  SURGEON_SLOT_TURN,
  surgeonArm,
  surgeonBody,
  surgeonHullMat,
  surgeonMount,
} from '../../world/models/bossLooks.ts';
import type { SurgeonArmKind, SurgeonArmLook } from '../../world/models/bossLooks.ts';
import { plainLooks } from '../../world/looks.ts';
import type { Boss, RegularEnemy } from '../../data/types.ts';
import * as THREE from 'three';
import { clamp, distXZ, rand, turnToward, wrapAngle } from '@engine/core/util.ts';
import { sfx } from '@engine/audio/audio.ts';
import { disposeTree, dynGroup, shared } from '@engine/render/render.ts';
import { burst } from '@engine/render/fx.ts';
import { spawn } from '@engine/core/world.ts';
import type { WorldObject } from '@engine/core/world.ts';
import { floorY } from '@engine/world/tiles.ts';
import { BOSS_META } from '../../data/bosses.ts';
import { HALL_H } from '../../data/level.ts';
import { COLOR, PAINT } from '../../data/colors.ts';
import { ring, shootAtPoint } from '../../world/entities.ts';
import { player } from '../player.ts';
import { damagePlayer } from '../combat.ts';
import {
  bossBase,
  bossHint,
  bossMaterial,
  isEnraged,
  minionCount,
  nextPattern,
  RING_Y,
  spawnMinion,
  wireOutline,
} from './common.ts';
import { screenFx } from '../../ui/hud.ts';
// SURGEON: a surgical robot hung from the ceiling of the operating theatre. The body never moves; it turns to face the
// player. Three arms hang from it, each a minion of its own (the enemy 'sarm', which the boss holds where it wants it:
// `anchored` in src/data/types.ts); only the body's hit points are the boss's. Every `gap` seconds the next arm
// attacks, in turn: the scalpel sweeps a laser along the floor (a thin red line tells where first), the injector fires a
// fan of needles, the clamp reaches over the player and slams down on a ring of pale cyan that fills first. An arm that is
// shot off falls and its attack is gone (the body fires a ring in its place when no arm is left). Below half health the
// arms that were shot off grow back, once, and two repair drones come to mend them.

const ARM_KINDS: SurgeonArmKind[] = ['scalpel', 'needle', 'clamp'];
const SC_R = 2; // the scalpel's beam starts this far from the body's axis, under the blade (m)
const SC_Y = 3.4; // ... where the blade hangs this high above the floor
const BEAM_Y = 1.3; // the beam runs this high above the floor (chest height)
const BEAM_DY = 1.5; // ... and hurts a player whose feet are within this of the floor
const BEAM_EASE = 40; // the blade keeps up with the beam this closely (per second)
const LINE_LIFT = 0.06; // the red line and the ring lie this far above the floor (m)
const LINE_W = 0.14; // the red line is this wide (m)
const LINE_OPACITY = 0.9;
const BEAM_CORE = 0.12; // the beam's bright core is this thick (m) ...
const BEAM_GLOW = 0.55; // ... and the glow round it
const BEAM_GLOW_OPACITY = 0.45;
const STUB_W = 0.08; // the thin beam from the emitter down to where the beam runs
const NEEDLE_R = 3.8; // the injector goes out this far toward the player to fire (m)
const NEEDLE_Y = 4; // ... this high above the floor
const NEEDLE_TIP = 0.9; // the needles leave this far ahead of the injector's middle (m)
const NEEDLE_END = 0.3; // the arm lowers again this long after it fires (s)
const CLAMP_UP = 4.2; // the clamp hangs this high over its ring while it fills (m)
const CLAMP_POISED = 1.8; // ... and this high in its last quarter
const CLAMP_DOWN = 0.9; // the jaws' middle, when it is down
const CLAMP_OPEN = 0.5; // the jaws' turn when open (rad) ...
const CLAMP_SHUT = -0.1; // ... and shut
const SLAM_EASE = 45; // the clamp comes down this fast (per second)
const LAND_DY = 1.5; // the clamp crushes a player whose feet are this close to the floor it lands on (m)
const RING_FILL: [number, number] = [0.1, 0.55]; // the ring's fill, from its appearing to the slam
const RIM_OPACITY = 0.85;
const RIM_BLINK = 0.75; // the rim blinks over the last quarter of the warning
const SEG_MIN = 2.6; // each arm segment is at least this long (m) ...
const SEG_STRETCH = 0.55; // ... and, for a long reach, this share of the distance to the end
const SWAY = 0.15; // an arm at rest sways this much (m)
const GRIP = 0.01; // the least size of an arm that has just appeared
const MEDIC_R = 9; // the repair drones come in this far from the body's axis (m)
const BOB = 0.12; // the body bobs this much (m)
const BODY_REST = 1.3; // a fallen body's middle is this high above the floor (m)
const LIMB_REST = 0.25; // a fallen arm lies this high above the floor (m)
const WRECK_TILT = 0.15; // the fallen body lies this far over (rad)
const ARM_GLOW = 0.05; // an arm's glow at rest
const DEAD_LIGHTS = 0x1a1f1c; // the lights of the fallen body
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const boxUnit = shared(new THREE.BoxGeometry(1, 1, 1));
const ringGeo = shared(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2));
const discGeo = shared(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2));
const plainSegGeo = shared(new THREE.CylinderGeometry(0.12, 0.12, 1, 6));
const plainTipGeo = shared(new THREE.BoxGeometry(0.4, 0.4, 1.2));
const plainElbowGeo = shared(new THREE.IcosahedronGeometry(0.25, 0));

type Fill = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
// foe: the arm as an enemy (null once it is shot off); pos: its end now, where the hit sphere is; goal: where the boss
// holds it; ease: how fast it closes on the goal (per second); dir: which way its tool points; open: a clamp's jaws;
// age: seconds since it appeared; shoulder / elbow: where the segments meet, as last posed
interface Arm {
  kind: SurgeonArmKind;
  slot: number;
  foe: RegularEnemy | null;
  look: SurgeonArmLook;
  pos: THREE.Vector3;
  goal: THREE.Vector3;
  ease: number;
  dir: THREE.Vector3;
  open: number;
  openGoal: number;
  age: number;
  shoulder: THREE.Vector3;
  elbow: THREE.Vector3;
}
// the attack going on: arm / t (seconds since it began) / fired (the needles are away)
interface Attack {
  arm: Arm;
  t: number;
  fired: boolean;
}
// the scalpel's sweep: ac the angle of the red line (toward where the player was), dir which way it turns (±1), a the
// beam's angle now, len how far the line and the beam run past SC_R, live the beam is on, hit it has hurt the player
interface Sweep {
  ac: number;
  dir: number;
  a: number;
  len: number;
  live: boolean;
  hit: boolean;
}
// the clamp's ring on the floor: x / z its middle; slammed the clamp is down
interface Clamp {
  x: number;
  z: number;
  slammed: boolean;
}
// arms: one per slot (kinds in ARM_KINDS); atk / sweep / clamp: the attack going on and what it shows; face: where the
// body looks; made: the arms have been made (when the boss first acts); second: the second phase has begun;
// floor: the floor under the body; line / beam / glow / stub / pad / padFill / padRim: what the attacks show
type SurgeonBoss = Boss & {
  arms: Arm[];
  atk: Attack | null;
  sweep: Sweep | null;
  clamp: Clamp | null;
  face: number;
  made: boolean;
  second: boolean;
  floor: number;
  line: Fill;
  beam: Fill;
  glow: Fill;
  stub: Fill;
  padFill: Fill;
  padRim: Fill;
};
const additive = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
const flat = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
// a unit box (scaled to a bar by the caller), hidden until it is used
function bar(mat: THREE.MeshBasicMaterial): Fill {
  const m: Fill = new THREE.Mesh(boxUnit, mat);
  m.visible = false;
  dynGroup.add(m);
  return m;
}
// the body, with the looks or without
function bodyModel(mat: THREE.MeshLambertMaterial, color: number): THREE.Group {
  if (!plainLooks()) return surgeonBody(mat, color);
  const g = new THREE.Group(),
    geo = new THREE.IcosahedronGeometry(1.6, 1);
  g.add(new THREE.Mesh(geo, mat), wireOutline(geo, color));
  return g;
}
// an arm's picture, with the looks or without
function armLook(kind: SurgeonArmKind): SurgeonArmLook {
  if (!plainLooks()) return surgeonArm(kind, COLOR.repair);
  const mat = bossMaterial(0x0e1a17, COLOR.repair),
    upper = new THREE.Mesh(plainSegGeo, mat),
    fore = new THREE.Mesh(plainSegGeo, mat),
    elbow = new THREE.Mesh(plainElbowGeo, mat),
    limb = new THREE.Group(),
    end = new THREE.Group();
  limb.add(upper, fore, elbow);
  end.add(new THREE.Mesh(plainTipGeo, mat), wireOutline(plainTipGeo, COLOR.repair));
  return { end, limb, upper, fore, elbow, jaws: [], mat };
}
export function spawnSurgeon() {
  const K = BOSS_META.surgeon.tune,
    g = new THREE.Group(),
    mat = plainLooks() ? bossMaterial(0xdfe9e2, COLOR.repair) : surgeonHullMat(COLOR.repair);
  g.add(bodyModel(mat, COLOR.repair));
  const pad = new THREE.Group(),
    padFill: Fill = new THREE.Mesh(discGeo, flat(COLOR.cyan, 0)),
    padRim: Fill = new THREE.Mesh(ringGeo, flat(COLOR.cyan, 0)),
    line = bar(flat(PAINT.red1, LINE_OPACITY)),
    beam = bar(additive(0xffe6e6, 1)),
    glow = bar(additive(PAINT.red1, BEAM_GLOW_OPACITY)),
    stub = bar(additive(PAINT.red1, 0.8));
  pad.add(padFill, padRim);
  pad.visible = false;
  dynGroup.add(pad);
  const e = bossBase('surgeon', g, mat, updSurgeon, {
    arms: [] as Arm[],
    atk: null,
    sweep: null,
    clamp: null,
    face: 0,
    made: false,
    second: false,
    floor: 0,
    line,
    beam,
    glow,
    stub,
    padFill,
    padRim,
  });
  e.x = e.cx;
  e.z = e.cz;
  e.floor = floorY(e.cx, e.cz);
  e.timer = K.first;
  e.mesh.position.set(e.cx, e.floor + e.y, e.cz);
  e.extra = [...(e.extra ?? []), pad, line, beam, glow, stub];
  e.onDown = () => surgeonDown(e);
  // the column stays after the body is gone: a world object of its own (cleared with the level)
  const mount = surgeonMount(HALL_H - e.y - SURGEON_NECK);
  mount.position.set(e.cx, e.floor + e.y + SURGEON_NECK, e.cz);
  dynGroup.add(mount);
  spawn({ tag: 'mount' as const, mesh: mount });
  bossHint('boss.surgeonHint', 4600);
}

// ---- the arms ----
const alive = (arm: Arm): boolean => !!arm.foe && !arm.foe.dead;
// where arm `slot` is fixed to the body, as the body is turned now
function shoulderOf(e: SurgeonBoss, slot: number, out: THREE.Vector3): THREE.Vector3 {
  const a = (slot / ARM_KINDS.length) * Math.PI * 2 + SURGEON_SLOT_TURN;
  return out
    .set(Math.sin(a) * SURGEON_SHOULDER.r, SURGEON_SHOULDER.y, Math.cos(a) * SURGEON_SHOULDER.r)
    .applyAxisAngle(UP, e.face)
    .add(e.mesh.position);
}
// where an arm hangs at rest: out from the body in its slot's direction
function restOf(e: SurgeonBoss, arm: Arm, out: THREE.Vector3): THREE.Vector3 {
  const K = BOSS_META.surgeon.tune,
    a = e.face + (arm.slot / ARM_KINDS.length) * Math.PI * 2 + SURGEON_SLOT_TURN;
  return out.set(
    e.cx + Math.sin(a) * K.armR,
    e.floor + K.armY + Math.sin(e.t * 1.3 + arm.slot * 2) * SWAY,
    e.cz + Math.cos(a) * K.armR,
  );
}
// a new arm, hanging by its shoulder, grows out to its rest place. Its enemy is made by spawnMinion and then given the
// arm's picture; its hit points are a share of the body's
function makeArm(e: SurgeonBoss, slot: number): Arm {
  const K = BOSS_META.surgeon.tune,
    kind = ARM_KINDS[slot]!,
    look = armLook(kind),
    foe = spawnMinion('sarm', e.cx, e.cz),
    arm: Arm = {
      kind,
      slot,
      foe,
      look,
      pos: shoulderOf(e, slot, new THREE.Vector3()),
      goal: new THREE.Vector3(),
      ease: K.armEase,
      dir: new THREE.Vector3(0, -1, 0),
      open: CLAMP_OPEN,
      openGoal: CLAMP_OPEN,
      age: 0,
      shoulder: new THREE.Vector3(),
      elbow: new THREE.Vector3(),
    };
  disposeTree(foe.mesh);
  dynGroup.remove(foe.mesh);
  foe.mesh = look.end;
  foe.mat = look.mat;
  foe.baseEI = look.mat.userData.glow ?? ARM_GLOW;
  foe.hp = e.maxHp * K.armHp;
  foe.maxHp = foe.hp;
  dynGroup.add(look.end, look.limb);
  e.extra = [...(e.extra ?? []), look.limb];
  restOf(e, arm, arm.goal);
  return arm;
}
const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _pole = new THREE.Vector3();
// a bar of an arm between two points
function segment(m: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, size: number) {
  const len = from.distanceTo(to);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.scale.set(size, Math.max(len, 0.01), size);
  m.quaternion.setFromUnitVectors(UP, _a.copy(to).sub(from).normalize());
}
// the elbow between the shoulder and the end: the two segments are as long as each other and bend upward; a long reach
// stretches them
function elbowOf(s: THREE.Vector3, p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const d = s.distanceTo(p),
    seg = Math.max(SEG_MIN, d * SEG_STRETCH),
    rise = Math.sqrt(Math.max(seg * seg - (d * d) / 4, 0));
  _b.copy(p).sub(s).normalize();
  _pole.copy(UP).addScaledVector(_b, -UP.dot(_b));
  if (_pole.lengthSq() < 1e-4) _pole.set(0, 0, 1);
  _pole.normalize();
  return out.copy(s).add(p).multiplyScalar(0.5).addScaledVector(_pole, rise);
}
// lays an arm's picture along shoulder, elbow, end (`size`: how thick the segments are, 0 to 1)
function poseLook(look: SurgeonArmLook, s: THREE.Vector3, el: THREE.Vector3, p: THREE.Vector3, size: number) {
  segment(look.upper, s, el, size);
  segment(look.fore, el, p, size);
  look.elbow.position.copy(el);
  look.elbow.scale.setScalar(size);
  look.end.position.copy(p);
  look.end.scale.setScalar(size);
  look.end.quaternion.setFromUnitVectors(Z_AXIS, _a.copy(p).sub(el).normalize());
}
// one arm for one frame: it closes on its goal (the place the attack holds it to, else its rest place) and is laid out
function poseArm(e: SurgeonBoss, arm: Arm, dt: number) {
  const K = BOSS_META.surgeon.tune,
    foe = arm.foe;
  if (!foe) return;
  if (e.atk?.arm !== arm) {
    restOf(e, arm, arm.goal);
    arm.ease = K.armEase;
    arm.openGoal = CLAMP_OPEN;
  }
  arm.age += dt;
  arm.pos.lerp(arm.goal, 1 - Math.exp(-arm.ease * dt));
  arm.open += (arm.openGoal - arm.open) * Math.min(1, dt * 12);
  arm.look.jaws.forEach((j, k) => {
    j.rotation.y = (k ? 1 : -1) * arm.open;
  });
  shoulderOf(e, arm.slot, arm.shoulder);
  elbowOf(arm.shoulder, arm.pos, arm.elbow);
  arm.dir.copy(arm.pos).sub(arm.elbow).normalize();
  poseLook(arm.look, arm.shoulder, arm.elbow, arm.pos, Math.max(GRIP, Math.min(1, arm.age / K.armGrow)));
  foe.x = arm.pos.x;
  foe.z = arm.pos.z;
  foe.mesh.position.copy(arm.pos);
}
// the arm is gone (shot off): its limb and tool fall
function loseArm(e: SurgeonBoss, arm: Arm) {
  arm.foe = null;
  dropArm(e, arm);
  disposeTree(arm.look.limb);
  arm.look.limb.parent?.remove(arm.look.limb);
  e.extra = (e.extra ?? []).filter(o => o !== arm.look.limb);
  screenFx.shake = Math.max(screenFx.shake, 0.15);
  if (e.atk?.arm === arm) endAttack(e);
}
// a copy of the arm, as it was posed, falls to the floor
function dropArm(e: SurgeonBoss, arm: Arm) {
  const look = armLook(arm.kind),
    g = new THREE.Group();
  poseLook(look, arm.shoulder, arm.elbow, arm.pos, 1);
  g.add(look.limb, look.end);
  wreck(g, arm.pos.x, arm.pos.z, Math.min(arm.elbow.y, arm.pos.y) - e.floor - LIMB_REST, COLOR.repair);
}
// something falls `drop` m, lies there (dust and a thud at (x, z)), and stays with the level
function wreck(g: THREE.Object3D, x: number, z: number, drop: number, color: number, tilt = 0) {
  const K = BOSS_META.surgeon.tune,
    floor = floorY(x, z);
  dynGroup.add(g);
  let vy = 0,
    fallen = 0;
  const w: WorldObject = spawn({
    tag: 'wreck' as const,
    mesh: g,
    update(dt: number) {
      vy += K.wreckG * dt;
      const step = Math.min(vy * dt, Math.max(drop - fallen, 0));
      fallen += step;
      g.position.y -= step;
      if (fallen < drop) return;
      g.rotation.z = tilt;
      burst(x, floor + 0.3, z, PAINT.grey3, 12, 5, 1, -1);
      burst(x, floor + 0.6, z, color, 8, 6, 0.8);
      screenFx.shake = Math.max(screenFx.shake, 0.2);
      sfx('slam');
      w.update = undefined; // it lies where it fell
    },
  });
}
// the body falls to the floor with its lights out, and the arms still on it fall too; the column stays
function surgeonDown(e: SurgeonBoss) {
  e.arms.filter(alive).forEach(arm => dropArm(e, arm));
  const at = e.mesh.position,
    body = bodyModel(bossMaterial(0xaab4ac, DEAD_LIGHTS), DEAD_LIGHTS);
  body.position.copy(at);
  body.rotation.y = e.face;
  wreck(body, at.x, at.z, at.y - e.floor - BODY_REST, PAINT.grey3, WRECK_TILT);
}

// ---- the fight ----
const angleToPlayer = (e: SurgeonBoss): number => Math.atan2(player.z - e.cz, player.x - e.cx);
// the point under the scalpel's blade when the beam is at angle a
const tipAt = (e: SurgeonBoss, a: number, out: THREE.Vector3): THREE.Vector3 =>
  out.set(e.cx + Math.cos(a) * SC_R, e.floor + SC_Y, e.cz + Math.sin(a) * SC_R);
// how far the line and the beam run past SC_R: out past the player
function lenOf(e: SurgeonBoss): number {
  const K = BOSS_META.surgeon.tune;
  return Math.max(K.scalpelMin, distXZ(player, { x: e.cx, z: e.cz }) - SC_R + K.scalpelReach);
}
// a bar lying along angle a from SC_R out to SC_R + len, `h` above the floor, `w` thick
function layBar(e: SurgeonBoss, m: Fill, a: number, len: number, h: number, w: number, tall: number) {
  m.visible = true;
  m.position.set(e.cx + Math.cos(a) * (SC_R + len / 2), e.floor + h, e.cz + Math.sin(a) * (SC_R + len / 2));
  m.rotation.y = -a;
  m.scale.set(len, tall, w);
}
function hideAttack(e: SurgeonBoss) {
  e.line.visible = false;
  e.beam.visible = false;
  e.glow.visible = false;
  e.stub.visible = false;
  e.padFill.parent!.visible = false;
}
function endAttack(e: SurgeonBoss) {
  e.atk = null;
  e.sweep = null;
  e.clamp = null;
  hideAttack(e);
}
function updSurgeon(e: SurgeonBoss, dt: number) {
  const K = BOSS_META.surgeon.tune;
  e.t += dt;
  if (!e.made) {
    e.made = true;
    e.arms = ARM_KINDS.map((_, slot) => makeArm(e, slot));
  }
  const enr = isEnraged(e);
  if (enr && !e.second) secondPhase(e);
  e.face = turnToward(e.face, Math.atan2(player.x - e.cx, player.z - e.cz), K.turn * dt);
  e.mesh.rotation.y = e.face;
  e.mesh.position.set(e.cx, e.floor + e.y + Math.sin(e.t * 1.2) * BOB, e.cz);
  e.arms.forEach(arm => {
    if (arm.foe?.dead) loseArm(e, arm);
  });
  e.timer -= dt;
  if (!e.atk && e.timer <= 0) beginAttack(e, enr);
  if (e.atk) runAttack(e, dt, enr);
  e.aloft = !!e.atk; // a phase change waits for the attack to end
  e.arms.forEach(arm => poseArm(e, arm, dt));
}
// the next arm in turn attacks (a shot-off one is skipped); with none left the body fires a ring
function beginAttack(e: SurgeonBoss, enr: boolean) {
  const K = BOSS_META.surgeon.tune;
  e.timer = enr ? K.gapEnr : K.gap;
  let arm: Arm | null = null;
  for (let k = 0; k < ARM_KINDS.length && !arm; k++) {
    nextPattern(e);
    const next = e.arms[e.pat]!;
    if (alive(next)) arm = next;
  }
  if (!arm) {
    ring(e.cx, RING_Y, e.cz, K.ringN, K.ringSpeed, e.t, e.dmg, COLOR.repair);
    return;
  }
  e.atk = { arm, t: 0, fired: false };
  if (arm.kind === 'scalpel') {
    const ac = angleToPlayer(e);
    e.sweep = { ac, dir: Math.random() < 0.5 ? -1 : 1, a: ac, len: lenOf(e), live: false, hit: false };
    sfx('unlock');
  } else if (arm.kind === 'clamp') {
    e.clamp = { x: player.x, z: player.z, slammed: false };
    e.padFill.parent!.visible = true;
    sfx('unlock');
  }
}
function runAttack(e: SurgeonBoss, dt: number, enr: boolean) {
  const a = e.atk!;
  a.t += dt;
  if (a.arm.kind === 'scalpel') scalpel(e, a);
  else if (a.arm.kind === 'needle') needles(e, a, enr);
  else clampDown(e, a);
}
// the scalpel: the red line shows where, the blade goes to the start of the arc, and then the beam crosses it
function scalpel(e: SurgeonBoss, a: Attack) {
  const K = BOSS_META.surgeon.tune,
    s = e.sweep!,
    arm = a.arm;
  if (a.t < K.scalpelWarn) {
    if (a.t < K.scalpelWarn - K.scalpelLock) {
      s.ac = angleToPlayer(e);
      s.len = lenOf(e);
    }
    s.a = s.ac - (s.dir * K.scalpelArc) / 2;
    tipAt(e, s.a, arm.goal);
    arm.ease = K.armEase;
    const blink = a.t > K.scalpelWarn - K.scalpelLock && Math.sin(a.t * 60) > 0;
    layBar(e, e.line, s.ac, s.len, LINE_LIFT, LINE_W, 0.03);
    e.line.material.opacity = blink ? 0.3 : LINE_OPACITY;
    return;
  }
  const k = clamp((a.t - K.scalpelWarn) / K.scalpelSweep, 0, 1),
    before = s.a;
  if (!s.live) {
    s.live = true;
    e.line.visible = false;
    sfx('beam');
  }
  s.a = s.ac + s.dir * K.scalpelArc * (k - 0.5);
  tipAt(e, s.a, arm.goal);
  arm.ease = BEAM_EASE;
  layBar(e, e.beam, s.a, s.len, BEAM_Y, BEAM_CORE, BEAM_CORE);
  layBar(e, e.glow, s.a, s.len, BEAM_Y, BEAM_GLOW, BEAM_GLOW);
  // the thin beam from the emitter down to where the beam runs
  e.stub.visible = true;
  e.stub.position.set(e.cx + Math.cos(s.a) * SC_R, e.floor + (BEAM_Y + SC_Y) / 2, e.cz + Math.sin(s.a) * SC_R);
  e.stub.rotation.y = 0;
  e.stub.scale.set(STUB_W, SC_Y - BEAM_Y, STUB_W);
  if (!s.hit && beamTouches(e, before, s.a, s.len)) {
    s.hit = true;
    damagePlayer(e.dmg * K.scalpelDmg, { x: e.cx + Math.cos(s.a) * SC_R, z: e.cz + Math.sin(s.a) * SC_R });
  }
  if (k >= 1) endAttack(e);
}
// did the beam, turning from angle `from` to angle `to` since the last frame, cross the player
function beamTouches(e: SurgeonBoss, from: number, to: number, len: number): boolean {
  const K = BOSS_META.surgeon.tune,
    dx = player.x - e.cx,
    dz = player.z - e.cz,
    r = Math.hypot(dx, dz);
  if (r < SC_R || r > SC_R + len || Math.abs(player.fy - e.floor) > BEAM_DY) return false;
  const margin = Math.atan2(K.scalpelW + player.r, r),
    rel = wrapAngle(Math.atan2(dz, dx) - from),
    span = wrapAngle(to - from);
  return rel >= Math.min(0, span) - margin && rel <= Math.max(0, span) + margin;
}
// the injector: the arm goes out toward the player, takes aim, and fires a fan of thin fast needles
function needles(e: SurgeonBoss, a: Attack, enr: boolean) {
  const K = BOSS_META.surgeon.tune,
    arm = a.arm,
    to = angleToPlayer(e);
  if (!a.fired) {
    arm.goal.set(e.cx + Math.cos(to) * NEEDLE_R, e.floor + NEEDLE_Y, e.cz + Math.sin(to) * NEEDLE_R);
    arm.ease = K.armEase;
  }
  if (!a.fired && a.t >= K.needleWind) {
    a.fired = true;
    const n = enr ? K.needleNEnr : K.needleN,
      tip = _a.copy(arm.pos).addScaledVector(arm.dir, NEEDLE_TIP),
      vx = player.x - tip.x,
      vy = player.fy + 1.2 - tip.y,
      vz = player.z - tip.z;
    for (let k = 0; k < n; k++) {
      const turn = (k - (n - 1) / 2) * K.needleStep,
        c = Math.cos(turn),
        s = Math.sin(turn);
      shootAtPoint(
        tip.x,
        tip.y,
        tip.z,
        tip.x + vx * c - vz * s,
        tip.y + vy,
        tip.z + vx * s + vz * c,
        K.needleSpeed,
        e.dmg,
        COLOR.repair,
        K.needleSize,
      );
    }
    sfx('eshot', 60);
  }
  if (a.t >= K.needleWind + NEEDLE_END) endAttack(e);
}
// the clamp: the ring follows the player a moment and then stays, filling; the clamp reaches over it, and slams down
function clampDown(e: SurgeonBoss, a: Attack) {
  const K = BOSS_META.surgeon.tune,
    c = e.clamp!,
    arm = a.arm;
  if (!c.slammed) {
    if (a.t < K.clampTrack) {
      c.x = player.x;
      c.z = player.z;
    }
    const k = clamp(a.t / K.clampWarn, 0, 1),
      pad = e.padFill.parent!;
    pad.position.set(c.x, e.floor + LINE_LIFT, c.z);
    pad.scale.set(K.clampR, 1, K.clampR);
    e.padFill.material.opacity = RING_FILL[0] + (RING_FILL[1] - RING_FILL[0]) * k;
    e.padRim.material.opacity = k > RIM_BLINK && Math.sin(e.t * 40) > 0 ? 0 : RIM_OPACITY;
    arm.goal.set(c.x, e.floor + (k > RIM_BLINK ? CLAMP_POISED : CLAMP_UP), c.z);
    arm.ease = K.armEase;
    if (a.t >= K.clampWarn) {
      c.slammed = true;
      arm.goal.y = e.floor + CLAMP_DOWN;
      arm.ease = SLAM_EASE;
      arm.openGoal = CLAMP_SHUT;
      pad.visible = false;
      const at = { x: c.x, z: c.z };
      if (distXZ(player, at) < K.clampR && Math.abs(player.fy - e.floor) < LAND_DY)
        damagePlayer(e.dmg * K.clampDmg, at);
      burst(c.x, e.floor + 0.4, c.z, PAINT.grey3, 14, 5, 1, -1);
      burst(c.x, e.floor + 0.8, c.z, COLOR.cyan, 14, 9, 0.8);
      screenFx.shake = Math.max(screenFx.shake, 0.35);
      sfx('slam');
    }
    return;
  }
  arm.goal.set(c.x, e.floor + CLAMP_DOWN, c.z);
  arm.ease = SLAM_EASE;
  if (a.t >= K.clampWarn + K.clampHold) endAttack(e);
}
// below half health: the arms that were shot off grow back (once), and repair drones come in to mend them
function secondPhase(e: SurgeonBoss) {
  const K = BOSS_META.surgeon.tune;
  e.second = true;
  e.arms = e.arms.map((arm, slot) => (alive(arm) ? arm : makeArm(e, slot)));
  const others = minionCount() - e.arms.length, // (the arms are minions too, but not the cap's)
    n = Math.min(K.medics, K.minionCap - others),
    a0 = rand(0, Math.PI * 2);
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / K.medics) * Math.PI * 2;
    spawnMinion('medic', e.cx + Math.cos(a) * MEDIC_R, e.cz + Math.sin(a) * MEDIC_R);
  }
}
