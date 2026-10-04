// The minimap and the big map (M key): what to show and in which colours. The drawing is engine/src/ui/minimap.ts.
import type { Pickup } from '../data/types.ts';
import { query } from '@engine/core/world.ts';
import { t } from '@engine/core/i18n.ts';
import { cover, grid, hgt, ramp, tileIndex } from '@engine/world/tiles.ts';
import { drawTileMap } from '@engine/ui/minimap.ts';
import type { MapMarker, TileStyle } from '@engine/ui/minimap.ts';
import { level } from '../world/level.ts';
import { building } from '../world/building.ts';
import { enemies } from '../world/entities.ts';
import { player } from '../actors/player.ts';
import { CSS_COLOR } from '../data/colors.ts';

const COVER_COLOR = '#5b6168'; // cover tiles are grey
const HAZARD_TINT: TileStyle = { color: '#ff4d4d', alpha: 0.45 }; // over hazard floor tiles
const LABEL_FONT = (u: number) => `${7 * u}px "DotGothic16",sans-serif`;

// a seen floor tile: brighter = higher; cover is grey
function tileStyle(k: number): TileStyle | null {
  if (!level.seen[k] || grid[k] !== 1) return null;
  if (cover[k]) return { color: COVER_COLOR, alpha: 0.8 };
  const alpha = ramp[k] >= 0 ? 0.8 : hgt[k] > 0 ? 1 : level.roomOf[k] >= 0 ? 0.55 : 0.4;
  return { color: level.biome.line, alpha };
}
const seenAt = (x: number, z: number) => !!level.seen[tileIndex(x, z)];

// what is on the map, in drawing order: pickups (not bits), gates (named on the big map), awake enemies and bosses
function markers(big: boolean): MapMarker[] {
  const out: MapMarker[] = [];
  query<Pickup>('pickup').forEach(p => {
    if (p.kind === 'bit' || !seenAt(p.x, p.z)) return;
    const color = p.kind === 'chip' ? CSS_COLOR.amber : p.kind === 'kit' ? CSS_COLOR.lime : '#ffffff';
    out.push({ x: p.x, z: p.z, shape: 'square', color, size: 2.5 });
  });
  level.portals.forEach(pt => {
    if (!seenAt(pt.x, pt.z)) return;
    const linkName = () => (building?.links[pt.link]?.kind === 'stairs' ? 'map.stairs' : 'map.lift');
    const name =
      pt.kind === 'link'
        ? linkName()
        : pt.kind === 'extract'
          ? 'map.extract'
          : pt.kind === 'next' && (level.arena || level.hall)
            ? 'map.next'
            : 'map.exit';
    const color = '#' + pt.color.toString(16).padStart(6, '0');
    out.push({ x: pt.x, z: pt.z, shape: 'ring', color, size: 5, label: big ? t(name) : undefined, font: LABEL_FONT });
  });
  enemies.forEach(e => {
    if (!e.dead && (e.active || e.boss) && seenAt(e.x, e.z))
      out.push({ x: e.x, z: e.z, shape: 'dot', color: CSS_COLOR.mag, size: e.boss ? 5 : 2.2 });
  });
  return out;
}

export function drawMap(c: HTMLCanvasElement, g: CanvasRenderingContext2D, big?: boolean) {
  drawTileMap(c, g, {
    tile: tileStyle,
    overlay: k => (level.hazardTiles[k] ? HAZARD_TINT : null),
    markers: markers(!!big),
    viewer: player,
  });
}
