// The allied mech of the mission script (SB-170, 仮): the one that runs beside the player's mech and falls on the beach.
// The ways it runs and the places it falls at are in the mission (data/missions/m1.ts); the colours are in colors.ts.
export const ALLY_TUNE = {
  speed: 9, // how fast it runs along its way (m/s)
  arrive: 1.5, // it counts as at a place this near (m)
  height: 3.4, // its height (m); the player's mech is MECH_TUNE.height
  fireEvery: 0.35, // seconds between two of its tracers (s)
  fireHeight: 2.2, // the height a tracer leaves from above the feet (m)
  fireAhead: 1.6, // how far ahead of the feet a tracer starts (m)
  tracerSpeed: 80, // how fast the tracer flies (m/s)
  tracerSpread: 6, // how far a tracer's aim is scattered sideways and up (m/s of its velocity)
  wreckTilt: 1.35, // how far the wreck lies over (rad)
};

// The ways an ally may fall (`fate.by` of the script's `ally` action).
export const ALLY_FATES: readonly string[] = ['mortar'];
