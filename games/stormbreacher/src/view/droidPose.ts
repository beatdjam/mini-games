// The infantry droids' pose (SB-1640, droids SB-1745, second pass SB-1747, close form SB-2085): the body stands with its
// soles on the ground and the head rides at the top of its neck, so the two never come apart. Both are made once by
// battle/parts.ts as instanced meshes; this file only writes their matrices. The battle's crowd is split between a close
// form and a far one by `selectNearSoldiers`, so a soldier near the camera moves with the same pose but shows more of its
// shape.
//
// A droid that walks bobs a little; one that waits at the hold line squats (the body's height is drawn down and it
// leans onto its toes), which reads as a crouch without a second shape. A droid that falls turns onto its back, so the
// rifle held across the chest ends up above the sand, not through it. The death's time is the logic's (a soldier is
// alive or not); this only sets how the droid lies.
import * as THREE from 'three';
import { DROID_TUNE } from '../data/droids.ts';
import { SOLDIER_POSE } from '../data/soldiers.ts';

export interface DroidMeshes {
  bodies: THREE.InstancedMesh;
  heads: THREE.InstancedMesh;
}

// How the walk and the wait add to the standing shape. All provisional, in metres and radians.
const DROID_POSE = {
  headRise: SOLDIER_POSE.headY - SOLDIER_POSE.bodyY, // the head's middle above the body's (m)
  headLead: 0.04, // how far the head sits ahead of the body's middle (m), so the run leans from the hips
  waitSquash: 0.2, // how much shorter the body is drawn while it waits
  waitLean: 0.06, // how much it leans forward while it waits (rad)
  bobLean: 0.035, // the walk's rock forward and back (rad)
  bobLift: 0.02, // the walk's hop (m)
  bobRate: 3, // how many times the phase turns into one bob
  footHalf: 0.13, // half the foot's length: the toe's rise when the body leans (m)
  fallPitch: Math.PI / 2, // how far it turns onto its back (+x turns the top toward +z)
} as const;

const dummy = new THREE.Object3D();
dummy.rotation.order = 'YXZ'; // yaw first, then the pitch about the droid's own x, so it falls where it faces
const headAt = new THREE.Vector3();

// Writes one droid at (x, z) on the plane `baseY`, facing yaw, with `fall` from 0 (standing) to 1 (lying on its back).
// `baseY` is the ground the droid stands on: 0 on the beach, the deck's top on the craft. `ready` is 1 while it waits at
// the line, `moving` 1 while it walks, and `phase` is how far through the walk it is; the numbers keep the frame's work
// free of new objects.
export function writeDroid(
  meshes: DroidMeshes,
  index: number,
  x: number,
  baseY: number,
  z: number,
  yaw: number,
  fall: number,
  ready = 0,
  moving = 0,
  phase = 0,
): void {
  const alive = 1 - fall;
  // the wait's squat and lean fade away as the droid falls
  const squash = 1 - DROID_POSE.waitSquash * ready * alive;
  const swing = DROID_POSE.bobLean * moving * Math.sin(phase * DROID_POSE.bobRate);
  const lean = -(DROID_POSE.waitLean * ready + swing) * alive; // negative tips the top toward -z
  const hop = DROID_POSE.bobLift * moving * alive * (1 - Math.cos(phase * DROID_POSE.bobRate)) * 0.5;
  const pitch = lean + DROID_POSE.fallPitch * fall;
  // the body turns about its soles while it leans, so the toe's rise is taken out and the feet stay in the sand
  const toeRise = DROID_POSE.footHalf * Math.abs(Math.sin(lean)) * alive;
  const standY = baseY + SOLDIER_POSE.bodyY * squash * Math.cos(lean) + toeRise + hop;
  const standZ = z + SOLDIER_POSE.bodyY * squash * Math.sin(lean);
  const deadY = baseY + SOLDIER_POSE.bodyDeadY;
  const posY = standY + (deadY - standY) * fall;
  const posZ = standZ + (z - standZ) * fall;

  dummy.position.set(x, posY, posZ);
  dummy.rotation.set(pitch, yaw, 0);
  dummy.scale.set(1, squash, 1);
  dummy.updateMatrix();
  meshes.bodies.setMatrixAt(index, dummy.matrix);

  // the head rides the same turn at the top of the neck; the neck reaches into its base, so no gap opens at any pose.
  // The run's forward lead fades out as it falls, so the back of the head comes down on the sand with the body's.
  headAt.set(0, DROID_POSE.headRise, -DROID_POSE.headLead * alive).applyMatrix4(dummy.matrix);
  dummy.position.copy(headAt);
  dummy.scale.set(1, 1, 1);
  dummy.updateMatrix();
  meshes.heads.setMatrixAt(index, dummy.matrix);
}

// Shows the first `count` droids and hides the rest (an instanced mesh with no instances is not drawn at all).
export function showDroid(meshes: DroidMeshes, count: number): void {
  meshes.bodies.count = count;
  meshes.bodies.visible = count > 0;
  meshes.heads.count = count;
  meshes.heads.visible = count > 0;
}

// The soldiers that take the close form this frame (SB-2085): the nearest ones within `distance` of the camera, nearest
// first, and no more than `cap` of them. The rest keep the far form, so one soldier is never drawn in both. A soldier
// stands on the beach's ground (y = 0), which the camera's own height is measured against. `out` is filled and returned,
// so a caller that runs every frame can keep the list between frames.
export function selectNearSoldiers(
  soldiers: readonly { x: number; z: number }[],
  eye: { x: number; y: number; z: number },
  distance: number = DROID_TUNE.nearDistance,
  cap: number = DROID_TUNE.nearCap,
  out: number[] = [],
): number[] {
  const limit = distance * distance;
  const distanceTo = (index: number): number => {
    const soldier = soldiers[index];
    const dx = soldier.x - eye.x;
    const dz = soldier.z - eye.z;
    return dx * dx + eye.y * eye.y + dz * dz;
  };
  out.length = 0;
  for (let i = 0; i < soldiers.length; i++) if (distanceTo(i) <= limit) out.push(i);
  out.sort((a, b) => distanceTo(a) - distanceTo(b) || a - b);
  out.length = Math.min(out.length, Math.max(0, Math.floor(cap)));
  return out;
}

// Tells three that the matrices written this frame are new.
export function droidMatricesChanged(meshes: DroidMeshes): void {
  meshes.bodies.instanceMatrix.needsUpdate = true;
  meshes.heads.instanceMatrix.needsUpdate = true;
}
