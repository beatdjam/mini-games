import * as THREE from 'three';
import { shared } from './render.ts';
// engine: Named textures and materials that the stage and the enemies share, and models built from a list of parts.
// The game registers what a theme needs once (defineTexture / defineMaterial) and refers to it by name after that:
// - a texture comes from a drawing function (a canvas, drawn once) or an image file (its URL), so drawn and painted
//   textures mix freely
// - a material has a surface texture (map) and a glow texture (the parts that light up: eyes, vents, lines). Raising
//   its emissiveIntensity makes the glowing parts flash, the way enemies show a hit
// - buildParts makes a model out of boxes, cylinders ... each with a material name, so a machine-like enemy can be a
//   body, armour plates and glowing eyes. A model file (glTF) can stand in for the parts later; hit areas stay
//   separate from the looks either way
// Textures, shared materials and part geometries are made once and kept: materials and geometries are marked shared(),
// and disposeTree frees a map only when its material owns it (userData.ownMap), which these never do.
// ---- tuning numbers ----
const TEX_SIZE = 128; // canvas side of a drawn texture (px) unless its TextureDef says otherwise
const CYL_SEGMENTS = 12; // sides of a cylinder or cone part

// a drawing function (gets a 2D context and the canvas side, draws once) or the URL of an image file
export type TextureSource = ((g: CanvasRenderingContext2D, size: number) => void) | string;
export interface TextureDef {
  src: TextureSource;
  size?: number; // canvas side (px) for a drawing function; ignored for an image
  repeat?: boolean; // tile across the surface (RepeatWrapping); default true
}
export interface MaterialDef {
  color?: number; // tint of the surface (default white: the texture's own colours)
  map?: string; // texture name of the surface
  glow?: string; // texture name of the glowing parts (emissiveMap): black stays dark, bright lights up
  emissive?: number; // colour of the glow (default white with a glow texture, else black)
  emissiveIntensity?: number; // default 1
  lit?: boolean; // default true: lit by the scene (Lambert); false: always full colour (Basic, no glow)
  opacity?: number; // below 1 makes the material transparent
}
type LitMaterial = THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;

const texDefs = new Map<string, TextureDef>(),
  textures = new Map<string, THREE.Texture>(),
  matDefs = new Map<string, MaterialDef>(),
  materials = new Map<string, LitMaterial>(),
  loading = new Set<Promise<void>>();

export function defineTexture(name: string, def: TextureDef) {
  if (texDefs.has(name)) throw new Error('materials: texture defined twice: ' + name);
  texDefs.set(name, def);
}
export function defineMaterial(name: string, def: MaterialDef) {
  if (matDefs.has(name)) throw new Error('materials: material defined twice: ' + name);
  matDefs.set(name, def);
}

// The texture of that name, made on first use and shared from then on. An image starts loading then (texturesReady
// waits for it). Throws for a name that was never defined
export function texture(name: string): THREE.Texture {
  const made = textures.get(name);
  if (made) return made;
  const def = texDefs.get(name);
  if (!def) throw new Error('materials: unknown texture ' + name);
  let tex: THREE.Texture;
  if (typeof def.src === 'string') {
    const src = def.src;
    tex = new THREE.Texture();
    const p = new Promise<void>(done => {
      const img = new Image();
      img.onload = () => {
        tex.image = img;
        tex.needsUpdate = true;
        done();
      };
      img.onerror = () => done(); // a missing image leaves the texture blank rather than stopping the game
      img.src = src;
    });
    loading.add(p);
    p.then(() => loading.delete(p));
  } else {
    const size = def.size ?? TEX_SIZE,
      c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    def.src(c.getContext('2d')!, size);
    tex = new THREE.CanvasTexture(c);
  }
  if (def.repeat !== false) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  textures.set(name, tex); // disposeTree never frees a material's map unless the material owns it (userData.ownMap)
  return tex;
}
// resolves once every image texture made so far has loaded (or failed); for a loading screen, or tests
export async function texturesReady(): Promise<void> {
  await Promise.all([...loading]);
}

