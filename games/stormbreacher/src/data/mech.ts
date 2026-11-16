// The mech's parts (SB-130's first card) and M1's look (its second card). Every value here is provisional and gets
// settled by the movement's third card. Boxes are ratios of the mech's height, the feet at y = 0, the front toward -z and the
// right toward +x. M1 is one fixed set with no swap screen (D-12).
import { M1_LOADOUT, type WeaponId } from './weapons.ts';

export type SlotId = 'arms' | 'legs' | 'back' | 'fcs';
export const SLOT_IDS: readonly SlotId[] = ['arms', 'legs', 'back', 'fcs'];

// the colour names a box asks for; the hex values belong to the look that draws it (M1_MECH_PALETTE, dev/mech/patterns.ts).
// The band is the side's own mark on an ally (its shoulder band and number); M1 has no box that asks for it.
export const MECH_COLORS = ['armor', 'frame', 'accent', 'sensor', 'weapon', 'band'] as const;
export type MechColor = (typeof MECH_COLORS)[number];

export type Vec3 = readonly [number, number, number];

export interface MechBox {
  size: Vec3; // width, height, depth, as a ratio of the mech's height
  at: Vec3; // the box's centre, as a ratio of the mech's height (y is from the hip top; the legs' y is from the ground)
  color: MechColor;
  rotX?: number; // tilt about the x axis (rad); omitted is 0. Only the reverse-joint legs use it
  mirror?: 'x' | 'xz'; // 'x': also draw the box mirrored in x (two boxes); 'xz': mirrored in x and in z (four boxes)
}

// How a pair of legs moves (SB-130's third card): the heavy biped is the standard, the reverse-joint legs are fast and
// jump high, the multi legs are slow and low-jumping. The move values are LEG_MOVE_TUNE (tune.ts), the swing GAIT_LOOK.
export const GAIT_KINDS = ['biped', 'reverse', 'multi'] as const;
export type GaitKind = (typeof GAIT_KINDS)[number];

