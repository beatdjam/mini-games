// The allies' fire that tells (SB-2301): a standing ally shoots the nearest enemy the infantry's support fire would pick,
// within its kit's range, at its kit's pace. A shot is only reported here; game.ts takes the target's health and sets its
// suppression, so the fall still goes through damageEnemy. Pure over the small world it is given (game.ts is not
// imported), and the wait to the next shot lives in the ally's own state. +z is the sea.
import { ENEMIES, ENEMY_CHEST } from '../data/enemies.ts';
import { ALLY_FIRE_TUNE, ALLY_TUNE, allyKitOf, type AllyKit } from '../data/allies.ts';
import type { AllyState } from './allies.ts';
import { nearestFoe, type SupportFoe } from './support.ts';

// What one frame of the allies' fire needs: the allies (whose `fireT` moves) and the enemies.
export interface AllyFireWorld {
  allies: readonly AllyState[];
  enemies: readonly SupportFoe[];
}

// A shot an ally fired: who shot it, which kit, the target, the health it takes and the two ends of the tracer.
export interface AllyFireShot {
  id: string;
  kit: AllyKit;
  enemy: string;
  damage: number;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
}

// The health one shot of the kit takes from a target of `maxHp`.
export function allyFireDamage(maxHp: number, kit: AllyKit): number {
  return maxHp * ALLY_FIRE_TUNE[kit].share;
}

// Moves the allies' fire on by one frame. A fallen ally does not shoot, and the ones on their feet are held by game.ts
// while a cutscene plays or the sortie is downed or cleared. Each ally counts its own wait down; a long frame fires every
// shot that came due. A shot goes at the nearest enemy its kit may hit (the same rules as the infantry's support fire, by
// nearestFoe in support.ts); with none the time is still spent. The returned shots carry where the ally and the enemy's
// chest are, for the tracer.
export function stepAllyFire(world: AllyFireWorld, dt: number): AllyFireShot[] {
  const shots: AllyFireShot[] = [];
  for (const ally of world.allies) {
    if (ally.down) continue;
    const kit = allyKitOf(ally.id);
    const tune = ALLY_FIRE_TUNE[kit];
    ally.fireT -= Math.max(0, dt);
    while (ally.fireT <= 0) {
      ally.fireT += tune.every;
      const target = nearestFoe(world.enemies, ally, tune.range);
      if (target === null) continue;
      shots.push({
        id: ally.id,
        kit,
        enemy: target.id,
        damage: allyFireDamage(ENEMIES[target.kind].hp, kit),
        from: { x: ally.x, y: ally.y + ALLY_TUNE.fireHeight, z: ally.z },
        to: { x: target.x, y: target.y + ENEMIES[target.kind].height * ENEMY_CHEST, z: target.z },
      });
    }
  }
  return shots;
}
