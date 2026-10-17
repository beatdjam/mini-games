import * as THREE from 'three';
import { T, tileCenter } from '../world/tiles.ts';
import { UP, renderer } from './render.ts';
import { canvasTex } from './paint.ts';
// Windows one sees out of, in a world of wall tiles. The wall is not opened (a hole through a wall a tile thick would
// be a tunnel): the panes are flat on the wall's face and draw nothing, but mark the stencil where they are seen;
// then the backdrop (the view all round, on the inside of a cylinder that stays round the eye) is drawn only there,
// so it is seen through them as if it were as far away as the sky. They are drawn after everything solid, so what
// stands in front of a window hides it. Needs a renderer with a stencil buffer (three.js has one by default)
export const WINDOW_ORDER = 900; // the panes' renderOrder; the backdrop's is the next
// (after the view out, the backdrop and the buildings out there: WINDOW_ORDER + 1 to + 3, the panes give the depth
// back to the wall: buildWindowPanes)
const WINDOW_SEAL_ORDER = WINDOW_ORDER + 4;
// a face of a wall tile with windows on it: the tile (i, j), the step (di, dj) from it toward the floor it is seen
// from, and its panes as rectangles of the face: left, top, right, bottom, each 0..1 from the face's top left as seen
// from that floor
export interface WindowFace {
  i: number;
  j: number;
  di: number;
  dj: number;
  rects: [number, number, number, number][];
  deep?: number; // the wall is this thick behind the face (m), and it is seen through only straight through that
  // (a deep window: a look in at a slant meets the wall's sides. Out of a wall a tile thick that is a tunnel)
  into?: number; // 1..63: it looks into a place of the world instead of out (what seenThrough(..., into) copied)
}
const GLASS_FILM = 0.3; // how much of the glass's tint lies over the whole pane (0..1)
const PANE_OUT = 0.02; // the panes stand this far in front of the face (m)
// The stencil: a pane marks VIEW where the view out is seen through it. A pane of a deep wall (WindowFace.deep) marks
// THROUGH_FACE, and its opening on the wall's far side, drawn after it over everything, makes that VIEW only where
// it is seen too: a look in at a slant meets the wall's sides there, and sees the window's picture
const VIEW = 2,
  THROUGH_FACE = 1;
// A pane that looks into a place (WindowFace.into) marks into << INTO_SHIFT instead: the depth there goes back to as
// far as it can be (the wall's own is in the way) and the colour to the fog's, and the copy of the place (seenThrough)
// is drawn there, in front of the far depth as solid things are. (The view out is not drawn there, and those panes are
// not sealed: the place's see-through things are drawn after everything solid, the seal's turn, and they would not
// show)
const INTO_SHIFT = 2,
  INTO_MASK = 0xfc,
  INTO_ORDER = WINDOW_ORDER + 0.7; // the copies (the far depth goes back at WINDOW_ORDER + 0.6)
let paneMat: THREE.MeshBasicMaterial | null = null,
  deepMat: THREE.MeshBasicMaterial | null = null,
  backMat: THREE.MeshBasicMaterial | null = null,
  sealMat: THREE.MeshBasicMaterial | null = null;
