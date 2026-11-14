// Draws the prototype mech (SB-1468, second pass SB-1469, third pass SB-1471): the table in data/mechProto.ts, built
// out of view/mechShapes.ts and merged by material, so a mech of a hundred shapes costs a handful of draws. The joints
// are a small skeleton: the hips, a knee and an ankle on each leg, a shoulder and an elbow on each arm, and the head, so
// the mech stands with its knees bent and its torso forward, walks with a knee lift, folds its legs in the air and dips
// its elbow as it fires. Each shape is bound to one bone with full weight, which bends the parts without a mesh apiece.
// It moves exactly where the sortie's mech does: the same motion input and numbers (mechMotion.ts). The rig never reads
// the game (no GameModel).
import * as THREE from 'three';
import { MECH_FLAME_COLOR, MECH_PROTO_COLOR } from '../data/colors.ts';
import { GAIT_LOOK, type GaitLook, type Vec3 } from '../data/mech.ts';
import {
  MECH_PROTO,
  MECH_PROTO_TEX,
  PROTO_MATERIALS,
  PROTO_TUNE,
  type ProtoMaterial,
  type ProtoShape,
} from '../data/mechProto.ts';
import {
  dipDepth,
  flameLength,
  leanAngle,
  legOffset,
  newMotion,
  stepMotion,
  type MotionInput,
  type MotionState,
} from './mechMotion.ts';
import { protoMaps } from './mechProtoSurfaces.ts';
import {
  bakeGeometry,
  boltsGeometry,
  flameGeometry,
  mergeShapes,
  pistonGeometry,
  plateGeometry,
  projectUV,
  ringGeometry,
  tubeGeometry,
} from './mechShapes.ts';

// The bones the shapes are bound to. The hips hold the body and both legs; the torso leans, the head stays level, each
// arm swings from its shoulder and bends at its elbow, and each leg folds at its knee and keeps its foot flat at the
// ankle.
type ProtoBone =
  | 'root'
  | 'torso'
  | 'head'
  | 'shoulderR'
  | 'elbowR'
  | 'shoulderL'
  | 'elbowL'
  | 'thighR'
  | 'shinR'
  | 'footR'
  | 'thighL'
  | 'shinL'
  | 'footL';

const BONE_ORDER: readonly ProtoBone[] = [
  'root',
  'torso',
  'head',
  'shoulderR',
  'elbowR',
  'shoulderL',
  'elbowL',
  'thighR',
  'shinR',
  'footR',
  'thighL',
  'shinL',
  'footL',
];

interface ProtoRig {
  height: number;
  thigh: number; // the thigh's length (ratio of the height), after the panel's stretch
  shin: number; // the shin's length (ratio)
  ankle: number; // the ankle's height (ratio from the ground)
  look: GaitLook;
  motion: MotionState;
  bones: Record<ProtoBone, THREE.Bone>;
  flames: { mesh: THREE.Mesh }[];
  shapes: number; // how many shapes the tables drew (for the weight table)
  time: number; // seconds since the build, for the breathing
}

export interface ProtoStats {
  calls: number;
  triangles: number;
  materials: number;
  shapes: number;
}

const rigs = new WeakMap<THREE.Object3D, ProtoRig>();

// The material of a name, with its three pictures and the light it gives (the sensor and the lamps).
function materialOf(name: ProtoMaterial): THREE.MeshStandardMaterial {
  const def = PROTO_MATERIALS[name];
  const maps = protoMaps(name);
  const material = new THREE.MeshStandardMaterial({
    color: MECH_PROTO_COLOR[name],
    metalness: def.metalness,
    roughness: def.roughness,
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    envMapIntensity: def.envMapIntensity * PROTO_TUNE.light.env,
  });
  // three r128 still asks the material to skin, and the shadow pass reads the same flag
  material.skinning = true;
  if (def.emissive > 0) {
    // a light gives its colour without the paint under it, so the thin lines stay cyan rather than washing out white
    material.color.setRGB(0, 0, 0);
    material.emissive = new THREE.Color(MECH_PROTO_COLOR[name]);
    material.emissiveIntensity = def.emissive;
  }
  return material;
}

// The picture's repeat depends on the metal: the armour covers more metres, the accent less.
function tileOf(name: ProtoMaterial): number {
  if (name === 'armor' || name === 'frame' || name === 'accent') return MECH_PROTO_TEX.tile[name];
  return 1;
}

