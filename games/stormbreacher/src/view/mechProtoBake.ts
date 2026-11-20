// The enemies' machines (SB-2083) as the screen draws them: a kit of data/mechProto.ts built and posed on its bones
// (view/mechProtoModel.ts), then baked into one static geometry. Every vertex goes through its bone with
// THREE.SkinnedMesh.boneTransform, takes its material's colour, and the shapes are joined into two groups: the painted
// armour and the lit lamps. One geometry then serves a whole crowd as an instanced mesh, near or far, and a far build
// keeps only the shapes the distance still shows (PROTO_TUNE.farShape).
import * as THREE from 'three';
import { type ProtoDetail, type ProtoKitName } from '../data/mechProto.ts';
import { buildProtoMech, disposeProtoMech } from './mechProtoModel.ts';
import { mergeShapes } from './mechShapes.ts';

export interface BakedProto {
  geometry: THREE.BufferGeometry; // group 0 painted, group 1 lit when the kit has lit shapes
  lit: boolean; // whether the geometry carries the lit group
  triangles: number;
}

// Paints every vertex of a shape with one colour, so the merged geometry needs no material per shape.
function paint(geometry: THREE.BufferGeometry, hex: number): void {
  const color = new THREE.Color(hex);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export function bakeProtoMech(kitId: ProtoKitName, height: number, detail: ProtoDetail = 'full'): BakedProto {
  const group = buildProtoMech(height, kitId, undefined, detail);
  group.updateMatrixWorld(true);
  const painted: THREE.BufferGeometry[] = [];
  const lit: THREE.BufferGeometry[] = [];
  const point = new THREE.Vector3();
  group.traverse(object => {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh !== true) return;
    const source = mesh.geometry;
    const positions = source.getAttribute('position');
    const skinned = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      mesh.boneTransform(i, point);
      skinned[i * 3] = point.x;
      skinned[i * 3 + 1] = point.y;
      skinned[i * 3 + 2] = point.z;
    }
    const made = new THREE.BufferGeometry();
    made.setAttribute('position', new THREE.BufferAttribute(skinned, 3));
    const material = mesh.material as THREE.MeshStandardMaterial;
    // materialOf (view/mechProtoModel.ts) gives a lit material its colour as an emissive and leaves its paint black
    const glow = material.emissive !== undefined && material.emissive.getHex() !== 0;
    paint(made, glow ? material.emissive.getHex() : material.color.getHex());
    (glow ? lit : painted).push(made);
  });
  disposeProtoMech(group);

  const paintMerged = painted.length === 0 ? null : mergeShapes(painted);
  const litMerged = lit.length === 0 ? null : mergeShapes(lit);
  let geometry: THREE.BufferGeometry;
  if (paintMerged !== null && litMerged !== null) geometry = mergeShapes([paintMerged, litMerged], true);
  else if (paintMerged !== null) geometry = paintMerged;
  else if (litMerged !== null) geometry = litMerged;
  else throw new Error(`the kit ${kitId} baked no shape`);
  geometry.computeVertexNormals();
  const corners = geometry.getAttribute('position').count;
  return { geometry, lit: litMerged !== null, triangles: corners / 3 };
}
