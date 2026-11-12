// The suspended sortie (SB-210): the game written out when the player suspends from the pause menu, and read back when
// the title's "continue" is pressed. Pure: reading and writing storage is app/storage.ts.
import { M1B_HAND } from '../data/maps/m1b-hand.ts';
import { M1 } from '../data/missions/m1.ts';
import type { MapDef, MissionDef } from '../data/types.ts';
import type { GameModel, GameSnapshot } from './game.ts';

export const SUSPEND_VERSION = 1;

// The game as a suspend keeps it: every field of GameModel except the ones listed in suspendOf. `map` and `mission` are
// definitions nothing writes to, so they go by id (below) and come back from the tables; `checkpoint` is kept apart.
type SuspendedGame = Omit<GameModel, 'events' | 'bullets' | 'shells' | 'map' | 'mission' | 'checkpoint'>;
type SuspendedCheckpoint = Omit<GameSnapshot, 'map' | 'mission'>;

export interface SuspendData {
  v: number;
  map: string; // MapDef.id
  mission: string; // MissionDef.id
  game: SuspendedGame;
  checkpoint: SuspendedCheckpoint | null; // kept so a mech downed after the resume can still start from it
}

// The maps and missions a sortie can be suspended on, by id.
const MAPS: Record<string, MapDef> = { [M1B_HAND.id]: M1B_HAND };
const MISSIONS: Record<string, MissionDef> = { [M1.id]: M1 };

// A deep copy of the game for the suspend. The fields that are not kept are taken out by name, so a field added to
// GameModel is kept unless it is added to the list. `events` and `bullets` are the frame's own, and `shells` (a warning
// before it lands) is dropped as a checkpoint drops it, so a shell warned and not landed is gone after the resume.
export function suspendOf(game: GameModel): SuspendData {
  const { events: _events, bullets: _bullets, shells: _shells, map, mission, checkpoint, ...kept } = game;
  let savedCheckpoint: SuspendedCheckpoint | null = null;
  if (checkpoint !== null) {
    const { map: _map, mission: _mission, ...rest } = checkpoint;
    savedCheckpoint = structuredClone(rest);
  }
  return {
    v: SUSPEND_VERSION,
    map: map.id,
    mission: mission.id,
    game: structuredClone(kept),
    checkpoint: savedCheckpoint,
  };
}

type Shape = 'number' | 'boolean' | 'string' | 'array' | 'object' | 'objectOrNull' | 'stringOrNull';

// What each kept field must be, to tell a damaged suspend from a good one. The Record makes TypeScript name any field
// of GameModel that is added and left out.
const GAME_SHAPE: Record<keyof SuspendedGame, Shape> = {
  time: 'number',
  script: 'object',
  radio: 'objectOrNull',
  mech: 'object',
  armor: 'number',
  downed: 'boolean',
  rects: 'array',
  propBoxes: 'array',
  propRefs: 'array',
  breakables: 'array',
  targets: 'array',
  enemies: 'array',
  main: 'object',
  sub: 'object',
  fcs: 'object',
  aimTarget: 'stringOrNull',
  barrages: 'array',
  shutters: 'array',
  battery: 'object',
  mines: 'array',
  cleared: 'boolean',
  retries: 'number',
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function hasShape(value: unknown, shape: Shape): boolean {
  switch (shape) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isObject(value);
    case 'objectOrNull':
      return value === null || isObject(value);
    case 'stringOrNull':
      return value === null || typeof value === 'string';
  }
}

function hasGameShape(value: unknown): boolean {
  if (!isObject(value)) return false;
  return Object.entries(GAME_SHAPE).every(([key, shape]) => hasShape(value[key], shape));
}

// The game a suspend holds, with the shots in flight and the events empty, or null when the data is not a suspend this
// version can read (another version, an unknown map or mission, a missing or wrong field). A copy: the data stays as it was.
export function restoreSuspend(data: unknown): GameModel | null {
  if (!isObject(data) || data.v !== SUSPEND_VERSION) return null;
  if (typeof data.map !== 'string' || typeof data.mission !== 'string') return null;
  const map = Object.keys(MAPS).includes(data.map) ? MAPS[data.map] : undefined;
  const mission = Object.keys(MISSIONS).includes(data.mission) ? MISSIONS[data.mission] : undefined;
  if (!map || !mission || !hasGameShape(data.game)) return null;
  const saved = data.checkpoint;
  if (saved !== null && !(isObject(saved) && typeof saved.id === 'string' && hasGameShape(saved))) return null;
  // hasGameShape checked every field of SuspendedGame, which is what the casts below rely on
  const kept = structuredClone(data.game) as SuspendedGame;
  const checkpoint = saved === null ? null : { ...(structuredClone(saved) as SuspendedCheckpoint), map, mission };
  return { ...kept, map, mission, bullets: [], shells: [], events: [], checkpoint };
}
