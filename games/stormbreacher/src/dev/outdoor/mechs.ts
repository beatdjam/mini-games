// The enemy mechs on the beach: 8 m stand-ins that walk slow circles in front of the seawall. Drawn one at a time (a
// group each, many draws) or as one instanced mesh per part (few draws), so a phone's draw calls can be compared.
import * as THREE from 'three';
import { yawToward, type Rng } from '@engine/core/index.ts';
import { hideInFog, scene } from '@engine/render/index.ts';
import { buildMechProxy } from '../../view/mechProxy.ts';

export type MechDraw = 'group' | 'instanced';

export interface MechCrowd {
  root: THREE.Group; // every mech, at the origin (so positions in it are world positions)
  update(dt: number, eye: THREE.Vector3): void; // walk the mechs and hide the ones the fog covers
}

const MECH_HEIGHT = 8; // the stand-in's height (m)
const BAND = { x: [-180, 180], z: [-60, 80] } as const; // where the walking mechs start (m)
const WALK_RADIUS = { min: 6, max: 15 } as const; // the circle each walks (m)
const WALK_SPEED = { min: 3, max: 6 } as const; // how fast it walks the circle (m/s)
const FULL_TURN = Math.PI * 2; // a starting angle's full circle (rad)
const FOG_REACH = 8; // how far past the fog's far a mech may stand and still be drawn (m)

// The comparison line the ?mechs= value asks for: the mechs stand still in front of the seawall.
const LINE_Z = -55; // the line's z (m)
const LINE_GAP = 3.5; // between the mechs' middles (m)

interface Walker {
  x: number; // the middle of its circle (m)
  z: number;
  radius: number; // the circle's radius (m); 0 stands still
  speed: number; // along the circle (m/s)
  angle: number; // where on the circle it is now (rad)
}

interface Place {
  x: number;
  z: number;
  yaw: number;
}

const UP = new THREE.Vector3(0, 1, 0);

// Moves one mech along its circle and says where it stands now.
function step(walker: Walker, dt: number): Place {
  if (walker.radius <= 0) return { x: walker.x, z: walker.z, yaw: 0 };
  walker.angle = (walker.angle + (walker.speed / walker.radius) * dt) % FULL_TURN;
  const sin = Math.sin(walker.angle),
    cos = Math.cos(walker.angle);
  return {
    x: walker.x + cos * walker.radius,
    z: walker.z + sin * walker.radius,
    yaw: yawToward(-sin, cos),
  };
}

// How far the fog still lets a mech be seen (m): the fog's far plus its reach, or no limit without a fog.
function fogFar(): number {
  const fog = scene.fog;
  return fog instanceof THREE.Fog ? fog.far + FOG_REACH : Infinity;
}

function outOfSight(place: Place, eye: THREE.Vector3, far: number): boolean {
  const dx = place.x - eye.x,
    dy = -eye.y,
    dz = place.z - eye.z;
  return dx * dx + dy * dy + dz * dz > far * far;
}

// One group per mech: every part of every mech is its own draw.
function buildGroups(root: THREE.Group, walkers: Walker[]): MechCrowd {
  const proxies = walkers.map(() => {
    const proxy = buildMechProxy(MECH_HEIGHT);
    root.add(proxy);
    return proxy;
  });
  const things = proxies.map(proxy => ({ mesh: proxy }));
  return {
    root,
    update(dt, eye) {
      walkers.forEach((walker, i) => {
        const place = step(walker, dt);
        proxies[i].position.set(place.x, 0, place.z);
        proxies[i].rotation.y = place.yaw;
      });
      hideInFog(things, eye, scene.fog, FOG_REACH);
    },
  };
}

// One instanced mesh per part of the stand-in: the number of draws is the number of parts, however many mechs.
function buildInstanced(root: THREE.Group, walkers: Walker[]): MechCrowd {
  const template = buildMechProxy(MECH_HEIGHT);
  // the stand-in's parts are plain meshes with one material each
  const parts = template.children.filter(
    (child): child is THREE.Mesh => (child as THREE.Mesh).isMesh && !Array.isArray((child as THREE.Mesh).material),
  );
  const locals = parts.map(part => {
    part.updateMatrix();
    return part.matrix.clone();
  });
  const meshes = parts.map(part => {
    // a part of the stand-in has one material (the filter above leaves the arrays out)
    const material = part.material as THREE.Material;
    const mesh = new THREE.InstancedMesh(part.geometry, material, walkers.length);
    mesh.name = 'mech';
    root.add(mesh);
    return mesh;
  });

  const body = new THREE.Matrix4(),
    at = new THREE.Vector3(),
    turn = new THREE.Quaternion(),
    one = new THREE.Vector3(1, 1, 1),
    partAt = new THREE.Matrix4(),
    gone = new THREE.Matrix4().makeScale(0, 0, 0);

  return {
    root,
    update(dt, eye) {
      const far = fogFar();
      walkers.forEach((walker, i) => {
        const place = step(walker, dt);
        if (outOfSight(place, eye, far)) {
          for (const mesh of meshes) mesh.setMatrixAt(i, gone);
          return;
        }
        at.set(place.x, 0, place.z);
        turn.setFromAxisAngle(UP, place.yaw);
        body.compose(at, turn, one);
        meshes.forEach((mesh, j) => {
          partAt.multiplyMatrices(body, locals[j]);
          mesh.setMatrixAt(i, partAt);
        });
      });
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

function walkersFrom(rng: Rng, count: number): Walker[] {
  const walkers: Walker[] = [];
  for (let i = 0; i < count; i++) {
    walkers.push({
      x: rng.rand(BAND.x[0], BAND.x[1]),
      z: rng.rand(BAND.z[0], BAND.z[1]),
      radius: rng.rand(WALK_RADIUS.min, WALK_RADIUS.max),
      speed: rng.rand(WALK_SPEED.min, WALK_SPEED.max),
      angle: rng.rand(0, FULL_TURN),
    });
  }
  return walkers;
}

// `count` mechs walking their own circle, drawn the way `draw` says.
export function spawnMechs(rng: Rng, count: number, draw: MechDraw): MechCrowd {
  const root = new THREE.Group();
  root.name = 'mechs';
  const walkers = walkersFrom(rng, count);
  return draw === 'instanced' ? buildInstanced(root, walkers) : buildGroups(root, walkers);
}

// `count` still mechs in a line in front of the seawall, for comparing the two ways of drawing them.
export function spawnMechLine(count: number, draw: MechDraw): MechCrowd {
  const root = new THREE.Group();
  root.name = 'mechLine';
  const walkers: Walker[] = [];
  for (let i = 0; i < count; i++) {
    walkers.push({
      x: (i - (count - 1) / 2) * LINE_GAP,
      z: LINE_Z,
      radius: 0,
      speed: 0,
      angle: 0,
    });
  }
  return draw === 'instanced' ? buildInstanced(root, walkers) : buildGroups(root, walkers);
}
