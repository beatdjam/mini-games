// The surfaces the beach is drawn with (SB-1360): one picture per kind of matter and the numbers to paint it with.
// Values are provisional; the user looks at the shots and decides. The colours are named in data/colors.ts. Pictures
// are painted once (view/surfaces.ts) and kept, never per frame.
//
// `repeat` is how many times a picture covers one face of a box (props) or the sea's plane; the sand is different: its
// `repeatM` is how many metres one repeat of the picture covers in the world, so the ground's tiles leave no seam.

export interface SurfaceDef {
  seed: number; // the picture is the same every time
  size: number; // canvas side (px)
  repeat: [number, number]; // repeats across a face or the sea's plane
}

export const SAND_SURFACE = {
  seed: 1360,
  size: 512,
  repeat: [1, 1] as [number, number],
  repeatM: 12, // m one repeat covers on the ground
  grain: 26, // fine grain (0..255 of noise)
  grime: 150, // speckles and blotches
  mottle: 70, // soft patches that run on into the next repeat
  tracks: 30, // soft ruts and footprints
  wetBand: 15, // m from the sea's edge where the sand is still wet
  wetRows: 120, // rows the ground is split into, so the wet band can fade
};

// Concrete: gun emplacements, bunkers, walls and stairs. Drips run down from the top of a face.
export const CONCRETE_SURFACE: SurfaceDef & {
  grain: number;
  grime: number;
  drips: number;
  chips: number;
} = {
  seed: 1361,
  size: 256,
  repeat: [2, 2],
  grain: 18,
  grime: 90,
  drips: 18,
  chips: 55,
};

// Rusted iron: the hedgehogs and the guns of the battery.
export const RUST_SURFACE: SurfaceDef & { grain: number; patches: number; pits: number } = {
  seed: 1362,
  size: 256,
  repeat: [2, 2],
  grain: 24,
  patches: 120,
  pits: 90,
};

// Charred iron: the wrecks of boats and vehicles.
export const BURNT_SURFACE: SurfaceDef & { grain: number; char: number; ash: number } = {
  seed: 1363,
  size: 256,
  repeat: [2, 2],
  grain: 22,
  char: 45,
  ash: 110,
};

// Crates and boards: the depot's stores.
export const WOOD_SURFACE: SurfaceDef & { grain: number; planks: number; knots: number } = {
  seed: 1364,
  size: 256,
  repeat: [1, 2],
  grain: 20,
  planks: 5,
  knots: 12,
};

// The sea: long soft crests that the picture's offset carries toward the shore, and the foam line's width and
// wobble. `waveSpeed` is in repeats a second (negative: the crests come toward the beach).
export const SEA_SURFACE = {
  seed: 1365,
  size: 256,
  repeat: [6, 40] as [number, number],
  grain: 8,
  streaks: 80,
  waveSpeed: -0.045,
  foamWidth: 3.5, // m from the sea's edge
  foamFade: 11, // m the foam thins out over
  foamWobble: 2.2, // m the foam line wanders up and down the beach
  foamCols: 48,
  foamRows: 48,
};

// The sky's gradient: the top is mixed this far toward SKY_TOP_COLOR (the rest is the look's sky colour), and the
// bottom is the fog's colour so the horizon matches.
export const SKY_TOP_MIX = 0.55;
