// M1 「強襲上陸」の台本 (SB-050). The paper's write-down, one cue at a time: a trigger and the actions in order.
// The places follow the hand map (data/maps/m1b-hand.ts), 470 m deep and 200 m wide: +z is the sea, the beach and the
// bunker line B run from z 170 to about z 0 (the pillboxes stand at z -15), C's two rows (z -55..-35) stand before the
// seawall (z -75..-65), the fortress spans z -68..-128, and the battery's parts stand past it: the guns at z -235 and the
// magazine at z -250.
import { LINE1_FLAG, LINE2_FLAG, PILLBOXES_FLAG } from '../front.ts';
import { DEPOT_CHOICE_TUNE, YARD_TUNE } from '../fortress.ts';
import { PAYOFF_TUNE } from '../payoff.ts';
import type { Area, Cue, GroundSpot, HolePaths, MissionDef } from '../types.ts';

// The flag cp1 raises once both pillboxes are down. The battle layer reads it: until it stands the allies wait at the
// pillbox line's waiting z, and once it stands they walk on to the far line (s3-3). It also moves the front line
// (SB-2010; data/front.ts).
export const PILLBOXES_DOWN_FLAG = PILLBOXES_FLAG;

// The flag the mech's step onto the open ground before the sea gate raises (SB-2045): until it stands, the fortress's
// sea-wall nest does not fire.
export const FORTRESS_GUN_FLAG = 'fortress-gun-awake';

// The one machine-gun nest that wakes when the mech steps off the craft (SB-1975). It is the seaward nest nearest the
// landing: the map's b-emplacements places at z 147 are x -75, -30 and 45, and x 0 (the craft's lane) is nearer -30.
// The others stay asleep until the mech enters B.
const FRONT_NEST = 'b-emplacements-1';

// The two lines' blast points, sea to land (SB-2020). The first one the player blows in a line is the hole its allies
// go through; the second one only opens a second hole.
const LINE1 = ['l1-a', 'l1-b'] as const;
const LINE2 = ['l2-a', 'l2-b'] as const;

// A run from B's cover to C's post: it crosses line 2, and the line's first hole decides the crossing (SB-2020). The
// points are provisional, like the rest of the ways; the box test keeps them off the props and pillboxes. The near
// hole (l2-a) lets the way turn inland at x 0; the far one (l2-b) keeps it on the right, clear of the cover at (30, 54)
// and the depot's guard at (58, 52).

