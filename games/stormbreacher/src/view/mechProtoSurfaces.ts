// The metal on the prototype (SB-1468, second pass SB-1469): for each painted material, a colour picture (the paint,
// the dirt, the panel seams and the rivets), a normal picture made from the same seams and bolts as a height map, and a
// roughness picture (worn, polished edges and dirty patches). The seams are fewer, wider and deeper than the first
// pass, and a diagonal runs with the plates' cut, so the joins still read from across the beach. The repeat is short
// enough to land on the small plates, and the big markings are geometry, not the picture. Each is painted once on a
// canvas, shared by every copy of the material, and never touched per frame. A node test has no canvas: the pictures
// are then null and the material keeps the palette's colour alone.
import * as THREE from 'three';
import { grain, grime, paintTex, smudge, stripes, type Paint } from '@engine/render/index.ts';
import { MECH_PAINT_COLOR, MECH_PROTO_PAINT_COLOR } from '../data/colors.ts';
import { MECH_PROTO_TEX, type ProtoMaterial } from '../data/mechProto.ts';

const CAN_PAINT = typeof document !== 'undefined';

const rgb = (value: string): string => `rgb(${value})`;
const rgba = (value: string, alpha: number): string => `rgba(${value},${alpha})`;
const PAINTED = ['armor', 'frame', 'accent'] as const;
type PaintedMaterial = (typeof PAINTED)[number];

export interface ProtoMaps {
  map: THREE.Texture | null; // the colour picture
  normalMap: THREE.Texture | null; // the panel seams and bolts as a surface
  roughnessMap: THREE.Texture | null; // worn metal and dirt
}

// The panel seams every material shares, as fractions of the picture, and the one diagonal that follows the plates'
// cut. The colour, the height and the roughness pictures draw the same lines, so the seam that darkens a plate is also
// a groove and a polished edge in the other two.
const SEAMS_X = [0.32, 0.74];
const SEAMS_Y = [0.28, 0.7];
const SEAM_DIAGONAL = { x0: 0.06, x1: 0.94 };
const RIVET_STEP = 0.18;
const RIVET_RADIUS = 0.014;

// A small seeded generator for the pictures painted without paintTex (the height and roughness maps).
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const made = document.createElement('canvas');
  made.width = size;
  made.height = size;
  return [made, made.getContext('2d')!];
}

// The seams, the diagonal and the rivets in one stroke, for every picture of a material. `shade` paints a line, `head`
// a rivet. The lines are wide enough to survive the far camera.
function panels(
  g: CanvasRenderingContext2D,
  size: number,
  line: string,
  width: number,
  head: (x: number, y: number) => void,
): void {
  g.fillStyle = line;
  for (const at of SEAMS_X) g.fillRect(at * size, 0, width, size);
  for (const at of SEAMS_Y) g.fillRect(0, at * size, size, width);
  g.strokeStyle = line;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(SEAM_DIAGONAL.x0 * size, 0);
  g.lineTo(SEAM_DIAGONAL.x1 * size, size);
  g.stroke();
  for (const at of SEAMS_X) for (let y = RIVET_STEP * 0.5; y < 1; y += RIVET_STEP) head(at * size, y * size);
  for (const at of SEAMS_Y) for (let x = RIVET_STEP * 0.5; x < 1; x += RIVET_STEP) head(x * size, at * size);
}

