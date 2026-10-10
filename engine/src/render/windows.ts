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
// The backdrop: `map` painted on the inside of a cylinder `radius` round and `height` high (inside the camera's far
// plane, even at its top and bottom edges), its middle at the eye's height. It moves to the eye before it is drawn,
// so it never comes nearer. Drawn right after the panes, over everything but only where a pane marked the stencil.
// Put it in a group that stays where it is (its own place is where the eye is). Round it: the map's left edge is
// toward +z, a quarter of the way along is toward +x, half toward -z, three quarters toward -x
export function buildBackdrop(map: THREE.Texture, radius: number, height: number): THREE.Mesh {
  const m = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, 48, 1, true),
      new THREE.MeshBasicMaterial({
        map,
        side: THREE.BackSide,
        fog: false,
        depthTest: false,
        depthWrite: false,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.EqualStencilFunc,
      }),
    ),
    eye = new THREE.Vector3();
  m.renderOrder = WINDOW_ORDER + 1;
  m.frustumCulled = false;
  m.onBeforeRender = (_r, _s, cam) => {
    m.position.copy(eye.setFromMatrixPosition(cam.matrixWorld));
    m.updateMatrixWorld();
  };
  return m;
}
