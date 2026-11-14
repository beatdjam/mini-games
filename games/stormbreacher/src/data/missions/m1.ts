// M1 「強襲上陸」の台本 (SB-050). The paper's write-down, one cue at a time: a trigger and the actions in order.
// The places follow the hand map (data/maps/m1b-hand.ts), 340 m deep and 200 m wide: +z is the sea, the beach and the
// bunker line B run from z 170 to about z 0 (the pillboxes stand at z -15), C's two rows (z -55..-35) stand before the
// seawall (z -75..-65), and the boss's ground lies past it: the guns at z -135 and the magazine at z -150.
import type { Area, Cue, GroundSpot, HolePaths, MissionDef } from '../types.ts';

// The flag cp1 raises once both pillboxes are down. The battle layer reads it: until it stands the allies wait at
// BATTLE_TUNE.holdZ, and once it stands they walk on to the far line (s3-3).
export const PILLBOXES_DOWN_FLAG = 'pillboxes-down';

// The three lines' blast points, sea to land. The first one the player blows in a line is the hole its allies go
// through; the second one only opens a second hole.
const LINE1 = ['l1-a', 'l1-b'] as const;
const LINE2 = ['l2-a', 'l2-b'] as const;
const LINE3 = ['l3-a', 'l3-b'] as const;

// A run from B's cover to C's post: it crosses line 2 and line 3, and each line's first hole decides that crossing.
// The points are 仮, like the rest of the ways; the box test keeps them off the props and pillboxes. `l3endZ` is the z
// the way turns at after line 3: the hole's landward edge (8) spares two ways a 4 m run down to z 4 and back.
function cRun(post: GroundSpot, l2x: number, l3x: number, tail: readonly GroundSpot[], l3endZ = 4): GroundSpot[] {
  return [
    post,
    // pass seaward of the wreck at (30, 110) before dropping to the line 2 crossing
    { x: 0, z: 110 },
    { x: 0, z: 100 },
    { x: l2x, z: 100 },
    { x: l2x, z: 76 },
    { x: 0, z: 76 },
    // the depot at (53, 31) reaches z 37: come to line 3 from seaward of it
    { x: l3x, z: 42 },
    { x: l3x, z: 36 },
    { x: l3x, z: l3endZ },
    ...tail,
  ];
}

