// The enemies' fire at the infantry (SB-2271): the walking enemies, the posted defenders and the machine-gun nests aim
// a share of their shots at the soldiers rather than the mech. The picked soldier is one still walking when there is one
// in reach, else one that has taken its ground; a shot at a soldier hits by chance and takes its health. A pure side of
// the game: game.ts draws the stream and puts the events out, so this file imports no game and no three. +z is the sea.
import { distXZ, type Rng } from '@engine/core/index.ts';
import { ENEMIES, ENEMY_CHEST, type EnemyKind } from '../data/enemies.ts';
import { SOLDIER_POSE } from '../data/soldiers.ts';
import { INFANTRY_TUNE, type InfantryTune } from '../data/tune.ts';
import { isPosted, type Crowd, type Soldier } from './crowd.ts';
import { fireRayHit, type Aabb } from './fire.ts';

// What the fire needs to know of the enemy that fired: where it stands and what kind it is.
export interface InfantryShooter {
  kind: EnemyKind;
  x: number;
  z: number;
}

// What one shot at the infantry did to one soldier: what happened, the health left and whether this shot is the first
// that aimed at the soldier in a while.
export interface InfantryShot {
  soldier: Soldier;
  hp: number;
  targeted: boolean; // the soldier had not been aimed at for targetedSec before this shot
  hit: boolean;
  downed: boolean;
}

// Whether an enemy's shot goes at the infantry rather than the mech. The caller draws it from stream('infantryFire') so
// the other streams do not move.
export function targetsInfantry(rng: Rng, tune: InfantryTune = INFANTRY_TUNE): boolean {
  return rng.next() < tune.targetShare;
}

// The soldier an enemy may aim at: living, within its fireRange, with no prop between the enemy's chest and the soldier.
// One still walking comes before one that has taken its ground (a post or the waiting line), and the nearest of that
// group is taken. With no soldier in reach, null. A mid boss does not aim at the infantry (SB-2271).
export function pickInfantry(crowd: Crowd, enemy: InfantryShooter, propBoxes: readonly Aabb[]): Soldier | null {
  if (enemy.kind === 'warden') return null;
  const def = ENEMIES[enemy.kind];
  const chest = def.height * ENEMY_CHEST;
  let walking: Soldier | null = null;
  let walkingDist = Infinity;
  let posted: Soldier | null = null;
  let postedDist = Infinity;
  for (const soldier of crowd.soldiers) {
    if (!soldier.alive) continue;
    const dist = distXZ(enemy, soldier);
    if (dist > def.fireRange) continue;
    const dx = soldier.x - enemy.x;
    const dy = SOLDIER_POSE.bodyY - chest;
    const dz = soldier.z - enemy.z;
    const length = Math.hypot(dx, dy, dz);
    if (fireRayHit(enemy.x, chest, enemy.z, dx, dy, dz, length, propBoxes) !== null) continue;
    if (isPosted(soldier)) {
      if (dist < postedDist) {
        posted = soldier;
        postedDist = dist;
      }
    } else if (dist < walkingDist) {
      walking = soldier;
      walkingDist = dist;
    }
  }
  return walking ?? posted;
}

// Fires one of the enemy's shots at the infantry. With no soldier in reach it does nothing. The picked soldier is hit by
// INFANTRY_TUNE.hitChance; a machine-gun nest's shot sweeps every living soldier within sweepRadius of it with the same
// roll, as its burst is drawn across them. A hit takes shotDamage of the enemy's kind off the soldier's health, less for
// one that has taken its ground, and a soldier whose health reaches 0 falls. Gives back what each shot did, for game.ts
// to put the events out.
export function fireAtInfantry(
  crowd: Crowd,
  enemy: InfantryShooter,
  propBoxes: readonly Aabb[],
  rng: Rng,
  tune: InfantryTune = INFANTRY_TUNE,
): InfantryShot[] {
  if (enemy.kind === 'warden') return [];
  const picked = pickInfantry(crowd, enemy, propBoxes);
  if (picked === null) return [];
  const damage = tune.shotDamage[enemy.kind];
  const targets =
    enemy.kind === 'emplacement'
      ? crowd.soldiers.filter(soldier => soldier.alive && distXZ(soldier, picked) <= tune.sweepRadius)
      : [picked];
  const shots: InfantryShot[] = [];
  for (const soldier of targets) {
    const targeted = soldier.targetedT <= 0;
    soldier.targetedT = tune.targetedSec;
    if (rng.next() >= tune.hitChance) {
      shots.push({ soldier, hp: soldier.hp, targeted, hit: false, downed: false });
      continue;
    }
    soldier.hp -= damage * (isPosted(soldier) ? tune.postedMul : 1);
    const downed = soldier.hp <= 0;
    if (downed) {
      soldier.alive = false;
      soldier.deadT = 0;
      crowd.fallen++;
    }
    shots.push({ soldier, hp: soldier.hp, targeted, hit: true, downed });
  }
  return shots;
}
