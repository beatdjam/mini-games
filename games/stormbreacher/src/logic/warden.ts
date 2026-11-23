// The heavy command mech's own step (SB-1850). game.ts keeps the same EnemyState as for the other kinds, but a warden
// does not use stepEnemy: this file walks it out, turns it, fires its burst through a telegraph, charges when a special is
// due, drops its shoulder mortars in the second phase, and turns a charge stopped by a wall into the two seconds it is
// exposed. Its health, height, hit radius and one burst shot's damage stay in ENEMIES.warden; everything else is
// WARDEN_TUNE. Nothing here reads three or the DOM, and the random draws come in as an argument.
import type { Rng } from '@engine/core/index.ts';
import { ENEMIES, ENEMY_CHEST } from '../data/enemies.ts';
import { MECH_TUNE } from '../data/tune.ts';
import { WARDEN_TUNE } from '../data/warden.ts';
import { pushOutCircle } from './collide.ts';
import type { EnemyShot, EnemyWorld } from './enemies.ts';
import { spreadDir } from './fcs.ts';
import { fireRayHit } from './fire.ts';
import type { ShellState } from './hazards.ts';
import { navTarget } from './nav.ts';

export type WardenPhase = 'walkout' | 'burst' | 'charge' | 'stagger' | 'mortar' | 'dying';

// The warden's own state, kept on EnemyState.warden. `dying` is the seconds left before the blast and -1 once it has
// blown, so the one `down` is reported exactly once.
export interface WardenState {
  phase: WardenPhase;
  timer: number; // s left in the phase, or before the next shot of the burst
  burstLeft: number; // the burst's shots left, or the mortar's shells left
  chargeLeft: number; // m of the charge still to run
  exposed: number; // s the back plate is open after a stopped charge
  mortarT: number; // s to the next special (a charge, or a mortar in the second phase)
  rammed: boolean; // whether this charge has already struck the mech (a charge strikes it once)
  called: boolean; // whether the two assaults have been called
  dying: number; // s left before the blast; -1 once it has blown
}

// The body a warden step needs, which EnemyState is.
export interface WardenBody {
  x: number;
  z: number;
  yaw: number;
  hp: number;
}

export interface WardenStepResult {
  shots: EnemyShot[];
  shells: ShellState[];
  addWave: boolean;
  down: boolean;
  ram: { dx: number; dz: number } | null; // the charge's ground direction on the frame it strikes the mech, once per charge
}

// The dot of a shot's ground direction with the warden's front, either side of which the plate is the front or the back.
const FRONT_DOT = -0.5;
const BACK_DOT = 0.5;

export function newWarden(): WardenState {
  return {
    phase: 'walkout',
    timer: WARDEN_TUNE.walkOutSec,
    burstLeft: 0,
    chargeLeft: 0,
    exposed: 0,
    mortarT: 0,
    rammed: false,
    called: false,
    dying: 0,
  };
}

// Puts a warden that comes back from a checkpoint or a resume at the head of its phase (SB-1850). The shots and shells in
// flight are dropped on the way back, so a burst, a charge, a stagger or a volley under way would be left half done: it
// waits out a rest instead and chooses again. The walk-out, the fall and the once-only call are left as they were.
export function restartWarden(state: WardenState): void {
  if (state.phase === 'walkout' || state.phase === 'dying') return;
  state.phase = 'burst';
  state.burstLeft = 0;
  state.timer = WARDEN_TUNE.burstRest;
  state.chargeLeft = 0;
  state.exposed = 0;
  state.mortarT = WARDEN_TUNE.mortarEvery;
  state.rammed = false;
}

// A shot from where the warden stands, at the mech's chest, with the kind's spread.
function shotAt(enemy: WardenBody, mech: { x: number; y: number; z: number }, rng: Rng): EnemyShot {
  const y = ENEMIES.warden.height * ENEMY_CHEST;
  const aimed = spreadDir(
    { dx: mech.x - enemy.x, dy: mech.y + MECH_TUNE.chestHeight - y, dz: mech.z - enemy.z },
    ENEMIES.warden.spread,
    rng,
  );
  return { x: enemy.x, y, z: enemy.z, dx: aimed.dx, dy: aimed.dy, dz: aimed.dz };
}

