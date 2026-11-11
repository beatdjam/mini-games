// The mech's movement on flat ground: walking, jumping, boosting and landing, as pure functions over a state. No
// three and no DOM, so a node test can run it. Inputs arrive already turned into the mech's own left/right and
// forward; touch (SB-030) gives the same shape as the keyboard. Given the map's rects, the mech cannot enter them.
// A candidate to move into the engine (D-23): it reads no game table, so every value comes in as an argument.
import type { MoveTune } from '../data/tuneTypes.ts';
import { pushOutCircle, type GroundRect } from './collide.ts';

export interface MechInput {
  moveX: number; // the mech's right/left input (-1 to 1, right is +)
  moveZ: number; // the mech's forward/back input (-1 to 1, forward is +)
  turn: number; // the yaw this frame adds (rad); the view already multiplied the rate by the frame time
  jump: boolean; // true only on the frame the jump key goes down, so holding it does not jump again
  jumpHeld: boolean; // true while the jump key is held
  boost: boolean; // true while the boost key is held
  fire: boolean; // true while the fire key is held
}

export interface MechState {
  x: number; // the feet (m)
  y: number; // the feet (m), 0 on the ground
  z: number; // the feet (m)
  vx: number; // (m/s)
  vy: number; // (m/s)
  vz: number; // (m/s)
  yaw: number; // 0 faces -z and grows turning left (rad)
  grounded: boolean;
  gauge: number; // the boost gauge, 0 to 1
  landT: number; // the landing stop left (s); the mech cannot walk while it is above 0
  boosting: boolean; // whether the boost was on in the last step
  hovering: boolean; // whether the hover was on in the last step
  fireT: number; // the wait before the next shot (s)
}

export type MechEventKind = 'jump' | 'land' | 'boostStart' | 'boostEnd' | 'hoverStart' | 'hoverEnd' | 'fire';

export interface MechEvent {
  kind: MechEventKind;
  speed: number; // the landing's falling speed (m/s); 0 for the other events
}

// The ground the mech may not enter: the rects (see collide.ts) and the mech's hit radius (m).
interface MechWorld {
  rects: readonly GroundRect[];
  radius: number;
}

export function newMech(): MechState {
  return {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    grounded: true,
    gauge: 1,
    landT: 0,
    boosting: false,
    hovering: false,
    fireT: 0,
  };
}

// Moves the speed (vx, vz) toward (tx, tz) by at most `max` (m/s). A zero or negative max leaves it alone.
function approach(vx: number, vz: number, tx: number, tz: number, max: number): [number, number] {
  if (max <= 0) return [vx, vz];
  const dx = tx - vx;
  const dz = tz - vz;
  const dist = Math.hypot(dx, dz);
  if (dist <= max || dist < 1e-9) return [tx, tz];
  return [vx + (dx / dist) * max, vz + (dz / dist) * max];
}

// The world direction of the input, clamped to length 1 (forward is -z at yaw 0, right is +x).
function inputDirection(input: MechInput, yaw: number): { x: number; z: number; length: number } {
  let mx = input.moveX;
  let mz = input.moveZ;
  const length = Math.hypot(mx, mz);
  if (length > 1) {
    mx /= length;
    mz /= length;
  }
  return {
    x: -Math.sin(yaw) * mz + Math.cos(yaw) * mx,
    z: -Math.cos(yaw) * mz - Math.sin(yaw) * mx,
    length: Math.min(1, length),
  };
}

