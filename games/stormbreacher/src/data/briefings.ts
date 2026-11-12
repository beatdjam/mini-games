// The briefing before the sortie (SB-310): the lines it shows one by one and what each brings onto the map. The table
// is for M1; the map's own marks come from the map (logic/briefing.ts), so no place is written here twice.
import type { BriefingLine, BriefingSymbol, PropKind, TargetKind } from './types.ts';

// The lines in the order they come. A tap jumps to the next line's `at`; the last line is held for BRIEFING_TUNE.holdSec
// before the cycle is over, which makes a cycle of about 15 s.
export const M1_BRIEFING: readonly BriefingLine[] = [
  { key: 'briefing.goal', at: 0, show: ['battery'] },
  { key: 'briefing.enemy', at: 3, show: ['pillboxes', 'squad'] },
  { key: 'briefing.wave1', at: 6, show: ['wave1'] },
  { key: 'briefing.wave2', at: 9, show: ['wave2'] }, // the plan the script breaks later: m1.wave2-lost says it
  { key: 'briefing.depot', at: 12, show: ['depot'] },
];

// The map's wave whose spawn points show as the soldiers (BriefingSymbol 'squad'), and the mission's way that the
// first wave's arrow follows (the ally's way along the beach).
export const M1_BRIEFING_SQUAD_WAVE = 'b-squad';
export const M1_BRIEFING_WAVE_PATH = 'beach-run';

// Which symbol a target of the map comes under.
export const BRIEFING_TARGET_SYMBOL: Record<TargetKind, BriefingSymbol> = {
  pillbox: 'pillboxes',
  depot: 'depot',
  gun: 'battery',
  magazine: 'battery',
};

// The props drawn as the map's ground; the rest of the props are left out of the briefing.
export const BRIEFING_TERRAIN_KINDS: readonly PropKind[] = ['hedgehog', 'seawall', 'cliff'];

export const BRIEFING_TUNE = {
  holdSec: 3, // how long the last line stays before the cycle is over (s)
  arrowSec: 2.5, // how long an arrow takes to be drawn from its tail to its head (s)
  blinkHz: 1.6, // how often a symbol on the latest line blinks (per second)
  seaMargin: 30, // how much sea the map shows past the front edge (m)
  waveStartGap: 24, // how far past the front edge the first wave's arrow starts (m)
  wave2ShiftX: -30, // how far to the left the second wave's arrow runs from the first's (m)
  wave2Points: 4, // how many points of the first wave's arrow the second wave's arrow follows
};