// A small rivet on the colour picture: a bright head with a dark line under it.
function paintRivet(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.fillStyle = rgba(MECH_PAINT_COLOR.grimeDark, 0.4);
  g.beginPath();
  g.arc(x, y + r * 0.6, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = rgba(MECH_PAINT_COLOR.scrape, 0.8);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// The armour: the light paint, the seams and the diagonal. The markings are the orange geometry (the chest chevron and
// the bands), so the picture carries no number and stays one clean panel surface.
const paintArmor: Paint = (g, rand) => {
  const size = g.canvas.width;
  g.fillStyle = rgb(MECH_PROTO_PAINT_COLOR.armorBase);
  g.fillRect(0, 0, size, size);
  grime(
    g,
    rand,
    MECH_PROTO_TEX.grime.armor,
    rgb(MECH_PAINT_COLOR.grimeLight),
    rgb(MECH_PAINT_COLOR.grimeDark),
    size,
    size,
  );
  panels(g, size, rgba(MECH_PAINT_COLOR.grimeDark, 0.85), 9, (x, y) => paintRivet(g, x, y, size * RIVET_RADIUS));
  for (let i = 0; i < MECH_PROTO_TEX.rivets.armor; i++)
    paintRivet(g, rand() * size, rand() * size, size * RIVET_RADIUS * (0.7 + rand() * 0.6));
  for (let i = 0; i < MECH_PROTO_TEX.scratches.armor; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.strokeStyle = rgba(MECH_PAINT_COLOR.scrape, 0.2 + rand() * 0.2);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 4 + rand() * 18, y + (rand() - 0.5) * 3);
    g.stroke();
  }
  grain(g, rand, 7, size, size);
};

// The frame: dark metal, rust running out of the seams and more scrapes than the armour. It is the dark half of the
// two paints, so it carries no number.
const paintFrame: Paint = (g, rand) => {
  const size = g.canvas.width;
  g.fillStyle = rgb(MECH_PROTO_PAINT_COLOR.frameBase);
  g.fillRect(0, 0, size, size);
  grime(
    g,
    rand,
    MECH_PROTO_TEX.grime.frame,
    rgb(MECH_PAINT_COLOR.grimeLight),
    rgb(MECH_PAINT_COLOR.grimeDark),
    size,
    size,
  );
  for (let i = 0; i < 8; i++) {
    smudge(
      g,
      rand() * size,
      rand() * size,
      3 + rand() * 10,
      6 + rand() * 20,
      MECH_PAINT_COLOR.rust,
      0.1 + rand() * 0.14,
      size,
      size,
    );
  }
  panels(g, size, rgba(MECH_PAINT_COLOR.grimeDark, 0.8), 9, (x, y) => paintRivet(g, x, y, size * RIVET_RADIUS * 0.8));
  for (let i = 0; i < MECH_PROTO_TEX.scratches.frame; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.strokeStyle = rgba(MECH_PAINT_COLOR.scrape, 0.1 + rand() * 0.22);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 4 + rand() * 22, y + (rand() - 0.5) * 2);
    g.stroke();
  }
  grain(g, rand, 9, size, size);
};

// The accent: hazard stripes at a wide pitch, so the orange reads as one large marking on the vents and the chevron,
// with a worn lower band.
const paintAccent: Paint = (g, rand) => {
  const size = g.canvas.width;
  stripes(
    g,
    [0, 0, size, size],
    MECH_PROTO_TEX.stripePitch,
    rgb(MECH_PROTO_PAINT_COLOR.accentBase),
    rgb(MECH_PAINT_COLOR.stripeDark),
    rgba(MECH_PAINT_COLOR.grimeDark, 0.25),
  );
  grime(
    g,
    rand,
    MECH_PROTO_TEX.grime.accent,
    rgb(MECH_PAINT_COLOR.grimeLight),
    rgb(MECH_PAINT_COLOR.grimeDark),
    size,
    size,
  );
  for (let i = 0; i < MECH_PROTO_TEX.scratches.accent; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.strokeStyle = rgba(MECH_PAINT_COLOR.scrape, 0.2 + rand() * 0.2);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 3 + rand() * 12, y + (rand() - 0.5) * 2);
    g.stroke();
  }
  grain(g, rand, 10, size, size);
};

const PAINTERS: Record<PaintedMaterial, Paint> = {
  armor: paintArmor,
  frame: paintFrame,
  accent: paintAccent,
};

