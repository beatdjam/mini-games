import type { Pickup } from '../data/types.ts';
import { query } from '@engine/core/world.ts';
import { t } from '@engine/core/i18n.ts';
import { H, T, W, cover, grid, hgt, ramp, tileIndex } from '@engine/world/tiles.ts';
import { level } from '../world/level.ts';
import { enemies } from '../world/entities.ts';
import { player } from '../actors/player.ts';
import { CSS_COLOR } from '../data/colors.ts';
export function drawMap(c: HTMLCanvasElement, g: CanvasRenderingContext2D, big?: boolean) {
  const s = c.width / Math.max(W, H);
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = level.biome.line;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (!level.seen[k] || grid[k] !== 1) continue;
      // brighter = higher; cover is grey, hazard tiles get a red tint
      g.fillStyle = cover[k] ? '#5b6168' : level.biome.line;
      g.globalAlpha = cover[k] ? 0.8 : ramp[k] >= 0 ? 0.8 : hgt[k] > 0 ? 1 : level.roomOf[k] >= 0 ? 0.55 : 0.4;
      g.fillRect(i * s, j * s, s + 0.5, s + 0.5);
      if (level.hazardTiles[k]) {
        g.fillStyle = '#ff4d4d';
        g.globalAlpha = 0.45;
        g.fillRect(i * s, j * s, s + 0.5, s + 0.5);
      }
    }
  g.globalAlpha = 1;
  const px = (x: number) => (x / T) * s,
    u = c.width / 160;
  query<Pickup>('pickup').forEach(p => {
    if (p.kind === 'bit') return;
    if (!level.seen[tileIndex(p.x, p.z)]) return;
    g.fillStyle = p.kind === 'chip' ? CSS_COLOR.amber : p.kind === 'kit' ? CSS_COLOR.lime : '#ffffff';
    g.fillRect(px(p.x) - 2.5 * u, px(p.z) - 2.5 * u, 5 * u, 5 * u);
  });
  level.portals.forEach(pt => {
    if (!level.seen[tileIndex(pt.x, pt.z)]) return;
    g.strokeStyle = '#' + pt.color.toString(16).padStart(6, '0');
    g.lineWidth = 2 * u;
    g.beginPath();
    g.arc(px(pt.x), px(pt.z), 5 * u, 0, Math.PI * 2);
    g.stroke();
    if (big) {
      g.fillStyle = g.strokeStyle;
      g.font = `${7 * u}px "DotGothic16",sans-serif`;
      g.textAlign = 'center';
      g.fillText(
        t(pt.kind === 'extract' ? 'map.extract' : pt.kind === 'next' && level.arena ? 'map.next' : 'map.exit'),
        px(pt.x),
        px(pt.z) - 8 * u,
      );
    }
  });
  g.fillStyle = CSS_COLOR.mag;
  enemies.forEach(e => {
    if (!e.dead && (e.active || e.boss) && level.seen[tileIndex(e.x, e.z)]) {
      g.beginPath();
      g.arc(px(e.x), px(e.z), (e.boss ? 5 : 2.2) * u, 0, Math.PI * 2);
      g.fill();
    }
  });
  const x = px(player.x),
    z = px(player.z),
    fx = -Math.sin(player.yaw),
    fz = -Math.cos(player.yaw),
    a = 6 * u,
    b = 3.5 * u;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(x + fx * a, z + fz * a);
  g.lineTo(x - fx * b + fz * b, z - fz * b - fx * b);
  g.lineTo(x - fx * b - fz * b, z - fz * b + fx * b);
  g.closePath();
  g.fill();
}