// One shape in metres, placed in the mech's own space (the band pose, before any joint turns). The shape's size and its
// place are stretched by `scale` about the point `origin` in the table, and the stretched point is put at `target` (the
// joint the bone turns about); `lift` raises a part measured from the hip top by the hip's height. Bones then turn the
// shapes about their own rest places, which is what the skin's bind pose is.
function shapeGeometry(
  shape: ProtoShape,
  height: number,
  origin: Vec3,
  target: Vec3,
  scale: Vec3,
  lift: number,
): THREE.BufferGeometry {
  const bevel = (shape.bevel ?? PROTO_TUNE.bevel) * height;
  let geometry: THREE.BufferGeometry;
  switch (shape.kind) {
    case 'plate': {
      const size = shape.size ?? [0, 0, 0];
      geometry = plateGeometry(
        size[0] * height,
        size[1] * height,
        size[2] * height,
        bevel,
        PROTO_TUNE.bevelSegments,
        shape.taper,
      );
      break;
    }
    case 'tube':
      geometry = tubeGeometry(
        (shape.radius ?? 0) * height,
        (shape.length ?? 0) * height,
        shape.axis ?? 'y',
        PROTO_TUNE.roundSegments,
      );
      break;
    case 'ring':
      geometry = ringGeometry(
        (shape.radius ?? 0) * height,
        (shape.tube ?? 0) * height,
        shape.axis ?? 'y',
        PROTO_TUNE.ringSegments,
      );
      break;
    case 'piston':
      geometry = pistonGeometry(
        (shape.radius ?? 0) * height,
        (shape.length ?? 0) * height,
        shape.axis ?? 'y',
        shape.extend ?? 1,
      );
      break;
    case 'bolts':
      geometry = boltsGeometry(
        (shape.radius ?? 0) * height,
        shape.count ?? 6,
        (shape.bolt ?? 0) * height,
        shape.axis ?? 'y',
      );
      break;
  }
  geometry.scale(scale[0], scale[1], scale[2]);
  const at: [number, number, number] = [
    (target[0] + (shape.at[0] - origin[0]) * scale[0]) * height,
    (target[1] + (shape.at[1] - origin[1]) * scale[1] + lift) * height,
    (target[2] + (shape.at[2] - origin[2]) * scale[2]) * height,
  ];
  const rot = shape.rot;
  bakeGeometry(geometry, at, rot === undefined ? undefined : [rot[0], rot[1], rot[2]]);
  projectUV(geometry, tileOf(shape.material) * height);
  return geometry;
}

// A shape turned over the x = 0 plane: its place at -x, the turns about y and z flipped, and a one-sided cut moved to
// the other side, so a pauldron stays symmetrical.
function mirroredShape(shape: ProtoShape): ProtoShape {
  const mirrored: ProtoShape = { ...shape, at: [-shape.at[0], shape.at[1], shape.at[2]] };
  if (shape.rot !== undefined) mirrored.rot = [shape.rot[0], -shape.rot[1], -shape.rot[2]];
  if (shape.taper?.cutSide !== undefined) {
    mirrored.taper = { ...shape.taper, cutSide: shape.taper.cutSide === 'left' ? 'right' : 'left' };
  }
  return mirrored;
}

// The thigh's angle about the hip (rad) that puts its ankle `drop` below the hip when the knee is `knee` rad bent:
// a cos(t) + b cos(t - knee) = drop, solved in one step.
function thighAngle(drop: number, knee: number, thigh: number, shin: number): number {
  const cos = Math.cos(knee);
  const sin = Math.sin(knee);
  const reach = Math.hypot(thigh + shin * cos, shin * sin);
  if (reach < 1e-4) return knee / 2;
  const tilt = Math.atan2(shin * sin, thigh + shin * cos);
  const ratio = Math.min(1, Math.max(-1, drop / reach));
  return tilt + Math.acos(ratio);
}

