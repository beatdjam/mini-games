// The battle behind the sortie and #view-fx (SB-170): which way the allies walk and when and where the shells fall. Pure
// functions over a small state, with the random draw passed in; no three and no DOM, so a node test can run them. The
// sortie keeps this state in GameModel and step moves it; the view (view/battle/) only draws what it is given. What the
// shells and the walkers look like is the view's; nothing here touches the mech or the rest of the game's state.
import type { Rng } from '@engine/core/index.ts';
import type { MapBounds, SpawnPoint } from '../data/types.ts';
import type { FxTune, InfantryTune } from '../data/tune.ts';
import type { GroundRect } from './collide.ts';
import { fallNear, hurtNear, newCrowd, spawnWave, stepCrowd, type Crowd, type Soldier } from './crowd.ts';

const SHELL_FIRST = 0.5; // the first shell comes this share of FxTune.shellEvery after the start
const SHAKE_DIST = 10; // the distance the shell's shake is told for (m); a shell nearer than this shakes no more than at it

export interface BattleState {
  crowd: Crowd; // the allies walking landward
  shellT: number; // seconds until the next shell (s)
}

// A shell the battle lets fall: where, and how far the camera should shake for it (m).
export interface ShellFall {
  x: number;
  z: number;
  shake: number;
}

// What one frame of the battle did, for the view to show.
export interface BattleFrame {
  fell: Soldier[]; // the soldiers that fell this frame
  shellFell: Soldier[]; // the soldiers a shell of this frame brought down by their health (the main sortie only)
  shell: ShellFall | null; // the shell that landed this frame, if one did
}

// The battle at its start: the first wave on the map's sea edge, the next wave after tune.allyWaves, and the first shell
// half an interval in (none when tune.shellEvery is 0). The draws are the first wave's. `holdZ` is where the allies wait
// while the battle is held; null lets them walk on to the far line as before. `nests` are the machine-gun nests' places:
// the squads of a wave walk on them and fall in their fire.
export function newBattle(
  rng: Rng,
  bounds: MapBounds,
  tune: FxTune,
  holdZ: number | null = null,
  nests: readonly SpawnPoint[] = [],
): BattleState {
  const crowd = newCrowd();
  crowd.holdZ = holdZ;
  crowd.nests = nests;
  spawnWave(crowd, rng, bounds, Math.round(tune.allies), tune);
  crowd.waveT = tune.allyWaves;
  return { crowd, shellT: tune.shellEvery > 0 ? tune.shellEvery * SHELL_FIRST : 0 };
}

// Moves the battle by one frame: the crowd walks (waits at its holdZ while `held`), and when the shell's time comes one
// lands at a place between tune.shellNear and tune.shellFar from `at` (the mech) in a random direction. The shell's draws
// are the distance and the angle, in that order, and none while no shell lands; the soldiers near it are hit after them.
// With an `infantry` tune the main sortie's shell takes health (SB-2271) and the ones it brings down come back in
// `shellFell`; without one, #view-fx keeps the instant fall of fallNear. `walls` are the fortress wall rects the sortie
// hands in (SB-2284), which the walker steers round; with none its walk and draws are the old ones.
export function stepBattle(
  state: BattleState,
  rng: Rng,
  dt: number,
  tune: FxTune,
  at: { x: number; z: number },
  held = false,
  infantry: InfantryTune | null = null,
  walls: readonly GroundRect[] = [],
): BattleFrame {
  const fell = stepCrowd(state.crowd, rng, dt, tune, held, at.z, walls);
  let shellFell: Soldier[] = [];
  let shell: ShellFall | null = null;
  if (tune.shellEvery > 0) {
    state.shellT -= dt;
    if (state.shellT <= 0) {
      const dist = tune.shellNear + rng.rand(0, Math.max(0, tune.shellFar - tune.shellNear));
      const angle = rng.rand(0, Math.PI * 2);
      shell = {
        x: at.x + Math.cos(angle) * dist,
        z: at.z + Math.sin(angle) * dist,
        shake: (tune.shellShake * SHAKE_DIST) / Math.max(SHAKE_DIST, dist),
      };
      state.shellT = Math.max(0.01, tune.shellEvery);
      if (infantry === null) {
        fell.push(...fallNear(state.crowd, shell.x, shell.z, tune.shellFallRadius, tune.shellFallShare, rng));
      } else {
        shellFell = hurtNear(
          state.crowd,
          shell.x,
          shell.z,
          tune.shellFallRadius,
          tune.shellFallShare,
          infantry.shellDamage,
          infantry.shellDamageProne,
          rng,
        );
      }
    }
  }
  return { fell, shellFell, shell };
}
