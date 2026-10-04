// The 3D map of the building: every floor as a slab of the tiles seen so far, the stairwells and lifts as lines between
// them, the player as an arrow. It is the second page of the big map (hud.ts toggleMap: closed, 2D, 3D, closed). The
// drawing and the dragging are the engine's (engine/src/ui/floormap3d.ts); this file says what to show.
import { el, isTouch } from '@engine/core/util.ts';
import { actionDown } from '@engine/ui/keymap.ts';
import { T, tileCenter } from '@engine/world/tiles.ts';
import { tileWorldOf } from '@engine/world/dungeon.ts';
import { createFloors } from '@engine/world/floors.ts';
import type { Floors } from '@engine/world/floors.ts';
import { createFloorMap3D } from '@engine/ui/floormap3d.ts';
import type { FloorMap3D, FloorMapMarker } from '@engine/ui/floormap3d.ts';
import { building } from '../world/building.ts';
import type { Building } from '../world/building.ts';
import { level } from '../world/level.ts';
import { player } from '../actors/player.ts';
import { CSS_COLOR } from '../data/colors.ts';

const canvas = el<HTMLCanvasElement>('#bigmap3d');
// the 3D page is the one showing while the big map is open (set by toggleMap)
export const map3d = { on: false };
let map: FloorMap3D | null = null; // made the first time the 3D page opens
let floors: Floors | null = null; // the building as the engine's floors, lowest floor first
let builtFor: Building | null = null;
let seenShown = -1; // how many tiles were seen when the slabs were last made

// While the 3D page is up on a PC, the move keys turn the map (left / right round it, forward / back tilt it) and the
// player stands still; the mouse drags it (the engine's own dragging: the mouse lock is let go, hud.ts setMap).
// Returns true when the keys were taken (the caller gives the player no move input then)
const MAP_PITCH: [number, number] = [0.15, 1.45]; // the tilt the engine's own dragging allows (radians)
const MAP_KEY_TURN = 1.6; // radians per second while a move key is held
export function keysTurnMap3D(dt: number): boolean {
  if (isTouch || canvas.hidden || !map) return false;
  const turn = (actionDown('right') ? 1 : 0) - (actionDown('left') ? 1 : 0),
    tilt = (actionDown('forward') ? 1 : 0) - (actionDown('back') ? 1 : 0);
  map.yaw += turn * MAP_KEY_TURN * dt;
  map.pitch = Math.min(MAP_PITCH[1], Math.max(MAP_PITCH[0], map.pitch + tilt * MAP_KEY_TURN * dt));
  return true;
}
// is the 3D page on screen right now
export const map3dOpen = (): boolean => !canvas.hidden;
// The engine draws floor n at height n, so the building goes in upside down: its lowest floor is floor 0 of the map
const mapFloor = (b: Building, n: number): number => b.plans.length - 1 - n;
function floorsOf(b: Building): Floors {
  const W = b.plans[0]!.gen.W,
    spot = (floor: number, k: number) => ({ floor: mapFloor(b, floor), i: k % W, j: Math.floor(k / W) });
  return createFloors(
    b.plans
      .slice()
      .reverse()
      .map(p => tileWorldOf({ W: p.gen.W, H: p.gen.H, maps: p.gen.maps, rooms: p.gen.rooms })),
    b.plans.map((_, n) => n),
    // a stairwell runs from its landing on the upper floor down to its foot; a lift straight down
    b.links.map(l => ({ kind: l.kind, a: spot(l.upper, l.a), b: spot(l.lower, l.strip[0]!) })),
  );
}
// Called every frame of play. Shows the 3D canvas only while the big map is open on its 3D page in a building, makes
// the slabs again when more of the building has been seen, and draws
export function updateMap3D(bigmapOpen: boolean) {
  const b = building,
    show = bigmapOpen && map3d.on && level.floor >= 0 && !!b;
  canvas.hidden = !show;
  if (!show || !b) return;
  map ??= createFloorMap3D(canvas);
  if (builtFor !== b) {
    floors = floorsOf(b);
    builtFor = b;
    seenShown = -1;
  }
  const W = b.plans[0]!.gen.W,
    seen = b.plans.reduce((sum, p) => sum + p.seen.reduce((s, v) => s + v, 0), 0);
  if (seen !== seenShown) {
    seenShown = seen;
    map.build(
      floors!,
      {
        tile: (floor, k) => {
          const p = b.plans[mapFloor(b, floor)]!;
          return p.seen[k] && p.gen.maps.grid[k] === 1 ? { color: b.biome.line, alpha: 1 } : null;
        },
        // a stairwell or lift shows once either of its ends has been seen
        link: l => {
          const seenAt = (s: typeof l.a) => b.plans[mapFloor(b, s.floor)]!.seen[s.j * W + s.i];
          if (!seenAt(l.a) && !seenAt(l.b)) return null;
          return l.kind === 'stairs' ? CSS_COLOR.lime : CSS_COLOR.violet;
        },
      },
      T,
    );
  }
  // the boss door, once it has been seen
  const markers: FloorMapMarker[] = [],
    last = b.plans[b.plans.length - 1]!;
  if (last.hall && last.seen[last.hall.door])
    markers.push({
      floor: 0,
      x: tileCenter(last.hall.door % W),
      z: tileCenter(Math.floor(last.hall.door / W)),
      color: CSS_COLOR.mag,
    });
  map.draw({
    floor: mapFloor(b, level.floor),
    viewer: { x: player.x, z: player.z, yaw: player.yaw },
    viewerColor: '#ffffff',
    markers,
  });
}
