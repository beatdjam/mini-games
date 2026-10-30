import {
  SURGEON_NECK,
  SURGEON_SHOULDER,
  SURGEON_SLOT_TURN,
  surgeonArm,
  surgeonBody,
  surgeonHullMat,
  surgeonMount,
} from '../../world/models/surgeonLooks.ts';
import type { SurgeonArmKind, SurgeonArmLook, SurgeonBodyLook } from '../../world/models/surgeonLooks.ts';
import { plainLooks } from '../../world/looks.ts';
import type { Boss, RegularEnemy } from '../../data/types.ts';
import * as THREE from 'three';
import { clamp, distXZ, rand, turnToward, wrapAngle } from '@engine/core/util.ts';
import { sfx } from '@engine/audio/audio.ts';
import { disposeTree, dynGroup, shared } from '@engine/render/render.ts';
import { burst, fireball } from '@engine/render/fx.ts';
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
  bossMaterial,
  createBoss,
  isEnraged,
  minionCount,
  nextPattern,
  RING_Y,
  spawnMinion,
  wireOutline,
} from './common.ts';
import type { BossVisual } from './common.ts';
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
const BEAM_GLOW = 0.55; // ... the glow round it ...
const BEAM_AURA = 1.3; // ... and the soft light round that
const BEAM_GLOW_OPACITY = 0.45;
const BEAM_AURA_OPACITY = 0.16;
const BEAM_FLICKER = 0.15; // the glow flickers this much (rate: BEAM_FLICKER_RATE per second)
const BEAM_FLICKER_RATE = 50;
const SCORCH_W = 1.1; // the glow on the floor under the line and the beam is this wide (m)
const SCORCH_WARN = 0.2; // ... and this strong under the line, this under the beam
const SCORCH_BEAM = 0.5;
const SPARK_ODDS = 0.8; // each frame the beam is on, the odds of sparks flying off the floor under it
const EMIT_REACH = 2.05; // the scalpel's emitter is this far ahead of the tool's middle (m)
const STUB_W = 0.08; // the thin beam from the emitter down to where the beam runs
const NEEDLE_R = 3.8; // the injector goes out this far toward the player to fire (m)
const NEEDLE_Y = 4; // ... this high above the floor
const NEEDLE_TIP = 0.9; // the needles leave this far ahead of the injector's middle (m)
const NEEDLE_END = 0.3; // the arm lowers again this long after it fires (s) (and the muzzle flares as long)
const DRUM_IDLE = 1.5; // an injector's drum turns this fast at rest (rad/s) ...
const DRUM_FIRE = 30; // ... and when it is about to fire
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
const PULSE_RATE = 9; // the ring's edge pulses this fast (rad/s) ...
const PULSE_GROW = 0.1; // ... swelling this much of the radius
const SHOCK_LIFE = 0.35; // the slam's ring of dust spreads for this long (s) ...
const SHOCK_GROW = 2.2; // ... out to this many times the ring's radius
const LENS_YAW = 0.5; // the body's main lens turns this far to follow the player (rad) ...
const LENS_PITCH = 0.5;
const LENS_EASE = 8; // ... and keeps up this closely (per second)
const LAMP_IDLE = 0xdff3ea; // the operating light's colour at rest (an attack tints it)
const LAMP_REST = 0.8; // ... and how bright it is at rest, and in an attack
const LAMP_ATTACK = 0.8;
const SEG_MIN = 2.6; // each arm segment is at least this long (m) ...
const SEG_STRETCH = 0.55; // ... and, for a long reach, this share of the distance to the end
const SWAY = 0.15; // an arm at rest sways this much (m)
const GRIP = 0.01; // the least size of an arm that has just appeared
const MEDIC_R = 9; // the repair drones come in this far from the body's axis (m)
const BOB = 0.12; // the body bobs this much (m)
const BODY_REST = 1.3; // a fallen body's middle is this high above the floor (m)
const LIMB_REST = 0.25; // a fallen arm lies this high above the floor (m)
const WRECK_TILT = 0.15; // the fallen body lies this far over (rad)
const BODY_HANG = 1.1; // the body hangs dead this long, sparking, before it drops (s) ...
const BODY_SAG = 0.4; // ... sagging this far (m)
const LIMB_HANG: [number, number] = [0.05, 0.3]; // a dead arm hangs this long (s) ...
const LIMB_SPIN = 1.6; // ... and turns this fast as it falls (rad/s, either way)
const SPARK_GAP = 0.09; // seconds between sparks off what is dying
const LENS_DROOP = 0.6; // the dead body's lens hangs this far down (rad)
const ARM_GLOW = 0.05; // an arm's glow at rest
const DEAD_LIGHTS = 0x1a1f1c; // the lights of the fallen body
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const boxUnit = shared(new THREE.BoxGeometry(1, 1, 1));
const ringGeo = shared(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2));
const innerGeo = shared(new THREE.RingGeometry(0.5, 0.54, 48).rotateX(-Math.PI / 2));
const discGeo = shared(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2));
const plainSegGeo = shared(new THREE.CylinderGeometry(0.12, 0.12, 1, 6));
const plainTipGeo = shared(new THREE.BoxGeometry(0.4, 0.4, 1.2));
const plainElbowGeo = shared(new THREE.IcosahedronGeometry(0.25, 0));