// The ways the allied mechs run (SB-170, SB-1590, SB-1775). The beach's buddy falls beside line 1's blast point. The
// three cover mechs and the gunner wait at the cover sea-side of line 1 until a charge opens its hole (`line1-open`),
// then run through that hole: the cover mechs to the cover behind the line and on, the gunner only as far as B's cover,
// where the machine guns take it. The points are a guess; +z is the sea.
const PATHS = {
  // The five ways begin on the decks of the crafts beside the player's (SB-1965, SB-1967): the crafts' middles are at
  // x -12 and 12 (a hull and 5 m of water apart), their decks run z 175..187, and their ramps reach the sand at z 170.2.
  // The three on the port craft stand 1.3 m apart and the two on the starboard one likewise. The first two points are provisional.
  // The player's craft is at x 0; an ally walks down its own ramp and then joins the way it took before.
  // along the sea edge and then landward, clear of the low wall at x 30 (z 154)
  'beach-run': [
    { x: -13.3, z: 177 },
    { x: -13.3, z: 170.2 },
    { x: 10, z: 166 },
    { x: 24, z: 156 },
    { x: 44, z: 156 },
    { x: 44, z: 151 },
  ],
  // the three cover mechs wait sea-side of line 1: their ways end where the run after the blast starts
  'b1-wait': [
    { x: -12, z: 177 },
    { x: -12, z: 170.2 },
    { x: 0, z: 166 },
    { x: 24, z: 156 },
  ],
  'b2-wait': [
    { x: -10.7, z: 177 },
    { x: -10.7, z: 170.2 },
    { x: -5, z: 164 },
    { x: 20, z: 156 },
  ],
  'b3-wait': [
    { x: 10.7, z: 177 },
    { x: 10.7, z: 170.2 },
    { x: 20, z: 164 },
    { x: 28, z: 156 },
  ],
  // from the waiting cover through line 1's hole at x 40 (l1-b) to the cover behind the line
  'b1-run-l1b': [
    { x: 24, z: 156 },
    { x: 36, z: 156 },
    { x: 40, z: 150 },
    { x: 40, z: 122 },
    { x: 20, z: 120 },
    { x: 20, z: 110 },
  ],
  'b2-run-l1b': [
    { x: 20, z: 156 },
    { x: 36, z: 156 },
    { x: 40, z: 150 },
    { x: 40, z: 122 },
    { x: 30, z: 118 },
  ],
  'b3-run-l1b': [
    { x: 28, z: 156 },
    { x: 36, z: 156 },
    { x: 40, z: 150 },
    { x: 40, z: 122 },
    { x: 55, z: 129 },
  ],
  // the same, through line 1's hole at x -55 (l1-a), then along the landward cover to the posts
  'b1-run-l1a': [
    { x: 24, z: 156 },
    { x: -48, z: 156 },
    { x: -55, z: 146 },
    { x: -55, z: 106 },
    { x: -48, z: 106 },
    { x: 0, z: 110 },
    { x: 20, z: 110 },
  ],
  'b2-run-l1a': [
    { x: 20, z: 156 },
    { x: -48, z: 156 },
    { x: -55, z: 146 },
    { x: -55, z: 122 },
    { x: 0, z: 122 },
    { x: 30, z: 118 },
  ],
  'b3-run-l1a': [
    { x: 28, z: 156 },
    { x: -48, z: 156 },
    { x: -55, z: 146 },
    { x: -55, z: 122 },
    { x: 0, z: 122 },
    { x: 40, z: 126 },
    { x: 55, z: 129 },
  ],
  // the gunner waits with the cover mechs, clear of the buddy's fall (44,151); provisional like the rest of the ways
  'gunner-wait': [
    { x: 13.3, z: 177 },
    { x: 13.3, z: 170.2 },
    { x: 47, z: 154 },
  ],
  // the gunner: through line 1's hole (l1-b) to B's cover, where the machine guns take it
  'gunner-run-l1b': [
    { x: 47, z: 154 },
    { x: 40, z: 146 },
    { x: 40, z: 122 },
    { x: 45, z: 112 },
  ],
  // the same through l1-a, then along the landward cover to the same fall
  'gunner-run-l1a': [
    { x: 47, z: 154 },
    { x: 47, z: 158 },
    { x: -48, z: 158 },
    { x: -55, z: 146 },
    { x: -55, z: 106 },
    { x: -48, z: 106 },
    { x: -30, z: 106 },
    { x: 0, z: 120 },
    { x: 45, z: 112 },
  ],
  // from B's cover to C's posts through line 2's hole; the tails keep clear of the block at (0, 0) and the wreck at
  // (45, 3). The near hole turns inland at x 0; the far one stays on the right, round the cover at (30, 54).
  'c1-run-l2a': [
    { x: 20, z: 110 },
    { x: 0, z: 98 },
    { x: -10, z: 98 },
    { x: -10, z: 58 },
    { x: 0, z: 44 },
    { x: 0, z: 20 },
    { x: 0, z: 6 },
  ],
  'c1-run-l2b': [
    { x: 20, z: 110 },
    { x: 0, z: 98 },
    { x: 50, z: 98 },
    { x: 50, z: 58 },
    { x: 10, z: 40 },
    { x: 0, z: 20 },
    { x: 0, z: 6 },
  ],
  'c2-run-l2a': [
    { x: 30, z: 118 },
    { x: 0, z: 98 },
    { x: -10, z: 98 },
    { x: -10, z: 58 },
    { x: 0, z: 44 },
    { x: 0, z: 20 },
    { x: -7, z: 6 },
    { x: -7, z: 1 },
  ],
  'c2-run-l2b': [
    { x: 30, z: 118 },
    { x: 0, z: 98 },
    { x: 50, z: 98 },
    { x: 50, z: 58 },
    { x: 10, z: 40 },
    { x: 0, z: 20 },
    { x: -7, z: 6 },
    { x: -7, z: 1 },
  ],
  'c3-run-l2a': [
    { x: 55, z: 129 },
    { x: 20, z: 118 },
    { x: 0, z: 98 },
    { x: -10, z: 98 },
    { x: -10, z: 58 },
    { x: 40, z: 46 },
    { x: 40, z: 20 },
    { x: 45, z: 9 },
  ],
  'c3-run-l2b': [
    { x: 55, z: 129 },
    { x: 20, z: 118 },
    { x: 0, z: 98 },
    { x: 50, z: 98 },
    { x: 50, z: 58 },
    { x: 40, z: 46 },
    { x: 40, z: 20 },
    { x: 45, z: 9 },
  ],
  // the boss's ground: through C at its x 35 breakthrough, then over to the fortress's sea gate (x 0, z -68) and into
  // the yard (x 0, z -95); the walls leave only that way through
  'boss1-run': [
    { x: 0, z: 6 },
    { x: 35, z: -4 },
    { x: 35, z: -20 },
    { x: 35, z: -30 },
    { x: 35, z: -46 },
    { x: 35, z: -58 },
    { x: 20, z: -60 },
    { x: 0, z: -62 },
    { x: 0, z: -68 },
    { x: 0, z: -95 },
  ],
  // up out of the block at (0, 0) first: its box reaches z 2
  'boss2-run': [
    { x: -7, z: 1 },
    { x: -7, z: 8 },
    { x: 35, z: -4 },
    { x: 35, z: -20 },
    { x: 35, z: -30 },
    { x: 35, z: -46 },
    { x: 35, z: -58 },
    { x: 20, z: -60 },
    { x: 0, z: -62 },
    { x: 0, z: -68 },
    { x: 0, z: -95 },
  ],
  // the wreck at (45, 3) reaches x 39..51: go round it on the land side of x 35
  'boss3-run': [
    { x: 45, z: 9 },
    { x: 35, z: 9 },
    { x: 35, z: -20 },
    { x: 35, z: -30 },
    { x: 35, z: -46 },
    { x: 35, z: -58 },
    { x: 20, z: -60 },
    { x: 0, z: -62 },
    { x: 0, z: -68 },
    { x: 0, z: -95 },
  ],
  // the cover mech the skipped depot costs (SB-1820): from wherever it stands, to the cover before the sea gate, within
  // the player's sight. moveAlly starts from its current place, so the first point is only a stand-in for the source.
  'fortress-cover-run': [
    { x: 35, z: -46 },
    { x: 20, z: -54 },
    { x: 0, z: -58 },
    { x: -20, z: -58 },
  ],
  // the survivors' post in the yard's trap (SB-1840): just inside the sea gate, clear of the walls and the cover, where
  // they shoot into the yard. moveAlly starts from where the ally stands, so the first point is only a stand-in.
  'yard-cover': [
    { x: 0, z: -92 },
    { x: -5, z: -76 },
    { x: 0, z: -75 },
    { x: 5, z: -76 },
  ],
} as const satisfies Record<string, readonly GroundSpot[]>;

