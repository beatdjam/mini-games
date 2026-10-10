import * as THREE from 'three';
import { T, tileCenter } from '../world/tiles.ts';
import { UP } from './render.ts';
// Windows one sees out of, in a world of wall tiles. The wall is not opened (a hole through a wall a tile thick would
// be a tunnel): the panes are flat on the wall's face and draw nothing, but mark the stencil where they are seen;
// then the backdrop (the view all round, on the inside of a cylinder that stays round the eye) is drawn only there,
// so it is seen through them as if it were as far away as the sky. They are drawn after everything solid, so what
// stands in front of a window hides it. Needs a renderer with a stencil buffer (three.js has one by default)
export const WINDOW_ORDER = 900; // the panes' renderOrder; the backdrop's is the next
// a face of a wall tile with windows on it: the tile (i, j), the step (di, dj) from it toward the floor it is seen
// from, and its panes as rectangles of the face: left, top, right, bottom, each 0..1 from the face's top left as seen
// from that floor
export interface WindowFace {
  i: number;
  j: number;
  di: number;
  dj: number;
  rects: [number, number, number, number][];
}
const PANE_OUT = 0.02; // the panes stand this far in front of the face (m)
let paneMat: THREE.MeshBasicMaterial | null = null;
// the panes of all the faces in one mesh (null when there are none); the faces are wallH high
export function buildWindowPanes(faces: WindowFace[], wallH: number): THREE.InstancedMesh | null {
  const matrices: THREE.Matrix4[] = [],
    turn = new THREE.Quaternion(),
    at = new THREE.Vector3(),
    size = new THREE.Vector3();
  for (const { i, j, di, dj, rects } of faces) {
    const yaw = Math.atan2(di, dj), // the plane's front (+z) turned toward the floor
      out = T / 2 + PANE_OUT;
    turn.setFromAxisAngle(UP, yaw);
    for (const [l, t, r, b] of rects) {
      const along = ((l + r) / 2 - 0.5) * T; // along the face, to the right as seen from the floor
      at.set(
        tileCenter(i) + di * out + Math.cos(yaw) * along,
        wallH * (1 - (t + b) / 2),
        tileCenter(j) + dj * out - Math.sin(yaw) * along,
      );
      size.set((r - l) * T, (b - t) * wallH, 1);
      matrices.push(new THREE.Matrix4().compose(at, turn, size));
    }
  }
  if (!matrices.length) return null;
  paneMat ??= new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  const panes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), paneMat, matrices.length);
  matrices.forEach((m, n) => panes.setMatrixAt(n, m));
  panes.instanceMatrix.needsUpdate = true;
  panes.renderOrder = WINDOW_ORDER;
  return panes;
}
// What closes the backdrop above and below, so that it is whole whichever way one looks out (right up at a window,
// looking up or down): `sky`, a lid over the band's top edge in one colour (the band's top row's), and `ground`, a
// picture laid flat at the height Backdrop.groundY (in the frame the backdrop is put in), out to all but the horizon
// (GROUND_RIM under it), that runs on under one's feet as one walks (it is fixed to the world, `tile` metres a repeat
// of `map`, which must wrap). Clear out to `clear` metres, then it goes into `haze`: half of the way in `fade` metres
// further, nearly all of it by the horizon.
export interface BackdropEnds {
  sky?: THREE.Color | string | number;
  ground?: {
    map: THREE.Texture;
    tile: number;
    clear: number;
    fade: number;
    haze: THREE.Color | string | number;
  };
}
const GROUND_RIM = 0.7; // the ground's edge is this far under the horizon (degrees)
const GROUND_MIN = 0.3; // the ground is at least this far under the eye (m)
// (seen through the panes only, over everything; the band and its lid leave their depth, for what stands in front of
// them out there: buildOutsideBlocks)
const throughPanes = {
  depthTest: false,
  depthWrite: false,
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.EqualStencilFunc,
} as const;
// (with the depth test off, nothing is written to the depth either: so the test is on, and always passes)
const leavesDepth = { depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true } as const;
// The ground is far wider than the camera's far plane, so it is drawn shrunk toward the eye (it looks the same from
// the eye: nothing of it is compared in depth): its geometry a circle of radius 1 round the eye, `reachOut` true metres
// (reachOut) the mesh scaled down; the picture and the haze go by the true metres
const GROUND_VERT = `
uniform float tile;
uniform float reachOut;
varying vec2 vAt;
varying float vOut;
void main() {
  vec2 at = position.xz * reachOut;
  vAt = vec2(cameraPosition.x + at.x, -(cameraPosition.z + at.y)) / tile;
  vOut = length(at);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const GROUND_FRAG = `