type Fill = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
// foe: the arm as an enemy (null once it is shot off); pos: its end now, where the hit sphere is; goal: where the boss
// holds it; ease: how fast it closes on the goal (per second); dir: which way its tool points; open: a clamp's jaws;
// age: seconds since it appeared; shoulder / elbow / pole: where the segments meet and which way they bend, as last
// posed; drum / drumV: an injector's drum, its angle and its speed (rad, rad/s)
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
  pole: THREE.Vector3;
  drum: number;
  drumV: number;
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
// floor: the floor under the body; look: the body's picture; line / scorch / beam / glow / aura / stub: what the
// scalpel shows (the line and the glow on the floor, the beam in three layers, the thin beam down from the blade);
// padFill / padRim / padCore / padInner / padPulse: the clamp's ring (padFill's parent is the ring); shock: the dust
// ring of a slam (t: seconds since, -1 when there is none; x / z where)
type SurgeonBoss = Boss & {
  arms: Arm[];
  atk: Attack | null;
  sweep: Sweep | null;
  clamp: Clamp | null;
  face: number;
  made: boolean;
  second: boolean;
  floor: number;
  look: SurgeonBodyLook;
  line: Fill;
  scorch: Fill;
  beam: Fill;
  glow: Fill;
  aura: Fill;
  stub: Fill;
  padFill: Fill;
  padRim: Fill;
  padCore: Fill;
  padInner: Fill;
  padPulse: Fill;
  shock: { mesh: Fill; t: number; x: number; z: number };
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
// the body's enamel: the boss's, or a dead body's (its glow is out)
const bodyMat = (color: number): THREE.MeshLambertMaterial =>
  plainLooks() ? bossMaterial(0xdfe9e2, color) : surgeonHullMat(color);
// the body, with the looks or without
function bodyModel(mat: THREE.MeshLambertMaterial, color: number): SurgeonBodyLook {
  if (!plainLooks()) return surgeonBody(mat, color);
  const g = new THREE.Group(),
    geo = new THREE.IcosahedronGeometry(1.6, 1);
  g.add(new THREE.Mesh(geo, mat), wireOutline(geo, color));
  return { g, lens: null, light: () => undefined };
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
  return {
    end,
    limb,
    mat,
    pose(s, el, p, _pole, size) {
      segment(upper, s, el, size);
      segment(fore, el, p, size);
      elbow.position.copy(el);
      elbow.scale.setScalar(size);
      end.position.copy(p);
      end.scale.setScalar(size);
      end.quaternion.setFromUnitVectors(Z_AXIS, _a.copy(p).sub(el).normalize());
    },
    open: () => undefined,
    heat: () => undefined,
    spin: () => undefined,
  };
}
// how SURGEON's body looks (common.ts BossVisual), with its parts that light up (look). Its arms are enemies of their
// own, made as it unfolds them (makeArm); the column it hangs from is the room's (surgeonMount)
export function surgeonVisual(): BossVisual & { look: SurgeonBodyLook } {
  const g = new THREE.Group(),
    mat = bodyMat(COLOR.repair),
    look = bodyModel(mat, COLOR.repair);
  g.add(look.g);
  return { mesh: g, mat, look };
}
export function spawnSurgeon() {
  const K = BOSS_META.surgeon.tune,
    body = surgeonVisual();
  const pad = new THREE.Group(),
    padFill: Fill = new THREE.Mesh(discGeo, flat(COLOR.cyan, 0)),
    padRim: Fill = new THREE.Mesh(ringGeo, flat(COLOR.cyan, 0)),
    padCore: Fill = new THREE.Mesh(discGeo, additive(COLOR.cyan, 0)),
    padInner: Fill = new THREE.Mesh(innerGeo, flat(COLOR.cyan, 0)),
    padPulse: Fill = new THREE.Mesh(ringGeo, additive(COLOR.cyan, 0)),
    line = bar(flat(PAINT.red1, LINE_OPACITY)),
    scorch = bar(additive(PAINT.red1, 0)),
    beam = bar(additive(0xffe6e6, 1)),
    glow = bar(additive(PAINT.red1, BEAM_GLOW_OPACITY)),
    aura = bar(additive(PAINT.red1, BEAM_AURA_OPACITY)),
    stub = bar(additive(PAINT.red1, 0.8)),
    shockMesh: Fill = new THREE.Mesh(ringGeo, additive(COLOR.cyan, 0));
  pad.add(padFill, padCore, padInner, padRim, padPulse);
  pad.visible = false;
  shockMesh.visible = false;
  dynGroup.add(pad, shockMesh);
  const e = createBoss({
    kind: 'surgeon',
    look: body,
    behave: updSurgeon,
    state: {
      arms: [] as Arm[],
      atk: null,
      sweep: null,
      clamp: null,
      face: 0,
      made: false,
      second: false,
      floor: 0,
      look: body.look,
      line,
      scorch,
      beam,
      glow,
      aura,
      stub,
      padFill,
      padRim,
      padCore,
      padInner,
      padPulse,
      shock: { mesh: shockMesh, t: -1, x: 0, z: 0 },
    },
    centred: true,
    timer: K.first,
    extra: [pad, shockMesh, line, scorch, beam, glow, aura, stub],
    onDown: surgeonDown,
    hint: ['boss.surgeonHint', 4600],
  });
  e.floor = floorY(e.cx, e.cz);
  e.mesh.position.set(e.cx, e.floor + e.y, e.cz);
  // the column stays after the body is gone: a world object of its own (cleared with the level)
  const mount = surgeonMount(HALL_H - e.y - SURGEON_NECK);
  mount.position.set(e.cx, e.floor + e.y + SURGEON_NECK, e.cz);
  dynGroup.add(mount);
  spawn({ tag: 'mount' as const, mesh: mount });
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
      pole: new THREE.Vector3(0, 1, 0),
      drum: 0,
      drumV: DRUM_IDLE,
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
  _c = new THREE.Vector3(),
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
  shoulderOf(e, arm.slot, arm.shoulder);
  elbowOf(arm.shoulder, arm.pos, arm.elbow);
  arm.pole.copy(_pole);
  arm.dir.copy(arm.pos).sub(arm.elbow).normalize();
  arm.look.open(arm.open);
  arm.look.pose(arm.shoulder, arm.elbow, arm.pos, arm.pole, Math.max(GRIP, Math.min(1, arm.age / K.armGrow)));
  // the tool shows what it is about to do: the scalpel's emitter heats, the injector's drum spins up and flares
  const a = e.atk?.arm === arm ? e.atk : null;
  let heat = 0,
    spinTo = DRUM_IDLE;
  if (a && arm.kind === 'scalpel') heat = a.t < K.scalpelWarn ? 0.3 + (0.7 * a.t) / K.scalpelWarn : 1;
  if (a && arm.kind === 'needle') {
    spinTo = DRUM_FIRE;
    if (a.fired) heat = Math.max(0, 1 - (a.t - K.needleWind) / NEEDLE_END);
  }
  arm.drumV += (spinTo - arm.drumV) * Math.min(1, dt * 5);
  arm.drum += arm.drumV * dt;
  arm.look.heat(heat);
  arm.look.spin(arm.drum);
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
// a copy of the arm, as it was posed, falls to the floor: it hangs a moment, sparking, then drops and turns as it goes
// (its picture is in world places: it turns about a pivot over the tool)
function dropArm(e: SurgeonBoss, arm: Arm) {
  const look = armLook(arm.kind),
    pivot = new THREE.Group(),
    g = new THREE.Group();
  look.open(arm.open);
  look.pose(arm.shoulder, arm.elbow, arm.pos, arm.pole, 1);
  g.add(look.limb, look.end);
  g.position.set(-arm.pos.x, 0, -arm.pos.z);
  pivot.position.set(arm.pos.x, 0, arm.pos.z);
  pivot.add(g);
  wreck(pivot, arm.pos.x, arm.pos.z, Math.min(arm.elbow.y, arm.pos.y) - e.floor - LIMB_REST, COLOR.repair, {
    hang: rand(LIMB_HANG[0], LIMB_HANG[1]),
    spin: rand(-LIMB_SPIN, LIMB_SPIN),
    sparkY: arm.pos.y,
  });
}
// how a thing that is shot down goes: hang (s) sparking, sagging, its lights flickering (dim(life), life from 1 to 0);
// then fall; spin (rad/s) turns it as it falls; tilt (rad) is how far over it lies; sparkY is where its sparks come
// from (m above the floor, as it hangs)
interface Wreck {
  tilt?: number;
  hang?: number;
  spin?: number;
  sparkY?: number;
  dim?: (life: number) => void;
}
// something falls `drop` m, lies there (dust and a thud at (x, z)), and stays with the level
function wreck(g: THREE.Object3D, x: number, z: number, drop: number, color: number, opt: Wreck = {}) {
  const K = BOSS_META.surgeon.tune,
    floor = floorY(x, z),
    hang = opt.hang ?? 0,
    sag = Math.min(BODY_SAG, drop / 2),
    y0 = g.position.y;
  dynGroup.add(g);
  let vy = 0,
    fallen = 0,
    t = 0,
    sparkIn = 0,
    dark = false;
  const w: WorldObject = spawn({
    tag: 'wreck' as const,
    mesh: g,
    update(dt: number) {
      t += dt;
      sparkIn -= dt;
      if (sparkIn <= 0 && fallen < drop) {
        sparkIn = SPARK_GAP;
        burst(
          x + rand(-0.4, 0.4),
          (opt.sparkY ?? y0) + g.position.y - y0 + rand(-0.4, 0.4),
          z + rand(-0.4, 0.4),
          PAINT.amber3,
          3,
          5,
          0.5,
        );
      }
      if (t < hang) {
        // hanging: sagging and shaking, the lights flickering out
        const u = t / hang;
        fallen = sag * u * u;
        g.position.y = y0 - fallen;
        g.rotation.z = Math.sin(t * 45) * 0.025 * (1 - u);
        opt.dim?.(Math.random() < 1 - u ? 1 - u * 0.5 : 0.05);
        return;
      }
      if (!dark) {
        dark = true;
        opt.dim?.(0);
      }
      vy += K.wreckG * dt;
      const step = Math.min(vy * dt, Math.max(drop - fallen, 0));
      fallen += step;
      g.position.y -= step;
      g.rotation.y += (opt.spin ?? 0) * dt;
      g.rotation.z = (opt.tilt ?? 0) * Math.min(fallen / Math.max(drop, 0.01), 1);
      if (fallen < drop) return;
      burst(x, floor + 0.3, z, PAINT.grey3, 12, 5, 1, -1);
      burst(x, floor + 0.6, z, color, 8, 6, 0.8);
      screenFx.shake = Math.max(screenFx.shake, 0.2);
      sfx('slam');
      w.update = undefined; // it lies where it fell
    },
  });
}
// the body hangs, sparking, with its lights flickering out, and drops to the floor; the arms still on it fall too; the
// gantry stays
function surgeonDown(e: SurgeonBoss) {
  e.arms.filter(alive).forEach(arm => dropArm(e, arm));
  const at = e.mesh.position,
    look = bodyModel(bodyMat(DEAD_LIGHTS), COLOR.repair);
  look.g.position.copy(at);
  look.g.rotation.y = e.face;
  if (look.lens && e.look.lens) look.lens.rotation.set(LENS_DROOP, e.look.lens.rotation.y, 0);
  wreck(look.g, at.x, at.z, at.y - e.floor - BODY_REST, PAINT.grey3, {
    tilt: WRECK_TILT,
    hang: BODY_HANG,
    dim: life => look.light(life, COLOR.repair, 1),
  });
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
// a thin bar from one point to another
function layStub(m: Fill, from: THREE.Vector3, to: THREE.Vector3) {
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, _c.copy(to).sub(from).normalize());
  m.scale.set(STUB_W, from.distanceTo(to), STUB_W);
}
function hideAttack(e: SurgeonBoss) {
  e.line.visible = false;
  e.scorch.visible = false;
  e.beam.visible = false;
  e.glow.visible = false;
  e.aura.visible = false;
  e.stub.visible = false;
  e.padFill.parent!.visible = false;
}
const LAMP_TINT: Record<SurgeonArmKind, number> = { scalpel: PAINT.red1, needle: COLOR.repair, clamp: COLOR.cyan };
// the body's looks: the main lens follows the player, and the operating light shows the colour of the attack
function dressBody(e: SurgeonBoss, dt: number) {
  const lens = e.look.lens,
    a = e.atk;
  e.look.light(
    1,
    a ? LAMP_TINT[a.arm.kind] : LAMP_IDLE,
    a ? LAMP_ATTACK + (1 - LAMP_ATTACK) * Math.sin(e.t * 16) : LAMP_REST,
  );
  if (!lens) return;
  // where the player is, in the body's own frame
  const at = e.mesh.position,
    dx = player.x - at.x,
    dz = player.z - at.z,
    lx = dx * Math.cos(e.face) - dz * Math.sin(e.face),
    lz = dx * Math.sin(e.face) + dz * Math.cos(e.face),
    yaw = clamp(Math.atan2(lx, lz), -LENS_YAW, LENS_YAW),
    pitch = clamp(Math.atan2(at.y - (player.fy + 1.2), Math.hypot(lx, lz)), -LENS_PITCH, LENS_PITCH),
    k = Math.min(1, dt * LENS_EASE);
  lens.rotation.order = 'YXZ';
  lens.rotation.y += (yaw - lens.rotation.y) * k;
  lens.rotation.x += (pitch - lens.rotation.x) * k;
}
// the slam's ring of dust spreads and fades
function updShock(e: SurgeonBoss, dt: number) {
  const s = e.shock;
  if (s.t < 0) return;
  s.t += dt;
  const k = s.t / SHOCK_LIFE;
  s.mesh.visible = k < 1;
  if (k >= 1) {
    s.t = -1;
    return;
  }
  const r = BOSS_META.surgeon.tune.clampR * (1 + (SHOCK_GROW - 1) * k);
  s.mesh.position.set(s.x, e.floor + LINE_LIFT + 0.02, s.z);
  s.mesh.scale.set(r, 1, r);
  s.mesh.material.opacity = 0.7 * (1 - k);
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
  dressBody(e, dt);
  updShock(e, dt);
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
    layBar(e, e.scorch, s.ac, s.len, LINE_LIFT - 0.01, SCORCH_W, 0.02);
    e.scorch.material.opacity = blink ? 0.05 : SCORCH_WARN * (0.5 + (0.5 * a.t) / K.scalpelWarn);
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
  layBar(e, e.aura, s.a, s.len, BEAM_Y, BEAM_AURA, BEAM_AURA);
  e.glow.material.opacity = BEAM_GLOW_OPACITY * (1 + BEAM_FLICKER * Math.sin(e.t * BEAM_FLICKER_RATE));
  // the glow where the beam's light falls on the floor, and sparks off the floor under it
  layBar(e, e.scorch, s.a, s.len, LINE_LIFT, SCORCH_W, 0.02);
  e.scorch.material.opacity = SCORCH_BEAM;
  if (Math.random() < SPARK_ODDS) {
    const d = SC_R + rand(0.1, 1) * s.len;
    burst(e.cx + Math.cos(s.a) * d, e.floor + 0.12, e.cz + Math.sin(s.a) * d, PAINT.amber3, 2, 5, 0.5);
  }
  // the thin beam from the emitter on the blade down to where the beam runs
  e.stub.visible = true;
  layStub(
    e.stub,
    _a.copy(arm.pos).addScaledVector(arm.dir, EMIT_REACH),
    _b.set(e.cx + Math.cos(s.a) * SC_R, e.floor + BEAM_Y, e.cz + Math.sin(s.a) * SC_R),
  );
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
        true,
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
    const blink = k > RIM_BLINK && Math.sin(e.t * 40) > 0;
    e.padRim.material.opacity = blink ? 0 : RIM_OPACITY;
    // the ring fills from its middle as the clamp comes, a thin ring inside it, and its edge pulses outward
    e.padCore.scale.set(k, 1, k);
    e.padCore.material.opacity = 0.45 * k;
    e.padInner.material.opacity = blink ? 0 : 0.6;
    const beat = 0.5 + 0.5 * Math.sin(e.t * PULSE_RATE);
    e.padPulse.scale.set(1 + PULSE_GROW * beat, 1, 1 + PULSE_GROW * beat);
    e.padPulse.material.opacity = blink ? 0 : (0.2 + 0.4 * k) * (1 - beat);
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
      burst(c.x, e.floor + 0.4, c.z, PAINT.grey3, 20, 6, 1, -1);
      burst(c.x, e.floor + 0.8, c.z, COLOR.cyan, 14, 9, 0.8);
      burst(c.x, e.floor + 0.3, c.z, PAINT.amber3, 12, 10, 0.6);
      fireball(c.x, e.floor + 0.4, c.z, K.clampR * 0.8, COLOR.cyan);
      e.shock.t = 0;
      e.shock.x = c.x;
      e.shock.z = c.z;
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
