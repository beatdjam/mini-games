import type { RunEnd, Weapon } from '../data/types.ts';
import { el, shuffle } from '@engine/core/util.ts';
import { LANG, lang, t } from '@engine/core/i18n.ts';
import { T, W, floorY } from '@engine/world/tiles.ts';
import { WEAPONS } from '../data/weapons.ts';
import { BOSS_META } from '../data/bosses.ts';
import { BIOMES } from '../data/biomes.ts';
import { PER } from '../data/progress.ts';
import { PERKS } from '../data/perks.ts';
import { basicW, save } from '../core/save.ts';
import { devSeed, level } from '../world/level.ts';
import { building } from '../world/building.ts';
import { devPlainLooks } from '../world/looks.ts';
import { useSparkLooks } from '../world/sparkLooks.ts';
import { setHazardClock } from '../world/hazards.ts';
import { devPlainGuns } from '../actors/viewmodel.ts';
import { makePortal } from '../world/portals.ts';
import { COLOR } from '../data/colors.ts';
import { setFireHeld } from '@engine/ui/input.ts';
import { addPickup, enemies, fanAt, removeEnemyMesh, ring, shootAtPoint, spawnEnemy } from '../world/entities.ts';
import { player, run } from '../actors/player.ts';
import { damagePlayer } from '../actors/combat.ts';
import { magSize, newWeapon } from '../actors/weapons.ts';
import { normalizeWeapons } from '../ui/input.ts';
import { toggleMap3D, updateHitDirs, weaponHud } from '../ui/hud.ts';
import { changeLang } from '../ui/settings.ts';
import { endRun, startPractice, startRun, startStage } from '../flow/run.ts';
import { setState, show } from '../flow/state.ts';
import { suspendRun } from '../flow/suspend.ts';
import { openPerk } from '../screens/perk.ts';
import { showTab } from '../screens/base.ts';
import { drawShareCard, shareData, shareText } from '../ui/share.ts';
import { update } from '../flow/update.ts';
// ================= dev hooks =================
// URL hash hooks for checking the game without playing it by hand. See SPEC.md, chapter 10.

// dev: ?plain draws every sector the plain way (no sector's own look), to compare with what was there before
if (new URLSearchParams(location.search).has('plain')) {
  devPlainLooks(true);
  devPlainGuns();
  useSparkLooks();
}
// dev: ?hazon keeps the hazard floors live (to look at them lit)
if (new URLSearchParams(location.search).has('hazon')) setInterval(() => setHazardClock(0.5), 50);
// dev seed: ?seed=<n> builds every level from that seed (the same level each time)
const seedParam = new URLSearchParams(location.search).get('seed');
if (seedParam !== null && /^\d+$/.test(seedParam)) devSeed(Number(seedParam) >>> 0);

