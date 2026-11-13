// The pieces both map views draw: the ground tiles that cover the bounds, the mission's areas as thin frames, the wave
// spawn points as small marks, and the count of props by kind for the screen.
import * as THREE from 'three';
import {
  type Area,
  type BlastPlace,
  type MapBounds,
  type Prop,
  type PropKind,
  type SpawnPoint,
} from '../../data/types.ts';

const AREA_COLOR = 0x8fd3ff; // the mission's areas are a pale blue frame
const SPAWN_COLOR = 0xffcf6a; // the spawn points are a yellow ring
const BLAST_COLOR = 0xff9d3d; // the blast points are a warmer ring than the spawn marks
const FRAME_Y = 0.06; // just above the ground (m)
const SPAWN_Y = 0.08; // ... and the same for the rings (m)
const BLAST_Y = 0.1; // above the spawn marks, so a point in the same place still reads (m)
const SPAWN_RING = { inner: 1.2, outer: 2.2 } as const; // the mark's size (m)
const BLAST_RING = { inner: 1.7, outer: 2.4 } as const;

export { groundTiles } from '../../view/world.ts';

export function countProps(props: readonly Prop[]): Record<PropKind, number> {
  const counts: Record<PropKind, number> = {
    tile: 0,
    hedgehog: 0,
    block: 0,
    bunker: 0,
    seawall: 0,
    cliff: 0,
    crater: 0,
    wreck: 0,
    lowWall: 0,
    stairs: 0,
    ramp: 0,
  };
  for (const prop of props) counts[prop.kind]++;
  return counts;
}

// The mission's places on the ground, clipped to the map's bounds so a place that runs past the edge still reads.
export function buildAreaFrames(areas: Record<string, Area>, bounds: MapBounds): THREE.Group {
  const group = new THREE.Group();
  group.name = 'areas';
  for (const [name, area] of Object.entries(areas)) {
    const minX = Math.max(bounds.minX, area.x - area.w / 2);
    const maxX = Math.min(bounds.maxX, area.x + area.w / 2);
    const minZ = Math.max(bounds.minZ, area.z - area.d / 2);
    const maxZ = Math.min(bounds.maxZ, area.z + area.d / 2);
    if (minX >= maxX || minZ >= maxZ) continue;
    const points = [
      new THREE.Vector3(minX, FRAME_Y, minZ),
      new THREE.Vector3(maxX, FRAME_Y, minZ),
      new THREE.Vector3(maxX, FRAME_Y, maxZ),
      new THREE.Vector3(minX, FRAME_Y, maxZ),
      new THREE.Vector3(minX, FRAME_Y, minZ),
    ];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: AREA_COLOR, transparent: true, opacity: 0.75 }),
    );
    line.name = `area:${name}`;
    group.add(line);
  }
  return group;
}

// A small ring at each place a wave comes in.
export function buildSpawnMarks(spawns: Record<string, SpawnPoint[]>): THREE.Group {
  const group = new THREE.Group();
  group.name = 'spawns';
  const geometry = new THREE.RingGeometry(SPAWN_RING.inner, SPAWN_RING.outer, 16).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: SPAWN_COLOR, side: THREE.DoubleSide });
  for (const [wave, places] of Object.entries(spawns)) {
    for (const place of places) {
      const mark = new THREE.Mesh(geometry, material);
      mark.name = `spawn:${wave}`;
      mark.position.set(place.x, SPAWN_Y, place.z);
      group.add(mark);
    }
  }
  return group;
}

// A small ring at each blast point, one instanced mesh for all of them so the map view adds one draw.
export function buildBlastMarks(blasts: readonly BlastPlace[] | undefined): THREE.Group {
  const group = new THREE.Group();
  group.name = 'blasts';
  if (!blasts || blasts.length === 0) return group;
  const geometry = new THREE.RingGeometry(BLAST_RING.inner, BLAST_RING.outer, 16).rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: BLAST_COLOR, side: THREE.DoubleSide }),
    blasts.length,
  );
  mesh.name = 'sb-blast-marks';
  const place = new THREE.Object3D();
  blasts.forEach((blast, i) => {
    place.position.set(blast.x, BLAST_Y, blast.z);
    place.updateMatrix();
    mesh.setMatrixAt(i, place.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return group;
}
