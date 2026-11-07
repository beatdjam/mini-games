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
export const VIEW = 2;
const THROUGH_FACE = 1;
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
