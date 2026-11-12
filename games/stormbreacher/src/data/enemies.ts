// The enemies' table (SB-190). Every value here is provisional. The kinds are the enemies that walk and shoot; adding
// one is a line in ENEMIES (and in ENEMY_KINDS, ENEMY_COLOR and the language files' `target.<kind>`).
export type EnemyKind = 'grunt';

export const ENEMY_KINDS: readonly EnemyKind[] = ['grunt'];

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
