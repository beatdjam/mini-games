// The sky behind the beach (SB-1360): a cloudy gradient on a big sphere that follows the camera, painted once and
// repainted only when the look asks for other colours. The sphere is `fog: false` and `toneMapped: false`, so its
// colour reaches the screen as it was painted: the Lambert fog is mixed in after the tone map, so a background picture
// (which goes through the tone map) would not meet the fog at the horizon. Its equator is the horizon and holds the
// fog's colour; its top is the look's sky colour mixed toward the named dark cloud colour.
import * as THREE from 'three';
import { camera, canvasTex, scene } from '@engine/render/index.ts';
import { SKY_TOP_COLOR } from '../data/colors.ts';
import { SKY_TOP_MIX } from '../data/surfaces.ts';

// The sphere follows the camera, so it is always inside the camera's far plane and the whole view shows sky.
const RADIUS = 40; // m
const WIDTH = 32; // segments around the sphere
const HEIGHT = 16; // ... and from pole to pole; the gradient needs no more

interface Sky {
  texture: THREE.CanvasTexture;
  top: number; // the colour the picture currently has at its top
  bottom: number; // ... and at its bottom
}

let sky: Sky | null = null;

const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

// Sets the sky's gradient. Called at start-up and by the look; the same colours repaint nothing.
export function setSky(skyColor: number, horizonColor: number): void {
  if (typeof document === 'undefined') return; // node: the unit tests never draw the sky
  const top = new THREE.Color(skyColor).lerp(new THREE.Color(SKY_TOP_COLOR), SKY_TOP_MIX).getHex();
  if (sky && sky.top === top && sky.bottom === horizonColor) return;
  if (!sky) {
    const texture = canvasTex(2, 256, () => {});
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      fog: false, // the sky is the fog's own colour at the horizon; mixing fog into it would double it
      toneMapped: false, // the fog's colour is mixed after the tone map, so the sky must not pass through it
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, WIDTH, HEIGHT), material);
    mesh.name = 'sb-sky';
    mesh.renderOrder = -1; // drawn before everything, like the background it replaces
    mesh.frustumCulled = false;
    // the camera moves over the map, so the sphere is kept around it; its turn stays zero, so the horizon does not tilt
    mesh.onBeforeRender = () => {
      mesh.position.copy(camera.position);
      mesh.updateMatrixWorld();
    };
    scene.add(mesh);
    sky = { texture, top: -1, bottom: -1 };
  }
  const g = (sky.texture.image as HTMLCanvasElement).getContext('2d');
  if (!g) return;
  const w = g.canvas.width,
    h = g.canvas.height,
    horizon = h / 2; // the sphere's equator, where the fog and the sky meet
  const gradient = g.createLinearGradient(0, 0, 0, horizon);
  gradient.addColorStop(0, css(top));
  gradient.addColorStop(1, css(horizonColor));
  // below the equator nothing of the sky shows; keeping it the fog's colour leaves no seam if a low camera sees it
  g.fillStyle = css(horizonColor);
  g.fillRect(0, 0, w, h);
  g.fillStyle = gradient;
  g.fillRect(0, 0, w, horizon);
  sky.top = top;
  sky.bottom = horizonColor;
  sky.texture.needsUpdate = true;
}
