// The beach's surfaces (SB-1360): pictures painted once from seeds and the engine's strokes, then handed to the engine
// by name. The ground asks for the sand, the props for concrete, rust, charred iron or wood, the sea for its crests.
// Nothing here runs per frame: defineTexture only registers a painter, and material() paints it on first use.
// A unit test builds the beach in node, where there is no canvas: the materials then keep the kind's colour alone.
import * as THREE from 'three';
import {
  defineMaterial,
  defineTexture,
  grain,
  grime,
  material,
  oval,
  ownMaterial,
  paintRand,
  smudge,
  type TextureSource,
} from '@engine/render/index.ts';
import { DRY_SAND_COLOR } from '../data/colors.ts';
import {
  BURNT_SURFACE,
  CONCRETE_SURFACE,
  RUST_SURFACE,
  SAND_SURFACE,
  SEA_SURFACE,
  WOOD_SURFACE,
} from '../data/surfaces.ts';

export type SurfaceName = 'sand' | 'concrete' | 'rust' | 'burnt' | 'wood' | 'sea';
type SurfaceMaterial = THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;

// node (the unit tests) has no canvas, so a picture cannot be painted there
const CAN_PAINT = typeof document !== 'undefined';
// the engine's names: the texture and the material share one, with a "sb." prefix so they cannot clash
const NAME: Record<SurfaceName, string> = {
  sand: 'sb.sand',
  concrete: 'sb.concrete',
  rust: 'sb.rust',
  burnt: 'sb.burnt',
  wood: 'sb.wood',
  sea: 'sb.sea',
};
// how many times a picture covers one face (props) or the sea's plane; the sand is in world metres instead
const REPEAT: Record<SurfaceName, [number, number]> = {
  sand: SAND_SURFACE.repeat,
  concrete: CONCRETE_SURFACE.repeat,
  rust: RUST_SURFACE.repeat,
  burnt: BURNT_SURFACE.repeat,
  wood: WOOD_SURFACE.repeat,
  sea: SEA_SURFACE.repeat,
};

// The sand: grains, blotches and soft ruts. Everything that would leave a seam is a soft patch, which the engine draws
// again on the far side of the picture, so the ground reads as one piece when the picture repeats in world metres.
const paintSand: TextureSource = (g, size) => {
  const rand = paintRand(SAND_SURFACE.seed);
  g.fillStyle = 'rgb(236,236,236)';
  g.fillRect(0, 0, size, size);
  grime(g, rand, SAND_SURFACE.grime, 'rgb(255,255,255)', 'rgb(120,120,120)', size, size);
  for (let i = 0; i < SAND_SURFACE.mottle; i++) {
    smudge(
      g,
      rand() * size,
      rand() * size,
      18 + rand() * 54,
      14 + rand() * 44,
      '105,96,84',
      0.05 + rand() * 0.1,
      size,
      size,
    );
  }
  // ruts and dragged feet, long and soft
  for (let i = 0; i < SAND_SURFACE.tracks; i++) {
    smudge(
      g,
      rand() * size,
      rand() * size,
      1.5 + rand() * 3,
      24 + rand() * 60,
      '72,64,54',
      0.05 + rand() * 0.07,
      size,
      size,
    );
  }
  // footprints: two small ovals, kept off the edge so they do not run over the seam
  for (let i = 0; i < SAND_SURFACE.tracks / 2; i++) {
    const x = 30 + rand() * (size - 60),
      y = 30 + rand() * (size - 60);
    g.globalAlpha = 0.12 + rand() * 0.1;
    g.fillStyle = 'rgb(82,73,60)';
    oval(g, x, y, 3 + rand() * 2, 6 + rand() * 3);
    oval(g, x + 7 + rand() * 4, y + 2, 3 + rand() * 2, 6 + rand() * 3);
  }
  g.globalAlpha = 1;
  grain(g, rand, SAND_SURFACE.grain, size, size);
};

