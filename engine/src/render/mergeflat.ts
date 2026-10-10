import * as THREE from 'three';
// engine: Things that stand still and are only coloured (no picture, not see-through), drawn as one. A floor dressed with
// props has a kind of thing for every shape and colour (an instanced mesh each, a draw each); mergeFlat joins, under
// each object of `root`, its instanced meshes of an unlit, untextured, opaque material into one mesh, each copy's
// colour (the material's times the copy's own) baked into its corners. What is drawn is the same. Kept apart:
// materials that differ in how they are drawn (which side, the fog, the depth test), and everything else (lit or
// textured or see-through materials, plain meshes: a door that slides is a plain mesh). Under each object on its own,
// so a group that is shown and hidden by itself still is. Only for things that will not move, change colour or be
// counted again: their instanced meshes are gone afterwards. Call it once, after the props are built.
export function mergeFlat(root: THREE.Object3D) {
  const flat = (m: THREE.Material): m is THREE.MeshBasicMaterial => {
    const b = m as THREE.MeshBasicMaterial;
    return (
      b.type === 'MeshBasicMaterial' &&
      !b.map &&
      !b.alphaMap &&
      !b.transparent &&
      b.opacity === 1 &&
      b.alphaTest === 0 &&
      b.blending === THREE.NormalBlending &&
      !b.vertexColors &&
      b.colorWrite &&
      !b.stencilWrite &&
      !b.polygonOffset &&
      !b.wireframe
    );
  };
  const visit = (node: THREE.Object3D) => {
    const bins = new Map<string, THREE.InstancedMesh[]>();
    for (const c of node.children) {
      const m = c as THREE.InstancedMesh;
      if (!m.isInstancedMesh || Array.isArray(m.material) || !flat(m.material) || !m.visible || !m.count) {
        visit(c);
        continue;
      }
      const mat = m.material,
        key = [mat.side, mat.fog, mat.depthTest, mat.depthWrite, mat.depthFunc, mat.toneMapped, m.renderOrder].join(
          '|',
        );
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key)!.push(m);
    }
    for (const meshes of bins.values()) {
      if (meshes.length < 2) continue;
      const pos: number[] = [],
        col: number[] = [],
        at = new THREE.Matrix4(),
        tint = new THREE.Color(),
        p = new THREE.Vector3();
      for (const m of meshes) {
        m.updateMatrix();
        const g = m.geometry,
          vs = g.getAttribute('position'),
          order = g.index ? Array.from(g.index.array) : Array.from({ length: vs.count }, (_, k) => k),
          base = (m.material as THREE.MeshBasicMaterial).color;
        for (let n = 0; n < m.count; n++) {
          m.getMatrixAt(n, at);
          at.premultiply(m.matrix);
          tint.copy(base);
          if (m.instanceColor) tint.multiply(new THREE.Color().fromArray(m.instanceColor.array, n * 3));
          for (const k of order) {
            p.fromBufferAttribute(vs, k).applyMatrix4(at);
            pos.push(p.x, p.y, p.z);
            col.push(tint.r, tint.g, tint.b);
          }
        }
      }
      const shape = new THREE.BufferGeometry(),
        first = meshes[0]!.material as THREE.MeshBasicMaterial;
      shape.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      shape.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const joined = new THREE.Mesh(
        shape,
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: first.side,
          fog: first.fog,
          depthTest: first.depthTest,
          depthWrite: first.depthWrite,
          depthFunc: first.depthFunc,
          toneMapped: first.toneMapped,
        }),
      );
      joined.renderOrder = meshes[0]!.renderOrder;
      for (const m of meshes) node.remove(m);
      node.add(joined);
    }
  };
  visit(root);
}
