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

// The enemy a wave puts out, by the wave's name in the mission's script. A wave that is not here puts out nothing:
// `beach-mortar` (the mortar, SB-190's third card) and `battery` (the boss) are made by other cards.
export const M1_WAVE_ENEMY: Readonly<Partial<Record<string, EnemyKind>>> = {
  'b-squad': 'grunt',
  'depot-guard': 'grunt',
  'seawall-drop': 'grunt',
  'c-squad': 'grunt',
};

// The height a wave's enemies come in at (m), by the wave's name. A wave that is not here comes in on the ground. The
// enemies of `seawall-drop` stand on top of the seawall and jump down to its seaward side (logic/enemies.ts).
export const M1_WAVE_DROP: Readonly<Partial<Record<string, number>>> = {
  'seawall-drop': PROP_SIZE.seawall.h,
};