// One step no longer than tune.maxStep; `first` is the frame's first step (only that one may jump).
function stepOnce(
  m: MechState,
  input: MechInput,
  h: number,
  tune: MoveTune,
  fireRate: number,
  first: boolean,
  events: MechEvent[],
  world?: MechWorld,
) {
  m.fireT = Math.max(0, m.fireT - h);
  if (m.landT > 0) m.landT = Math.max(0, m.landT - h);

  // The boost takes the input's direction, or straight forward with no input.
  const dir = inputDirection(input, m.yaw);
  const forwardX = -Math.sin(m.yaw);
  const forwardZ = -Math.cos(m.yaw);
  let boosting = m.boosting;
  if (!boosting && input.boost && m.gauge > 0) {
    boosting = true;
    events.push({ kind: 'boostStart', speed: 0 });
  }
  if (boosting && (!input.boost || m.gauge <= 0)) {
    boosting = false;
    events.push({ kind: 'boostEnd', speed: 0 });
  }
  m.boosting = boosting;

  if (boosting) {
    const bx = dir.length > 1e-9 ? dir.x / dir.length : forwardX;
    const bz = dir.length > 1e-9 ? dir.z / dir.length : forwardZ;
    const [nvx, nvz] = approach(m.vx, m.vz, bx * tune.boost, bz * tune.boost, tune.boostAccel * h);
    m.vx = nvx;
    m.vz = nvz;
    m.gauge = Math.max(0, m.gauge - tune.boostDrain * h);
    if (m.gauge <= 0) {
      m.boosting = false;
      events.push({ kind: 'boostEnd', speed: 0 });
    }
  } else if (m.landT > 0) {
    // A landing holds the mech in place; no input is taken until the stop ends.
    const [nvx, nvz] = approach(m.vx, m.vz, 0, 0, tune.decel * h);
    m.vx = nvx;
    m.vz = nvz;
  } else if (dir.length > 1e-9) {
    const accel = (m.grounded ? tune.accel : tune.accel * tune.airControl) * h;
    const [nvx, nvz] = approach(m.vx, m.vz, dir.x * tune.walk, dir.z * tune.walk, accel);
    m.vx = nvx;
    m.vz = nvz;
  } else if (m.grounded) {
    const [nvx, nvz] = approach(m.vx, m.vz, 0, 0, tune.decel * h);
    m.vx = nvx;
    m.vz = nvz;
  }

  if (first && input.jump && m.grounded) {
    m.vy = tune.jump;
    m.grounded = false;
    m.landT = 0;
    events.push({ kind: 'jump', speed: 0 });
  }

  if (!m.grounded) {
    if (m.boosting && tune.boostLift > 0) m.vy += tune.boostLift * h;
    m.vy -= tune.gravity * h;
    // A held jump slows the fall while the gauge lasts; it does nothing while rising.
    const hovering = input.jumpHeld && m.gauge > 0 && m.vy < -tune.hoverFall;
    if (hovering) {
      m.vy = -tune.hoverFall;
      m.gauge = Math.max(0, m.gauge - tune.hoverDrain * h);
    }
    if (hovering && !m.hovering) events.push({ kind: 'hoverStart', speed: 0 });
    else if (!hovering && m.hovering) events.push({ kind: 'hoverEnd', speed: 0 });
    m.hovering = hovering;
    m.y += m.vy * h;
    if (m.y <= 0) {
      const speed = Math.max(0, -m.vy);
      m.y = 0;
      m.vy = 0;
      m.grounded = true;
      m.landT = tune.landStop;
      events.push({ kind: 'land', speed });
      if (m.hovering) {
        m.hovering = false;
        events.push({ kind: 'hoverEnd', speed: 0 });
      }
    }
  } else {
    m.vy = 0;
    m.hovering = false;
  }

  // The gauge comes back with the boost key up, so holding it empty does not start and stop the boost again.
  if (!input.boost && m.grounded) m.gauge = Math.min(1, m.gauge + tune.boostRegen * h);

  if (input.fire && m.fireT <= 0 && fireRate > 0) {
    events.push({ kind: 'fire', speed: 0 });
    m.fireT = 1 / fireRate;
  }

  m.x += m.vx * h;
  m.z += m.vz * h;

  // A wall stops the way in and leaves the way along it, so a glancing hit slides.
  if (world) {
    const pushed = pushOutCircle(m.x, m.z, world.radius, world.rects);
    m.x = pushed.x;
    m.z = pushed.z;
    for (const hit of pushed.hits) {
      const dot = m.vx * hit.nx + m.vz * hit.nz;
      if (dot < 0) {
        m.vx -= dot * hit.nx;
        m.vz -= dot * hit.nz;
      }
    }
  }
}

// Advances the mech by `dt`, split into steps of tune.maxStep at most so a fast boost cannot skip over a step. The
// events of the whole frame come back in the order they happened (a jump only on the frame's first step).
export function stepMech(
  m: MechState,
  input: MechInput,
  dt: number,
  tune: MoveTune,
  fireRate: number,
  world?: MechWorld,
): MechEvent[] {
  const events: MechEvent[] = [];
  if (!(dt > 0)) return events;
  m.yaw += input.turn;
  let remaining = dt;
  let first = true;
  while (remaining > 1e-9) {
    const h = Math.min(tune.maxStep, remaining);
    remaining -= h;
    stepOnce(m, input, h, tune, fireRate, first, events, world);
    first = false;
  }
  return events;
}
