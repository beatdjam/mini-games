// The mech's parts (SB-130's first card) and M1's look (its second card). Every value here is provisional and gets
// settled by the movement's third card. Boxes are ratios of the mech's height, the feet at y = 0, the front toward -z and the
// right toward +x. M1 is one fixed set with no swap screen (D-12).
import { M1_LOADOUT, type WeaponId } from './weapons.ts';

export type SlotId = 'arms' | 'legs' | 'back' | 'fcs';
export const SLOT_IDS: readonly SlotId[] = ['arms', 'legs', 'back', 'fcs'];

// the colour names a box asks for; the hex values belong to the look that draws it (M1_MECH_PALETTE, dev/mech/patterns.ts)
export const MECH_COLORS = ['armor', 'frame', 'accent', 'sensor', 'weapon'] as const;
export type MechColor = (typeof MECH_COLORS)[number];

export type Vec3 = readonly [number, number, number];

export interface MechBox {
  size: Vec3; // width, height, depth, as a ratio of the mech's height
  at: Vec3; // the box's centre, as a ratio of the mech's height (y is from the hip top; the legs' y is from the ground)
  color: MechColor;
  rotX?: number; // tilt about the x axis (rad); omitted is 0. Only the reverse-joint legs use it
  mirror?: 'x' | 'xz'; // 'x': also draw the box mirrored in x (two boxes); 'xz': mirrored in x and in z (four boxes)
}

export interface PartDef {
  weight: number; // provisional weight (t); the third card turns it into speed
  boxes: readonly MechBox[];
  hipY?: number; // legs only: the hip top's height, as a ratio of the mech's height
  mount?: Vec3; // arms: where the main weapon sits; back: where the sub weapon sits (ratio, from the hip top)
}

export type CoreId = 'bulky' | 'medium' | 'slim' | 'low';

export const CORES: Record<CoreId, PartDef> = {
  bulky: {
    weight: 3,
    boxes: [
      { size: [0.4, 0.09, 0.26], at: [0, 0.045, 0], color: 'frame' },
      { size: [0.36, 0.3, 0.28], at: [0, 0.24, 0], color: 'armor' },
    ],
  },
  medium: {
    // provisional: bulky made leaner (SB-130's second card)
    weight: 2.2,
    boxes: [
      { size: [0.32, 0.08, 0.22], at: [0, 0.04, 0], color: 'frame' },
      { size: [0.28, 0.28, 0.22], at: [0, 0.22, 0], color: 'armor' },
    ],
  },
  slim: {
    weight: 1.5,
    boxes: [
      { size: [0.28, 0.07, 0.18], at: [0, 0.035, 0], color: 'frame' },
      { size: [0.22, 0.26, 0.18], at: [0, 0.2, 0], color: 'armor' },
    ],
  },
  low: {
    weight: 3,
    boxes: [
      { size: [0.44, 0.07, 0.34], at: [0, 0.035, 0], color: 'frame' },
      { size: [0.38, 0.2, 0.34], at: [0, 0.17, 0], color: 'armor' },
    ],
  },
};

export const PART_IDS = {
  arms: ['heavyArms', 'midArms', 'slimArms', 'stubArms'],
  legs: ['stoutLegs', 'midLegs', 'longLegs', 'reverseLegs', 'quadLegs'],
  back: ['pack', 'boosters', 'pods', 'turret'],
  fcs: ['blockHead', 'visor', 'sensorPod'],
} as const;

export type PartIdOf<S extends SlotId> = (typeof PART_IDS)[S][number];

