// The allied mech of the mission script (SB-170, 仮): the ones that run beside the player's mech and fall on the way.
// The ways they run and the places they fall at are in the mission (data/missions/m1.ts); the colours are in colors.ts.
import type { MechBox, MechBuild } from './mech.ts';
import type { AllyFateBy } from './types.ts';
import { M1_LOADOUT } from './weapons.ts';

export const ALLY_TUNE = {
  speed: 9, // how fast it runs along its way (m/s)
  arrive: 1.5, // it counts as at a place this near (m)
  height: 3.4, // its height (m); the player's mech is MECH_TUNE.height
  fireEvery: 0.35, // seconds between two of its tracers (s)
  fireHeight: 2.2, // the height a tracer leaves from above the feet (m)
  fireAhead: 1.6, // how far ahead of the feet a tracer starts (m)
  tracerSpeed: 80, // how fast the tracer flies (m/s)
  tracerSpread: 6, // how far a tracer's aim is scattered sideways and up when no enemy is near (m/s of its velocity)
  engageRange: 70, // how far an ally looks for an enemy to shoot at (m)
  aimSpreadDeg: 1.5, // how far an ally's tracer is scattered around its aim (deg)
  enemyTracerEvery: 2.5, // seconds between one enemy's tracers at an ally (s)
  enemyTracerRange: 80, // how far an enemy looks for an ally to shoot at (m)
  enemyTracerSpreadDeg: 2, // how far an enemy's tracer is scattered around its aim (deg)
  wreckTilt: 1.35, // how far the wreck lies over (rad)
  callLead: 4, // it calls on the radio this many seconds before its fate's place (s)
  groundRadius: 0.5, // the radius of its feet handed to groundAt (m)
  maxGround: 6.5, // the highest ground it may step up onto (m); the seawall is 6 m
  fallSpeed: 20, // how fast it drops when the ground below it is lower (m/s)
};

// The ways an ally may fall (`fate.by` of the script's `ally` action).
export const ALLY_FATES: readonly AllyFateBy[] = ['mortar', 'gun'];

// The ally is the same army's mech as M1, but a lighter type: a slim core and long legs under the pods that carry its
// radio, with its head set forward and an antenna up (its type is told from M1's medium build at a distance).
export const ALLY_MECH: MechBuild = {
  core: 'slim',
  arms: 'slimArms',
  legs: 'longLegs',
  back: 'pods',
  fcs: 'sensorPod',
  ...M1_LOADOUT,
};
export const ALLY_WEAPON_SCALE = 0.9; // its weapons are smaller than M1's, as its frame is

// The boxes that give the ally its own shape: shoulder plates over its thin arms, the identification band and number on
// them, and the radio's antenna and set on its back. Lengths are ratios of the mech's height, as data/mech.ts says.
// The wreck keeps the same table, only knocked askew (or torn off), so its shape stays the same in the other palette.
export const ALLY_DETAIL = {
  shoulder: { x: 0.19, y: 0.34, z: 0, width: 0.16, height: 0.09, depth: 0.24 }, // the plate over each arm
  band: { y: 0.345, z: -0.125, width: 0.15, height: 0.028, depth: 0.012 }, // the band across the plate's front
  number: { x: 0.272, y: 0.34, z: 0, width: 0.01, height: 0.05, depth: 0.06 }, // the number's plate on the outer face
  tick: { x: 0.279, y: 0.34, z: -0.015, width: 0.008, height: 0.032, depth: 0.012 }, // the number itself, at a distance
  antenna: { x: 0.085, y: 0.4, z: 0.105, width: 0.014, height: 0.22, depth: 0.014 },
  antennaBase: { x: 0.085, y: 0.3, z: 0.105, width: 0.05, height: 0.04, depth: 0.05 },
  radio: { x: 0, y: 0.29, z: 0.12, width: 0.11, height: 0.13, depth: 0.06 }, // the set on the back
  vent: { x: 0.055, y: 0.2, z: -0.094, width: 0.032, height: 0.1, depth: 0.014 }, // a grille on the chest
  wreck: {
    shoulderDrop: 0.045, // how far a plate slides down when the mech falls (ratio)
    shoulderLean: 0.5, // how far a plate tilts (rad)
    antennaLean: 0.8, // how far the antenna bends back (rad)
    radioDrop: 0.02,
    radioShift: 0.03, // how far the set slides back
    radioLean: 0.3,
  },
};

