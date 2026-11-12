// The boss of M1, the coastal battery (SB-200): the machine guns of its main guns and the shutter that guards the
// magazine. Every value here is provisional. The secondary guns' barrage is in data/hazards.ts (BARRAGES.battery).

// The wave of the mission's script (data/missions/m1.ts) after which the battery fires at the mech.
export const BATTERY_WAVE = 'battery';

// The machine gun each main gun (a target of kind `gun`) fires at the mech while it stands.
export const GUN_TUNE = {
  range: 90, // the mech this near the gun, on the ground (m), is in reach
  interval: 1.2, // the seconds between one shot and the next
  damage: 3, // what one shot takes off the mech's armour
  bulletSpeed: 200, // m/s
  spread: 4, // the shot's drift from its aim (deg)
  muzzle: 0.7, // the height a shot leaves at, as a share of the gun's height
  muzzleGap: 0.3, // how far in front of the gun's box (toward the land) a shot starts (m)
};

// An armour plate in front of a target: its shots do the target no harm until every target in `opensWhen` is down.
export interface ShutterDef {
  target: string; // the id of the target the shutter guards
  opensWhen: readonly string[]; // the ids of the targets that open it, all down
  w: number; // the plate's width along x (m)
  h: number; // its height (m)
  d: number; // its thickness along z (m)
  gap: number; // how far it stands in front of the target's box, toward the sea (m)
}

export const M1_SHUTTERS: readonly ShutterDef[] = [
  { target: 'magazine', opensWhen: ['main-gun-1', 'main-gun-2'], w: 10, h: 8, d: 1.5, gap: 0.5 },
];
