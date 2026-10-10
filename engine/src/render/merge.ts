import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// engine: A model built of many parts, drawn as few. Each part is a mesh, and each mesh costs a draw (and a draw is
// what a phone runs out of first); but most parts never move on their own: they move with the part they are fixed to.
// mergeParts joins those: under each object that moves (the root, and every object in `keep`: what the model's
// animation turns, what the game's code reaches for), the parts that move with it, however deep they hang from groups
// of their own, become one mesh per material, their places baked into the shape. What is drawn is the same, with the
// same materials (a hit flash on the body's material still lights the whole body).
// Left as they are: the objects in `keep` (and the groups on the way to one), and any group holding something that is
// not a plain mesh (a line, a sprite, an instanced mesh, a mesh with several materials or with its own onBeforeRender)
// or something hidden. Call it once, when the model is built and before it is drawn: the merged shapes are new (the
// parts' shapes are not touched: they may be shared), and belong to the model.
export function mergeParts(root: THREE.Object3D, keep: Iterable<THREE.Object3D | null | undefined> = []) {
  const kept = new Set<THREE.Object3D>();
  for (const k of keep) if (k) kept.add(k);
  const holdsKept = (o: THREE.Object3D): boolean => kept.has(o) || o.children.some(holdsKept);
  const plain = (o: THREE.Object3D): boolean => {
    if (!o.visible) return false;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      if ((m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false;
      if (Array.isArray(m.material)) return false;
      if (m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
    } else if (o.type !== 'Group' && o.type !== 'Object3D') return false;
    return o.children.every(plain);
  };
  const visit = (node: THREE.Object3D) => {
    // the parts that move with `node`: by material (and what the shapes carry), each with its place under node
    const bins = new Map<string, { mesh: THREE.Mesh; at: THREE.Matrix4 }[]>(),
      gone: THREE.Object3D[] = [];
    const collect = (o: THREE.Object3D, above: THREE.Matrix4) => {
      o.updateMatrix();
      const at = above.clone().multiply(o.matrix),
        m = o as THREE.Mesh;
      if (m.isMesh) {
        const g = m.geometry,
          key = [
            (m.material as THREE.Material).uuid,
            g.index ? 'i' : 'n',
            Object.keys(g.attributes).sort().join(','),
            m.renderOrder,
          ].join('|');
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key)!.push({ mesh: m, at });
      }
      o.children.forEach(c => collect(c, at));
    };
    for (const c of [...node.children]) {
      if (holdsKept(c) || !plain(c)) visit(c);
      else {
        collect(c, new THREE.Matrix4());
        gone.push(c);
      }
    }
    // a bin of one part that is a child of node itself, with nothing under it, is left as it was (nothing to join)
    for (const [, parts] of bins) {
      const only = parts[0]!.mesh;
      if (parts.length === 1 && only.parent === node && !only.children.length) {
        gone.splice(gone.indexOf(only), 1);
        continue;
      }
      const shapes = parts.map(p => p.mesh.geometry.clone().applyMatrix4(p.at)),
        // (shapes that do not join, one by one: their places are baked in all the same)
        joined = BufferGeometryUtils.mergeBufferGeometries(shapes);
      for (const shape of joined ? [joined] : shapes) {
        const first = parts[0]!.mesh,
          mesh = new THREE.Mesh(shape, first.material);
        mesh.renderOrder = first.renderOrder;
        mesh.frustumCulled = first.frustumCulled;
        mesh.castShadow = first.castShadow;
        mesh.receiveShadow = first.receiveShadow;
        node.add(mesh);
      }
    }
    for (const c of gone) node.remove(c);
  };
  visit(root);
}