const intoMats = new Map<number, [THREE.MeshBasicMaterial, THREE.ShaderMaterial]>();
// (the far depth, written wherever it is drawn: the plane's points pushed onto the far plane; and the fog's colour,
// what is seen where the copy of the place has nothing, as where nothing is drawn: through an opening in the place
// to a part that is not copied)
const FAR_VERT = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w * 0.99999;
}`;
// where the panes of the faces stand (a unit plane each, scaled to its rectangle); the faces are wallH high. `back`:
// at the wall's far side instead (its opening there, for a deep wall)
function paneMatrices(faces: WindowFace[], wallH: number, back = false): THREE.Matrix4[] {
  const matrices: THREE.Matrix4[] = [],
    turn = new THREE.Quaternion(),
    at = new THREE.Vector3(),
    size = new THREE.Vector3();
  for (const { i, j, di, dj, rects, deep } of faces) {
    const yaw = Math.atan2(di, dj), // the plane's front (+z) turned toward the floor
      out = T / 2 + PANE_OUT - (back ? (deep ?? 0) : 0);
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
  return matrices;
}
const instanced = (matrices: THREE.Matrix4[], mat: THREE.Material, order: number): THREE.InstancedMesh => {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, matrices.length);
  matrices.forEach((m, n) => mesh.setMatrixAt(n, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.renderOrder = order;
  return mesh;
};
// the panes of all the faces (null when there are none): a group of instanced meshes
export function buildWindowPanes(faces: WindowFace[], wallH: number): THREE.Group | null {
  const all = paneMatrices(faces, wallH);
  if (!all.length) return null;
  const mark = (ref: number) =>
      new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        stencilWrite: true,
        stencilRef: ref,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilZPass: THREE.ReplaceStencilOp,
      }),
    group = new THREE.Group(),
    thin = faces.filter(f => !f.deep && !f.into),
    deep = faces.filter(f => f.deep && !f.into);
  paneMat ??= mark(VIEW);
  deepMat ??= mark(THROUGH_FACE);
  if (thin.length) group.add(instanced(paneMatrices(thin, wallH), paneMat, WINDOW_ORDER));
  if (deep.length) {
    group.add(instanced(paneMatrices(deep, wallH), deepMat, WINDOW_ORDER));
    // (over everything, behind the wall as it is: only where the pane in front marked the stencil)
    backMat ??= new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      stencilWrite: true,
      stencilRef: THROUGH_FACE,
      stencilFunc: THREE.EqualStencilFunc,
      stencilZPass: THREE.IncrementStencilOp,
    });
    group.add(instanced(paneMatrices(deep, wallH, true), backMat, WINDOW_ORDER + 0.5));
  }
  for (const into of new Set(faces.flatMap(f => (f.into ? [f.into] : [])))) {
    const ref = into << INTO_SHIFT,
      [mark1, far] =
        intoMats.get(into) ??
        intoMats
          .set(into, [
            mark(ref),
            new THREE.ShaderMaterial({
              vertexShader: FAR_VERT,
              fragmentShader: 'uniform vec3 fogColor;\nvoid main() { gl_FragColor = vec4(fogColor, 1.0); }',
              uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
              fog: true,
              depthWrite: true,
              depthFunc: THREE.AlwaysDepth,
              stencilWrite: true,
              stencilRef: ref,
              stencilFunc: THREE.EqualStencilFunc,
            }),
          ])
          .get(into)!,
      mine = paneMatrices(
        faces.filter(f => f.into === into),
        wallH,
      );
    group.add(instanced(mine, mark1, WINDOW_ORDER), instanced(mine, far, WINDOW_ORDER + 0.6));
  }
  // ... and once the view out is drawn, the same panes again, leaving only their depth: the view out leaves its own,
  // far off, and what is drawn after it (the glass, and the see-through things of the floor: cut-out pictures, pools
  // of light) would be seen in the window from behind the wall. With the wall's depth back, only what stands in front
  // of the window is drawn over it
  sealMat ??= new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    depthFunc: THREE.AlwaysDepth,
    stencilWrite: true,
    stencilRef: VIEW,
    stencilFunc: THREE.EqualStencilFunc,
  });
  group.add(instanced(all, sealMat, WINDOW_SEAL_ORDER));
  return group;
}
// The glass in those panes: a picture with alpha (windowGlassTex) over each, drawn after all that is seen through
// them. Without it the view out is as clear as through a hole, sharper and brighter than the room one stands in; the
// glass takes it toward its own tint, and its dirt is a thing near the eye that the view lies behind
export function buildWindowGlass(faces: WindowFace[], wallH: number, map: THREE.Texture): THREE.InstancedMesh | null {
  const matrices = paneMatrices(faces, wallH);
  if (!matrices.length) return null;
  return instanced(
    matrices,
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: false }),
    WINDOW_ORDER + 4,
  );
}
// The frames round those panes, standing out of the wall's face toward the floor: without them the view out lies
// flat on the face, and along the wall at a slant it reads as a picture stuck on it. A frame in front hides some of
// the view behind it and moves against it as one walks, which is what a window in a wall does. Round the panes of a
// face all together a frame `width` wide, and round each pane a bar `bar` wide (the bars between panes); all of them
// `depth` out of the face (m). One instanced mesh of boxes (null when there are none), shaded by the side a box shows
// (no light is needed: its front as `color`, its sides and underside darker)
export function buildWindowFrames(
  faces: WindowFace[],
  wallH: number,
  color: THREE.Color | string | number,
  { width = 0.1, bar = 0.06, depth = 0.12 } = {},
): THREE.InstancedMesh | null {
  const matrices: THREE.Matrix4[] = [],
    turn = new THREE.Quaternion(),
    at = new THREE.Vector3(),
    size = new THREE.Vector3();
  for (const { i, j, di, dj, rects } of faces) {
    if (!rects.length) continue;
    const yaw = Math.atan2(di, dj),
      out = T / 2 + depth / 2,
      // a box along the face: its middle `x` to the right of the face's middle and `y` up, `w` wide and `h` high
      box = (x: number, y: number, w: number, h: number) => {
        at.set(tileCenter(i) + di * out + Math.cos(yaw) * x, y, tileCenter(j) + dj * out - Math.sin(yaw) * x);
        size.set(w, h, depth);
        matrices.push(new THREE.Matrix4().compose(at, turn, size));
      },
      // a rectangle's left, top, right and bottom in m: left and right from the face's middle, top and bottom up
      // from the floor
      edges = ([l, t, r, b]: [number, number, number, number]) =>
        [(l - 0.5) * T, wallH * (1 - t), (r - 0.5) * T, wallH * (1 - b)] as const,
      // a frame `f` wide round a rectangle
      round = ([x0, y0, x1, y1]: readonly [number, number, number, number], f: number) => {
        box(x0 - f / 2, (y0 + y1) / 2, f, y0 - y1 + 2 * f);
        box(x1 + f / 2, (y0 + y1) / 2, f, y0 - y1 + 2 * f);
        box((x0 + x1) / 2, y0 + f / 2, x1 - x0, f);
        box((x0 + x1) / 2, y1 - f / 2, x1 - x0, f);
      };
    turn.setFromAxisAngle(UP, yaw);
    const all = rects.map(edges);
    round(
      [
        Math.min(...all.map(e => e[0])),
        Math.max(...all.map(e => e[1])),
        Math.max(...all.map(e => e[2])),
        Math.min(...all.map(e => e[3])),
      ],
      width,
    );
    if (rects.length > 1) for (const e of all) round(e, bar);
  }
  if (!matrices.length) return null;
  // a unit box, its faces' shade in its vertex colours: the front (+z, toward the floor) as it is, the sides
  // darker, the top a little lighter than the sides (the light comes in from above), the underside darkest
  const geo = new THREE.BoxGeometry(1, 1, 1),
    normal = geo.getAttribute('normal'),
    shade = (y: number, z: number) => (z > 0.5 ? 1 : y > 0.5 ? 0.82 : y < -0.5 ? 0.5 : 0.66),
    colors: number[] = [];
  for (let n = 0; n < normal.count; n++) {
    const s = shade(normal.getY(n), normal.getZ(n));
    colors.push(s, s, s);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshBasicMaterial({ color, vertexColors: true }),
    matrices.length,
  );
  matrices.forEach((m, n) => mesh.setMatrixAt(n, m));
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
// A copy of `src` drawn only through the panes that look into `into` (WindowFace.into), over the wall they are on: a
// place of the world seen through a window as it is (the caller puts the copy where the window should show it). It
// shares the meshes' geometry, pictures and shader uniforms; their order among themselves is kept. Meshes only (lines,
// points and sprites are left out). Hide what should not be seen there from the place itself with keepOutOfPanes.
// `clip`: only what is on its front side is drawn (in the world's coordinates: what of the place would come right up
// to the glass). Or a plane for each mesh (none: all of it): a wall of the place that runs away from the glass is
// cut only just past the glass, or it would end short of the corner it makes with the wall the window is in, and
// leave a gap there, while what stands out of the walls is cut further off
export function seenThrough(
  src: THREE.Object3D,
  into: number,
  clip?: THREE.Plane | ((o: THREE.Object3D) => THREE.Plane | undefined),
): THREE.Object3D {
  if (clip) renderer.localClippingEnabled = true;
  const mats = new Map<THREE.Material, Map<THREE.Plane | undefined, THREE.Material>>(),
    through = (m: THREE.Material, plane: THREE.Plane | undefined): THREE.Material => {
      const mine = mats.get(m) ?? mats.set(m, new Map()).get(m)!;
      let c = mine.get(plane);
      if (!c) {
        c = m.clone();
        // (a clone copies the uniforms' values: shared, the copy follows what the game does to them)
        if ((m as THREE.ShaderMaterial).isShaderMaterial)
          (c as THREE.ShaderMaterial).uniforms = (m as THREE.ShaderMaterial).uniforms;
        Object.assign(c, {
          stencilWrite: true,
          stencilRef: into << INTO_SHIFT,
          stencilFunc: THREE.EqualStencilFunc,
          stencilFuncMask: 0xff,
          stencilFail: THREE.KeepStencilOp,
          stencilZFail: THREE.KeepStencilOp,
          stencilZPass: THREE.KeepStencilOp,
          clippingPlanes: plane ? [plane] : null,
        });
        mine.set(plane, c);
      }
      return c;
    },
    planeOf = (o: THREE.Object3D) => (typeof clip === 'function' ? clip(o) : clip),
    matOf = (o: THREE.Object3D, m: THREE.Material | THREE.Material[]) => {
      const plane = planeOf(o);
      return Array.isArray(m) ? m.map(x => through(x, plane)) : through(m, plane);
    },
    copy = (o: THREE.Object3D): THREE.Object3D | null => {
      let c: THREE.Object3D;
      if ((o as THREE.InstancedMesh).isInstancedMesh) {
        const s = o as THREE.InstancedMesh,
          m = new THREE.InstancedMesh(s.geometry, matOf(s, s.material), s.count);
        m.instanceMatrix = s.instanceMatrix;
        m.instanceColor = s.instanceColor;
        c = m;
      } else if ((o as THREE.Mesh).isMesh) {
        const s = o as THREE.Mesh;
        c = new THREE.Mesh(s.geometry, matOf(s, s.material));
      } else if ((o as THREE.Line).isLine || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) return null;
      else c = new THREE.Group();
      if ((o as THREE.Mesh).isMesh) {
        c.renderOrder = INTO_ORDER + o.renderOrder * 0.001;
        c.frustumCulled = o.frustumCulled;
        c.onBeforeRender = o.onBeforeRender;
      }
      c.position.copy(o.position);
      c.quaternion.copy(o.quaternion);
      c.scale.copy(o.scale);
      c.visible = o.visible;
      for (const child of o.children) {
        const x = copy(child);
        if (x) c.add(x);
      }
      return c;
    };
  return copy(src) ?? new THREE.Group();
}
// The see-through things of `src` (drawn after everything solid) are not drawn in the panes that look into a place:
// what is there is the place's copy (seenThrough), and the place itself, behind the wall, would show over it. So
// would any other see-through thing behind the wall (a room round a corner, seen at a slant through the pane): give
// it the floors too. The windows' own parts (their glass: WINDOW_ORDER and after) are left as they are
export function keepOutOfPanes(src: THREE.Object3D) {
  src.traverse(o => {
    if (o.renderOrder >= WINDOW_ORDER) return;
    const m = (o as THREE.Mesh).material;
    for (const x of Array.isArray(m) ? m : m ? [m] : [])
      if (x.transparent)
        Object.assign(x, {
          stencilWrite: true,
          stencilRef: 0,
          stencilFunc: THREE.EqualStencilFunc,
          stencilFuncMask: INTO_MASK,
        });
  });
}
// a pane of old glass: a film of `tint` all over, thicker toward the frame and along the sill, rain streaks down it
// and specks of dirt
export function windowGlassTex(tint: THREE.Color | string | number, seed = 7): THREE.CanvasTexture {
  const S = 128,
    c = new THREE.Color(tint),
    rgba = (a: number, lift = 0) =>
      `rgba(${[c.r, c.g, c.b].map(v => Math.round(Math.min(1, v + lift) * 255)).join(',')},${a})`;
  let r = seed;
  const rand = () => (r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296;
  return canvasTex(S, S, g => {
    g.fillStyle = rgba(GLASS_FILM);
    g.fillRect(0, 0, S, S);
    // thicker toward the frame, most along the sill
    for (const [x0, y0, x1, y1, a] of [
      [0, S, 0, S * 0.55, 0.42],
      [0, 0, 0, S * 0.18, 0.22],
      [0, 0, S * 0.14, 0, 0.2],
      [S, 0, S * 0.86, 0, 0.2],
    ] as const) {
      const edge = g.createLinearGradient(x0, y0, x1, y1);
      edge.addColorStop(0, rgba(a));
      edge.addColorStop(1, rgba(0));
      g.fillStyle = edge;
      g.fillRect(0, 0, S, S);
    }
    for (let n = 0; n < 26; n++) {
      g.fillStyle = rgba(0.05 + rand() * 0.1, 0.25);
      g.fillRect(rand() * S, rand() * S * 0.4, 1 + rand() * 2, S * (0.3 + rand() * 0.7));
    }
    for (let n = 0; n < 90; n++) {
      g.fillStyle = rgba(0.1 + rand() * 0.25, rand() < 0.5 ? 0.2 : -0.1);
      g.fillRect(rand() * S, rand() * S, 1 + rand() * 2, 1 + rand() * 2);
    }
  });
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
  stencilRef: VIEW,
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
    const y0 = k.bottom ?? 0;
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
          [0, y0 / sy],
          [len / sx, y0 / sy],
          [len / sx, k.top / sy],
          [0, k.top / sy],
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
