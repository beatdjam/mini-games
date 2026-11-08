// A stand-in mech for the scale course: boxes only, feet at the origin, front toward -z. Every part is a fraction of
// the height, so one table sizes the 7, 8 and 10 m models alike.
import * as THREE from 'three';

// Fractions of the mech's height. The width of the whole model (the arms' outside) is 0.375: 8 m tall means 3 m wide.
const PROXY_RATIO = {
  legH: 0.48,
  legW: 0.11,
  legD: 0.14,
  legX: 0.09,
  hipY: 0.48,
  hipH: 0.08,
  hipW: 0.31,
  hipD: 0.2,
  torsoY: 0.56,
  torsoH: 0.28,
  torsoW: 0.26,
  torsoD: 0.2,
  headY: 0.84,
  headH: 0.16,
  headW: 0.12,
  headD: 0.12,
  armY: 0.67,
  armH: 0.34,
  armW: 0.0575,
  armD: 0.09,
  armX: 0.15875,
} as const;

const PROXY_COLOR = 0x8a939c;
const HEAD_COLOR = 0xc45b3c;
const RING_COLOR = 0xffd400;
const RING_WIDTH = 0.2; // the ring's width (m)
const RING_Y = 0.05; // the ring's height above the ground (m)

// Builds the whole mech as one group, standing on y = 0.
export function buildMechProxy(height: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: PROXY_COLOR });
  const head = new THREE.MeshLambertMaterial({ color: HEAD_COLOR });
  const r = PROXY_RATIO;
  const add = (w: number, h: number, d: number, x: number, y: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * height, h * height, d * height), material);
    mesh.position.set(x * height, y * height, 0);
    group.add(mesh);
  };

  // legs
  add(r.legW, r.legH, r.legD, -r.legX, r.legH / 2, body);
  add(r.legW, r.legH, r.legD, r.legX, r.legH / 2, body);
  // hips, torso and head
  add(r.hipW, r.hipH, r.hipD, 0, r.hipY + r.hipH / 2, body);
  add(r.torsoW, r.torsoH, r.torsoD, 0, r.torsoY + r.torsoH / 2, body);
  add(r.headW, r.headH, r.headD, 0, r.headY + r.headH / 2, head);
  // arms
  add(r.armW, r.armH, r.armD, -r.armX, r.armY, body);
  add(r.armW, r.armH, r.armD, r.armX, r.armY, body);
  return group;
}

// The collision radius on the ground: a yellow ring, 0.2 m wide, 0.05 m above the ground.
export function buildRadiusRing(radius: number): THREE.Mesh {
  const inner = Math.max(0, radius - RING_WIDTH / 2);
  const outer = radius + RING_WIDTH / 2;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 48),
    new THREE.MeshBasicMaterial({ color: RING_COLOR, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = RING_Y;
  return ring;
}