// dev view: #bld-<place> starts a run and stands at a place of the building, looking at it (for screenshots):
// foot (below the first stairwell, looking up it), mid (half way up), top (above it, looking down), lift (next to
// the first lift on the top floor), liftlow (the same lift from the floor below), boss (in front of the boss door),
// lockdown (in the lockdown room, which shuts), hall (inside the boss room), map3d (the 3D map of the whole building)
if (location.hash.startsWith('#bld-'))
  setTimeout(() => {
    startRun();
    // ?sector=KWLN etc.: the building in that sector (otherwise the run's own first sector)
    const sector = BIOMES.findIndex(x => x.code === new URLSearchParams(location.search).get('sector'));
    if (sector >= 0) {
      run.route = [sector];
      run.bld = undefined;
      startStage();
    }
    const what = location.hash.slice(5),
      b = building!,
      stairs = b.links.find(l => l.kind === 'stairs'), // a building may have none: the stairs hooks do nothing then
      lift = b.links.find(l => l.kind === 'elevator'),
      step = stairs ? stairs.strip[1]! - stairs.strip[0]! : 1, // one tile up the stairs
      dirOf = (d: number): [number, number] => [Math.abs(d) === 1 ? d : 0, Math.abs(d) === 1 ? 0 : Math.sign(d)],
      // the floor tile next to tile k (for standing beside a lift or a door), and the step from it to k
      beside = (grid: Uint8Array, k: number): [number, number] => {
        const d = [1, -1, W, -W].find(o => grid[k + o] === 1)!;
        return [k + d, -d];
      },
      stand = (floor: number, tile: number, look: number) => {
        run.bld!.floor = floor;
        run.bld!.at = floor ? b.links.findIndex(l => l.upper === floor || l.lower === floor) : -1;
        startStage();
        enemies.slice().forEach(e => {
          e.dead = true;
          removeEnemyMesh(e);
        });
        player.x = ((tile % W) + 0.5) * T;
        player.z = (Math.floor(tile / W) + 0.5) * T;
        player.fy = floorY(player.x, player.z);
        const [dx, dz] = dirOf(look);
        player.yaw = Math.atan2(-dx, -dz);
        player.pitch = what === 'top' ? -0.35 : what === 'foot' ? 0.3 : 0;
      };
    if (what === 'foot' && stairs) stand(stairs.lower, stairs.strip[0]! - step, step);
    else if (what === 'mid' && stairs) stand(stairs.lower, stairs.strip[2]!, step);
    else if (what === 'top' && stairs) stand(stairs.upper, stairs.strip[stairs.strip.length - 1]! + step, -step);
    else if (what === 'lift' && lift) stand(lift.upper, ...beside(b.plans[lift.upper]!.gen.maps.grid, lift.a));
    else if (what === 'liftlow' && lift) stand(lift.lower, ...beside(b.plans[lift.lower]!.gen.maps.grid, lift.a));
    else if (what === 'map3d' || what === 'map3d-start') {
      // the big map on its 3D page: the whole building seen, or (map3d-start) only what a run has seen at its start
      if (what === 'map3d') b.plans.forEach(p => p.seen.fill(1));
      setState('play');
      toggleMap3D();
    } else if (what === 'lockdown' && b.lockdown) {
      const r = b.plans[b.lockdown.floor]!.gen.rooms[b.lockdown.room]!,
        mid = Math.floor(r.y + r.h / 2) * W + Math.floor(r.x + r.w / 2);
      stand(b.lockdown.floor, mid, 1);
      player.hp = 1e6;
    } else if (what === 'hall') {
      // inside the boss room, in a corner, looking up across it (its high ceiling)
      const last = b.plans.length - 1,
        r = b.plans[last]!.gen.rooms[b.plans[last]!.hall!.room]!;
      stand(last, (r.y + 1) * W + r.x + 1, W + 1);
      player.pitch = 0.45;
      run.bld!.supplied = true; // no supply screen over the view
      player.hp = 1e6;
    } else if (what === 'boss') {
      const hall = b.plans[b.plans.length - 1]!.hall!,
        grid = b.plans[b.plans.length - 1]!.gen.maps.grid,
        roomOf = b.plans[b.plans.length - 1]!.gen.maps.roomOf,
        out = [1, -1, W, -W].find(o => grid[hall.door + o] === 1 && roomOf[hall.door + o] !== hall.room)!;
      stand(b.plans.length - 1, hall.door + out * 2, -out);
    }
    show(null);
    setState('play');
    for (let k = 0; k < 20; k++) update(1 / 60);
  }, 300);
