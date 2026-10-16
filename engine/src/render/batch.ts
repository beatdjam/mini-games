import * as THREE from 'three';
// engine: Many small things of a few kinds (boxes, planes, a sign, a lamp), drawn as one instanced mesh per kind, so a
// place crowded with props costs a draw for each kind and not for each thing.
// put: one thing of kind `key`, its middle at (x, y, z), turned by `ry` about y and then tilted by `rx` about its own
// x, scaled. `make` is called once, for the first thing of a kind: the geometry and material of every thing of it.
// done: adds one instanced mesh per kind to `group` (call it once, after the last put)
export function batcher(group: THREE.Group) {
  const at = new THREE.Object3D(),
    lots = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; m: THREE.Matrix4[] }>();
  at.rotation.order = 'YXZ';
  return {
    put(
      key: string,
      make: () => [THREE.BufferGeometry, THREE.Material],
      x: number,
      y: number,
      z: number,
      ry = 0,
      rx = 0,
      scale: [number, number, number] = [1, 1, 1],
    ) {
      let lot = lots.get(key);
      if (!lot) {
        const [geo, mat] = make();
        lot = { geo, mat, m: [] };
        lots.set(key, lot);
      }
      at.position.set(x, y, z);
      at.rotation.set(rx, ry, 0);
      at.scale.set(...scale);
      at.updateMatrix();
      lot.m.push(at.matrix.clone());
    },
    done() {
      for (const lot of lots.values()) {
        const mesh = new THREE.InstancedMesh(lot.geo, lot.mat, lot.m.length);
        lot.m.forEach((m, n) => mesh.setMatrixAt(n, m));
        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
      }
    },
  };
}
export type Batch = ReturnType<typeof batcher>;
