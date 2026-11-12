import { expect, test } from 'vitest';
import {
  CORES,
  MECH_COLORS,
  M1_MECH,
  PART_IDS,
  PARTS,
  SLOT_IDS,
  WEAPON_LOOK,
  type PartDef,
} from '../../src/data/mech.ts';
import { M1_LOADOUT, WEAPONS } from '../../src/data/weapons.ts';
import { PATTERN_IDS, PATTERNS } from '../../src/dev/mech/patterns.ts';

const allParts = (): PartDef[] => [...Object.values(CORES), ...SLOT_IDS.flatMap(slot => Object.values(PARTS[slot]))];

test('every part has a positive weight and boxes with positive sizes', () => {
  for (const part of allParts()) {
    expect(part.weight).toBeGreaterThan(0);
    expect(part.boxes.length).toBeGreaterThan(0);
    for (const box of part.boxes) for (const size of box.size) expect(size).toBeGreaterThan(0);
  }
});

test("each slot's table has exactly the ids PART_IDS lists", () => {
  for (const slot of SLOT_IDS) expect(Object.keys(PARTS[slot]).sort()).toEqual([...PART_IDS[slot]].sort());
});

test('legs have a hip height, arms and back parts have a mount', () => {
  for (const id of PART_IDS.legs) {
    const hipY = PARTS.legs[id].hipY;
    expect(hipY).toBeGreaterThan(0);
    expect(hipY).toBeLessThanOrEqual(1);
  }
  for (const id of PART_IDS.arms) expect(PARTS.arms[id].mount).toBeDefined();
  for (const id of PART_IDS.back) expect(PARTS.back[id].mount).toBeDefined();
});

test('M1_MECH picks existing parts and takes its weapons from M1_LOADOUT', () => {
  expect(Object.keys(CORES)).toContain(M1_MECH.core);
  expect(PART_IDS.arms).toContain(M1_MECH.arms);
  expect(PART_IDS.legs).toContain(M1_MECH.legs);
  expect(PART_IDS.back).toContain(M1_MECH.back);
  expect(PART_IDS.fcs).toContain(M1_MECH.fcs);
  expect([M1_MECH.main, M1_MECH.sub]).toEqual([M1_LOADOUT.main, M1_LOADOUT.sub]);
});

test('every weapon has a look', () => {
  expect(Object.keys(WEAPON_LOOK).sort()).toEqual(Object.keys(WEAPONS).sort());
  for (const boxes of Object.values(WEAPON_LOOK))
    for (const box of boxes) for (const size of box.size) expect(size).toBeGreaterThan(0);
});

test('the medium mech stands taller than the bulky one at the hip', () => {
  expect(PARTS.legs.midLegs.hipY).toBeGreaterThan(PARTS.legs.stoutLegs.hipY!);
  expect(PARTS.legs.longLegs.hipY).toBeGreaterThan(PARTS.legs.stoutLegs.hipY!);
});

test('every pattern uses existing parts and a full palette', () => {
  for (const id of PATTERN_IDS) {
    const pattern = PATTERNS[id];
    expect(Object.keys(CORES)).toContain(pattern.build.core);
    expect(PART_IDS.arms).toContain(pattern.build.arms);
    expect(PART_IDS.legs).toContain(pattern.build.legs);
    expect(PART_IDS.back).toContain(pattern.build.back);
    expect(PART_IDS.fcs).toContain(pattern.build.fcs);
    expect(Object.keys(pattern.palette).sort()).toEqual([...MECH_COLORS].sort());
    expect(pattern.weaponScale).toBeGreaterThan(0);
  }
  expect(PATTERNS.a.build).toEqual(M1_MECH);
});
