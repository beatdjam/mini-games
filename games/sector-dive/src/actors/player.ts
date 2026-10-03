import type { Player, RunState, Weapon, WeaponItem } from '../data/types.ts';
import { TUNE, BAG_MAX } from '../data/progress.ts';
import { save } from '../core/save.ts';
import { basicNow, startDmgMul, startMaxHp } from '../core/rules.ts';
import { fillMag, newWeapon } from './weapons.ts';

// ---- tuning numbers used only here ----
const PLAYER_R = 0.45; // body radius (m)
const SPD_UP_PER_LEVEL = 0.05; // move speed per speed upgrade level
const GAIN_UP_PER_LEVEL = 0.15; // bits per gain upgrade level
const REBOOT_GAIN_PER_LEVEL = 0.1; // bits per reboot gain level
const STAM_UP_PER_LEVEL = 20; // max stamina per endurance upgrade level
const REGEN_UP_PER_LEVEL = 0.12; // stamina regen per cooling upgrade level
// The player and the run exist only during a run; on the base screen they are null (setPlayer(null) / setRun(null)).
// They are typed without null because nearly all code using them runs during a run; code that can also run
// on the base screen checks them (if (player) ..., run && ...).
// replaced only through setPlayer / setRun
export let player = null as unknown as Player;
export let run = null as unknown as RunState;
export function setPlayer(p: Player | null) {
  player = p as Player;
}
export function setRun(r: RunState | null) {
  run = r as RunState;
}
export function newPlayer(loadout: (WeaponItem | null)[]): Player {
  const u = save.up,
    pu = save.pres.up,
    hp = startMaxHp(u.hp);
  // the dive starts with full magazines (options count; there are no chips yet)
  const ws = loadout.map(basicNow).map(w => (w ? fillMag(newWeapon(w.id, w.r, w.basic, w.plus, w.opts), 1) : null));
  return {
    x: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    hp,
    maxHp: hp,
    r: PLAYER_R,
    baseSpeed: TUNE.moveSpeed,
    spdMul: 1 + u.spd * SPD_UP_PER_LEVEL,
    dmgMul: startDmgMul(u.dmg),
    fireRate: 1,
    gainMul: (1 + u.gain * GAIN_UP_PER_LEVEL) * (1 + pu.gain * REBOOT_GAIN_PER_LEVEL),
    leech: 0,
    pierce: 0,
    extra: 0,
    crit: 0,
    chain: 0,
    magnet: 1,
    reloadMul: 1,
    magMul: 1,
    st: TUNE.stamina + (u.stam || 0) * STAM_UP_PER_LEVEL,
    stMax: TUNE.stamina + (u.stam || 0) * STAM_UP_PER_LEVEL,
    stRegen: TUNE.staminaRegen * (1 + u.dash * REGEN_UP_PER_LEVEL),
    stDelay: 0,
    inv: 0,
    dashT: 0,
    ddx: 0,
    ddz: 0,
    weapons: ws,
    cur: 0,
    bag: Array(BAG_MAX).fill(null),
    kits: TUNE.kitStart + u.kit,
    reloadT: 0,
    reloadMax: 1,
    fireCd: 0,
    tile: -1,
    bob: 0,
    fy: 0,
    vy: 0,
  };
}

// the weapon in hand; during a run there always is one (normalizeWeapons keeps slot 0 filled)
export const currentWeapon = (): Weapon => player.weapons[player.cur]!;
