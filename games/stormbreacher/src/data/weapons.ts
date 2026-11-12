// The weapons' table (SB-140). Every value here is provisional and gets tuned by playing SB-140's second card. There is
// no heat (decided 2026-11-12): a weapon is limited by its ammo alone. The ids are the kinds of weapon; adding one is a
// line in WEAPONS, with no other code to change.
export type WeaponId = 'autocannon' | 'heavyGun';

export interface WeaponDef {
  damage: number; // the damage of one shot
  range: number; // how far a shot reaches (m)
  speed: number; // how fast a shot flies (m/s)
  interval: number; // the seconds between one shot and the next
  ammo: number; // the shots a sortie loads
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  autocannon: { damage: 10, range: 120, speed: 400, interval: 0.125, ammo: 200 }, // 8 shots a second
  heavyGun: { damage: 60, range: 180, speed: 250, interval: 1.2, ammo: 8 },
};

// M1's fixed pair (D-12): the main is the rapid autocannon, the sub is the single heavy gun. Provisional.
export const M1_LOADOUT: { main: WeaponId; sub: WeaponId } = { main: 'autocannon', sub: 'heavyGun' };
