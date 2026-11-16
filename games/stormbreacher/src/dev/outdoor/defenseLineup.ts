// The defence works and a landing craft lined up on the start-up field, for #view-props and shots/defenses.shots.ts
// (SB-1470). The props are the map's own builders at their real sizes, so the detail can be judged against the hit box.
import * as THREE from 'three';
import { PROP_SIZE } from '../../data/props.ts';
import type { Prop } from '../../data/types.ts';
import { buildOutdoor } from '../../view/outdoor.ts';
import { buildCraft } from '../../view/shore.ts';

export interface DefenseLineupItem {
  name: string; // the object's name in the lineup and in the shot
  kind: 'hedgehog' | 'block' | 'lowWall' | 'bunker';
  x: number;
  z: number;
  yaw: number;
  scale: number;
}

export const DEFENSE_LINEUP: readonly DefenseLineupItem[] = [
  { name: 'hedgehog', kind: 'hedgehog', x: -22, z: 0, yaw: 0.4, scale: 1 },
  { name: 'block', kind: 'block', x: -10, z: 0, yaw: 0, scale: 1 },
  { name: 'lowWall', kind: 'lowWall', x: -1, z: 0, yaw: 0, scale: 1 },
  { name: 'bunker', kind: 'bunker', x: 11, z: 0, yaw: 0, scale: 1 },
];

// The craft is turned broadside, so the plate seams along its side and the windows of the wheelhouse face the camera.
export const CRAFT_LINEUP = { x: 25, z: 0, yaw: Math.PI / 2 } as const;

// Where a shot looks: the middle of each object, and the middle of the craft's broadside.
export const DEFENSE_SHOTS: readonly { name: string; look: readonly [number, number, number] }[] = [
  ...DEFENSE_LINEUP.map(item => ({
    name: `defenses-${item.name}`,
    look: [item.x, PROP_SIZE[item.kind].h / 2, item.z] as const,
  })),
  { name: 'defenses-craft', look: [CRAFT_LINEUP.x + 6, 1.8, CRAFT_LINEUP.z] as const },
];

// The whole lineup as one group with no place of its own: the field's ground is already under it.
export function buildDefenseLineup(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'defenseLineup';
  const items: Prop[] = DEFENSE_LINEUP.map(item => ({
    kind: item.kind,
    x: item.x,
    z: item.z,
    yaw: item.yaw,
    scale: item.scale,
  }));
  group.add(buildOutdoor(items, { chunk: 0, chunkMin: 0 }).group);
  const craft = buildCraft('propsCraft');
  craft.position.set(CRAFT_LINEUP.x, 0, CRAFT_LINEUP.z);
  craft.rotation.y = CRAFT_LINEUP.yaw;
  group.add(craft);
  return group;
}