function makeMaterial(def: MaterialDef): LitMaterial {
  const o = {
    color: def.color ?? 0xffffff,
    map: def.map ? texture(def.map) : null,
    transparent: def.opacity !== undefined && def.opacity < 1,
    opacity: def.opacity ?? 1,
  };
  if (def.lit === false) return new THREE.MeshBasicMaterial(o);
  return new THREE.MeshLambertMaterial({
    ...o,
    emissive: def.emissive ?? (def.glow ? 0xffffff : 0x000000),
    emissiveMap: def.glow ? texture(def.glow) : null,
    emissiveIntensity: def.emissiveIntensity ?? 1,
  });
}
function defOf(name: string): MaterialDef {
  const def = matDefs.get(name);
  if (!def) throw new Error('materials: unknown material ' + name);
  return def;
}
// The shared material of that name (one for everything that uses it: walls, floors, props). Do not change it; take
// ownMaterial for one object's effects. Throws for a name that was never defined
export function material(name: string): LitMaterial {
  let m = materials.get(name);
  if (!m) materials.set(name, (m = shared(makeMaterial(defOf(name)))));
  return m;
}
// A new material of that name for one object (an enemy that flashes when hit). Its textures are the shared ones, so
// disposeTree frees the material and keeps the textures
export function ownMaterial(name: string): LitMaterial {
  return makeMaterial(defOf(name));
}

// ---- models from parts ----
export type Vec3 = [number, number, number];
// box: [w, h, d]; cylinder: [r, h] or [rTop, rBottom, h]; cone: [r, h]; sphere, tetra, octa, ico: [r]
export type PartShape = 'box' | 'cylinder' | 'cone' | 'sphere' | 'tetra' | 'octa' | 'ico';
export interface PartDef {
  shape: PartShape;
  size: number[];
  mat: string; // material name
  pos?: Vec3; // centre of the part in the model (default the origin)
  rot?: Vec3; // rotation (radians, XYZ)
}
export interface BuiltModel {
  group: THREE.Group;
  mats: LitMaterial[]; // with own: the model's materials, one per material name (in first-use order); else empty
}
const geometries = new Map<string, THREE.BufferGeometry>();
function partGeometry(shape: PartShape, size: number[]): THREE.BufferGeometry {
  const key = shape + ':' + size.join(','),
    made = geometries.get(key);
  if (made) return made;
  const [a, b, c] = size;
  let g: THREE.BufferGeometry;
  if (shape === 'box') g = new THREE.BoxGeometry(a, b, c);
  else if (shape === 'cylinder')
    g =
      c === undefined
        ? new THREE.CylinderGeometry(a, a, b, CYL_SEGMENTS)
        : new THREE.CylinderGeometry(a, b, c, CYL_SEGMENTS);
  else if (shape === 'cone') g = new THREE.ConeGeometry(a, b, CYL_SEGMENTS);
  else if (shape === 'sphere') g = new THREE.SphereGeometry(a, CYL_SEGMENTS, CYL_SEGMENTS / 2);
  else if (shape === 'tetra') g = new THREE.TetrahedronGeometry(a);
  else if (shape === 'octa') g = new THREE.OctahedronGeometry(a);
  else if (shape === 'ico') g = new THREE.IcosahedronGeometry(a);
  else throw new Error('materials: unknown part shape ' + shape);
  geometries.set(key, shared(g));
  return g;
}
// Builds a model from parts. Geometries are shared between every model with the same shape and size. With own (an
// enemy that flashes), the model gets its own copy of each material it uses, listed in `mats`; without it, the shared
// materials. Throws for an unknown material or shape
export function buildParts(parts: PartDef[], opts: { own?: boolean } = {}): BuiltModel {
  const group = new THREE.Group(),
    mine = new Map<string, LitMaterial>();
  for (const p of parts) {
    let m: LitMaterial;
    if (opts.own) {
      const got = mine.get(p.mat);
      if (got) m = got;
      else mine.set(p.mat, (m = ownMaterial(p.mat)));
    } else m = material(p.mat);
    const mesh = new THREE.Mesh(partGeometry(p.shape, p.size), m);
    if (p.pos) mesh.position.set(...p.pos);
    if (p.rot) mesh.rotation.set(...p.rot);
    group.add(mesh);
  }
  return { group, mats: [...mine.values()] };
}
