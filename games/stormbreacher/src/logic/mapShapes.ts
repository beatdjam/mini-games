// The rects the map's blocking things stand on. The walking check (mapCheck.ts) and the mech's collision both read
// these, so a map's breakthroughs are open in the check and in the walk alike.
import { PROP_SIZE, STAIRS_TUNE, STAIR_RISE, TARGET_SIZE } from '../data/props.ts';
import type { MapDef, Prop } from '../data/types.ts';
import type { GroundRect } from './collide.ts';

// The rects of one blocking prop: one for most, one per step for stairs. A flight climbs towards -z at yaw 0 (the lowest
// step on the +z side), and each step's top is STAIR_RISE higher than the one before. The prop's scale stretches it.
function propRects(prop: Prop): GroundRect[] {
  const size = PROP_SIZE[prop.kind];
  if (prop.kind !== 'stairs') {
    return [
      {
        x: prop.x,
        z: prop.z,
        halfW: (size.w * prop.scale) / 2,
        halfD: (size.d * prop.scale) / 2,
        yaw: prop.yaw,
        top: size.h * prop.scale,
      },
    ];
  }
  const run = STAIRS_TUNE.run * prop.scale;
  const rects: GroundRect[] = [];
  for (let i = 0; i < STAIRS_TUNE.steps; i++) {
    // the step's middle along the climb, turned by the yaw (the same sense as rectDistance)
    const along = ((STAIRS_TUNE.steps - 1) / 2 - i) * run;
    rects.push({
      x: prop.x + Math.sin(prop.yaw) * along,
      z: prop.z + Math.cos(prop.yaw) * along,
      halfW: (size.w * prop.scale) / 2,
      halfD: run / 2,
      yaw: prop.yaw,
      top: STAIR_RISE * (i + 1) * prop.scale,
    });
  }
  return rects;
}

// For each rect of the blocking props, in mapBlockers' order, the place in map.props of the prop it belongs to. A prop
// with steps appears once per step.
export function blockingPropIndexes(map: MapDef): number[] {
  const indexes: number[] = [];
  map.props.forEach((prop, index) => {
    if (!PROP_SIZE[prop.kind].blocks) return;
    for (let i = 0; i < propRects(prop).length; i++) indexes.push(index);
  });
  return indexes;
}

// Every blocking prop and every target, as a rect on the ground: the table's w and d with the prop's scale, turned by
// its yaw and topped at its height (stairs: one rect per step). Breakable props block too in the shape the map was
// made; game.ts takes a broken prop out of GameModel.rects.
export function mapBlockers(map: MapDef): GroundRect[] {
  const rects: GroundRect[] = [];
  for (const prop of map.props) {
    if (PROP_SIZE[prop.kind].blocks) rects.push(...propRects(prop));
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
