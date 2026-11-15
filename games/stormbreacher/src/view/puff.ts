// The soft round patch the air and the blasts are drawn with (SB-1440): a dense middle that fades to nothing at the
// edge. Painted once with canvasTex and shared by every puff, flame, glow and sheet, so a frame never makes a texture.
// In node (the unit tests) there is no canvas: the helpers return null and the materials keep their colour alone.
import * as THREE from 'three';
import { canvasTex } from '@engine/render/index.ts';

let disc: THREE.CanvasTexture | null | undefined;

export function softDiscTexture(): THREE.CanvasTexture | null {
  if (disc !== undefined) return disc;
  if (typeof document === 'undefined') {
    disc = null;
    return disc;
  }
  disc = canvasTex(128, 128, g => {
    const s = g.canvas.width,
      r = s / 2;
    const gradient = g.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.85)');
    gradient.addColorStop(0.65, 'rgba(255,255,255,0.3)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, s, s);
  });
  return disc;
}
