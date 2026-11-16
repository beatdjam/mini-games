// The sea past the map's front edge and the landing craft the mech came in on (SB-120). The craft's sizes come from
// data/craft.ts, which the walking and the camera read too; the drawn shape is this file's. The sea is one plane and each
// craft is one mesh a colour (the ramp is a mesh of its own). The two crafts beside the player's carry the allies in
// (SB-1965); they come in with it and stay on the beach.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CRAFT_COLOR, FOAM_COLOR, SEA_COLOR } from '../data/colors.ts';
import { ALLY_CRAFT_SIDES, CRAFT_TUNE, craftSideX, craftZ } from '../data/craft.ts';
import { DEFENSE_DETAIL } from '../data/defenses.ts';
import { SEA_SURFACE } from '../data/surfaces.ts';
import type { MapBounds } from '../data/types.ts';
import { seaMaterial, seaTexture } from './surfaces.ts';

export const SEA_LEVEL = -0.1; // the water's surface, just under the sand (m)
const SEA_DEPTH = 260; // how far the sea runs past the front edge (m); the fog hides the end
const SEA_SIDE = 160; // how far it runs past each side edge (m)
export const CRAFT_NAME = 'craft'; // the player's craft in buildCraft (its ramp is `${CRAFT_NAME}Ramp`)
export const ALLY_CRAFT_NAMES = ['craftAllyPort', 'craftAllyStarboard'] as const; // the allies' crafts, in ALLY_CRAFT_SIDES' order
export const RAMP_DOWN = -CRAFT_TUNE.rampTilt; // the ramp's turn about its hinge when it is down (rad); a bigger value lifts the tip
const HULL_BOTTOM = -0.6; // the hull sits this deep in the water (m)
const DECK_PLATE = 0.1; // the deck plate's thickness above the hull's upper face (m)

// The craft's one material: the colours of its hull, deck and fittings are vertex colours (SB-1470), so every part still
// costs three draws (the hull, the deck and the ramp) and the cutscene's crafts share the material.
const CRAFT_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });

