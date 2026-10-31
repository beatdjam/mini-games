import { BIOMES } from '../../data/biomes.ts';
import { player, run } from '../../actors/player.ts';
import { enemies, removeEnemyMesh, spawnEnemy } from '../../world/entities.ts';
import { startRun, startStage } from '../../flow/run.ts';
import { setState, show } from '../../flow/state.ts';
import { update } from '../../flow/update.ts';
// dev view: #view-enemies-<type>,<type>... stands in front of a row of enemies of those types, asleep (for
// screenshots of how they look), e.g. #view-enemies-crawler,drone,turret. ?sector=KWLN picks the sector
export function showEnemyRow(hash: string) {
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
    const types = hash.slice('#view-enemies-'.length).split(',');
    types.forEach((type, n) => {
      const side = (n - (types.length - 1) / 2) * 2.6,
        d = 6.5;
      spawnEnemy(
        type,
        player.x - Math.sin(player.yaw) * d + Math.cos(player.yaw) * side,
        player.z - Math.cos(player.yaw) * d - Math.sin(player.yaw) * side,
        -1,
        1,
      ).face = player.yaw; // (asleep, they keep the way the model was made: turned to face the player)
    });
    enemies.forEach(e => {
      e.mesh.rotation.y = player.yaw;
    });
  }, 300);
}
// dev view: #view-medic stands in front of a repair drone mending a worn brute (held where it is) with its beam.
// ?sector= as above
export function showMedic() {
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
    const ahead = (d: number, side: number): [number, number] => [
        player.x - Math.sin(player.yaw) * d + Math.cos(player.yaw) * side,
        player.z - Math.cos(player.yaw) * d - Math.sin(player.yaw) * side,
      ],
      b = spawnEnemy('brute', ...ahead(9, -1.5), -1, 1),
      m = spawnEnemy('medic', ...ahead(11, 2), -1, 1);
    b.active = true;
    b.stun = 1e6;
    b.hp = b.maxHp * 0.3;
    m.active = true;
    for (let k = 0; k < 40; k++) update(1 / 60);
  }, 300);
}
// dev view: #view-mortar stands in front of a mortar that has just fired (the round in the air, the ring on the floor
// where the player stood), the player stepped back from it. ?sector= as above
export function showMortar() {
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
    const m = spawnEnemy('mortar', player.x - Math.sin(player.yaw) * 9, player.z - Math.cos(player.yaw) * 9, -1, 1);
    m.active = true;
    m.cd = 0;
    for (let k = 0; k < 20 && !m.shots; k++) update(1 / 60);
    player.x += Math.sin(player.yaw) * 5;
    player.z += Math.cos(player.yaw) * 5;
    for (let k = 0; k < 40; k++) update(1 / 60);
  }, 300);
}
// dev view: #view-trooper stands in front of three troopers (the humanoid soldier): one walking, two aiming
export function showTroopers() {
  setTimeout(() => {
    startRun();
    show(null);
    setState('play');
    player.hp = 1e6;
    player.maxHp = 1e6;
    enemies.forEach(e => {
      e.dead = true;
      removeEnemyMesh(e);
    });
    const f = (d: number, side: number): [number, number] => [
      player.x - Math.sin(player.yaw) * d + Math.cos(player.yaw) * side,
      player.z - Math.cos(player.yaw) * d - Math.sin(player.yaw) * side,
    ];
    [
      [5, -1.6],
      [7, 1.8],
      [9.5, 0],
    ].forEach(([d, sd]) => {
      const [x, z] = f(d!, sd!);
      const e = spawnEnemy('trooper', x, z, -1, 1);
      e.active = true;
    });
    for (let k = 0; k < 40; k++) update(1 / 60);
  }, 300);
}
