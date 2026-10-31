import { t } from '@engine/core/i18n.ts';
import { T, W } from '@engine/world/tiles.ts';
import { COLOR } from '../../data/colors.ts';
import { PER } from '../../data/progress.ts';
import { WEAPONS } from '../../data/weapons.ts';
import type { Weapon } from '../../data/types.ts';
import { BIOMES } from '../../data/biomes.ts';
import { player, run } from '../../actors/player.ts';
import { magSize } from '../../actors/weapons.ts';
import { basicW } from '../../core/save.ts';
import { damagePlayer } from '../../actors/combat.ts';
import { setFireHeld } from '@engine/ui/input.ts';
import { normalizeWeapons } from '../../ui/input.ts';
import { updateHitDirs, weaponHud } from '../../ui/hud.ts';
import { level } from '../../world/level.ts';
import { setHazardClock } from '../../world/hazards.ts';
import { makePortal } from '../../world/portals.ts';
import { enemies, fanAt, removeEnemyMesh, ring, shootAtPoint } from '../../world/entities.ts';
import { startRun, startStage } from '../../flow/run.ts';
import { setState, show } from '../../flow/state.ts';
import { update } from '../../flow/update.ts';
// dev view: #view-ebullets stands in the start room while enemy bullets come: rings (as a boss fires), fans aimed
// at the player and a big slow one, from a point ahead (for screenshots of how the bullets look). ?sector= as above
export function showEBullets() {
  setTimeout(() => {
    startRun();
    const sector = BIOMES.findIndex(x => x.code === new URLSearchParams(location.search).get('sector'));
    if (sector >= 0) {
      run.route = [sector];
      run.bld = undefined;
      startStage();
    }
    show(null);
    setState('play');
    player.hp = 1e6;
    player.maxHp = 1e6;
    enemies.forEach(e => {
      e.dead = true;
      removeEnemyMesh(e);
    });
    const from = (d: number, side: number): [number, number] => [
      player.x - Math.sin(player.yaw) * d + Math.cos(player.yaw) * side,
      player.z - Math.cos(player.yaw) * d - Math.sin(player.yaw) * side,
    ];
    // a few volleys, the game run on by hand between them (a screenshot's clock hardly moves the game's own)
    for (let frame = 0; frame < 80; frame++) {
      if (frame % 36 === 0) {
        const [x, z] = from(11, 0),
          [fx, fz] = from(10, -5),
          [bx, bz] = from(10, 5);
        ring(x, 1.4, z, 16, 5, frame * 0.01, 1, COLOR.mag);
        fanAt(fx, 1.6, fz, 5, 0.5, 5, 1, COLOR.yellow);
        shootAtPoint(bx, 1.6, bz, player.x, 1.4, player.z, 4, 1, COLOR.orange, 2);
      }
      update(1 / 60);
    }
  }, 300);
}
// dev view: #view-fx-<weapon> stands in the start room with that weapon, the trigger held (its muzzle flash and its
// bullets in the air), a gate of each kind ahead (for screenshots of the effects). ?sector=KWLN picks the sector
export function showFx(hash: string) {
  setTimeout(() => {
    startRun();
    const sector = BIOMES.findIndex(x => x.code === new URLSearchParams(location.search).get('sector'));
    if (sector >= 0) {
      run.route = [sector];
      run.bld = undefined;
      startStage();
    }
    show(null);
    setState('play');
    player.hp = 1e6;
    player.maxHp = 1e6;
    enemies.forEach(e => {
      e.dead = true;
      removeEnemyMesh(e);
    });
    const wid = hash.split('-')[2] ?? 'pistol';
    if (WEAPONS[wid]) {
      const w0 = basicW(wid) as Weapon;
      w0.mag = magSize(w0);
      player.weapons[0] = w0;
      player.cur = 0;
      normalizeWeapons();
      weaponHud();
    }
    const at = (d: number, side: number): [number, number] => [
      player.x - Math.sin(player.yaw) * d + Math.cos(player.yaw) * side,
      player.z - Math.cos(player.yaw) * d - Math.sin(player.yaw) * side,
    ];
    makePortal(...at(8, -3), COLOR.amber, 'next', t('boss.forward'));
    makePortal(...at(8, 3), COLOR.cyan, 'extract', t('boss.extract'));
    setFireHeld(true);
  }, 300);
}
// dev view: #view-haz[-<weapon>] stands on a lit hazard tile (checks the gun is drawn over it); #view-perk opens the chip screen
export function showHazard(hash: string) {
  setTimeout(() => {
    startRun();
    run.route = [1];
    run.stage = PER + 1;
    startStage();
    show(null);
    setState('play');
    const k = level.hazardTiles.findIndex(Boolean);
    if (k < 0) return;
    player.x = ((k % W) + 0.5) * T;
    player.z = (((k / W) | 0) + 0.5) * T - 1.5;
    player.yaw = Math.PI;
    player.pitch = -0.5;
    player.hp = 1e6;
    player.maxHp = 1e6;
    const wid = hash.split('-')[2];
    if (WEAPONS[wid]) {
      const w0 = basicW(wid) as Weapon;
      w0.mag = magSize(w0);
      player.weapons[0] = w0;
      player.cur = 0;
      normalizeWeapons();
      weaponHud();
    } // #view-haz-smg etc.
    setHazardClock(0.5);
    for (let n = 0; n < 5; n++) update(1 / 60);
  }, 300);
}
// dev view: #view-hitdir shows the hit-direction arcs (hits from behind-right and from the left)
export function showHitDirs() {
  setTimeout(() => {
    startRun();
    show(null);
    setState('play');
    player.yaw = 0;
    player.hp = 1e6;
    player.maxHp = 1e6;
    player.inv = 0;
    damagePlayer(1, { x: player.x + 6, z: player.z + 6 });
    player.inv = 0;
    damagePlayer(1, { x: player.x - 8, z: player.z });
    updateHitDirs(0.05);
  }, 300);
}
