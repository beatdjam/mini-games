// The air over the beach (SB-1440): where the smoke columns stand, how the wind leans them, how thick the low haze is,
// which wrecks burn and how the screen is graded. view/atmosphere.ts draws them. The places are written here rather than
// taken from the map so the same list can hold both a wreck and a shell hole; they match M1's hand map (data/maps).
// Values are provisional and are settled by eye in #view-map's panel. Colours live in data/colors.ts.

export interface PlumePlace {
  x: number; // where the column's puffs start (m)
  z: number;
  y: number; // the height the puffs start at (the top of the wreck or the sand) (m)
  kind: 'wreck' | 'crater'; // the thing it rises from, for reading the table
}

// Ten columns for the beach and the two defence lines, from the wrecks and the shell holes already on the map.
export const ATMOSPHERE_PLUMES: readonly PlumePlace[] = [
  { x: -45, z: 116, y: 3.1, kind: 'wreck' },
  { x: 30, z: 110, y: 3, kind: 'wreck' },
  { x: 0, z: 122, y: 0.4, kind: 'crater' },
  { x: -40, z: 55, y: 0.4, kind: 'crater' },
  { x: 0, z: 62, y: 3, kind: 'wreck' },
  { x: 45, z: 70, y: 3.5, kind: 'wreck' },
  { x: 60, z: 62, y: 0.4, kind: 'crater' },
  { x: -15, z: -5, y: 3.4, kind: 'wreck' },
  { x: -88, z: -100, y: 3.5, kind: 'wreck' },
  { x: 78, z: -102, y: 3.2, kind: 'wreck' },
  { x: 15, z: -114, y: 3.2, kind: 'wreck' },
  { x: 65, z: -2, y: 0.4, kind: 'crater' },
];

// The wrecks that burn: the flames and their glow stand on these, and their smoke comes from the same places in
// ATMOSPHERE_PLUMES, so one fire does not make two columns.
export const ATMOSPHERE_FIRES: readonly { x: number; z: number; y: number }[] = [
  { x: -45, z: 116, y: 2.3 },
  { x: 30, z: 110, y: 2.2 },
  { x: 0, z: 62, y: 2.2 },
  { x: 45, z: 70, y: 2.6 },
  { x: -15, z: -5, y: 2.5 },
];

// The light a built map puts over the field (SB-1440). The base table in data/looks.ts keeps the field's starting
// strengths; these are the beach's: less fill from the sky and a stronger, lower sun, so a box has a lit and a dark side.
// Colours and the sun's direction come from data/colors.ts and data/looks.ts.
export const ATMOSPHERE_LIGHT = {
  hemi: 1.5, // the hemisphere light's strength (the sky's fill)
  sun: 1.9, // the directional light's strength (the low sun)
} as const;

// The values the panel turns. Counts and rates are read every frame, so a slider takes effect at once; the sizes of the
// instanced pools are fixed when the map is built (columns, flames and sheets have generous room).
export const ATMOSPHERE_TUNE = {
  // the drifting columns (1)
  columns: 10, // how many of ATMOSPHERE_PLUMES keep a column (0 draws none; 8-12 is the aim)
  columnEvery: 0.45, // how often one column gives a puff (s)
  rise: 1.8, // how fast a puff climbs (m/s)
  windX: 1.3, // the wind's drift along x (m/s)
  windZ: -0.4, // ... and along z
  plumeSize: 3, // a fresh puff's size (m)
  plumeGrow: 1.7, // how much bigger it gets by the end (times the size)
  plumeLife: 11, // how long a puff lives (s)
  plumeOpacity: 0.42, // the puffs' opacity (0 draws none)
  plumeCap: 280, // the most puffs on screen at once

  // the low haze (2)
  hazeSheets: 6, // the soft sheets lying across the map (0 draws none)
  hazeOpacity: 0.11, // one sheet's opacity, so several can overlap
  hazeWidth: 150, // a sheet's width (m)
  hazeHeight: 7, // its height (m): the band it covers is mostly the lowest 3 m
  hazeY: 2.2, // the middle of its height above the ground (m)
  hazeDrift: 1, // how fast the sheets wander along x (m/s)

  // the burning wrecks (3)
  fires: 5, // how many of ATMOSPHERE_FIRES burn (0 draws none)
  burnFires: 6, // how many props broken in play may add their own fire
  flameEvery: 0.08, // how often one fire throws a flame (s)
  flameRise: 1.5, // how fast a flame climbs (m/s)
  flameSize: 1.7, // a flame's size when it appears (m)
  flameLife: 0.55, // how long it lives (s)
  flameCap: 220, // the most flames on screen at once
  flameFlicker: 0.35, // how much the flames' size dances (share of the size)
  glowSize: 9, // the warm pool on the ground round a fire (m)
  glowOpacity: 0.3, // its opacity (0 draws none)
  burnSmokeEvery: 0.5, // how often a fire broken in play gives a puff (s)

  // the screen (5)
  grade: 0.6, // how strongly the canvas is graded (0 leaves the colours alone)
  vignette: 0.5, // the dark edge (0 draws none)
  grain: 0.35, // the film grain (0 draws none)
};

export type AtmosphereTune = typeof ATMOSPHERE_TUNE;
