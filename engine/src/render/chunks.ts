import * as THREE from 'three';
// engine: A level's things in chunks, so only the chunks that can be seen are drawn. three.js does not leave an
// instanced mesh out when it is off screen (r128: frustumCulled is off for them), and a mesh that spans the whole level
// is always on screen somewhere; so a level built as one instanced mesh per kind of thing draws all of it, behind the
// player and past the fog too. chunkInstances splits those meshes by where each copy stands, into a group per chunk
// (size x size metres on the ground) with the box it covers; cullChunks then shows a chunk only when it is in view and
// nearer than `far`, every frame.

export interface Chunk {
  root: THREE.Group; // what stands in the chunk (its own instanced meshes; mergeFlat may join them afterwards)
  box: THREE.Box3; // what it covers, in the frame of the group it was split from
}

// Splits the instanced meshes right under `group` (not deeper: a group of its own is left as it is) into one group per
// chunk, added to `group`. Each copy goes to the chunk its middle stands in. Only a mesh of at least `minTris`
// triangles in all is split: every mesh split is drawn once per chunk, so splitting the light ones would add draws and
// save little; they stay whole, with what else is in `group`. Call it once, after the level is built and before
// mergeFlat (which then joins each chunk's meshes on their own)
export function chunkInstances(group: THREE.Group, size: number, minTris = 0): Chunk[] {
  const chunks = new Map<string, Chunk>(),
    at = new THREE.Matrix4(),
    p = new THREE.Vector3(),
    copyBox = new THREE.Box3();
  const tris = (m: THREE.InstancedMesh) =>
    ((m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3) * m.count;
  const meshes = group.children.filter(
    (c): c is THREE.InstancedMesh =>
      (c as THREE.InstancedMesh).isInstancedMesh && tris(c as THREE.InstancedMesh) >= minTris,
  );
  for (const m of meshes) {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    m.updateMatrix();
    // the copies of this mesh, chunk by chunk
    const by = new Map<string, number[]>();
    for (let n = 0; n < m.count; n++) {
      m.getMatrixAt(n, at);
      at.premultiply(m.matrix);
      p.setFromMatrixPosition(at);
      const key = `${Math.floor(p.x / size)},${Math.floor(p.z / size)}`;
      if (!by.has(key)) by.set(key, []);
      by.get(key)!.push(n);
    }
    for (const [key, list] of by) {
      let c = chunks.get(key);
      if (!c) {
        c = { root: new THREE.Group(), box: new THREE.Box3() };
        chunks.set(key, c);
        group.add(c.root);
      }
      const part = new THREE.InstancedMesh(m.geometry, m.material, list.length);
      part.renderOrder = m.renderOrder;
      part.name = m.name;
      list.forEach((n, k) => {
        m.getMatrixAt(n, at);
        part.setMatrixAt(k, at);
        if (m.instanceColor) part.setColorAt(k, new THREE.Color().fromArray(m.instanceColor.array, n * 3));
        at.premultiply(m.matrix);
        c!.box.union(copyBox.copy(m.geometry.boundingBox!).applyMatrix4(at));
      });
      part.position.copy(m.position);
      part.quaternion.copy(m.quaternion);
      part.scale.copy(m.scale);
      part.visible = m.visible;
      part.instanceMatrix.needsUpdate = true;
      if (part.instanceColor) part.instanceColor.needsUpdate = true;
      c.root.add(part);
    }
    group.remove(m);
  }
  return [...chunks.values()];
}

const frustum = new THREE.Frustum(),
  view = new THREE.Matrix4(),
  world = new THREE.Box3(),
  eye = new THREE.Vector3();
// Shows the chunks that are in the camera's view and nearer than `far` (metres, to the nearest point of the chunk;
// past the end of the fog nothing can be seen anyway), and that `keep` (if given) lets through; hides the rest.
// `frame`: the object the chunks were split from (its place in the world). Call every frame, after the camera moved
export function cullChunks(
  chunks: Chunk[],
  frame: THREE.Object3D,
  camera: THREE.Camera,
  far: number,
  keep?: (box: THREE.Box3) => boolean,
) {
  camera.updateMatrixWorld();
  frame.updateMatrixWorld();
  view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(view);
  camera.getWorldPosition(eye);
  for (const c of chunks) {
    world.copy(c.box).applyMatrix4(frame.matrixWorld);
    c.root.visible = frustum.intersectsBox(world) && world.distanceToPoint(eye) < far && (!keep || keep(world));
  }
}