// dev view: #view-KWLN etc. drops straight into that sector's first floor (for screenshots)
if (location.hash.startsWith('#view-')) {
  setTimeout(() => {
    // #view-KWLN: the start room. #view-KWLN-b / -c / -d: other rooms of the floor, seen from a corner (for comparing looks)
    const [code, pose] = location.hash.slice(6).split('-');
    const bi = BIOMES.findIndex(b => b.code === code);
    if (bi < 0) return;
    startRun();
    run.route = [bi];
    run.stage = bi * PER + 1;
    startStage();
    if (pose) {
      const others = level.rooms.map((_, i) => i).filter(i => i !== level.startIdx && i !== level.hall?.room),
        r = level.rooms[others['bcd'.indexOf(pose) % others.length]!]!;
      enemies.slice().forEach(e => {
        e.dead = true;
        removeEnemyMesh(e);
      });
      player.x = (r.x + 0.6) * T;
      player.z = (r.y + 0.6) * T;
      player.fy = floorY(player.x, player.z);
      player.yaw = Math.atan2(-(r.w - 1.2), -(r.h - 1.2)); // toward the far corner
      player.pitch = 0.05;
    }
    show(null);
    setState('play');
    for (let k = 0; k < 20; k++) update(1 / 60);
  }, 300);
}
// dev view: #view-enemies-<type>,<type>... stands in front of a row of enemies of those types, asleep (for
// screenshots of how they look), e.g. #view-enemies-crawler,drone,turret. ?sector=KWLN picks the sector
if (location.hash.startsWith('#view-enemies-'))
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
    const types = location.hash.slice('#view-enemies-'.length).split(',');
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
// dev view: #view-trooper stands in front of three troopers (the humanoid soldier): one walking, two aiming
if (location.hash === '#view-trooper')
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
// dev view: #view-wipe opens the data wipe dialog on the base screen (for screenshots)
if (location.hash === '#view-wipe') setTimeout(() => el('#btnWipe').click(), 300);
// dev view: #view-keys opens the key settings dialog on the base screen; #view-keys-wait also clicks the reload key
if (location.hash === '#view-keys' || location.hash === '#view-keys-wait')
  setTimeout(() => {
    showTab('settings');
    document.querySelector<HTMLElement>('[data-settings="base"] [data-action="keys"]')?.click();
    if (location.hash.endsWith('-wait')) document.querySelector<HTMLElement>('[data-key-action="reload"]')?.click();
  }, 300);
const LOOK_FROM = 7.5; // how far from a boss #boss-<kind>-look stands (m)
const LOOK_TURN = 0.65; // how far a boss is turned for #boss-<kind>-look (rad)
// dev view: #boss-phantom etc. starts boss practice against that boss
// optional depth: #boss-phantom-3 = DEPTH 3 strength; #boss-phantom-look = up close
if (location.hash.startsWith('#boss-'))
  setTimeout(() => {
    const [k, d] = location.hash.slice(6).split('-');
    if (!k || !BOSS_META[k]) return;
    // #boss-phantom-look: the boss up close, once it has finished coming in (for screenshots of how it looks)
    if (d === 'look') {
      startPractice(k, 0);
      // (the boss comes a moment after the arena: wait for it, then run its entrance on by hand)
      const wait = setInterval(() => {
        const b = enemies.find(e => e.boss);
        if (!b) return;
        clearInterval(wait);
        player.hp = 1e6;
        player.maxHp = 1e6;
        for (let n = 0; n < 150; n++) update(1 / 60);
        // (a boss of several bodies, Trinity: its first body. They keep turning, so no turn is added)
        const at = (b.boss && b.parts?.[0]?.p) || b.mesh.position;
        player.x = at.x;
        player.z = at.z + LOOK_FROM;
        player.yaw = 0;
        player.pitch = Math.atan2(at.y - 1.6, LOOK_FROM) * 0.6;
        for (let n = 0; n < 2; n++) update(1 / 60);
        // it stands still from here, turned a little to one side so its flank shows too
        if (b.boss) b.behave = () => {};
        b.mesh.rotation.y += LOOK_TURN;
        // (its name, up big across the middle of the screen, would cover it)
        const name = document.querySelector<HTMLElement>('#banner');
        if (name) name.style.visibility = 'hidden';
      }, 200);
      return;
    }
    startPractice(k, d ? Math.max(0, +d - 1) : 0);
  }, 300);
// dev view: #view-items stands in front of a row of the things that lie on the floor: the five weapons (in the three
// rarities), a kit, a chip and some bits (for screenshots of how they look). ?sector=KWLN picks the sector
if (location.hash === '#view-items')
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
// dev view: #view-pick stands next to a dropped weapon (for screenshots of the pick-up prompt)
if (location.hash.startsWith('#view-pick'))
  setTimeout(() => {
    startRun();
    show(null);
    setState('play');
    addPickup('weapon', player.x + 0.3, player.z, { w: newWeapon('shotgun', 1, false, 2, ['rate']) });
    for (let k = 0; k < 10; k++) update(1 / 60);
  }, 300);
