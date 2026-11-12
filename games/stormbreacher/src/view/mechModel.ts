// Draws a mech out of boxes. It never reads the game's state (no GameModel). The shape is one shared unit box and one
// InstancedMesh per colour, so a mech costs as many draw calls as the colours it uses (D-45). The look's second card
// grows this into the look the game wears. The third card moves the boxes (animateMech): each frame it writes the
// instance matrices again, the legs swung about the hip and the body tilted, sunk or pulled back, with no bones and no
// extra draw call.
import * as THREE from 'three';
import { MECH_FLAME_COLOR } from '../data/colors.ts';
import {
  CORES,
  GAIT_LOOK,
  MECH_COLORS,
  PARTS,
  WEAPON_LOOK,
  type MechBox,
  type MechBuild,
  type GaitKind,
  type GaitLook,
  type MechColor,
  type PartDef,
  type Vec3,
} from '../data/mech.ts';
import { MOTION_TUNE } from '../data/tune.ts';
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

export interface MechLook {
  build: MechBuild;
  palette: Record<MechColor, number>; // hex per colour name
  weaponScale: number; // scales the weapons' boxes and their offsets from the mount; 1 is as the table says
}

// Which part of the mech a box moves with: the legs swing, the arms pull back when it fires, the flame grows with the
// boost, and the rest (the body, the back, the head) leans and sinks together.
type Limb = 'body' | 'leg' | 'arm' | 'flame';

interface PlacedBox {
  size: Vec3;
  at: Vec3;
  color: MechColor;
  rotX: number;
  limb: Limb;
  sx: number; // the side the mirror put the box on: +1 right, -1 left, 0 for a box on the middle line
  sz: number; // +1 back, -1 front for a 'xz' mirror, 0 otherwise
}

// What animateMech needs to move one mech: its boxes by colour, the motion's state and the numbers of its gait.
interface MechRig {
  height: number;
  hipY: number; // the hip top's height as a ratio of the mech's height; the legs and the body turn about it
  gait: GaitKind;
  look: GaitLook;
  motion: MotionState;
  meshes: { mesh: THREE.InstancedMesh; boxes: PlacedBox[]; solid: number }[]; // `solid`: the boxes before the flames
}

const rigs = new WeakMap<THREE.Object3D, MechRig>();

const X_AXIS = new THREE.Vector3(1, 0, 0);

const atXZ = (at: Vec3, x: number, z: number): Vec3 => [at[0] * x, at[1], at[2] * z];

// One box as the table says, or the 2 or 4 boxes its mirror asks for.
function place(box: MechBox, limb: Limb): PlacedBox[] {
  const base: PlacedBox = { size: box.size, at: box.at, color: box.color, rotX: box.rotX ?? 0, limb, sx: 0, sz: 0 };
  if (box.mirror === undefined) return [base];
  const xs = [1, -1];
  const zs = box.mirror === 'xz' ? [1, -1] : [0];
  const placed: PlacedBox[] = [];
  for (const x of xs) for (const z of zs) placed.push({ ...base, at: atXZ(box.at, x, z === 0 ? 1 : z), sx: x, sz: z });
  return placed;
}

// Every box in world ratios: the legs stand on the ground, the rest sits on the legs' hip, and the weapons hang from
// their mounts. The look's scale stretches the weapons only.
function placedBoxes(look: MechLook): PlacedBox[] {
  const build = look.build;
  const legs = PARTS.legs[build.legs];
  const hipY = legs.hipY ?? 0;
  const placed: PlacedBox[] = [];
  for (const box of legs.boxes) placed.push(...place(box, 'leg'));

  const upper: [PartDef, Limb][] = [
    [CORES[build.core], 'body'],
    [PARTS.arms[build.arms], 'arm'],
    [PARTS.back[build.back], 'body'],
    [PARTS.fcs[build.fcs], 'body'],
  ];
  for (const [part, limb] of upper)
    for (const box of part.boxes) placed.push(...place({ ...box, at: [box.at[0], box.at[1] + hipY, box.at[2]] }, limb));

  const addWeapon = (weapon: (typeof build)['main'], mount: Vec3 | undefined, limb: Limb) => {
    if (mount === undefined) return;
    const scale = look.weaponScale;
    for (const box of WEAPON_LOOK[weapon])
      placed.push(
        ...place(
          {
            ...box,
            size: [box.size[0] * scale, box.size[1] * scale, box.size[2] * scale],
            at: [box.at[0] * scale + mount[0], box.at[1] * scale + mount[1] + hipY, box.at[2] * scale + mount[2]],
          },
          limb,
        ),
      );
  };
  addWeapon(build.main, PARTS.arms[build.arms].mount, 'arm');
  addWeapon(build.sub, PARTS.back[build.back].mount, 'body');
  return placed;
}

// The mesh the flame boxes join. They share a colour mesh so the mech keeps its draw calls; the flame's own colour is an
// instance colour on top of the mesh's (every colour mesh has a 'frame' box: the cores and the legs use it).
const FLAME_HOST: MechColor = 'frame';

