// The enemies' table (SB-190). Every value here is provisional. The kinds are the enemies that walk and shoot; adding
// one is a line in ENEMIES (and in ENEMY_KINDS, the kind's look and the language files' `target.<kind>`).
import { FORTRESS_TUNE } from './fortress.ts';
import { PROP_SIZE } from './props.ts';

// The kinds drawn as a soldier's mech (SB-2083, the kit table in data/enemyLooks.ts and data/mechProto.ts); the
// machine-gun nest is a model of its own (SB-1981) and keeps its parts in view/enemies.ts.
export type SoldierKind = 'grunt' | 'assault' | 'heavy';
export const SOLDIER_KINDS: readonly SoldierKind[] = ['grunt', 'assault', 'heavy'];

export type EnemyKind = SoldierKind | 'emplacement';

export const ENEMY_KINDS: readonly EnemyKind[] = [...SOLDIER_KINDS, 'emplacement'];

// A burst of shots: `shots` of them, swept from -arcDeg/2 to +arcDeg/2 across the way to the mech, `interval` seconds
// apart, then the next burst after `rest` seconds.
export interface EnemyBurst {
  shots: number;
  arcDeg: number;
  interval: number; // s
  rest: number; // s
}

export interface EnemyDef {
  hp: number; // the health a new enemy has
  height: number; // m
  radius: number; // the hit radius on the ground (m); a shot's box is x and z +- radius, y from the ground to `height`
  speed: number; // how fast it walks (m/s)
  notice: number; // the mech's distance at which a sleeping enemy wakes (m)
  stopDist: number; // it stops walking toward the mech at this distance (m)
  fireRange: number; // it shoots only when the mech is this near (m); also how far its shot flies
  fireInterval: number; // the seconds between one shot and the next
  damage: number; // what one shot takes off the mech's armour
  bulletSpeed: number; // m/s
  spread: number; // the shot's drift from its aim (deg)
  static?: boolean; // it never walks or is pushed; it still shoots (a machine-gun nest)
  burst?: EnemyBurst; // shoots a burst rather than one shot; a kind without it keeps the one-shot way
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  // the rifle: it stops at rifle range and fires from there, so closing in is the answer
  grunt: {
    hp: 40, // 4 autocannon shots (WEAPONS.autocannon.damage 10) or 1 heavy gun shot (60)
    height: 3,
    radius: 0.75,
    speed: 3.5,
    notice: 120,
    stopDist: 25,
    fireRange: 80,
    fireInterval: 1.5,
    damage: 4,
    bulletSpeed: 150,
    spread: 3,
  },
  // the assault: it runs in to point-blank and fires on the way, so it has to be put down quickly
  assault: {
    hp: 20, // 2 autocannon shots
    height: 2.4,
    radius: 0.6,
    speed: 6.5,
    notice: 120,
    stopDist: 4, // outside the 2.5 m enemies keep apart, so a pack of them does not pile on the mech
    fireRange: 30,
    fireInterval: 1,
    damage: 3,
    bulletSpeed: 150,
    spread: 5,
  },
  // the heavy: it stops far out and fires one heavy shot at a long interval, so it takes time to wear down
  heavy: {
    hp: 120, // 12 autocannon shots or 2 heavy gun shots
    height: 3.5, // taller than a grunt, still under the mech's 4 m
    radius: 0.75, // the same as a grunt, so the nav grid (NAV_RADIUS) does not change
    speed: 2.2,
    notice: 120,
    stopDist: 35,
    fireRange: 100,
    fireInterval: 3.5,
    damage: 12,
    bulletSpeed: 130,
    spread: 2,
  },
  // the machine-gun nest: it stands still and sweeps a burst across the way to the mech. It is awake as soon as it is put
  // out (`notice` Infinity), and its range (180m) covers both of B's lines, so a nest fires as soon as the line it
  // guards is not between it and the mech. All of the values are provisional.
  emplacement: {
    hp: 140, // 14 autocannon shots or 3 heavy gun shots
    height: 2.2,
    radius: 1.4,
    speed: 0,
    notice: Infinity,
    stopDist: 0,
    fireRange: 180,
    fireInterval: 2.4, // the first wait before the first burst; after that the burst's own `rest` rules
    damage: 3,
    bulletSpeed: 170,
    spread: 3,
    static: true,
    burst: { shots: 6, arcDeg: 36, interval: 0.16, rest: 2.4 },
  },
};

// The height a shot leaves an enemy at, as a share of its height.
export const ENEMY_CHEST = 0.7;

// The wave of the machine-gun nests on M1's B line (the six nests' places are the map's spawns for it). The battle layer
// puts a squad on a nest and lets it fall in that nest's fire (logic/crowd.ts).
export const M1_NEST_WAVE = 'b-emplacements';

// The enemies a wave puts out, in the order of the map's spawn points for that wave: the i-th place gets the i-th kind.
// The list must be as long as `map.spawns[wave]`; a wave that is not here, or a list of another length, puts out nothing.
// `beach-mortar` (the mortar, SB-190's third card) and `battery` (the boss) are made by other cards.
export const M1_WAVE_ENEMY: Readonly<Partial<Record<string, readonly EnemyKind[]>>> = {
  // a heavy on the left, an assault next, two grunts in the middle, then an assault and a grunt on the right, so the
  // mech must choose between the hard target and the fast ones
  'b-squad': ['heavy', 'assault', 'grunt', 'grunt', 'assault', 'grunt'],
  // three walking guards round the depot and a machine-gun nest on the way in; the cliff side is the hard approach
  'depot-guard': ['grunt', 'grunt', 'grunt', 'emplacement'],
  // from the top of the seawall: an assault and a grunt on the left, a heavy in the middle, then a grunt, an assault and
  // a grunt on the right
  'seawall-drop': ['assault', 'grunt', 'heavy', 'grunt', 'assault', 'grunt'],
  // six nests, one at each of the map's places: entering B wakes them all, and a nest whose line to the mech is clear
  // fires; the hedgehogs of a line hide the nests beyond it until the mech crosses
  'b-emplacements': ['emplacement', 'emplacement', 'emplacement', 'emplacement', 'emplacement', 'emplacement'],
  // the defenders posted behind line 1 and behind line 2 (SB-2015): five riflemen each, one at each post in
  // DEFENDER_POSTS (data/defenders.ts). They hold their posts until a milestone breaks their line.
  'line1-hold': ['grunt', 'grunt', 'grunt', 'grunt', 'grunt'],
  'pillbox-hold': ['grunt', 'grunt', 'grunt', 'grunt', 'grunt'],
  // three from the fortress's sea wall: an assault and a grunt on the left and right, and an assault between them, so
  // the mech at the gate is taken from behind as it goes in (SB-1830)
  'fortress-drop': ['assault', 'grunt', 'assault'],
};

// The height a wave's enemies come in at (m), by the wave's name. A wave that is not here comes in on the ground. The
// enemies of `seawall-drop` stand on top of the seawall and jump down to its seaward side (logic/enemies.ts).
export const M1_WAVE_DROP: Readonly<Partial<Record<string, number>>> = {
  'seawall-drop': PROP_SIZE.seawall.h,
  'fortress-drop': FORTRESS_TUNE.wallH,
};
