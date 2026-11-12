// The look plans for #view-mech. Which parts a plan picks makes its shape; this table holds the colours and the
// weapons' size. Every value here is provisional.
import { M1_MECH, type MechBuild } from '../../data/mech.ts';
import { M1_LOADOUT } from '../../data/weapons.ts';
import type { MechLook } from '../../view/mechModel.ts';

export const PATTERN_IDS = ['a', 'b', 'c', 'd'] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

export const PATTERN_LABELS: Record<PatternId, string> = {
  a: '重装ずんぐり',
  b: '逆関節の軽め',
  c: '武器を大きく',
  d: '四脚の戦車寄り',
};

const build = (parts: Omit<MechBuild, 'main' | 'sub'>): MechBuild => ({ ...parts, ...M1_LOADOUT });

export const PATTERNS: Record<PatternId, MechLook> = {
  a: {
    build: M1_MECH,
    weaponScale: 1,
    palette: { armor: 0x6f735c, frame: 0x3a3c36, accent: 0xc8a23a, sensor: 0xd8482a, weapon: 0x9a9a92 },
  },
  b: {
    build: build({ core: 'slim', arms: 'slimArms', legs: 'reverseLegs', back: 'boosters', fcs: 'visor' }),
    weaponScale: 0.8,
    palette: { armor: 0x7d8a96, frame: 0x3c4650, accent: 0x4fb4c8, sensor: 0xe8e060, weapon: 0x2c3238 },
  },
  c: {
    build: build({ core: 'bulky', arms: 'heavyArms', legs: 'stoutLegs', back: 'pods', fcs: 'blockHead' }),
    weaponScale: 1.7,
    palette: { armor: 0x6f735c, frame: 0x3a3c36, accent: 0xe8c33a, sensor: 0xd8482a, weapon: 0xe8782a },
  },
  d: {
    build: build({ core: 'low', arms: 'stubArms', legs: 'quadLegs', back: 'turret', fcs: 'sensorPod' }),
    weaponScale: 1.2,
    palette: { armor: 0x7a6a48, frame: 0x3a3228, accent: 0x9c3a2a, sensor: 0x5ad0a0, weapon: 0x55504a },
  },
};
