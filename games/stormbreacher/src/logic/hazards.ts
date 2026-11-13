// The hazards that hurt the mech without a shot (SB-190): the mortar barrage, a warning ring that becomes a blast, and the
// mines on the beach. Pure functions on small states; nothing here reads three or the DOM, and the random draw comes in as
// an argument. logic/game.ts keeps the states, takes the armour and reports the events.
import { distXZ, type Rng } from '@engine/core/index.ts';
import { AIMED_MORTAR, BARRAGES, MINE_TUNE, type BarrageKind } from '../data/hazards.ts';

// A barrage that has started: it counts down while the mech is in reach, and a warning comes at 0.
export interface BarrageState {
  wave: string; // the wave that started it
  kind: BarrageKind;
  wait: number; // the seconds to the next warning
}

// The aimed mortar that has started: the place the mech has stayed at, and how long it has stayed there.
export interface AimedState {
  anchor: Spot; // the place the mech counts its stay from
  still: number; // the seconds the mech has stayed near the anchor
}

// A warned shell: where it will land, how wide the blast is, how long is left and what it takes.
export interface ShellState {
  x: number;
  z: number;
  radius: number;
  warn: number; // the seconds the warning lasts in all
  left: number; // the seconds to the landing
  damage: number;
}

// A mine still on the ground.
export interface MineState {
  x: number;
  z: number;
  hp: number;
}

export interface Spot {
  x: number;
  z: number;
}

// A new barrage; its first warning comes one interval after the mech is in reach.
export function newBarrage(wave: string, kind: BarrageKind): BarrageState {
  return { wave, kind, wait: BARRAGES[kind].interval };
}

// Whether the barrage's shells reach the mech where it stands: z from minZ to maxZ.
export function inReach(kind: BarrageKind, mech: Spot): boolean {
  const def = BARRAGES[kind];
  return mech.z >= def.minZ && mech.z <= def.maxZ;
}

// Counts the barrage down by `dt` while the mech is in reach, and returns a new warned shell when the count reaches 0
// (the count starts again). `slow` (1 for none) makes the interval that many times as long. The shell is aimed at the mech moved 0 to `aimJitter` in a random direction; that is two
// draws from `rng`, and none while there is no warning.
export function stepBarrage(barrage: BarrageState, mech: Spot, dt: number, rng: Rng, slow = 1): ShellState | null {
  const def = BARRAGES[barrage.kind];
  if (!inReach(barrage.kind, mech)) return null;
  barrage.wait -= dt / slow;
  if (barrage.wait > 0) return null;
  barrage.wait += def.interval;
  const angle = rng.rand(0, Math.PI * 2);
  const away = rng.rand(0, def.aimJitter);
  return {
    x: mech.x + Math.sin(angle) * away,
    z: mech.z + Math.cos(angle) * away,
    radius: def.radius,
    warn: def.warn,
    left: def.warn,
    damage: def.damage,
  };
}

// A new aimed mortar: it counts the mech's stay from where the mech stands now.
export function newAimed(mech: Spot): AimedState {
  return { anchor: { x: mech.x, z: mech.z }, still: 0 };
}

// Whether the aimed mortar reaches the mech where it stands: z from minZ to maxZ. Kept apart from inReach, which takes a
// BarrageKind.
export function aimedInReach(mech: Spot): boolean {
  return mech.z >= AIMED_MORTAR.minZ && mech.z <= AIMED_MORTAR.maxZ;
}

// Counts the time the mech has stayed near the anchor by `dt`, and returns a warned shell aimed at the mech's place when
// the stay reaches stillSec (the count starts again). Out of reach, or once the mech leaves the still radius, the anchor
// becomes the mech's place and the count goes back to 0. The height is not looked at: a jump in place counts as standing.
// No random draw: the shell comes down on the place itself.
export function stepAimed(state: AimedState, mech: Spot, dt: number): ShellState | null {
  if (!aimedInReach(mech)) {
    state.anchor = { x: mech.x, z: mech.z };
    state.still = 0;
    return null;
  }
  if (distXZ(state.anchor, mech) > AIMED_MORTAR.stillRadius) {
    state.anchor = { x: mech.x, z: mech.z };
    state.still = 0;
  } else {
    state.still += dt;
  }
  if (state.still < AIMED_MORTAR.stillSec) return null;
  state.still = 0;
  return {
    x: mech.x,
    z: mech.z,
    radius: AIMED_MORTAR.radius,
    warn: AIMED_MORTAR.warn,
    left: AIMED_MORTAR.warn,
    damage: AIMED_MORTAR.damage,
  };
}

// Counts every shell down by `dt`, takes the ones that landed out of `shells` (in place) and returns them.
export function stepShells(shells: ShellState[], dt: number): ShellState[] {
  const landed: ShellState[] = [];
  for (const shell of shells) shell.left -= dt;
  for (let i = shells.length - 1; i >= 0; i--) {
    if (shells[i].left > 0) continue;
    landed.unshift(shells[i]);
    shells.splice(i, 1);
  }
  return landed;
}

// Whether the mech's feet are inside the circle.
export function inCircle(circle: Spot, radius: number, mech: Spot): boolean {
  return distXZ(circle, mech) <= radius;
}

// Whether the mech's feet are on the mine.
export function mineStepped(mine: Spot, mech: Spot): boolean {
  return inCircle(mine, MINE_TUNE.stepRadius, mech);
}
