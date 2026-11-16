// The infantry droids' pose (SB-1640, droids SB-1745, second pass SB-1747): the body stands with its soles on the ground
// and the head rides at the top of its neck, so the two never come apart. Both are made once by battle/parts.ts as
// instanced meshes; this file only writes their matrices.
//
// A droid that walks bobs a little; one that waits at the hold line squats (the body's height is drawn down and it
// leans onto its toes), which reads as a crouch without a second shape. A droid that falls turns onto its back, so the
// rifle held across the chest ends up above the sand, not through it. The death's time is the logic's (a soldier is
// alive or not); this only sets how the droid lies.
import * as THREE from 'three';
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

// Tells three that the matrices written this frame are new.
export function droidMatricesChanged(meshes: DroidMeshes): void {
  meshes.bodies.instanceMatrix.needsUpdate = true;
  meshes.heads.instanceMatrix.needsUpdate = true;
}
