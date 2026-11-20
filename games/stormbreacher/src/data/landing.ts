// The landing's values (SB-120, SB-1640): where the mech stands on the craft when the sortie begins, where the infantry
// ride, and how the machine gun's tracers come in. The craft's sizes are in data/craft.ts.
import type { AllyKit } from './allies.ts';

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

// The crews aboard the craft the landing sinks (SB-1969), and how they are thrown clear. A place is on the craft's deck,
// x across the hull and z from the ramp's hinge toward the stern (m); `craftX` names the craft's `sink` event in
// CUTSCENES.landing. The counts, places and how far the blasts throw are provisional.
export interface DeckPlace {
  x: number; // across the deck (m)
  z: number; // from the ramp's hinge toward the stern (m)
  yaw: number; // 0 faces the bow (-z)
}

export interface SinkingCrewPlace {
  craftX: number; // the x of the craft in CUTSCENES.landing's `sink` events (m)
  crew: readonly DeckPlace[]; // the infantry standing on the deck
  ally?: DeckPlace; // the ally mech aboard, when this craft carries one
  allyKit?: AllyKit; // its type, as the allies' are assigned in data/allies.ts (the sniper's when unnamed)
}

export const SINKING_CREWS: readonly SinkingCrewPlace[] = [
  {
    craftX: -36,
    crew: [
      { x: -1.9, z: 1.1, yaw: 0 },
      { x: -0.8, z: 1.6, yaw: 0.15 },
      { x: 0.6, z: 1.2, yaw: -0.1 },
      { x: 1.9, z: 1.9, yaw: 0.1 },
      { x: -1.3, z: 2.8, yaw: 0 },
      { x: 1.2, z: 4.4, yaw: 0.05 },
    ],
  },
  {
    craftX: -48,
    crew: [
      { x: -2, z: 1.2, yaw: 0 },
      { x: -0.9, z: 1.3, yaw: 0.1 },
      { x: 0.4, z: 1.1, yaw: -0.1 },
      { x: 1.8, z: 1.2, yaw: 0 },
      { x: -1.6, z: 2.6, yaw: 0 },
      { x: 0.8, z: 2.9, yaw: 0.05 },
      { x: -0.4, z: 4.5, yaw: 0 },
    ],
  },
  {
    craftX: -24,
    crew: [
      { x: -2, z: 1, yaw: 0 },
      { x: -0.9, z: 1.2, yaw: 0.1 },
      { x: 0.3, z: 1, yaw: -0.1 },
      { x: 1.7, z: 1, yaw: 0 },
      { x: -1.7, z: 2.3, yaw: 0 },
      { x: -0.4, z: 2.8, yaw: 0.1 },
      { x: -0.5, z: 3.5, yaw: 0 },
      { x: 1.3, z: 4.4, yaw: 0.05 },
    ],
    ally: { x: 1, z: 2.3, yaw: 0 },
    allyKit: 'sniper',
  },
];

export const SINKING_CREW_TUNE = {
  blastRadius: 2.8, // a crew member this near the blast at the hull's middle is thrown clear (m)
  throwSide: 4.6, // the sideways speed a thrown crew member gets (m/s)
  throwUp: 4.2, // its upward speed (m/s)
  throwForward: -1.2, // and a little toward the bow (m/s)
  gravity: 14, // the pull that brings it down (m/s^2)
  tumble: 4.5, // how fast a thrown body turns over (rad/s)
  allySlide: 3, // how fast the ally mech slides across the deck (m/s)
  allySink: 4, // the downward pull on it once it is over the side (m/s^2)
  allyTip: 0.9, // how far it tips over as it slides (rad)
  allyTipSec: 0.9, // the seconds that tip takes (s)
} as const;
