// The enemies' table (SB-190). Every value here is provisional. The kinds are the enemies that walk and shoot; adding
// one is a line in ENEMIES (and in ENEMY_KINDS, ENEMY_COLOR and the language files' `target.<kind>`).
import { PROP_SIZE } from './props.ts';

export type EnemyKind = 'grunt' | 'assault' | 'heavy';

export const ENEMY_KINDS: readonly EnemyKind[] = ['grunt', 'assault', 'heavy'];

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
};

// The height a shot leaves an enemy at, as a share of its height.
export const ENEMY_CHEST = 0.7;

// The enemies a wave puts out, in the order of the map's spawn points for that wave: the i-th place gets the i-th kind.
// The list must be as long as `map.spawns[wave]`; a wave that is not here, or a list of another length, puts out nothing.
// `beach-mortar` (the mortar, SB-190's third card) and `battery` (the boss) are made by other cards.
export const M1_WAVE_ENEMY: Readonly<Partial<Record<string, readonly EnemyKind[]>>> = {
  // a heavy on the left, an assault next, two grunts in the middle, then an assault and a grunt on the right, so the
  // mech must choose between the hard target and the fast ones
  'b-squad': ['heavy', 'assault', 'grunt', 'grunt', 'assault', 'grunt'],
  // an assault meets the mech on the way in, a heavy fires from the east end, and a grunt stands between them, so the
  // guard watches the road and the open flank
  'depot-guard': ['assault', 'heavy', 'grunt'],
  // from the top of the seawall: an assault and a grunt on the left, a heavy in the middle, then a grunt, an assault and
  // a grunt on the right
  'seawall-drop': ['assault', 'grunt', 'heavy', 'grunt', 'assault', 'grunt'],
  // an assault, a grunt and another assault spread across the left and middle, and a heavy on the east end; all four
  // stand on one row, so the mech meets them together as it crosses C
  'c-squad': ['assault', 'grunt', 'assault', 'heavy'],
};

// The height a wave's enemies come in at (m), by the wave's name. A wave that is not here comes in on the ground. The
// enemies of `seawall-drop` stand on top of the seawall and jump down to its seaward side (logic/enemies.ts).
export const M1_WAVE_DROP: Readonly<Partial<Record<string, number>>> = {
  'seawall-drop': PROP_SIZE.seawall.h,
};
