// The mid boss, the heavy command mech (SB-1850, built from parts by SB-2049): the same shapes the soldiers and the
// player are made of (view/mechShapes.ts: chamfered plates, tubes, rings, pistons, bolts), put together in code from the
// boss's three-view drawing. It stands in metres with its feet at y = 0 and its front at -z, 6 m high, within the hit
// box's 2.5 m radius at the body (the gatling and the cannon reach past it, as a weapon does).
//
// The front is thick: a deep chest plate, chevron plates on its sides, big shoulders and a knee guard on each leg, with
// red bands on them. The back is thin and shows what a shot takes double there: a plain radiator plate with a row of
// slits and three thruster nozzles. The shapes are merged into three groups, each one draw, so the screen can colour
// them apart: the body (painted in WARDEN_PALETTE, the boss row of PROTO_PALETTES lightened), the lamps (the eyes, the chest slot, the shoulder
// light and the missile tubes, which warm while it warns of a burst) and the vents (the radiator's slits and the
// nozzles, which burn open while it is exposed). The lamps and the vents are white here and take their colour per copy.
import * as THREE from 'three';
import { WARDEN_PALETTE } from '../data/colors.ts';
import {
  bakeGeometry,
  boltsGeometry,
  mergeShapes,
  pistonGeometry,
  plateGeometry,
  ringGeometry,
  tubeGeometry,
  type PlateTaper,
  type ShapeAxis,
} from './mechShapes.ts';

export interface WardenShapes {
  body: THREE.BufferGeometry; // painted armour, frame and red bands
  lamps: THREE.BufferGeometry; // the lit shapes of the front and the shoulders (white)
  vents: THREE.BufferGeometry; // the slits and nozzles of the back (white)
}

const PALETTE = WARDEN_PALETTE;
const BEVEL = 0.07; // a plate's chamfer (m)
const WHITE = 0xffffff;

type At = readonly [number, number, number];

// Paints every vertex of a shape with one colour, so shapes of different colours join into one geometry.
function paint(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const color = new THREE.Color(hex);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function plate(size: At, at: At, color: number, taper?: PlateTaper, rot?: At, bevel = BEVEL): THREE.BufferGeometry {
  return paint(bakeGeometry(plateGeometry(size[0], size[1], size[2], bevel, 1, taper), at, rot), color);
}

function tube(radius: number, length: number, axis: ShapeAxis, at: At, color: number): THREE.BufferGeometry {
  return paint(bakeGeometry(tubeGeometry(radius, length, axis, 10), at), color);
}

function ring(radius: number, tubeRadius: number, axis: ShapeAxis, at: At, color: number): THREE.BufferGeometry {
  return paint(bakeGeometry(ringGeometry(radius, tubeRadius, axis, 14), at), color);
}

function piston(radius: number, length: number, at: At, color: number): THREE.BufferGeometry {
  return paint(bakeGeometry(pistonGeometry(radius, length, 'y'), at), color);
}

const mirror = (at: At, side: number): At => [at[0] * side, at[1], at[2]];

// A part on both sides of the body (the right one at +x), the left one turned about y when it has a turn.
function pair(make: (side: number) => THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  return [...make(1), ...make(-1)];
}

function bodyShapes(): THREE.BufferGeometry[] {
  const { armor, frame, accent } = PALETTE;
  const parts: THREE.BufferGeometry[] = [];

  // the feet, the shins and the knee guards
  parts.push(
    ...pair(s => [
      plate([1.1, 0.5, 2.0], mirror([1.0, 0.25, -0.35], s), frame, { front: 0.8 }),
      plate([1.0, 0.22, 1.3], mirror([1.0, 0.64, -0.1], s), accent),
      plate([0.95, 1.5, 1.1], mirror([1.0, 1.55, 0], s), armor, { top: 1.12, bottom: 0.86 }),
      plate([1.0, 0.55, 0.5], mirror([1.0, 2.25, -0.68], s), accent, { nose: 0.7 }),
      piston(0.1, 1.5, mirror([1.0, 1.5, 0.72], s), frame),
      plate([1.1, 1.3, 1.2], mirror([1.0, 2.95, 0], s), armor, { top: 1.1 }),
      tube(0.34, 0.7, 'x', mirror([1.45, 3.45, 0], s), frame),
    ]),
  );

  // the hips, with a skirt of armour hanging in front and a thin plate behind
  parts.push(
    plate([2.8, 0.6, 1.6], [0, 3.62, 0], frame),
    plate([2.2, 0.72, 0.36], [0, 3.42, -0.86], armor, { bottom: 0.82 }),
    plate([1.6, 0.5, 0.3], [0, 3.46, 0.92], frame),
  );

  // the torso: a deep chest, the chevron plates on its sides and the red band under it
  parts.push(
    plate([2.9, 1.7, 1.9], [0, 4.5, 0], armor, { top: 1.12, bottom: 0.86 }),
    plate([2.5, 1.25, 0.6], [0, 4.58, -1.12], armor, { top: 1.1 }, undefined, 0.1),
    plate([2.2, 0.2, 0.5], [0, 3.82, -1.18], accent),
    ...pair(s => [plate([0.7, 1.05, 0.5], mirror([1.16, 4.5, -0.98], s), armor, undefined, [0, -s * 0.35, 0])]),
  );

  // the head, sunk between the shoulders: a visor plate, a crest and the neck
  parts.push(
    plate([1.0, 0.75, 1.0], [0, 5.5, -0.25], frame, { top: 0.86 }),
    plate([0.92, 0.46, 0.2], [0, 5.5, -0.8], armor, { nose: 0.8 }),
    plate([0.5, 0.12, 0.9], [0, 5.93, -0.25], accent),
    tube(0.3, 0.35, 'y', [0, 5.0, -0.1], frame),
  );

  // the shoulders: big armour with a red band on the front, the arms under them and the elbows
  parts.push(
    ...pair(s => [
      plate([1.1, 0.95, 1.5], mirror([1.9, 4.85, 0], s), armor, { top: 1.1 }, undefined, 0.1),
      plate([1.0, 0.2, 0.2], mirror([1.9, 4.5, -0.78], s), accent),
      plate([0.8, 1.1, 0.9], mirror([2.0, 3.95, 0], s), frame),
      tube(0.34, 0.9, 'x', mirror([2.0, 3.35, 0], s), frame),
    ]),
  );

  // the gun arm (right): the forearm, a gatling drum with its rings and three barrels
  const gun: At = [0.9, 3.05, -1.2];
  parts.push(
    plate([0.8, 0.8, 1.3], [1.8, 3.0, -0.75], armor, { front: 0.85 }),
    tube(0.4, 0.9, 'z', gun, frame),
    ring(0.42, 0.09, 'z', [gun[0], gun[1], gun[2] - 0.45], accent),
    ring(0.42, 0.09, 'z', [gun[0], gun[1], gun[2] + 0.4], accent),
    ring(0.27, 0.05, 'z', [gun[0], gun[1], gun[2] - 1.55], frame),
  );
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
    parts.push(
      tube(0.09, 1.45, 'z', [gun[0] + Math.cos(angle) * 0.22, gun[1] + Math.sin(angle) * 0.22, gun[2] - 1.15], frame),
    );
  }

  // the free arm (left): the forearm and a claw
  parts.push(
    plate([0.8, 0.8, 1.1], [-1.95, 3.0, -0.5], armor, { front: 0.85 }),
    plate([0.6, 0.4, 0.5], [-1.95, 2.55, -0.85], frame),
    plate([0.18, 0.6, 0.26], [-2.2, 2.1, -0.95], frame, undefined, [0, 0, 0.35]),
    plate([0.18, 0.6, 0.26], [-1.7, 2.1, -0.95], frame, undefined, [0, 0, -0.35]),
  );

  // the shoulder weapons: a missile pod on the left, a cannon on the right
  parts.push(
    plate([1.1, 0.7, 0.5], [-1.9, 5.55, 0.35], frame, undefined, undefined, 0.06),
    plate([0.8, 0.55, 0.9], [1.9, 5.55, 0.15], frame),
    tube(0.12, 2.4, 'z', [1.9, 5.58, -1.5], frame),
    ring(0.15, 0.05, 'z', [1.9, 5.58, -2.65], accent),
    plate([0.9, 0.12, 0.7], [1.9, 5.9, 0.15], accent),
  );

  // the back: the pack, the radiator plate with its bolts, the spine's pistons and the three nozzles
  parts.push(
    plate([2.2, 1.7, 0.55], [0, 4.6, 1.2], frame),
    plate([1.5, 1.1, 0.16], [0, 4.6, 1.5], armor, undefined, undefined, 0.03),
    ...pair(s => [
      paint(bakeGeometry(boltsGeometry(0.22, 6, 0.045, 'z'), mirror([0.95, 4.6, 1.6], s)), frame),
      piston(0.08, 1.2, mirror([0.95, 4.2, 0.95], s), frame),
    ]),
  );
  for (const x of [-0.7, 0, 0.7]) {
    parts.push(tube(0.3, 0.5, 'z', [x, 3.8, 1.55], frame), ring(0.3, 0.06, 'z', [x, 3.8, 1.8], accent));
  }
  return parts;
}

