// The sky behind the beach (SB-1360): one picture of a cloudy gradient, made once and repainted only when the look
// asks for other colours. Its bottom is the fog's colour, so the horizon and the haze meet; its top is the look's sky
// colour mixed toward the named dark cloud colour. Drawn as the scene's background, so it costs no geometry of its own.
import * as THREE from 'three';
import { canvasTex, scene } from '@engine/render/index.ts';
import { SKY_TOP_COLOR } from '../data/colors.ts';
import { SKY_TOP_MIX } from '../data/surfaces.ts';

interface Sky {
  texture: THREE.CanvasTexture;
  top: number; // the colour the picture currently has at its top
  bottom: number; // ... and at its bottom
}

let sky: Sky | null = null;

const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

// Sets the scene's background to the gradient. Called at start-up and by the look; the same colours repaint nothing.
export function setSky(skyColor: number, horizonColor: number): void {
  if (typeof document === 'undefined') return; // node: the unit tests never draw the sky
  const top = new THREE.Color(skyColor).lerp(new THREE.Color(SKY_TOP_COLOR), SKY_TOP_MIX).getHex();
  if (sky && sky.top === top && sky.bottom === horizonColor) return;
  if (!sky) {
    const texture = canvasTex(2, 256, () => {});
    scene.background = texture;
    sky = { texture, top: -1, bottom: -1 };
  }
  const g = (sky.texture.image as HTMLCanvasElement).getContext('2d');
  if (!g) return;
  const h = g.canvas.height;
  const gradient = g.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, css(top));
  gradient.addColorStop(1, css(horizonColor));
  g.fillStyle = gradient;
  g.fillRect(0, 0, g.canvas.width, h);
  sky.top = top;
  sky.bottom = horizonColor;
  sky.texture.needsUpdate = true;
}