// Concrete: a grimy, chipped face with rain running down it.
const paintConcrete: TextureSource = (g, size) => {
  const rand = paintRand(CONCRETE_SURFACE.seed);
  g.fillStyle = 'rgb(190,190,190)';
  g.fillRect(0, 0, size, size);
  grime(g, rand, CONCRETE_SURFACE.grime, 'rgb(255,255,255)', 'rgb(96,96,96)', size, size);
  for (let i = 0; i < CONCRETE_SURFACE.drips; i++) {
    const x = rand() * size,
      w = 2 + rand() * 9,
      h = size * (0.2 + rand() * 0.75);
    g.globalAlpha = 0.06 + rand() * 0.12;
    g.fillStyle = 'rgb(70,70,70)';
    g.fillRect(x, 0, w, h);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < CONCRETE_SURFACE.chips; i++) {
    g.globalAlpha = 0.15 + rand() * 0.2;
    g.fillStyle = rand() < 0.5 ? 'rgb(255,255,255)' : 'rgb(60,60,60)';
    const w = 1 + rand() * 5,
      h = 1 + rand() * 4;
    g.fillRect(rand() * size, rand() * size, w, h);
  }
  g.globalAlpha = 1;
  grain(g, rand, CONCRETE_SURFACE.grain, size, size);
};

// Rusted iron: broad soft patches and small pits, dark iron with a few red-brown spots of rust.
const paintRust: TextureSource = (g, size) => {
  const rand = paintRand(RUST_SURFACE.seed);
  g.fillStyle = 'rgb(176,176,176)';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < RUST_SURFACE.patches; i++) {
    smudge(
      g,
      rand() * size,
      rand() * size,
      10 + rand() * 46,
      8 + rand() * 34,
      '96,90,83',
      0.06 + rand() * 0.14,
      size,
      size,
    );
  }
  // red-brown rust: small, soft spots that keep the iron dark while showing where the metal has gone
  for (let i = 0; i < RUST_SURFACE.spots; i++) {
    smudge(
      g,
      rand() * size,
      rand() * size,
      3 + rand() * 12,
      3 + rand() * 10,
      '122,70,44',
      0.12 + rand() * 0.2,
      size,
      size,
    );
  }
  for (let i = 0; i < RUST_SURFACE.pits; i++) {
    g.globalAlpha = 0.18 + rand() * 0.25;
    g.fillStyle = rand() < 0.75 ? 'rgb(62,58,52)' : 'rgb(255,255,255)';
    const r = 1 + rand() * 3;
    oval(g, rand() * size, rand() * size, r, r * (0.6 + rand() * 0.6));
  }
  g.globalAlpha = 1;
  grain(g, rand, RUST_SURFACE.grain, size, size);
};

// Charred iron: burnt blotches, ash, and a little bare metal.
const paintBurnt: TextureSource = (g, size) => {
  const rand = paintRand(BURNT_SURFACE.seed);
  g.fillStyle = 'rgb(176,176,176)';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < BURNT_SURFACE.char; i++) {
    smudge(
      g,
      rand() * size,
      rand() * size,
      14 + rand() * 52,
      10 + rand() * 42,
      '30,30,30',
      0.08 + rand() * 0.2,
      size,
      size,
    );
  }
  for (let i = 0; i < BURNT_SURFACE.ash; i++) {
    g.globalAlpha = 0.12 + rand() * 0.22;
    g.fillStyle = rand() < 0.7 ? 'rgb(210,210,210)' : 'rgb(255,255,255)';
    const w = 1 + rand() * 3,
      h = 1 + rand() * 3;
    g.fillRect(rand() * size, rand() * size, w, h);
  }
  g.globalAlpha = 1;
  grain(g, rand, BURNT_SURFACE.grain, size, size);
};

// Wooden crates: boards, a dark gap between them, and the grain running along the boards.
const paintWood: TextureSource = (g, size) => {
  const rand = paintRand(WOOD_SURFACE.seed);
  g.fillStyle = 'rgb(224,224,224)';
  g.fillRect(0, 0, size, size);
  const board = size / WOOD_SURFACE.planks;
  for (let i = 1; i < WOOD_SURFACE.planks; i++) {
    g.globalAlpha = 0.35;
    g.fillStyle = 'rgb(80,80,80)';
    g.fillRect(0, i * board - 1, size, 2);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < WOOD_SURFACE.knots; i++) {
    g.globalAlpha = 0.2 + rand() * 0.15;
    g.fillStyle = 'rgb(94,94,94)';
    oval(g, rand() * size, rand() * size, 2 + rand() * 3, 4 + rand() * 5);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 40; i++) {
    smudge(
      g,
      rand() * size,
      rand() * size,
      24 + rand() * 70,
      1 + rand() * 2,
      '120,120,120',
      0.05 + rand() * 0.08,
      size,
      size,
    );
  }
  grain(g, rand, WOOD_SURFACE.grain, size, size);
};

