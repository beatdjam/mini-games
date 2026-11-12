// The sea past the map's front edge and the landing craft the mech came in on (SB-120). Only drawn: nothing here
// collides, and the map check does not know it. The sea is one plane and the craft is one mesh a colour, so it costs
// three draws.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SEA_COLOR } from '../data/colors.ts';
import type { MapBounds } from '../data/types.ts';

const SEA_LEVEL = -0.1; // the water's surface, just under the sand (m)
const SEA_DEPTH = 260; // how far the sea runs past the front edge (m); the fog hides the end
const SEA_SIDE = 160; // how far it runs past each side edge (m)
const CRAFT_GAP = 5; // how far past the front edge the craft's body begins; its ramp reaches back over the sand (m)
const CRAFT_HULL_COLOR = 0x6b7378;
const CRAFT_DECK_COLOR = 0x484d50;
const CRAFT_WIDTH = 7; // m
const CRAFT_LENGTH = 12; // the body's length along z (m)
const RAMP_LENGTH = 5; // the ramp plate's length (m)
const RAMP_TILT = 0.35; // how far the ramp's tip is lowered towards the sand (rad)
const HULL_BOTTOM = -0.6; // the hull sits this deep in the water (m)
const HULL_TOP = 1.7; // the deck's height (m)
const WALL_HEIGHT = 1.6; // the side walls above the deck (m)

// A box with its place baked in.
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

// The landing craft with the bow ramp down, in two shapes, with its body beginning at z 0: the hull (the body, the side walls, the stern and the
// wheelhouse) and the dark deck and ramp. The craft's front is towards -z, the beach.
function craftGeometries(): { hull: THREE.BufferGeometry; deck: THREE.BufferGeometry } {
  const mid = CRAFT_LENGTH / 2;
  const bodyH = HULL_TOP - HULL_BOTTOM;
  const wallY = HULL_TOP + WALL_HEIGHT / 2;
  const side = CRAFT_WIDTH / 2 - 0.25;
  const hull = BufferGeometryUtils.mergeBufferGeometries([
    box(CRAFT_WIDTH, bodyH, CRAFT_LENGTH, 0, HULL_BOTTOM + bodyH / 2, mid),
    box(0.5, WALL_HEIGHT, CRAFT_LENGTH, -side, wallY, mid),
    box(0.5, WALL_HEIGHT, CRAFT_LENGTH, side, wallY, mid),
    box(CRAFT_WIDTH, WALL_HEIGHT + 1.4, 0.5, 0, HULL_TOP + (WALL_HEIGHT + 1.4) / 2, CRAFT_LENGTH - 0.25),
    box(3, 2.6, 3, 0, HULL_TOP + 1.3, CRAFT_LENGTH - 3),
  ]);
  // the ramp lies from the deck's front edge down to the sand, its tip lowered by the tilt
  const ramp = new THREE.BoxGeometry(CRAFT_WIDTH - 1.2, 0.3, RAMP_LENGTH).rotateX(-RAMP_TILT);
  const drop = (Math.sin(RAMP_TILT) * RAMP_LENGTH) / 2;
  ramp.translate(0, HULL_TOP - drop, -(Math.cos(RAMP_TILT) * RAMP_LENGTH) / 2);
  const deck = BufferGeometryUtils.mergeBufferGeometries([
    ramp,
    box(CRAFT_WIDTH - 1.2, 0.1, CRAFT_LENGTH - 0.6, 0, HULL_TOP + 0.05, mid),
  ]);
  return { hull, deck };
}

// The sea and the landing craft as one group, placed from the map's bounds: the sea starts at the front edge (maxZ).
// Hung off the world so a new sortie takes it out with the rest.
export function buildShore(bounds: MapBounds): THREE.Group {
  const group = new THREE.Group();
  group.name = 'shore';
  const width = bounds.maxX - bounds.minX + SEA_SIDE * 2;
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(width, SEA_DEPTH).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: SEA_COLOR }),
  );
  sea.name = 'sea';
  sea.position.set((bounds.minX + bounds.maxX) / 2, SEA_LEVEL, bounds.maxZ + SEA_DEPTH / 2);
  group.add(sea);

  const { hull, deck } = craftGeometries();
  const craft = new THREE.Group();
  craft.name = 'craft';
  const parts: [THREE.BufferGeometry, number][] = [
    [hull, CRAFT_HULL_COLOR],
    [deck, CRAFT_DECK_COLOR],
  ];
  for (const [geometry, color] of parts) {
    craft.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color })));
  }
  craft.position.set((bounds.minX + bounds.maxX) / 2, 0, bounds.maxZ + CRAFT_GAP);
  group.add(craft);
  return group;
}