export interface PartDef {
  weight: number; // provisional weight (t); the third card turns it into speed
  boxes: readonly MechBox[];
  hipY?: number; // legs only: the hip top's height, as a ratio of the mech's height
  gait?: GaitKind; // legs only: how they move
  exhaust?: readonly Vec3[]; // back only: where the boost's flame leaves, facing back (ratio, from the hip top)
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
    // provisional: bulky made leaner (SB-130's second card). The plates, the waist and the neck are the M1's density
    // pass (SB-1460): the box stays the same box, but the chest reads as layers and the torso has a joint under it.
    weight: 2.2,
    boxes: [
      { size: [0.32, 0.08, 0.22], at: [0, 0.04, 0], color: 'frame' },
      { size: [0.28, 0.28, 0.22], at: [0, 0.22, 0], color: 'armor' },
      { size: [0.2, 0.05, 0.2], at: [0, 0.1, 0], color: 'frame' },
      { size: [0.24, 0.16, 0.035], at: [0, 0.25, -0.125], color: 'armor' },
      { size: [0.17, 0.1, 0.03], at: [0, 0.26, -0.152], color: 'armor' },
      { size: [0.09, 0.06, 0.09], at: [0, 0.39, 0], color: 'frame' },
      { size: [0.02, 0.05, 0.02], at: [0.125, 0.25, -0.12], color: 'accent', mirror: 'x' },
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
      // provisional: heavyArms made leaner (SB-130's second card). The shoulder drum, the stepped plate and the elbow
      // are SB-1460: the arm keeps its swing (the 'arm' limb), only its shape gains parts.
      weight: 3,
      mount: [0.2, 0.18, -0.12],
      boxes: [
        { size: [0.1, 0.3, 0.13], at: [0.2, 0.24, 0], color: 'armor', mirror: 'x' },
        { size: [0.13, 0.06, 0.15], at: [0.2, 0.42, 0], color: 'frame', mirror: 'x' },
        { size: [0.06, 0.07, 0.17], at: [0.2, 0.37, 0], color: 'frame', mirror: 'x' },
        { size: [0.035, 0.16, 0.1], at: [0.255, 0.26, 0], color: 'armor', mirror: 'x' },
        { size: [0.08, 0.05, 0.11], at: [0.2, 0.105, -0.01], color: 'frame', mirror: 'x' },
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
      gait: 'biped',
      boxes: [
        { size: [0.17, 0.33, 0.2], at: [0.13, 0.235, 0], color: 'armor', mirror: 'x' },
        { size: [0.2, 0.07, 0.3], at: [0.13, 0.035, -0.04], color: 'frame', mirror: 'x' },
      ],
    },
    midLegs: {
      // provisional: stoutLegs made leaner (SB-130's second card). The knee drum and the hydraulic rod are SB-1460; the
      // rod sits down the front of the shin so the leg reads as a machine from the side.
      weight: 4,
      hipY: 0.45,
      gait: 'biped',
      boxes: [
        { size: [0.12, 0.38, 0.15], at: [0.1, 0.26, 0], color: 'armor', mirror: 'x' },
        { size: [0.15, 0.06, 0.24], at: [0.1, 0.03, -0.03], color: 'frame', mirror: 'x' },
        { size: [0.1, 0.22, 0.035], at: [0.1, 0.27, -0.095], color: 'armor', mirror: 'x' },
        { size: [0.14, 0.06, 0.13], at: [0.1, 0.115, 0], color: 'frame', mirror: 'x' },
        { size: [0.025, 0.26, 0.025], at: [0.145, 0.25, -0.085], color: 'frame', mirror: 'x' },
        { size: [0.04, 0.12, 0.04], at: [0.145, 0.33, -0.085], color: 'frame', mirror: 'x' },
      ],
    },
    longLegs: {
      // provisional: midLegs made taller (SB-130's second card)
      weight: 3.5,
      hipY: 0.52,
      gait: 'biped',
      boxes: [
        { size: [0.1, 0.45, 0.13], at: [0.1, 0.295, 0], color: 'armor', mirror: 'x' },
        { size: [0.14, 0.06, 0.22], at: [0.1, 0.03, -0.03], color: 'frame', mirror: 'x' },
      ],
    },
    reverseLegs: {
      weight: 3,
      hipY: 0.5,
      gait: 'reverse',
      boxes: [
        { size: [0.09, 0.27, 0.1], at: [0.09, 0.37, 0.06], color: 'armor', rotX: -0.46, mirror: 'x' },
        { size: [0.09, 0.27, 0.1], at: [0.09, 0.15, 0.04], color: 'armor', rotX: 0.63, mirror: 'x' },
        { size: [0.11, 0.04, 0.22], at: [0.09, 0.02, -0.06], color: 'frame', mirror: 'x' },
      ],
    },
    quadLegs: {
      weight: 7,
      hipY: 0.3,
      gait: 'multi',
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
      exhaust: [
        [-0.08, 0.1, 0.32],
        [0.08, 0.1, 0.32],
      ],
      boxes: [
        { size: [0.28, 0.26, 0.14], at: [0, 0.26, 0.21], color: 'frame' },
        { size: [0.08, 0.08, 0.1], at: [0.08, 0.1, 0.27], color: 'accent', mirror: 'x' },
        // the box on top, the two stacks the flames leave by, and the hazard plate between them (SB-1460)
        { size: [0.22, 0.09, 0.11], at: [0, 0.43, 0.2], color: 'armor' },
        { size: [0.06, 0.17, 0.06], at: [0.15, 0.2, 0.24], color: 'frame', mirror: 'x' },
        { size: [0.16, 0.05, 0.02], at: [0, 0.34, 0.285], color: 'accent' },
      ],
    },
    boosters: {
      weight: 1,
      mount: [-0.07, 0.38, 0.1],
      exhaust: [
        [-0.07, 0.12, 0.18],
        [0.07, 0.12, 0.18],
      ],
      boxes: [
        { size: [0.07, 0.3, 0.08], at: [0.07, 0.22, 0.14], color: 'frame', mirror: 'x' },
        { size: [0.05, 0.05, 0.06], at: [0.07, 0.05, 0.14], color: 'accent', mirror: 'x' },
      ],
    },
    pods: {
      weight: 4,
      mount: [0, 0.64, 0.06],
      exhaust: [
        [-0.2, 0.52, 0.19],
        [0.2, 0.52, 0.19],
      ],
      boxes: [
        { size: [0.13, 0.22, 0.22], at: [0.2, 0.52, 0.08], color: 'frame', mirror: 'x' },
        { size: [0.1, 0.14, 0.02], at: [0.2, 0.52, -0.04], color: 'accent', mirror: 'x' },
      ],
    },
    turret: {
      weight: 5,
      mount: [0, 0.46, 0.04],
      exhaust: [[0, 0.34, 0.17]],
      boxes: [
        { size: [0.26, 0.06, 0.26], at: [0, 0.3, 0.04], color: 'frame' },
        { size: [0.22, 0.1, 0.24], at: [0, 0.38, 0.04], color: 'armor' },
      ],
    },
  },
  fcs: {
    blockHead: {
      weight: 1,
      // the sensor's window under a brow, a lamp at each side and one antenna (SB-1460): the head stays one box's size
      boxes: [
        { size: [0.16, 0.12, 0.14], at: [0, 0.45, -0.02], color: 'frame' },
        { size: [0.12, 0.045, 0.02], at: [0, 0.455, -0.095], color: 'sensor' },
        { size: [0.17, 0.025, 0.045], at: [0, 0.49, -0.085], color: 'frame' },
        { size: [0.02, 0.025, 0.03], at: [0.085, 0.44, -0.06], color: 'sensor', mirror: 'x' },
        { size: [0.012, 0.1, 0.012], at: [0.1, 0.5, 0.02], color: 'frame' },
      ],
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
  band: 0xc8a23a, // M1 has no band box; its accent's gold keeps the table complete
};
export const M1_WEAPON_SCALE = 1;

// The paint on a mech's boxes (SB-1460): one picture per colour name, drawn once from the seed and the counts here.
// The painter is view/mechSurfaces.ts and the strokes' colours are MECH_PAINT_COLOR (data/colors.ts). Every value is 仮.
export interface MechPaintDef {
  seed: number;
  grime: number; // the blotches of dirt
  grain: number; // the fine grain that keeps flat paint from reading as plastic
  scratches: number; // the worn edges and scrapes
}

export const MECH_PAINT: Record<MechColor, MechPaintDef> = {
  armor: { seed: 146041, grime: 34, grain: 20, scratches: 26 },
  frame: { seed: 146042, grime: 26, grain: 16, scratches: 18 },
  accent: { seed: 146043, grime: 8, grain: 10, scratches: 6 },
  sensor: { seed: 146044, grime: 4, grain: 6, scratches: 2 },
  weapon: { seed: 146045, grime: 20, grain: 14, scratches: 28 },
  // the band is painted like the accent (paintAccent), so its stripes stay as they were when it shared the accent's
  // colour: only the seed is read here; the grime, grain and scratches come from the accent's row, and turning these
  // in the #view-mech panel changes nothing (they are here to fill the record)
  band: { seed: 146043, grime: 8, grain: 10, scratches: 6 },
};

// The size of a painted picture and the markings on it: the number stencilled on the armour and the pitch of the
// warning stripes on the accent's plates (px in the picture). 仮, and the #view-mech panel turns the markings.
export const MECH_PAINT_TEX = {
  size: 128,
  stencil: '07',
  stencilSize: 22,
  stripePitch: 18,
};

// How far a gait swings the legs (provisional). Used by the view only; the speeds are LEG_MOVE_TUNE.
export interface GaitLook {
  stride: number; // the ground one swing cycle (both legs) covers, as a ratio of the mech's height
  swing: number; // the swing at full walking speed (rad)
  bend: number; // how far the legs tuck back in the air (rad)
}

export const GAIT_LOOK: Record<GaitKind, GaitLook> = {
  biped: { stride: 0.8, swing: 0.5, bend: 0.35 },
  reverse: { stride: 1, swing: 0.4, bend: 0.6 },
  multi: { stride: 0.6, swing: 0.3, bend: 0.15 },
};

// The weapons' boxes, with the origin at the mount and the front toward -z.
export const WEAPON_LOOK: Record<WeaponId, readonly MechBox[]> = {
  autocannon: [
    { size: [0.08, 0.1, 0.34], at: [0, 0, -0.17], color: 'weapon' },
    { size: [0.04, 0.04, 0.3], at: [0, 0, -0.49], color: 'weapon' },
    { size: [0.08, 0.12, 0.1], at: [0, -0.1, -0.1], color: 'frame' },
    // the muzzle brake, the magazine hung under the receiver and the sight on top (SB-1460)
    { size: [0.06, 0.06, 0.08], at: [0, 0, -0.66], color: 'weapon' },
    { size: [0.06, 0.13, 0.09], at: [0, -0.09, 0], color: 'frame' },
    { size: [0.03, 0.045, 0.05], at: [0, 0.08, -0.08], color: 'frame' },
  ],
  heavyGun: [
    { size: [0.14, 0.14, 0.2], at: [0, 0, 0.02], color: 'weapon' },
    { size: [0.08, 0.08, 0.62], at: [0, 0, -0.4], color: 'weapon' },
    // the breech behind the body and the sight above it (SB-1460)
    { size: [0.1, 0.1, 0.08], at: [0, 0, 0.15], color: 'frame' },
    { size: [0.03, 0.05, 0.05], at: [0, 0.1, -0.02], color: 'frame' },
  ],
};
