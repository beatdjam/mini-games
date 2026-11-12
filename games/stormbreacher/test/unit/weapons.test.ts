import { expect, test } from 'vitest';
import { M1_LOADOUT, WEAPONS } from '../../src/data/weapons.ts';
import { newWeapon, stepWeapon } from '../../src/logic/weapons.ts';

test('every weapon in the table has positive values', () => {
  for (const def of Object.values(WEAPONS)) {
    expect(def.damage).toBeGreaterThan(0);
    expect(def.range).toBeGreaterThan(0);
    expect(def.speed).toBeGreaterThan(0);
    expect(def.interval).toBeGreaterThan(0);
    expect(def.ammo).toBeGreaterThan(0);
  }
  expect(WEAPONS[M1_LOADOUT.main]).toBeDefined();
  expect(WEAPONS[M1_LOADOUT.sub]).toBeDefined();
});

test("holding the trigger fires at the weapon's interval", () => {
  const weapon = newWeapon('autocannon');
  let shots = 0;
  for (let i = 0; i < 60; i++) shots += stepWeapon(weapon, true, 1 / 60);
  expect(shots).toBe(1 / WEAPONS.autocannon.interval);
  expect(weapon.ammo).toBe(WEAPONS.autocannon.ammo - 8);
});

test('a long frame fires as many as a short ones would', () => {
  const weapon = newWeapon('autocannon');
  expect(stepWeapon(weapon, true, 0.5)).toBe(4);
});

test('an empty weapon does not fire', () => {
  const weapon = newWeapon('heavyGun');
  weapon.ammo = 0;
  expect(stepWeapon(weapon, true, 1.5)).toBe(0);
});

test('letting go keeps the next shot ready', () => {
  const weapon = newWeapon('heavyGun');
  expect(stepWeapon(weapon, true, 1 / 60)).toBe(1);
  expect(stepWeapon(weapon, false, WEAPONS.heavyGun.interval + 0.1)).toBe(0);
  expect(stepWeapon(weapon, true, 1 / 60)).toBe(1);
});
