// The fortress of M1's latter half (SB-1800): the box the walls make, its two gates and its yard. Every value here is
// provisional; it is level design, so it is not on a tune panel. The map (data/maps/m1b-hand.ts) places the walls from
// these numbers, and test/integration/fortress.test.ts checks the map against them.
export const FORTRESS_TUNE = {
  outerW: 70, // the box's width along x (m)
  outerD: 60, // the box's depth along z (m)
  wallH: 12, // a wall piece's height (m)
  wallT: 6, // a wall piece's thickness (m)
  seaGate: 12, // the sea-side gate's width (m)
  landGate: 12, // the land-side gate's width (m)
  yardW: 58, // the yard's clear width along x (m)
  yardD: 48, // the yard's clear depth along z (m)
  wallX: 32, // the left and right walls' middle (m)
  seaWallZ: -71, // the sea-side wall's middle (m)
  landWallZ: -125, // the land-side wall's middle (m)
  yardZ: -98, // the yard's middle (m)
} as const;

// The heavy machine-gun nest on the fortress's sea wall (SB-1830): it sweeps the open ground before the sea gate and
// keeps firing out to sea. Every value here is provisional and settled on #view-fortress's panel.
export const FORTRESS_GUN_TUNE = {
  range: 160, // the mech within this distance of the muzzle, on the ground (m), is in reach
  damage: 4, // what one shot takes off the mech's armour
  shots: 8, // how many shots one burst sweeps
  arcDeg: 60, // the swept arc, from -arcDeg/2 to +arcDeg/2 (deg)
  interval: 0.12, // the seconds between one shot and the next in a burst (s)
  rest: 2.5, // the seconds after a burst before the next (s)
  spread: 2, // each shot's drift from its aim (deg)
  bulletSpeed: 200, // m/s
  muzzle: 0.7, // the height a shot leaves at, as a share of the target's box top
  muzzleGap: 0.3, // how far in front of the box's seaward face a shot starts (m)
} as const;

// The depot detour (SB-1820): the leader asks after cp1, and the mech answers by walking down to the depot or on to the
// fortress. Every value is provisional and settled on #view-breach's panel.
export const DEPOT_CHOICE_TUNE = {
  askSec: 10, // seconds after cp1 before the leader asks (s)
  allyFallSec: 1.5, // seconds after the answer before the lost ally falls (s)
  lossAllies: 1, // the friends lost when the mech passes the depot
  lossSquads: 1, // the squads lost when the mech passes the depot
} as const;

// The fortress blast (SB-1860): the charge in the land wall's magazine, its countdown, the blast that brings the walls
// down and the hurt it does to a mech that stayed inside. Every value is provisional and settled on #view-breach's
// panel.
export const FORT_BLAST_TUNE = {
  countdownSec: 20, // from planting the charge to the blast (s)
  blastRadius: 30, // a blast this near hurts a mech; the sortie spares one that made the sea gate (m)
  damage: 120, // the armour the blast takes from a mech still inside (仮)
} as const;

// The yard's trap and the survivors' assist (SB-1840): three waves shut the mech in from the doors, and the cover mechs
// that lived through the first half shoot them down one at a time from the sea gate. Every value is provisional and
// settled on #view-breach's panel.
export const YARD_TUNE = {
  gate: { x: 0, z: -68 }, // the point above the sea gate the assist's tracers leave from (m)
  gateY: 3, // that point's height above the ground (m)
  assistEvery: 12, // seconds between two of the assist's shots when the depot was passed (s)
  assistEveryDepot: 8, // ... when the depot was broken, so the mech is not shut in as long (s)
  assistTracerSpeed: 80, // how fast the assist's tracer flies (m/s)
  assistDust: 1, // the multiplier on the dust of an enemy the assist brings down
  waveGapSec: 6, // seconds from yard-1 to yard-2 (s)
} as const;
