// The infantry's support fire (SB-2240): the soldiers who have reached a sector's hold line shoot the nearest awake
// enemy in range, one shot at a time, at a rate that grows with how many of them have arrived. A shot is only reported
// here: game.ts takes the target's health and sets its suppression, so the fall still goes through damageEnemy. Pure
// over the small world it is given (game.ts is not imported), and the draws come from the crowd's stream. +z is the sea.
import { clamp, distXZ, type Rng } from '@engine/core/index.ts';
import { ENEMIES, ENEMY_CHEST, type EnemyKind } from '../data/enemies.ts';
import { SUPPORT_TUNE } from '../data/sectors.ts';
import type { Crowd } from './crowd.ts';
import { arrivedSoldiers, type SectorHold } from './sectors.ts';

// What the support needs to know of one enemy. A posted defender is a target only while it has stepped out; a dormant
// enemy (a sleeping nest) is never one.
export interface SupportFoe {
  id: string;
  kind: EnemyKind;
  x: number;
  z: number;
  y: number;
  hp: number;
  awake: boolean;
  dormant: boolean;
  post: number | null;
  holdOut: boolean;
}

// What one frame of the support needs: the infantry, the enemies, the wait left to the next shot (kept in GameModel)
// and the hold line the infantry is waiting at.
export interface SupportWorld {
  battle: { crowd: Crowd };
  enemies: readonly SupportFoe[];
  supportT: number;
  hold: SectorHold;
}

// A shot the infantry fired: the target, the factor the strength was worked out with, and the two ends of the tracer.
export interface SupportShot {
  enemy: string;
  factor: number;
  from: { x: number; z: number };
  to: { x: number; y: number; z: number };
}

// The share of a target's health that one shot takes, for a factor `f`: damageBase + damagePer * f.
export function supportDamage(maxHp: number, factor: number): number {
  return maxHp * (SUPPORT_TUNE.damageBase + SUPPORT_TUNE.damagePer * factor);
}

// The nearest enemy a soldier at `from` may shoot: living, awake, not dormant, not the mid boss (its exposure rules the
// damage it takes, which the infantry would go around), and out of cover (a posted defender only
// while it has stepped out), within SUPPORT_TUNE.range. With none, null.
function nearestFoe(enemies: readonly SupportFoe[], from: { x: number; z: number }): SupportFoe | null {
  let pick: SupportFoe | null = null;
  let best = SUPPORT_TUNE.range;
  for (const enemy of enemies) {
    if (enemy.hp <= 0 || !enemy.awake || enemy.dormant || enemy.kind === 'warden') continue;
    if (enemy.post !== null && !enemy.holdOut) continue;
    const dist = distXZ(from, enemy);
    if (dist > best) continue;
    best = dist;
    pick = enemy;
  }
  return pick;
}

// Moves the support fire on by one frame. Only a held line shoots: with no hold line the infantry is walking on and does
// nothing. The arrived soldiers cap the shooters (SUPPORT_TUNE.shooters), and their number gives the factor
// clamp(arrived / factorPer, minFactor, maxFactor). The frame's shots are n * f / ((intervalMin + intervalMax) / 2) a
// second, held in supportT, so a long frame fires every shot that came due. Each shot picks one arrived soldier at random
// and goes at the nearest enemy it may shoot; with none the time is still spent. The returned shots carry where the
// soldier and the enemy's chest are, for the tracer.
export function stepSupport(world: SupportWorld, rng: Rng, dt: number): SupportShot[] {
  const shots: SupportShot[] = [];
  if (!world.hold.held) {
    world.supportT = 0;
    return shots;
  }
  const arrived = arrivedSoldiers(world.battle.crowd, world.hold.holdZ);
  if (arrived.length === 0) {
    world.supportT = 0;
    return shots;
  }
  const factor = clamp(arrived.length / SUPPORT_TUNE.factorPer, SUPPORT_TUNE.minFactor, SUPPORT_TUNE.maxFactor);
  const shooters = Math.min(arrived.length, SUPPORT_TUNE.shooters);
  const every = (SUPPORT_TUNE.intervalMin + SUPPORT_TUNE.intervalMax) / 2;
  const rate = (shooters * factor) / every;
  world.supportT -= Math.max(0, dt);
  while (world.supportT <= 0) {
    world.supportT += 1 / rate;
    const soldier = rng.pick(arrived);
    const target = nearestFoe(world.enemies, soldier);
    if (target === null) continue;
    shots.push({
      enemy: target.id,
      factor,
      from: { x: soldier.x, z: soldier.z },
      to: { x: target.x, y: target.y + ENEMIES[target.kind].height * ENEMY_CHEST, z: target.z },
    });
  }
  return shots;
}