// The way each cover mech takes through line 1: the first of its points the player blew picks the hole.
const B1_WAYS = {
  lines: [LINE1],
  paths: { 'l1-a': 'b1-run-l1a', 'l1-b': 'b1-run-l1b' },
} as const satisfies HolePaths;
const B2_WAYS = {
  lines: [LINE1],
  paths: { 'l1-a': 'b2-run-l1a', 'l1-b': 'b2-run-l1b' },
} as const satisfies HolePaths;
const B3_WAYS = {
  lines: [LINE1],
  paths: { 'l1-a': 'b3-run-l1a', 'l1-b': 'b3-run-l1b' },
} as const satisfies HolePaths;
const GUNNER_WAYS = {
  lines: [LINE1],
  paths: { 'l1-a': 'gunner-run-l1a', 'l1-b': 'gunner-run-l1b' },
} as const satisfies HolePaths;

// From B's cover to C: lines 2 and 3 each take their first hole.
const C1_WAYS = {
  lines: [LINE2],
  paths: { 'l2-a': 'c1-run-l2a', 'l2-b': 'c1-run-l2b' },
} as const satisfies HolePaths;
const C2_WAYS = {
  lines: [LINE2],
  paths: { 'l2-a': 'c2-run-l2a', 'l2-b': 'c2-run-l2b' },
} as const satisfies HolePaths;
const C3_WAYS = {
  lines: [LINE2],
  paths: { 'l2-a': 'c3-run-l2a', 'l2-b': 'c3-run-l2b' },
} as const satisfies HolePaths;