// The ways the allied mechs run (SB-170, SB-1590, SB-1775). The beach's buddy falls beside line 1's blast point. The
// three cover mechs and the gunner wait at the cover sea-side of line 1 until a charge opens its hole (`line1-open`),
// then run through that hole: the cover mechs to the cover behind the line and on, the gunner only as far as B's cover,
// where the machine guns take it. The points are a guess; +z is the sea.
const PATHS = {
  // along the sea edge and then landward, clear of the low wall at x 30 (z 154)
  'beach-run': [
    { x: 10, z: 166 },
    { x: 24, z: 156 },
    { x: 44, z: 156 },
    { x: 44, z: 151 },
  ],
  // the three cover mechs wait sea-side of line 1: their ways end where the run after the blast starts
  'b1-wait': [
    { x: 0, z: 166 },
    { x: 24, z: 156 },
  ],
  'b2-wait': [
    { x: -5, z: 164 },
    { x: 20, z: 156 },
  ],
  'b3-wait': [
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
  // the gunner waits with the cover mechs, clear of the buddy's fall (44,151); 仮 like the rest of the ways
  'gunner-wait': [{ x: 47, z: 154 }],
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
  // from B's cover to C's posts; the tails keep clear of the block at (0, 0) and the wreck at (45, 3)
  'c1-run-l2a-l3a': cRun({ x: 20, z: 110 }, -10, -30, [{ x: 0, z: 6 }]),
  'c1-run-l2a-l3b': cRun(
    { x: 20, z: 110 },
    -10,
    61,
    [
      { x: 20, z: 8 },
      { x: 0, z: 6 },
    ],
    8,
  ),
  'c1-run-l2b-l3a': cRun({ x: 20, z: 110 }, 50, -30, [{ x: 0, z: 6 }]),
  'c1-run-l2b-l3b': cRun(
    { x: 20, z: 110 },
    50,
    61,
    [
      { x: 20, z: 8 },
      { x: 0, z: 6 },
    ],
    8,
  ),
  'c2-run-l2a-l3a': cRun({ x: 30, z: 118 }, -10, -30, [{ x: -7, z: 1 }]),
  'c2-run-l2a-l3b': cRun(
    { x: 30, z: 118 },
    -10,
    61,
    [
      { x: 20, z: 8 },
      { x: -7, z: 6 },
      { x: -7, z: 1 },
    ],
    8,
  ),
  'c2-run-l2b-l3a': cRun({ x: 30, z: 118 }, 50, -30, [{ x: -7, z: 1 }]),
  'c2-run-l2b-l3b': cRun(
    { x: 30, z: 118 },
    50,
    61,
    [
      { x: 20, z: 8 },
      { x: -7, z: 6 },
      { x: -7, z: 1 },
    ],
    8,
  ),
  'c3-run-l2a-l3a': cRun({ x: 55, z: 129 }, -10, -30, [
    { x: 0, z: 8 },
    { x: 45, z: 9 },
  ]),
  'c3-run-l2a-l3b': cRun({ x: 55, z: 129 }, -10, 61, [
    { x: 61, z: 8 },
    { x: 45, z: 9 },
  ]),
  'c3-run-l2b-l3a': cRun({ x: 55, z: 129 }, 50, -30, [
    { x: 0, z: 8 },
    { x: 45, z: 9 },
  ]),
  'c3-run-l2b-l3b': cRun({ x: 55, z: 129 }, 50, 61, [
    { x: 61, z: 8 },
    { x: 45, z: 9 },
  ]),
  // the boss's ground: past pillbox-2 on its open side (x 35), then up the ramp at x 35 (the seawall is 6 m)
  'boss1-run': [
    { x: 0, z: 6 },
    { x: 35, z: -4 },
    { x: 35, z: -20 },
    { x: 35, z: -30 },
    { x: 35, z: -46 },
    { x: 35, z: -66 },
    { x: 35, z: -78 },
    { x: 0, z: -76 },
  ],
  // up out of the block at (0, 0) first: its box reaches z 2
  'boss2-run': [
    { x: -7, z: 1 },
    { x: -7, z: 8 },
    { x: 35, z: -4 },
    { x: 35, z: -20 },
    { x: 35, z: -30 },
    { x: 35, z: -46 },
    { x: 35, z: -66 },
    { x: 35, z: -78 },
    { x: -20, z: -78 },
    { x: -35, z: -84 },
  ],
  // the wreck at (45, 3) reaches x 39..51: go round it on the land side of x 35
  'boss3-run': [
    { x: 45, z: 9 },
    { x: 35, z: 9 },
    { x: 35, z: -20 },
    { x: 35, z: -30 },
    { x: 35, z: -46 },
    { x: 35, z: -66 },
    { x: 35, z: -78 },
    { x: 25, z: -82 },
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
  lines: [LINE2, LINE3],
  paths: {
    'l2-a+l3-a': 'c1-run-l2a-l3a',
    'l2-a+l3-b': 'c1-run-l2a-l3b',
    'l2-b+l3-a': 'c1-run-l2b-l3a',
    'l2-b+l3-b': 'c1-run-l2b-l3b',
  },
} as const satisfies HolePaths;
const C2_WAYS = {
  lines: [LINE2, LINE3],
  paths: {
    'l2-a+l3-a': 'c2-run-l2a-l3a',
    'l2-a+l3-b': 'c2-run-l2a-l3b',
    'l2-b+l3-a': 'c2-run-l2b-l3a',
    'l2-b+l3-b': 'c2-run-l2b-l3b',
  },
} as const satisfies HolePaths;
const C3_WAYS = {
  lines: [LINE2, LINE3],
  paths: {
    'l2-a+l3-a': 'c3-run-l2a-l3a',
    'l2-a+l3-b': 'c3-run-l2a-l3b',
    'l2-b+l3-a': 'c3-run-l2b-l3a',
    'l2-b+l3-b': 'c3-run-l2b-l3b',
  },
} as const satisfies HolePaths;

const PLACES = {
  'beach-mid': { x: 44, z: 151 },
  'b-mid': { x: 45, z: 112 }, // where the gunner falls, at the cover behind line 1
} as const satisfies Record<string, GroundSpot>;

const AREAS = {
  'b-line': { x: 0, z: 135, w: 200, d: 30 }, // the band just before B (z 120..150)
  'depot-approach': { x: 55, z: 52, w: 50, d: 30 }, // the way down to the depot (x 30..80, z 37..67), past line 2
  'c-line': { x: 0, z: -30, w: 200, d: 10 }, // just before C's first row (z -35..-25)
  'seawall-top': { x: 0, z: -70, w: 200, d: 10 }, // the top of the seawall (z -75..-65); the ground cannot reach it
} as const satisfies Record<string, Area>;

// The names the cues may use. A typo here is caught by validateMission when logic/script.ts loads the mission.
const CUES = [
  {
    id: 'intro',
    trigger: { kind: 'start' },
    actions: [{ kind: 'cutscene', id: 'landing' }],
  },
  {
    id: 'beach',
    // the objective and the mortar start with the landing's end; the allies wait until the mech is off the craft
    trigger: { kind: 'after', cue: 'intro', sec: 0 },
    actions: [
      { kind: 'objective', id: 'reach-pillboxes' },
      { kind: 'map', mark: 'wave2', on: true },
      // the beach's mortar also starts the aimed mortar (M1_WAVE_AIMED)
      { kind: 'spawn', wave: 'beach-mortar' },
    ],
  },
  {
    id: 'ashore',
    // the buddy and the cover mechs run once the mech has walked down the ramp, as 1620 decides
    trigger: { kind: 'ashore' },
    actions: [
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
    id: 'line1-open',
    // the cover mechs only run through line 1 once a charge has opened its hole; the first point blown picks the hole
    trigger: { kind: 'blast', ids: LINE1 },
    actions: [
      { kind: 'allyMove', id: 'cover-b1', path: B1_WAYS },
      { kind: 'allyMove', id: 'cover-b2', path: B2_WAYS },
      { kind: 'allyMove', id: 'cover-b3', path: B3_WAYS },
      { kind: 'allyMove', id: 'gunner', path: GUNNER_WAYS },
    ],
  },
  {
    id: 'pillboxes',
    // entering B also wakes the six machine-gun nests
    trigger: { kind: 'enter', area: 'b-line' },
    actions: [
      { kind: 'objective', id: 'break-pillboxes' },
      { kind: 'spawn', wave: 'b-squad' },
      { kind: 'spawn', wave: 'b-emplacements' },
      { kind: 'radio', line: 'm1.depot-hint' },
    ],
  },
  {
    id: 'depot-guard',
    trigger: { kind: 'enter', area: 'depot-approach' },
    actions: [{ kind: 'spawn', wave: 'depot-guard' }],
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
    id: 'cp1',
    trigger: { kind: 'destroyed', targets: ['pillbox-1', 'pillbox-2'] },
    // the flag and the radio come before the checkpoint, so its copy holds both (the copy is taken after the whole cue)
    // the three cover mechs go on to C after the checkpoint, in the same cue: the copy is taken after all of its actions,
    // so their next way is in the checkpoint too and a retry does not send them along it twice
    actions: [
      { kind: 'radio', line: 'm1.pillboxes-down' },
      { kind: 'flag', name: PILLBOXES_DOWN_FLAG },
      { kind: 'checkpoint', id: 'cp1' },
      { kind: 'allyMove', id: 'cover-b1', path: C1_WAYS },
      { kind: 'allyMove', id: 'cover-b2', path: C2_WAYS },
      { kind: 'allyMove', id: 'cover-b3', path: C3_WAYS },
    ],
  },
  {
    id: 'wave2-lost',
    trigger: { kind: 'after', cue: 'cp1', sec: 4 },
    actions: [
      { kind: 'cutscene', id: 'wave2-sinks' },
      { kind: 'radio', line: 'm1.wave2-lost' },
      { kind: 'map', mark: 'wave2', on: false },
      { kind: 'objective', id: 'take-seawall' },
      { kind: 'spawn', wave: 'seawall-drop' },
    ],
  },
  {
    id: 'c-squad',
    trigger: { kind: 'enter', area: 'c-line' },
    actions: [{ kind: 'spawn', wave: 'c-squad' }],
  },
  {
    id: 'seawall',
    trigger: { kind: 'enter', area: 'seawall-top' },
    actions: [
      { kind: 'checkpoint', id: 'cp2' },
      { kind: 'objective', id: 'silence-battery' },
      { kind: 'spawn', wave: 'battery' },
      { kind: 'allyMove', id: 'cover-b1', path: 'boss1-run' },
      { kind: 'allyMove', id: 'cover-b2', path: 'boss2-run' },
      { kind: 'allyMove', id: 'cover-b3', path: 'boss3-run' },
    ],
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
  targets: ['depot', 'pillbox-1', 'pillbox-2', 'pillbox-3', 'main-gun-1', 'main-gun-2', 'magazine'],
  waves: ['beach-mortar', 'b-squad', 'b-emplacements', 'depot-guard', 'seawall-drop', 'c-squad', 'battery'],
  objectives: ['reach-pillboxes', 'break-pillboxes', 'take-seawall', 'silence-battery', 'hit-magazine'],
  marks: ['wave2'],
  allies: ['buddy', 'cover-b1', 'cover-b2', 'cover-b3', 'gunner'],
  paths: PATHS,
  places: PLACES,
};