// Puts one colour on every vertex of a part.
function tint(geometry: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const at = geometry.getAttribute('position');
  const colors = new Float32Array(at.count * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < at.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// A coloured box with its place baked in, turned about x when asked (the bow's deflector).
function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
  turnX = 0,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  if (turnX) geometry.rotateX(turnX);
  geometry.translate(x, y, z);
  return tint(geometry, color);
}

// The landing craft's body in two shapes, with its body beginning at z 0: the hull (the body, the side walls, the stern,
// the wheelhouse and the plate seams, windows and bow deflector that dress them) and the dark deck. The craft's front is
// towards -z, the beach. The ramp is apart (rampGeometry).
function craftGeometries(): { hull: THREE.BufferGeometry; deck: THREE.BufferGeometry } {
  const D = DEFENSE_DETAIL.craft;
  const mid = CRAFT_TUNE.length / 2;
  const bodyH = CRAFT_TUNE.hullTop - HULL_BOTTOM;
  const wallY = CRAFT_TUNE.hullTop + CRAFT_TUNE.wallHeight / 2;
  const side = CRAFT_TUNE.width / 2 - CRAFT_TUNE.wallThickness / 2;
  const sternH = CRAFT_TUNE.wallHeight + CRAFT_TUNE.sternHeightExtra;
  const parts: THREE.BufferGeometry[] = [
    box(CRAFT_TUNE.width, bodyH, CRAFT_TUNE.length, 0, HULL_BOTTOM + bodyH / 2, mid, CRAFT_COLOR.hull),
    box(CRAFT_TUNE.wallThickness, CRAFT_TUNE.wallHeight, CRAFT_TUNE.length, -side, wallY, mid, CRAFT_COLOR.hull),
    box(CRAFT_TUNE.wallThickness, CRAFT_TUNE.wallHeight, CRAFT_TUNE.length, side, wallY, mid, CRAFT_COLOR.hull),
    box(
      CRAFT_TUNE.width,
      sternH,
      CRAFT_TUNE.wallThickness,
      0,
      CRAFT_TUNE.hullTop + sternH / 2,
      CRAFT_TUNE.length - CRAFT_TUNE.wallThickness / 2,
      CRAFT_COLOR.hull,
    ),
    box(
      CRAFT_TUNE.wheelhouse.w,
      CRAFT_TUNE.wheelhouse.h,
      CRAFT_TUNE.wheelhouse.d,
      0,
      CRAFT_TUNE.hullTop + CRAFT_TUNE.wheelhouse.h / 2,
      CRAFT_TUNE.length - CRAFT_TUNE.wheelhouse.fromStern,
      CRAFT_COLOR.hull,
    ),
  ];
  // the seams between the hull's plates: uprights along both sides and a line high along each wall (below its top edge)
  for (let z = D.seamGap; z < CRAFT_TUNE.length; z += D.seamGap) {
    parts.push(
      box(D.seamWidth, D.seamHeight, 0.12, -CRAFT_TUNE.width / 2 - 0.01, wallY, z, CRAFT_COLOR.seam),
      box(D.seamWidth, D.seamHeight, 0.12, CRAFT_TUNE.width / 2 + 0.01, wallY, z, CRAFT_COLOR.seam),
    );
  }
  parts.push(
    box(
      D.seamWidth,
      D.seamWidth,
      CRAFT_TUNE.length * 0.8,
      -CRAFT_TUNE.width / 2 - 0.01,
      wallY + D.seamHeight * 0.35,
      mid,
      CRAFT_COLOR.seam,
    ),
    box(
      D.seamWidth,
      D.seamWidth,
      CRAFT_TUNE.length * 0.8,
      CRAFT_TUNE.width / 2 + 0.01,
      wallY + D.seamHeight * 0.35,
      mid,
      CRAFT_COLOR.seam,
    ),
  );
  // the wheelhouse's front and side windows
  const wheelhouseFront = CRAFT_TUNE.length - CRAFT_TUNE.wheelhouse.fromStern - CRAFT_TUNE.wheelhouse.d / 2;
  parts.push(
    box(
      D.windowW * 2.4,
      D.windowH,
      D.windowD,
      0,
      CRAFT_TUNE.hullTop + D.windowY,
      wheelhouseFront - D.windowD,
      CRAFT_COLOR.window,
    ),
    box(
      D.windowD,
      D.windowH,
      D.windowW,
      -CRAFT_TUNE.wheelhouse.w / 2 - D.windowSide,
      CRAFT_TUNE.hullTop + D.windowY,
      CRAFT_TUNE.length - CRAFT_TUNE.wheelhouse.fromStern - D.windowSideZ,
      CRAFT_COLOR.window,
    ),
    box(
      D.windowD,
      D.windowH,
      D.windowW,
      CRAFT_TUNE.wheelhouse.w / 2 + D.windowSide,
      CRAFT_TUNE.hullTop + D.windowY,
      CRAFT_TUNE.length - CRAFT_TUNE.wheelhouse.fromStern - D.windowSideZ,
      CRAFT_COLOR.window,
    ),
    // the wave deflector at the bow, leaning back from the hull (its 0.1 m drop is a shape dimension)
    box(D.bowWidth, D.bowHeight, D.bowDepth, 0, CRAFT_TUNE.hullTop - 0.1, D.bowDepth / 2, CRAFT_COLOR.bow, D.bowTilt),
  );
  const hull = BufferGeometryUtils.mergeBufferGeometries(parts);
  const deck = box(
    CRAFT_TUNE.deckWidth,
    DECK_PLATE,
    CRAFT_TUNE.length - 0.6,
    0,
    CRAFT_TUNE.hullTop + DECK_PLATE / 2,
    mid,
    CRAFT_COLOR.deck,
  );
  return { hull, deck };
}

// The ramp plate with its hinge at the origin, lying towards -z, with its ribs, hinges and chains. Its group turns about
// x: RAMP_DOWN lays it down to the sand, a bigger value lifts the tip.
function rampGeometry(): THREE.BufferGeometry {
  const D = DEFENSE_DETAIL.craft;
  const parts: THREE.BufferGeometry[] = [
    box(CRAFT_TUNE.deckWidth, 0.3, CRAFT_TUNE.rampLength, 0, 0, -CRAFT_TUNE.rampLength / 2, CRAFT_COLOR.deck),
  ];
  for (let i = 1; i <= D.ribs; i++) {
    parts.push(
      box(D.ribWidth, D.ribHeight, D.ribDepth, 0, 0.18, (-CRAFT_TUNE.rampLength * i) / (D.ribs + 1), CRAFT_COLOR.hinge),
    );
  }
  for (const x of [-D.hingeX, D.hingeX]) {
    parts.push(
      box(D.hingeW, D.hingeH, D.hingeD, x, D.hingeY, 0, CRAFT_COLOR.hinge),
      box(D.chain, D.chain, D.chainLength, x, D.chainY, -D.chainLength / 2, CRAFT_COLOR.chain),
    );
  }
  return BufferGeometryUtils.mergeBufferGeometries(parts);
}

// A landing craft as one group, `name` on its body and `${name}Ramp` on its ramp's hinge group (turn it about x: RAMP_DOWN
// is down). Both hang off the returned group, which has no place yet: the caller puts it where the craft's body begins.
// The ramp is a mesh of its own so the cutscene can lower it (SB-180).
export function buildCraft(name: string): THREE.Group {
  const { hull, deck } = craftGeometries();
  const body = new THREE.Group();
  body.name = name;
  body.add(new THREE.Mesh(hull, CRAFT_MATERIAL), new THREE.Mesh(deck, CRAFT_MATERIAL));
  const ramp = new THREE.Group();
  ramp.name = `${name}Ramp`;
  ramp.position.set(0, CRAFT_TUNE.hullTop, 0);
  ramp.rotation.x = RAMP_DOWN;
  ramp.add(new THREE.Mesh(rampGeometry(), CRAFT_MATERIAL));
  const craft = new THREE.Group();
  craft.name = `${name}Unit`;
  craft.add(body, ramp);
  return craft;
}

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

  // the crafts beside it, with the allies aboard; they are drawn where they come in and stay there
  ALLY_CRAFT_SIDES.forEach((side, i) => {
    const beside = buildCraft(ALLY_CRAFT_NAMES[i]);
    beside.position.set(craftSideX(bounds, side), 0, craftZ(bounds));
    group.add(beside);
  });
  return group;
}
