import * as THREE from 'three';
import { VIEW, WINDOW_ORDER } from './windowPanes.ts';
// Buildings out there, in front of the backdrop (across the street from the windows, and the building's own walls
// seen from its windows): boxes, each its footprint x0..x1 by z0..z1, from `bottom` (0: the ground, y 0 in their
// group's frame) up to `top`. Only what can be seen from inside is built: the roof (unless `noRoof`), the underside
// when `under`, and of the upright faces those in `sides` (numbered as in world/tiles.ts: 0 the face looking
// toward +x, at x1 ...). Each face a picture repeated over it (`look.facades[facade]`, `look.storey` metres across
// and up a repeat, from the ground up, so that the storeys of boxes stacked one on another meet; the roof
// `look.roofs[roof]`, `look.roofTile` metres a repeat), times the light on that side
// (`look.light[side]`, `look.roofLight` on the roof: [r, g, b], more than 1 to brighten). Seen through the panes
// only, after the backdrop (they hide it, and each other, by depth). They go into `look.haze` with the distance the
// way the ground does (clear out to `look.clear`, half of the way in `look.fade` more). They are drawn shrunk toward
// the eye, all by the same, so that `look.reach` metres comes inside the band (the camera's far plane is nearer):
// the band is drawn first and leaves its depth, so a block nearer than `reach` is drawn over it, one further is not,
// and the blocks hide each other as they would unshrunk. (No fragment is thrown away in the shader: the depth and
// stencil tests can then be made before it runs.)
export interface OutsideBlock {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  top: number;
  sides: number[];
  facade: number;
  roof: number;
  bottom?: number; // where it stands (0 when not given): a box may stand on another, or hang over the street
  noRoof?: boolean; // no roof (another box stands on it)
  under?: boolean; // its underside is built too (it hangs out over the street)
  // the heights (m) of the picture laid on its bottom and top edge, when not `bottom` and `top`: a box taller than its
  // storey that should still show one (a floor higher than the others) has its picture stretched over it so
  paint?: [number, number];
}
export interface OutsideLook {
  facades: THREE.Texture[];
  storey: [number, number];
  roofs: THREE.Texture[];
  roofTile: number;
  light: [number, number, number][];
  roofLight: [number, number, number];
  haze: THREE.Color | string | number;
  clear: number;
  fade: number;
  reach: number;
}
const BLOCK_FIT = 0.9; // a block `reach` away is drawn shrunk to this share of the band's radius
const BLOCK_VERT = `
attribute vec3 tint;
uniform float shrink;
varying vec3 vTint;
varying vec2 vUv;
varying float vFar;
void main() {
  vUv = uv;
  vTint = tint;
  vec3 rel = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
  vFar = length(rel.xz);
  gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + rel * shrink, 1.0);
}`;
const BLOCK_FRAG = `
uniform sampler2D map;
uniform vec3 haze;
uniform float clear;
uniform float fade;
varying vec3 vTint;
varying vec2 vUv;
varying float vFar;
void main() {
  float far = 1.0 - exp2(-max(vFar - clear, 0.0) / fade);
  gl_FragColor = vec4(mix(texture2D(map, vUv).rgb * vTint, haze, far), 1.0);
}`;
export function buildOutsideBlocks(blocks: OutsideBlock[], look: OutsideLook, bandRadius: number): THREE.Group {
  const group = new THREE.Group(),
    haze = new THREE.Color(look.haze);
  // the faces for each picture: corners, the picture's coordinates and the light
  const bins = new Map<THREE.Texture, { pos: number[]; uv: number[]; tint: number[] }>(),
    bin = (map: THREE.Texture) => {
      let b = bins.get(map);
      if (!b) bins.set(map, (b = { pos: [], uv: [], tint: [] }));
      return b;
    },
    // a quad: four corners in order round it, their (u, v), one light
    quad = (map: THREE.Texture, ps: number[][], uvs: number[][], tint: number[]) => {
      const b = bin(map);
      // (turned so that the face's front is outward: drawn from the front only)
      for (const k of [0, 2, 1, 0, 3, 2]) {
        b.pos.push(...ps[k]!);
        b.uv.push(...uvs[k]!);
        b.tint.push(...tint);
      }
    },
    [sx, sy] = look.storey;
  for (const k of blocks) {
    const front = look.facades[k.facade]!,
      // the four upright faces: x = x1 (side 0), x = x0 (1), z = z1 (2), z = z0 (3), each as (from, to) along the
      // ground
      faces: [number, number, number, number][] = [
        [k.x1, k.z0, k.x1, k.z1],
        [k.x0, k.z1, k.x0, k.z0],
        [k.x1, k.z1, k.x0, k.z1],
        [k.x0, k.z0, k.x1, k.z0],
      ];
    const y0 = k.bottom ?? 0,
      [v0, v1] = (k.paint ?? [y0, k.top]).map(y => y / sy) as [number, number];
    for (const side of k.sides) {
      const [ax, az, bx, bz] = faces[side]!,
        len = Math.hypot(bx - ax, bz - az);
      quad(
        front,
        [
          [ax, y0, az],
          [bx, y0, bz],
          [bx, k.top, bz],
          [ax, k.top, az],
        ],
        [
          [0, v0],
          [len / sx, v0],
          [len / sx, v1],
          [0, v1],
        ],
        look.light[side]!,
      );
    }
    const rt = look.roofTile;
    if (k.under)
      quad(
        look.roofs[k.roof]!,
        [
          [k.x0, y0, k.z1],
          [k.x1, y0, k.z1],
          [k.x1, y0, k.z0],
          [k.x0, y0, k.z0],
        ],
        [
          [k.x0 / rt, k.z1 / rt],
          [k.x1 / rt, k.z1 / rt],
          [k.x1 / rt, k.z0 / rt],
          [k.x0 / rt, k.z0 / rt],
        ],
        look.light[0]!.map(v => v * 0.5),
      );
    if (!k.noRoof)
      quad(
        look.roofs[k.roof]!,
        [
          [k.x0, k.top, k.z0],
          [k.x1, k.top, k.z0],
          [k.x1, k.top, k.z1],
          [k.x0, k.top, k.z1],
        ],
        [
          [k.x0 / rt, -k.z0 / rt],
          [k.x1 / rt, -k.z0 / rt],
          [k.x1 / rt, -k.z1 / rt],
          [k.x0 / rt, -k.z1 / rt],
        ],
        look.roofLight,
      );
  }
  for (const [map, b] of bins) {
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.needsUpdate = true;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.setAttribute('tint', new THREE.Float32BufferAttribute(b.tint, 3));
    const m = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: {
          map: { value: map },
          haze: { value: haze },
          clear: { value: look.clear },
          fade: { value: look.fade },
          shrink: { value: (bandRadius * BLOCK_FIT) / look.reach },
        },
        vertexShader: BLOCK_VERT,
        fragmentShader: BLOCK_FRAG,
        stencilWrite: true,
        stencilRef: VIEW,
        stencilFunc: THREE.EqualStencilFunc,
      }),
    );
    m.renderOrder = WINDOW_ORDER + 3;
    m.frustumCulled = false;
    group.add(m);
  }
  return group;
}
// Things that stand on the street out there, among the blocks (trees, lamps, poles): each a picture with a clear
// background, stood upright twice, crossed, so that it has a body from every side and stands out of the flat ground
// as one walks past the window. Drawn the way the blocks are (seen through the panes only, shrunk toward the eye,
// into the haze), `pics` by number; a card is `w` wide and `h` high (m) with its foot's middle at (x, z), turned
// `turn` (radians) round its upright. `flat`: laid on the ground instead, a square `w` a side (a paving stone, a
// patch of the street that is not the ground's own picture), `h` unused.
export interface OutsideCard {
  x: number;
  z: number;
  w: number;
  h: number;
  pic: number;
  turn: number;
  flat?: boolean;
}
const FLAT_LIFT = 0.03; // a card laid flat stands this far over the ground (m)
const CARD_FRAG = `
uniform sampler2D map;
uniform vec3 haze;
uniform float clear;
uniform float fade;
varying vec3 vTint;
varying vec2 vUv;
varying float vFar;
void main() {
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.5) discard;
  float far = 1.0 - exp2(-max(vFar - clear, 0.0) / fade);
  gl_FragColor = vec4(mix(c.rgb * vTint, haze, far), 1.0);
}`;
export function buildOutsideCards(
  cards: OutsideCard[],
  look: Pick<OutsideLook, 'haze' | 'clear' | 'fade' | 'reach'> & {
    pics: THREE.Texture[];
    light: [number, number, number];
  },
  bandRadius: number,
): THREE.Group {
  const group = new THREE.Group(),
    haze = new THREE.Color(look.haze),
    bins = new Map<number, { pos: number[]; uv: number[]; tint: number[] }>();
  for (const c of cards) {
    let b = bins.get(c.pic);
    if (!b) bins.set(c.pic, (b = { pos: [], uv: [], tint: [] }));
    if (c.flat) {
      const r = c.w / 2,
        cs = Math.cos(c.turn) * r,
        sn = Math.sin(c.turn) * r,
        ps = [
          [c.x - cs + sn, FLAT_LIFT, c.z - sn - cs],
          [c.x + cs + sn, FLAT_LIFT, c.z + sn - cs],
          [c.x + cs - sn, FLAT_LIFT, c.z + sn + cs],
          [c.x - cs - sn, FLAT_LIFT, c.z - sn + cs],
        ],
        uvs = [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        b.pos.push(...ps[k]!);
        b.uv.push(...uvs[k]!);
        b.tint.push(...look.light);
      }
      continue;
    }
    for (const a of [c.turn, c.turn + Math.PI / 2]) {
      const dx = (Math.cos(a) * c.w) / 2,
        dz = (Math.sin(a) * c.w) / 2,
        ps = [
          [c.x - dx, 0, c.z - dz],
          [c.x + dx, 0, c.z + dz],
          [c.x + dx, c.h, c.z + dz],
          [c.x - dx, c.h, c.z - dz],
        ],
        uvs = [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        b.pos.push(...ps[k]!);
        b.uv.push(...uvs[k]!);
        b.tint.push(...look.light);
      }
    }
  }
  for (const [pic, b] of bins) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.setAttribute('tint', new THREE.Float32BufferAttribute(b.tint, 3));
    const m = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: {
          map: { value: look.pics[pic]! },
          haze: { value: haze },
          clear: { value: look.clear },
          fade: { value: look.fade },
          shrink: { value: (bandRadius * BLOCK_FIT) / look.reach },
        },
        vertexShader: BLOCK_VERT,
        fragmentShader: CARD_FRAG,
        side: THREE.DoubleSide,
        stencilWrite: true,
        stencilRef: VIEW,
        stencilFunc: THREE.EqualStencilFunc,
      }),
    );
    m.renderOrder = WINDOW_ORDER + 3;
    m.frustumCulled = false;
    group.add(m);
  }
  return group;
}