export const PARTS: { [S in SlotId]: Record<PartIdOf<S>, PartDef> } = {
  arms: {
    heavyArms: {
      weight: 4,
      mount: [0.255, 0.2, -0.16],
      boxes: [
        { size: [0.15, 0.3, 0.18], at: [0.255, 0.26, 0], color: 'armor', mirror: 'x' },
        { size: [0.19, 0.08, 0.22], at: [0.255, 0.44, 0], color: 'frame', mirror: 'x' },
      ],
    },
    midArms: {
      // provisional: heavyArms made leaner (SB-130's second card)
      weight: 3,
      mount: [0.2, 0.18, -0.12],
      boxes: [
        { size: [0.1, 0.3, 0.13], at: [0.2, 0.24, 0], color: 'armor', mirror: 'x' },
        { size: [0.13, 0.06, 0.15], at: [0.2, 0.42, 0], color: 'frame', mirror: 'x' },
      ],
    },
    slimArms: {
      weight: 2,
      mount: [0.145, 0.16, -0.1],
      boxes: [{ size: [0.07, 0.28, 0.09], at: [0.145, 0.22, 0], color: 'armor', mirror: 'x' }],
    },
    stubArms: {
      weight: 2.5,
      mount: [0.24, 0.12, -0.1],
      boxes: [{ size: [0.1, 0.18, 0.12], at: [0.24, 0.17, -0.02], color: 'armor', mirror: 'x' }],
    },
  },
  legs: {
    stoutLegs: {
      weight: 5,
      hipY: 0.4,
      boxes: [
        { size: [0.17, 0.33, 0.2], at: [0.13, 0.235, 0], color: 'armor', mirror: 'x' },
        { size: [0.2, 0.07, 0.3], at: [0.13, 0.035, -0.04], color: 'frame', mirror: 'x' },
      ],
    },
    midLegs: {
      // provisional: stoutLegs made leaner (SB-130's second card)
      weight: 4,
      hipY: 0.45,
      boxes: [
        { size: [0.12, 0.38, 0.15], at: [0.1, 0.26, 0], color: 'armor', mirror: 'x' },
        { size: [0.15, 0.06, 0.24], at: [0.1, 0.03, -0.03], color: 'frame', mirror: 'x' },
      ],
    },
    longLegs: {
      // provisional: midLegs made taller (SB-130's second card)
      weight: 3.5,
      hipY: 0.52,
      boxes: [
        { size: [0.1, 0.45, 0.13], at: [0.1, 0.295, 0], color: 'armor', mirror: 'x' },
        { size: [0.14, 0.06, 0.22], at: [0.1, 0.03, -0.03], color: 'frame', mirror: 'x' },
      ],
    },
    reverseLegs: {
      weight: 3,
      hipY: 0.5,
      boxes: [
        { size: [0.09, 0.27, 0.1], at: [0.09, 0.37, 0.06], color: 'armor', rotX: -0.46, mirror: 'x' },
        { size: [0.09, 0.27, 0.1], at: [0.09, 0.15, 0.04], color: 'armor', rotX: 0.63, mirror: 'x' },
        { size: [0.11, 0.04, 0.22], at: [0.09, 0.02, -0.06], color: 'frame', mirror: 'x' },
      ],
    },
    quadLegs: {
      weight: 7,
      hipY: 0.3,
      boxes: [
        { size: [0.09, 0.26, 0.09], at: [0.19, 0.17, 0.15], color: 'armor', mirror: 'xz' },
        { size: [0.14, 0.04, 0.16], at: [0.19, 0.02, 0.15], color: 'frame', mirror: 'xz' },
      ],
    },
  },
  back: {
    pack: {
      weight: 3,
      mount: [-0.2, 0.52, 0.06],
      boxes: [
        { size: [0.28, 0.26, 0.14], at: [0, 0.26, 0.21], color: 'frame' },
        { size: [0.08, 0.08, 0.1], at: [0.08, 0.1, 0.27], color: 'accent', mirror: 'x' },
      ],
    },
    boosters: {
      weight: 1,
      mount: [-0.07, 0.38, 0.1],
      boxes: [
        { size: [0.07, 0.3, 0.08], at: [0.07, 0.22, 0.14], color: 'frame', mirror: 'x' },
        { size: [0.05, 0.05, 0.06], at: [0.07, 0.05, 0.14], color: 'accent', mirror: 'x' },
      ],
    },
    pods: {
      weight: 4,
      mount: [0, 0.64, 0.06],
      boxes: [
        { size: [0.13, 0.22, 0.22], at: [0.2, 0.52, 0.08], color: 'frame', mirror: 'x' },
        { size: [0.1, 0.14, 0.02], at: [0.2, 0.52, -0.04], color: 'accent', mirror: 'x' },
      ],
    },
    turret: {
      weight: 5,
      mount: [0, 0.46, 0.04],
      boxes: [
        { size: [0.26, 0.06, 0.26], at: [0, 0.3, 0.04], color: 'frame' },
        { size: [0.22, 0.1, 0.24], at: [0, 0.38, 0.04], color: 'armor' },
      ],
    },
  },
  fcs: {
    blockHead: {
      weight: 1,
      boxes: [{ size: [0.16, 0.12, 0.14], at: [0, 0.45, -0.02], color: 'sensor' }],
    },
    visor: {
      weight: 0.5,
      boxes: [
        { size: [0.1, 0.09, 0.12], at: [0, 0.375, -0.01], color: 'frame' },
        { size: [0.08, 0.025, 0.02], at: [0, 0.38, -0.075], color: 'sensor' },
      ],
    },
    sensorPod: {
      weight: 1,
      boxes: [
        { size: [0.14, 0.1, 0.14], at: [0, 0.32, -0.14], color: 'sensor' },
        { size: [0.015, 0.2, 0.015], at: [0.15, 0.37, 0.1], color: 'frame' },
      ],
    },
  },
};

export interface MechBuild {
  core: CoreId;
  arms: PartIdOf<'arms'>;
  legs: PartIdOf<'legs'>;
  back: PartIdOf<'back'>;
  fcs: PartIdOf<'fcs'>;
  main: WeaponId;
  sub: WeaponId;
}

// M1's mech is pattern E of #view-mech: a medium 2-leg mech, pattern A made lean (decided 2026-11-12).
export const M1_MECH: MechBuild = {
  core: 'medium',
  arms: 'midArms',
  legs: 'midLegs',
  back: 'pack',
  fcs: 'blockHead',
  ...M1_LOADOUT,
};

// The colours M1's mech wears, one hex per colour name (provisional), and the scale of its weapons.
export const M1_MECH_PALETTE: Record<MechColor, number> = {
  armor: 0x6f735c,
  frame: 0x3a3c36,
  accent: 0xc8a23a,
  sensor: 0xd8482a,
  weapon: 0x9a9a92,
};
export const M1_WEAPON_SCALE = 1;

// The weapons' boxes, with the origin at the mount and the front toward -z.
export const WEAPON_LOOK: Record<WeaponId, readonly MechBox[]> = {
  autocannon: [
    { size: [0.08, 0.1, 0.34], at: [0, 0, -0.17], color: 'weapon' },
    { size: [0.04, 0.04, 0.3], at: [0, 0, -0.49], color: 'weapon' },
    { size: [0.08, 0.12, 0.1], at: [0, -0.1, -0.1], color: 'frame' },
  ],
  heavyGun: [
    { size: [0.14, 0.14, 0.2], at: [0, 0, 0.02], color: 'weapon' },
    { size: [0.08, 0.08, 0.62], at: [0, 0, -0.4], color: 'weapon' },
  ],
};
