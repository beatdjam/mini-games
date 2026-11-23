// The mid boss, the heavy command mech (SB-1850, rebuilt on the mech kit by SB-2049): the same machine the line soldiers
// and the player are made of. Its `warden` kit (data/mechProto.ts) is the boss's black machine with layers of armour
// added (the thick legs, the stacked pauldrons, the stepped chest, the fin stack and nozzles of the back, the gold command
// crest), baked once like a soldier's (view/mechProtoBake.ts). The kit is built a size larger than the height it is asked
// for, so the model is asked for `height / kit.scale`, and it stands with its feet at y = 0 and its front at -z.
//
// The front is thick: the slab and brow of the chest, the pauldrons, the knee guards, the pod and the turret. The back is
// the weak side and shows it: the pack, its fin stack and its radiator, where the slits and the nozzles burn. Three
// shapes are made, each one draw, so the screen can colour them apart: the body (painted in WARDEN_PALETTE), the lamps
// (the kit's lit shapes: the eyes, the chest lamp, the sensor lenses, which warm while it warns of a burst) and the vents
// (the slits across the radiator and the glow in each nozzle, which burn open while it is exposed). The lamps and the
// vents are white here and take their colour per copy.
import * as THREE from 'three';
import { PROTO_KITS, PROTO_SKELETON } from '../data/mechProto.ts';
import { bakeProtoParts } from './mechProtoBake.ts';
import { bakeGeometry, mergeShapes, plateGeometry, tubeGeometry } from './mechShapes.ts';

export interface WardenShapes {
  body: THREE.BufferGeometry; // painted armour, frame and the command mark
  lamps: THREE.BufferGeometry; // the lit shapes of the front (white)
  vents: THREE.BufferGeometry; // the slits and nozzles of the back (white)
}

export const WARDEN_KIT = 'warden';
// The kit's turret, antennas and crest stand above its head, so the machine is built a little under the hit box's height
// (6 m): its shoulders and head sit inside the box and the turret and the pod reach just over it, as a weapon does.
export const WARDEN_FIT = 0.92;
const WHITE = 0xffffff;

// The slits across the radiator and the nozzles' glow stand where the kit's pack has them, in the kit's ratios of the
// height from the hip top (the rear face of the pack is at z = 0.28).
const VENT_COLUMNS = [-0.09, 0, 0.09];
const VENT_SLIT_Y = [0.18, 0.21, 0.24, 0.27, 0.3];
const VENT_SLIT_Z = 0.286;
const NOZZLE_Y = 0.08;
const NOZZLE_Z = 0.318;

function paint(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const color = new THREE.Color(hex);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function ventShapes(height: number): THREE.BufferGeometry {
  const hip = PROTO_SKELETON.hipY;
  const at = (x: number, y: number, z: number): [number, number, number] => [
    x * height,
    (hip + y) * height,
    z * height,
  ];
  const parts: THREE.BufferGeometry[] = [];
  for (const x of VENT_COLUMNS) {
    for (const y of VENT_SLIT_Y) {
      parts.push(
        paint(
          bakeGeometry(plateGeometry(0.05 * height, 0.014 * height, 0.01 * height, 0.002, 1), at(x, y, VENT_SLIT_Z)),
          WHITE,
        ),
      );
    }
    parts.push(
      paint(bakeGeometry(tubeGeometry(0.03 * height, 0.01 * height, 'z', 12), at(x, NOZZLE_Y, NOZZLE_Z)), WHITE),
    );
  }
  const merged = mergeShapes(parts);
  merged.computeVertexNormals();
  return merged;
}

export interface WardenBuild extends WardenShapes {
  triangles: { body: number; lamps: number; vents: number };
}

// Builds the three shapes of the mid boss for a hit box `height` m tall.
export function buildWardenShapes(boxHeight: number): WardenBuild {
  const height = boxHeight * WARDEN_FIT;
  const scale = PROTO_KITS[WARDEN_KIT].scale ?? 1;
  const { painted, lit } = bakeProtoParts(WARDEN_KIT, height / scale, 'full');
  if (painted === null || lit === null) throw new Error('the warden kit baked no body or no lamps');
  painted.computeVertexNormals();
  paint(lit, WHITE);
  lit.computeVertexNormals();
  const vents = ventShapes(height);
  const count = (geometry: THREE.BufferGeometry): number => geometry.getAttribute('position').count / 3;
  return {
    body: painted,
    lamps: lit,
    vents,
    triangles: { body: count(painted), lamps: count(lit), vents: count(vents) },
  };
}