export function buildProtoMech(height: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'mech-proto';

  const parts = MECH_PROTO;
  const joints = parts.joints;
  const proportions = PROTO_TUNE.build;
  const girth = proportions.limbGirth;
  const legLength = proportions.legLength;
  const torsoWidth = proportions.torsoWidth;
  const hipY = parts.hipY;
  // the hip, knee and ankle of the model as the panel stretches the leg; the foot keeps its size
  const thigh = (hipY - joints.knee) * legLength;
  const shin = (joints.knee - joints.ankle) * legLength;
  const kneeY = hipY - thigh;
  const ankleY = kneeY - shin;
  const shoulderX = joints.shoulder[0] * torsoWidth;
  const elbowY = joints.shoulder[1] + joints.elbow[1];
  const elbowZ = joints.shoulder[2] + joints.elbow[2];

  const bones = {} as Record<ProtoBone, THREE.Bone>;
  for (const name of BONE_ORDER) {
    bones[name] = new THREE.Bone();
    bones[name].name = name;
  }
  bones.root.add(bones.torso);
  bones.torso.add(bones.head, bones.shoulderR, bones.shoulderL);
  bones.shoulderR.add(bones.elbowR);
  bones.shoulderL.add(bones.elbowL);
  bones.root.add(bones.thighR, bones.thighL);
  bones.thighR.add(bones.shinR);
  bones.shinR.add(bones.footR);
  bones.thighL.add(bones.shinL);
  bones.shinL.add(bones.footL);
  // the rest pose: the table's own, feet on the ground and limbs hanging, which is what the skin binds to
  bones.root.position.set(0, hipY * height, 0);
  bones.head.position.set(joints.neck[0] * height, joints.neck[1] * height, joints.neck[2] * height);
  for (const [shoulder, elbow, side] of [
    [bones.shoulderR, bones.elbowR, 1],
    [bones.shoulderL, bones.elbowL, -1],
  ] as const) {
    shoulder.position.set(side * shoulderX * height, joints.shoulder[1] * height, joints.shoulder[2] * height);
    elbow.position.set(joints.elbow[0] * height, joints.elbow[1] * height, joints.elbow[2] * height);
  }
  for (const [thighBone, shinBone, footBone, side] of [
    [bones.thighR, bones.shinR, bones.footR, 1],
    [bones.thighL, bones.shinL, bones.footL, -1],
  ] as const) {
    thighBone.position.set(side * 0.115 * height, 0, 0);
    shinBone.position.set(0, -thigh * height, 0);
    footBone.position.set(0, -shin * height, 0);
  }
  group.add(bones.root);

  const bins = new Map<ProtoMaterial, THREE.BufferGeometry[]>();
  let shapes = 0;
  const add = (bone: ProtoBone, material: ProtoMaterial, made: THREE.BufferGeometry[]): void => {
    let bin = bins.get(material);
    if (bin === undefined) {
      bin = [];
      bins.set(material, bin);
    }
    for (const geometry of made) {
      // The rig bends by turning one bone, so every vertex of the shape takes that bone whole.
      const count = geometry.getAttribute('position').count;
      const index = new Uint16Array(count * 4);
      const weight = new Float32Array(count * 4);
      const at = BONE_ORDER.indexOf(bone);
      for (let i = 0; i < count; i++) {
        index[i * 4] = at;
        weight[i * 4] = 1;
      }
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
      geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
      bin.push(geometry);
      shapes++;
    }
  };

  // A leg shape turns with the joint above it: above the knee the thigh, above the ankle the shin, the rest the foot.
  const legBone = (shape: ProtoShape, side: 1 | -1): ProtoBone => {
    const right = side > 0;
    if (shape.at[1] > joints.knee) return right ? 'thighR' : 'thighL';
    if (shape.at[1] > joints.ankle) return right ? 'shinR' : 'shinL';
    return right ? 'footR' : 'footL';
  };
  const legPivot = (bone: ProtoBone): Vec3 => {
    const side = bone.endsWith('R') ? 1 : -1;
    if (bone.startsWith('thigh')) return [side * 0.115, hipY, 0];
    if (bone.startsWith('shin')) return [side * 0.115, kneeY, 0];
    return [side * 0.115, ankleY, 0];
  };
  // a leg shape is stretched from the joint's place in the table to the joint's place after the panel's stretch
  const legOrigin = (bone: ProtoBone): Vec3 => {
    const side = bone.endsWith('R') ? 1 : -1;
    if (bone.startsWith('thigh')) return [side * 0.115, hipY, 0];
    if (bone.startsWith('shin')) return [side * 0.115, joints.knee, 0];
    return [side * 0.115, joints.ankle, 0];
  };
  const legScale: Vec3 = [girth, legLength, girth];

  for (const part of parts.legs) {
    const shape = { ...part, mirror: false };
    const right = legBone(shape, 1);
    add(right, shape.material, [shapeGeometry(shape, height, legOrigin(right), legPivot(right), legScale, 0)]);
    if (part.mirror === true) {
      const leftShape = { ...mirroredShape(part), mirror: false };
      const left = legBone(leftShape, -1);
      add(left, leftShape.material, [shapeGeometry(leftShape, height, legOrigin(left), legPivot(left), legScale, 0)]);
    }
  }

  // An arm shape above the elbow swings from the shoulder, the rest from the elbow.
  const armBone = (shape: ProtoShape, side: 1 | -1): ProtoBone => {
    const right = side > 0;
    if (shape.at[1] > elbowY) return right ? 'shoulderR' : 'shoulderL';
    return right ? 'elbowR' : 'elbowL';
  };
  const armPivot = (bone: ProtoBone): Vec3 => {
    const side = bone.endsWith('R') ? 1 : -1;
    if (bone.startsWith('shoulder')) return [side * shoulderX, joints.shoulder[1], joints.shoulder[2]];
    return [side * shoulderX, elbowY, elbowZ];
  };
  const armScale: Vec3 = [girth, 1, girth];

  for (const part of parts.arms) {
    const shape = { ...part, mirror: false };
    const right = armBone(shape, 1);
    const rightPivot = armPivot(right);
    add(right, shape.material, [shapeGeometry(shape, height, rightPivot, rightPivot, armScale, hipY)]);
    if (part.mirror === true) {
      const leftShape = { ...mirroredShape(part), mirror: false };
      const left = armBone(leftShape, -1);
      const leftPivot = armPivot(left);
      add(left, leftShape.material, [shapeGeometry(leftShape, height, leftPivot, leftPivot, armScale, hipY)]);
    }
  }
  for (const shape of parts.handR) {
    const pivot = armPivot('elbowR');
    add('elbowR', shape.material, [shapeGeometry(shape, height, pivot, pivot, armScale, hipY)]);
  }
  for (const shape of parts.handL) {
    const pivot = armPivot('elbowL');
    add('elbowL', shape.material, [shapeGeometry(shape, height, pivot, pivot, armScale, hipY)]);
  }

  // A weapon's shapes, moved from the mount they hang on. The front toward -z is the table's own.
  const addWeapon = (bone: ProtoBone, shapesOf: readonly ProtoShape[], mount: Vec3): void => {
    const pivot: Vec3 = bone === 'torso' ? [0, 0, 0] : armPivot(bone);
    for (const shape of shapesOf) {
      const at: Vec3 = [shape.at[0] + mount[0], shape.at[1] + mount[1], shape.at[2] + mount[2]];
      const placed = { ...shape, at, mirror: false };
      add(bone, shape.material, [shapeGeometry(placed, height, pivot, pivot, [1, 1, 1], hipY)]);
      if (shape.mirror === true) {
        const left = { ...mirroredShape(placed), mirror: false };
        add(bone, shape.material, [shapeGeometry(left, height, pivot, pivot, [1, 1, 1], hipY)]);
      }
    }
  };

  const torsoScale: Vec3 = [torsoWidth, 1, 1];
  const torsoOrigin: Vec3 = [0, 0, 0];
  for (const part of parts.core) {
    add('torso', part.material, mirroredPair(part, height, torsoOrigin, torsoScale, hipY));
  }
  for (const part of parts.back) {
    add('torso', part.material, mirroredPair(part, height, torsoOrigin, torsoScale, hipY));
  }
  for (const part of parts.head) {
    add('head', part.material, mirroredPair(part, height, joints.neck, [1, 1, 1], hipY));
  }
  addWeapon('elbowR', parts.main.shapes, parts.armMount);
  addWeapon('torso', parts.sub.shapes, [parts.backMount[0] * torsoWidth, parts.backMount[1], parts.backMount[2]]);

  const skeleton = new THREE.Skeleton(BONE_ORDER.map(name => bones[name]));
  for (const [materialName, geometries] of bins) {
    const material = materialOf(materialName);
    const mesh = new THREE.SkinnedMesh(mergeShapes(geometries), material);
    mesh.name = 'mech-proto';
    // three culls by the shape's bounds alone, and a limb that swings would vanish at the screen's edge
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    group.updateMatrixWorld(true);
    mesh.bind(skeleton);
  }

  // the boost's flame: one cone per stack, pointing back (+z), grown by the motion; it hangs on the torso, so it
  // leans with the body
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: MECH_FLAME_COLOR,
    transparent: true,
    opacity: PROTO_TUNE.flame.opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flames: { mesh: THREE.Mesh }[] = [];
  for (const at of parts.exhaust) {
    const mesh = new THREE.Mesh(flameGeometry(PROTO_TUNE.flame.radius * height), flameMaterial);
    mesh.position.set(at[0] * height, at[1] * height, at[2] * height);
    mesh.frustumCulled = false;
    mesh.visible = false;
    bones.torso.add(mesh);
    flames.push({ mesh });
  }

  const rig: ProtoRig = {
    height,
    thigh,
    shin,
    ankle: joints.ankle,
    look: GAIT_LOOK[parts.gait],
    motion: newMotion(),
    bones,
    flames,
    shapes,
    time: 0,
  };
  rigs.set(group, rig);
  poseProto(rig);
  return group;
}

