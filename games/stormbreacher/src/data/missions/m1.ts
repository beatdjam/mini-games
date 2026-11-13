// M1 「強襲上陸」の台本 (SB-050). The paper's write-down, one cue at a time: a trigger and the actions in order.
// The places follow the hand map (data/maps/m1b-hand.ts), 340 m deep and 200 m wide: +z is the sea, the beach and the
// bunker line B run from z 170 to about z 0 (the pillboxes stand at z -15), C's two rows (z -55..-35) stand before the
// seawall (z -75..-65), and the boss's ground lies past it: the guns at z -135 and the magazine at z -150.
import type { Area, Cue, GroundSpot, MissionDef } from '../types.ts';

// The flag cp1 raises once both pillboxes are down. The battle layer reads it: until it stands the allies wait at
// BATTLE_TUNE.holdZ, and once it stands they walk on to the far line (s3-3).
export const PILLBOXES_DOWN_FLAG = 'pillboxes-down';

// The ways the allied mechs run (SB-170, SB-1590). The beach's buddy falls beside line 1's blast point; the three cover
// mechs run through that hole to the cover behind line 1, then on to C and the boss's ground. The gunner falls on the way
// to B's cover. The points are a guess; +z is the sea.
const PATHS = {
  'beach-run': [
    { x: 10, z: 166 },
    { x: 24, z: 156 },
    { x: 44, z: 151 },
  ],
  // the three cover mechs: from the beach through line 1's hole at x 40 (its blast point) to the cover behind the line
  'b1-run': [
    { x: 0, z: 166 },
    { x: 24, z: 156 },
    { x: 40, z: 146 },
    { x: 40, z: 122 },
    { x: 20, z: 110 },
  ],
  'b2-run': [
    { x: -5, z: 164 },
    { x: 24, z: 156 },
    { x: 40, z: 146 },
    { x: 40, z: 122 },
    { x: 30, z: 118 },
  ],
  'b3-run': [
    { x: 20, z: 164 },
    { x: 28, z: 156 },
    { x: 40, z: 146 },
    { x: 40, z: 122 },
    { x: 55, z: 129 },
  ],
  // the gunner: line 1's hole to B's cover, where the machine guns take it
  'gunner-run': [
    { x: 40, z: 148 },
    { x: 40, z: 130 },
    { x: 45, z: 112 },
  ],
  // from B's cover to C's posts, past line 2's hole at x -10 and line 3's at x 61
  'c1-run': [
    { x: 20, z: 110 },
    { x: -10, z: 100 },
    { x: -10, z: 76 },
    { x: 61, z: 36 },
    { x: 61, z: 4 },
    { x: 0, z: 6 },
  ],
  'c2-run': [
    { x: 30, z: 118 },
    { x: -10, z: 100 },
    { x: -10, z: 76 },
    { x: 61, z: 36 },
    { x: 61, z: 4 },
    { x: -7, z: 1 },
  ],
  'c3-run': [
    { x: 55, z: 129 },
    { x: 40, z: 110 },
    { x: -10, z: 100 },
    { x: -10, z: 76 },
    { x: 61, z: 36 },
    { x: 61, z: 4 },
    { x: 45, z: 9 },
  ],
  // the boss's ground: up the ramp at x 35 (the seawall is 6 m) and to the cover behind it
  'boss1-run': [
    { x: 0, z: 6 },
    { x: 35, z: -20 },
    { x: 35, z: -30 },
    { x: 35, z: -46 },
    { x: 35, z: -66 },
    { x: 35, z: -78 },
    { x: 0, z: -76 },
  ],
  'boss2-run': [
    { x: -7, z: 1 },
    { x: 35, z: -20 },
    { x: 35, z: -30 },
    { x: 35, z: -46 },
    { x: 35, z: -66 },
    { x: 35, z: -78 },
    { x: -35, z: -84 },
  ],
  'boss3-run': [
    { x: 45, z: 9 },
    { x: 35, z: -20 },
    { x: 35, z: -30 },
    { x: 35, z: -46 },
    { x: 35, z: -66 },
    { x: 35, z: -78 },
    { x: 25, z: -82 },
  ],
} as const satisfies Record<string, readonly GroundSpot[]>;

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
    trigger: { kind: 'after', cue: 'intro', sec: 0 },
    actions: [
      { kind: 'objective', id: 'reach-pillboxes' },
      { kind: 'map', mark: 'wave2', on: true },
      // the beach's mortar also starts the aimed mortar (M1_WAVE_AIMED)
      { kind: 'spawn', wave: 'beach-mortar' },
      { kind: 'ally', id: 'buddy', path: 'beach-run', fate: { at: 'beach-mid', by: 'mortar', call: 'm1.buddy-call' } },
      { kind: 'ally', id: 'cover-b1', path: 'b1-run' },
      { kind: 'ally', id: 'cover-b2', path: 'b2-run' },
      { kind: 'ally', id: 'cover-b3', path: 'b3-run' },
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
      // the gunner runs with the line's cover and the machine guns take it there
      {
        kind: 'ally',
        id: 'gunner',
        path: 'gunner-run',
        fate: { at: 'b-mid', by: 'gun', call: 'm1.gunner-call' },
      },
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
      { kind: 'allyMove', id: 'cover-b1', path: 'c1-run' },
      { kind: 'allyMove', id: 'cover-b2', path: 'c2-run' },
      { kind: 'allyMove', id: 'cover-b3', path: 'c3-run' },
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
