// M1 「強襲上陸」の台本 (SB-050). The paper's write-down, one cue at a time: a trigger and the actions in order.
// The places follow the hand map (data/maps/m1b-hand.ts), 340 m deep and 200 m wide: +z is the sea, the beach and the
// bunker line B run from z 170 to about z 0 (the pillboxes stand at z -15), C's two rows (z -55..-35) stand before the
// seawall (z -75..-65), and the boss's ground lies past it: the guns at z -135 and the magazine at z -150.
import type { Area, Cue, GroundSpot, MissionDef } from '../types.ts';

// The flag cp1 raises once both pillboxes are down. The battle layer reads it: until it stands the allies wait at
// BATTLE_TUNE.holdZ, and once it stands they walk on to the far line (s3-3).
export const PILLBOXES_DOWN_FLAG = 'pillboxes-down';

// The way the allied mech runs along the beach and where the mortar takes it (SB-170). It starts beside the mech's start
// (x 0, z 166), runs to the front of line 1's blast point (40, 146.5) and falls beside it.
const PATHS = {
  'beach-run': [
    { x: 10, z: 166 },
    { x: 24, z: 156 },
    { x: 44, z: 151 },
  ],
  // The two allied mechs that go on with the infantry once the pillboxes are down (s3-3). They start in the gap between
  // the pillboxes and run through it toward C's breakthrough at x 35, then stop short of C. The places are a guess.
  'advance-run-1': [
    { x: 12, z: -4 },
    { x: 32, z: -24 },
    { x: 32, z: -60 },
  ],
  'advance-run-2': [
    { x: -12, z: -4 },
    { x: 38, z: -26 },
    { x: 38, z: -60 },
  ],
} as const satisfies Record<string, readonly GroundSpot[]>;

const PLACES = {
  'beach-mid': { x: 44, z: 151 },
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
      { kind: 'ally', id: 'buddy', path: 'beach-run', fate: { at: 'beach-mid', by: 'mortar' } },
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
    // the two allies come after the checkpoint, in the same cue: the copy is taken after all of its actions, so they
    // are in the checkpoint too and a retry does not put them out twice
    actions: [
      { kind: 'radio', line: 'm1.pillboxes-down' },
      { kind: 'flag', name: PILLBOXES_DOWN_FLAG },
      { kind: 'checkpoint', id: 'cp1' },
      { kind: 'ally', id: 'advance-1', path: 'advance-run-1' },
      { kind: 'ally', id: 'advance-2', path: 'advance-run-2' },
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
  allies: ['buddy', 'advance-1', 'advance-2'],
  paths: PATHS,
  places: PLACES,
};