// Whether the warden's chest has a clear line to the mech's chest, as stepEnemy checks it for the other kinds.
function lineClear(enemy: WardenBody, mech: { x: number; y: number; z: number }, world: EnemyWorld): boolean {
  const def = ENEMIES.warden;
  const dist = Math.hypot(mech.x - enemy.x, mech.z - enemy.z);
  if (dist > def.fireRange) return false;
  const y = def.height * ENEMY_CHEST;
  const dy = mech.y + MECH_TUNE.chestHeight - y;
  return (
    fireRayHit(enemy.x, y, enemy.z, mech.x - enemy.x, dy, mech.z - enemy.z, Math.hypot(dist, dy), world.propBoxes) ===
    null
  );
}

// Pushes the warden out of the walls and keeps it inside the map.
function settle(enemy: WardenBody, world: EnemyWorld): void {
  const radius = ENEMIES.warden.radius;
  const moved = pushOutCircle(enemy.x, enemy.z, radius, world.rects);
  const { minX, maxX, minZ, maxZ } = world.bounds;
  enemy.x = Math.min(Math.max(moved.x, minX + radius), maxX - radius);
  enemy.z = Math.min(Math.max(moved.z, minZ + radius), maxZ - radius);
}

// Turns the warden toward the mech at its slow rate.
function turnToward(enemy: WardenBody, mech: { x: number; z: number }, dt: number): void {
  const want = Math.atan2(enemy.x - mech.x, enemy.z - mech.z);
  const diff = Math.atan2(Math.sin(want - enemy.yaw), Math.cos(want - enemy.yaw));
  const most = WARDEN_TUNE.turnRate * dt;
  enemy.yaw += Math.max(-most, Math.min(most, diff));
}

// Walks toward the mech by up to `step`, by the nav's way when there is one, and stops at the kind's stopping distance.
function approach(enemy: WardenBody, mech: { x: number; z: number }, step: number, world: EnemyWorld): void {
  const def = ENEMIES.warden;
  const dist = Math.hypot(mech.x - enemy.x, mech.z - enemy.z);
  if (dist <= def.stopDist) return;
  const via = world.nav ? navTarget(world.nav, enemy.x, enemy.z, mech.x, mech.z) : null;
  const to = via ?? mech;
  const len = Math.hypot(to.x - enemy.x, to.z - enemy.z);
  if (len < 1e-9) return;
  const go = Math.min(step, len, dist - def.stopDist);
  enemy.x += ((to.x - enemy.x) / len) * go;
  enemy.z += ((to.z - enemy.z) / len) * go;
  settle(enemy, world);
}

// Starts the next burst after the telegraph.
function startBurst(state: WardenState): void {
  state.phase = 'burst';
  state.burstLeft = WARDEN_TUNE.burst.shots;
  state.timer = WARDEN_TUNE.burstTelegraph;
}

// Starts the special that is due: a charge in the first phase, a shoulder mortar in the second.
function startSpecial(state: WardenState, phase2: boolean): void {
  state.mortarT = WARDEN_TUNE.mortarEvery;
  if (phase2) {
    state.phase = 'mortar';
    state.timer = WARDEN_TUNE.burstTelegraph;
    state.burstLeft = WARDEN_TUNE.mortar.count;
    return;
  }
  state.phase = 'charge';
  state.timer = WARDEN_TUNE.charge.telegraph;
  state.chargeLeft = WARDEN_TUNE.charge.distance;
  state.rammed = false;
}

// A shell of the mortar volley, around the mech but within the spread.
function mortarShell(mech: { x: number; z: number }, rng: Rng): ShellState {
  const angle = rng.rand(0, Math.PI * 2);
  const away = rng.rand(0, WARDEN_TUNE.mortar.spread);
  return {
    x: mech.x + Math.sin(angle) * away,
    z: mech.z + Math.cos(angle) * away,
    radius: WARDEN_TUNE.mortar.radius,
    warn: WARDEN_TUNE.mortar.warn,
    left: WARDEN_TUNE.mortar.warn,
    damage: WARDEN_TUNE.mortar.damage,
  };
}