function lampShapes(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  // the three eyes, the slot across the chest and the shoulder light that warns of a burst
  for (const [x, y] of [
    [-0.26, 5.45],
    [0.26, 5.45],
    [0, 5.64],
  ]) {
    parts.push(plate([0.17, 0.15, 0.08], [x, y, -0.92], WHITE, undefined, undefined, 0.02));
  }
  parts.push(
    plate([1.0, 0.14, 0.1], [0, 4.0, -1.46], WHITE, undefined, undefined, 0.02),
    plate([0.7, 0.1, 0.1], [0, 5.18, -0.86], WHITE, undefined, undefined, 0.02),
    plate([0.5, 0.12, 0.1], [1.9, 5.1, -0.8], WHITE, undefined, undefined, 0.02),
    plate([0.5, 0.12, 0.1], [-1.9, 5.1, -0.8], WHITE, undefined, undefined, 0.02),
  );
  // the six missile tubes in the pod's face
  for (const x of [-2.2, -1.9, -1.6]) {
    for (const y of [5.43, 5.67]) parts.push(tube(0.1, 0.06, 'z', [x, y, 0.08], WHITE));
  }
  return parts;
}

function ventShapes(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  // five slits across the radiator plate and the glow in each nozzle
  for (let i = 0; i < 5; i++) {
    parts.push(plate([1.2, 0.07, 0.08], [0, 4.2 + i * 0.2, 1.6], WHITE, undefined, undefined, 0.015));
  }
  for (const x of [-0.7, 0, 0.7]) parts.push(tube(0.22, 0.05, 'z', [x, 3.8, 1.78], WHITE));
  return parts;
}

// Builds the three shapes of the mid boss, each with the vertex colours its group needs.
export function buildWardenShapes(): WardenShapes {
  const done = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
    const merged = mergeShapes(parts);
    merged.computeVertexNormals();
    return merged;
  };
  return { body: done(bodyShapes()), lamps: done(lampShapes()), vents: done(ventShapes()) };
}