export type AllyShape = 'run' | 'wreck';

// The ally's extra boxes for the shape asked for. The numbers are read here, not when the table is made, so the dev
// panel's changes reach the next model the view builds.
export function allyDetailBoxes(shape: AllyShape): readonly MechBox[] {
  const d = ALLY_DETAIL;
  const wreck = shape === 'wreck';
  const shoulderY = d.shoulder.y - (wreck ? d.wreck.shoulderDrop : 0);
  const shoulderTurn = wreck ? d.wreck.shoulderLean : 0;
  const boxes: MechBox[] = [
    {
      size: [d.shoulder.width, d.shoulder.height, d.shoulder.depth],
      at: [d.shoulder.x, shoulderY, d.shoulder.z],
      color: 'armor',
      rotX: shoulderTurn,
      mirror: 'x',
    },
    {
      size: [d.antennaBase.width, d.antennaBase.height, d.antennaBase.depth],
      at: [d.antennaBase.x, d.antennaBase.y, d.antennaBase.z],
      color: 'frame',
    },
    {
      size: [d.antenna.width, d.antenna.height, d.antenna.depth],
      at: [d.antenna.x, d.antenna.y, d.antenna.z],
      color: 'frame',
      rotX: wreck ? d.wreck.antennaLean : 0,
    },
    {
      size: [d.radio.width, d.radio.height, d.radio.depth],
      at: [d.radio.x, d.radio.y - (wreck ? d.wreck.radioDrop : 0), d.radio.z + (wreck ? d.wreck.radioShift : 0)],
      color: 'frame',
      rotX: wreck ? d.wreck.radioLean : 0,
    },
    {
      size: [d.vent.width, d.vent.height, d.vent.depth],
      at: [d.vent.x, d.vent.y, d.vent.z],
      color: 'frame',
      mirror: 'x',
    },
  ];
  if (wreck) {
    // one band is torn off; the other hangs on the plate it was painted across
    boxes.push({
      size: [d.band.width, d.band.height, d.band.depth],
      at: [d.shoulder.x, shoulderY + (d.band.y - d.shoulder.y), d.band.z],
      color: 'band',
      rotX: shoulderTurn,
    });
  } else {
    boxes.push(
      {
        size: [d.band.width, d.band.height, d.band.depth],
        at: [d.shoulder.x, d.band.y, d.band.z],
        color: 'band',
        mirror: 'x',
      },
      {
        size: [d.number.width, d.number.height, d.number.depth],
        at: [d.number.x, d.number.y, d.number.z],
        color: 'frame',
        mirror: 'x',
      },
      {
        size: [d.tick.width, d.tick.height, d.tick.depth],
        at: [d.tick.x, d.tick.y, d.tick.z],
        color: 'band',
        mirror: 'x',
      },
    );
  }
  return boxes;
}

// The allies' support fire made visible (SB-2024). While a `suppress` window runs, tracers fly at the silenced nests
// from the nearest ally, or from out at sea when none is in range, with a spark and dust where they land; a puff of
// smoke sits over each silenced nest. Only a look: the nests' quiet is the `suppress` action's own seconds. The values
// are provisional.
export const COVER_TUNE = {
  fireEvery: 0.1, // seconds between one tracer and the next, taken nest by nest in turn (s)
  allyRange: 110, // an ally within this many metres of the nest fires from where it stands (m)
  seaDist: 70, // otherwise the tracer comes from this far seaward (+z) of the nest (m)
  seaLanes: 3, // the sea tracers come from this many places across: left, middle and right of the nest
  seaSpread: 25, // and from this far to either side (m)
  fromHeight: 2.2, // the height a tracer leaves from over the ground (m)
  hitHeight: 0.6, // the fraction of the nest's height a tracer lands at (0-1)
  speed: 150, // how fast the tracer flies (m/s)
  smokeSize: 1.9, // the smoke over a silenced nest (m)
  smokeLift: 2.6, // how far above the nest's feet the smoke floats (m)
  warnBefore: 2, // the radio line that the rounds run short comes this many seconds before the window ends (s)
  endLine: 'm1.line2-ammo', // its language key
  endCallout: 'm1.callout.line2-ammo', // the short order near the aim that goes with it (SB-2028)
};
