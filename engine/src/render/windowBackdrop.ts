import * as THREE from 'three';
import { VIEW, WINDOW_ORDER } from './windowPanes.ts';
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