// A part that is already in the bone's space, mirrored in x when its table says so.
function mirroredPair(
  shape: ProtoShape,
  height: number,
  pivot: Vec3,
  scale: Vec3,
  lift: number,
): THREE.BufferGeometry[] {
  const made = [shapeGeometry(shape, height, pivot, pivot, scale, lift)];
  if (shape.mirror === true) made.push(shapeGeometry(mirroredShape(shape), height, pivot, pivot, scale, lift));
  return made;
}

// Writes the rig's stance and motion into its bones: the hips drop, the knees fold and the feet stay flat, the torso
// leans while the head looks on, the arms take their forward hold, and the flame grows across its stacks.
function poseProto(rig: ProtoRig): void {
  const { height, motion, look, bones } = rig;
  const pose = PROTO_TUNE.pose;
  const walk = motion.walk;
  const air = motion.air;
  const recoil = motion.recoil;
  // the breathing shows only when nothing else is moving
  const idle = Math.max(0, 1 - walk) * (1 - air) * (1 - motion.boost);
  const breathe = Math.sin(rig.time * pose.idleRate);
  const bob = walk * pose.bob * (0.5 - 0.5 * Math.cos(4 * Math.PI * motion.phase));
  const settle = walk * (1 - walk) * 4 * pose.settle;
  const sink = dipDepth(motion) + bob + settle + recoil * pose.recoilSink - breathe * idle * pose.idleBob;
  const hip = pose.hip - sink;
  bones.root.position.y = hip * height;

  const lean = pose.lean + leanAngle(motion) + breathe * idle * pose.idleLean;
  bones.torso.rotation.x = lean;
  bones.head.rotation.x = -lean * pose.head;
  bones.shoulderR.rotation.x = pose.shoulder;
  bones.elbowR.rotation.x = -pose.elbow + recoil * pose.recoilElbow;
  bones.shoulderL.rotation.x = pose.offShoulder;
  bones.elbowL.rotation.x = -pose.offElbow;

  // the ankle stays on the ground: the pair of angles is solved for the hip's height on every frame
  const drop = hip - rig.ankle - air * pose.airLift;
  const legs = [
    [bones.thighR, bones.shinR, bones.footR, 1],
    [bones.thighL, bones.shinL, bones.footL, -1],
  ] as const;
  for (const [thigh, shin, foot, side] of legs) {
    const swingPhase = 2 * Math.PI * (motion.phase + legOffset('biped', side, 0));
    const swing = walk * pose.stride * look.swing * Math.sin(swingPhase);
    const kneeWalk = walk * pose.kneeWalk * Math.max(0, Math.cos(swingPhase));
    const knee = pose.knee + kneeWalk + air * pose.air;
    const turn = thighAngle(drop, knee, rig.thigh, rig.shin) + swing;
    thigh.rotation.x = turn;
    thigh.rotation.z = side * pose.stance;
    shin.rotation.x = -knee;
    foot.rotation.x = knee - turn;
    foot.rotation.z = -side * pose.stance;
  }

  const flame = flameLength(motion) * height;
  for (const { mesh } of rig.flames) {
    mesh.visible = flame > 0;
    if (mesh.visible) mesh.scale.set(1, 1, Math.max(flame, 1e-4));
  }
}

// Moves the prototype one frame: the same input and the same numbers as the sortie's mech (mechMotion.ts).
export function animateProtoMech(root: THREE.Object3D, input: MotionInput, dt: number): void {
  const rig = rigs.get(root);
  if (rig === undefined) return;
  rig.time += dt;
  stepMotion(rig.motion, input, dt, rig.look.stride * rig.height);
  poseProto(rig);
}

export function countProtoDraws(root: THREE.Object3D): ProtoStats {
  let calls = 0;
  let triangles = 0;
  const materials = new Set<string>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true || !mesh.visible) return;
    calls++;
    materials.add(mesh.material instanceof THREE.Material ? mesh.material.uuid : '');
    const index = mesh.geometry.getIndex();
    const corners = index === null ? mesh.geometry.getAttribute('position').count : index.count;
    triangles += corners / 3;
  });
  const rig = rigs.get(root);
  return { calls, triangles, materials: materials.size, shapes: rig?.shapes ?? 0 };
}

export function disposeProtoMech(root: THREE.Object3D): void {
  const disposed = new Set<THREE.Material>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (disposed.has(material)) continue;
      disposed.add(material);
      material.dispose();
    }
  });
}