// The height map the normal picture is made from: the seams cut deep, the rivet heads standing out, the paint flat
// between them. `deep` is how dark a groove is, `high` how bright a rivet is.
function paintHeight(g: CanvasRenderingContext2D, size: number, material: PaintedMaterial): void {
  const rand = seeded(MECH_PROTO_TEX.seed[material]);
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, size, size);
  if (material === 'accent') {
    // the hazard stripes stand a little above the dark bands
    const pitch = MECH_PROTO_TEX.stripePitch;
    g.fillStyle = 'rgb(168,168,168)';
    for (let x = -size; x < size * 2; x += pitch) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + pitch * 0.5, 0);
      g.lineTo(x + pitch * 0.1, size);
      g.lineTo(x - pitch * 0.4, size);
      g.fill();
    }
  }
  panels(g, size, 'rgb(34,34,34)', 15, (x, y) => {
    g.fillStyle = 'rgb(92,92,92)';
    g.beginPath();
    g.arc(x, y, size * RIVET_RADIUS * 1.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgb(218,218,218)';
    g.beginPath();
    g.arc(x, y, size * RIVET_RADIUS, 0, Math.PI * 2);
    g.fill();
  });
  for (let i = 0; i < MECH_PROTO_TEX.rivets[material]; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.fillStyle = 'rgb(200,200,200)';
    g.beginPath();
    g.arc(x, y, size * RIVET_RADIUS * (0.7 + rand() * 0.7), 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(72,72,72,0.7)';
  g.lineWidth = 1;
  for (let i = 0; i < MECH_PROTO_TEX.scratches[material]; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 3 + rand() * 20, y + (rand() - 0.5) * 2);
    g.stroke();
  }
}

// The roughness picture: the material's base (bright is rough, dark is polished), the seams polished by wear, the
// rivets smoother than the paint, and the dirt rough. The frame is much darker than the armour, so the polished metal
// catches more of the surroundings' light and the two paints read apart.
function paintRoughness(g: CanvasRenderingContext2D, size: number, material: PaintedMaterial): void {
  const rand = seeded(MECH_PROTO_TEX.seed[material] + 1);
  const base = material === 'frame' ? 105 : material === 'armor' ? 180 : 190;
  g.fillStyle = `rgb(${base},${base},${base})`;
  g.fillRect(0, 0, size, size);
  panels(g, size, 'rgb(55,55,55)', 14, (x, y) => {
    g.fillStyle = 'rgb(88,88,88)';
    g.beginPath();
    g.arc(x, y, size * RIVET_RADIUS, 0, Math.PI * 2);
    g.fill();
  });
  for (let i = 0; i < MECH_PROTO_TEX.grime[material]; i++) {
    g.globalAlpha = 0.14 + rand() * 0.24;
    g.fillStyle = 'rgb(244,244,244)';
    g.fillRect(rand() * size, rand() * size, 8 + rand() * 46, 5 + rand() * 24);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < MECH_PROTO_TEX.scratches[material]; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.strokeStyle = 'rgba(60,60,60,0.7)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 4 + rand() * 20, y + (rand() - 0.5) * 2);
    g.stroke();
  }
}

// A normal picture from a height picture: each texel's slope toward its neighbours, written as a normal. The sample
// wraps around, so the picture repeats without a seam.
function normalFromHeight(source: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const size = source.width;
  const from = source.getContext('2d')!.getImageData(0, 0, size, size).data;
  const [made, g] = canvas(size);
  const image = g.createImageData(size, size);
  const out = image.data;
  const at = (x: number, y: number): number => {
    const sx = ((x % size) + size) % size;
    const sy = ((y % size) + size) % size;
    return from[(sy * size + sx) * 4];
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) / 255;
      const dy = (at(x, y + 1) - at(x, y - 1)) / 255;
      const nx = -dx * strength;
      const ny = dy * strength;
      const length = Math.hypot(nx, ny, 1);
      const index = (y * size + x) * 4;
      out[index] = ((nx / length) * 0.5 + 0.5) * 255;
      out[index + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      out[index + 2] = (1 / length) * 0.5 * 255 + 127.5;
      out[index + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(made);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function repeated(source: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(source);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

const maps = new Map<ProtoMaterial, ProtoMaps>();

// The painted materials have the pictures; the glow does not.
function isPainted(material: ProtoMaterial): material is PaintedMaterial {
  return material === 'armor' || material === 'frame' || material === 'accent';
}

// The three pictures of a material, painted the first time it is asked for and shared after that. The accent needs
// less detail than the armour, so its picture is smaller.
export function protoMaps(material: ProtoMaterial): ProtoMaps {
  if (!CAN_PAINT) return { map: null, normalMap: null, roughnessMap: null };
  const kept = maps.get(material);
  if (kept !== undefined) return kept;
  if (!isPainted(material)) {
    const none: ProtoMaps = { map: null, normalMap: null, roughnessMap: null };
    maps.set(material, none);
    return none;
  }
  const size = MECH_PROTO_TEX.size[material];
  const [heightCanvas, height] = canvas(size);
  paintHeight(height, size, material);
  const [roughCanvas, rough] = canvas(size);
  paintRoughness(rough, size, material);
  const made: ProtoMaps = {
    map: paintTex(MECH_PROTO_TEX.seed[material], PAINTERS[material], size, true),
    normalMap: normalFromHeight(heightCanvas, MECH_PROTO_TEX.normal),
    roughnessMap: repeated(roughCanvas),
  };
  maps.set(material, made);
  return made;
}

// How many bytes the pictures hold (RGBA texels), for the result's weight table.
export function protoTextureBytes(): number {
  let total = 0;
  for (const gem of maps.values()) {
    for (const texture of [gem.map, gem.normalMap, gem.roughnessMap]) {
      if (texture === null) continue;
      // the picture of a painted material is always one of the canvases this file made
      const image = texture.image as HTMLCanvasElement;
      total += image.width * image.height * 4;
    }
  }
  return total;
}

// Drops the pictures so changed values paint again (the dev view's panel); the sortie never calls it.
export function resetProtoMaps(): void {
  for (const gem of maps.values()) {
    for (const texture of [gem.map, gem.normalMap, gem.roughnessMap]) texture?.dispose();
  }
  maps.clear();
}