const PLACES = {
  'beach-mid': { x: 44, z: 151 },
  'b-mid': { x: 45, z: 112 }, // where the gunner falls, at the cover behind line 1
  'fortress-cover': { x: -20, z: -58 }, // the cover before the sea gate, where the skipped depot costs a cover mech
} as const satisfies Record<string, GroundSpot>;

const AREAS = {
  'b-line': { x: 0, z: 135, w: 200, d: 30 }, // the band just before B (z 120..150)
  // the ground before line 2's near point (z 82..100): the ally's support fire opens here (SB-2020)
  'line2-approach': { x: 0, z: 91, w: 200, d: 18 },
  'depot-approach': { x: 77.5, z: -40, w: 35, d: 40 }, // the hollow under the right cliff (x 60..95, z -60..-20)
  'fortress-approach': { x: 0, z: -61.5, w: 70, d: 13 }, // the open ground before the sea gate (z -68..-55)
  'fortress-gate': { x: 0, z: -65, w: 14, d: 10 }, // the sea gate itself (x -7..7, z -70..-60)
  'fortress-yard': { x: 0, z: -98, w: 58, d: 48 }, // the yard inside the walls (z -122..-74)
  'fortress-out': { x: 0, z: -140, w: 70, d: 20 }, // the field past the land gate (z -150..-130)
} as const satisfies Record<string, Area>;

