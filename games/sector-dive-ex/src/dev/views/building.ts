import { isBossKind } from '../../core/rules.ts';
import { yawToward } from '@engine/core/util.ts';
import { SINK_FLOOR, T, W, floorY } from '@engine/world/tiles.ts';
import { BIOMES } from '../../data/biomes.ts';
import { building } from '../../world/building.ts';
import { lookOf, wallPic } from '../../world/looks.ts';
import { foodCourtRoom, mallRoomKinds } from '../../world/looks/mall/rooms.ts';
import { enemies, removeEnemyMesh } from '../../world/entities.ts';
import { player, run } from '../../actors/player.ts';
import { spawnBoss } from '../../actors/bosses/common.ts';
import { startRun, startStage } from '../../flow/run.ts';
import { setState, show } from '../../flow/state.ts';
import { update } from '../../flow/update.ts';
import { toggleMap3D } from '../../ui/hud.ts';
import { BOSS_VIEWS } from './boss.ts';
// dev view: #bld-<place> starts a run and stands at a place of the building, looking at it (for screenshots; ?pitch=
// to look up or down, ?yaw= to turn that much to the left):
// foot (below the first stairwell, looking up it), mid (half way up), top (above it, looking down), lift (next to
// the first lift on the top floor), liftlow (the same lift from the floor below), boss (in front of the boss door),
// lockdown (in the lockdown room, which shuts), hall (inside the boss room), map3d (the 3D map of the whole building),
// court / courttop / courtmid (the courtyard, from its ground and from its galleries; courtbridge, courtplaza: a galleria from the floor with its first bridge, from the level
// of its ground), courtalong (along a yard's
// balcony), window (two tiles in front of a window one sees out of, facing it: Look.outside), windowdown / windowup
// (right up at that window, looking down out of it / up out of it), yardwindow (in front of a window on a yard), ramp (two tiles to the side of the first ramp up
// to a deck, facing its side), walkway (on a raised walkway along an alley, at its start, looking along it),
// foodcourt (?sector=MALL: on the ground by the edge of the sunk food court, looking down into it), foodcourtin (the same
// room from its floor, looking across to the steps up), island (?sector=MALL: from two tiles west of the first island of cover in a
// big room, looking at it; ?kind=<n> for the first one in a shop of that kind), room (the first room that has a kind, from a
// corner of it looking across; ?kind=<n> for the first room of that kind: the hospital's wards, consulting rooms ...),
// hoist (HOIST in the boss room: ?pose=wide, drop or pull), surgeon (SURGEON in the boss room: ?pose=wide, scalpel,
// needle or clamp)
export function showBuildingPlace(hash: string) {
  setTimeout(() => {
    startRun();
    // ?sector=KWLN etc.: the building in that sector (otherwise the run's own first sector)
    const sector = BIOMES.findIndex(x => x.code === new URLSearchParams(location.search).get('sector'));
    if (sector >= 0) {
      run.route = [sector];
      run.bld = undefined;
      startStage();
    }
    const what = hash.slice(5),
      b = building!,
      // a building may have none: the stairs hooks do nothing then. ?last: the stairwell down to the lowest floor
      last = new URLSearchParams(location.search).has('last'),
      stairs = b.links.find(l => l.kind === 'stairs' && (!last || l.lower === b.plans.length - 1)),
      lift = b.links.find(l => l.kind === 'elevator'),
      step = stairs ? stairs.strip[1]! - stairs.strip[0]! : 1, // one tile up the stairs
      dirOf = (d: number): [number, number] => [Math.abs(d) === 1 ? d : 0, Math.abs(d) === 1 ? 0 : Math.sign(d)],
      // the floor tile next to tile k (for standing beside a lift or a door), and the step from it to k
      beside = (grid: Uint8Array, k: number): [number, number] => {
        const d = [1, -1, W, -W].find(o => grid[k + o] === 1)!;
        return [k + d, -d];
      },
      stand = (floor: number, tile: number, look: number) => {
        run.bld!.floor = floor;
        run.bld!.at = floor ? b.links.findIndex(l => l.upper === floor || l.lower === floor) : -1;
        startStage();
        enemies.slice().forEach(e => {
          e.dead = true;
          removeEnemyMesh(e);
        });
        player.x = ((tile % W) + 0.5) * T;
        player.z = (Math.floor(tile / W) + 0.5) * T;
        player.fy = floorY(player.x, player.z);
        const [dx, dz] = dirOf(look);
        player.yaw = yawToward(dx, dz);
        player.pitch = what === 'top' ? -0.35 : what === 'foot' ? 0.3 : 0;
      };
    if (what === 'foot' && stairs) stand(stairs.lower, stairs.strip[0]! - step, step);
    else if (what === 'mid' && stairs) stand(stairs.lower, stairs.strip[2]!, step);
    else if (what === 'top' && stairs) stand(stairs.upper, stairs.strip[stairs.strip.length - 1]! + step, -step);
    else if (what === 'lift' && lift) stand(lift.upper, ...beside(b.plans[lift.upper]!.gen.maps.grid, lift.a));
    else if (what === 'liftlow' && lift) stand(lift.lower, ...beside(b.plans[lift.lower]!.gen.maps.grid, lift.a));
    else if (what === 'map3d' || what === 'map3d-start') {
      // the big map on its 3D page: the whole building seen, or (map3d-start) only what a run has seen at its start
      if (what === 'map3d') b.plans.forEach(p => p.seen.fill(1));
      setState('play');
      toggleMap3D();
    } else if (what === 'lockdown' && b.lockdown) {
      const r = b.plans[b.lockdown.floor]!.gen.rooms[b.lockdown.room]!,
        mid = Math.floor(r.y + r.h / 2) * W + Math.floor(r.x + r.w / 2);
      stand(b.lockdown.floor, mid, 1);
      player.hp = 1e6;
    } else if (what === 'hall') {
      // inside the boss room, in a corner, looking up across it (its high ceiling)
      const last = b.plans.length - 1,
        r = b.plans[last]!.gen.rooms[b.plans[last]!.hall!.room]!;
      stand(last, (r.y + 1) * W + r.x + 1, W + 1);
      player.pitch = 0.45;
      run.bld!.supplied = true; // no supply screen over the view
      player.hp = 1e6;
    } else if (isBossKind(what) && BOSS_VIEWS[what]?.room) {
      // a boss with views of its own, in the building's boss room (?pose= picks one; see BOSS_VIEWS)
      const last = b.plans.length - 1,
        r = b.plans[last]!.gen.rooms[b.plans[last]!.hall!.room]!,
        view = BOSS_VIEWS[what];
      stand(last, (r.y + 1) * W + r.x + 1, W + 1);
      run.bld!.supplied = true;
      spawnBoss(what);
      const made = enemies.find(e => e.boss);
      if (made && view) view.show(made, new URLSearchParams(location.search).get('pose') ?? 'wide');
    } else if (what.startsWith('court') && b.court) {
      // the courtyard (?sector=CITY; ?court=open for a yard, ?court=roof for an atrium): court = from its lowest
      // floor, looking up; courttop = from its top floor, looking down; courtmid = from a floor between
      const c = b.court,
        floor =
          what === 'court'
            ? c.lower
            : what === 'courttop'
              ? c.upper
              : Math.min(c.upper + 1, Math.max(c.upper, c.lower - 1));
      if (c.open) {
        // a yard: on that floor's balcony, facing the yard
        const row = c.balconies[floor - c.upper]!,
          mid = row[1]!,
          out = [1, -1, W, -W].find(o => c.tiles.includes(mid + o))!;
        // (courtalong: from the balcony's end, along it)
        if (what === 'courtalong') stand(floor, row[0]!, mid - row[0]!);
        else stand(floor, mid, out);
        player.pitch = what === 'court' ? 0.3 : what === 'courttop' ? -0.3 : 0;
      } else if (c.w !== c.h) {
        // a galleria (a long atrium): from the gallery at one end of the hole, looking along it. court: on its ground,
        // looking up a little; courtplaza: on its ground, at the end of the hole, level; courtbridge: on the first floor with a bridge,
        // from the gallery by its end
        const step = c.h > c.w ? W : 1,
          end = c.h > c.w ? c.tiles[(c.w - 1) / 2]! - W : c.tiles[((c.h - 1) / 2) * c.w]! - 1,
          bridged = c.bridges.findIndex(row => row.length > 0);
        if (what === 'courtplaza') stand(c.lower, end + step, step);
        else stand(what === 'courtbridge' ? c.upper + Math.max(bridged, 0) : floor, end, step);
        player.pitch = what === 'court' ? 0.35 : what === 'courttop' ? -0.3 : 0;
      } else if (what === 'court') {
        stand(c.lower, c.tiles[1]!, W);
        player.pitch = 0.75;
      } else {
        stand(floor, c.tiles[1]! - W, W);
        player.pitch = -0.55;
      }
    } else if (what === 'yardwindow' && b.court?.open) {
      // a window one sees out of with the yard behind it (?court=open makes the courtyard a yard), floor by floor
      const look = lookOf(b.biome),
        c = b.court;
      for (let floor = c.upper; floor <= c.lower && look?.outside; floor++) {
        const d = b.plans[floor]!.gen,
          grid = d.maps.grid,
          seen = (k: number) =>
            !grid[k] &&
            !b.plans[floor]!.voids[k] &&
            !!look.outside!.panes[
              wallPic(d, k, { count: look.walls.length, laneWalls: look.laneWalls, sides: look.wallSides })
            ],
          k = grid.findIndex(
            (_, k) =>
              seen(k) &&
              [1, -1, W, -W].some(o => grid[k + o] === 1 && [1, 2, 3].some(t => c.tiles.includes(k - t * o))),
          );
        if (k < 0) continue;
        const o = [1, -1, W, -W].find(o => grid[k + o] === 1 && [1, 2, 3].some(t => c.tiles.includes(k - t * o)))!;
        stand(floor, k + o, -o);
        break;
      }
    } else if (what === 'yardcorner' && b.court?.open) {
      // in the corner of a room round the corner of the yard, with a window on it on each of the two walls, looking
      // into the corner between them
      const look = lookOf(b.biome),
        c = b.court;
      for (let floor = c.upper; floor <= c.lower && look?.outside; floor++) {
        const d = b.plans[floor]!.gen,
          grid = d.maps.grid,
          onYard = (k: number) =>
            !grid[k] &&
            !!look.outside!.panes[
              wallPic(d, k, { count: look.walls.length, laneWalls: look.laneWalls, sides: look.wallSides })
            ] &&
            [1, -1, W, -W].some(o => [1, 2, 3].some(t => c.tiles.includes(k + t * o))),
          corner = (f: number) =>
            [1, -1]
              .flatMap(di => [W, -W].map(dj => [di, dj] as const))
              .find(([di, dj]) => onYard(f + di) && onYard(f + dj)),
          f = grid.findIndex((v, f) => v === 1 && !!corner(f));
        if (f < 0) continue;
        const [di, dj] = corner(f)!;
        stand(floor, f, di);
        player.yaw = yawToward(di, Math.sign(dj));
        break;
      }
    } else if (what === 'window' || what === 'windowdown' || what === 'windowup') {
      // the first window seen through, floor by floor (from the bottom one up with ?low), with two floor tiles in
      // front of it
      const look = lookOf(b.biome),
        low = new URLSearchParams(location.search).has('low'),
        order = b.plans.map((_, m) => (low ? b.plans.length - 1 - m : m));
      for (const floor of order) {
        if (!look?.outside) break;
        const d = b.plans[floor]!.gen,
          grid = d.maps.grid,
          k = grid.findIndex(
            (v, k) =>
              !v &&
              !b.plans[floor]!.voids[k] &&
              !!look.outside!.panes[
                wallPic(d, k, { count: look.walls.length, laneWalls: look.laneWalls, sides: look.wallSides })
              ] &&
              [1, -1, W, -W].some(o => grid[k + o] === 1 && grid[k + 2 * o] === 1),
          );
        if (k < 0) continue;
        const o = [1, -1, W, -W].find(o => grid[k + o] === 1 && grid[k + 2 * o] === 1)!;
        stand(floor, k + 2 * o, -o);
        if (what !== 'window') {
          // half a metre from the window's face
          const [dx, dz] = dirOf(-o);
          player.x = ((k % W) + 0.5) * T - dx * (T / 2 + 0.5);
          player.z = (Math.floor(k / W) + 0.5) * T - dz * (T / 2 + 0.5);
          player.pitch = what === 'windowdown' ? -0.85 : 0.85;
        }
        break;
      }
    } else if (what === 'ramp') {
      // the first ramp on the ground up to a deck, floor by floor, with two flat floor tiles beside it
      for (let floor = 0; floor < b.plans.length; floor++) {
        const m = b.plans[floor]!.gen.maps,
          flat = (k: number) => m.grid[k] === 1 && m.ramp[k]! < 0 && m.hgt[k] === 0,
          // across the ramp: ±z for a ramp along x, ±x for one along z
          across = (k: number) => (m.ramp[k]! < 2 ? [W, -W] : [1, -1]),
          k = m.grid.findIndex(
            (v, k) =>
              v === 1 && m.ramp[k]! >= 0 && m.hgt[k] === 0 && across(k).some(o => flat(k + o) && flat(k + 2 * o)),
          );
        if (k < 0) continue;
        const o = across(k).find(o => flat(k + o) && flat(k + 2 * o))!;
        stand(floor, k + 2 * o, -o);
        break;
      }
    } else if (what === 'walkway') {
      // the first ramp up to a walkway (a raised run of an alley, not a deck in a room), floor by floor from the
      // bottom one up
      for (let floor = b.plans.length - 1; floor >= 0; floor--) {
        const m = b.plans[floor]!.gen.maps,
          stepOf = (k: number) => [1, -1, W, -W][m.ramp[k]!]!,
          k = m.grid.findIndex((v, k) => v === 1 && m.ramp[k]! >= 0 && m.roomOf[k]! < 0 && m.hgt[k + stepOf(k)]! > 0);
        if (k < 0) continue;
        stand(floor, k + stepOf(k), stepOf(k));
        break;
      }
    } else if (what === 'foodcourt' || what === 'foodcourtin') {
      // the first food court with a sunk floor, floor by floor, in the row at the middle of its west side: from the
      // ground by the west edge, looking east into it (foodcourtin: from the east end of the bottom, looking west)
      const rows = b.plans.flatMap((p, floor) => {
        const n = foodCourtRoom(p);
        if (n < 0) return [];
        const m = p.gen.maps,
          r = p.gen.rooms[n]!,
          j = r.y + Math.floor(r.h / 2),
          row = Array.from({ length: r.w }, (_, i) => j * W + r.x + i);
        return m.hgt[row[0]!] === 0 && row.some(k => m.hgt[k] === SINK_FLOOR) ? [{ floor, row, m }] : [];
      });
      const food = rows[0];
      if (food && what === 'foodcourt') {
        stand(food.floor, food.row[0]!, 1);
        player.pitch = -0.25;
      } else if (food) stand(food.floor, food.row.filter(k => food.m.hgt[k] === SINK_FLOOR).pop()!, -1);
    } else if (what === 'island') {
      // the first island of the mall (?kind=2: the first in a room of that kind of shop, the order of MALL_SHOP_NAMES), floor by floor, from
      // two tiles to its west, looking east at it
      const want = new URLSearchParams(location.search).get('kind');
      for (let floor = 0; floor < b.plans.length; floor++) {
        const p = b.plans[floor]!,
          kinds = mallRoomKinds(p),
          s = p.islands.find(s => want === null || kinds[p.gen.maps.roomOf[s.j * W + s.i]!] === Number(want));
        if (!s) continue;
        stand(floor, s.j * W + s.i - 2, 1);
        break;
      }
    } else if (what === 'room') {
      // the first room of a kind (?kind=2: the third kind of the sector's rooms, e.g. the hospital's examination room; none:
      // any room that has a kind), floor by floor, from a corner of it, looking across to the far corner
      const want = new URLSearchParams(location.search).get('kind'),
        look = lookOf(b.biome);
      for (let floor = 0; floor < b.plans.length; floor++) {
        const p = b.plans[floor]!,
          kinds = look?.roomKinds?.(p) ?? [],
          n = kinds.findIndex(
            (kind, room) => room !== p.hall?.room && (want === null ? kind >= 0 : kind === Number(want)),
          );
        if (n < 0) continue;
        const r = p.gen.rooms[n]!;
        let at = -1;
        for (let j = r.y; j < r.y + r.h && at < 0; j++)
          for (let i = r.x; i < r.x + r.w && at < 0; i++) {
            const k = j * W + i;
            if (p.gen.maps.grid[k] === 1 && !p.gen.maps.cover[k] && p.gen.maps.hgt[k] === 0) at = k;
          }
        if (at < 0) continue;
        stand(floor, at, 1);
        player.x = (r.x + 0.6) * T;
        player.z = (r.y + 0.6) * T;
        player.fy = floorY(player.x, player.z);
        player.yaw = yawToward(r.w - 1.2, r.h - 1.2);
        break;
      }
    } else if (what === 'boss') {
      const hall = b.plans[b.plans.length - 1]!.hall!,
        grid = b.plans[b.plans.length - 1]!.gen.maps.grid,
        roomOf = b.plans[b.plans.length - 1]!.gen.maps.roomOf,
        out = [1, -1, W, -W].find(o => grid[hall.door + o] === 1 && roomOf[hall.door + o] !== hall.room)!,
        // two tiles out from the door, or one where the corridor turns right outside it (two would be in the wall)
        two = hall.door + out * 2,
        at = grid[two] === 1 && roomOf[two] !== hall.room ? two : hall.door + out;
      stand(b.plans.length - 1, at, -out);
    }
    // (?pitch=0.3: look up or down that much instead)
    const pitch = new URLSearchParams(location.search).get('pitch'),
      yaw = new URLSearchParams(location.search).get('yaw');
    if (pitch) player.pitch = Number(pitch);
    if (yaw) player.yaw += Number(yaw);
    show(null);
    setState('play');
    for (let k = 0; k < 20; k++) update(1 / 60);
  }, 300);
}
