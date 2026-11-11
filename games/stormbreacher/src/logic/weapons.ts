// One weapon's ammo and its wait for the next shot, as pure functions over a state. The values come from the game's
// table (data/weapons.ts), the timing from the frame; nothing here reads three or the DOM.
import { WEAPONS, type WeaponId } from '../data/weapons.ts';

export interface WeaponState {
  id: WeaponId;
  ammo: number; // the shots left
  wait: number; // the time left before the next shot (s)
}

// A weapon as a sortie loads it: the table's ammo and no wait before the first shot.
export function newWeapon(id: WeaponId): WeaponState {
  return { id, ammo: WEAPONS[id].ammo, wait: 0 };
}

// Advances one weapon by `dt`: the wait loses the frame, and while `held` and the weapon is ready it fires, taking a
// shot and adding the interval to the wait. The wait's overflow carries, so a long frame fires as often as short ones
// would. Returns the shots fired this frame. With the trigger up the wait stops at 0, so the next shot is ready at once.
export function stepWeapon(weapon: WeaponState, held: boolean, dt: number): number {
  const def = WEAPONS[weapon.id];
  weapon.wait -= dt;
  if (!held) {
    if (weapon.wait < 0) weapon.wait = 0;
    return 0;
  }
  let shots = 0;
  while (weapon.wait < 0 && weapon.ammo > 0) {
    weapon.ammo -= 1;
    weapon.wait += def.interval;
    shots += 1;
  }
  return shots;
}