// dev view: #view-ebullets stands in the start room while enemy bullets come: rings (as a boss fires), fans aimed
// at the player and a big slow one, from a point ahead (for screenshots of how the bullets look). ?sector= as above
if (location.hash === '#view-ebullets')
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
// dev view: #view-fx-<weapon> stands in the start room with that weapon, the trigger held (its muzzle flash and its
// bullets in the air), a gate of each kind ahead (for screenshots of the effects). ?sector=KWLN picks the sector
if (location.hash.startsWith('#view-fx'))
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
    const wid = location.hash.split('-')[2] ?? 'pistol';
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
// dev view: #view-haz[-<weapon>] stands on a lit hazard tile (checks the gun is drawn over it); #view-perk opens the chip screen
if (location.hash.startsWith('#view-haz'))
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
    const wid = location.hash.split('-')[2];
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
// dev view: #view-share[-dead] shows the result card image for a sample run (#view-share-res: the result screen, #view-share-res-panel: with the PC share panel open,
// #view-share-res-many: a deep run's hundred chips)
if (location.hash.startsWith('#view-share'))
  setTimeout(() => {
    startRun();
    run.stage = 2 * PER + PER - 1;
    run.kills = 142;
    run.bosses = ['watcher', 'trinity'];
    run.perks = ['overload', 'overload', 'rapid+', 'crit', 'reload', 'light'];
    // -many: a deep run's hundred chips (the mix from a player's D14 run), to see the result screen fold them up
    if (location.hash.includes('many'))
      run.perks = shuffle(
        Object.entries({
          split: 25,
          rapid: 18,
          overload: 13,
          'overload+': 3,
          armor: 10,
          'armor+': 3,
          mag: 4,
          leech: 4,
          'leech+': 3,
          sprint: 4,
          'sprint+': 1,
          reload: 3,
          'crit+': 2,
          chain: 1,
          pierce: 1,
          'light+': 1,
          repair: 1,
          'rapid+': 1,
        }).flatMap(([id, n]) => Array(n).fill(id)),
      );
    if (location.hash.includes('reboot')) save.pres.count = 3;
    player.weapons[0] = { id: 'rail', r: 2, plus: 7, opts: [] } as unknown as Weapon;
    const kind: RunEnd = location.hash.includes('dead') ? 'dead' : 'extract';
    endRun(kind);
    if (location.hash.includes('res')) {
      if (location.hash.includes('panel')) setTimeout(() => el('#btnShare').click(), 900);
      return;
    } // #view-share-res: the result screen itself
    drawShareCard(shareData!).then(b => {
      const im = new Image();
      im.src = URL.createObjectURL(b!);
      im.style.cssText = 'position:fixed;inset:0;width:100%;z-index:99;background:#000';
      document.body.appendChild(im);
      console.log('VIEW share', shareText(shareData!));
    });
  }, 300);
if (location.hash.startsWith('#view-perk'))
  setTimeout(() => {
    startRun();
    PERKS[0].apply(player, 0.2);
    if (location.hash.includes('perk4')) save.pres.up.choice = 1;
    openPerk(t('perk.title'));
  }, 300); // #view-perk4: four options
// dev view: #tab-<sortie|up|practice|settings>[-touch] opens that base tab
if (location.hash.startsWith('#tab-')) setTimeout(() => showTab(location.hash.slice(5).replace(/-touch$/, '')), 0);
// dev view: #view-susp[-touch] leaves a suspended run and returns to the base
if (location.hash.startsWith('#view-susp'))
  setTimeout(() => {
    startRun();
    suspendRun();
  }, 300);
// dev: ?lang=<code> opens the page in that language (saved like the settings button does)
setTimeout(() => {
  const q = new URLSearchParams(location.search).get('lang');
  if (q && LANG[q] && q !== lang) changeLang(q);
}, 0);
// dev view: #view-hitdir shows the hit-direction arcs (hits from behind-right and from the left)
if (location.hash === '#view-hitdir')
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
