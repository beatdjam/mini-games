// The rects the map's blocking things stand on. The walking check (mapCheck.ts) and the mech's collision both read
// these, so a map's breakthroughs are open in the check and in the walk alike.
import { PROP_SIZE, TARGET_SIZE } from '../data/props.ts';
import type { MapDef } from '../data/types.ts';
import type { GroundRect } from './collide.ts';

// Every blocking prop and every target, as a rect on the ground: the table's w and d with the prop's scale, turned by
// its yaw and topped at its height. Breakable props block too until G1 adds breaking.
export function mapBlockers(map: MapDef): GroundRect[] {
  const rects: GroundRect[] = [];
  for (const prop of map.props) {
    const size = PROP_SIZE[prop.kind];
    if (!size.blocks) continue;
    rects.push({
      x: prop.x,
      z: prop.z,
      halfW: (size.w * prop.scale) / 2,
      halfD: (size.d * prop.scale) / 2,
      yaw: prop.yaw,
      top: size.h * prop.scale,
    });
  }
  for (const target of map.targets) {
    const size = TARGET_SIZE[target.kind];
    rects.push({
      x: target.x,
      z: target.z,
      halfW: size.w / 2,
      halfD: size.d / 2,
      yaw: target.yaw,
      top: size.h,
    });
  }
  return rects;
}
