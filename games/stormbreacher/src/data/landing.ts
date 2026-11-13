// The landing's values (SB-120, SB-1640): where the mech stands on the craft when the sortie begins, where the infantry
// ride, and how the machine gun's tracers come in. The craft's sizes are in data/craft.ts.
export const LANDING_TUNE = {
  startDepth: 2, // where the mech stands on the deck, past the ramp's hinge (m); 2.5 or less keeps the camera off the stern wall
  tracer: {
    fromZ: 150, // where a machine-gun tracer starts, landward of the boat (m)
    height: 2.4, // its height as it comes in (m)
    speed: 80, // how fast it flies (m/s)
    spread: 0.4, // how far apart two tracers of one burst are, across (m)
  },
} as const;

export interface RiderPlace {
  id: string;
  x: number; // the feet (m)
  z: number;
  yaw: number; // 0 faces the bow (-z)
}

// The infantry who ride in with the mech, on the deck's front half. Kept clear of the mech's start (0, 177) and of the
// wheelhouse (z 182.5 and aft), and of the camera behind the mech. r2 and r3 stand 2.5 m or more from the mech.
export const LANDING_RIDERS: readonly RiderPlace[] = [
  { id: 'r1', x: -2.5, z: 176.5, yaw: 0 },
  { id: 'r2', x: -2.05, z: 175.5, yaw: 0 },
  { id: 'r3', x: 2.05, z: 175.5, yaw: 0 },
  { id: 'r4', x: 2.5, z: 176.5, yaw: 0 },
  { id: 'r5', x: -2.4, z: 177.5, yaw: 0 },
  { id: 'r6', x: 2.4, z: 177.5, yaw: 0 },
];
