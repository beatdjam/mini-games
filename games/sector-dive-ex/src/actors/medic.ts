import type { Enemy, Medic, RegularEnemy } from '../data/types.ts';
import { distXZ } from '@engine/core/util.ts';
import { burst } from '@engine/render/fx.ts';
import { hasLOS } from '@engine/world/tiles.ts';
import { steerChase } from '@engine/world/steer.ts';
import { COLOR } from '../data/colors.ts';
import { enemies, isShielded } from '../world/entities.ts';
import { setLaser } from '../world/models.ts';
import { MEDIC_NOZZLE } from '../world/models/enemyLooks.ts';
// ================= the repair drone =================
// The repair drone (data/enemies.ts 'medic') never attacks. It stays away from the player and mends the most worn enemy
// near it with a beam: hit points, and the plate of a shield that still stands (a broken one stays broken). Bosses and
// other repair drones aren't mended. Shoot it first, or the room takes longer.

// ---- tuning numbers used only here ----
const HEAL_RANGE = 12; // it mends an enemy within this, with no wall between (m)
const HEAL_RATE = 0.2; // share of the patient's max hit points (and its shield's) mended per second
const HEAL_NEAR = 4; // it closes in on its patient to this (m)
const FLEE_DIST = 6; // the player closer than this and in sight sends it away (m)
const PICK_EVERY = 0.5; // seconds between choosing a patient
const SPARK_EVERY = 0.08; // seconds between the sparks on the patient

// how worn an enemy is: 0 = like new, up to 2 (hit points and shield both gone)
function wear(o: RegularEnemy) {
  const hp = 1 - o.hp / o.maxHp;
  return isShielded(o) && o.shieldHp > 0 ? hp + 1 - o.shieldHp / shieldMax(o) : hp;
}
// a shield's full plate: its type's shieldHp at the same depth as its hit points
const shieldMax = (o: RegularEnemy) => o.def.shieldHp! * (o.maxHp / o.def.hp); // called only for a shield

// the most worn enemy awake on its floor within reach, or null
function pickPatient(e: Medic): RegularEnemy | null {
  let best: RegularEnemy | null = null,
    most = 0;
  for (const o of enemies) {
    if (o.boss || o === e || o.dead || o.def.medic || !o.active || o.floor !== e.floor) continue;
    const w = wear(o);
    if (w <= most || distXZ(e, o) > HEAL_RANGE || !hasLOS(e.x, e.z, o.x, o.z)) continue;
    best = o;
    most = w;
  }
  return best;
}

// one repair drone for one frame, in place of the usual chase (actors/enemies.ts). dx, dz, dist: toward the player
export function updateMedic(e: Medic, dt: number, dx: number, dz: number, dist: number, los: boolean, still: boolean) {
  if ((e.pickT -= dt) <= 0) {
    e.pickT = PICK_EVERY;
    e.patient = pickPatient(e);
  }
  const p = e.patient;
  if (p && (p.dead || wear(p) <= 0 || distXZ(e, p) > HEAL_RANGE)) e.patient = null;
  if (!still) {
    const speed = e.def.speed;
    if (los && dist < FLEE_DIST)
      steerChase<Enemy>(e, dt, -dx, -dz, dist, true, speed, undefined, enemies, o => !!o.boss);
    else if (e.patient) {
      const px = e.patient.x - e.x,
        pz = e.patient.z - e.z;
      steerChase<Enemy>(e, dt, px, pz, Math.hypot(px, pz) || 0.001, true, speed, HEAL_NEAR, enemies, o => !!o.boss);
    } else steerChase<Enemy>(e, dt, dx, dz, dist, los, speed, e.def.keep, enemies, o => !!o.boss);
  }
  mend(e, dt);
}

// the beam: mends the patient a little and draws the line to it
function mend(e: Medic, dt: number) {
  const p = e.patient;
  if (!p) {
    e.laser.visible = false;
    return;
  }
  p.hp = Math.min(p.maxHp, p.hp + p.maxHp * HEAL_RATE * dt);
  if (isShielded(p) && p.shieldHp > 0) p.shieldHp = Math.min(shieldMax(p), p.shieldHp + shieldMax(p) * HEAL_RATE * dt);
  // from the nozzle (the drone turns to face its patient: poseEnemy in actors/enemies.ts) to the patient's middle
  const from = e.mesh.position,
    to = p.mesh.position,
    sx = Math.sin(e.face) * MEDIC_NOZZLE.fwd,
    sz = Math.cos(e.face) * MEDIC_NOZZLE.fwd;
  setLaser(
    e.laser,
    [from.x + sx, from.y + MEDIC_NOZZLE.y, from.z + sz],
    [to.x, to.y, to.z],
    0.55 + 0.3 * Math.sin(e.t * 24),
  );
  if (e.t % SPARK_EVERY < dt) burst(to.x, to.y, to.z, COLOR.repair, 4, 3, 0.4, -1);
}
