// The suspended sortie (SB-210): the game written out when the player suspends from the pause menu, and read back when
// the title's "continue" is pressed. Pure: reading and writing storage is app/storage.ts.
import { M1_SHUTTERS } from '../data/battery.ts';
import { M1_NEST_WAVE } from '../data/enemies.ts';
import { M1B_HAND } from '../data/maps/m1b-hand.ts';
import { M1 } from '../data/missions/m1.ts';
import { PLAY_BATTLE_TUNE } from '../data/tune.ts';
import type { MapDef, MissionDef } from '../data/types.ts';
import { newBattle } from './battle.ts';
import { lowerBrokenTargetRects, type GameModel, type GameSnapshot } from './game.ts';
import { newShutters } from './battery.ts';
import { newNav } from './nav.ts';
import { stream } from './rng.ts';
import { sectorHold } from './sectors.ts';
import { restartWarden } from './warden.ts';

export const SUSPEND_VERSION = 33; // 33: the infantry's wait to its next support shot `supportT` and the enemies' suppression `suppressT` are kept (SB-2240); 32: the trickle's wait and the enemies it has spent for each sector, `trickle` (SB-2230); 31: a sector's counterattack is kept, `counterLeft`, `counterT`, `counterIds`, `arrived` and `weak` (SB-2220); 30: the sectors `sectors` are kept (SB-2210); 29: the losses of the depot detour are gone (SB-2046); 28: the fortress blast's broken props (SB-1860); 27: the mid boss's phases, timers and exposure (SB-1850); 26: the yard's assist (SB-1840); 25: the fortress gun's burst under way (SB-1830); 24: the friends lost on the way, `losses` (SB-1820); 23: a cue may wait on the mission's flags (SB-1810); 22: the map runs back to z -300 and the fortress moves the targets, so an old rects and targets do not fit (SB-1800); 21: the fist's wait, lunge and blow clock, `melee` (SB-1750, 1755); 20: a pillbox remembers that it has been shot once, `shot` (SB-2022); 19: the allies' support fire under way, `cover`, is kept (SB-2024); 18: the one-time radio line about breaking a pillbox with a charge is kept (SB-2017); 17: a held defender's post, hide/step-out and the post it runs to, and a pillbox's suppression, are kept (SB-2015); 16: a milestone's short slowdown and the mortar's lull are kept (SB-2010); 15: the three craft stand a hull and a gap apart and the allies leave their decks when the landing ends (an old suspend holds their old deck points); 14: an enemy may be put out asleep and held (`dormant`) until a script's `wake`; 13: the five allies are aboard the crafts beside the player's from the intro; 12: the script remembers that the mech has left the craft; 11: the script remembers which blast points have opened their line (the cover mechs' way on); 10: the landing craft's boxes and the mech's start on its deck change what an old cutscene's left seconds mean; 9: an ally's ground height and its radio call are kept; 8: the radio queue is kept; 7: the aimed mortar remembers where the mech stood; 6: a machine-gun nest's burst under way; 5: a blasted line stays open; 4: the planted charges, their fuses and the hold under way

// The game as a suspend keeps it: every field of GameModel except the ones listed in suspendOf. `map` and `mission` are
// definitions nothing writes to, so they go by id (below) and come back from the tables; `checkpoint` is kept apart; the
// battle layer (`battle`, `battleTune`) is rebuilt from the sectors on the resume.
type SuspendedGame = Omit<
  GameModel,
  'events' | 'bullets' | 'shells' | 'nav' | 'map' | 'mission' | 'checkpoint' | 'battle' | 'battleTune'
>;
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
// GameModel is kept unless it is added to the list. `events` and `bullets` are the frame's own, `shells` (a warning
// before it lands) is dropped as a checkpoint drops it, so a shell warned and not landed is gone after the resume, and
// `nav` is made again from the rects on the first frame with an enemy.
export function suspendOf(game: GameModel): SuspendData {
  const {
    events: _events,
    bullets: _bullets,
    shells: _shells,
    nav: _nav,
    battle: _battle,
    battleTune: _battleTune,
    map,
    mission,
    checkpoint,
    ...kept
  } = game;
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
  sectors: 'objectOrNull', // the front's sectors (SB-2210); null where they do not run
  trickle: 'objectOrNull', // the front's trickle (SB-2230); null where the sectors do not run
  radio: 'objectOrNull',
  radioQueue: 'array',
  mech: 'object',
  armor: 'number',
  downed: 'boolean',
  rects: 'array',
  propBoxes: 'array',
  propRefs: 'array',
  breakables: 'array',
  targets: 'array',
  pillboxes: 'array',
  pillboxHint: 'boolean',
  enemies: 'array',
  allies: 'array', // the scripted friends (SB-170): where each runs, the height under it, the call it made and whether it is down
  assist: 'objectOrNull', // the survivors' assist (SB-1840): the waves it shoots at and the seconds to its next shot
  supportT: 'number', // the seconds to the infantry's next support shot (SB-2240)
  main: 'object',
  sub: 'object',
  melee: 'object',
  fcs: 'object',
  aimTarget: 'stringOrNull',
  barrages: 'array',
  aimed: 'objectOrNull',
  shutters: 'array',
  battery: 'object',
  fortressGun: 'object', // the fortress nest's burst under way (SB-1830)
  mines: 'array',
  blasts: 'array',
  charges: 'array',
  plant: 'objectOrNull',
  slow: 'objectOrNull', // a milestone's slowdown, while it runs (SB-2010)
  cover: 'objectOrNull', // the allies' support fire, while it runs (SB-2024)
  calm: 'objectOrNull', // the enemy mortar's lull, while it runs (SB-2010)
  brokenProps: 'array', // the fortress blast's lowered walls (SB-1860)
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

// A save from before the fortress nest's plate has no shutter for it: add it, open when its flag already stands.
function addMissingShutters(held: Pick<GameModel, 'targets' | 'shutters' | 'script'>): void {
  for (const shutter of newShutters(held.targets.map(target => target.id))) {
    if (held.shutters.some(item => item.target === shutter.target)) continue;
    const flag = M1_SHUTTERS.find(def => def.target === shutter.target)?.opensOnFlag;
    held.shutters.push({ ...shutter, open: flag !== undefined && held.script.flags.includes(flag) });
  }
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
  // An old save kept a broken target's rect at the wall's height; the wreck the view draws is low, so the rect is too.
  const hold = sectorHold(kept.sectors, kept.script.blasts, map.blasts ?? []);
  const game = {
    ...kept,
    map,
    mission,
    battle: newBattle(stream('crowd'), map.bounds, PLAY_BATTLE_TUNE, hold.holdZ, map.spawns[M1_NEST_WAVE] ?? []),
    battleTune: PLAY_BATTLE_TUNE,
    bullets: [],
    shells: [],
    nav: newNav(),
    events: [],
    checkpoint,
  };
  lowerBrokenTargetRects(game);
  addMissingShutters(game);
  if (checkpoint !== null) addMissingShutters(checkpoint);
  // the shots and shells in flight are gone, so the mid boss starts its phase again (SB-1850)
  for (const enemy of game.enemies) if (enemy.warden) restartWarden(enemy.warden);
  return game;
}