// One frame of the warden. The shots it fires and the shells it calls in are returned for game.ts to put out; `addWave`
// asks for the two assaults once, `down` comes on the frame the three seconds of smoke end, once, and `ram` is the charge's
// direction on the one frame it strikes the mech.
export function stepWarden(
  state: WardenState,
  enemy: WardenBody,
  mech: { x: number; y: number; z: number },
  world: EnemyWorld,
  dt: number,
  rng: Rng,
): WardenStepResult {
  const shots: EnemyShot[] = [];
  const shells: ShellState[] = [];
  const result: WardenStepResult = { shots, shells, addWave: false, down: false, ram: null };
  // already blown: nothing more happens
  if (state.dying < 0) return result;
  if (enemy.hp <= 0) {
    if (state.dying === 0) state.dying = WARDEN_TUNE.dieSec;
    state.phase = 'dying';
    state.dying -= dt;
    if (state.dying > 0) return result;
    state.dying = -1;
    result.down = true;
    return result;
  }

  const def = ENEMIES.warden;
  const phase2 = enemy.hp / def.hp <= WARDEN_TUNE.phase2At;
  if (!state.called && enemy.hp / def.hp <= WARDEN_TUNE.addsAt) {
    state.called = true;
    result.addWave = true;
  }
  if (state.mortarT > 0) state.mortarT = Math.max(0, state.mortarT - dt);
  if (state.exposed > 0) state.exposed = Math.max(0, state.exposed - dt);

  switch (state.phase) {
    case 'walkout': {
      turnToward(enemy, mech, dt);
      approach(enemy, mech, def.speed * dt, world);
      state.timer -= dt;
      if (state.timer <= 0) startBurst(state);
      break;
    }
    case 'burst': {
      turnToward(enemy, mech, dt);
      if (state.burstLeft > 0) {
        state.timer -= dt;
        if (state.timer > 0) break;
        if (lineClear(enemy, mech, world)) shots.push(shotAt(enemy, mech, rng));
        state.burstLeft -= 1;
        state.timer = state.burstLeft > 0 ? WARDEN_TUNE.burst.interval : WARDEN_TUNE.burstRest;
        break;
      }
      approach(enemy, mech, def.speed * dt, world);
      state.timer -= dt;
      if (state.timer > 0) break;
      if (state.mortarT > 0) startBurst(state);
      else startSpecial(state, phase2);
      break;
    }
    case 'charge': {
      // the crouch: it turns to the mech, then runs the way it faces
      if (state.timer > 0) {
        turnToward(enemy, mech, dt);
        state.timer -= dt;
        break;
      }
      const go = Math.min(WARDEN_TUNE.charge.speed * dt, state.chargeLeft);
      const beforeX = enemy.x;
      const beforeZ = enemy.z;
      enemy.x += -Math.sin(enemy.yaw) * go;
      enemy.z += -Math.cos(enemy.yaw) * go;
      settle(enemy, world);
      state.chargeLeft = Math.max(0, state.chargeLeft - go);
      const moved = Math.hypot(enemy.x - beforeX, enemy.z - beforeZ);
      // the run strikes the mech once if their circles meet; game.ts takes the armour and pushes the mech aside
      if (!state.rammed && Math.hypot(mech.x - enemy.x, mech.z - enemy.z) <= def.radius + MECH_TUNE.radius) {
        state.rammed = true;
        result.ram = { dx: -Math.sin(enemy.yaw), dz: -Math.cos(enemy.yaw) };
      }
      if (go > 0 && moved < go * 0.5) {
        // a wall or a cover stopped the run: the radiator plate is open
        state.phase = 'stagger';
        state.timer = WARDEN_TUNE.charge.stagger;
        state.exposed = WARDEN_TUNE.charge.stagger;
        state.chargeLeft = 0;
        break;
      }
      if (state.chargeLeft <= 0) {
        state.phase = 'burst';
        state.burstLeft = 0;
        state.timer = WARDEN_TUNE.burstRest;
      }
      break;
    }
    case 'stagger': {
      state.timer -= dt;
      if (state.timer > 0) break;
      state.exposed = 0;
      state.phase = 'burst';
      state.burstLeft = 0;
      state.timer = WARDEN_TUNE.burstRest;
      break;
    }
    case 'mortar': {
      turnToward(enemy, mech, dt);
      state.timer -= dt;
      if (state.timer > 0) break;
      while (state.burstLeft > 0) {
        shells.push(mortarShell(mech, rng));
        state.burstLeft -= 1;
      }
      state.phase = 'burst';
      state.burstLeft = 0;
      state.timer = WARDEN_TUNE.burstRest;
      break;
    }
    case 'dying':
      break;
  }
  return result;
}

// How much of a shot the warden's armour takes. While it is exposed the back plate is open and every shot takes double.
// Otherwise the shot's ground direction against the warden's front decides: from the front a quarter, from the flank the
// whole, from behind double.
export function wardenDamageMul(yaw: number, dx: number, dz: number, exposed: boolean): number {
  if (exposed) return WARDEN_TUNE.backMul;
  const length = Math.hypot(dx, dz);
  if (length < 1e-9) return WARDEN_TUNE.sideMul;
  const dot = (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / length;
  if (dot <= FRONT_DOT) return WARDEN_TUNE.frontMul;
  if (dot >= BACK_DOT) return WARDEN_TUNE.backMul;
  return WARDEN_TUNE.sideMul;
}
