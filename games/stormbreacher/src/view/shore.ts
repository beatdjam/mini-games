// The sea past the map's front edge and the landing craft the mech came in on (SB-120). Only drawn: nothing here
// collides, and the map check does not know it. The sea is one plane and the craft is one mesh a colour (the ramp
// is a mesh of its own), so it costs four draws.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FOAM_COLOR, SEA_COLOR } from '../data/colors.ts';
import { SEA_SURFACE } from '../data/surfaces.ts';
import type { MapBounds } from '../data/types.ts';
import { seaMaterial, seaTexture } from './surfaces.ts';

const SEA_LEVEL = -0.1; // the water's surface, just under the sand (m)
const SEA_DEPTH = 260; // how far the sea runs past the front edge (m); the fog hides the end
const SEA_SIDE = 160; // how far it runs past each side edge (m)
export const CRAFT_NAME = 'craft'; // the player's craft in buildCraft (its ramp is `${CRAFT_NAME}Ramp`)
const CRAFT_GAP = 5; // how far past the front edge the craft's body begins; its ramp reaches back over the sand (m)
const CRAFT_HULL_COLOR = 0x6b7378;
const CRAFT_DECK_COLOR = 0x484d50;
const CRAFT_WIDTH = 7; // m
const CRAFT_LENGTH = 12; // the body's length along z (m)
const RAMP_LENGTH = 5; // the ramp plate's length (m)
const RAMP_TILT = 0.35; // how far the ramp's tip is lowered towards the sand (rad)
export const RAMP_DOWN = -RAMP_TILT; // the ramp's turn about its hinge when it is down (rad); a bigger value lifts the tip
const HULL_BOTTOM = -0.6; // the hull sits this deep in the water (m)
const HULL_TOP = 1.7; // the deck's height (m)
const WALL_HEIGHT = 1.6; // the side walls above the deck (m)

// A box with its place baked in.
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

// The landing craft's body in two shapes, with its body beginning at z 0: the hull (the body, the side walls, the stern
// and the wheelhouse) and the dark deck. The craft's front is towards -z, the beach. The ramp is apart (rampGeometry).
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
  const deck = box(CRAFT_WIDTH - 1.2, 0.1, CRAFT_LENGTH - 0.6, 0, HULL_TOP + 0.05, mid);
  return { hull, deck };
}

// The ramp plate with its hinge at the origin, lying towards -z. Its group turns about x: RAMP_DOWN lays it down to the
// sand, a bigger value lifts the tip.
function rampGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(CRAFT_WIDTH - 1.2, 0.3, RAMP_LENGTH).translate(0, 0, -RAMP_LENGTH / 2);
}

// A landing craft as one group, `name` on its body and `${name}Ramp` on its ramp's hinge group (turn it about x: RAMP_DOWN
// is down). Both hang off the returned group, which has no place yet: the caller puts it where the craft's body begins.
// The ramp is a mesh of its own so the cutscene can lower it (SB-180).
export function buildCraft(name: string): THREE.Group {
  const { hull, deck } = craftGeometries();
  const body = new THREE.Group();
  body.name = name;
  const parts: [THREE.BufferGeometry, number][] = [
    [hull, CRAFT_HULL_COLOR],
    [deck, CRAFT_DECK_COLOR],
  ];
  for (const [geometry, color] of parts) {
    body.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color })));
  }
  const ramp = new THREE.Group();
  ramp.name = `${name}Ramp`;
  ramp.position.set(0, HULL_TOP, 0);
  ramp.rotation.x = RAMP_DOWN;
  ramp.add(new THREE.Mesh(rampGeometry(), new THREE.MeshLambertMaterial({ color: CRAFT_DECK_COLOR })));
  const craft = new THREE.Group();
  craft.name = `${name}Unit`;
  craft.add(body, ramp);
  return craft;
}

// The z the player's craft's body begins at, for a map with these bounds.
export const craftZ = (bounds: MapBounds): number => bounds.maxZ + CRAFT_GAP;

// The sea and the landing craft as one group, placed from the map's bounds: the sea starts at the front edge (maxZ).
// Hung off the world so a new sortie takes it out with the rest.
// The sea is one plane whose vertices hold the water's colour and the white foam line at the beach; its picture (long
// crests) is carried toward the shore by the texture's offset every frame, with no extra mesh or draw.
export function buildShore(bounds: MapBounds): THREE.Group {
  const group = new THREE.Group();
  group.name = 'shore';
  const width = bounds.maxX - bounds.minX + SEA_SIDE * 2;
  const geometry = new THREE.PlaneGeometry(width, SEA_DEPTH, SEA_SURFACE.foamCols, SEA_SURFACE.foamRows).rotateX(
    -Math.PI / 2,
  );
  const at = geometry.getAttribute('position'),
    colors = new Float32Array(at.count * 3);
  const water = new THREE.Color(SEA_COLOR),
    foam = new THREE.Color(FOAM_COLOR),
    shoreZ = -SEA_DEPTH / 2;
  for (let i = 0; i < at.count; i++) {
    const x = at.getX(i),
      fromShore = at.getZ(i) - shoreZ;
    // the foam line wanders along the beach and thins out over a few metres
    const band = SEA_SURFACE.foamWidth + Math.sin(x * 0.11) * SEA_SURFACE.foamWobble;
    const edge = Math.max(0, Math.min(1, 1 - (fromShore - band) / SEA_SURFACE.foamFade));
    const t = edge * edge * (3 - 2 * edge);
    colors[i * 3] = water.r + (foam.r - water.r) * t;
    colors[i * 3 + 1] = water.g + (foam.g - water.g) * t;
    colors[i * 3 + 2] = water.b + (foam.b - water.b) * t;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sea = new THREE.Mesh(geometry, seaMaterial());
  sea.name = 'sea';
  sea.position.set((bounds.minX + bounds.maxX) / 2, SEA_LEVEL, bounds.maxZ + SEA_DEPTH / 2);
  const crests = seaTexture();
  if (crests) {
    sea.onBeforeRender = () => {
      crests.offset.y = (performance.now() / 1000) * SEA_SURFACE.waveSpeed;
    };
  }
  group.add(sea);

  const craft = buildCraft(CRAFT_NAME);
  craft.position.set((bounds.minX + bounds.maxX) / 2, 0, craftZ(bounds));
  group.add(craft);
  return group;
}
