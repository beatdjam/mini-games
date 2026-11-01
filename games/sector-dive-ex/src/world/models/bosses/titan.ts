import * as THREE from 'three';
import { basicMat } from '@engine/render/render.ts';
import { COLOR } from '../../../data/colors.ts';
import { at, ballGeo, boxGeo, cylGeo, machine } from '../machine.ts';
import { shared } from '@engine/render/render.ts';
import { HALF, plateBallGeo, prismGeo, turned } from './shared.ts';
// TITAN: nobody knows what it was built for, or if it was. It stands on two legs as a person does, and everything else
// about that is wrong. The limbs are too thin and too long, the hands hang to the floor, the ribs have nothing inside
// them, and where the head should be there is nothing: a blank pale face hangs from a long neck below the shoulders and
// keeps looking at the player, whichever way the body faces. Small eyes that do not match are scattered over the hull.
// The plates that come off in the second stage do not fit it, as if they had been put on it later.
// Its origin is the middle of its body, at TITAN_MID above the floor, and it faces +z
export const TITAN_MID = 5.5; // BOSS_META.titan.y (m)
const BODY_MID = 4.4; // the same before TITAN_SCALE: the numbers below are all before it (m)
export const TITAN_SCALE = TITAN_MID / BODY_MID; // the whole body is this much bigger
const HIP_Y = -0.9; // the hips, below the origin (m)
const LEG_LEN = BODY_MID + HIP_Y; // from the hips to the floor (m)
export const TITAN_THIGH = LEG_LEN * 0.54; // (before TITAN_SCALE)
export const TITAN_SHIN = LEG_LEN * 0.5; // a little more than the leg: it always stands with its knees bent
const RIB_ARC = Math.PI * 1.55; // how far round a rib goes (rad)
export const TITAN_HIP_Y = HIP_Y;
const SHOULDER_Y = 2.7; // the shoulders, above the origin (m)
const SHOULDER_X = 1.75; // the shoulders, to each side (m)
const NECK_Y = 2.5; // where the neck leaves the chest, above the origin (m)
const NECK_Z = 0.7; // ... and in front (m)
const NECK_LEN = 1.5; // how far the face hangs below that (m)
const BONE = 0xbfb8a6; // the plates and the face
const EYE = COLOR.titanEye;
const BONE_LIFT = 0x6e6a5c; // the plates are pale whatever light they stand in, with the hull's marks still on them
const FACE_LIFT = 0x3a3830; // ... and the face a little paler still: it should be the first thing seen
// where the small eyes are (x, y, z, size). Not in pairs and not in rows: that is the point
const EYES: [number, number, number, number][] = [
  [0.55, 2.2, 0.72, 0.13],
  [-0.2, 1.7, 0.74, 0.07],
  [-0.72, 2.45, 0.6, 0.09],
  [0.2, 0.75, 0.62, 0.05],
  [0.9, 1.1, 0.42, 0.06],
  [-0.85, 0.6, 0.38, 0.11],
  [0.35, 2.6, -0.62, 0.08],
  [-0.5, 0.4, -0.55, 0.06],
  [1.05, 1.95, -0.3, 0.05],
];
export interface TitanParts {
  g: THREE.Group;
  torso: THREE.Group;
  legL: { hip: THREE.Group; shin: THREE.Group; foot: THREE.Group };
  legR: { hip: THREE.Group; shin: THREE.Group; foot: THREE.Group };
  armL: { arm: THREE.Group; fore: THREE.Group; hand: THREE.Group };
  armR: { arm: THREE.Group; fore: THREE.Group; hand: THREE.Group };
  armour: THREE.Group; // the plates that come off
  core: THREE.Mesh; // the one big eye in the ribs, seen once the armour is off
  reactor: THREE.Mesh; // the weak point on its back
  neck: THREE.Group; // turns the face toward the player
  head: THREE.Group; // the face and what is behind it; it twitches
  mask: THREE.Mesh; // the blank face; it comes off in the third stage
  under: THREE.Group; // the eyes behind the mask
  eyes: THREE.Mesh[]; // the small eyes on the hull; they blink, each in its own time
  cables: THREE.Group[]; // what hangs out of the ribs; they sway
  halo: THREE.Group; // the broken rings of light behind its shoulders; they turn
  crown: THREE.Group; // the spears fanned out behind it
  shards: THREE.Group; // the blades that circle it
  veins: THREE.MeshBasicMaterial; // the light in its limbs and its halo; it beats
}
const HALO_Z = -1.5; // the rings, the crown: this far behind the chest (m)
const HALO_Y = 2.0;
// a broken ring of `arcs` pieces, each `arc` round (rad)
function brokenRing(r: number, tube: number, arcs: number, arc: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group(),
    geo = shared(new THREE.TorusGeometry(r, tube, 6, 24, arc));
  for (let n = 0; n < arcs; n++) {
    const piece = new THREE.Mesh(geo, mat);
    piece.rotation.z = (n / arcs) * Math.PI * 2;
    g.add(piece);
  }
  return g;
}
// a limb's length as a bundle: a thin core with cords round it and a collar every so often, so no side of it is a flat
// plate. From (0, y0, z) down by len
function bundle(mat: THREE.Material, dark: THREE.Material, y0: number, len: number, r: number, z = 0): THREE.Group {
  const b = new THREE.Group(),
    mid = y0 - len / 2;
  b.add(at(boxGeo(r * 1.1, len, r * 1.1), dark, 0, mid, z));
  for (let n = 0; n < 5; n++) {
    const a = (n / 5) * Math.PI * 2 + 0.4,
      w = r * (n % 2 ? 0.34 : 0.48);
    b.add(
      at(cylGeo(w * 0.8, w, len * (n % 2 ? 0.92 : 1), 6), mat, Math.cos(a) * r * 0.6, mid, z + Math.sin(a) * r * 0.6),
    );
  }
  const collars = Math.max(2, Math.round(len / 0.75));
  for (let n = 1; n < collars; n++) {
    const y = y0 - (n / collars) * len,
      s = 1.45 + ((n * 5) % 3) * 0.12;
    b.add(at(boxGeo(r * s, 0.07, r * s), dark, 0, y, z));
  }
  return b;
}
// cracks across a plate: thin dark lines lying just proud of its face (x, y, w, turn), at depth z
function cracks(g: THREE.Group, dark: THREE.Material, list: [number, number, number, number][], z: number) {
  for (const [x, y, w, a] of list) g.add(turned(at(boxGeo(w, 0.022, 0.02), dark, x, y, z), 0, 0, a));
}
// a leg: the thigh swings from the hip, the shin from the knee (it bends the wrong way, as a bird's does), the foot from
// the ankle, kept flat on the floor by the pose
function titanLeg(mat: THREE.Material, void_: THREE.Material, x: number, veins: THREE.Material) {
  const hip = new THREE.Group(),
    shin = new THREE.Group(),
    foot = new THREE.Group();
  hip.position.set(x, HIP_Y, 0);
  shin.position.y = -TITAN_THIGH;
  foot.position.y = -TITAN_SHIN;
  foot.add(
    turned(at(prismGeo(0.14, 0.26, 0.5, 5), void_, 0, -0.02, -0.15), HALF * 1.1, 0, 0), // the heel
  );
  for (const a of [-0.42, 0, 0.42])
    // three toes, long and splayed
    foot.add(
      turned(at(prismGeo(0.03, 0.12, 1.3, 4), void_, Math.sin(a) * 0.62, -0.03, Math.cos(a) * 0.62), HALF, 0, -a),
    );
  shin.add(
    bundle(mat, void_, 0, TITAN_SHIN, 0.28),
    at(boxGeo(0.05, TITAN_SHIN * 0.8, 0.05), veins, 0, -TITAN_SHIN * 0.5, 0.18),
    foot,
  );
  hip.add(
    bundle(mat, void_, 0, TITAN_THIGH, 0.42),
    at(boxGeo(0.06, TITAN_THIGH * 0.8, 0.06), veins, 0, -TITAN_THIGH * 0.5, 0.26),
    at(plateBallGeo(0.34), mat, 0, -TITAN_THIGH, 0), // the knee
    shin,
  );
  return { hip, shin, foot };
}
// an arm: from the shoulder, the elbow and the wrist, with three long fingers nearly to the floor
const UPPER_ARM = 2.9;
const FOREARM = 2.7;
function titanArm(mat: THREE.Material, void_: THREE.Material, x: number, veins: THREE.Material) {
  const arm = new THREE.Group(),
    fore = new THREE.Group(),
    hand = new THREE.Group();
  arm.position.set(x, SHOULDER_Y, 0);
  fore.position.y = -UPPER_ARM;
  hand.position.y = -FOREARM;
  hand.add(at(plateBallGeo(0.18), void_, 0, 0, 0));
  for (const a of [-0.32, 0, 0.34]) {
    const knuckle = new THREE.Group();
    knuckle.rotation.z = a;
    knuckle.add(at(prismGeo(0.03, 0.07, 0.75, 4), void_, 0, -0.38, 0));
    const tip = new THREE.Group();
    tip.position.y = -0.75;
    tip.rotation.x = -0.35;
    tip.add(at(prismGeo(0.005, 0.03, 0.7, 4), void_, 0, -0.35, 0));
    knuckle.add(tip);
    hand.add(knuckle);
  }
  fore.add(
    bundle(mat, void_, 0, FOREARM, 0.2),
    at(boxGeo(0.04, FOREARM * 0.8, 0.04), veins, 0, -FOREARM * 0.5, 0.13),
    hand,
  );
  arm.add(
    bundle(mat, void_, 0, UPPER_ARM, 0.28),
    at(boxGeo(0.05, UPPER_ARM * 0.8, 0.05), veins, 0, -UPPER_ARM * 0.5, 0.17),
    at(plateBallGeo(0.24), mat, 0, -UPPER_ARM, 0), // the elbow
    fore,
  );
  return { arm, fore, hand };
}
export function titanLook(mat: THREE.Material): TitanParts {
  const void_ = basicMat(0x030304),
    veins = new THREE.MeshBasicMaterial({ color: EYE }),
    bone = new THREE.MeshPhongMaterial({
      map: machine().hull,
      color: 0xffffff,
      emissive: BONE_LIFT,
      specular: 0x4a4638,
      shininess: 12,
    }),
    face = new THREE.MeshLambertMaterial({ color: BONE, emissive: FACE_LIFT }),
    eyeMat = basicMat(EYE),
    g = new THREE.Group(),
    torso = new THREE.Group(),
    armour = new THREE.Group(),
    neck = new THREE.Group(),
    head = new THREE.Group(),
    under = new THREE.Group(),
    L = titanLeg(mat, void_, -0.75, veins),
    R = titanLeg(mat, void_, 0.75, veins),
    aL = titanArm(mat, void_, -SHOULDER_X, veins),
    aR = titanArm(mat, void_, SHOULDER_X, veins),
    core = at(ballGeo(0.5), eyeMat, 0, 1.45, 0.05),
    reactor = at(ballGeo(0.62), eyeMat, 0, 1.5, -0.72),
    mask = at(ballGeo(0.62), face, 0, 0, 0.1);
  // the ribs: curved, open at the front, so the room shows through and the eye sits in the gap
  for (let n = 0; n < 7; n++) {
    const r = 0.8 + Math.sin(((n + 0.5) / 7) * Math.PI) * 0.62,
      rib = new THREE.Mesh(shared(new THREE.TorusGeometry(r, 0.055, 6, 18, RIB_ARC)), mat);
    rib.position.set(0, 0.35 + n * 0.38, -0.05);
    rib.rotation.set(HALF + 0.14, 0, HALF + (Math.PI * 2 - RIB_ARC) / 2);
    rib.scale.set(0.82, 1.1, 1);
    torso.add(rib);
  }
  // the spine, bone by bone, each with a spike
  for (let n = 0; n < 9; n++) {
    const y = -0.2 + n * 0.37;
    torso.add(
      at(prismGeo(0.12, 0.2, 0.26, 6), mat, 0, y, -0.95),
      turned(at(prismGeo(0.005, 0.07, 0.75 - n * 0.04, 4), void_, 0, y + 0.1, -1.25), -0.95, 0, 0),
    );
  }
  torso.add(
    turned(at(prismGeo(0.2, 0.42, 3.9, 6), mat, 0, SHOULDER_Y, -0.1), 0, 0, HALF), // the yoke of the shoulders
    at(prismGeo(0.42, 0.28, 0.9, 6), void_, 0, -0.35, -0.3), // the waist, thin
    at(prismGeo(0.9, 0.5, 0.5, 6), mat, 0, -0.85, 0), // the pelvis
    at(plateBallGeo(0.3), mat, -SHOULDER_X, SHOULDER_Y, 0),
    at(plateBallGeo(0.3), mat, SHOULDER_X, SHOULDER_Y, 0),
    core,
    reactor,
    armour,
    aL.arm,
    aR.arm,
  );
  // the face: a pale blank oval on a long neck, hanging below the shoulders. Behind it, a knot of eyes
  neck.position.set(0, NECK_Y, NECK_Z);
  head.position.set(0, -NECK_LEN, 0.25);
  mask.scale.set(0.72, 1, 0.42);
  under.add(at(ballGeo(0.34), void_, 0, 0, 0));
  for (const [x, y, s] of [
    [0.16, 0.14, 0.08],
    [-0.14, 0.05, 0.11],
    [0.03, -0.17, 0.06],
    [-0.2, -0.16, 0.05],
    [0.2, -0.08, 0.05],
  ] as const)
    under.add(at(ballGeo(s), eyeMat, x, y, 0.3));
  under.visible = false;
  head.add(mask, under);
  neck.add(at(boxGeo(0.11, NECK_LEN, 0.11), void_, 0, -NECK_LEN / 2, 0.1), head);
  torso.add(neck);
  // the plates: curved shells of bone that do not fit: on crooked, more on one side than the other, one over another,
  // cracked, and bolted on from outside
  const shell = (r0: number, r1: number, h: number, from: number, arc: number) =>
    shared(new THREE.CylinderGeometry(r0, r1, h, 14, 1, true, from, arc));
  bone.side = THREE.DoubleSide;
  armour.add(
    turned(at(shell(1.5, 1.2, 1.8, -0.75, 1.6), bone, 0.05, 1.75, -0.2), 0.1, 0.05, -0.08),
    turned(at(shell(1.45, 1.1, 1.1, -0.2, 1.15), bone, -0.1, 0.75, -0.25), 0.18, -0.5, 0.14),
    turned(at(shell(1.56, 1.34, 1.0, -0.9, 0.85), bone, 0, 2.3, -0.2), 0.04, 0, 0.1),
    // the great pauldron on one shoulder only, with spikes; a smaller one on the other
    turned(at(shell(0.25, 0.95, 0.7, 0, Math.PI * 2), bone, SHOULDER_X, SHOULDER_Y + 0.25, 0), 0, 0, -0.3),
    turned(at(shell(0.2, 0.55, 0.42, 0, Math.PI * 2), bone, -SHOULDER_X, SHOULDER_Y + 0.15, 0), 0, 0, 0.2),
    turned(at(prismGeo(0.01, 0.13, 1.25, 4), bone, SHOULDER_X + 0.45, SHOULDER_Y + 0.75, 0.15), 0.1, 0, -0.5),
    turned(at(prismGeo(0.01, 0.1, 0.8, 4), bone, SHOULDER_X - 0.1, SHOULDER_Y + 0.7, -0.25), -0.2, 0, 0.1),
    // a plate strapped to the thigh's height
    turned(at(shell(0.72, 0.5, 1.1, -0.9, 1.8), bone, -0.75, HIP_Y - 0.75, -0.1), 0.05, 0, 0.06),
  );
  cracks(
    armour,
    void_,
    [
      [0.4, 2.1, 0.9, 0.5],
      [-0.1, 1.75, 1.1, -0.35],
      [-0.55, 1.2, 0.7, 0.9],
      [0.6, 1.3, 0.6, -1.1],
    ],
    1.32,
  );
  for (const [x, y] of [
    [-0.8, 2.3],
    [0.85, 2.35],
    [0.85, 1.1],
    [-0.75, 0.95],
  ] as const)
    armour.add(at(cylGeo(0.05, 0.05, 0.08, 6), void_, x, y, 1.26, 'z'));
  // inside the ribs: a tangle of pipes round the eye
  for (let n = 0; n < 9; n++) {
    const a = n * 2.4,
      y = 0.5 + ((n * 7) % 9) * 0.27;
    torso.add(
      turned(
        at(cylGeo(0.035, 0.05, 2.0, 5), n % 3 ? void_ : mat, Math.cos(a) * 0.55, y, Math.sin(a) * 0.45),
        a,
        n,
        a * 0.6,
      ),
    );
  }
  cracks(
    head,
    void_,
    [
      [0.1, 0.25, 0.55, 1.1],
      [0.22, 0.05, 0.42, -0.5],
      [-0.05, -0.12, 0.6, 1.9],
      [0.28, -0.3, 0.3, 1.2],
    ],
    0.36,
  );
  const eyes = EYES.map(([x, y, z, s]) => at(ballGeo(s), eyeMat, x, y, z));
  torso.add(...eyes);
  // what hangs out of the ribs: too many to be for anything
  const cables = [-0.9, -0.55, -0.2, 0.25, 0.6, 1.0].map((x, n) => {
    const c = new THREE.Group(),
      len = 1.3 + ((n * 37) % 11) * 0.22;
    c.position.set(x, 0.5, n % 2 ? 0.6 : -0.3);
    c.add(at(cylGeo(0.025, 0.04, len, 5), void_, 0, -len / 2, 0));
    torso.add(c);
    return c;
  });
  // what a last boss wears: broken rings of light behind it, a crown of black spears with hot tips, blades circling it
  const halo = new THREE.Group(),
    crown = new THREE.Group(),
    shards = new THREE.Group();
  halo.position.set(0, HALO_Y, HALO_Z);
  halo.add(
    brokenRing(3.6, 0.07, 3, 1.5, veins),
    brokenRing(4.5, 0.04, 5, 0.8, veins),
    brokenRing(2.7, 0.03, 2, 2.4, veins),
  );
  crown.position.set(0, HALO_Y, HALO_Z - 0.2);
  for (let n = 0; n < 11; n++) {
    const a = -1.45 + (n / 10) * 2.9,
      len = 3.4 + ((n * 53) % 7) * 0.45,
      spear = new THREE.Group();
    spear.rotation.z = a;
    spear.add(
      at(cylGeo(0.02, 0.13, len, 4), void_, 0, len / 2, 0),
      at(boxGeo(0.07, 0.5, 0.07), veins, 0, len - 0.1, 0),
    );
    crown.add(spear);
  }
  for (let n = 0; n < 8; n++) {
    const a = (n / 8) * Math.PI * 2,
      blade = new THREE.Mesh(shared(new THREE.OctahedronGeometry(0.42, 0)), n % 2 ? veins : bone);
    blade.scale.set(0.45, 1.7, 0.45);
    blade.position.set(Math.cos(a) * 5, 1 + Math.sin(a * 3) * 1.4, Math.sin(a) * 5);
    shards.add(blade);
  }
  torso.add(halo, crown);
  g.add(torso, L.hip, R.hip, shards);
  g.scale.setScalar(TITAN_SCALE);
  const whole = new THREE.Group();
  whole.add(g);
  return {
    g: whole,
    torso,
    legL: L,
    legR: R,
    armL: aL,
    armR: aR,
    armour,
    core,
    reactor,
    neck,
    head,
    mask,
    under,
    eyes,
    cables,
    halo,
    crown,
    shards,
    veins,
  };
}
