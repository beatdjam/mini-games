// The battle behind the sortie and #view-fx (SB-170): which way the allies walk and when and where the shells fall. Pure
// functions over a small state, with the random draw passed in; no three and no DOM, so a node test can run them. What
// the shells and the walkers look like is the view's (view/battle/); nothing here touches the mech or the game's state.
import type { Rng } from '@engine/core/index.ts';
import type { MapBounds } from '../data/types.ts';
import type { FxTune } from '../data/tune.ts';
import { newCrowd, spawnWave, stepCrowd, type Crowd, type Soldier } from './crowd.ts';

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
  shell: ShellFall | null; // the shell that landed this frame, if one did
}

// The battle at its start: the first wave on the map's sea edge, the next wave after tune.allyWaves, and the first shell
// half an interval in (none when tune.shellEvery is 0). The draws are the first wave's.
export function newBattle(rng: Rng, bounds: MapBounds, tune: FxTune): BattleState {
  const crowd = newCrowd();
  spawnWave(crowd, rng, bounds, Math.round(tune.allies));
  crowd.waveT = tune.allyWaves;
  return { crowd, shellT: tune.shellEvery > 0 ? tune.shellEvery * SHELL_FIRST : 0 };
}

// Moves the battle by one frame: the crowd walks, and when the shell's time comes one lands at a place between
// tune.shellNear and tune.shellFar from `at` (the mech) in a random direction. The shell's draws are the distance and the
// angle, in that order, and none while no shell lands.
export function stepBattle(
  state: BattleState,
  rng: Rng,
  dt: number,
  tune: FxTune,
  at: { x: number; z: number },
): BattleFrame {
  const fell = stepCrowd(state.crowd, rng, dt, tune);
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
    }
  }
  return { fell, shell };
}