export function buildMechVisual(look: MechLook, height: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'mech';

  const build = look.build;
  const legs = PARTS.legs[build.legs];
  const hipY = legs.hipY ?? 0;
  const gait = legs.gait;
  if (gait === undefined) throw new Error(`legs ${build.legs} have no gait`);

  const byColor = new Map<MechColor, PlacedBox[]>();
  for (const box of placedBoxes(look)) {
    const list = byColor.get(box.color);
    if (list === undefined) byColor.set(box.color, [box]);
    else list.push(box);
  }
  const solid = new Map<MechColor, number>();
  for (const [color, boxes] of byColor) solid.set(color, boxes.length);
  // the flames come after the solid boxes, so the mesh draws only the solid ones while the mech is not boosting
  const flames = (PARTS.back[build.back].exhaust ?? []).map((at): PlacedBox => ({
    size: [MOTION_TUNE.flameSize, MOTION_TUNE.flameSize, MOTION_TUNE.flameSize],
    at: [at[0], at[1] + hipY, at[2]],
    color: FLAME_HOST,
    rotX: 0,
    limb: 'flame',
    sx: 0,
    sz: 0,
  }));
  const host = byColor.get(FLAME_HOST);
  if (host === undefined) throw new Error('a mech has no frame box to carry the flame');
  host.push(...flames);

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const rig: MechRig = { height, hipY, gait, look: GAIT_LOOK[gait], motion: newMotion(), meshes: [] };

  for (const color of MECH_COLORS) {
    const boxes = byColor.get(color);
    if (boxes === undefined) continue;
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshLambertMaterial({ color: look.palette[color] }),
      boxes.length,
    );
    if (color === FLAME_HOST) {
      // the material's colour is multiplied by the instance's: white leaves the solid boxes as they are, and the flame
      // gets the ratio that turns the material's colour into the flame's
      const own = new THREE.Color(look.palette[color]);
      const flame = new THREE.Color(MECH_FLAME_COLOR);
      const floor = 1 / 255;
      boxes.forEach((box, index) =>
        mesh.setColorAt(
          index,
          box.limb === 'flame'
            ? new THREE.Color(
                flame.r / Math.max(own.r, floor),
                flame.g / Math.max(own.g, floor),
                flame.b / Math.max(own.b, floor),
              )
            : new THREE.Color(1, 1, 1),
        ),
      );
    }
    rig.meshes.push({ mesh, boxes, solid: solid.get(color) ?? boxes.length });
    // three r128 culls by the shape's bounds alone, so an instanced mech would vanish at the screen's edge
    mesh.frustumCulled = false;
    mesh.name = 'mech';
    group.add(mesh);
  }
  rigs.set(group, rig);
  poseMech(rig);
  return group;
}

const tmpPosition = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpMatrix = new THREE.Matrix4();

// Writes every box's matrix from the rig's motion. A leg turns about the hip; everything else leans about the hip and
// sinks together, the arms pulled back first and the flame grown to its length.
function poseMech(rig: MechRig): void {
  const { height, hipY, motion } = rig;
  const pivotY = hipY * height;
  const lean = leanAngle(motion);
  const sink = dipDepth(motion) * height;
  const back = recoilBack(motion) * height;
  const flame = flameLength(motion) * height;
  for (const { mesh, boxes, solid } of rig.meshes) {
    boxes.forEach((box, index) => {
      const x = box.at[0] * height;
      let y = box.at[1] * height;
      let z = box.at[2] * height;
      let sizeX = box.size[0] * height;
      let sizeY = box.size[1] * height;
      let sizeZ = box.size[2] * height;
      let turn: number;
      if (box.limb === 'leg') {
        turn = legAngle(motion, rig.gait, rig.look, box.sx, box.sz);
      } else {
        turn = lean;
        y -= sink;
        if (box.limb === 'arm') z += back;
        if (box.limb === 'flame') {
          sizeX = MOTION_TUNE.flameSize * height;
          sizeY = sizeX;
          sizeZ = Math.max(flame, 1e-4);
          z += sizeZ / 2;
        }
      }
      // turn about the x axis through the hip
      const dy = y - pivotY;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      tmpPosition.set(x, pivotY + dy * cos - z * sin, dy * sin + z * cos);
      tmpQuaternion.setFromAxisAngle(X_AXIS, box.rotX + turn);
      tmpScale.set(sizeX, sizeY, sizeZ);
      mesh.setMatrixAt(index, tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale));
    });
    mesh.count = flame > 0 ? boxes.length : solid;
    mesh.instanceMatrix.needsUpdate = true;
  }
}

// Moves the mech one frame: the motion follows what the mech did, then the boxes take their places. The flame is
// drawn only while the boost shows, so the mech's boxes and triangles are the same as before when it is not boosting.
export function animateMech(root: THREE.Object3D, input: MotionInput, dt: number): void {
  const rig = rigs.get(root);
  if (rig === undefined) return;
  stepMotion(rig.motion, input, dt, rig.look.stride * rig.height);
  poseMech(rig);
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh).isMesh === true;
}

function isInstanced(mesh: THREE.Mesh): mesh is THREE.InstancedMesh {
  return (mesh as THREE.InstancedMesh).isInstancedMesh === true;
}

// Makes every material of the mech see-through (`opacity` below 1) or solid again (1). It only flips the materials, so
// the draw calls stay the same.
export function setMechOpacity(root: THREE.Object3D, opacity: number): void {
  root.traverse(object => {
    if (!isMesh(object)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material.transparent = opacity < 1;
      material.opacity = opacity;
    }
  });
}

export function countMechDraws(root: THREE.Object3D): { calls: number; triangles: number } {
  let calls = 0;
  let triangles = 0;
  root.traverse(object => {
    if (!isMesh(object)) return;
    calls++;
    const index = object.geometry.getIndex();
    const corners = index === null ? object.geometry.getAttribute('position').count : index.count;
    triangles += (corners / 3) * (isInstanced(object) ? object.count : 1);
  });
  return { calls, triangles };
}

export function disposeMech(root: THREE.Object3D): void {
  root.traverse(object => {
    if (!isMesh(object)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}
