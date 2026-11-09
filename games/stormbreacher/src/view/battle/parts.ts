// The shapes #view-fx's battle draws: one instanced mesh per kind of thing (the allies' bodies and heads, the smoke
// puffs, the tracers) and the cross-shaped planes. Made once at the size the tune asks for; battle/index.ts moves them.
import * as THREE from 'three';
import { MAX_SOLDIERS } from '../../logic/crowd.ts';

const BODY = { w: 0.55, h: 1.05, d: 0.4 } as const; // an ally's body (m)
const HEAD = 0.4; // an ally's head (m)
const ALLY_BODY_COLOR = 0x5d6b57; // the allies' uniforms
const ALLY_HEAD_COLOR = 0x8f8064; // the helmets

const TRACER = { length: 6, width: 0.075 } as const; // a tracer's size (m)
const TRACER_COLOR = 0xffd27a; // the tracers' line
export const MAX_TRACERS = 240; // the most tracers drawn at once

const PLANE_BODY = { w: 0.9, h: 0.9, d: 6 } as const; // a plane's body (m)
const PLANE_WING = { w: 7, h: 0.16, d: 1.3 } as const; // its wing (m)
const PLANE_COLOR = 0x4b5157; // a plane's colour

const CRATER_SOIL = 0x574b3b; // the hole's floor, darker than the ground
const CRATER_RIM = 0x6f5f49; // the earth thrown up around it
const CRATER_WATER = 0x394a4f; // the water standing in some holes

export interface CraterMeshes {
  discs: THREE.InstancedMesh;
  rims: THREE.InstancedMesh;
  water: THREE.InstancedMesh;
}

// The allies: one box for the body and one for the head, both moved every frame.
export function soldierMeshes(): { bodies: THREE.InstancedMesh; heads: THREE.InstancedMesh } {
  const bodies = new THREE.InstancedMesh(
    new THREE.BoxGeometry(BODY.w, BODY.h, BODY.d),
    new THREE.MeshLambertMaterial({ color: ALLY_BODY_COLOR }),
    MAX_SOLDIERS,
  );
  const heads = new THREE.InstancedMesh(
    new THREE.BoxGeometry(HEAD, HEAD, HEAD),
    new THREE.MeshLambertMaterial({ color: ALLY_HEAD_COLOR }),
    MAX_SOLDIERS,
  );
  for (const mesh of [bodies, heads]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
  }
  return { bodies, heads };
}

// The smoke: cubes of one size, scaled per puff (their colour comes from instanceColor).
export function smokeMesh(size: number): THREE.InstancedMesh {
  const capacity = Math.max(1, size);
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    capacity,
  );
  // make instanceColor before the first draw: three r128 creates it in setColorAt
  const color = new THREE.Color(0xffffff);
  for (let i = 0; i < capacity; i++) mesh.setColorAt(i, color);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

export function tracerMesh(): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(TRACER.width, TRACER.width, TRACER.length),
    new THREE.MeshBasicMaterial({ color: TRACER_COLOR }),
    MAX_TRACERS,
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

// A plane is a body and a wing crossed at the middle; the group turns it along its crossing.
export function planeGroup(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: PLANE_COLOR });
  const body = new THREE.Mesh(new THREE.BoxGeometry(PLANE_BODY.w, PLANE_BODY.h, PLANE_BODY.d), material);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(PLANE_WING.w, PLANE_WING.h, PLANE_WING.d), material);
  group.add(body, wing);
  return group;
}

// The shell holes: a dark disc on the ground, a low ring of thrown-up earth around it and, in some holes, water. Each
// is one instanced mesh and the radius comes from the instance's scale.
export function craterMeshes(capacity: number): CraterMeshes {
  const discs = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({
      color: CRATER_SOIL,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    Math.max(1, capacity),
  );
  const rims = new THREE.InstancedMesh(
    new THREE.TorusGeometry(1, 0.035, 5, 18).rotateX(Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: CRATER_RIM }),
    Math.max(1, capacity),
  );
  const water = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({
      color: CRATER_WATER,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    Math.max(1, capacity),
  );
  for (const mesh of [discs, rims, water]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
  }
  return { discs, rims, water };
}
