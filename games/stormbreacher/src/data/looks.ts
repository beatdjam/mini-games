// The look of each mission: the resolution, the colour, the fog, the sky, the light and the ground. The values start
// from FX_TUNE (SB-045's middle strength); SB-300 settles the times of day.
import { FX_TUNE, type FxTune } from './tune.ts';

export type LookTune = Pick<
  FxTune,
  'pixel' | 'saturate' | 'contrast' | 'sepia' | 'haze' | 'fogColor' | 'skyColor' | 'light' | 'sun' | 'groundColor'
>;

// One row of the table: only the fields written here override FX_TUNE.
export type Look = Partial<LookTune>;

// M1 is FX_TUNE's middle strength as it is; write here only what a mission changes.
export const LOOKS: Record<string, Look> = { m1: {} };

// The ten fields of FX_TUNE, overridden by the mission's row. An id with no row keeps FX_TUNE as it is. The table is an
// argument so a test can pass another one.
export function lookOf(id: string, table: Record<string, Look> = LOOKS): LookTune {
  const look: LookTune = {
    pixel: FX_TUNE.pixel,
    saturate: FX_TUNE.saturate,
    contrast: FX_TUNE.contrast,
    sepia: FX_TUNE.sepia,
    haze: FX_TUNE.haze,
    fogColor: FX_TUNE.fogColor,
    skyColor: FX_TUNE.skyColor,
    light: FX_TUNE.light,
    sun: FX_TUNE.sun,
    groundColor: FX_TUNE.groundColor,
  };
  return { ...look, ...table[id] };
}

// The light the scene starts from. `hemi` and `sun` are strengths, `sky` and `ground` are the hemisphere's two colours,
// and `sunAt` is the sun's place. LookTune.light and LookTune.sun multiply these.
export const BASE_LIGHTS = {
  sky: 0xe6f7ff,
  ground: 0x4c4942,
  hemi: 1.9,
  sun: 1.25,
  sunAt: [42, 30, 22] as const,
};

// The renderer's tone map for the beach. ACES rolls the bright sand and sea off instead of clipping them to white; the
// exposure sits below 1 because an up-facing surface under the two lights adds up past 1 (hemi 1.9 and a sun at 1.25).
export const TONE = {
  exposure: 0.85,
};
