// The hold posts of M1's defenders (SB-2015): the soldiers who stand behind the cover of a line and do not come out
// while that line holds. Each post is a place to hide and a place to step out to fire from. When a milestone breaks its
// line, the post names the next line's post the soldier runs to, and there it holds in turn. The values are provisional
// and meant to be settled in the sortie. +z is the sea.
import type { GroundSpot } from './types.ts';

// The two waves the beach cue puts out, one for each sector's first line of posts.
export type DefenderWave = 'line1-hold' | 'pillbox-hold';

// A post: `line` is the line whose fall makes the holder leave it, `start` marks a post a wave stands on from the
// beginning, and `firstRout` marks a post that runs when the first pillbox alone falls (the ground around it).
// `next` is the place in DEFENDER_POSTS it runs to; null is the last line, where it holds to the end.
export interface DefenderPost {
  line: 'line1' | 'line2' | 'pillbox';
  start: boolean;
  firstRout: boolean;
  x: number; // where it hides (m)
  z: number;
  peekX: number; // where it steps out to fire (m)
  peekZ: number;
  next: number | null;
}

export const DEFENDER_TUNE = {
  hideSec: 2.6, // how long a holder stays behind cover before it steps out (s)
  peekSec: 3, // how long it stays out, firing when the line is clear (s)
  stepSpeed: 4.5, // how fast it steps out and back (m/s)
  arrive: 0.5, // it counts as at a post's point this near (m)
  firstWait: 1.2, // the seconds from stepping out to its first shot (s)
  fireInterval: 2.8, // the seconds between one shot and the next while it is out (s); looser than a grunt's
};

// Every post, in one table so `next` can be a place in it. The first line's holders run to the cover behind line 2, the
// second line's to the cover behind the pillbox line, and the pillbox line's hold to the end.
//
//  0..4  the first line's posts, between line 1 and line 2; next 5..9
//  5..9  the cover behind line 2, where the first line's holders arrive; next 15..19
// 10..14 the posts between line 2 and the pillbox line; 10 and 11 are the ground around pillbox-1, firstRout; next 20..24
// 15..19 the cover behind the pillbox line for the first and second lines' holders; the last line
// 20..24 the cover behind the pillbox line for the pillbox line's holders; the last line
export const DEFENDER_POSTS: readonly DefenderPost[] = [
  { line: 'line1', start: true, firstRout: false, x: -30, z: 107.5, peekX: -23.8, peekZ: 108.5, next: 5 },
  { line: 'line1', start: true, firstRout: false, x: 20, z: 99.5, peekX: 26, peekZ: 100, next: 6 },
  { line: 'line1', start: true, firstRout: false, x: -60, z: 97.5, peekX: -54, peekZ: 98, next: 7 },
  { line: 'line1', start: true, firstRout: false, x: 55, z: 117.5, peekX: 61, peekZ: 118, next: 8 },
  { line: 'line1', start: true, firstRout: false, x: 75, z: 115.5, peekX: 69, peekZ: 116, next: 9 },

  // line 2's cover: 8 m behind its landward face (z 64), clear of the depot (z 26..36)
  { line: 'line2', start: false, firstRout: false, x: -70, z: 58, peekX: -67.8, peekZ: 57.5, next: 15 },
  { line: 'line2', start: false, firstRout: false, x: -30, z: 58, peekX: -27.8, peekZ: 57.5, next: 16 },
  { line: 'line2', start: false, firstRout: false, x: 5, z: 58, peekX: 7.2, peekZ: 57.5, next: 17 },
  { line: 'line2', start: false, firstRout: false, x: 40, z: 58, peekX: 42.2, peekZ: 57.5, next: 18 },
  { line: 'line2', start: false, firstRout: false, x: 75, z: 58, peekX: 77.2, peekZ: 57.5, next: 19 },

  { line: 'pillbox', start: true, firstRout: true, x: -70, z: 50, peekX: -64, peekZ: 50, next: 20 },
  { line: 'pillbox', start: true, firstRout: true, x: -25, z: 52, peekX: -19, peekZ: 52, next: 21 },
  { line: 'pillbox', start: true, firstRout: false, x: 35, z: 50, peekX: 41, peekZ: 50, next: 22 },
  { line: 'pillbox', start: true, firstRout: false, x: 80, z: 45, peekX: 74, peekZ: 45, next: 23 },
  { line: 'pillbox', start: true, firstRout: false, x: 10, z: 40, peekX: 16, peekZ: 40, next: 24 },

  { line: 'pillbox', start: false, firstRout: false, x: -80, z: -24, peekX: -80, peekZ: -21, next: null },
  { line: 'pillbox', start: false, firstRout: false, x: -45, z: -24, peekX: -45, peekZ: -21, next: null },
  { line: 'pillbox', start: false, firstRout: false, x: -10, z: -24, peekX: -10, peekZ: -21, next: null },
  { line: 'pillbox', start: false, firstRout: false, x: 25, z: -24, peekX: 25, peekZ: -21, next: null },
  { line: 'pillbox', start: false, firstRout: false, x: 60, z: -24, peekX: 60, peekZ: -21, next: null },

  { line: 'pillbox', start: false, firstRout: false, x: -65, z: -24, peekX: -65, peekZ: -21, next: null },
  { line: 'pillbox', start: false, firstRout: false, x: -30, z: -24, peekX: -30, peekZ: -21, next: null },
  { line: 'pillbox', start: false, firstRout: false, x: 5, z: -24, peekX: 5, peekZ: -21, next: null },
  { line: 'pillbox', start: false, firstRout: false, x: 40, z: -24, peekX: 40, peekZ: -21, next: null },
  { line: 'pillbox', start: false, firstRout: false, x: 75, z: -24, peekX: 75, peekZ: -21, next: null },
];

// The posts each wave stands on at the start, in the order of its spawn places.
export const DEFENDER_START_POSTS: Readonly<Record<DefenderWave, readonly number[]>> = {
  'line1-hold': DEFENDER_POSTS.map((post, i) => (post.start && post.line === 'line1' ? i : -1)).filter(i => i >= 0),
  'pillbox-hold': DEFENDER_POSTS.map((post, i) => (post.start && post.line === 'pillbox' ? i : -1)).filter(i => i >= 0),
};

// The places a wave comes in at, for the map's spawn points: the hiding place of each of its start posts.
export const DEFENDER_SPAWNS: Readonly<Record<DefenderWave, GroundSpot[]>> = {
  'line1-hold': DEFENDER_START_POSTS['line1-hold'].map(i => ({ x: DEFENDER_POSTS[i].x, z: DEFENDER_POSTS[i].z })),
  'pillbox-hold': DEFENDER_START_POSTS['pillbox-hold'].map(i => ({ x: DEFENDER_POSTS[i].x, z: DEFENDER_POSTS[i].z })),
};

// The post a defender of `wave` at the wave's i-th place stands on, or undefined for another wave.
export function defenderPostOf(wave: string, index: number): number | undefined {
  if (wave !== 'line1-hold' && wave !== 'pillbox-hold') return undefined;
  return DEFENDER_START_POSTS[wave][index];
}
