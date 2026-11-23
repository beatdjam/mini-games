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

// The depot detour (SB-1820): the leader asks after cp1, and the mech answers by walking down to the depot or on to the
// fortress. Every value is provisional and settled on #view-breach's panel.
export const DEPOT_CHOICE_TUNE = {
  askSec: 10, // seconds after cp1 before the leader asks (s)
  allyFallSec: 1.5, // seconds after the answer before the lost ally falls (s)
  lossAllies: 1, // the friends lost when the mech passes the depot
  lossSquads: 1, // the squads lost when the mech passes the depot
} as const;
