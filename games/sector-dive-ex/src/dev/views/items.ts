import { BIOMES } from '../../data/biomes.ts';
import { player, run } from '../../actors/player.ts';
import { newWeapon } from '../../actors/weapons.ts';
import { addPickup, enemies, removeEnemyMesh } from '../../world/entities.ts';
import { startRun, startStage } from '../../flow/run.ts';
import { setState, show } from '../../flow/state.ts';
import { update } from '../../flow/update.ts';
// dev view: #view-items stands in front of a row of the things that lie on the floor: the five weapons (in the three
// rarities), a kit, a chip and some bits (for screenshots of how they look). ?sector=KWLN picks the sector
export function showItems() {
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
    enemies.forEach(e => {
      e.dead = true;
      removeEnemyMesh(e);
    });
    const at = (d: number, side: number): [number, number] => [
      player.x - Math.sin(player.yaw) * d + Math.cos(player.yaw) * side,
      player.z - Math.cos(player.yaw) * d - Math.sin(player.yaw) * side,
    ];
    (['pistol', 'smg', 'shotgun', 'rail', 'launcher'] as const).forEach((id, n) =>
      addPickup('weapon', ...at(7.5, (n - 2) * 2.4), { w: newWeapon(id, n % 3) }),
    );
    addPickup('kit', ...at(4.5, -2.2));
    addPickup('chip', ...at(4.5, 0));
    for (let k = 0; k < 4; k++) addPickup('bit', ...at(4.2, 1.8 + k * 0.5), { value: 1 });
  }, 300);
}
// dev view: #view-pick stands next to a dropped weapon (for screenshots of the pick-up prompt)
export function showPick() {
  setTimeout(() => {
    startRun();
    show(null);
    setState('play');
    addPickup('weapon', player.x + 0.3, player.z, { w: newWeapon('shotgun', 1, false, 2, ['rate']) });
    for (let k = 0; k < 10; k++) update(1 / 60);
  }, 300);
}