// The names the cues may use. A typo here is caught by validateMission when logic/script.ts loads the mission.
const CUES = [
  {
    id: 'intro',
    trigger: { kind: 'start' },
    // The five allies ride in on the crafts beside the player's and wait on their decks; the landing's handover starts
    // them down their ramps (stepAllies), whether or not the player's mech has left its own craft yet. They are aboard
    // from the first frame.
    actions: [
      { kind: 'cutscene', id: 'landing' },
      { kind: 'ally', id: 'buddy', path: 'beach-run', fate: { at: 'beach-mid', by: 'mortar', call: 'm1.buddy-call' } },
      { kind: 'ally', id: 'cover-b1', path: 'b1-wait' },
      { kind: 'ally', id: 'cover-b2', path: 'b2-wait' },
      { kind: 'ally', id: 'cover-b3', path: 'b3-wait' },
      // the gunner waits with them and runs once a charge opens line 1 (line1-open): it must not take a way before
      // the hole is picked, for a way read before the blast would fall back to line 1's first id
      { kind: 'ally', id: 'gunner', path: 'gunner-wait', fate: { at: 'b-mid', by: 'gun', call: 'm1.gunner-call' } },
    ],
  },
  {
    id: 'beach',
    // the objective and the mortar start with the landing's end; the allies wait until the mech is off the craft
    trigger: { kind: 'after', cue: 'intro', sec: 0 },
    actions: [
      { kind: 'objective', id: 'reach-pillboxes' },
      // the beach's mortar also starts the aimed mortar (M1_WAVE_AIMED)
      { kind: 'spawn', wave: 'beach-mortar' },
      // the six machine-gun nests stand on their line from the start, asleep until the script wakes them
      { kind: 'spawn', wave: 'b-emplacements', dormant: true },
      // the two sectors' defenders are posted behind line 1 and line 2 from the start (SB-2015); they do not come out
      // until a milestone breaks their line, and then they run to the next line's cover
      { kind: 'spawn', wave: 'line1-hold' },
      { kind: 'spawn', wave: 'pillbox-hold' },
    ],
  },
  {
    id: 'ashore',
    // The allies are already aboard (intro) and the landing's handover has sent them down their ramps; this input is the
    // mech's own step off the craft. The front nest wakes now; the other five wait for B.
    trigger: { kind: 'ashore' },
    actions: [{ kind: 'wake', enemy: FRONT_NEST }],
  },
  {
    id: 'line1-open',
    // the cover mechs only run through line 1 once a charge has opened its hole; the first point blown picks the hole.
    // The milestone's knock (SB-2010) comes in the same cue: the slow, the eased mortar, the sector's fall back and the
    // flag that moves the front line. The cheer follows the blast on the radio band.
    trigger: { kind: 'blast', ids: LINE1 },
    actions: [
      { kind: 'payoff', id: 'breach' },
      { kind: 'flag', name: LINE1_FLAG },
      { kind: 'allyMove', id: 'cover-b1', path: B1_WAYS },
      { kind: 'allyMove', id: 'cover-b2', path: B2_WAYS },
      { kind: 'allyMove', id: 'cover-b3', path: B3_WAYS },
      { kind: 'allyMove', id: 'gunner', path: GUNNER_WAYS },
      { kind: 'radio', line: 'm1.line1-cheer', delay: PAYOFF_TUNE.cheerDelay },
    ],
  },
  {
    id: 'pillboxes',
    // entering B wakes the five nests that still sleep; the front one woke at `ashore`
    trigger: { kind: 'enter', area: 'b-line' },
    actions: [
      { kind: 'objective', id: 'break-pillboxes' },
      { kind: 'spawn', wave: 'b-squad' },
      { kind: 'wake', wave: 'b-emplacements' },
      { kind: 'radio', line: 'm1.depot-hint' },
    ],
  },
  {
    id: 'line2-approach',
    // The mech comes up to line 2's near point: an ally mech's support fire pins the nests for a moment (SB-2020), so
    // there is a window to plant the charge in the crossfire. The nests are already awake from entering B.
    trigger: { kind: 'enter', area: 'line2-approach' },
    actions: [
      { kind: 'suppress', id: 'cover-b2', wave: 'b-emplacements', sec: 9 },
      { kind: 'radio', line: 'm1.line2-support', callout: 'm1.callout.line2-support' },
    ],
  },
  {
    id: 'line2-open',
    // The second line's charge opens its hole: the middle milestone (SB-2020). The near and the far point both open it;
    // the first one blown picks the way the cover mechs take at cp1.
    trigger: { kind: 'blast', ids: LINE2 },
    actions: [
      { kind: 'payoff', id: 'breach2' },
      { kind: 'flag', name: LINE2_FLAG },
      { kind: 'radio', line: 'm1.line2-cheer', delay: PAYOFF_TUNE.cheerDelay },
      // the counterattack comes through the hole: fight it at the cover before it, then push on (SB-2025)
      { kind: 'radio', line: 'm1.line2-hold', delay: PAYOFF_TUNE.holdDelay, callout: 'm1.callout.line2-hold' },
    ],
  },
  {
    id: 'depot-ask',
    // cp1's 10 s give the leader time to ask; shelling starts on both ways, so the flag alone decides how hard it falls
    trigger: { kind: 'after', cue: 'cp1', sec: DEPOT_CHOICE_TUNE.askSec },
    actions: [
      { kind: 'flag', name: 'depot-asked' },
      // the answer is walked after the question: an area passed during the 10 s before it does not count
      { kind: 'rearm', areas: ['depot-approach', 'fortress-approach'] },
      { kind: 'spawn', wave: 'shelling' },
    ],
  },
  {
    id: 'depot-ask-radio',
    // the leader does not ask about a depot that is already down; the flag and the shelling above still run
    trigger: { kind: 'after', cue: 'depot-ask', sec: 0 },
    unless: ['depot-down'],
    actions: [
      { kind: 'radio', line: 'm1.depot-ask-1' },
      { kind: 'radio', line: 'm1.depot-ask-2' },
    ],
  },
  {
    id: 'depot-go',
    // walking into the hollow is the answer: the guard comes out and the map marks the depot
    trigger: { kind: 'enter', area: 'depot-approach' },
    when: ['depot-asked'],
    unless: ['depot-down', 'fortress-skip'],
    actions: [
      { kind: 'radio', line: 'm1.depot-go' },
      { kind: 'spawn', wave: 'depot-guard' },
      { kind: 'map', mark: 'depot', on: true },
      { kind: 'flag', name: 'depot-taken' },
    ],
  },
  {
    id: 'fortress-go',
    // walking on to the fortress is the other answer: the skipped depot costs one ally and one squad
    trigger: { kind: 'enter', area: 'fortress-approach' },
    when: ['depot-asked'],
    unless: ['depot-down', 'depot-taken'],
    actions: [
      { kind: 'radio', line: 'm1.depot-skip' },
      { kind: 'allyMove', id: 'cover-b3', path: 'fortress-cover-run' },
      { kind: 'loss', allies: DEPOT_CHOICE_TUNE.lossAllies, squads: DEPOT_CHOICE_TUNE.lossSquads },
      { kind: 'flag', name: 'fortress-skip' },
    ],
  },
  {
    id: 'fortress-ally-lost',
    // the ally falls at the cover a moment after the answer; a separate cue, so it has already run when it falls
    trigger: { kind: 'after', cue: 'fortress-go', sec: DEPOT_CHOICE_TUNE.allyFallSec },
    when: ['fortress-skip'],
    actions: [
      { kind: 'allyFall', id: 'cover-b3', by: 'shell' },
      { kind: 'radio', line: 'm1.ally-lost' },
    ],
  },
  {
    id: 'depot',
    trigger: { kind: 'destroyed', targets: ['depot'] },
    actions: [
      { kind: 'flag', name: 'depot-down' },
      { kind: 'radio', line: 'm1.depot-down' },
    ],
  },
  {
    id: 'pillbox1',
    // The first bunker down gets a smaller knock (SB-2010): a short slow and a heavier blast, but the line still stands
    // until the second one falls. The trigger counts one of the two, so it fires on whichever falls first.
    trigger: { kind: 'destroyed', targets: ['pillbox-1', 'pillbox-2'], count: 1 },
    actions: [{ kind: 'payoff', id: 'bunker1' }],
  },
  {
    id: 'cp1',
    trigger: { kind: 'destroyed', targets: ['pillbox-1', 'pillbox-2'] },
    // the flag and the radio come before the checkpoint, so its copy holds both (the copy is taken after the whole cue)
    // the three cover mechs go on to C after the checkpoint, in the same cue through line 2's hole: the copy is taken
    // after all of its actions, so their next way is in the checkpoint too and a retry does not send them along it
    // twice. The milestone's knock (SB-2010) sets the slow, the eased mortar, the sector's fall back and the front move.
    actions: [
      { kind: 'radio', line: 'm1.pillboxes-down', delay: PAYOFF_TUNE.cheerDelay },
      { kind: 'flag', name: PILLBOXES_DOWN_FLAG },
      { kind: 'payoff', id: 'bunker' },
      { kind: 'checkpoint', id: 'cp1' },
      { kind: 'allyMove', id: 'cover-b1', path: C1_WAYS },
      { kind: 'allyMove', id: 'cover-b2', path: C2_WAYS },
      { kind: 'allyMove', id: 'cover-b3', path: C3_WAYS },
    ],
  },
  {
    id: 'fortress-gun-wake',
    // the wall's nest holds its fire while the mech fights the pillboxes: it starts to sweep once the mech is on the
    // open ground before the sea gate (SB-2045). No `when`: walking there before the leader asks counts too
    trigger: { kind: 'enter', area: 'fortress-approach' },
    actions: [{ kind: 'flag', name: FORTRESS_GUN_FLAG }],
  },
  {
    id: 'fortress-gate',
    trigger: { kind: 'enter', area: 'fortress-gate' },
    when: ['depot-asked'],
    actions: [
      { kind: 'checkpoint', id: 'cp2' },
      { kind: 'objective', id: 'stop-fortress-gun' },
      { kind: 'radio', line: 'm1.fortress-gate' },
      // the wall's nest drops its three onto the open ground behind the mech as it goes in (SB-1830)
      { kind: 'spawn', wave: 'fortress-drop' },
      // the three cover mechs go on to the yard through the sea gate; the checkpoint above is copied after all actions,
      // so their next way is in the copy too
      { kind: 'allyMove', id: 'cover-b1', path: 'boss1-run' },
      { kind: 'allyMove', id: 'cover-b2', path: 'boss2-run' },
      { kind: 'allyMove', id: 'cover-b3', path: 'boss3-run' },
    ],
  },
  {
    id: 'fortress-yard',
    // the yard's trap (SB-1840): the three doors shut the mech in, and the cover mechs that lived through the first half
    // take their post by the sea gate and start shooting one enemy at a time
    trigger: { kind: 'enter', area: 'fortress-yard' },
    actions: [
      { kind: 'radio', line: 'm1.fortress-yard' },
      { kind: 'radio', line: 'm1.yard-trap' },
      { kind: 'spawn', wave: 'yard-1' },
      { kind: 'assist', waves: ['yard-1', 'yard-2', 'yard-3'] },
      { kind: 'allyMove', id: 'cover-b1', path: 'yard-cover' },
      { kind: 'allyMove', id: 'cover-b2', path: 'yard-cover' },
      { kind: 'allyMove', id: 'cover-b3', path: 'yard-cover' },
    ],
  },
  {
    id: 'yard-drop',
    // the second wave comes from the back of the yard a few seconds after the first, so the mech is taken from both ends
    trigger: { kind: 'after', cue: 'fortress-yard', sec: YARD_TUNE.waveGapSec },
    actions: [{ kind: 'spawn', wave: 'yard-2' }],
  },
  {
    id: 'yard-gate',
    // the first wave down brings out the two beside the sea gate, which cut the way out; the flag shows the yard is one wave lighter
    trigger: { kind: 'cleared', wave: 'yard-1' },
    actions: [
      { kind: 'flag', name: 'yard-1-clear' },
      { kind: 'spawn', wave: 'yard-3' },
    ],
  },
  {
    id: 'yard-2-clear',
    trigger: { kind: 'cleared', wave: 'yard-2' },
    actions: [{ kind: 'flag', name: 'yard-2-clear' }],
  },
  {
    id: 'yard-3-clear',
    trigger: { kind: 'cleared', wave: 'yard-3' },
    actions: [{ kind: 'flag', name: 'yard-3-clear' }],
  },
  {
    id: 'yard-clear',
    // the yard is done once all three waves are down; the land gate opens and the mid boss walks out (SB-1850)
    trigger: { kind: 'flag', name: 'yard-3-clear' },
    when: ['yard-1-clear', 'yard-2-clear', 'yard-3-clear'],
    actions: [
      { kind: 'radio', line: 'm1.yard-clear' },
      { kind: 'radio', line: 'm1.warden' },
      { kind: 'spawn', wave: 'warden' },
    ],
  },
  {
    id: 'fortress-bomb',
    // the mid boss's blast opens the land wall's magazine (SB-1860): the objective changes and the leader calls the way out
    trigger: { kind: 'wardenDown' },
    actions: [
      { kind: 'objective', id: 'bomb-fortress' },
      { kind: 'radio', line: 'm1.bomb-armed' },
    ],
  },
  {
    id: 'fortress-down',
    // the charge in the magazine blows (SB-1860): the walls come down, the nest on the sea wall is wrecked, cp3 stands at
    // the new objective and the battery's wave comes out. The cutscene's length is in data/script.ts.
    trigger: { kind: 'fortressDown' },
    actions: [
      { kind: 'flag', name: 'fortress-down' },
      { kind: 'cutscene', id: 'fortress-blast' },
      { kind: 'checkpoint', id: 'cp3' },
      { kind: 'objective', id: 'silence-battery' },
      { kind: 'spawn', wave: 'battery' },
    ],
  },
  {
    id: 'fortress-out',
    // the field past the ruin: the checkpoint and the battery moved to the blast above (SB-1860)
    trigger: { kind: 'enter', area: 'fortress-out' },
    actions: [{ kind: 'radio', line: 'm1.get-out' }],
  },
  {
    id: 'gun1',
    trigger: { kind: 'destroyed', targets: ['main-gun-1', 'main-gun-2'], count: 1 },
    actions: [{ kind: 'radio', line: 'm1.gun1-down' }],
  },
  {
    id: 'shutter',
    trigger: { kind: 'destroyed', targets: ['main-gun-1', 'main-gun-2'] },
    actions: [
      { kind: 'flag', name: 'shutter-open' },
      { kind: 'objective', id: 'hit-magazine' },
    ],
  },
  {
    id: 'win',
    trigger: { kind: 'destroyed', targets: ['magazine'] },
    actions: [
      { kind: 'cutscene', id: 'beach-held' },
      { kind: 'end', result: 'cleared' },
    ],
  },
] as const satisfies readonly Cue[];

