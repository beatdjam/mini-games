// M1 「強襲上陸」の台本 (SB-050). The paper's write-down, one cue at a time: a trigger and the actions in order.
// The places are a starting point on a 480 m deep, 200 m wide map: +z is the sea, A is the beach (z 120..240), B the
// bunker line (z -30..120), C the seawall (z -150..-30) and the boss sits past z -150.
import type { Area, Cue, MissionDef } from '../types.ts';

const AREAS = {
  'b-line': { x: 0, z: 135, w: 200, d: 30 }, // the band just before B (z 120..150)
  'seawall-top': { x: 0, z: -90, w: 200, d: 60 }, // the top of the seawall in C (z -120..-60)
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
      { kind: 'spawn', wave: 'beach-mortar' },
      { kind: 'ally', id: 'buddy', path: 'beach-run', fate: { at: 'beach-mid', by: 'mortar' } },
    ],
  },
  {
    id: 'pillboxes',
    trigger: { kind: 'enter', area: 'b-line' },
    actions: [
      { kind: 'objective', id: 'break-pillboxes' },
      { kind: 'spawn', wave: 'b-squad' },
      { kind: 'radio', line: 'm1.depot-hint' },
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
    id: 'cp1',
    trigger: { kind: 'destroyed', targets: ['pillbox-1', 'pillbox-2'] },
    actions: [{ kind: 'checkpoint', id: 'cp1' }],
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
  targets: ['depot', 'pillbox-1', 'pillbox-2', 'main-gun-1', 'main-gun-2', 'magazine'],
  waves: ['beach-mortar', 'b-squad', 'seawall-drop', 'battery'],
  objectives: ['reach-pillboxes', 'break-pillboxes', 'take-seawall', 'silence-battery', 'hit-magazine'],
  marks: ['wave2'],
  allies: ['buddy'],
  paths: ['beach-run'],
};
