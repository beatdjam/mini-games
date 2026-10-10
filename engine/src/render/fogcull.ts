import type * as THREE from 'three';
// engine: Things out in the fog are not drawn. Past the scene's fog far a thing whose materials take the fog is all
// fog colour, the same as the fog behind it; drawing it costs as much as anywhere (a model of many parts costs a draw
// for each), so it is hidden instead. Call it every frame, after the things have moved, for the things that move
// about (enemies and the like): what stands still is better made cheap once (merged), not looked at every frame.
// A thing counts by its position (in its parent's frame: keep the parent at the origin) and `reach`, how far it
// stands out from there (its radius); past the fog's far plus that, it is hidden, else shown. Without a fog (or a fog
// that is not THREE.Fog) everything is shown. Only for things whose every material takes the fog (fog: true, the
// default): a lamp or a glow drawn without it would be seen through the fog, and would go when hidden.
export function hideInFog(
  things: Iterable<{ mesh: THREE.Object3D }>,
  eye: THREE.Vector3,
  fog: THREE.FogBase | null,
  reach: number,
) {
  const far = fog && 'far' in fog ? (fog as THREE.Fog).far + reach : Infinity;
  for (const { mesh } of things) {
    const dx = mesh.position.x - eye.x,
      dy = mesh.position.y - eye.y,
      dz = mesh.position.z - eye.z;
    mesh.visible = dx * dx + dy * dy + dz * dz <= far * far;
  }
}
