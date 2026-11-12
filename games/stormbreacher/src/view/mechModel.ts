// Draws a mech out of boxes. It never reads the game's state (no GameModel). The shape is one shared unit box and one
// InstancedMesh per colour, so a mech costs as many draw calls as the colours it uses (D-45). The look's second card
// grows this into the look the game wears.
import * as THREE from 'three';
import {
  CORES,
  MECH_COLORS,
  PARTS,
  WEAPON_LOOK,
  type MechBox,
  type MechBuild,
  type MechColor,
  type Vec3,
} from '../data/mech.ts';

export interface MechLook {
  build: MechBuild;
  palette: Record<MechColor, number>; // hex per colour name
  weaponScale: number; // scales the weapons' boxes and their offsets from the mount; 1 is as the table says
}

interface PlacedBox {
  size: Vec3;
  at: Vec3;
  color: MechColor;
  rotX: number;
}

const X_AXIS = new THREE.Vector3(1, 0, 0);

const atXZ = (at: Vec3, x: number, z: number): Vec3 => [at[0] * x, at[1], at[2] * z];

// One box as the table says, or the 2 or 4 boxes its mirror asks for.
function place(box: MechBox): PlacedBox[] {
  const base: PlacedBox = { size: box.size, at: box.at, color: box.color, rotX: box.rotX ?? 0 };
  if (box.mirror === undefined) return [base];
  const xs = [1, -1];
  const zs = box.mirror === 'xz' ? [1, -1] : [1];
  const placed: PlacedBox[] = [];
  for (const x of xs) for (const z of zs) placed.push({ ...base, at: atXZ(box.at, x, z) });
  return placed;
}

// Every box in world ratios: the legs stand on the ground, the rest sits on the legs' hip, and the weapons hang from
// their mounts. The look's scale stretches the weapons only.
function placedBoxes(look: MechLook): PlacedBox[] {
  const build = look.build;
  const legs = PARTS.legs[build.legs];
  const hipY = legs.hipY ?? 0;
  const placed: PlacedBox[] = [];
  for (const box of legs.boxes) placed.push(...place(box));

  const upper = [CORES[build.core], PARTS.arms[build.arms], PARTS.back[build.back], PARTS.fcs[build.fcs]];
  for (const part of upper)
    for (const box of part.boxes) placed.push(...place({ ...box, at: [box.at[0], box.at[1] + hipY, box.at[2]] }));

  const addWeapon = (weapon: (typeof build)['main'], mount: Vec3 | undefined) => {
    if (mount === undefined) return;
    const scale = look.weaponScale;
    for (const box of WEAPON_LOOK[weapon])
      placed.push(
        ...place({
          ...box,
          size: [box.size[0] * scale, box.size[1] * scale, box.size[2] * scale],
          at: [box.at[0] * scale + mount[0], box.at[1] * scale + mount[1] + hipY, box.at[2] * scale + mount[2]],
        }),
      );
  };
  addWeapon(build.main, PARTS.arms[build.arms].mount);
  addWeapon(build.sub, PARTS.back[build.back].mount);
  return placed;
}

export function buildMechVisual(look: MechLook, height: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'mech';

  const byColor = new Map<MechColor, PlacedBox[]>();
  for (const box of placedBoxes(look)) {
    const list = byColor.get(box.color);
    if (list === undefined) byColor.set(box.color, [box]);
    else list.push(box);
  }

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (const color of MECH_COLORS) {
    const boxes = byColor.get(color);
    if (boxes === undefined) continue;
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshLambertMaterial({ color: look.palette[color] }),
      boxes.length,
    );
    boxes.forEach((box, index) => {
      position.set(box.at[0] * height, box.at[1] * height, box.at[2] * height);
      quaternion.setFromAxisAngle(X_AXIS, box.rotX);
      scale.set(box.size[0] * height, box.size[1] * height, box.size[2] * height);
      mesh.setMatrixAt(index, matrix.compose(position, quaternion, scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
    // three r128 culls by the shape's bounds alone, so an instanced mech would vanish at the screen's edge
    mesh.frustumCulled = false;
    mesh.name = 'mech';
    group.add(mesh);
  }
  return group;
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
