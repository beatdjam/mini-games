import * as THREE from 'three';
import { basicMat } from '@engine/render/render.ts';
import { at, ballGeo, boxGeo, cylGeo } from '../machine.ts';
import { shared } from '@engine/render/render.ts';
import { turned } from './shared.ts';
// TITAN: nobody knows what it was built for, or if it was. It stands on two legs as a person does, and everything else
// about that is wrong. The limbs are too thin and too long, the hands hang to the floor, the ribs have nothing inside
// them, and where the head should be there is nothing: a blank pale face hangs from a long neck below the shoulders and
// keeps looking at the player, whichever way the body faces. Small eyes that do not match are scattered over the hull.
// The plates that come off in the second stage do not fit it, as if they had been put on it later.
// Its origin is the middle of its body, at TITAN_MID above the floor, and it faces +z
export const TITAN_MID = 5.5; // BOSS_META.titan.y (m)
const BODY_MID = 4.4; // the same before TITAN_SCALE: the numbers below are all before it (m)
const TITAN_SCALE = TITAN_MID / BODY_MID; // the whole body is this much bigger
const HIP_Y = -0.9; // the hips, below the origin (m)
const LEG_LEN = BODY_MID + HIP_Y; // from the hips to the floor (m)
const SHOULDER_Y = 2.7; // the shoulders, above the origin (m)
const SHOULDER_X = 1.75; // the shoulders, to each side (m)
const NECK_Y = 2.5; // where the neck leaves the chest, above the origin (m)
const NECK_Z = 0.7; // ... and in front (m)
const NECK_LEN = 1.5; // how far the face hangs below that (m)
const BONE = 0xbfb8a6; // the plates and the face
const EYE = 0xff2a18;
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
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
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
function titanLeg(mat: THREE.Material, void_: THREE.Material, x: number, veins: THREE.Material): THREE.Group {
  const leg = new THREE.Group();
  leg.position.set(x, HIP_Y, 0);
  leg.add(
    at(boxGeo(0.42, LEG_LEN * 0.55, 0.5), mat, 0, -LEG_LEN * 0.27, 0.12), // the thigh
    at(ballGeo(0.34), void_, 0, -LEG_LEN * 0.54, 0.2), // the knee: it bends the wrong way
    at(boxGeo(0.3, LEG_LEN * 0.5, 0.34), mat, 0, -LEG_LEN * 0.76, -0.1), // the shin
    at(boxGeo(0.5, 0.14, 1.5), void_, 0, -LEG_LEN + 0.07, 0.3), // the foot, long and flat
    at(boxGeo(0.06, LEG_LEN * 0.9, 0.06), veins, 0, -LEG_LEN * 0.48, 0.38), // the light down its leg
  );
  return leg;
}
function titanArm(mat: THREE.Material, void_: THREE.Material, x: number, veins: THREE.Material): THREE.Group {
  const arm = new THREE.Group();
  arm.position.set(x, SHOULDER_Y, 0);
  arm.add(
    at(boxGeo(0.3, 2.9, 0.3), mat, 0, -1.45, 0), // the upper arm
    at(ballGeo(0.24), void_, 0, -2.95, 0), // the elbow
    at(boxGeo(0.22, 2.7, 0.24), mat, 0, -4.3, 0), // the forearm
    at(boxGeo(0.05, 5.4, 0.05), veins, 0, -2.9, 0.18), // the light down its arm
  );
  // three long fingers, nearly to the floor
  for (const a of [-0.28, 0, 0.3]) {
    const f = at(boxGeo(0.07, 1.25, 0.09), void_, Math.sin(a) * 0.5, -6.1, Math.abs(a) * 0.2);
    f.rotation.z = a;
    arm.add(f);
  }
  return arm;
}
export function titanLook(mat: THREE.Material): TitanParts {
  const void_ = basicMat(0x030304),
    veins = new THREE.MeshBasicMaterial({ color: EYE }),
    bone = new THREE.MeshLambertMaterial({ color: BONE }),
    eyeMat = basicMat(EYE),
    g = new THREE.Group(),
    torso = new THREE.Group(),
    armour = new THREE.Group(),
    neck = new THREE.Group(),
    head = new THREE.Group(),
    under = new THREE.Group(),
    legL = titanLeg(mat, void_, -0.75, veins),
    legR = titanLeg(mat, void_, 0.75, veins),
    armL = titanArm(mat, void_, -SHOULDER_X, veins),
    armR = titanArm(mat, void_, SHOULDER_X, veins),
    core = at(ballGeo(0.5), eyeMat, 0, 1.45, 0.05),
    reactor = at(ballGeo(0.62), eyeMat, 0, 1.5, -0.72),
    mask = at(ballGeo(0.62), bone, 0, 0, 0.1);
  // the ribs: bars round an empty chest, so the room shows through
  for (let n = 0; n < 6; n++) {
    const y = 0.45 + n * 0.42,
      w = 1.05 + Math.sin((n / 5) * Math.PI) * 0.35;
    torso.add(
      at(boxGeo(w * 2, 0.12, 0.12), mat, 0, y, 0.72),
      at(boxGeo(0.12, 0.12, 1.4), mat, w, y, 0),
      at(boxGeo(0.12, 0.12, 1.4), mat, -w, y, 0),
      at(boxGeo(w * 2, 0.12, 0.12), mat, 0, y, -0.72),
    );
  }
  torso.add(
    at(boxGeo(0.34, 3.2, 0.3), mat, 0, 1.4, -0.7), // the spine
    at(boxGeo(3.9, 0.3, 0.5), mat, 0, SHOULDER_Y, 0), // the yoke of the shoulders: narrow, and too wide for the chest
    at(boxGeo(0.9, 0.9, 0.7), void_, 0, -0.35, 0), // the waist, thin
    at(boxGeo(1.8, 0.35, 0.8), mat, 0, -0.85, 0), // the pelvis
    core,
    reactor,
    armour,
    armL,
    armR,
  );
  // the spines up its back
  for (let n = 0; n < 5; n++)
    torso.add(turned(at(boxGeo(0.07, 0.7 - n * 0.06, 0.07), void_, 0, 0.5 + n * 0.6, -1.0), -0.7, 0, 0));
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
  // the plates: bone, put on crooked, and more on one side than on the other
  armour.add(
    turned(at(boxGeo(2.1, 1.5, 0.14), bone, 0.15, 1.7, 0.86), 0.08, 0.1, -0.09),
    turned(at(boxGeo(1.2, 0.9, 0.12), bone, -0.5, 0.75, 0.82), -0.1, -0.15, 0.2),
    turned(at(boxGeo(1.3, 0.3, 1.0), bone, SHOULDER_X, SHOULDER_Y + 0.22, 0), 0, 0.2, -0.28),
    turned(at(boxGeo(0.34, 1.5, 0.42), bone, SHOULDER_X, 1.5, 0), 0.05, 0, 0.05),
    turned(at(boxGeo(0.5, 1.1, 0.6), bone, -0.75, HIP_Y - 0.7, 0.2), -0.1, 0, 0.08),
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
  g.add(torso, legL, legR, shards);
  g.scale.setScalar(TITAN_SCALE);
  const whole = new THREE.Group();
  whole.add(g);
  return {
    g: whole,
    torso,
    legL,
    legR,
    armL,
    armR,
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
