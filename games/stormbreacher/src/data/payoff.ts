// The milestones' payoff (SB-2010, SB-2020): the moment a line opens or a bunker goes down, and the few seconds after it.
// The values are provisional and meant to be settled in the sortie. The cue actions name a row; logic/game.ts carries
// the slowdown, the artillery's lull and the enemies' fall back, and view/ reads the falls, the HUD and the battle layer.
import type { BoomKind } from './boom.ts';
import { FRONT_TUNE, LINE1_FLAG, LINE2_FLAG, PILLBOXES_FLAG } from './front.ts';
import type { GroundSpot } from './types.ts';

export type PayoffId = 'breach' | 'breach2' | 'bunker1' | 'bunker';

// The lines an enemy may fall back to, as points just landward of the line. A walking enemy seaward of a line's z runs to
// the nearest point and holds it for `retreatHold` seconds. The points are guesses, clear of the crowd's ways.
const LINE2_COVER: readonly GroundSpot[] = [
  { x: -25, z: 58 },
  { x: 35, z: 58 },
  { x: 65, z: 58 },
];
const PILLBOX_COVER: readonly GroundSpot[] = [
  { x: -35, z: -22 },
  { x: 10, z: -22 },
  { x: 48, z: -22 },
];

// The numbers every milestone shares, except the first bunker's smaller one.
export const PAYOFF_TUNE = {
  slowSec: 0.25, // how long the world runs slowly (s, real time)
  slowScale: 0.3, // the share of time the world keeps while it does (0-1)
  firstSlowSec: 0.12, // the first bunker's shorter pause (s)
  firstSlowScale: 0.5, // and the share it keeps (0-1)
  calmSec: 4, // how long the enemy mortar is eased after a milestone (s)
  calmMul: 2, // the mortar's interval this many times as long while it is eased
  headlineSec: 1.3, // how long the short heading stays on screen (s)
  cheerDelay: 1, // how long the allies' radio cheer waits after the blast (s)
  holdDelay: 4, // how long the command's "hold at the cover" line waits after the blast, past the cheer's seconds on the band (s; SB-2025)
  retreatSpeed: 1.35, // an enemy falling back runs this many times its walking speed
  retreatHold: 3, // how long it holds the next line after it gets there (s)
  retreatArrive: 1.5, // it counts as at the cover this near (m)
  wave2Pad: 0.3, // the second wave's sinking cutscene starts this long after the bunker's slow and heading are over (s; SB-2027)
  surgeAllies: 12, // the infantry the battle layer adds once at a milestone
};

export interface PayoffDef {
  cue: string; // the cue that fires it, for the HUD's heading
  flag: string | null; // the flag that moves the front line, if this milestone moves it
  headline: string | null; // the short heading's language key
  blasts?: readonly string[]; // the blast points whose opening is this milestone
  fallback: { lineZ: number; at: readonly GroundSpot[] } | null; // the line the sector falls back to
  boom: BoomKind; // the explosion a broken thing of this milestone draws
}

export const PAYOFFS: Record<PayoffId, PayoffDef> = {
  // Line 1's charge opens the hole: the enemy before line 2 falls back to it, and the mortar eases.
  breach: {
    cue: 'line1-open',
    flag: LINE1_FLAG,
    headline: 'm1.breach',
    blasts: ['l1-a', 'l1-b'],
    fallback: { lineZ: FRONT_TUNE.line2Z, at: LINE2_COVER },
    boom: 'breach',
  },
  // Line 2's charge opens the second hole (SB-2020): the enemy before the pillbox line falls back to it, its posted
  // holders behind line 2 run, and the front moves on to the middle line.
  breach2: {
    cue: 'line2-open',
    flag: LINE2_FLAG,
    headline: 'm1.breach2',
    blasts: ['l2-a', 'l2-b'],
    fallback: { lineZ: FRONT_TUNE.pillboxesZ, at: PILLBOX_COVER },
    boom: 'breach',
  },
  // The first bunker goes down with a smaller knock; the line itself is still held.
  bunker1: {
    cue: 'pillbox1',
    flag: null,
    headline: null,
    fallback: null,
    boom: 'bunkerSmall',
  },
  // The second bunker ends the line: the front moves to the pillboxes and their sector falls back to it.
  bunker: {
    cue: 'cp1',
    flag: PILLBOXES_FLAG,
    headline: 'm1.bunker-down',
    fallback: { lineZ: FRONT_TUNE.pillboxesZ, at: PILLBOX_COVER },
    boom: 'bunker',
  },
};

export const PAYOFF_IDS: readonly PayoffId[] = ['breach', 'breach2', 'bunker1', 'bunker'];
