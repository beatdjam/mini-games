// Draws the prototype mech (SB-1468, second pass SB-1469, third pass SB-1471): the table in data/mechProto.ts, built
// out of view/mechShapes.ts and merged by material, so a mech of a hundred shapes costs a handful of draws. The joints
// are a small skeleton: the hips, a knee and an ankle on each leg, a shoulder and an elbow on each arm, and the head, so
// the mech stands with its knees bent and its torso forward, walks with a knee lift, folds its legs in the air and dips
// its elbow as it fires. Each shape is bound to one bone with full weight, which bends the parts without a mesh apiece.
// It moves exactly where the sortie's mech does: the same motion input and numbers (mechMotion.ts). The rig never reads
// the game (no GameModel).
import * as THREE from 'three';
import { MECH_FLAME_COLOR, PROTO_PALETTES } from '../data/colors.ts';
import { GAIT_LOOK, type GaitLook, type Vec3 } from '../data/mech.ts';
import {
  MECH_PROTO_TEX,
  PROTO_BACKS,
  PROTO_DEFAULT_KIT,
  PROTO_HANDS,
  PROTO_HEADS,
  PROTO_KITS,
  PROTO_MATERIALS,
  PROTO_SHOULDERS,
  PROTO_SKELETON,
  PROTO_TORSOS,
  PROTO_TUNE,
  PROTO_WEAPONS,
  mirrorShape,
  type ProtoDetail,
  type ProtoKitName,
  type ProtoMaterial,
  type ProtoPaletteId,
  type ProtoShape,
  type ProtoShoulderPart,
  type ProtoWeaponPart,
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
  flameMaterial: THREE.MeshBasicMaterial; // shared by the flame cones; its opacity follows the see-through fade
  muzzle: THREE.Object3D | null; // the weapon's mouth, on the elbow bone, so the flash and the tracer leave it
  offShoulder: number; // the free arm's forward turn (rad; the kit may hold its weapon with both hands)
  armInL: number; // the free shoulder's inward turn about z (rad)
  armInR: number; // the weapon shoulder's inward turn about z (rad)
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

// The material of a name, with its three pictures and the light it gives (the sensor and the lamps). `palette` is the
// kit's four colours; the pictures are shared by every kit, so two machines of one material still cost one set of maps.
function materialOf(name: ProtoMaterial, palette: Record<ProtoMaterial, number>): THREE.MeshStandardMaterial {
  const def = PROTO_MATERIALS[name];
  const maps = protoMaps(name);
  const material = new THREE.MeshStandardMaterial({
    color: palette[name],
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
    material.emissive = new THREE.Color(palette[name]);
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
  detail: ProtoDetail,
): THREE.BufferGeometry {
  const bevel = (shape.bevel ?? PROTO_TUNE.bevel) * height;
  const far = detail === 'far';
  let geometry: THREE.BufferGeometry;
  switch (shape.kind) {
    case 'plate': {
      const size = shape.size ?? [0, 0, 0];
      // A far build cuts the chamfer and the taper: a plain box has 12 triangles where a bent, chamfered plate has
      // over a hundred, and at the far distance the bevelled edges no longer read (SB-2086).
      geometry = far
        ? new THREE.BoxGeometry(size[0] * height, size[1] * height, size[2] * height).toNonIndexed()
        : plateGeometry(
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
        far ? PROTO_TUNE.farRoundSegments : PROTO_TUNE.roundSegments,
      );
      break;
    case 'ring':
      geometry = ringGeometry(
        (shape.radius ?? 0) * height,
        (shape.tube ?? 0) * height,
        shape.axis ?? 'y',
        far ? PROTO_TUNE.farRingSegments : PROTO_TUNE.ringSegments,
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

// How wide a shape is across its widest side, as a ratio of the height: the table's own number, without building it.
function shapeExtent(shape: ProtoShape): number {
  switch (shape.kind) {
    case 'plate':
      return Math.max(...(shape.size ?? [0, 0, 0]));
    case 'ring':
      return 2 * ((shape.radius ?? 0) + (shape.tube ?? 0));
    case 'bolts':
      return 2 * ((shape.radius ?? 0) + (shape.bolt ?? 0));
    default:
      return Math.max(2 * (shape.radius ?? 0), shape.length ?? 0);
  }
}

// A `far` build keeps only the shapes a machine reads at a distance (SB-2083): the bolts, the pistons and the small
// rims and lit lines are left out, while the plates, the limbs and the weapons stay (SB-2086).
function keepsShape(shape: ProtoShape, detail: ProtoDetail): boolean {
  if (detail === 'full') return true;
  if (shape.kind === 'bolts' || shape.kind === 'piston') return false;
  return shapeExtent(shape) >= PROTO_TUNE.farShape;
}

// `paletteId` overrides the kit's own row, for the allies' wreck (the same parts and mark gone dark). `detail` builds the
// full machine or the simplified one a far crowd is drawn from (SB-2083). A kit's scale makes it stand larger than the
// height it is asked for (the boss, SB-2084), so the parts and the rig keep one set of numbers.
export function buildProtoMech(
  tall: number,
  kitId: ProtoKitName = PROTO_DEFAULT_KIT,
  paletteId?: ProtoPaletteId,
  detail: ProtoDetail = 'full',
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'mech-proto';

  const kit = PROTO_KITS[kitId] ?? PROTO_KITS[PROTO_DEFAULT_KIT];
  const height = tall * (kit.scale ?? 1);
  const palette = PROTO_PALETTES[paletteId ?? kit.palette];
  const parts = PROTO_SKELETON;
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
    thighBone.position.set(side * joints.hipX * height, 0, 0);
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
    if (bone.startsWith('thigh')) return [side * joints.hipX, hipY, 0];
    if (bone.startsWith('shin')) return [side * joints.hipX, kneeY, 0];
    return [side * joints.hipX, ankleY, 0];
  };
  // a leg shape is stretched from the joint's place in the table to the joint's place after the panel's stretch
  const legOrigin = (bone: ProtoBone): Vec3 => {
    const side = bone.endsWith('R') ? 1 : -1;
    if (bone.startsWith('thigh')) return [side * joints.hipX, hipY, 0];
    if (bone.startsWith('shin')) return [side * joints.hipX, joints.knee, 0];
    return [side * joints.hipX, joints.ankle, 0];
  };
  const legScale: Vec3 = [girth, legLength, girth];

  for (const part of parts.legs) {
    if (!keepsShape(part, detail)) continue;
    const shape = { ...part, mirror: false };
    const right = legBone(shape, 1);
    add(right, shape.material, [shapeGeometry(shape, height, legOrigin(right), legPivot(right), legScale, 0, detail)]);
    if (part.mirror === true) {
      const leftShape = { ...mirrorShape(part), mirror: false };
      const left = legBone(leftShape, -1);
      add(left, leftShape.material, [
        shapeGeometry(leftShape, height, legOrigin(left), legPivot(left), legScale, 0, detail),
      ]);
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
    if (!keepsShape(part, detail)) continue;
    const shape = { ...part, mirror: false };
    const right = armBone(shape, 1);
    const rightPivot = armPivot(right);
    add(right, shape.material, [shapeGeometry(shape, height, rightPivot, rightPivot, armScale, hipY, detail)]);
    if (part.mirror === true) {
      const leftShape = { ...mirrorShape(part), mirror: false };
      const left = armBone(leftShape, -1);
      const leftPivot = armPivot(left);
      add(left, leftShape.material, [shapeGeometry(leftShape, height, leftPivot, leftPivot, armScale, hipY, detail)]);
    }
  }
  // the free hand: the skeleton's open palm, or the part the kit puts there (the boss's claw)
  const handL = kit.handL === undefined ? parts.handL : PROTO_HANDS[kit.handL].shapes;
  for (const shape of handL) {
    if (!keepsShape(shape, detail)) continue;
    const pivot = armPivot('elbowL');
    add('elbowL', shape.material, [shapeGeometry(shape, height, pivot, pivot, armScale, hipY, detail)]);
  }

  // A weapon's shapes, moved from the mount they hang on. The front toward -z is the table's own.
  const addWeapon = (bone: ProtoBone, shapesOf: readonly ProtoShape[], mount: Vec3): void => {
    const pivot: Vec3 = bone === 'torso' ? [0, 0, 0] : armPivot(bone);
    for (const shape of shapesOf) {
      if (!keepsShape(shape, detail)) continue;
      const at: Vec3 = [shape.at[0] + mount[0], shape.at[1] + mount[1], shape.at[2] + mount[2]];
      const placed = { ...shape, at, mirror: false };
      add(bone, shape.material, [shapeGeometry(placed, height, pivot, pivot, [1, 1, 1], hipY, detail)]);
      if (shape.mirror === true) {
        const left = { ...mirrorShape(placed), mirror: false };
        add(bone, shape.material, [shapeGeometry(left, height, pivot, pivot, [1, 1, 1], hipY, detail)]);
      }
    }
  };

  const torsoScale: Vec3 = [torsoWidth, 1, 1];
  const torsoOrigin: Vec3 = [0, 0, 0];
  for (const part of parts.core) {
    if (!keepsShape(part, detail)) continue;
    add('torso', part.material, mirroredPair(part, height, torsoOrigin, torsoScale, hipY, detail));
  }
  // the torso's ornament, the head and the back are parts a kit chooses; the shell above is shared
  for (const part of PROTO_TORSOS[kit.torso].shapes) {
    if (!keepsShape(part, detail)) continue;
    add('torso', part.material, mirroredPair(part, height, torsoOrigin, torsoScale, hipY, detail));
  }
  for (const part of PROTO_BACKS[kit.back].shapes) {
    if (!keepsShape(part, detail)) continue;
    add('torso', part.material, mirroredPair(part, height, torsoOrigin, torsoScale, hipY, detail));
  }
  // the head keeps every shape even in a far build: its three lamps are the side's mark, and it is small
  for (const part of PROTO_HEADS[kit.head].shapes) {
    add('head', part.material, mirroredPair(part, height, joints.neck, [1, 1, 1], hipY, detail));
  }

  // The shoulders are two slots: the pauldron turns with the arm, and a pod over it stays on the torso. The left slot
  // mirrors a part written for the right, so a kit can choose the same name on both sides.
  for (const side of [1, -1] as const) {
    const shoulder: ProtoShoulderPart = side > 0 ? PROTO_SHOULDERS[kit.shoulderR] : PROTO_SHOULDERS[kit.shoulderL];
    const bone: ProtoBone = side > 0 ? 'shoulderR' : 'shoulderL';
    const pivot = armPivot(bone);
    for (const part of shoulder.shapes) {
      if (!keepsShape(part, detail)) continue;
      const shape = side > 0 ? { ...part, mirror: false } : { ...mirrorShape(part), mirror: false };
      add(bone, shape.material, [shapeGeometry(shape, height, pivot, pivot, armScale, hipY, detail)]);
    }
    const pod = side > 0 ? shoulder.onRight : shoulder.onLeft;
    if (pod !== undefined) {
      const mount = pod.mount ?? [0, 0, 0];
      addWeapon('torso', pod.shapes, [mount[0] * torsoWidth, mount[1], mount[2]]);
    }
  }

  // the right hand's weapon: the fist turns with the elbow, the gun hangs from its mount
  const weapon: ProtoWeaponPart = PROTO_WEAPONS[kit.weapon];
  for (const shape of weapon.hand) {
    if (!keepsShape(shape, detail)) continue;
    const pivot = armPivot('elbowR');
    add('elbowR', shape.material, [shapeGeometry(shape, height, pivot, pivot, armScale, hipY, detail)]);
  }
  addWeapon('elbowR', weapon.shapes, weapon.mount);

  // The weapon's mouth sits on the elbow bone, in the same place as the gun's shapes, so it turns with the arm. The
  // view reads it each frame to put the flash and the tracer at the barrel rather than at the old chest place.
  let muzzle: THREE.Object3D | null = null;
  if (weapon.muzzle !== undefined) {
    const pivot = armPivot('elbowR');
    muzzle = new THREE.Object3D();
    muzzle.name = 'mech-proto-muzzle';
    muzzle.position.set(
      (weapon.muzzle[0] + weapon.mount[0] - pivot[0]) * height,
      (weapon.muzzle[1] + weapon.mount[1] - pivot[1]) * height,
      (weapon.muzzle[2] + weapon.mount[2] - pivot[2]) * height,
    );
    bones.elbowR.add(muzzle);
  }

  const skeleton = new THREE.Skeleton(BONE_ORDER.map(name => bones[name]));
  for (const [materialName, geometries] of bins) {
    const material = materialOf(materialName, palette);
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
  for (const at of PROTO_BACKS[kit.back].exhaust) {
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
    flameMaterial,
    muzzle,
    offShoulder: kit.arms?.offShoulder ?? PROTO_TUNE.pose.offShoulder,
    armInL: kit.arms?.leftIn ?? 0,
    armInR: kit.arms?.rightIn ?? 0,
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
  detail: ProtoDetail,
): THREE.BufferGeometry[] {
  const made = [shapeGeometry(shape, height, pivot, pivot, scale, lift, detail)];
  if (shape.mirror === true) made.push(shapeGeometry(mirrorShape(shape), height, pivot, pivot, scale, lift, detail));
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
  bones.shoulderR.rotation.z = -rig.armInR;
  bones.elbowR.rotation.x = -pose.elbow + recoil * pose.recoilElbow;
  bones.shoulderL.rotation.x = rig.offShoulder;
  bones.shoulderL.rotation.z = rig.armInL;
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

// Where the weapon's mouth is in the world this frame, for the muzzle flash and the tracer. It hangs on the elbow bone,
// so it follows the arm as the mech fires and breathes; null when the kit's weapon has no muzzle. The vector is reused
// from frame to frame (and `getWorldPosition` walks up only the mouth's own chain), so a frame allocates nothing; the
// caller must use it that frame and not keep it.
const muzzleWorld = new THREE.Vector3();

export function protoMuzzle(root: THREE.Object3D): THREE.Vector3 | null {
  const rig = rigs.get(root);
  if (rig?.muzzle === null || rig?.muzzle === undefined) return null;
  return rig.muzzle.getWorldPosition(muzzleWorld);
}

// Makes the prototype see-through (`opacity` below 1) or solid again (1), for the sortie's camera pushed close by a wall.
// It only flips the materials, so the draw calls stay the same; the flame keeps its own opacity scaled by the same ratio.
export function setProtoOpacity(root: THREE.Object3D, opacity: number): void {
  const rig = rigs.get(root);
  const done = new Set<THREE.Material>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (done.has(material)) continue;
      done.add(material);
      material.transparent = opacity < 1 || material === rig?.flameMaterial;
      material.opacity = material === rig?.flameMaterial ? PROTO_TUNE.flame.opacity * opacity : opacity;
    }
  });
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
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    // the shapes share one skeleton, whose bone texture the renderer keeps on the GPU until the skeleton is disposed
    const skeleton = (mesh as THREE.SkinnedMesh).skeleton as THREE.Skeleton | undefined;
    if (skeleton !== undefined && !skeletons.has(skeleton)) {
      skeletons.add(skeleton);
      skeleton.dispose();
    }
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (disposed.has(material)) continue;
      disposed.add(material);
      material.dispose();
    }
  });
}