export const M1: MissionDef = {
  id: 'm1',
  cues: CUES,
  areas: AREAS,
  targets: ['depot', 'pillbox-1', 'pillbox-2', 'fortress-gun', 'main-gun-1', 'main-gun-2', 'magazine'],
  waves: [
    'beach-mortar',
    'b-squad',
    'b-emplacements',
    'line1-hold',
    'pillbox-hold',
    'depot-guard',
    'shelling',
    'fortress-drop',
    'yard-1',
    'yard-2',
    'yard-3',
    'warden',
    'warden-adds',
    'battery',
  ],
  objectives: [
    'reach-pillboxes',
    'break-pillboxes',
    'stop-fortress-gun',
    'bomb-fortress',
    'silence-battery',
    'hit-magazine',
  ],
  marks: ['depot'],
  flags: [
    'depot-down',
    'depot-asked',
    'depot-taken',
    'fortress-skip',
    FORTRESS_GUN_FLAG,
    LINE1_FLAG,
    LINE2_FLAG,
    PILLBOXES_DOWN_FLAG,
    'fortress-down',
    'shutter-open',
    'yard-1-clear',
    'yard-2-clear',
    'yard-3-clear',
  ],
  allies: ['buddy', 'cover-b1', 'cover-b2', 'cover-b3', 'gunner'],
  paths: PATHS,
  places: PLACES,
};
