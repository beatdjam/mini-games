// Draws the prototype mech (SB-1468, second pass SB-1469): the table in data/mechProto.ts, built out of
// view/mechShapes.ts and merged by material and by the part that moves, so a mech of a hundred shapes costs a dozen
// draws. It moves exactly where the sortie's mech does: the legs swing about the hip, the body leans (with a little
// standing lean of its own) and sinks, the arms pull back when the main weapon fires and the flame grows at the back.
// The rig never reads the game (no GameModel).
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
  legAngle,
  newMotion,
  recoilBack,
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

// Which moving part a shape belongs to: the body (with the back and the head), the arms, one leg each, and the flame.
type ProtoLimb = 'body' | 'arm' | 'legR' | 'legL';

interface ProtoRig {
  height: number;
  hipY: number;
  look: GaitLook;
  motion: MotionState;
  body: THREE.Group;
  arms: THREE.Group;
  legR: THREE.Group;
  legL: THREE.Group;
  flames: { mesh: THREE.Mesh }[];
  shapes: number; // how many shapes the tables drew (for the weight table)
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

// One shape in metres at its place in the limb's own space. `lift` takes the legs' height down to the hip (their table
// is measured from the ground, the pivot is at the hip).
function shapeGeometry(shape: ProtoShape, height: number, lift: number): THREE.BufferGeometry {
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
  const at: [number, number, number] = [shape.at[0] * height, shape.at[1] * height + lift, shape.at[2] * height];
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

// The mirrored pair of a shape: the same at -x, with the turns and the cut flipped so the pair stays symmetrical.
function shapeGeometries(shape: ProtoShape, height: number, lift: number): THREE.BufferGeometry[] {
  const made = [shapeGeometry(shape, height, lift)];
  if (shape.mirror === true) made.push(shapeGeometry(mirroredShape(shape), height, lift));
  return made;
}

export function buildProtoMech(height: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'mech-proto';

  const hipY = MECH_PROTO.hipY;
  const pivotY = hipY * height;
  const bins = new Map<string, { material: ProtoMaterial; limb: ProtoLimb; shapes: THREE.BufferGeometry[] }>();
  let shapes = 0;

  const add = (limb: ProtoLimb, material: ProtoMaterial, made: THREE.BufferGeometry[]): void => {
    const key = `${material}|${limb}`;
    let bin = bins.get(key);
    if (bin === undefined) {
      bin = { material, limb, shapes: [] };
      bins.set(key, bin);
    }
    bin.shapes.push(...made);
    shapes += made.length;
  };

  for (const part of MECH_PROTO.legs) {
    const right: ProtoShape = { ...part, mirror: false };
    add('legR', part.material, [shapeGeometry(right, height, -pivotY)]);
    if (part.mirror === true) {
      const left: ProtoShape = { ...mirroredShape(part), mirror: false };
      add('legL', part.material, [shapeGeometry(left, height, -pivotY)]);
    }
  }

  // A weapon's shapes, moved from the mount they hang on. The front toward -z is the table's own.
  const addWeapon = (limb: ProtoLimb, shapes: readonly ProtoShape[], mount: Vec3): void => {
    for (const shape of shapes) {
      const at: Vec3 = [shape.at[0] + mount[0], shape.at[1] + mount[1], shape.at[2] + mount[2]];
      add(limb, shape.material, shapeGeometries({ ...shape, at }, height, 0));
    }
  };

  for (const part of MECH_PROTO.core) add('body', part.material, shapeGeometries(part, height, 0));
  for (const part of MECH_PROTO.back) add('body', part.material, shapeGeometries(part, height, 0));
  for (const part of MECH_PROTO.head) add('body', part.material, shapeGeometries(part, height, 0));
  for (const part of MECH_PROTO.arms) add('arm', part.material, shapeGeometries(part, height, 0));
  addWeapon('arm', MECH_PROTO.main.shapes, MECH_PROTO.armMount);
  addWeapon('body', MECH_PROTO.sub.shapes, MECH_PROTO.backMount);

  const body = new THREE.Group();
  const arms = new THREE.Group();
  const legR = new THREE.Group();
  const legL = new THREE.Group();
  const pivots: Record<ProtoLimb, THREE.Group> = { body, arm: arms, legR, legL };
  body.position.y = pivotY;
  legR.position.y = pivotY;
  legL.position.y = pivotY;
  body.add(arms);
  group.add(body, legR, legL);

  const materials = new Map<ProtoMaterial, THREE.MeshStandardMaterial>();
  for (const bin of bins.values()) {
    let material = materials.get(bin.material);
    if (material === undefined) {
      material = materialOf(bin.material);
      materials.set(bin.material, material);
    }
    const geometry = mergeShapes(bin.shapes);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'mech-proto';
    // three culls by the shape's bounds alone, and a limb that grows or swings would vanish at the screen's edge
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivots[bin.limb].add(mesh);
  }

  // the boost's flame: one cone per stack, pointing back (+z), grown by the motion
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: MECH_FLAME_COLOR,
    transparent: true,
    opacity: PROTO_TUNE.flame.opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flames: { mesh: THREE.Mesh }[] = [];
  for (const at of MECH_PROTO.exhaust) {
    const mesh = new THREE.Mesh(flameGeometry(PROTO_TUNE.flame.radius * height), flameMaterial);
    mesh.position.set(at[0] * height, at[1] * height, at[2] * height);
    mesh.frustumCulled = false;
    mesh.visible = false;
    body.add(mesh);
    flames.push({ mesh });
  }

  const rig: ProtoRig = {
    height,
    hipY,
    look: GAIT_LOOK.biped,
    motion: newMotion(),
    body,
    arms,
    legR,
    legL,
    flames,
    shapes,
  };
  rigs.set(group, rig);
  poseProto(rig);
  return group;
}

// Writes the rig's motion into its pivots: the legs turn about the hip, the body leans and sinks, the arms pull back,
// and the flame grows across its stacks.
function poseProto(rig: ProtoRig): void {
  const { height, motion, look } = rig;
  const lean = leanAngle(motion);
  const sink = dipDepth(motion) * height;
  const back = recoilBack(motion) * height;
  const flame = flameLength(motion) * height;
  rig.body.position.y = rig.hipY * height - sink;
  rig.body.rotation.x = PROTO_TUNE.lean + lean;
  rig.arms.position.z = back;
  rig.legR.rotation.x = legAngle(motion, 'biped', look, 1, 0);
  rig.legL.rotation.x = legAngle(motion, 'biped', look, -1, 0);
  for (const { mesh } of rig.flames) {
    mesh.visible = flame > 0;
    if (mesh.visible) mesh.scale.set(1, 1, Math.max(flame, 1e-4));
  }
}

// Moves the prototype one frame: the same input and the same numbers as the sortie's mech (mechMotion.ts).
export function animateProtoMech(root: THREE.Object3D, input: MotionInput, dt: number): void {
  const rig = rigs.get(root);
  if (rig === undefined) return;
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