uniform sampler2D map;
uniform vec3 haze;
uniform float clear;
uniform float fade;
varying vec2 vAt;
varying float vOut;
void main() {
  float far = 1.0 - exp2(-max(vOut - clear, 0.0) / fade);
  gl_FragColor = vec4(mix(texture2D(map, vAt).rgb, haze, far), 1.0);
}`;
// the backdrop (buildBackdrop): a group, with the height of its ground in it
export class Backdrop extends THREE.Group {
  groundY = 0;
}
// The backdrop: `map` painted on the inside of a cylinder `radius` round and `height` high (inside the camera's far
// plane, even at its top and bottom edges), its middle at the eye's height, and what closes it above and below
// (`ends`). It moves to the eye before it is drawn, so it never comes nearer. Drawn right after the panes, over
// everything but only where a pane marked the stencil. Put it in a group that stays where it is (its own place is
// where the eye is). Round it: the map's left edge is toward +z, a quarter of the way along is toward +x, half toward
// -z, three quarters toward -x
export function buildBackdrop(map: THREE.Texture, radius: number, height: number, ends: BackdropEnds = {}): Backdrop {
  const group = new Backdrop(),
    eye = new THREE.Vector3(),
    // a part of it, `up` above the eye wherever the eye goes
    part = (m: THREE.Mesh, up: () => number, order: number) => {
      m.renderOrder = order;
      m.frustumCulled = false;
      m.onBeforeRender = (_r, _s, cam) => {
        m.position.copy(eye.setFromMatrixPosition(cam.matrixWorld));
        m.position.y += up();
        m.updateMatrixWorld();
      };
      group.add(m);
    };
  part(
    new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, 48, 1, true),
      new THREE.MeshBasicMaterial({ map, side: THREE.BackSide, fog: false, ...throughPanes, ...leavesDepth }),
    ),
    () => 0,
    WINDOW_ORDER + 1,
  );
  if (ends.sky !== undefined)
    part(
      new THREE.Mesh(
        new THREE.CircleGeometry(radius, 48).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: ends.sky, fog: false, ...throughPanes, ...leavesDepth }),
      ),
      () => height / 2,
      WINDOW_ORDER + 1,
    );
  // under the band, a floor that leaves only its depth (no colour): what stands out there is drawn over it, looking
  // steeply down as much as anywhere (the ground is drawn there, and leaves none)
  part(
    new THREE.Mesh(
      new THREE.CircleGeometry(radius, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ colorWrite: false, ...throughPanes, ...leavesDepth }),
    ),
    () => -height / 2,
    WINDOW_ORDER + 1,
  );
  const ground = ends.ground;
  if (ground) {
    ground.map.wrapS = THREE.RepeatWrapping;
    ground.map.wrapT = THREE.RepeatWrapping;
    ground.map.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: ground.map },
          tile: { value: ground.tile },
          reachOut: { value: 1 },
          clear: { value: ground.clear },
          fade: { value: ground.fade },
          haze: { value: new THREE.Color(ground.haze) },
        },
        vertexShader: GROUND_VERT,
        fragmentShader: GROUND_FRAG,
        ...throughPanes,
      }),
      m = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), mat),
      here = new THREE.Vector3();
    // (over the band: under the ground's edge the band is not seen)
    part(
      m,
      () => {
        // how far under the eye the ground is now, how far out it goes, and how far it is shrunk (its edge as far
        // from the eye as the band)
        const depth = Math.max(group.worldToLocal(here.copy(eye)).y - group.groundY, GROUND_MIN),
          out = depth / Math.tan((GROUND_RIM * Math.PI) / 180),
          shrink = radius / Math.hypot(out, depth);
        mat.uniforms.reachOut!.value = out;
        m.scale.setScalar(out * shrink);
        return -depth * shrink;
      },
      WINDOW_ORDER + 2,
    );
  }
  return group;
}

// Buildings out there, in front of the backdrop (across the street from the windows): boxes standing on the ground
// (y 0 in their group's frame), each its footprint x0..x1 by z0..z1 and `top` high. Only what can be seen from inside
// is built: the roof, and of the upright faces those in `sides` (numbered as in world/tiles.ts: 0 the face looking
// toward +x, at x1 ...). Each face a picture repeated over it (`look.facades[facade]`, `look.storey` metres across
// and up a repeat; the roof `look.roofs[roof]`, `look.roofTile` metres a repeat), times the light on that side
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
      for (const k of [0, 1, 2, 0, 2, 3]) {
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
    for (const side of k.sides) {
      const [ax, az, bx, bz] = faces[side]!,
        len = Math.hypot(bx - ax, bz - az);
      quad(
        front,
        [
          [ax, 0, az],
          [bx, 0, bz],
          [bx, k.top, bz],
          [ax, k.top, az],
        ],
        [
          [0, 0],
          [len / sx, 0],
          [len / sx, k.top / sy],
          [0, k.top / sy],
        ],
        look.light[side]!,
      );
    }
    const rt = look.roofTile;
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
        side: THREE.DoubleSide,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.EqualStencilFunc,
      }),
    );
    m.renderOrder = WINDOW_ORDER + 3;
    m.frustumCulled = false;
    group.add(m);
  }
  return group;
}