// The sea: long crests on a mid-grey base. The base is not white so the vertex colours (sea and foam) keep their hue
// under the cloud, and the foam does not clip.
const paintSea: TextureSource = (g, size) => {
  const rand = paintRand(SEA_SURFACE.seed);
  g.fillStyle = 'rgb(200,200,200)';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < SEA_SURFACE.streaks; i++) {
    const light = rand() < 0.5;
    smudge(
      g,
      rand() * size,
      rand() * size,
      30 + rand() * 90,
      2 + rand() * 7,
      light ? '230,230,230' : '84,84,84',
      0.05 + rand() * 0.13,
      size,
      size,
    );
  }
  grain(g, rand, SEA_SURFACE.grain, size, size);
};

if (CAN_PAINT) {
  defineTexture(NAME.sand, { src: paintSand, size: SAND_SURFACE.size });
  defineTexture(NAME.concrete, { src: paintConcrete, size: CONCRETE_SURFACE.size });
  defineTexture(NAME.rust, { src: paintRust, size: RUST_SURFACE.size });
  defineTexture(NAME.burnt, { src: paintBurnt, size: BURNT_SURFACE.size });
  defineTexture(NAME.wood, { src: paintWood, size: WOOD_SURFACE.size });
  defineTexture(NAME.sea, { src: paintSea, size: SEA_SURFACE.size });
  defineMaterial(NAME.sand, { map: NAME.sand, color: DRY_SAND_COLOR });
  // the props' pictures are grey: their kind's colour comes from the instance colour (or the target's own material)
  defineMaterial(NAME.concrete, { map: NAME.concrete });
  defineMaterial(NAME.rust, { map: NAME.rust });
  defineMaterial(NAME.burnt, { map: NAME.burnt });
  defineMaterial(NAME.wood, { map: NAME.wood });
  defineMaterial(NAME.sea, { map: NAME.sea });
}

// A surface's shared material. The texture's repeat is set here (once per name is enough); sand keeps the world's
// metres in its UVs, so it is left at one.
export function surfaceMaterial(name: SurfaceName): SurfaceMaterial {
  if (!CAN_PAINT) return new THREE.MeshLambertMaterial({ color: 0xffffff });
  const made = material(NAME[name]);
  const map = made.map;
  if (map) map.repeat.set(REPEAT[name][0], REPEAT[name][1]);
  return made;
}

// The ground's material: the sand picture, tinted by the look, with a vertex colour that darkens the wet band.
let groundMarked = false;
export function groundMaterial(): THREE.MeshLambertMaterial {
  if (!CAN_PAINT) return new THREE.MeshLambertMaterial({ color: DRY_SAND_COLOR, vertexColors: true });
  const made = material(NAME.sand) as THREE.MeshLambertMaterial;
  // the wet band is a vertex colour, so the material has to read the colours (set before its first draw)
  if (!groundMarked) {
    made.vertexColors = true;
    made.needsUpdate = true;
    groundMarked = true;
  }
  return made;
}

// The sea: one picture whose offset moves each frame, and vertex colours for the water and the foam line.
let seaMarked = false;
export function seaMaterial(): THREE.MeshLambertMaterial {
  if (!CAN_PAINT) return new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  const made = material(NAME.sea) as THREE.MeshLambertMaterial;
  if (!seaMarked) {
    made.vertexColors = true;
    made.needsUpdate = true;
    seaMarked = true;
  }
  const map = made.map;
  if (map) {
    map.repeat.set(SEA_SURFACE.repeat[0], SEA_SURFACE.repeat[1]);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
  }
  return made;
}

// The picture the sea's crests move with, for the shore's per-frame offset. Null in node.
export const seaTexture = (): THREE.Texture | null => (CAN_PAINT ? material(NAME.sea).map : null);

// A target's own material: its kind's picture with the target's colour on it, so the four kinds still read apart.
export function targetMaterial(name: SurfaceName, color: number): SurfaceMaterial {
  if (!CAN_PAINT) return new THREE.MeshLambertMaterial({ color });
  const made = ownMaterial(NAME[name]);
  made.color.setHex(color);
  return made;
}
