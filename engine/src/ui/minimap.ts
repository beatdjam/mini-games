// engine: Drawing a top-down map of the tile world on a canvas: the tiles the game lets through (e.g. the ones the
// player has seen), then markers on top (pickups, gates, enemies …), then the viewer as an arrow pointing where it
// looks. The game decides the colours and which markers to show; positions are world x / z (engine/src/world/tiles.ts).
import { H, T, W } from '../world/tiles.ts';

export interface TileStyle {
  color: string;
  alpha: number;
}
export interface MapMarker {
  x: number;
  z: number;
  shape: 'square' | 'ring' | 'dot';
  color: string;
  size: number; // half width of the square / radius, in map units (the canvas width is 160 units)
  label?: string; // drawn above a ring or dot
  font?: (unitPx: number) => string; // CSS font for the label, given the size of one map unit in pixels
}
export interface MapView {
  tile: (k: number) => TileStyle | null; // null leaves the tile empty
  overlay?: (k: number) => TileStyle | null; // drawn over the tile (e.g. a warning tint)
  markers: MapMarker[];
  viewer: { x: number; z: number; yaw: number };
  viewerColor?: string;
}
const MAP_UNITS = 160; // the canvas width in map units; marker sizes and line widths scale with it
const RING_LINE = 2; // ring line width (map units)
const LABEL_RISE = 8; // label height above its marker (map units)
const ARROW_TIP = 6; // viewer arrow: tip ahead of the position (map units)
const ARROW_BACK = 3.5; // viewer arrow: half width and length behind the position (map units)

export function drawTileMap(c: HTMLCanvasElement, g: CanvasRenderingContext2D, view: MapView) {
  const s = c.width / Math.max(W, H); // pixels per tile
  const u = c.width / MAP_UNITS; // pixels per map unit
  g.clearRect(0, 0, c.width, c.height);
  const fillTile = (i: number, j: number, st: TileStyle) => {
    g.fillStyle = st.color;
    g.globalAlpha = st.alpha;
    g.fillRect(i * s, j * s, s + 0.5, s + 0.5);
  };
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const st = view.tile(k);
      if (!st) continue;
      fillTile(i, j, st);
      const over = view.overlay && view.overlay(k);
      if (over) fillTile(i, j, over);
    }
  g.globalAlpha = 1;
  const px = (v: number) => (v / T) * s;
  for (const m of view.markers) {
    const x = px(m.x),
      z = px(m.z),
      r = m.size * u;
    if (m.shape === 'square') {
      g.fillStyle = m.color;
      g.fillRect(x - r, z - r, 2 * r, 2 * r);
    } else {
      g.beginPath();
      g.arc(x, z, r, 0, Math.PI * 2);
      if (m.shape === 'ring') {
        g.strokeStyle = m.color;
        g.lineWidth = RING_LINE * u;
        g.stroke();
      } else {
        g.fillStyle = m.color;
        g.fill();
      }
    }
    if (m.label) {
      g.fillStyle = m.color;
      g.font = m.font ? m.font(u) : `${7 * u}px sans-serif`;
      g.textAlign = 'center';
      g.fillText(m.label, x, z - LABEL_RISE * u);
    }
  }
  const { x: vx, z: vz, yaw } = view.viewer;
  const x = px(vx),
    z = px(vz),
    fx = -Math.sin(yaw),
    fz = -Math.cos(yaw),
    a = ARROW_TIP * u,
    b = ARROW_BACK * u;
  g.fillStyle = view.viewerColor ?? '#ffffff';
  g.beginPath();
  g.moveTo(x + fx * a, z + fz * a);
  g.lineTo(x - fx * b + fz * b, z - fz * b - fx * b);
  g.lineTo(x - fx * b - fz * b, z - fz * b + fx * b);
  g.closePath();
  g.fill();
}
