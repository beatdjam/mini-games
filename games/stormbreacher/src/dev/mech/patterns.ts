// The look plans for #view-mech. Which parts a plan picks makes its shape; this table holds the colours and the
// weapons' size. E is M1's own look (data/mech.ts), A and F share its colours. Every value here is provisional.
import { M1_MECH, M1_MECH_PALETTE, M1_WEAPON_SCALE, type MechBuild } from '../../data/mech.ts';
import { M1_LOADOUT } from '../../data/weapons.ts';
import type { MechLook } from '../../view/mechModel.ts';

export const PATTERN_IDS = ['a', 'e', 'f', 'b', 'd'] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

export const PATTERN_LABELS: Record<PatternId, string> = {
  a: '重装ずんぐり',
  e: '中量（A を細く）',
  f: '中量・脚長',
  b: '逆関節の軽め',
  d: '四脚の戦車寄り',
};

const build = (parts: Omit<MechBuild, 'main' | 'sub'>): MechBuild => ({ ...parts, ...M1_LOADOUT });

export const PATTERNS: Record<PatternId, MechLook> = {
  a: {
    build: build({ core: 'bulky', arms: 'heavyArms', legs: 'stoutLegs', back: 'pack', fcs: 'blockHead' }),
    weaponScale: 1,
    palette: M1_MECH_PALETTE,
  },
  e: {
    build: M1_MECH,
    weaponScale: M1_WEAPON_SCALE,
    palette: M1_MECH_PALETTE,
  },
  f: {
    build: build({ core: 'medium', arms: 'midArms', legs: 'longLegs', back: 'boosters', fcs: 'visor' }),
    weaponScale: 1,
    palette: M1_MECH_PALETTE,
  },
  b: {
    build: build({ core: 'slim', arms: 'slimArms', legs: 'reverseLegs', back: 'boosters', fcs: 'visor' }),
    weaponScale: 0.8,
    palette: { armor: 0x7d8a96, frame: 0x3c4650, accent: 0x4fb4c8, sensor: 0xe8e060, weapon: 0x2c3238 },
  },
  d: {
    build: build({ core: 'low', arms: 'stubArms', legs: 'quadLegs', back: 'turret', fcs: 'sensorPod' }),
    weaponScale: 1.2,
    palette: { armor: 0x7a6a48, frame: 0x3a3228, accent: 0x9c3a2a, sensor: 0x5ad0a0, weapon: 0x55504a },
  },
};
